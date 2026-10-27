"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { DecisionChip } from "./primitives";
import { Decision } from "@/lib/demo";

const STAGES = ["camera", "keyframes", "align", "compare", "decision"];
const CYCLE: Decision[] = ["PASS", "FAIL", "UNSURE"];

export default function Hero() {
  const [active, setActive] = useState(0);
  const [dec, setDec] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setActive((a) => {
        const next = (a + 1) % STAGES.length;
        if (next === STAGES.length - 1) setDec((d) => (d + 1) % CYCLE.length);
        return next;
      });
    }, 1100);
    return () => clearInterval(t);
  }, []);

  return (
    <header id="top" className="relative overflow-hidden">
      <div className="absolute inset-0 gridfield gridfield-fade opacity-70" />
      <div className="relative mx-auto grid max-w-frame items-center gap-12 px-5 pb-16 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pb-24 md:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-bone px-3 py-1 font-mono text-[12px] text-ash">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow" />
            OpenCV 5 · AWS · Agentic vision
          </span>
          <h1 className="mt-5 text-[clamp(34px,5.4vw,58px)] font-semibold leading-[1.03] tracking-[-0.025em]">
            Learn a procedure <span className="text-ink/90 [text-decoration:underline_3px_#FFC400] underline-offset-[6px]">once</span>.
            <br />
            Verify it every time.
          </h1>
          <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-ash">
            USTAAD turns a single expert demonstration and a short manual into vision-verified
            steps, then an agent watches each new worker and checks every action — advancing on a
            pass, flagging the exact region on a fail, and escalating to a human when unsure.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#learn"
              className="rounded-lg bg-ink px-5 py-3 text-[14px] font-semibold text-paper transition-colors hover:bg-ink/85"
            >
              Watch it learn →
            </a>
            <a
              href="#lab"
              className="rounded-lg border border-line bg-paper px-5 py-3 text-[14px] font-semibold text-ink transition-colors hover:border-ink/30"
            >
              Try live
            </a>
          </div>
        </div>

        <div className="hero-figure rounded-2xl border border-line bg-white/90 p-4 shadow-[0_24px_70px_rgba(17,20,24,0.08)] backdrop-blur-sm md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="caption"><b>Fig. 0 — Instrumented replay</b> · synthetic control cell</span>
            <DecisionChip d={CYCLE[dec]} />
          </div>
          <ControlCell active={active} dec={CYCLE[dec]} />
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono text-[10px] text-ash">
            <span><b className="text-ink">10 fps</b><br/>sampling</span><span><b className="text-ink">0.78</b><br/>τ pass</span><span><b className="text-ink">ArUco</b><br/>registration</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function ControlCell({ active, dec }: { active: number; dec: Decision }) {
  const decColor = dec === "PASS" ? "#16A34A" : dec === "FAIL" ? "#DC2626" : "#FFC400";
  return <div className="relative overflow-hidden rounded-xl border border-[#d9d7cf] bg-[#f8f8f5] p-2">
    <div className="absolute inset-0 opacity-50 gridfield" />
    <svg viewBox="0 0 560 330" className="relative w-full" role="img" aria-label="Animated isometric control panel simulation">
      <defs>
        <linearGradient id="cellTop" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#59636a"/><stop offset="1" stopColor="#293138"/></linearGradient>
        <linearGradient id="cellSide" x1="0" x2="0" y1="0" y2="1"><stop stopColor="#20272c"/><stop offset="1" stopColor="#111418"/></linearGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="7"/></filter>
        <marker id="arrowFigure" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7a8086"/></marker>
      </defs>
      <ellipse cx="280" cy="286" rx="190" ry="22" fill="#111418" opacity=".13" filter="url(#soft)"/>
      <path d="M91 72L420 49L492 102L163 130Z" fill="url(#cellTop)" stroke="#111418" strokeWidth="1.5"/>
      <path d="M163 130L492 102L492 232L163 267Z" fill="url(#cellSide)" stroke="#111418" strokeWidth="1.5"/>
      <path d="M91 72L163 130L163 267L91 207Z" fill="#394248" stroke="#111418" strokeWidth="1.5"/>
      {[0,1,2,3].map((n)=><g key={n}><rect x={n%2?420:105} y={n>1?180:63} width="32" height="32" fill="#101418" stroke="#FFC400" strokeWidth="2" transform={n%2?"skewY(-5)":"skewY(10)"}/><circle cx={n%2?436:121} cy={n>1?195:79} r="8" fill="none" stroke="#FFC400" opacity=".8"/></g>)}
      <g transform="translate(225 125) skewY(-5)"><rect width="116" height="64" rx="5" fill="#151b1f" stroke="#a9b1b7"/><rect x="9" y="9" width="98" height="38" fill="#101418"/><path d="M17 37L42 29L62 33L88 17" stroke="#FFC400" strokeWidth="2" fill="none"/><circle cx="91" cy="18" r="3" fill="#16A34A"/><text x="14" y="58" fill="#cdd2d6" fontSize="8" fontFamily="monospace">SSIM / STREAM</text></g>
      <g transform="translate(190 205)"><circle cx="0" cy="0" r="28" fill="#12171b" stroke="#c4c9cb" strokeWidth="3"/><circle cx="0" cy="0" r="18" fill="#59636a"/><motion.line x1="0" y1="0" x2="12" y2="-12" stroke="#FFC400" strokeWidth="4" animate={{rotate:[-30,30,-30]}} transition={{duration:3,repeat:Infinity}}/></g>
      <g transform="translate(330 215)"><circle cx="0" cy="0" r="21" fill={dec === "PASS" ? "#16A34A" : "#313d37"} stroke="#d8ded8" strokeWidth="3"/><text x="0" y="4" textAnchor="middle" fill="white" fontSize="8" fontFamily="monospace">READY</text></g>
      <motion.ellipse cx="310" cy="185" rx="42" ry="22" fill="#111418" opacity=".72" animate={{cx:[190,315,330,190],cy:[240,170,205,240]}} transition={{duration:5,repeat:Infinity,ease:"easeInOut"}}/>
      <motion.path d="M92 52L470 52" stroke={decColor} strokeWidth="1.5" strokeDasharray="5 5" animate={{x:[-20,20,-20]}} transition={{duration:2,repeat:Infinity}} markerEnd="url(#arrowFigure)"/>
      <text x="102" y="306" fill="#5b626c" fontSize="10" fontFamily="monospace">CAM-01</text><text x="407" y="306" fill="#5b626c" fontSize="10" fontFamily="monospace">ROI / VALVE</text>
      <g transform="translate(402 18)"><rect width="118" height="25" rx="12" fill="#fff" stroke={decColor}/><circle cx="14" cy="12" r="4" fill={decColor}/><text x="25" y="16" fill="#111418" fontSize="10" fontFamily="monospace">LIVE SIMULATION</text></g>
    </svg>
    <div className="relative mt-1 flex items-center justify-between px-2 font-mono text-[10px] text-ash"><span>H = ArUco homography</span><span className="text-ink">stage {active + 1}/5</span></div>
  </div>;
}

function LoopDiagram({ active, dec }: { active: number; dec: Decision }) {
  const nodes = [
    { x: 60, y: 60, label: "camera", sub: "sample @10fps" },
    { x: 210, y: 60, label: "keyframes", sub: "stable moments" },
    { x: 360, y: 60, label: "align", sub: "ArUco / ORB" },
    { x: 360, y: 170, label: "compare", sub: "CLAHE · SSIM" },
    { x: 150, y: 170, label: "decide", sub: "τ thresholds" },
  ];
  const decColor = dec === "PASS" ? "#16A34A" : dec === "FAIL" ? "#DC2626" : "#FFC400";
  return (
    <svg viewBox="0 0 440 240" className="w-full">
      <defs>
        <marker id="hair" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0 0L10 5L0 10z" fill="#c9c6bb" />
        </marker>
      </defs>
      {/* edges */}
      <g stroke="#dedbd0" strokeWidth={1.5} fill="none" markerEnd="url(#hair)">
        <path d="M110 60H200" />
        <path d="M260 60H350" />
        <path d="M385 85V150" />
        <path d="M315 170H200" />
        <path d="M120 150Q80 110 60 85" />
      </g>
      {nodes.map((n, i) => {
        const on = i === active;
        const isDecide = n.label === "decide";
        return (
          <g key={n.label}>
            <motion.rect
              x={n.x - 52}
              y={n.y - 24}
              width={104}
              height={48}
              rx={9}
              animate={{
                fill: on ? "#fffdf4" : "#ffffff",
                stroke: on ? (isDecide ? decColor : "#FFC400") : "#e6e4dc",
              }}
              transition={{ duration: 0.3 }}
              strokeWidth={on ? 2 : 1}
            />
            <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize={13} fontWeight={600} fill="#111418" fontFamily="var(--font-inter)">
              {n.label}
            </text>
            <text x={n.x} y={n.y + 13} textAnchor="middle" fontSize={9.5} fill="#5b626c" fontFamily="var(--font-mono)">
              {n.sub}
            </text>
          </g>
        );
      })}
      {/* pulse dot travelling the loop */}
      <motion.circle
        r={4}
        fill={decColor}
        animate={{
          cx: [60, 210, 360, 360, 150, 60],
          cy: [60, 60, 60, 170, 170, 60],
        }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
      />
    </svg>
  );
}
