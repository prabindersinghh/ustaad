"use client";

import { useEffect, useRef, useState } from "react";
import { Section, Panel, Caption, DecisionChip } from "./primitives";
import { Decision } from "@/lib/demo";
import {
  W, H, T_FAIL, T_PASS, PanelState, newState, drawSim, toGray, equalize, ssimMap,
  worstRegion, Roi,
} from "./panel";

const STEP_NAMES = [
  "Raise power switch S1",
  "Set the speed dial",
  "Open the feed valve",
  "Engage interlock S3",
  "Confirm the READY lamp",
];
// control targets (where the agent hand clicks) and the ROI checked per step
const TARGET: [number, number][] = [[75, 80], [228, 82], [180, 165], [147, 80], [84, 160]];
const S4: [number, number] = [181, 80];
const ROIS: Roi[] = [
  { x: 60, y: 52, w: 32, h: 56 },
  { x: 200, y: 54, w: 56, h: 56 },
  { x: 118, y: 138, w: 124, h: 54 },
  { x: 128, y: 52, w: 32, h: 56 },
  { x: 66, y: 142, w: 38, h: 38 },
];
function act(s: PanelState, i: number) {
  if (i === 0) s.switches[0] ^= 1;
  else if (i === 1) s.knob = (s.knob + 1) % 4;
  else if (i === 2) s.valve ^= 1;
  else if (i === 3) s.switches[2] ^= 1;
  else if (i === 4) s.lamp ^= 1;
}

type Beat =
  | { t: "move"; to: [number, number]; dur: number }
  | { t: "click"; apply: (s: PanelState) => void; dur: number }
  | { t: "settle"; dur: number }
  | { t: "verify"; step: number; dur: number };

interface Expert {
  gray: Float32Array;
  roi: Roi;
}

export default function Fig4Simulation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mistake, setMistake] = useState(true);
  const [runId, setRunId] = useState(0);
  const [decisions, setDecisions] = useState<{ step: number; d: Decision; score: number; region?: string }[]>([]);
  const [running, setRunning] = useState(true);
  const engine = useRef<any>({});

  // run / re-run whenever the mistake toggle flips
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const work = document.createElement("canvas");
    work.width = W; work.height = H;
    const wx = work.getContext("2d", { willReadFrequently: true })!;

    // ---- build expert references by performing each step once ----
    const exp: Expert[] = [];
    const es = newState();
    for (let i = 0; i < STEP_NAMES.length; i++) {
      act(es, i);
      drawSim(wx, es, 0);
      exp.push({ gray: toGray(wx.getImageData(0, 0, W, H)), roi: ROIS[i] });
    }

    // ---- worker timeline ----
    const beats: Beat[] = [];
    const push = (b: Beat) => beats.push(b);
    for (let i = 0; i < STEP_NAMES.length; i++) {
      if (mistake && i === 2) {
        push({ t: "move", to: S4, dur: 700 });
        push({ t: "click", apply: (s) => (s.switches[3] ^= 1), dur: 200 }); // wrong control
        push({ t: "settle", dur: 500 });
        push({ t: "verify", step: 2, dur: 900 });
        push({ t: "move", to: TARGET[2], dur: 700 });
        push({ t: "click", apply: (s) => act(s, 2), dur: 200 }); // correction
        push({ t: "settle", dur: 500 });
        push({ t: "verify", step: 2, dur: 900 });
      } else {
        push({ t: "move", to: TARGET[i], dur: 700 });
        push({ t: "click", apply: (s) => act(s, i), dur: 200 });
        push({ t: "settle", dur: 500 });
        push({ t: "verify", step: i, dur: 900 });
      }
    }

    const eng = engine.current;
    eng.state = newState();
    eng.hand = { x: W / 2, y: H + 40 };
    eng.beats = beats;
    eng.bi = 0;
    eng.phaseStart = performance.now();
    eng.from = { ...eng.hand };
    eng.flash = null;
    eng.diff = null;
    setDecisions([]);
    setRunning(true);

    let raf = 0;
    const loop = (now: number) => {
      const b: Beat | undefined = eng.beats[eng.bi];
      if (!b) {
        drawSim(ctx, eng.state, now, eng.hand);
        drawOverlay(ctx, eng);
        setRunning(false);
        return; // finished; leave final frame
      }
      const p = Math.min(1, (now - eng.phaseStart) / b.dur);

      if (b.t === "move") {
        eng.hand = {
          x: eng.from.x + (b.to[0] - eng.from.x) * easeInOut(p),
          y: eng.from.y + (b.to[1] - eng.from.y) * easeInOut(p),
        };
      } else if (b.t === "click" && p >= 1 && !eng._clicked) {
        b.apply(eng.state);
        eng._clicked = true;
      } else if (b.t === "verify" && p >= 1 && !eng._verified) {
        runVerify(wx, eng, exp, b.step, setDecisions);
        eng._verified = true;
      }

      drawSim(ctx, eng.state, now, eng.hand);
      drawOverlay(ctx, eng);

      if (p >= 1) {
        eng.bi++;
        eng.phaseStart = now;
        eng.from = { ...eng.hand };
        eng._clicked = false;
        eng._verified = false;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mistake, runId]);

  return (
    <Section
      id="simulation"
      num="§4"
      eyebrow="Fig. 4 — Simulation replay"
      title="The learned procedure, replayed step by step."
      sub="A staged visualisation: a ghost agent-hand performs the learned procedure on the simulated panel, with the same decision logic as the real pipeline. Introduce a mistake to watch a FAIL get caught."
    >
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setMistake((m) => !m)}
          className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors ${
            mistake ? "border-fail/50 bg-fail/5 text-fail" : "border-line bg-paper text-ink hover:border-ink/30"
          }`}
        >
          {mistake ? "Mistake on step 3 · on" : "Introduce a mistake"}
        </button>
        <button
          onClick={() => setRunId((r) => r + 1)}
          className="rounded-lg border border-line bg-paper px-4 py-2 text-[13px] text-ash hover:text-ink"
        >
          ↻ replay
        </button>
        <span className="chip">simulation {running ? "· running" : "· done"}</span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <Panel pad={false} className="overflow-hidden">
          <div className="relative aspect-[4/3] bg-black">
            <canvas ref={canvasRef} width={W} height={H} className="absolute inset-0 h-full w-full" />
            <span className="absolute left-3 top-3 rounded bg-yellow px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
              SIMULATION
            </span>
          </div>
          <Caption fig="Fig. 4">
            Ghost agent-hand (yellow) performs each step; SSIM in the ROI drives the decision chip.
          </Caption>
        </Panel>

        <Panel>
          <div className="caption mb-3"><b>Decisions</b></div>
          <ul className="space-y-1.5">
            {STEP_NAMES.map((name, i) => {
              const last = [...decisions].reverse().find((d) => d.step === i);
              return (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-[13px] ${
                    last?.d === "FAIL" ? "border-fail/40 bg-fail/5" : last?.d === "PASS" ? "border-pass/40 bg-pass/5" : "border-line bg-bone"
                  }`}
                >
                  <span className="font-mono text-[11px] text-ash">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-ink">{name}</span>
                  <span className="ml-auto">
                    {last ? <DecisionChip d={last.d}>{last.d} {last.score.toFixed(2)}</DecisionChip> : <span className="chip">—</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          {decisions.some((d) => d.d === "FAIL") && (
            <p className="mt-3 text-[12.5px] text-ash">
              The fail is caught in the valve ROI, then clears once the hand opens the valve.
            </p>
          )}
        </Panel>
      </div>
    </Section>
  );
}

function easeInOut(x: number) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function runVerify(
  wx: CanvasRenderingContext2D,
  eng: any,
  exp: Expert[],
  step: number,
  setDecisions: React.Dispatch<React.SetStateAction<any[]>>
) {
  // snapshot current panel (no hand) for a clean comparison
  drawSim(wx, eng.state, performance.now());
  const g = toGray(wx.getImageData(0, 0, W, H));
  const roi = exp[step].roi;
  const res = ssimMap(equalize(g, roi), equalize(exp[step].gray, roi), roi.w, roi.h);
  const d: Decision = res.score >= T_PASS ? "PASS" : res.score < T_FAIL ? "FAIL" : "UNSURE";
  const region = d === "FAIL" ? worstRegion(res) : undefined;
  eng.flash = { roi, d };
  eng.diff = d === "FAIL" ? res : null;
  setDecisions((prev) => [...prev, { step, d, score: res.score, region }]);
}

function drawOverlay(ctx: CanvasRenderingContext2D, eng: any) {
  if (!eng.flash) return;
  const { roi, d } = eng.flash;
  const col = d === "PASS" ? "#16A34A" : d === "FAIL" ? "#DC2626" : "#FFC400";
  if (eng.diff) {
    const { map, bw, B } = eng.diff;
    for (let i = 0; i < map.length; i++) {
      if (map[i] < 0.6) {
        ctx.fillStyle = `rgba(220,38,38,${Math.min(0.5, (0.6 - map[i]) * 1.2)})`;
        ctx.fillRect(roi.x + (i % bw) * B, roi.y + Math.floor(i / bw) * B, B, B);
      }
    }
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(roi.x + 0.5, roi.y + 0.5, roi.w, roi.h);
  ctx.setLineDash([]);
}
