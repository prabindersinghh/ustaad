"""USTAAD pipeline package: learn once, verify every time (OpenCV 5)."""
from .config import Config, DEFAULT
from .video import assert_opencv5, sample_frames, load_all, downscale
from .segment import segment, motion_curve, stable_moments, Segment, laplacian_sharpness
from .align import align, make_aruco_detector, detect_aruco, warp, Alignment
from .compare import (clahe_normalize, ssim_map, mismatch_region, heatmap_overlay,
                      crop, Mismatch)
from .agent import Agent, Observation, TraceEntry, decide, PASS, FAIL, UNSURE
from .engine import verify_frame

__all__ = [
    "Config", "DEFAULT", "assert_opencv5", "sample_frames", "load_all", "downscale",
    "segment", "motion_curve", "stable_moments", "Segment", "laplacian_sharpness",
    "align", "make_aruco_detector", "detect_aruco", "warp", "Alignment",
    "clahe_normalize", "ssim_map", "mismatch_region", "heatmap_overlay", "crop",
    "Mismatch", "Agent", "Observation", "TraceEntry", "decide",
    "PASS", "FAIL", "UNSURE", "verify_frame",
]
