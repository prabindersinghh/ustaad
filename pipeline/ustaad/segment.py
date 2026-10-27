"""Motion-energy segmentation with hysteresis.

absdiff -> threshold -> count changed pixels -> smooth -> hysteresis.
An action is motion above motion_on; a step ends when motion falls below
motion_off and stays there for >= stable_seconds. The keyframe of a step is the
sharpest frame (max Laplacian variance) inside its stable window.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List

import cv2
import numpy as np

from .config import Config, DEFAULT


@dataclass
class Segment:
    """A detected stable moment at the end of an action."""
    action_start: int   # frame index where motion first rose
    stable_start: int   # frame index where the scene became stable
    stable_end: int     # frame index where the stable window ends
    keyframe: int       # sharpest frame index inside the stable window

    def t(self, times: np.ndarray) -> float:
        return float(times[self.keyframe])


def _gray(frame: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def motion_curve(frames: List[np.ndarray], cfg: Config = DEFAULT) -> np.ndarray:
    """Fraction of changed pixels between consecutive frames, smoothed."""
    curve = np.zeros(len(frames), dtype=np.float32)
    prev = None
    for i, f in enumerate(frames):
        g = _gray(f)
        if prev is not None:
            diff = cv2.absdiff(g, prev)
            _, mask = cv2.threshold(diff, cfg.diff_thresh, 255, cv2.THRESH_BINARY)
            curve[i] = float(np.count_nonzero(mask)) / mask.size
        prev = g
    if cfg.smooth > 1:
        k = np.ones(cfg.smooth, dtype=np.float32) / cfg.smooth
        curve = np.convolve(curve, k, mode="same")
    return curve


def laplacian_sharpness(frame: np.ndarray) -> float:
    return float(cv2.Laplacian(_gray(frame), cv2.CV_64F).var())


def segment(frames: List[np.ndarray], times: np.ndarray,
            cfg: Config = DEFAULT) -> tuple[list[Segment], np.ndarray]:
    """Return (segments, motion_curve).

    A state machine walks the motion curve: IDLE -> ACTION (motion_on crossed)
    -> back to stable (motion_off), and once we have been stable for
    stable_seconds we close a segment at the sharpest frame in that window.
    """
    curve = motion_curve(frames, cfg)
    n = len(frames)
    if n < 2:
        return [], curve

    # frames-per-second actually sampled (robust to jitter in `times`)
    dt = np.diff(times)
    fps = 1.0 / float(np.median(dt)) if len(dt) else cfg.fps
    stable_frames = max(1, int(round(cfg.stable_seconds * fps)))

    segments: List[Segment] = []
    moving = False
    action_start = 0
    stable_since = None
    seen_action = False

    for i in range(n):
        m = curve[i]
        if not moving and m > cfg.motion_on:
            moving = True
            seen_action = True
            action_start = i
            stable_since = None
        elif moving and m < cfg.motion_off:
            moving = False
            stable_since = i
        elif not moving and m < cfg.motion_off:
            if stable_since is None:
                stable_since = i

        # close a segment once we have been stable long enough after an action
        if (not moving and seen_action and stable_since is not None
                and (i - stable_since) >= stable_frames):
            stable_end = i
            kf = _sharpest(frames, stable_since, stable_end)
            segments.append(Segment(action_start, stable_since, stable_end, kf))
            seen_action = False
            stable_since = None

    return segments, curve


def _sharpest(frames: List[np.ndarray], lo: int, hi: int) -> int:
    best_i, best_v = lo, -1.0
    for i in range(lo, min(hi + 1, len(frames))):
        v = laplacian_sharpness(frames[i])
        if v > best_v:
            best_v, best_i = v, i
    return best_i


def stable_moments(frames: List[np.ndarray], times: np.ndarray,
                   cfg: Config = DEFAULT) -> tuple[list[Segment], np.ndarray]:
    """Alias used by verify.py: the worker's stable moments are the same thing."""
    return segment(frames, times, cfg)
