"""Frame alignment: warp a live frame onto a reference keyframe.

Strategy (per the spec):
  1. If >=3 ArUco markers are seen in BOTH frames, use their centres to solve a
     homography. ArUco is rock-solid when present, so we prefer it.
  2. Otherwise fall back to ORB(1500) + BFMatcher + Lowe 0.75 + RANSAC.
  3. If fewer than min_inliers support the homography -> alignment failed; the
     caller turns that into an UNSURE decision.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .config import Config, DEFAULT


@dataclass
class Alignment:
    H: Optional[np.ndarray]     # 3x3 homography mapping live -> reference, or None
    method: str                 # "aruco" | "orb" | "none"
    inliers: int                # supporting correspondences
    ok: bool                    # True if usable


def _dict(cfg: Config):
    return cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, cfg.aruco_dict))


def make_aruco_detector(cfg: Config = DEFAULT):
    return cv2.aruco.ArucoDetector(_dict(cfg), cv2.aruco.DetectorParameters())


def detect_aruco(gray: np.ndarray, detector) -> dict[int, np.ndarray]:
    """Return {marker_id: 4x2 corner array} for every detected marker."""
    corners, ids, _ = detector.detectMarkers(gray)
    out: dict[int, np.ndarray] = {}
    if ids is not None:
        for c, i in zip(corners, ids.flatten()):
            out[int(i)] = c.reshape(4, 2)
    return out


def _orb():
    # OpenCV 5 keeps the ORB_create factory; guard just in case.
    create = getattr(cv2, "ORB_create", None) or cv2.ORB.create
    return create


def align(live_bgr: np.ndarray, ref_bgr: np.ndarray, detector,
          cfg: Config = DEFAULT) -> Alignment:
    live_g = cv2.cvtColor(live_bgr, cv2.COLOR_BGR2GRAY)
    ref_g = cv2.cvtColor(ref_bgr, cv2.COLOR_BGR2GRAY)

    # --- 1. ArUco path ---
    lm = detect_aruco(live_g, detector)
    rm = detect_aruco(ref_g, detector)
    shared = sorted(set(lm) & set(rm))
    if len(shared) >= cfg.aruco_min_markers:
        src = np.vstack([lm[i] for i in shared]).astype(np.float32)
        dst = np.vstack([rm[i] for i in shared]).astype(np.float32)
        H, mask = cv2.findHomography(src, dst, cv2.RANSAC, cfg.ransac_thresh)
        inl = int(mask.sum()) if mask is not None else 0
        if H is not None and inl >= cfg.aruco_min_markers * 4 - 2:
            return Alignment(H, "aruco", inl, True)

    # --- 2. ORB fallback ---
    orb = _orb()(cfg.orb_features)
    k1, d1 = orb.detectAndCompute(live_g, None)
    k2, d2 = orb.detectAndCompute(ref_g, None)
    if d1 is None or d2 is None or len(k1) < 4 or len(k2) < 4:
        return Alignment(None, "none", 0, False)

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    knn = bf.knnMatch(d1, d2, k=2)
    good = [m for pair in knn if len(pair) == 2
            for m, n in [pair] if m.distance < cfg.lowe_ratio * n.distance]
    if len(good) < 4:
        return Alignment(None, "orb", len(good), False)

    src = np.float32([k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
    dst = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
    H, mask = cv2.findHomography(src, dst, cv2.RANSAC, cfg.ransac_thresh)
    inl = int(mask.sum()) if mask is not None else 0
    ok = H is not None and inl >= cfg.min_inliers
    return Alignment(H if ok else None, "orb", inl, ok)


def warp(live_bgr: np.ndarray, H: np.ndarray, size) -> np.ndarray:
    h, w = size
    return cv2.warpPerspective(live_bgr, H, (w, h))
