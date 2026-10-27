"""learn.py - turn ONE expert video + a text manual into a verifiable procedure.

  expert.mp4 + manual.txt  ->  out/procedure.json + out/keyframes/*.jpg

Pipeline:
  1. sample @10fps, downscale to 640px
  2. motion energy (absdiff -> threshold -> count), smoothed
  3. hysteresis segmentation -> stable moments -> keyframe = sharpest frame
  4. ROI per step = bbox of the largest changed region between keyframes (+15%)
  5. map detected steps to manual lines in order (keep N strongest if counts differ)
  6. store ArUco corners + ORB descriptors per keyframe

Run:  python pipeline/learn.py [--expert data/expert.mp4] [--manual data/manual.txt]
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ustaad import (DEFAULT, assert_opencv5, load_all, segment, make_aruco_detector,
                    detect_aruco)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))


def changed_bbox(prev_bgr, cur_bgr, cfg):
    """Largest changed region between two keyframes -> padded (x,y,w,h)."""
    g0 = cv2.cvtColor(prev_bgr, cv2.COLOR_BGR2GRAY)
    g1 = cv2.cvtColor(cur_bgr, cv2.COLOR_BGR2GRAY)
    diff = cv2.absdiff(g0, g1)
    _, mask = cv2.threshold(diff, cfg.diff_thresh, 255, cv2.THRESH_BINARY)
    k = np.ones((cfg.morph_kernel, cfg.morph_kernel), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    mask = cv2.dilate(mask, k, iterations=2)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, w = g1.shape
    if not contours:
        return (w // 4, h // 4, w // 2, h // 2)
    x, y, bw, bh = cv2.boundingRect(max(contours, key=cv2.contourArea))
    px, py = int(bw * cfg.roi_pad), int(bh * cfg.roi_pad)
    x = max(0, x - px); y = max(0, y - py)
    bw = min(w - x, bw + 2 * px); bh = min(h - y, bh + 2 * py)
    return (int(x), int(y), int(bw), int(bh))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expert", default=os.path.join(ROOT, "data", "expert.mp4"))
    ap.add_argument("--manual", default=os.path.join(ROOT, "data", "manual.txt"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out"))
    args = ap.parse_args()
    cfg = DEFAULT

    print("OpenCV", assert_opencv5())
    kf_dir = os.path.join(args.out, "keyframes")
    os.makedirs(kf_dir, exist_ok=True)

    with open(args.manual, encoding="utf-8") as f:
        manual = [ln.strip() for ln in f if ln.strip()]
    print(f"manual: {len(manual)} steps")

    times, frames = load_all(args.expert, cfg)
    print(f"sampled {len(frames)} frames @ ~{cfg.fps}fps")
    segs, curve = segment(frames, times, cfg)
    print(f"detected {len(segs)} stable moments")

    # map detected segments to manual lines, in order
    if len(segs) != len(manual):
        print(f"WARNING: detected {len(segs)} segments but manual has {len(manual)}; "
              f"keeping the {len(manual)} strongest-motion segments")
        strength = [curve[s.action_start:s.stable_start].max() if s.stable_start > s.action_start
                    else curve[s.action_start] for s in segs]
        keep = sorted(sorted(range(len(segs)), key=lambda i: strength[i],
                             reverse=True)[:len(manual)])
        segs = [segs[i] for i in keep]

    detector = make_aruco_detector(cfg)
    steps = []
    prev_kf = frames[0]
    for i, seg in enumerate(segs[:len(manual)]):
        kf = frames[seg.keyframe]
        roi = changed_bbox(prev_kf, kf, cfg)
        kf_path = os.path.join(kf_dir, f"step{i+1}.jpg")
        cv2.imwrite(kf_path, kf)

        gray = cv2.cvtColor(kf, cv2.COLOR_BGR2GRAY)
        markers = detect_aruco(gray, detector)
        orb = (getattr(cv2, "ORB_create", None) or cv2.ORB.create)(cfg.orb_features)
        kp, desc = orb.detectAndCompute(gray, None)
        orb_path = os.path.join(kf_dir, f"step{i+1}.orb.npz")
        np.savez_compressed(orb_path,
                            pts=np.float32([k.pt for k in kp]) if kp else np.zeros((0, 2)),
                            desc=desc if desc is not None else np.zeros((0, 32), np.uint8))

        steps.append({
            "index": i + 1,
            "name": manual[i],
            "t_start": round(float(times[seg.action_start]), 3),
            "t_end": round(float(times[seg.stable_end]), 3),
            "t_keyframe": round(float(times[seg.keyframe]), 3),
            "keyframe": os.path.relpath(kf_path, args.out).replace("\\", "/"),
            "roi": list(roi),
            "aruco": [{"id": int(k), "corners": markers[k].tolist()} for k in sorted(markers)],
            "orb_file": os.path.relpath(orb_path, args.out).replace("\\", "/"),
            "orb_features": int(len(kp)),
        })
        prev_kf = kf
        print(f"  step {i+1}: '{manual[i]}'  roi={roi}  aruco={len(markers)}  orb={len(kp)}")

    procedure = {
        "source": os.path.relpath(args.expert, ROOT).replace("\\", "/"),
        "fps": cfg.fps,
        "width": cfg.width,
        "frame_size": [int(frames[0].shape[1]), int(frames[0].shape[0])],
        "n_steps": len(steps),
        "config": cfg.to_dict(),
        "motion_curve": [round(float(x), 5) for x in curve],
        "times": [round(float(t), 3) for t in times],
        "segments": [{"t_start": round(float(times[s.action_start]), 3),
                      "t_end": round(float(times[s.stable_end]), 3),
                      "t_keyframe": round(float(times[s.keyframe]), 3)} for s in segs[:len(manual)]],
        "steps": steps,
    }
    out_json = os.path.join(args.out, "procedure.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(procedure, f, indent=2)
    print(f"wrote {out_json}  ({len(steps)} steps, {len(curve)} motion samples)")


if __name__ == "__main__":
    main()
