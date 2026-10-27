"""Generate stand-in data when real recordings are not supplied.

Renders the simulated control panel (same idea as the browser prototype) into
expert.mp4 and worker.mp4 with:
  - ArUco markers (DICT_4X4_50, ids 0-3) at the four corners,
  - slight camera jitter, a slow lighting drift and sensor noise,
  - a "hand" that sweeps in to perform each step and leaves for ~2s,
  - the worker doing step 3 wrong first, then correcting it.

Also writes manual.txt (one step per line) and labels.csv (ground truth for
eval.py). Everything downstream works identically on this or on real footage.

Run:  python pipeline/make_synthetic.py
"""
from __future__ import annotations

import csv
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ustaad.video import assert_opencv5  # noqa: E402

W, H = 640, 480
FPS = 30
MARK = 56

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.abspath(os.path.join(HERE, "..", "data"))

STEPS = [
    "Raise main power switch S1",
    "Set speed dial to position 2",
    "Open the feed valve",
    "Engage interlock switch S3",
    "Confirm the READY lamp is lit",
]

# positions of the four corner markers (ids 0..3)
MARK_POS = [(12, 12), (W - 12 - MARK, 12), (12, H - 12 - MARK), (W - 12 - MARK, H - 12 - MARK)]

# control geometry
SW_X = [150, 220, 300, 370]   # switch left edges
SW_Y, SW_W, SW_H = 150, 44, 96
KNOB = (480, 175, 52)
LAMP = (175, 345, 28)
VALVE = (300, 350)            # pivot of the valve lever

# ROIs per step (x, y, w, h) in panel coords — the region learn.py would find
ROIS = [
    (SW_X[0] - 12, SW_Y - 16, SW_W + 24, SW_H + 40),      # S1
    (KNOB[0] - 70, KNOB[1] - 70, 140, 150),               # knob
    (VALVE[0] - 20, VALVE[1] - 70, 180, 110),             # valve
    (SW_X[2] - 12, SW_Y - 16, SW_W + 24, SW_H + 40),      # S3
    (LAMP[0] - 40, LAMP[1] - 40, 110, 100),               # lamp
]


def _markers():
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    return [cv2.aruco.generateImageMarker(d, i, MARK) for i in range(4)]


MARKERS = None


def draw_panel(state, t, hand_y=None):
    """Render one frame of the panel for the given control state at time t."""
    drift = int(10 * np.sin(t / 2.3))
    base = 52 + drift
    img = np.full((H, W, 3), base - 8, np.uint8)
    cv2.rectangle(img, (6, 6), (W - 6, H - 6), (base, base + 4, base + 10), -1)
    cv2.rectangle(img, (6, 6), (W - 6, H - 6), (24, 26, 30), 3)

    # title strip
    cv2.putText(img, "LINE 4  -  ASSEMBLY CELL", (90, 42),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (150, 160, 175), 1, cv2.LINE_AA)

    # switches
    for i, x in enumerate(SW_X):
        cv2.rectangle(img, (x, SW_Y), (x + SW_W, SW_Y + SW_H), (22, 24, 28), -1)
        on = state["switches"][i]
        col = (36, 165, 245) if on else (120, 128, 138)   # BGR yellow-ish when on
        sy = SW_Y + 6 if on else SW_Y + SW_H - 42
        cv2.rectangle(img, (x + 6, sy), (x + SW_W - 6, sy + 36), col, -1)
        cv2.putText(img, f"S{i+1}", (x + 10, SW_Y + SW_H + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 180, 192), 1, cv2.LINE_AA)

    # knob
    kx, ky, kr = KNOB
    cv2.circle(img, (kx, ky), kr, (22, 24, 28), -1)
    cv2.circle(img, (kx, ky), kr - 10, (150, 158, 168), -1)
    ang = -np.pi * 0.75 + state["knob"] * np.pi * 0.5
    cv2.line(img, (kx, ky),
             (int(kx + np.cos(ang) * (kr - 16)), int(ky + np.sin(ang) * (kr - 16))),
             (20, 20, 20), 5)
    cv2.putText(img, "SPEED", (kx - 30, ky + kr + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 180, 192), 1, cv2.LINE_AA)

    # lamp
    lx, ly, lr = LAMP
    lc = (90, 210, 90) if state["lamp"] else (40, 55, 40)
    cv2.circle(img, (lx, ly), lr, lc, -1)
    cv2.circle(img, (lx, ly), lr, (20, 20, 20), 2)
    cv2.putText(img, "READY", (lx - 34, ly + lr + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 180, 192), 1, cv2.LINE_AA)

    # valve lever
    vx, vy = VALVE
    cv2.rectangle(img, (vx - 30, vy - 6), (vx + 120, vy + 6), (22, 24, 28), -1)
    va = -0.95 if state["valve"] else 0.0
    ex, ey = int(vx + np.cos(va) * 120), int(vy + np.sin(va) * 120)
    cv2.line(img, (vx, vy), (ex, ey), (60, 75, 200), 10)
    cv2.circle(img, (vx, vy), 9, (150, 158, 168), -1)
    cv2.putText(img, "VALVE", (vx + 20, vy + 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (170, 180, 192), 1, cv2.LINE_AA)

    # ArUco markers at corners
    for (mx, my), m in zip(MARK_POS, MARKERS):
        img[my:my + MARK, mx:mx + MARK] = cv2.cvtColor(m, cv2.COLOR_GRAY2BGR)

    # "hand" occluder sweeping from the bottom. It is intentionally a dark,
    # soft-edged blob so the motion stage sees a plausible foreground object.
    if hand_y is not None and hand_y < H:
        overlay = img.copy()
        cv2.ellipse(overlay, (W // 2, hand_y + 90), (72, 112), 0, 0, 360, (18, 22, 26), -1)
        cv2.ellipse(overlay, (W // 2, hand_y), (36, 48), 0, 0, 360, (25, 29, 34), -1)
        img = cv2.addWeighted(overlay, 0.88, img, 0.12, 0)

    # camera jitter (small sub-pixel-ish translation)
    jx, jy = np.random.randint(-2, 3), np.random.randint(-2, 3)
    M = np.float32([[1, 0, jx], [0, 1, jy]])
    img = cv2.warpAffine(img, M, (W, H), borderMode=cv2.BORDER_REPLICATE)

    # sensor noise
    noise = np.random.normal(0, 4.5, (H, W, 3)).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img


def apply_action(state, step_idx):
    if step_idx == 0:
        state["switches"][0] = 1
    elif step_idx == 1:
        state["knob"] = 2
    elif step_idx == 2:
        state["valve"] = 1
    elif step_idx == 3:
        state["switches"][2] = 1
    elif step_idx == 4:
        state["lamp"] = 1


def new_state():
    return {"switches": [0, 0, 0, 0], "knob": 0, "lamp": 0, "valve": 0}


class Recorder:
    def __init__(self, path):
        self.path = path
        self.writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"mp4v"),
                                      FPS, (W, H))
        self.t = 0.0
        self.stable_events = []   # (t, label) at the middle of each stable hold

    def hold(self, state, seconds, label=None):
        n = int(seconds * FPS)
        mid = self.t + seconds / 2
        for _ in range(n):
            self.writer.write(draw_panel(state, self.t))
            self.t += 1.0 / FPS
        if label is not None:
            self.stable_events.append((round(mid, 2), label))

    def sweep(self, state_before, state_after, dwell=0.0):
        """Hand enters (state_before), action happens at apex, hand leaves (after)."""
        up = int(0.5 * FPS)
        for i in range(up):                       # hand rising
            hy = int(H - (H - 150) * (i / up))
            self.writer.write(draw_panel(state_before, self.t, hand_y=hy))
            self.t += 1.0 / FPS
        for _ in range(int(max(dwell, 0.1) * FPS)):  # covering the control
            self.writer.write(draw_panel(state_before, self.t, hand_y=150))
            self.t += 1.0 / FPS
        state_before.clear(); state_before.update(state_after)   # flip under the hand
        for i in range(up):                       # hand leaving
            hy = int(150 + (H - 150) * (i / up))
            self.writer.write(draw_panel(state_after, self.t, hand_y=hy))
            self.t += 1.0 / FPS

    def close(self):
        self.writer.release()


def record_expert(path):
    rec = Recorder(path)
    st = new_state()
    rec.hold(st, 1.0)
    for i in range(len(STEPS)):
        after = {k: (v[:] if isinstance(v, list) else v) for k, v in st.items()}
        apply_action(after, i)
        rec.sweep(st, after)
        rec.hold(st, 2.0, label="correct")
    rec.close()
    return rec.stable_events


def record_worker(path):
    rec = Recorder(path)
    st = new_state()
    rec.hold(st, 1.0)
    for i in range(len(STEPS)):
        if i == 2:
            # WRONG first: toggle an unrelated switch, leave the valve closed
            wrong = {k: (v[:] if isinstance(v, list) else v) for k, v in st.items()}
            wrong["switches"][3] = 1
            rec.sweep(st, wrong)
            rec.hold(st, 2.0, label="wrong")
            # CORRECT it: open the valve as the step actually requires
            fixed = {k: (v[:] if isinstance(v, list) else v) for k, v in st.items()}
            apply_action(fixed, i)
            rec.sweep(st, fixed)
            rec.hold(st, 2.0, label="correct")
        else:
            after = {k: (v[:] if isinstance(v, list) else v) for k, v in st.items()}
            apply_action(after, i)
            rec.sweep(st, after)
            rec.hold(st, 2.0, label="correct")
    rec.close()
    return rec.stable_events


def main():
    global MARKERS
    print("OpenCV", assert_opencv5())
    MARKERS = _markers()
    os.makedirs(DATA, exist_ok=True)
    np.random.seed(7)

    exp = os.path.join(DATA, "expert.mp4")
    wrk = os.path.join(DATA, "worker.mp4")
    print("rendering expert ->", exp)
    record_expert(exp)
    print("rendering worker ->", wrk)
    worker_events = record_worker(wrk)

    with open(os.path.join(DATA, "manual.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(STEPS) + "\n")

    # ground-truth labels for eval.py: one row per worker stable moment, in order
    with open(os.path.join(DATA, "labels.csv"), "w", newline="", encoding="utf-8") as f:
        wtr = csv.writer(f)
        wtr.writerow(["index", "t", "label"])
        for idx, (t, label) in enumerate(worker_events):
            wtr.writerow([idx, t, label])

    # marker so eval.py can honestly flag the dataset as synthetic
    with open(os.path.join(DATA, "SYNTHETIC"), "w", encoding="utf-8") as f:
        f.write("generated by make_synthetic.py\n")

    print(f"wrote manual.txt ({len(STEPS)} steps) and labels.csv "
          f"({len(worker_events)} worker stable moments)")


if __name__ == "__main__":
    main()
