"""USTAAD API - FastAPI over the OpenCV 5 pipeline.

Three routes, all importing the pipeline package (no duplicated vision logic):
  GET  /health   -> cv2 version + readiness
  POST /verify   -> decide on one frame vs a reference step (inline or by id)
  POST /process  -> run learn+verify on uploaded videos, write outputs (S3 if set)

Run locally:  uvicorn api.main:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import base64
import json
import os
import subprocess
import sys
import tempfile
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# make the pipeline package importable
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from ustaad import assert_opencv5, make_aruco_detector, verify_frame, DEFAULT  # noqa: E402

OUT_DIR = os.environ.get("USTAAD_OUT", os.path.join(ROOT, "out"))
S3_BUCKET = os.environ.get("S3_BUCKET", "")

app = FastAPI(title="USTAAD API", version="1.0.0")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

_detector = None


def detector():
    global _detector
    if _detector is None:
        _detector = make_aruco_detector(DEFAULT)
    return _detector


def _decode(data_url_or_b64: str) -> np.ndarray:
    s = data_url_or_b64.split(",", 1)[-1]
    buf = np.frombuffer(base64.b64decode(s), np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "could not decode image")
    return img


def _load_procedure():
    p = os.path.join(OUT_DIR, "procedure.json")
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


@app.get("/health")
def health():
    try:
        ver = assert_opencv5()
    except Exception as e:  # pragma: no cover
        raise HTTPException(500, str(e))
    proc = _load_procedure()
    return {
        "status": "ok",
        "opencv": ver,
        "steps_loaded": proc["n_steps"] if proc else 0,
        "s3_bucket": S3_BUCKET or None,
    }


class VerifyRequest(BaseModel):
    frame: str                      # base64 / data URL of the live frame
    roi: list[int]                  # [x, y, w, h] in reference-frame coords
    reference: str | None = None    # inline reference image (base64 / data URL)
    step_id: int | None = None      # or the 1-based step from the loaded procedure


@app.post("/verify")
def verify(req: VerifyRequest):
    live = _decode(req.frame)
    # resolve the reference: inline image wins, else look it up by step id
    if req.reference:
        ref = _decode(req.reference)
    elif req.step_id is not None:
        proc = _load_procedure()
        if not proc:
            raise HTTPException(400, "no procedure loaded; run /process or pass reference")
        steps = proc["steps"]
        if not (1 <= req.step_id <= len(steps)):
            raise HTTPException(400, f"step_id out of range 1..{len(steps)}")
        ref = cv2.imread(os.path.join(OUT_DIR, steps[req.step_id - 1]["keyframe"]))
        if ref is None:
            raise HTTPException(500, "reference keyframe missing")
    else:
        raise HTTPException(400, "provide either reference or step_id")

    if live.shape[:2] != ref.shape[:2]:
        live = cv2.resize(live, (ref.shape[1], ref.shape[0]))
    x, y, w, h = req.roi
    r = verify_frame(live, ref, (x, y, w, h), detector(), DEFAULT)
    return {
        "decision": r["decision"],
        "score": None if r["score"] is None else round(r["score"], 4),
        "region": r["region"],
        "align_method": r["method"],
        "inliers": r["inliers"],
        "latency_ms": round(r["latency_ms"], 1),
    }


@app.post("/process")
async def process(
    expert: UploadFile = File(...),
    worker: UploadFile = File(...),
    manual: UploadFile = File(...),
):
    """Run learn+verify on uploaded videos; write outputs locally and to S3 if set."""
    job = tempfile.mkdtemp(prefix="ustaad_")
    data = os.path.join(job, "data")
    out = os.path.join(job, "out")
    os.makedirs(data, exist_ok=True)
    os.makedirs(out, exist_ok=True)
    for up, name in [(expert, "expert.mp4"), (worker, "worker.mp4"), (manual, "manual.txt")]:
        with open(os.path.join(data, name), "wb") as f:
            f.write(await up.read())

    env = {**os.environ, "PYTHONPATH": os.path.join(ROOT, "pipeline")}
    py = sys.executable
    t0 = time.perf_counter()
    for script, extra in [("learn.py", []), ("verify.py", [])]:
        cmd = [py, os.path.join(ROOT, "pipeline", script),
               "--out", out] + extra
        if script == "learn.py":
            cmd += ["--expert", os.path.join(data, "expert.mp4"),
                    "--manual", os.path.join(data, "manual.txt")]
        else:
            cmd += ["--worker", os.path.join(data, "worker.mp4"),
                    "--procedure", os.path.join(out, "procedure.json")]
        p = subprocess.run(cmd, capture_output=True, text=True, env=env)
        if p.returncode != 0:
            raise HTTPException(500, f"{script} failed: {p.stderr[-800:]}")

    with open(os.path.join(out, "procedure.json"), encoding="utf-8") as f:
        proc = json.load(f)
    with open(os.path.join(out, "session.json"), encoding="utf-8") as f:
        sess = json.load(f)

    s3_prefix = None
    if S3_BUCKET:
        s3_prefix = _upload_to_s3(out, job)

    return {
        "elapsed_s": round(time.perf_counter() - t0, 1),
        "n_steps": proc["n_steps"],
        "decisions": sess["decisions"],
        "median_latency_ms": sess["timings"]["median_latency_ms"],
        "s3_prefix": s3_prefix,
        "out_dir": out if not S3_BUCKET else None,
    }


def _upload_to_s3(out_dir: str, job: str) -> str:
    import boto3  # imported lazily so local runs don't need it
    s3 = boto3.client("s3")
    prefix = f"sessions/{os.path.basename(job)}"
    for root, _, files in os.walk(out_dir):
        for fn in files:
            full = os.path.join(root, fn)
            key = f"{prefix}/{os.path.relpath(full, out_dir).replace(os.sep, '/')}"
            s3.upload_file(full, S3_BUCKET, key)
    return f"s3://{S3_BUCKET}/{prefix}"
