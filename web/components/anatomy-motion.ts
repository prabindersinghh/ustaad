"use client";

// Adapted motion primitives from Anatomy (MIT):
// https://github.com/wheresryan22/anatomy/tree/main/kit/react
import * as React from "react";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export function useLoop(tick: (dt: number, calm: boolean) => boolean, running: boolean) {
  const latest = React.useRef(tick); latest.current = tick; const frame = React.useRef(0); const last = React.useRef(0);
  const kick = React.useCallback(() => { if (frame.current) return; last.current = 0; const step = (now: number) => { const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60; last.current = now; frame.current = latest.current(dt, reducedMotion()) ? requestAnimationFrame(step) : 0; }; frame.current = requestAnimationFrame(step); }, []);
  React.useEffect(() => { if (running) kick(); return () => cancelAnimationFrame(frame.current); }, [running, kick]);
}
export function useEased(target: number, seconds = 0.12) {
  const [value, setValue] = React.useState(target); const shown = React.useRef(target);
  useLoop((dt, calm) => { shown.current = calm ? target : shown.current + (target - shown.current) * (1 - Math.exp(-dt / seconds)); if (Math.abs(target - shown.current) < 1e-3) shown.current = target; setValue(shown.current); return shown.current !== target; }, shown.current !== target);
  return value;
}
