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

        <div className="rounded-xl border border-line bg-paper/70 p-5 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <span className="caption"><b>The loop</b> — perceive · decide · act</span>
            <DecisionChip d={CYCLE[dec]} />
          </div>
          <LoopDiagram active={active} dec={CYCLE[dec]} />
        </div>
      </div>
    </header>
  );
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
