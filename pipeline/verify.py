"""verify.py - watch a worker video and verify each step against the procedure.

  worker.mp4 + procedure.json  ->  out/session.json
                                   out/evidence/*.jpg
                                   out/worker_annotated.mp4
                                   out/evidence/stage_*  (one PASS + one FAIL, for Fig 3)

At every stable moment we align the worker frame to the current expected step's
keyframe (ArUco homography if >=3 markers, else ORB+RANSAC), normalise with
CLAHE, score SSIM inside the ROI, locate the mismatch region, decide with
tau_fail/tau_pass, and let the agent pick the next tool.

Run:  python pipeline/verify.py [--worker data/worker.mp4]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ustaad import (DEFAULT, assert_opencv5, load_all, stable_moments,
                    make_aruco_detector, detect_aruco, align, warp,
                    clahe_normalize, ssim_map, mismatch_region, crop, heatmap_overlay,
                    Agent, Observation, verify_frame)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

GREEN = (80, 180, 70)
RED = (60, 60, 230)
BLUE = (235, 150, 40)
YELLOW = (0, 196, 255)
INK = (24, 20, 17)


def _orb(cfg):
    return (getattr(cv2, "ORB_create", None) or cv2.ORB.create)(cfg.orb_features)


def compute(live, ref, roi, detector, cfg, want_stages=False):
    """Thin wrapper over the shared engine that also extracts Fig-3 stage images."""
    r = verify_frame(live, ref, roi, detector, cfg)
    out = dict(score=r["score"], smap=r["smap"], aligned=r["aligned"],
               method=r["method"], inliers=r["inliers"], region=r["region"],
               latency=r["latency_ms"], warped=r["warped"], stages={})
    if want_stages and r["aligned"]:
        al = align(live, ref, detector, cfg)   # for the match visualisation
        out["stages"] = dict(
            raw=live.copy(), ref=ref.copy(), warped=r["warped"].copy(),
            clahe=clahe_normalize(r["warped"], cfg), smap=r["smap"].copy(),
            roi=roi, method=r["method"], mismatch=r["mismatch"],
            matches=_match_vis(live, ref, al, detector, cfg))
    return out


def _match_vis(live, ref, al, detector, cfg):
    """A visualisation of the correspondences used for alignment."""
    if al.method == "aruco":
        lg = cv2.cvtColor(live, cv2.COLOR_BGR2GRAY)
        rg = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY)
        lm, rm = detect_aruco(lg, detector), detect_aruco(rg, detector)
        vis = np.hstack([live.copy(), ref.copy()])
        w = live.shape[1]
        for i in sorted(set(lm) & set(rm)):
            c1 = lm[i].mean(0).astype(int)
            c2 = rm[i].mean(0).astype(int) + [w, 0]
            cv2.circle(vis, tuple(c1), 7, YELLOW, 2)
            cv2.circle(vis, tuple(c2), 7, YELLOW, 2)
            cv2.line(vis, tuple(c1), tuple(c2), GREEN, 1, cv2.LINE_AA)
        return vis
    # ORB
    orb = _orb(cfg)
    k1, d1 = orb.detectAndCompute(cv2.cvtColor(live, cv2.COLOR_BGR2GRAY), None)
    k2, d2 = orb.detectAndCompute(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY), None)
    if d1 is None or d2 is None:
        return np.hstack([live, ref])
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    good = [m for pair in bf.knnMatch(d1, d2, k=2) if len(pair) == 2
            for m, n in [pair] if m.distance < cfg.lowe_ratio * n.distance]
    good = sorted(good, key=lambda m: m.distance)[:40]
    return cv2.drawMatches(live, k1, ref, k2, good, None,
                           matchColor=GREEN, singlePointColor=(120, 120, 120),
                           flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)


def draw_banner(img, decision, score, region):
    colors = {"PASS": GREEN, "FAIL": RED, "UNSURE": YELLOW}
    label = {"PASS": "PASS", "FAIL": "FAIL", "UNSURE": "UNSURE - human review"}[decision]
    txt = label if score is None else f"{label}   SSIM {score:.2f}"
    if decision == "FAIL" and region:
        txt += f"   @ {region}"
    (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
    x = (img.shape[1] - tw) // 2
    cv2.rectangle(img, (x - 16, img.shape[0] - 52), (x + tw + 16, img.shape[0] - 14),
                  (0, 0, 0), -1)
    cv2.rectangle(img, (x - 16, img.shape[0] - 52), (x + tw + 16, img.shape[0] - 14),
                  colors[decision], 2)
    cv2.putText(img, txt, (x, img.shape[0] - 26), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                colors[decision], 2, cv2.LINE_AA)


def annotate(frame, roi, color, step_label, live_score, decision=None,
             score=None, region=None, smap=None):
    img = frame.copy()
    if smap is not None:
        img = heatmap_overlay(img, smap, roi, alpha=0.45)
    x, y, w, h = roi
    cv2.rectangle(img, (x, y), (x + w, y + h), color, 2)
    cv2.putText(img, "ROI", (x + 4, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    # top-left HUD
    cv2.rectangle(img, (10, 10), (250, 64), (0, 0, 0), -1)
    cv2.putText(img, step_label, (18, 32), cv2.FONT_HERSHEY_SIMPLEX, 0.56, (235, 235, 235), 1, cv2.LINE_AA)
    sc = "--" if live_score is None else f"{live_score:.2f}"
    cv2.putText(img, f"live SSIM {sc}", (18, 54), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 190, 200), 1, cv2.LINE_AA)
    if decision:
        draw_banner(img, decision, score, region)
    return img


def save_stage_images(out_dir, tag, st, decision, cfg):
    """Fig-3 stepper images: raw, matches, warped, clahe, ssim map, mismatch, verdict."""
    base = os.path.join(out_dir, "evidence")
    roi = st["roi"]
    def w(name, im): cv2.imwrite(os.path.join(base, f"stage_{tag}_{name}.jpg"), im)
    w("1_raw", st["raw"])
    w("2_matches", st["matches"])
    w("3_warped", st["warped"])
    w("4_clahe", st["clahe"])
    # ssim map colourised, upsized to ROI
    x, y, rw, rh = roi
    smap = (np.clip(st["smap"], 0, 1) * 255).astype(np.uint8)
    smap_c = cv2.applyColorMap(cv2.resize(smap, (rw, rh)), cv2.COLORMAP_VIRIDIS)
    canvas = st["clahe"].copy(); canvas[y:y+rh, x:x+rw] = smap_c
    cv2.rectangle(canvas, (x, y), (x+rw, y+rh), (255, 255, 255), 1)
    w("5_ssim", canvas)
    # mismatch contour
    mmimg = st["warped"].copy()
    cv2.rectangle(mmimg, (x, y), (x+rw, y+rh), BLUE, 1)
    if st["mismatch"].bbox:
        bx, by, bw, bh = st["mismatch"].bbox
        cv2.rectangle(mmimg, (x+bx, y+by), (x+bx+bw, y+by+bh), RED, 2)
        cv2.putText(mmimg, st["mismatch"].region, (x+bx, y+by-6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, RED, 1, cv2.LINE_AA)
    w("6_mismatch", mmimg)
    # verdict
    vimg = st["warped"].copy()
    draw_banner(vimg, decision, st.get("score"), st["mismatch"].region)
    w("7_verdict", vimg)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", default=os.path.join(ROOT, "data", "worker.mp4"))
    ap.add_argument("--procedure", default=os.path.join(ROOT, "out", "procedure.json"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out"))
    args = ap.parse_args()
    cfg = DEFAULT
    print("OpenCV", assert_opencv5())

    with open(args.procedure, encoding="utf-8") as f:
        proc = json.load(f)
    steps = proc["steps"]
    refs = [cv2.imread(os.path.join(args.out, s["keyframe"])) for s in steps]
    rois = [tuple(s["roi"]) for s in steps]
    names = [s["name"] for s in steps]
    ev_dir = os.path.join(args.out, "evidence")
    os.makedirs(ev_dir, exist_ok=True)

    times, frames = load_all(args.worker, cfg)
    segs, curve = stable_moments(frames, times, cfg)
    print(f"worker: {len(frames)} frames, {len(segs)} stable moments")

    detector = make_aruco_detector(cfg)
    agent = Agent(n_steps=len(steps), cfg=cfg)

    decisions = []        # for the annotated video + session
    got_pass_stage = got_fail_stage = False

    for seg in segs:
        if agent.done:
            break
        step_idx = agent.current
        live = frames[seg.keyframe]
        ref = refs[step_idx]
        want = (not got_fail_stage) or (not got_pass_stage)
        res = compute(live, ref, rois[step_idx], detector, cfg, want_stages=want)
        obs = Observation(t_video=float(times[seg.keyframe]), score=res["score"],
                          inliers=res["inliers"], align_method=res["method"],
                          aligned=res["aligned"], region=res["region"],
                          latency_ms=res["latency"])
        decision = agent.observe(obs)

        # evidence image for this decision
        color = {"PASS": GREEN, "FAIL": RED, "UNSURE": YELLOW}[decision]
        ev = annotate(live, rois[step_idx], color, f"Step {step_idx+1}: {names[step_idx]}",
                      res["score"], decision, res["score"], res["region"], res.get("smap"))
        ev_path = os.path.join(ev_dir, f"step{step_idx+1}_{decision.lower()}_{seg.keyframe}.jpg")
        cv2.imwrite(ev_path, ev)

        decisions.append(dict(t=float(times[seg.keyframe]), step=step_idx + 1,
                              decision=decision, score=res["score"], region=res["region"],
                              roi=rois[step_idx], smap=res.get("smap"),
                              evidence=os.path.relpath(ev_path, args.out).replace("\\", "/")))

        # stash stage images for Fig 3 (first PASS + first FAIL)
        if res.get("stages"):
            res["stages"]["score"] = res["score"]
            if decision == "FAIL" and not got_fail_stage:
                save_stage_images(args.out, "fail", res["stages"], decision, cfg)
                got_fail_stage = True
            elif decision == "PASS" and not got_pass_stage:
                save_stage_images(args.out, "pass", res["stages"], decision, cfg)
                got_pass_stage = True

        print(f"  t={times[seg.keyframe]:5.1f}s step{step_idx+1} {decision:7s} "
              f"score={res['score']} method={res['method']} inl={res['inliers']}")

    # ---------- annotated video ----------
    write_annotated(args.worker, args.out, steps, decisions, detector, cfg)

    # ---------- session.json ----------
    per_step = {}
    for r in agent.results:
        per_step.setdefault(r["step"], []).append(r)
    latencies = [e.latency_ms for e in agent.trace if e.tool == "verify_step"]
    session = {
        "worker": os.path.relpath(args.worker, ROOT).replace("\\", "/"),
        "n_steps": len(steps),
        "step_names": names,
        "trace": agent.trace_dicts(),
        "results": agent.results,
        "decisions": [{k: v for k, v in d.items() if k != "smap"} for d in decisions],
        "timings": {
            "median_latency_ms": round(float(np.median(latencies)), 1) if latencies else None,
            "n_verifications": len(latencies),
        },
        "annotated_video": "worker_annotated.mp4",
    }
    out_json = os.path.join(args.out, "session.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(session, f, indent=2)
    print(f"wrote {out_json}  ({len(agent.trace)} trace events, "
          f"{len(decisions)} decisions)")


def write_annotated(worker_path, out_dir, steps, decisions, detector, cfg):
    """Re-read the worker video at full rate and burn in annotations, synced to time."""
    cap = cv2.VideoCapture(worker_path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    refs = [cv2.imread(os.path.join(out_dir, s["keyframe"])) for s in steps]
    rois = [tuple(s["roi"]) for s in steps]
    names = [s["name"] for s in steps]
    out_path = os.path.join(out_dir, "worker_annotated_raw.mp4")
    writer, idx = None, 0
    decisions = sorted(decisions, key=lambda d: d["t"])

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame = cv2.resize(frame, (steps and refs[0].shape[1] or 640,
                                   refs[0].shape[0]), interpolation=cv2.INTER_AREA)
        if writer is None:
            h, w = frame.shape[:2]
            writer = cv2.VideoWriter(out_path, cv2.VideoWriter_fourcc(*"mp4v"),
                                     src_fps, (w, h))
        t = idx / src_fps
        # which step is being worked on, and the active decision flash
        upcoming = next((d for d in decisions if d["t"] >= t - 0.1), decisions[-1] if decisions else None)
        active = None
        for d in decisions:
            if d["t"] <= t:
                active = d
        cur = upcoming or active
        step_i = (cur["step"] - 1) if cur else 0
        roi = rois[step_i]
        # live score via quick alignment to the current step ref
        res = compute(frame, refs[step_i], roi, detector, cfg)
        live_score = res["score"]
        flash = active and (t - active["t"]) < 1.6
        img = annotate(frame, roi, BLUE if not flash else
                       {"PASS": GREEN, "FAIL": RED, "UNSURE": YELLOW}[active["decision"]],
                       f"Step {step_i+1}: {names[step_i]}", live_score,
                       decision=active["decision"] if flash else None,
                       score=active["score"] if flash else None,
                       region=active["region"] if flash else None,
                       smap=active["smap"] if flash else None)
        writer.write(img)
        idx += 1
    cap.release()
    if writer:
        writer.release()
    print(f"wrote {out_path} ({idx} frames) -> run_all.sh transcodes to H.264")


if __name__ == "__main__":
    main()
