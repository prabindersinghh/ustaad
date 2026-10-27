# USTAAD demo video script — 2:30

This demo uses a procedurally generated control-panel scene. The visuals are
labelled as simulated and synthetic wherever they appear.

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:20 | On camera. Cut between a factory floor, a checklist, and the USTAAD title. | “A large part of factory knowledge is tacit: it lives in an experienced worker’s hands, not in a machine-readable checklist. USTAAD turns one demonstration into a repeatable verification loop. The motivating scale is more than 3,000 orders executed.” |
| 0:20–0:35 | Fig. 1. Show the simulated expert video and the motion-energy chart. | “Here the source is explicitly simulated data: a top-down control panel with camera jitter, lighting drift, sensor noise, and ArUco corner markers.” |
| 0:35–1:00 | Fig. 1. Manual lines light up; keyframes and ROI boxes appear. | “USTAAD reads the five-line manual and watches one expert sequence. OpenCV 5 detects motion, finds stable moments, selects sharp keyframes, and records the region that changed for each step.” |
| 1:00–1:20 | Fig. 2. Start the worker replay and show the checklist. | “The worker replay is also synthetic. The agent compares each stable moment with the learned reference and keeps the current expected step explicit.” |
| 1:20–1:40 | Fig. 2. Pause on the valve FAIL, show the red region, then the corrected PASS and trace. | “On step three, the valve is left closed. The system catches the mismatch, flags its region, and stays on that step. After the correction, the same check passes and the trace advances. An unsure result is routed to human approval.” |
| 1:40–1:52 | Fig. 3. Raw frame and marker/keypoint matches. | “This is one decision opened up. First, the raw frame is aligned using ArUco markers, with ORB and RANSAC as the fallback.” |
| 1:52–2:05 | Fig. 3. Warp, CLAHE, SSIM map, mismatch contour, verdict. | “Then OpenCV warps the view, normalises lighting with CLAHE, computes Gaussian-window SSIM in the ROI, finds the mismatch contour, and applies the PASS, FAIL, or UNSURE thresholds.” |
| 2:05–2:20 | Architecture diagram and results card with the synthetic-data badge. | “The architecture is deliberately small: OpenCV 5 and the agent run in FastAPI on AWS, while S3 serves the static replay and CloudWatch receives logs. These results are from synthetic data, so they demonstrate the pipeline rather than factory accuracy.” |
| 2:20–2:30 | Responsible-use footer, then USTAAD mark. | “USTAAD supports workers; it does not surveil them. Use requires consent, task-focused evidence, and a human escalation path. Real-factory validation is the next step.” |
