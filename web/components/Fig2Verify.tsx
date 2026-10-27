"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Section, Panel, Caption, Reveal, Pending, DecisionChip } from "./primitives";
import { Session, TraceEvent, Decision, useDemoJSON, asset } from "@/lib/demo";

const TOOL_COLOR: Record<string, string> = {
  verify_step: "text-info",
  next_step: "text-pass",
  flag_error: "text-fail",
  request_human_approval: "text-[#B45309]",
  log_evidence: "text-ash",
};

export default function Fig2Verify() {
  const { data: sess, loaded } = useDemoJSON<Session>("session.json");
  const videoRef = useRef<HTMLVideoElement>(null);
  const traceRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      setT(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sess]);

  const shown = useMemo(
    () => (sess ? sess.trace.filter((e) => e.t_video <= t + 0.001) : []),
    [sess, t]
  );

  useEffect(() => {
    if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight;
  }, [shown.length]);

  // per-step status from decisions seen so far
  const status = useMemo(() => {
    const m: Record<number, Decision> = {};
    if (sess) for (const e of shown) if (e.tool === "verify_step") m[e.step] = e.decision as Decision;
    return m;
  }, [sess, shown]);

  const lastTool = shown.length ? shown[shown.length - 1].tool : null;
  const phase =
    lastTool === "verify_step" ? 0 : lastTool && lastTool !== "verify_step" ? (lastTool.includes("human") || lastTool === "flag_error" || lastTool === "next_step" || lastTool === "log_evidence" ? 2 : 1) : -1;

  return (
    <Section
      id="verify"
      num="§2"
      eyebrow="Fig. 2 — Verify"
      title="It executes and verifies — live."
      sub="The worker's video drives the agent. Each stable moment is aligned, scored, and turned into a tool call. The trace below streams in sync; watch step 3 fail, flag its region, and pass once corrected."
    >
      <div className="mt-5"><span className="chip">Simulated scene</span></div>
      {loaded && !sess ? (
        <NotRun />
      ) : (
        <>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <Reveal>
              <Panel pad={false} className="overflow-hidden">
                <div className="relative aspect-[4/3] bg-ink">
                  <video
                    ref={videoRef}
                    src={sess ? asset(sess.annotated_video) : undefined}
                    className="absolute inset-0 h-full w-full object-contain"
                    muted
                    loop
                    autoPlay
                    playsInline
                    controls
                  />
                </div>
              </Panel>
              <Caption fig="Fig. 2a">
                <span className="font-mono">worker_annotated.mp4</span> — ROI box, live SSIM, the
                PASS/FAIL/UNSURE banner and a red mismatch heatmap, all burned in by{" "}
                <span className="font-mono">verify.py</span>.
              </Caption>
            </Reveal>

            <div className="space-y-5">
              <Reveal delay={0.05}>
                <Panel>
                  <div className="caption mb-3"><b>Procedure checklist</b></div>
                  <ul className="space-y-1.5">
                    {sess?.step_names.map((name, i) => {
                      const st = status[i + 1];
                      return (
                        <li
                          key={i}
                          className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                            st === "FAIL"
                              ? "border-fail/50 bg-fail/5"
                              : st === "PASS"
                              ? "border-pass/40 bg-pass/5"
                              : "border-line bg-bone"
                          }`}
                        >
                          <span className="font-mono text-[11px] text-ash">{String(i + 1).padStart(2, "0")}</span>
                          <span className="text-ink">{name}</span>
                          <span className="ml-auto">{st ? <DecisionChip d={st} /> : <span className="chip">queued</span>}</span>
                        </li>
                      );
                    })}
                  </ul>
                </Panel>
              </Reveal>

              <Reveal delay={0.1}>
                <Panel>
                  <div className="caption mb-2 flex items-center justify-between">
                    <span><b>Agent trace</b></span>
                    <span className="font-mono text-[11px]">
                      median {sess?.timings.median_latency_ms ?? "—"} ms
                    </span>
                  </div>
                  <div ref={traceRef} className="thin-scroll h-[190px] overflow-auto rounded-lg border border-line bg-bone p-3">
                    {shown.length === 0 && <div className="caption">Trace streams as the video plays…</div>}
                    {shown.map((e, i) => (
                      <TraceRow key={i} e={e} />
                    ))}
                  </div>
                </Panel>
              </Reveal>
            </div>
          </div>

          <Reveal delay={0.1}>
            <Panel className="mt-5">
              <div className="caption mb-3"><b>Agent loop</b> — the active node lights on each trace event</div>
              <AgentLoop phase={phase} />
            </Panel>
          </Reveal>
        </>
      )}
    </Section>
  );
}

function TraceRow({ e }: { e: TraceEvent }) {
  const c = TOOL_COLOR[e.tool] ?? "text-ink";
  const score = e.score == null ? "" : ` ssim=${e.score.toFixed(3)}`;
  const region = e.region ? ` @${e.region}` : "";
  return (
    <div className="trace-line">
      <span className="text-ash">{e.t_video.toFixed(1)}s</span>{" "}
      <span className="text-ash">s{e.step}</span>{" "}
      <span className={c}>{e.tool}</span>
      <span className="text-ash">{score}</span>
      <span className="text-fail">{region}</span>{" "}
      <span className="text-ash">[{e.align_method}·{e.inliers}inl·{e.latency_ms}ms]</span>
    </div>
  );
}

function AgentLoop({ phase }: { phase: number }) {
  const nodes = [
    { label: "perceive", sub: "align · score" },
    { label: "decide", sub: "τ thresholds" },
    { label: "act", sub: "tool call · log" },
  ];
  return (
    <div className="flex items-center justify-center gap-3 md:gap-6">
      {nodes.map((n, i) => (
        <div key={n.label} className="flex items-center gap-3 md:gap-6">
          <motion.div
            animate={{
              borderColor: phase === i ? "#FFC400" : "#e6e4dc",
              backgroundColor: phase === i ? "#fffdf4" : "#ffffff",
            }}
            className="rounded-lg border px-4 py-3 text-center"
          >
            <div className="text-[14px] font-semibold text-ink">{n.label}</div>
            <div className="font-mono text-[10.5px] text-ash">{n.sub}</div>
          </motion.div>
          {i < nodes.length - 1 && <span className="text-ash">→</span>}
        </div>
      ))}
    </div>
  );
}

function NotRun() {
  return (
    <Panel className="mt-8">
      <div className="flex flex-col items-start gap-3">
        <div className="flex flex-wrap gap-2"><span className="chip">Simulated scene</span><span className="chip">browser fallback</span></div>
        <p className="text-[14px] text-ash">The landing page demonstrates the agent loop immediately, even before generated video and JSON are published.</p>
        <div className="grid w-full gap-4 md:grid-cols-[1fr_1.2fr]"><div className="rounded-lg border border-line bg-ink p-4 text-paper"><div className="mb-3 font-mono text-[11px] text-paper/60">WORKER_REPLAY · synthetic</div><div className="relative h-32 rounded bg-[#3d464c]"><motion.div className="absolute h-10 w-16 rounded-full bg-black/70" animate={{left:["12%","55%","72%"],top:["65%","35%","65%"]}} transition={{duration:3,repeat:Infinity}}/><div className="absolute bottom-2 left-2 rounded bg-fail px-2 py-1 font-mono text-[11px]">FAIL · valve region</div></div></div><div className="rounded-lg border border-line bg-bone p-4 font-mono text-[12px]"><div className="mb-2 text-ash">agent trace · simulated</div>{["verify_step s1 PASS","next_step s2","verify_step s3 FAIL @valve","flag_error @valve","verify_step s3 PASS","next_step s4"].map((x,i)=><div key={x+i} className={`border-b border-line py-1 ${x.includes("FAIL")?"text-fail":x.includes("PASS")?"text-pass":"text-ink"}`}>{String(i).padStart(2,"0")} · {x}</div>)}</div></div>
        <p className="text-[12px] text-ash">Generated <span className="font-mono">session.json</span> and annotated media replace this replay after <span className="font-mono">run_all.sh</span>.</p>
      </div>
    </Panel>
  );
}
