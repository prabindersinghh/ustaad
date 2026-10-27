"""Central configuration for the USTAAD pipeline.

Every tunable lives here so learn / verify / eval / the API and the browser demo
all agree on the same constants. The browser prototype uses the same thresholds
(tau_fail=0.55, tau_pass=0.78) so a procedure learned here behaves identically
in the live demo.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class Config:
    # --- sampling ---
    fps: float = 10.0            # sample rate (Hz) pulled from the source video
    width: int = 640             # downscale target width (keeps aspect ratio)

    # --- motion / hysteresis segmentation ---
    diff_thresh: int = 22        # per-pixel absdiff threshold -> "changed" pixel
    motion_on: float = 0.020     # fraction of changed pixels to enter ACTION
    motion_off: float = 0.008    # fraction below which we are STABLE
    stable_seconds: float = 1.0  # must stay below motion_off this long to end a step
    smooth: int = 3              # moving-average window (frames) on the motion curve

    # --- ROI extraction ---
    roi_pad: float = 0.15        # pad the changed-region bbox by 15%
    morph_kernel: int = 5        # morphology kernel for cleaning the change mask

    # --- alignment ---
    aruco_min_markers: int = 3   # >=3 markers -> use ArUco homography
    orb_features: int = 1500
    lowe_ratio: float = 0.75
    ransac_thresh: float = 5.0
    min_inliers: int = 15        # fewer inliers -> alignment failed -> UNSURE

    # --- comparison / decision ---
    ssim_window: int = 11        # Gaussian window size for SSIM
    ssim_sigma: float = 1.5
    tau_fail: float = 0.55       # score < tau_fail  -> FAIL
    tau_pass: float = 0.78       # score >= tau_pass -> PASS   (between -> UNSURE)
    clahe_clip: float = 2.0
    clahe_grid: int = 8

    # --- aruco ---
    aruco_dict: str = "DICT_4X4_50"
    aruco_ids: tuple = (0, 1, 2, 3)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["aruco_ids"] = list(self.aruco_ids)
        return d


DEFAULT = Config()
