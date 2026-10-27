"use client";

import { useEffect, useRef, useState } from "react";
import { Section, Panel, Caption, DecisionChip } from "./primitives";
import { Decision } from "@/lib/demo";
import {
  W, H, T_FAIL, T_PASS, MOTION_ON, MOTION_OFF, STABLE_MS, PanelState, newState,
  drawSim, simClick, toGray, equalize, ssimMap, worstRegion, motionEnergy, Roi,
} from "./panel";

const API = process.env.NEXT_PUBLIC_API_URL || "";

interface StepRec {
  name: string;
  gray: Float32Array;
  roi: Roi;
  thumb: string;
  status: Decision | "HUMAN" | null;
}

export default function LiveLab() {
  const viewRef = useRef<HTMLCanvasElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<"sim" | "cam">("sim");
  const [mode, setMode] = useState<"capture" | "verify">("capture");
  const [steps, setSteps] = useState<StepRec[]>([]);
  const [trace, setTrace] = useState<string[]>([]);
  const [meters, setMeters] = useState({ ssim: 0, motion: 0, stable: 0, moving: false });
  const [awaiting, setAwaiting] = useState(false);
  const [curStep, setCurStep] = useState(0);
  const traceRef = useRef<HTMLDivElement>(null);

  // mutable engine (avoid re-render per frame)
  const e = useRef<any>({
    sim: newState(), roi: { x: 48, y: 40, w: 224, h: 168 } as Roi,
    prevGray: null, moving: false, stableSince: 0, lastDecisionAt: 0,
    lastScore: null as number | null, diff: null as any, cur: 0, awaiting: false,
    steps: [] as StepRec[], mode: "capture", src: "sim", drag: null as any,
    video: null as HTMLVideoElement | null, stream: null as MediaStream | null,
  });

  const log = (msg: string) =>
    setTrace((t) => [...t.slice(-120), `${new Date().toLocaleTimeString([], { hour12: false })}  ${msg}`]);

  useEffect(() => {
    if (traceRef.current) traceRef.current.scrollTop = traceRef.current.scrollHeight;
  }, [trace]);

  // keep engine mirrors in sync with React state
  useEffect(() => { e.current.mode = mode; }, [mode]);
  useEffect(() => { e.current.src = src; }, [src]);
  useEffect(() => { e.current.steps = steps; }, [steps]);

  useEffect(() => {
    const view = viewRef.current!, ov = ovRef.current!;
    const vx = view.getContext("2d", { willReadFrequently: true })!;
    const ox = ov.getContext("2d")!;
    const eng = e.current;
    let raf = 0;

    const verify = async (g: Float32Array) => {
      const s = eng.steps[eng.cur] as StepRec;
      if (!s) return;
      const t0 = performance.now();
      let score: number, region: string | undefined, res: any = null;
      if (API) {
        try {
          const r = await callApi(vx, s);
          score = r.score; region = r.region;
        } catch {
          res = ssimMap(equalize(g, s.roi), equalize(s.gray, s.roi), s.roi.w, s.roi.h);
          score = res.score; region = worstRegion(res);
        }
      } else {
        res = ssimMap(equalize(g, s.roi), equalize(s.gray, s.roi), s.roi.w, s.roi.h);
        score = res.score; region = worstRegion(res);
      }
      const ms = (performance.now() - t0).toFixed(1);
      eng.lastScore = score;
      eng.diff = res && score < T_PASS ? { ...res, r: s.roi } : null;
      const d: Decision = score >= T_PASS ? "PASS" : score < T_FAIL ? "FAIL" : "UNSURE";
      log(`verify_step(${eng.cur + 1}) → ssim=${score.toFixed(3)} · ${ms}ms${API ? " · via /verify" : ""}`);
      setSteps((prev) => prev.map((x, i) => (i === eng.cur ? { ...x, status: d } : x)));
      if (d === "PASS") {
        log(`decision=PASS → log_evidence(${eng.cur + 1}) → next_step()`);
        eng.cur++; setCurStep(eng.cur); eng.diff = null; instruct();
      } else if (d === "FAIL") {
        log(`decision=FAIL → flag_error(region=${region})`);
      } else {
        log(`decision=UNSURE → request_human_approval()`);
        eng.awaiting = true; setAwaiting(true);
      }
    };

    const instruct = () => {
      if (eng.cur >= eng.steps.length) {
        log(`session.complete · evidence logged for ${eng.steps.length} steps`);
        return;
      }
      eng.roi = { ...eng.steps[eng.cur].roi };
      eng.stableSince = 0; eng.lastDecisionAt = performance.now();
    };
    eng._instruct = instruct;

    const frame = (t: number) => {
      if (eng.src === "sim") drawSim(vx, eng.sim, t);
      else if (eng.video && eng.video.readyState >= 2) vx.drawImage(eng.video, 0, 0, W, H);
      const g = toGray(vx.getImageData(0, 0, W, H));
      const m = motionEnergy(g, eng.prevGray);
      eng.prevGray = g;
      if (!eng.moving && m > MOTION_ON) { eng.moving = true; eng.stableSince = 0; }
      if (eng.moving && m < MOTION_OFF) { eng.moving = false; eng.stableSince = t; }
      const stableFor = !eng.moving && eng.stableSince ? t - eng.stableSince : 0;

      if (eng.mode === "verify" && eng.cur < eng.steps.length && !eng.awaiting &&
          eng.stableSince && stableFor > STABLE_MS && eng.stableSince > eng.lastDecisionAt) {
        eng.lastDecisionAt = t;
        verify(g);
      }

      // live score preview
      let live = 0;
      if (eng.mode === "verify" && eng.cur < eng.steps.length) {
        const s = eng.steps[eng.cur];
        live = ssimMap(equalize(g, s.roi), equalize(s.gray, s.roi), s.roi.w, s.roi.h).score;
      }
      setMeters({ ssim: live, motion: m, stable: eng.moving ? 0 : stableFor / STABLE_MS, moving: eng.moving });

      drawOverlay(ox, eng);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---- interactions ----
  const posOf = (ev: React.PointerEvent) => {
    const b = ovRef.current!.getBoundingClientRect();
    return { x: ((ev.clientX - b.left) / b.width) * W, y: ((ev.clientY - b.top) / b.height) * H };
  };
  const onDown = (ev: React.PointerEvent) => {
    const p = posOf(ev);
    e.current.drag = { x: p.x, y: p.y, moved: false };
  };
  const onMove = (ev: React.PointerEvent) => {
    const eng = e.current;
    if (!eng.drag || eng.mode !== "capture") return;
    const p = posOf(ev);
    if (Math.hypot(p.x - eng.drag.x, p.y - eng.drag.y) > 6) {
      eng.drag.moved = true;
      const x = Math.max(0, Math.min(eng.drag.x, p.x)), y = Math.max(0, Math.min(eng.drag.y, p.y));
      let w = Math.abs(p.x - eng.drag.x), h = Math.abs(p.y - eng.drag.y);
      w = Math.max(16, Math.floor(Math.min(w, W - x) / 8) * 8);
      h = Math.max(16, Math.floor(Math.min(h, H - y) / 8) * 8);
      eng.roi = { x: Math.floor(x), y: Math.floor(y), w, h };
    }
  };
  const onUp = (ev: React.PointerEvent) => {
    const eng = e.current;
    if (eng.drag && !eng.drag.moved && eng.src === "sim") simClick(eng.sim, posOf(ev).x, posOf(ev).y);
    eng.drag = null;
  };

  const capture = () => {
    const vx = viewRef.current!.getContext("2d", { willReadFrequently: true })!;
    const g = toGray(vx.getImageData(0, 0, W, H));
    const th = document.createElement("canvas"); th.width = 104; th.height = 78;
    th.getContext("2d")!.drawImage(viewRef.current!, 0, 0, 104, 78);
    const rec: StepRec = { name: `Step ${steps.length + 1}`, gray: g, roi: { ...e.current.roi }, thumb: th.toDataURL("image/jpeg", 0.7), status: null };
    setSteps((prev) => [...prev, rec]);
    log(`capture → keyframe #${steps.length + 1} stored · roi=${rec.roi.w}×${rec.roi.h}`);
  };

  const startVerify = () => {
    const eng = e.current;
    eng.cur = 0; setCurStep(0); eng.awaiting = false; setAwaiting(false);
    eng.lastScore = null; eng.diff = null;
    setSteps((prev) => prev.map((s) => ({ ...s, status: null })));
    if (!eng.steps.length) { log("capture steps first"); return; }
    log(`session.start · procedure loaded (${eng.steps.length} steps)`);
    eng._instruct();
  };

  const switchMode = (mo: "capture" | "verify") => {
    setMode(mo); e.current.mode = mo; setAwaiting(false); e.current.awaiting = false;
    e.current.lastScore = null; e.current.diff = null;
    if (mo === "verify") setTimeout(startVerify, 0);
  };

  const switchSrc = async (want: "sim" | "cam") => {
    const eng = e.current;
    if (want === "cam") {
      try {
        eng.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        const v = document.createElement("video"); v.srcObject = eng.stream; v.muted = true; (v as any).playsInline = true;
        await v.play(); eng.video = v; setSrc("cam"); eng.src = "cam"; log("source=webcam · 320×240 analysis");
      } catch { log("webcam unavailable — staying on simulated panel"); return; }
    } else {
      if (eng.stream) eng.stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      eng.stream = null; eng.video = null; setSrc("sim"); eng.src = "sim"; log("source=simulated panel");
    }
    eng.prevGray = null;
  };

  const reset = () => {
    const eng = e.current;
    eng.sim = newState(); eng.cur = 0; setCurStep(0); eng.lastScore = null; eng.diff = null;
    eng.awaiting = false; setAwaiting(false); eng.roi = { x: 48, y: 40, w: 224, h: 168 };
    setSteps([]); setTrace([]); switchMode("capture"); log("reset · procedure cleared");
  };

  const approve = (ok: boolean) => {
    const eng = e.current;
    if (!eng.awaiting) return;
    eng.awaiting = false; setAwaiting(false);
    if (ok) {
      log("human.approve → log_evidence → next_step()");
      setSteps((prev) => prev.map((s, i) => (i === eng.cur ? { ...s, status: "HUMAN" } : s)));
      eng.cur++; setCurStep(eng.cur); eng._instruct();
    } else {
      log("human.reject → flag_error(redo)");
      setSteps((prev) => prev.map((s, i) => (i === eng.cur ? { ...s, status: "FAIL" } : s)));
      eng.stableSince = 0; eng.lastDecisionAt = performance.now();
    }
  };

  const Seg = ({ val, opts, on }: { val: string; opts: [string, string][]; on: (v: any) => void }) => (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      {opts.map(([v, label]) => (
        <button key={v} onClick={() => on(v)} className={`px-3.5 py-2 font-mono text-[12.5px] ${val === v ? "bg-ink text-paper" : "bg-paper text-ash hover:text-ink"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <Section
      id="lab"
      num="§5"
      eyebrow="Fig. 5 — Live lab"
      title="Teach it a task. Then try to fool it."
      sub="Capture a few steps as the expert, switch to Verify, and repeat them as the worker. Do one step wrong and watch the agent catch it. Runs fully in your browser — nothing is uploaded."
    >
      <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Panel pad={false} className="overflow-hidden">
            <div className="relative aspect-[4/3] bg-black touch-none select-none">
              <canvas ref={viewRef} width={W} height={H} className="absolute inset-0 h-full w-full" />
              <canvas
                ref={ovRef} width={W} height={H}
                className="absolute inset-0 h-full w-full cursor-crosshair"
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
              />
              <span className="absolute left-3 top-3 chip">
                {API ? "API · /verify" : "in-browser fallback"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 border-t border-line p-3.5">
              <Seg val={src} opts={[["sim", "Simulated panel"], ["cam", "Webcam"]]} on={switchSrc} />
              <Seg val={mode} opts={[["capture", "1 · Capture"], ["verify", "2 · Verify"]]} on={switchMode} />
              <div className="flex-1" />
              <button onClick={reset} className="rounded-lg border border-line bg-paper px-3 py-2 text-[13px] text-ash hover:text-ink">Reset</button>
              {mode === "capture" ? (
                <button onClick={capture} className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper hover:bg-ink/85">Capture step</button>
              ) : (
                <button onClick={startVerify} className="rounded-lg bg-ink px-3.5 py-2 text-[13px] font-semibold text-paper hover:bg-ink/85">{src === "sim" ? "Reset & run" : "Restart run"}</button>
              )}
            </div>
          </Panel>
          <Caption fig="Fig. 5">
            {mode === "capture"
              ? "Capture: perform a step, drag on the image to set the ROI, then press Capture step."
              : "Verify: repeat each step; the agent verifies once the scene is still. Try one wrong."}
          </Caption>
        </div>

        <div className="space-y-4">
          <Panel>
            <div className="caption mb-3 flex items-center justify-between">
              <b>Procedure</b><span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="thin-scroll max-h-[200px] space-y-2 overflow-auto">
              {steps.length === 0 && <li className="caption">No steps captured yet.</li>}
              {steps.map((s, i) => (
                <li key={i} className={`flex items-center gap-2.5 rounded-lg border px-2 py-1.5 ${mode === "verify" && i === curStep ? "border-yellow/70" : "border-line"} bg-bone`}>
                  <img src={s.thumb} alt="" className="h-9 w-12 rounded object-cover" />
                  <span className="text-[13px] text-ink">{s.name}</span>
                  <span className="ml-auto">
                    {s.status === "PASS" ? <DecisionChip d="PASS" /> : s.status === "FAIL" ? <DecisionChip d="FAIL">RETRY</DecisionChip> : s.status === "HUMAN" ? <span className="chip">HUMAN ✓</span> : <span className="chip">—</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <div className="caption mb-3"><b>Verification</b></div>
            <Meter label="SSIM" v={meters.ssim} color={meters.ssim >= T_PASS ? "#16A34A" : meters.ssim < T_FAIL ? "#DC2626" : "#FFC400"} showThresholds />
            <Meter label="MOTION" v={Math.min(1, meters.motion * 25)} color="#FFC400" />
            <Meter label="STABLE" v={Math.min(1, meters.stable)} color="#16A34A" text={meters.moving ? "moving" : `${(meters.stable * (STABLE_MS / 1000)).toFixed(1)}s`} />
          </Panel>

          <Panel>
            <div className="caption mb-2"><b>Agent trace</b></div>
            <div ref={traceRef} className="thin-scroll h-[150px] overflow-auto rounded-lg border border-line bg-bone p-2.5">
              {trace.length === 0 && <div className="caption">Trace appears here…</div>}
              {trace.map((l, i) => <div key={i} className="trace-line text-ash">{l}</div>)}
            </div>
            {awaiting && (
              <div className="mt-2.5 flex gap-2">
                <button onClick={() => approve(true)} className="flex-1 rounded-lg border border-pass/50 bg-pass/5 px-3 py-2 text-[13px] font-semibold text-pass">Approve step</button>
                <button onClick={() => approve(false)} className="flex-1 rounded-lg border border-fail/50 bg-fail/5 px-3 py-2 text-[13px] font-semibold text-fail">Reject — redo</button>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function Meter({ label, v, color, text, showThresholds }: { label: string; v: number; color: string; text?: string; showThresholds?: boolean }) {
  return (
    <div className="mb-2 grid grid-cols-[52px_1fr_44px] items-center gap-2.5 font-mono text-[11px] text-ash">
      <span>{label}</span>
      <div className="relative h-[7px] overflow-hidden rounded-full bg-bone">
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
        {showThresholds && <><span className="absolute inset-y-[-2px] w-0.5 bg-ash/40" style={{ left: `${T_FAIL * 100}%` }} /><span className="absolute inset-y-[-2px] w-0.5 bg-ash/40" style={{ left: `${T_PASS * 100}%` }} /></>}
      </div>
      <span className="text-right text-ink">{text ?? v.toFixed(2)}</span>
    </div>
  );
}

async function callApi(vx: CanvasRenderingContext2D, s: StepRec): Promise<{ score: number; region: string }> {
  // send the current frame + ROI + an inline reference crop so /verify is stateless
  const frame = vx.canvas.toDataURL("image/jpeg", 0.8);
  const refCanvas = document.createElement("canvas"); refCanvas.width = W; refCanvas.height = H;
  const rc = refCanvas.getContext("2d")!;
  const img = rc.createImageData(W, H);
  for (let j = 0, k = 0; j < s.gray.length; j++, k += 4) { const g = s.gray[j]; img.data[k] = img.data[k + 1] = img.data[k + 2] = g; img.data[k + 3] = 255; }
  rc.putImageData(img, 0, 0);
  const r = await fetch(`${API}/verify`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frame, reference: refCanvas.toDataURL("image/jpeg", 0.8), roi: [s.roi.x, s.roi.y, s.roi.w, s.roi.h] }),
  });
  if (!r.ok) throw new Error("verify failed");
  const j = await r.json();
  return { score: j.score, region: j.region ?? "" };
}

function drawOverlay(ox: CanvasRenderingContext2D, eng: any) {
  ox.clearRect(0, 0, W, H);
  if (eng.diff && eng.mode === "verify") {
    const { map, bw, B, r } = eng.diff;
    for (let i = 0; i < map.length; i++) {
      if (map[i] < 0.6) { ox.fillStyle = `rgba(220,38,38,${Math.min(0.5, (0.6 - map[i]) * 1.2)})`; ox.fillRect(r.x + (i % bw) * B, r.y + Math.floor(i / bw) * B, B, B); }
    }
  }
  const roi = eng.roi;
  const col = eng.mode === "capture" ? "#FFC400" : eng.lastScore == null ? "#2563EB" : eng.lastScore >= T_PASS ? "#16A34A" : eng.lastScore < T_FAIL ? "#DC2626" : "#FFC400";
  ox.strokeStyle = col; ox.lineWidth = 1.5; ox.setLineDash([5, 4]);
  ox.strokeRect(roi.x + 0.5, roi.y + 0.5, roi.w, roi.h); ox.setLineDash([]);
  ox.fillStyle = col; ox.font = "600 9px monospace"; ox.fillText("ROI", roi.x + 3, roi.y - 4);
}
