"""Photometric normalisation + SSIM comparison inside an ROI.

  - CLAHE on the L channel of LAB removes lighting drift before comparison.
  - SSIM is the classic Wang et al. Gaussian-windowed formulation, built from
    cv2.GaussianBlur (no scikit-image dependency).
  - The mismatch region is the largest contour of the (1 - SSIM) map, named with
    a coarse grid label like "top-left".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2
import numpy as np

from .config import Config, DEFAULT


def clahe_normalize(bgr: np.ndarray, cfg: Config = DEFAULT) -> np.ndarray:
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=cfg.clahe_clip,
                            tileGridSize=(cfg.clahe_grid, cfg.clahe_grid))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


def ssim_map(a_gray: np.ndarray, b_gray: np.ndarray,
             cfg: Config = DEFAULT) -> tuple[float, np.ndarray]:
    """Return (mean_ssim, ssim_map in [0,1]) using Gaussian windows."""
    a = a_gray.astype(np.float64)
    b = b_gray.astype(np.float64)
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2
    win = (cfg.ssim_window, cfg.ssim_window)
    sig = cfg.ssim_sigma

    mu_a = cv2.GaussianBlur(a, win, sig)
    mu_b = cv2.GaussianBlur(b, win, sig)
    mu_a2, mu_b2, mu_ab = mu_a * mu_a, mu_b * mu_b, mu_a * mu_b
    sa = cv2.GaussianBlur(a * a, win, sig) - mu_a2
    sb = cv2.GaussianBlur(b * b, win, sig) - mu_b2
    sab = cv2.GaussianBlur(a * b, win, sig) - mu_ab

    num = (2 * mu_ab + C1) * (2 * sab + C2)
    den = (mu_a2 + mu_b2 + C1) * (sa + sb + C2)
    smap = num / den
    smap = np.clip(smap, 0.0, 1.0).astype(np.float32)
    return float(smap.mean()), smap


@dataclass
class Mismatch:
    bbox: Optional[tuple]   # (x, y, w, h) in ROI coords, or None
    region: str             # coarse name e.g. "top-left"
    area: int


def _coarse_name(cx: float, cy: float, w: int, h: int) -> str:
    row = "top" if cy < h / 3 else "bottom" if cy > 2 * h / 3 else "middle"
    col = "left" if cx < w / 3 else "right" if cx > 2 * w / 3 else "centre"
    return f"{row}-{col}"


def mismatch_region(smap: np.ndarray, cfg: Config = DEFAULT) -> Mismatch:
    """Largest connected area of low similarity -> bbox + coarse name."""
    h, w = smap.shape
    inv = (1.0 - smap)
    mask = (inv > (1.0 - cfg.tau_pass)).astype(np.uint8) * 255
    k = np.ones((cfg.morph_kernel, cfg.morph_kernel), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return Mismatch(None, "none", 0)
    c = max(contours, key=cv2.contourArea)
    x, y, bw, bh = cv2.boundingRect(c)
    cx, cy = x + bw / 2, y + bh / 2
    return Mismatch((int(x), int(y), int(bw), int(bh)),
                    _coarse_name(cx, cy, w, h), int(cv2.contourArea(c)))


def heatmap_overlay(bgr: np.ndarray, smap: np.ndarray, roi: tuple,
                    alpha: float = 0.5) -> np.ndarray:
    """Paint a red heatmap of low-similarity areas inside the ROI onto bgr."""
    x, y, w, h = roi
    out = bgr.copy()
    inv = np.clip((1.0 - smap) * 255, 0, 255).astype(np.uint8)
    inv = cv2.resize(inv, (w, h))
    heat = cv2.applyColorMap(inv, cv2.COLORMAP_JET)
    region = out[y:y + h, x:x + w]
    blended = cv2.addWeighted(region, 1 - alpha, heat, alpha, 0)
    # only blend where similarity is actually low, so good areas stay clean
    strong = (inv > 60)[:, :, None]
    out[y:y + h, x:x + w] = np.where(strong, blended, region)
    return out


def crop(gray_or_bgr: np.ndarray, roi: tuple) -> np.ndarray:
    x, y, w, h = roi
    return gray_or_bgr[y:y + h, x:x + w]
