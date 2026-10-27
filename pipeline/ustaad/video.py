"""Video sampling helpers.

Pulls frames from a video at a fixed rate and downscales to a working width so
the rest of the pipeline sees a stable, resolution-independent stream.
"""
from __future__ import annotations

from typing import Iterator, Tuple

import cv2
import numpy as np

from .config import Config, DEFAULT


def assert_opencv5() -> str:
    """Fail loudly unless we are running on OpenCV 5.x (competition requirement)."""
    ver = cv2.__version__
    if not ver.startswith("5"):
        raise RuntimeError(
            f"USTAAD requires OpenCV 5.x, found {ver}. "
            "Install opencv-contrib-python-headless==5.0.0.93"
        )
    return ver


def downscale(frame: np.ndarray, width: int) -> np.ndarray:
    h, w = frame.shape[:2]
    if w == width:
        return frame
    scale = width / float(w)
    return cv2.resize(frame, (width, int(round(h * scale))), interpolation=cv2.INTER_AREA)


def sample_frames(path: str, cfg: Config = DEFAULT) -> Iterator[Tuple[float, np.ndarray]]:
    """Yield (t_seconds, frame) sampled at cfg.fps, downscaled to cfg.width."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise FileNotFoundError(f"cannot open video: {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(src_fps / cfg.fps)))
    idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                t = idx / src_fps
                yield t, downscale(frame, cfg.width)
            idx += 1
    finally:
        cap.release()


def load_all(path: str, cfg: Config = DEFAULT):
    """Load every sampled frame into memory: returns (times, frames)."""
    times, frames = [], []
    for t, f in sample_frames(path, cfg):
        times.append(t)
        frames.append(f)
    if not frames:
        raise RuntimeError(f"no frames decoded from {path}")
    return np.asarray(times), frames
