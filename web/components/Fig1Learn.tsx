"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Section, Panel, Caption, Reveal, Pending } from "./primitives";
import { Procedure, useDemoJSON, asset } from "@/lib/demo";

export default function Fig1Learn() {
  const { data: proc, loaded } = useDemoJSON<Procedure>("procedure.json");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      setT(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const onMeta = () => setDur(v.duration || 0);
    v.addEventListener("loadedmetadata", onMeta);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [proc]);

  const maxT = proc ? Math.max(...proc.times, dur || 1) : 1;
  const detected = proc ? proc.steps.filter((s) => t >= s.t_keyframe - 0.05).length : 0;

  return (
    <Section
      id="learn"
      num="§1"
      eyebrow="Fig. 1 — Learn"
      title="It reads the manual and watches the expert."
      sub="One demonstration is sampled at 10 fps. Motion energy with hysteresis finds where each action ends; the sharpest stable frame becomes a keyframe, and the region that changed becomes the ROI to check."
    >
      <div className="mt-5"><span className="chip">Simulated scene</span></div>
      {loaded && !proc ? (
        <NotRun />
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <Panel pad={false} className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-ink">
                <video
                  ref={videoRef}
                  src={proc ? asset("expert.mp4") : undefined}
                  className="absolute inset-0 h-full w-full object-contain"
                  muted
                  loop
                  autoPlay
                  playsInline
                  controls
                />
              </div>
              <div className="border-t border-line p-4">
                <MotionChart proc={proc} t={t} maxT={maxT} />
              </div>
            </Panel>
            <Caption fig="Fig. 1a">
              Motion-energy curve from <span className="font-mono">absdiff → threshold → count</span>.
              Shaded bands are detected action→stable segments; the playhead tracks the video.
            </Caption>
          </Reveal>

          <div className="space-y-5">
            <Reveal delay={0.05}>
              <Panel>
                <div className="caption mb-3">
                  <b>Manual</b> — {proc ? `${proc.n_steps} steps detected` : "loading…"}
                </div>
                <ol className="space-y-2">
                  {proc ? (
                    proc.steps.map((s, i) => {
                      const on = i < detected;
                      return (
                        <li
                          key={s.index}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[13.5px] transition-colors ${
                            on ? "border-yellow/70 bg-yellow/10" : "border-line bg-bone"
                          }`}
                        >
                          <span className="font-mono text-[11px] text-ash">{String(i + 1).padStart(2, "0")}</span>
                          <span className={on ? "text-ink" : "text-ash"}>{s.name}</span>
                          {on && <span className="ml-auto font-mono text-[10.5px] text-ash">t={s.t_keyframe}s</span>}
                        </li>
                      );
                    })
                  ) : (
                    <li className="caption">Pending — run run_all.sh.</li>
                  )}
                </ol>
              </Panel>
            </Reveal>

            <Reveal delay={0.1}>
              <Panel>
                <div className="caption mb-3"><b>Keyframes</b> — sharpest frame + ROI per step</div>
                <div className="grid grid-cols-3 gap-2.5">
                  <AnimatePresence>
                    {proc?.steps.slice(0, detected).map((s) => (
                      <motion.div
                        key={s.index}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35 }}
                        className="relative overflow-hidden rounded-md border border-line"
                      >
                        <img src={asset(s.keyframe)} alt={s.name} className="block aspect-[4/3] w-full object-cover" />
                        <RoiBox roi={s.roi} frame={proc.frame_size} />
                        <span className="absolute left-1 top-1 rounded bg-ink/80 px-1 py-0.5 font-mono text-[9px] text-paper">
                          {s.index}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {detected === 0 && <div className="caption col-span-3">Thumbnails appear as steps are detected…</div>}
                </div>
              </Panel>
            </Reveal>
          </div>
        </div>
      )}
      {proc && (
        <Caption fig="Fig. 1b">
          One demonstration → <b>{proc.n_steps} verifiable steps</b> in{" "}
          {proc.steps.length ? proc.steps[proc.steps.length - 1].t_end.toFixed(1) : "—"} s of video.
        </Caption>
      )}
    </Section>
  );
}

function RoiBox({ roi, frame }: { roi: number[]; frame: [number, number] }) {
  const [x, y, w, h] = roi;
  const [fw, fh] = frame;
  return (
    <div
      className="absolute border-[1.5px] border-yellow"
      style={{
        left: `${(x / fw) * 100}%`,
        top: `${(y / fh) * 100}%`,
        width: `${(w / fw) * 100}%`,
        height: `${(h / fh) * 100}%`,
      }}
    />
  );
}

function MotionChart({ proc, t, maxT }: { proc: Procedure | null; t: number; maxT: number }) {
  const Wc = 520,
    Hc = 90;
  if (!proc) return <div className="caption">Motion curve pending…</div>;
  const curve = proc.motion_curve;
  const times = proc.times;
  const maxM = Math.max(...curve, 0.001);
  const pts = curve
    .map((m, i) => `${(times[i] / maxT) * Wc},${Hc - (m / maxM) * (Hc - 10) - 4}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${Wc} ${Hc}`} className="w-full" preserveAspectRatio="none">
      {/* shaded segments */}
      {proc.segments.map((s, i) => (
        <rect
          key={i}
          x={(s.t_start / maxT) * Wc}
          width={((s.t_end - s.t_start) / maxT) * Wc}
          y={0}
          height={Hc}
          fill="#FFC400"
          opacity={0.14}
        />
      ))}
      <polyline points={pts} fill="none" stroke="#2563EB" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {/* playhead */}
      <line
        x1={(t / maxT) * Wc}
        x2={(t / maxT) * Wc}
        y1={0}
        y2={Hc}
        stroke="#111418"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function NotRun() {
  return (
    <Panel className="mt-8">
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2"><span className="chip">Simulated scene</span><span className="chip">browser fallback</span></div>
        <p className="text-[14px] text-ash">A self-contained replay is shown until the Linux pipeline publishes generated media.</p>
        <div className="grid w-full gap-4 md:grid-cols-[1.2fr_1fr]">
          <div className="rounded-lg border border-line bg-ink p-4 text-paper"><div className="mb-3 flex justify-between font-mono text-[11px] text-paper/60"><span>EXPERT_SIMULATION</span><span className="text-yellow">● replay</span></div><div className="relative h-40 rounded bg-[#3d464c]"><div className="absolute inset-4 rounded border border-paper/20"/><motion.div className="absolute h-10 w-16 rounded-full bg-black/70" animate={{left:["18%","58%","35%"],top:["70%","35%","66%"]}} transition={{duration:4,repeat:Infinity}}/><div className="absolute bottom-2 left-2 rounded bg-yellow px-2 py-1 font-mono text-[11px] text-ink">LEARNING · step 3/5</div></div><div className="mt-3 h-2 rounded bg-paper/10"><div className="h-full w-2/3 bg-blue/60"/></div></div>
          <div className="rounded-lg border border-line bg-bone p-4"><div className="caption mb-3"><b>Manual parsed</b> · 5 steps</div><ol className="space-y-2 font-mono text-[12px] text-ash">{["Switch S1 ON","Set speed knob to 2","Open valve","Switch S3 ON","Confirm READY lamp"].map((s,i)=><li key={s} className="flex gap-2"><span className="text-yellow">0{i+1}</span><span className={i === 2 ? "text-ink" : ""}>{s}</span>{i < 3 && <span className="ml-auto text-pass">✓</span>}</li>)}</ol><div className="mt-4 text-[12px] text-ash">Motion → stable hold → keyframe → ROI</div></div>
        </div>
        <p className="text-[12px] text-ash">Generated evidence replaces this fallback after <span className="font-mono">bash pipeline/run_all.sh</span>.</p>
      </div>
    </Panel>
  );
}
