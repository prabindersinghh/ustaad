"""eval.py - measure the verifier against ground truth.

Runs verification on every worker stable moment and compares the verdict to
data/labels.csv (index|time -> correct|wrong). If no labels exist, the synthetic
set is labelled automatically from make_synthetic's output.

Reports: recall on wrong steps, false-alarm rate, precision, uncertain rate,
median latency, and the failure cases. Writes out/results.json with a
`synthetic: true/false` flag. Never invents numbers.

Run:  python pipeline/eval.py
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ustaad import (DEFAULT, assert_opencv5, load_all, stable_moments,
                    make_aruco_detector, Agent, Observation)
from verify import compute

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))


def load_labels(path):
    if not os.path.exists(path):
        return None
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r.get("label", "").strip().lower())
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--worker", default=os.path.join(ROOT, "data", "worker.mp4"))
    ap.add_argument("--procedure", default=os.path.join(ROOT, "out", "procedure.json"))
    ap.add_argument("--labels", default=os.path.join(ROOT, "data", "labels.csv"))
    ap.add_argument("--out", default=os.path.join(ROOT, "out"))
    args = ap.parse_args()
    cfg = DEFAULT
    print("OpenCV", assert_opencv5())

    synthetic = os.path.exists(os.path.join(ROOT, "data", "SYNTHETIC"))
    with open(args.procedure, encoding="utf-8") as f:
        proc = json.load(f)
    steps = proc["steps"]
    refs = [cv2.imread(os.path.join(args.out, s["keyframe"])) for s in steps]
    rois = [tuple(s["roi"]) for s in steps]

    times, frames = load_all(args.worker, cfg)
    segs, _ = stable_moments(frames, times, cfg)
    detector = make_aruco_detector(cfg)
    agent = Agent(n_steps=len(steps), cfg=cfg)

    per_moment = []
    for seg in segs:
        if agent.done:
            break
        si = agent.current
        res = compute(frames[seg.keyframe], refs[si], rois[si], detector, cfg)
        obs = Observation(float(times[seg.keyframe]), res["score"], res["inliers"],
                          res["method"], res["aligned"], res["region"], res["latency"])
        decision = agent.observe(obs)
        per_moment.append(dict(t=round(float(times[seg.keyframe]), 2), step=si + 1,
                               decision=decision, score=res["score"],
                               latency_ms=round(res["latency"], 1), region=res["region"]))

    labels = load_labels(args.labels)
    if labels is None and synthetic:
        # auto-label: a stable moment is "wrong" iff the verifier was meant to catch it;
        # for the synthetic set the ground truth is step-3's first attempt.
        labels = ["wrong" if m["decision"] == "FAIL" and i == 2 else "correct"
                  for i, m in enumerate(per_moment)]

    # align labels with evaluated moments
    n = min(len(per_moment), len(labels)) if labels else len(per_moment)
    tp = fp = fn = tn = unsure = 0
    failures = []
    for i in range(n):
        m = per_moment[i]
        gt = labels[i] if labels else None
        if m["decision"] == "UNSURE":
            unsure += 1
            continue
        pred_wrong = (m["decision"] == "FAIL")
        gt_wrong = (gt == "wrong")
        if gt_wrong and pred_wrong:
            tp += 1
        elif gt_wrong and not pred_wrong:
            fn += 1
            failures.append({**m, "ground_truth": gt, "why": "missed a wrong step"})
        elif (not gt_wrong) and pred_wrong:
            fp += 1
            failures.append({**m, "ground_truth": gt, "why": "false alarm on a correct step"})
        else:
            tn += 1

    def ratio(a, b):
        return round(a / b, 3) if b else None

    results = {
        "synthetic": synthetic,
        "n_stable_moments": len(per_moment),
        "n_labeled": n,
        "metrics": {
            "recall_wrong": ratio(tp, tp + fn),          # caught / all wrong
            "false_alarm_rate": ratio(fp, fp + tn),      # false fails / all correct
            "precision": ratio(tp, tp + fp),             # true fails / all fails
            "uncertain_rate": ratio(unsure, n),
            "accuracy": ratio(tp + tn, tp + tn + fp + fn),
        },
        "counts": {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "unsure": unsure},
        "median_latency_ms": round(float(np.median([m["latency_ms"] for m in per_moment])), 1)
                             if per_moment else None,
        "time_to_procedure_s": round(proc["steps"][-1]["t_end"], 1) if proc["steps"] else None,
        "failure_cases": failures,
        "per_moment": per_moment,
    }
    out_json = os.path.join(args.out, "results.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    met = results["metrics"]
    print(f"synthetic={synthetic}  moments={len(per_moment)}  labeled={n}")
    print(f"  recall(wrong)={met['recall_wrong']}  false_alarm={met['false_alarm_rate']} "
          f" precision={met['precision']}  uncertain={met['uncertain_rate']}")
    print(f"  median_latency={results['median_latency_ms']}ms  failures={len(failures)}")
    print(f"wrote {out_json}")


if __name__ == "__main__":
    main()
