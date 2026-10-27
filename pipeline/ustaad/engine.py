"""Single source of truth for one verification step.

Both verify.py (offline/CLI) and the FastAPI service call verify_frame(), so the
decision logic exists exactly once: align -> warp -> CLAHE -> SSIM(ROI) ->
mismatch -> decide.
"""
from __future__ import annotations

import time

import cv2

from .align import align, warp
from .compare import clahe_normalize, ssim_map, mismatch_region, crop
from .agent import decide
from .config import Config, DEFAULT


def verify_frame(live_bgr, ref_bgr, roi, detector, cfg: Config = DEFAULT) -> dict:
    """Compare a live frame to a reference keyframe inside roi=(x,y,w,h)."""
    t0 = time.perf_counter()
    al = align(live_bgr, ref_bgr, detector, cfg)
    if not al.ok:
        return dict(score=None, smap=None, aligned=False, method=al.method,
                    inliers=al.inliers, region=None, decision="UNSURE",
                    latency_ms=(time.perf_counter() - t0) * 1000, warped=None)

    h, w = ref_bgr.shape[:2]
    warped = warp(live_bgr, al.H, (h, w))
    gw = cv2.cvtColor(clahe_normalize(warped, cfg), cv2.COLOR_BGR2GRAY)
    gr = cv2.cvtColor(clahe_normalize(ref_bgr, cfg), cv2.COLOR_BGR2GRAY)
    score, smap = ssim_map(crop(gw, roi), crop(gr, roi), cfg)
    mm = mismatch_region(smap, cfg)
    decision = decide(score, True, cfg)
    return dict(score=score, smap=smap, aligned=True, method=al.method,
                inliers=al.inliers, region=mm.region, decision=decision,
                mismatch=mm, latency_ms=(time.perf_counter() - t0) * 1000, warped=warped)
