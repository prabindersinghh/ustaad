"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Section, Panel, Caption, Reveal, Pending } from "./primitives";
import { asset } from "@/lib/demo";

const STAGES = [
  { key: "1_raw", name: "Raw frame", note: "Worker frame at the stable moment.", fn: "cv2.VideoCapture → cv2.resize" },
  { key: "2_matches", name: "Correspondences", note: "Markers / keypoints matched across the live and reference frames.", fn: "cv2.aruco.ArucoDetector · ORB + cv2.BFMatcher.knnMatch" },
  { key: "3_warped", name: "Aligned", note: "The live frame warped onto the reference geometry.", fn: "cv2.findHomography(RANSAC) → cv2.warpPerspective" },
  { key: "4_clahe", name: "Normalised", note: "Lighting drift removed before comparison.", fn: "cv2.createCLAHE on the LAB L-channel" },
  { key: "5_ssim", name: "SSIM map", note: "Structural similarity computed inside the ROI.", fn: "Gaussian-windowed SSIM via cv2.GaussianBlur" },
  { key: "6_mismatch", name: "Mismatch", note: "Largest low-similarity region, named coarsely.", fn: "cv2.threshold → cv2.findContours → cv2.boundingRect" },
  { key: "7_verdict", name: "Verdict", note: "Mean score against the dual thresholds.", fn: "score vs τ_fail=0.55 / τ_pass=0.78" },
];

export default function Fig3Decision() {
  const [tag, setTag] = useState<"fail" | "pass">("fail");
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setI((x) => (x + 1) % STAGES.length), 1600);
    return () => clearInterval(t);
  }, [auto]);

  useEffect(() => setMissing(false), [tag]);

  const src = asset(`evidence/stage_${tag}_${STAGES[i].key}.jpg`);

  return (
    <Section
      id="decision"
      num="§3"
      eyebrow="Fig. 3 — Inside a decision"
      title="Every verdict is a chain you can inspect."
      sub="Step through the real OpenCV stages for one decision, straight from the evidence folder. Each stage names the function that produced it."
    >
      <div className="mt-5"><span className="chip">Simulated scene</span></div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["fail", "pass"] as const).map((k) => (
            <button
              key={k}
              onClick={() => { setTag(k); setI(0); }}
              className={`px-4 py-2 font-mono text-[12.5px] ${tag === k ? "bg-ink text-paper" : "bg-paper text-ash hover:text-ink"}`}
            >
              {k === "fail" ? "a FAIL event" : "a PASS event"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAuto((a) => !a)}
          className="rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[12.5px] text-ash hover:text-ink"
        >
          {auto ? "❚❚ pause" : "▶ auto-play"}
        </button>
      </div>

      {missing ? (
        <NotRun />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <Panel pad={false} className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-ink">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={src}
                    src={src}
                    onError={() => setMissing(true)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="absolute inset-0 h-full w-full object-contain"
                    alt={STAGES[i].name}
                  />
                </AnimatePresence>
                <span className="absolute left-3 top-3 rounded bg-ink/85 px-2 py-1 font-mono text-[11px] text-paper">
                  {i + 1}/7 · {STAGES[i].name}
                </span>
              </div>
            </Panel>
            <Caption fig={`Fig. 3 — ${STAGES[i].name}`}>{STAGES[i].note}</Caption>
          </Reveal>

          <div className="space-y-2">
            {STAGES.map((s, idx) => (
              <button
                key={s.key}
                onClick={() => { setAuto(false); setI(idx); }}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  idx === i ? "border-yellow/70 bg-yellow/10" : "border-line bg-paper hover:border-ink/20"
                }`}
              >
                <span className="mt-0.5 font-mono text-[11px] text-ash">{idx + 1}</span>
                <span>
                  <span className="block text-[13.5px] font-medium text-ink">{s.name}</span>
                  <code className="block font-mono text-[11px] text-ash">{s.fn}</code>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

function NotRun() {
  return (
    <Panel className="mt-5">
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2"><span className="chip">Simulated scene</span><span className="chip">browser fallback</span></div>
        <p className="text-[14px] text-ash">The decision chain is previewed in simulation mode until <span className="font-mono">verify.py</span> publishes real stage images.</p>
        <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">{STAGES.map((s,i)=><div key={s.key} className={`rounded-lg border p-3 ${i === 6 ? "border-fail/50 bg-fail/5" : "border-line bg-bone"}`}><div className="font-mono text-[11px] text-ash">0{i+1}</div><div className="mt-1 text-[13px] font-medium text-ink">{s.name}</div><div className="mt-1 font-mono text-[10px] text-ash">{s.fn.split(" → ")[0]}</div></div>)}</div>
        <p className="text-[12px] text-ash">Run <span className="font-mono">bash pipeline/run_all.sh</span> on Linux to replace this preview with evidence images.</p>
      </div>
    </Panel>
  );
}
