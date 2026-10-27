"use client";

import { Section, Panel, Caption, Reveal } from "./primitives";

const TOOLS: [string, string][] = [
  ["verify_step(step_id)", "Runs the OpenCV pipeline on the latest stable frame; returns score, inliers, align method and a mismatch map."],
  ["next_step()", "Advances the procedure and issues the next instruction."],
  ["flag_error(region)", "PASS failed — names where the result differs, then re-verifies at the next stable moment."],
  ["request_human_approval()", "Escalates uncertain cases. The system never guesses silently."],
  ["log_evidence(frame, score)", "Stores the annotated frame and decision for the audit trail."],
];

export default function Architecture() {
  return (
    <Section
      id="architecture"
      num="§7"
      eyebrow="Architecture"
      title="Minimal by design, built to run on AWS."
      sub="The same OpenCV 5 pipeline runs offline, in the browser fallback, and behind a FastAPI service on a single EC2 instance. No duplicate logic, no sprawling infrastructure."
    >
      <Reveal>
        <Panel className="mt-8 overflow-x-auto">
          <svg viewBox="0 0 980 300" className="block h-auto w-full min-w-[760px]" fontFamily="var(--font-inter)">
            <defs>
              <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="#9aa0a8" />
              </marker>
            </defs>
            {/* boxes */}
            <g fill="#fafaf7" stroke="#e6e4dc">
              <rect x="10" y="112" width="150" height="76" rx="10" />
              <rect x="232" y="112" width="160" height="76" rx="10" />
              <rect x="462" y="40" width="252" height="220" rx="12" fill="#fffdf4" stroke="#FFC400" strokeDasharray="5 4" />
              <rect x="482" y="72" width="212" height="58" rx="9" fill="#ffffff" />
              <rect x="482" y="150" width="212" height="90" rx="9" fill="#ffffff" />
              <rect x="782" y="86" width="185" height="54" rx="9" />
              <rect x="782" y="168" width="185" height="54" rx="9" />
            </g>
            <g fill="#111418" fontWeight={600} fontSize={13}>
              <text x="85" y="146" textAnchor="middle">Camera</text>
              <text x="312" y="146" textAnchor="middle">Web client</text>
              <text x="588" y="98" textAnchor="middle">FastAPI + Agent</text>
              <text x="588" y="178" textAnchor="middle">OpenCV 5 pipeline</text>
              <text x="874" y="110" textAnchor="middle">Amazon S3</text>
              <text x="874" y="192" textAnchor="middle">CloudWatch</text>
            </g>
            <g fill="#5b626c" fontFamily="var(--font-mono)" fontSize={11}>
              <text x="85" y="166" textAnchor="middle">phone / webcam</text>
              <text x="312" y="166" textAnchor="middle">Next.js · S3 static</text>
              <text x="588" y="116" textAnchor="middle">tool orchestration</text>
              <text x="588" y="198" textAnchor="middle">segment · ArUco · ORB</text>
              <text x="588" y="214" textAnchor="middle">CLAHE · SSIM · decide</text>
              <text x="588" y="34" textAnchor="middle" fill="#B45309">EC2 t3.small · Docker · Caddy</text>
              <text x="874" y="128" textAnchor="middle">keyframes · evidence</text>
              <text x="874" y="210" textAnchor="middle">latency · outcomes</text>
              <text x="196" y="138" textAnchor="middle">frames</text>
              <text x="427" y="138" textAnchor="middle">HTTPS /verify</text>
            </g>
            <g stroke="#9aa0a8" strokeWidth={1.5} markerEnd="url(#arr)" fill="none">
              <path d="M160 150H228" />
              <path d="M392 150H478" />
              <path d="M588 130V146" />
              <path d="M714 120L778 113" />
              <path d="M714 196L778 192" />
            </g>
          </svg>
        </Panel>
      </Reveal>
      <Caption fig="Fig. 5">
        Request path. A single container hosts the agent and the pipeline; S3 holds media and
        evidence, CloudWatch receives logs through the Docker <span className="font-mono">awslogs</span> driver.
      </Caption>

      <div className="mt-10 grid gap-3 md:grid-cols-5">
        {TOOLS.map(([sig, desc], i) => (
          <Reveal key={sig} delay={i * 0.04}>
            <Panel className="h-full">
              <code className="block font-mono text-[12.5px] font-semibold text-ink">{sig}</code>
              <p className="mt-2 text-[13px] leading-relaxed text-ash">{desc}</p>
            </Panel>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
