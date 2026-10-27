"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import { Decision } from "@/lib/demo";

export function Section({
  id,
  num,
  eyebrow,
  title,
  sub,
  children,
}: {
  id?: string;
  num?: string;
  eyebrow?: string;
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line scroll-mt-16">
      <div className="mx-auto max-w-frame px-5 py-16 md:py-24">
        {eyebrow && (
          <div className="eyebrow mb-4">
            {num && <span className="num">{num}</span>}
            {eyebrow}
          </div>
        )}
        {title && (
          <h2 className="text-[clamp(26px,3.4vw,40px)] font-semibold tracking-[-0.015em] leading-[1.08] max-w-3xl">
            {title}
          </h2>
        )}
        {sub && <p className="mt-3 text-ash max-w-2xl text-[15.5px] leading-relaxed">{sub}</p>}
        {children}
      </div>
    </section>
  );
}

export function Panel({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-paper ${pad ? "p-4 md:p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function Caption({ fig, children }: { fig: string; children: ReactNode }) {
  return (
    <p className="caption mt-3">
      <b>{fig}</b> — {children}
    </p>
  );
}

const DEC_STYLE: Record<Decision, { fg: string; bg: string; bd: string }> = {
  PASS: { fg: "text-pass", bg: "bg-pass/10", bd: "border-pass/40" },
  FAIL: { fg: "text-fail", bg: "bg-fail/10", bd: "border-fail/40" },
  UNSURE: { fg: "text-[#B45309]", bg: "bg-yellow/15", bd: "border-yellow/60" },
};

export function DecisionChip({ d, children }: { d: Decision; children?: ReactNode }) {
  const s = DEC_STYLE[d];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border ${s.bd} ${s.bg} ${s.fg} px-2 py-0.5 font-mono text-[11.5px] font-medium`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${d === "PASS" ? "bg-pass" : d === "FAIL" ? "bg-fail" : "bg-yellow"}`} />
      {children ?? d}
    </span>
  );
}

export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Pending({ label = "pending" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 chip">
      <span className="h-1.5 w-1.5 rounded-full bg-ash/50 animate-pulse" />
      {label}
    </span>
  );
}
