# USTAAD — Technical Report

*OpenCV AI Competition 2026 · OpenCV 5 + AWS*

Evaluation uses a procedurally generated scene; real-factory validation is the next step.

## 1. Problem

Physical procedures — assembling a part, configuring a control panel, following a
safety checklist — are today verified by a person watching, or not verified at
all. Writing a machine-checkable SOP is expensive and brittle, and training a
model per task needs labelled data nobody has on day one.

USTAAD removes that cost: it learns a checkable procedure from **one** expert
demonstration plus a one-line-per-step manual, then verifies any worker against
it. No per-task training, no hand-authored checklist.

## 2. Users

- **Line operators / trainees** — get one instruction at a time and immediate,
  grounded feedback ("the valve area does not match"), not a pass/fail score of
  themselves.
- **Supervisors** — get a timestamped photo, score and decision for every step of
  every session, and are called in only when the system is genuinely unsure.
- **Process owners** — update the procedure by re-recording once.

## 3. OpenCV 5 pipeline

Everything runs on `opencv-contrib-python-headless==5.0.0.93` (startup asserts
`cv2.__version__` begins with `5`). The logic lives once in the `ustaad` package
and is shared by the CLIs, the API and — mirrored in TypeScript — the browser.

### learn.py — expert.mp4 + manual.txt → procedure.json
1. Sample at 10 fps, downscale to 640 px wide.
2. **Motion energy** per frame: `cv2.absdiff` → `cv2.threshold` → count changed
   pixels, smoothed with a moving average.
3. **Hysteresis segmentation**: an action is motion above a high threshold; a step
   ends when motion stays below a low threshold for ≥ 1.0 s. The **keyframe** is the
   sharpest frame in the stable window by **Laplacian variance**.
4. **ROI** per step: the bounding box of the largest changed region between
   consecutive keyframes (`absdiff` → morphology → `findContours`), padded 15 %.
5. Detected steps are mapped to manual lines in order; on a count mismatch the N
   strongest-motion segments are kept (N = manual line count) and a warning logged.
6. Per keyframe we store **ArUco** corners (DICT_4X4_50) and **ORB** descriptors.

### verify.py — worker.mp4 + procedure.json → session.json + annotated video
At each worker stable moment, against the current expected step:
1. **Align** to the reference keyframe — an **ArUco homography** when ≥ 3 markers are
   shared, otherwise **ORB(1500) + BFMatcher + Lowe 0.75 + RANSAC `findHomography`**.
   Fewer than 15 inliers → **UNSURE** (alignment failed).
2. `warpPerspective`, then **CLAHE** on the LAB **L** channel to kill lighting drift.
3. **Gaussian-window SSIM** inside the ROI (built from `cv2.GaussianBlur`), giving a
   mean score and a map.
4. **Mismatch region**: threshold `1 − SSIM` → `findContours` → largest bbox + a
   coarse name (e.g. "top-left").
5. **Decide** with `τ_fail = 0.55`, `τ_pass = 0.78` (configurable in `config.py`).

Outputs: `session.json` (trace, per-step results, timings), `evidence/*.jpg`
(aligned frame + overlay per decision), and `worker_annotated.mp4` (H.264) with
the ROI box, live score, PASS/FAIL/UNSURE banner and a red mismatch heatmap.
`verify.py` also saves the seven pipeline-stage images for one PASS and one FAIL
(raw → matches → warped → CLAHE → SSIM map → mismatch → verdict) for Fig. 3.

## 4. Agent

A deterministic state machine (`ustaad/agent.py`) whose tools are
`verify_step`, `next_step`, `flag_error(region)`, `request_human_approval` and
`log_evidence`. **The vision verdict selects the next tool** — this is the agentic
core, not post-hoc reporting:

- **PASS** → `log_evidence` → `next_step`.
- **FAIL** → `flag_error(region)`, stay on the step, re-verify at the next stable moment.
- **UNSURE** → `request_human_approval`; offline the run records "awaiting human" and
  continues so the session completes (a live deployment blocks for the human).

Every call appends a trace row:
`{t_video, step, tool, score, inliers, align_method, latency_ms, decision, region}`.

### One real trace excerpt

<!-- RUN_ALL_FILLS_THIS: paste 6–10 lines from out/session.json "trace" after bash pipeline/run_all.sh -->
*Pending the first `bash pipeline/run_all.sh`; this section is filled from the real
`out/session.json` trace — numbers are never invented. The synthetic run produces
a PASS/PASS/FAIL/PASS/PASS/PASS sequence as the worker gets step 3 wrong and then
corrects it.*

## 5. AWS

A single **EC2 t3.small** runs the Docker container (FastAPI + OpenCV 5) behind
**Caddy** for automatic HTTPS. An **IAM role scoped to one S3 bucket** lets the
service write session outputs; the **Next.js static export** is served from the
same bucket's website hosting. Container logs reach **CloudWatch** through the
Docker `awslogs` driver. No DynamoDB, no Terraform. The API exposes
`GET /health` (returns the cv2 version), `POST /verify` (one frame vs a reference
step) and `POST /process` (learn+verify on uploaded videos → S3). Full
copy-paste commands and the IAM policy JSON are in `infra/DEPLOY.md`.

## 6. Evaluation

`eval.py` runs verification on every worker stable moment and compares the verdict
to `data/labels.csv` (the synthetic set is labelled automatically). It reports
recall on wrong steps, false-alarm rate, precision, uncertain rate, median latency
and the failure cases, and writes `out/results.json` with a `synthetic` flag.

<!-- RUN_ALL_FILLS_THIS: paste the metrics block from out/results.json -->
*Pending the first run; the landing page's Results section and this table are both
read from the same `out/results.json`, so they never disagree and are never
hardcoded.*

| Metric | Value |
|--------|-------|
| Wrong steps caught (recall) | _from results.json_ |
| False-alarm rate | _from results.json_ |
| Precision | _from results.json_ |
| Uncertain rate | _from results.json_ |
| Median latency / step | _from results.json_ |
| Dataset | `synthetic: true/false` |

## 7. Limitations

- Classical vision assumes a reasonably fixed camera and visible markers; large
  post-capture camera moves or heavy occlusion degrade alignment and are routed to
  the uncertain band rather than guessed.
- SSIM compares appearance, not semantics — a result that looks right but is
  functionally wrong (e.g. a correctly-positioned but faulty part) is out of scope.
- The synthetic set validates the plumbing and the decision logic; real-world
  numbers require a real recording, which the pipeline accepts with no code change.
- Thresholds (`τ_fail`, `τ_pass`) are global; per-step tuning would help borderline
  steps.

## 8. Responsible use

USTAAD supports workers, it does not surveil them: it verifies the **task**, never
scores the **person**. The physical result is checked, not a self-reported
checkbox. Deployments require worker consent, evidence is retained for audit and
correction rather than ranking, and every uncertain result escalates to a human —
the system never decides silently.
