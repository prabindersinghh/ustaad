"use client";

import { motion } from "framer-motion";
import { Section, Caption, DecisionChip } from "./primitives";

const formulas = [
  { tag: "MOTION", formula: "Eₜ = ‖Gₜ − Gₜ₋₁‖₀ / |Ω|", note: "detect action → stable hold" },
  { tag: "ALIGN", formula: "x′ ∼ Hx  ·  H = argmin ‖x′ − Hx‖²", note: "ArUco / ORB homography" },
  { tag: "COMPARE", formula: "SSIM(x,y) = (2μₓμᵧ+c₁)(2σₓᵧ+c₂) / ((μₓ²+μᵧ²+c₁)(σₓ²+σᵧ²+c₂))", note: "Gaussian-windowed ROI score" },
  { tag: "DECIDE", formula: "FAIL < 0.55  ·  UNSURE  ·  PASS ≥ 0.78", note: "deterministic agent policy" },
];

export default function SimulationShowcase() {
  return (
    <Section id="overview" num="§0" eyebrow="The simulation, made explicit" title="From wrong action to grounded correction." sub="Start with the visual proof. The same synthetic control cell makes the failure visible, localises it to the valve ROI, and shows the exact state change that clears the verdict.">
      <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <StateCard label="BEFORE · worker state" tone="fail" valve={false} detail="S3 is on, but the feed valve is still closed." />
        <div className="flex items-center justify-center text-yellow lg:block"><motion.div animate={{x:[-4,4,-4]}} transition={{duration:1.8,repeat:Infinity}} className="rounded-full border border-yellow/70 bg-yellow/15 px-3 py-2 font-mono text-[12px] text-ink">agent correction →</motion.div></div>
        <StateCard label="AFTER · verified state" tone="pass" valve detail="Valve open. The same ROI crosses the PASS threshold." />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-line bg-ink p-4 text-paper"><div className="flex items-center justify-between"><span className="font-mono text-[11px] text-paper/60">TRACE / STEP 03</span><DecisionChip d="FAIL">FAIL · 0.31</DecisionChip></div><div className="mt-4 space-y-2 font-mono text-[12px]"><div className="text-paper/55">01 · verify_step(step=3)</div><div className="text-fail">02 · flag_error(region="valve")</div><div className="text-paper/55">03 · hold expected step</div><div className="text-pass">04 · re-verify → PASS · 0.91</div></div></div>
        <div className="rounded-xl border border-line bg-bone p-4"><div className="caption mb-3"><b>Why this is a simulation</b></div><p className="text-[13px] leading-relaxed text-ash">The panel, camera jitter, lighting drift, sensor noise, and worker hand are procedurally generated. This proves the interaction and vision logic without implying real-factory footage.</p><div className="mt-4 flex flex-wrap gap-2"><span className="chip">synthetic data</span><span className="chip">human escalation</span><span className="chip">no upload</span></div></div>
      </div>
      <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{formulas.map((f, i) => <motion.div key={f.tag} initial={{opacity:0,y:8}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{delay:i*.06}} className="rounded-xl border border-line bg-white p-4 shadow-[0_8px_24px_rgba(17,20,24,.035)]"><div className="font-mono text-[10px] tracking-[.16em] text-ash">{f.tag}</div><div className="mt-3 min-h-[42px] font-mono text-[13px] leading-relaxed text-ink">{f.formula}</div><div className="mt-3 border-t border-line pt-2 text-[11px] text-ash">{f.note}</div></motion.div>)}</div>
      <Caption fig="Fig. 0a">A controlled before/after replay of the agent’s decision boundary. Equations are the compact mathematical description of the browser mirror; the production implementation uses OpenCV 5.</Caption>
    </Section>
  );
}

function StateCard({ label, tone, valve, detail }: { label: string; tone: "fail" | "pass"; valve: boolean; detail: string }) {
  const color = tone === "fail" ? "#DC2626" : "#16A34A";
  return <div className="rounded-2xl border border-line bg-white p-3 shadow-[0_14px_36px_rgba(17,20,24,.05)]"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[11px] tracking-[.08em] text-ash">{label}</span><DecisionChip d={tone === "fail" ? "FAIL" : "PASS"}>{tone === "fail" ? "FAIL" : "PASS"}</DecisionChip></div><div className="relative overflow-hidden rounded-xl border border-[#d8d9d4] bg-[#30383e] p-4"><div className="absolute inset-0 opacity-20 gridfield"/><div className="relative mx-auto h-40 max-w-[350px] rounded-lg border-2 border-[#14191d] bg-gradient-to-br from-[#55616a] to-[#20262b] shadow-[0_16px_26px_rgba(0,0,0,.25)]"><div className="absolute left-1/2 top-5 h-12 w-24 -translate-x-1/2 rounded border border-white/50 bg-[#11171b] p-2"><div className="h-1 rounded bg-yellow/80"/><div className="mt-2 h-1 w-2/3 rounded bg-blue-300/60"/></div><div className="absolute bottom-7 left-1/2 h-2 w-24 -translate-x-1/2 rounded bg-black/80"><motion.div animate={{rotate:valve?-48:0}} className="absolute left-1/2 top-1/2 h-2 w-16 origin-left -translate-y-1/2 rounded" style={{background:color}}/></div><div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[9px] text-white/65">VALVE ROI</div><motion.div animate={{opacity:valve?1:.35}} className="absolute right-5 top-7 h-5 w-5 rounded-full" style={{background:color}}/></div><div className="relative mt-3 flex justify-between font-mono text-[10px] text-white/65"><span>CAM-01</span><span>SSIM {valve?"0.91":"0.31"}</span></div></div><p className="mt-3 text-[12.5px] leading-relaxed text-ash">{detail}</p></div>;
}
