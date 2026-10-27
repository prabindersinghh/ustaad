"use client";

import { useEffect, useState } from "react";

// Everything loads from /demo/, which run_all.sh populates from the pipeline's
// out/ directory. Swapping in a new recording = re-run run_all.sh, no rebuild.
export const DEMO = "/demo";

export type Roi = [number, number, number, number];

export interface Step {
  index: number;
  name: string;
  t_start: number;
  t_end: number;
  t_keyframe: number;
  keyframe: string;
  roi: Roi;
  aruco: { id: number; corners: number[][] }[];
  orb_features: number;
}

export interface Procedure {
  source: string;
  fps: number;
  width: number;
  frame_size: [number, number];
  n_steps: number;
  motion_curve: number[];
  times: number[];
  segments: { t_start: number; t_end: number; t_keyframe: number }[];
  steps: Step[];
}

export type Decision = "PASS" | "FAIL" | "UNSURE";

export interface TraceEvent {
  t_video: number;
  step: number;
  tool: string;
  score: number | null;
  inliers: number;
  align_method: string;
  latency_ms: number;
  decision: string;
  region: string | null;
}

export interface SessionDecision {
  t: number;
  step: number;
  decision: Decision;
  score: number | null;
  region: string | null;
  roi: Roi;
  evidence: string;
}

export interface Session {
  worker: string;
  n_steps: number;
  step_names: string[];
  trace: TraceEvent[];
  results: any[];
  decisions: SessionDecision[];
  timings: { median_latency_ms: number | null; n_verifications: number };
  annotated_video: string;
}

export interface Results {
  synthetic: boolean;
  n_stable_moments: number;
  n_labeled: number;
  metrics: {
    recall_wrong: number | null;
    false_alarm_rate: number | null;
    precision: number | null;
    uncertain_rate: number | null;
    accuracy: number | null;
  };
  counts: Record<string, number>;
  median_latency_ms: number | null;
  time_to_procedure_s: number | null;
  failure_cases: any[];
  per_moment: any[];
}

async function getJSON<T>(name: string): Promise<T | null> {
  try {
    const r = await fetch(`${DEMO}/${name}`, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

/** Load a demo JSON file once on the client. `null` while loading or if absent. */
export function useDemoJSON<T>(name: string): { data: T | null; loaded: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    getJSON<T>(name).then((d) => {
      if (!alive) return;
      setData(d);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [name]);
  return { data, loaded };
}

export const asset = (p: string) => `${DEMO}/${p}`;
