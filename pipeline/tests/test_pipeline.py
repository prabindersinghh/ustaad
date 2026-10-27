"""Small, fast pytest checks on synthetic images.

  - identical crops -> SSIM ~1.0 -> PASS
  - an altered region -> low SSIM -> FAIL, with the mismatch in the right place
  - a shifted frame -> PASS again *after* alignment (homography recovers the shift)
  - the agent policy maps verdicts to the right tools
"""
from __future__ import annotations

import os
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from ustaad import (DEFAULT, ssim_map, mismatch_region, clahe_normalize, crop,
                    align, make_aruco_detector, warp, decide, Agent, Observation,
                    PASS, FAIL, UNSURE)

cv2_v = cv2.__version__


def _panel(shift=(0, 0), blob=None):
    """A textured panel with 4 ArUco markers at the corners (for alignment tests)."""
    img = np.full((240, 320, 3), 60, np.uint8)
    rng = np.random.RandomState(1)
    img = (img + rng.randint(0, 40, img.shape)).astype(np.uint8)
    cv2.rectangle(img, (40, 40), (120, 120), (200, 180, 90), -1)
    cv2.circle(img, (230, 150), 30, (90, 160, 210), -1)
    d = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    for i, (x, y) in enumerate([(8, 8), (284, 8), (8, 204), (284, 204)]):
        m = cv2.cvtColor(cv2.aruco.generateImageMarker(d, i, 28), cv2.COLOR_GRAY2BGR)
        img[y:y + 28, x:x + 28] = m
    if blob is not None:
        cv2.circle(img, blob, 22, (40, 40, 220), -1)   # a red intruder
    if shift != (0, 0):
        M = np.float32([[1, 0, shift[0]], [0, 1, shift[1]]])
        img = cv2.warpAffine(img, M, (320, 240), borderMode=cv2.BORDER_REPLICATE)
    return img


def test_opencv_is_5():
    assert cv2_v.startswith("5"), f"need OpenCV 5.x, got {cv2_v}"


def test_identical_passes():
    img = _panel()
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    score, _ = ssim_map(g, g, DEFAULT)
    assert score > 0.98
    assert decide(score, True, DEFAULT) == PASS


def test_altered_region_fails_in_right_place():
    ref = _panel()
    live = _panel(blob=(160, 60))   # intruder in the upper-middle
    roi = (0, 0, 320, 240)
    gr = cv2.cvtColor(clahe_normalize(ref), cv2.COLOR_BGR2GRAY)
    gl = cv2.cvtColor(clahe_normalize(live), cv2.COLOR_BGR2GRAY)
    score, smap = ssim_map(crop(gl, roi), crop(gr, roi), DEFAULT)
    assert score < DEFAULT.tau_fail, f"expected FAIL, got {score:.3f}"
    assert decide(score, True, DEFAULT) == FAIL
    mm = mismatch_region(smap, DEFAULT)
    assert mm.bbox is not None
    assert "top" in mm.region or "middle" in mm.region


def test_shifted_passes_after_alignment():
    ref = _panel()
    live = _panel(shift=(14, 9))     # same scene, camera nudged
    det = make_aruco_detector(DEFAULT)
    al = align(live, ref, det, DEFAULT)
    assert al.ok and al.H is not None, f"alignment failed (method={al.method})"
    warped = warp(live, al.H, ref.shape[:2])
    gr = cv2.cvtColor(clahe_normalize(ref), cv2.COLOR_BGR2GRAY)
    gw = cv2.cvtColor(clahe_normalize(warped), cv2.COLOR_BGR2GRAY)
    # compare an inner ROI to avoid warp border artefacts
    roi = (40, 40, 240, 160)
    score, _ = ssim_map(crop(gw, roi), crop(gr, roi), DEFAULT)
    assert score >= DEFAULT.tau_pass, f"expected PASS after align, got {score:.3f}"


def test_agent_policy_maps_verdicts_to_tools():
    agent = Agent(n_steps=2, cfg=DEFAULT)
    # step 1 passes -> verify_step, log_evidence, next_step
    agent.observe(Observation(1.0, 0.95, 40, "aruco", True, None, 5.0))
    tools = [e.tool for e in agent.trace]
    assert tools[:3] == ["verify_step", "log_evidence", "next_step"]
    assert agent.current == 1
    # step 2 fails -> stays on step 2 and flags the error
    agent.observe(Observation(2.0, 0.30, 30, "aruco", True, "top-left", 5.0))
    assert agent.current == 1
    assert agent.trace[-1].tool == "flag_error"


def test_unsure_when_alignment_fails():
    assert decide(None, False, DEFAULT) == UNSURE
    assert decide(0.9, False, DEFAULT) == UNSURE   # not aligned -> cannot trust score
