// Browser vision engine — a faithful TypeScript port of the prototype's demo
// logic (simulated panel, motion energy, CLAHE stand-in, windowed SSIM). The
// production path runs the real OpenCV 5 pipeline; this mirrors it in-browser so
// the live lab and the simulation replay work with no backend.

export const W = 320;
export const H = 240;
export const T_FAIL = 0.55;
export const T_PASS = 0.78;
export const MOTION_ON = 0.02;
export const MOTION_OFF = 0.008;
export const STABLE_MS = 900;

export interface PanelState {
  switches: number[];
  knob: number;
  lamp: number;
  valve: number;
}

export const newState = (): PanelState => ({ switches: [0, 0, 0, 0], knob: 0, lamp: 0, valve: 0 });

const MARK = [
  [1, 1, 0, 1],
  [0, 1, 1, 0],
  [1, 0, 1, 1],
  [1, 1, 0, 0],
];

export function drawSim(g: CanvasRenderingContext2D, s: PanelState, t: number, hand?: { x: number; y: number }) {
  g.fillStyle = "#20252c";
  g.fillRect(0, 0, W, H);
  const drift = Math.sin(t / 2300) * 10;
  g.fillStyle = `rgb(${48 + drift},${54 + drift},${62 + drift})`;
  g.fillRect(14, 14, W - 28, H - 28);
  g.strokeStyle = "#121519";
  g.lineWidth = 2;
  g.strokeRect(14, 14, W - 28, H - 28);

  // ArUco-like fiducials
  ([[20, 20], [W - 44, 20], [20, H - 44], [W - 44, H - 44]] as [number, number][]).forEach(
    ([x, y], i) => {
      g.fillStyle = "#000";
      g.fillRect(x, y, 24, 24);
      g.fillStyle = "#fff";
      MARK[i].forEach((b, k) => {
        if (b) g.fillRect(x + 4 + (k % 2) * 8, y + 4 + Math.floor(k / 2) * 8, 8, 8);
      });
    }
  );

  g.font = "600 10px Inter";
  for (let i = 0; i < 4; i++) {
    const x = 64 + i * 34,
      y = 58;
    g.fillStyle = "#14171b";
    g.fillRect(x, y, 22, 46);
    g.fillStyle = s.switches[i] ? "#FFC400" : "#7c8590";
    g.fillRect(x + 3, s.switches[i] ? y + 3 : y + 25, 16, 18);
    g.fillStyle = "#aab3bf";
    g.fillText("S" + (i + 1), x + 4, y + 60);
  }
  // knob
  const kx = 228,
    ky = 82;
  g.fillStyle = "#14171b";
  g.beginPath();
  g.arc(kx, ky, 26, 0, 7);
  g.fill();
  g.fillStyle = "#9aa3ae";
  g.beginPath();
  g.arc(kx, ky, 20, 0, 7);
  g.fill();
  const a = -Math.PI * 0.75 + s.knob * Math.PI * 0.5;
  g.strokeStyle = "#111";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(kx, ky);
  g.lineTo(kx + Math.cos(a) * 18, ky + Math.sin(a) * 18);
  g.stroke();
  g.fillStyle = "#aab3bf";
  g.fillText("SPEED", kx - 17, ky + 40);
  // lamp
  g.fillStyle = s.lamp ? "#16A34A" : "#283028";
  g.beginPath();
  g.arc(84, 160, 14, 0, 7);
  g.fill();
  g.fillStyle = "#aab3bf";
  g.fillText("READY", 68, 190);
  // valve
  const vx0 = 150,
    vy0 = 165;
  g.fillStyle = "#14171b";
  g.fillRect(vx0 - 30, vy0 - 6, 120, 12);
  g.save();
  g.translate(vx0 + 30, vy0);
  g.rotate(s.valve ? -0.9 : 0);
  g.fillStyle = "#c94b3c";
  g.fillRect(-4, -4, 60, 8);
  g.restore();
  g.fillStyle = "#aab3bf";
  g.fillText("VALVE", vx0 + 12, vy0 + 30);

  // optional "agent hand" cursor (used by the simulation replay)
  if (hand) {
    g.fillStyle = "rgba(255,196,0,0.9)";
    g.beginPath();
    g.arc(hand.x, hand.y, 7, 0, 7);
    g.fill();
    g.strokeStyle = "rgba(17,20,24,0.9)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(hand.x, hand.y, 12, 0, 7);
    g.stroke();
  }

  // sensor noise
  const im = g.getImageData(0, 0, W, H),
    d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(im, 0, 0);
}

export function simClick(s: PanelState, px: number, py: number): boolean {
  for (let i = 0; i < 4; i++) {
    const x = 64 + i * 34;
    if (px > x && px < x + 22 && py > 58 && py < 104) {
      s.switches[i] ^= 1;
      return true;
    }
  }
  if (Math.hypot(px - 228, py - 82) < 28) {
    s.knob = (s.knob + 1) % 4;
    return true;
  }
  if (Math.hypot(px - 84, py - 160) < 18) {
    s.lamp ^= 1;
    return true;
  }
  if (px > 120 && px < 240 && py > 140 && py < 190) {
    s.valve ^= 1;
    return true;
  }
  return false;
}

export type Roi = { x: number; y: number; w: number; h: number };

export function toGray(img: ImageData): Float32Array {
  const d = img.data,
    g = new Float32Array(W * H);
  for (let i = 0, j = 0; j < g.length; i += 4, j++)
    g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

export function equalize(g: Float32Array, r: Roi): Float32Array {
  let mn = 255,
    mx = 0;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const v = g[y * W + x];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
  const s = 255 / Math.max(1, mx - mn),
    o = new Float32Array(r.w * r.h);
  let k = 0;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) o[k++] = (g[y * W + x] - mn) * s;
  return o;
}

export interface SsimResult {
  score: number;
  map: Float32Array;
  bw: number;
  bh: number;
  B: number;
}

export function ssimMap(a: Float32Array, b: Float32Array, w: number, h: number): SsimResult {
  const C1 = 6.5025,
    C2 = 58.5225,
    B = 8,
    bw = Math.floor(w / B),
    bh = Math.floor(h / B),
    map = new Float32Array(bw * bh);
  let sum = 0;
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      let ma = 0,
        mb = 0;
      const n = B * B;
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          const i = (by * B + y) * w + bx * B + x;
          ma += a[i];
          mb += b[i];
        }
      ma /= n;
      mb /= n;
      let va = 0,
        vb = 0,
        cv = 0;
      for (let y = 0; y < B; y++)
        for (let x = 0; x < B; x++) {
          const i = (by * B + y) * w + bx * B + x,
            da = a[i] - ma,
            db = b[i] - mb;
          va += da * da;
          vb += db * db;
          cv += da * db;
        }
      va /= n - 1;
      vb /= n - 1;
      cv /= n - 1;
      const sc = ((2 * ma * mb + C1) * (2 * cv + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      map[by * bw + bx] = sc;
      sum += sc;
    }
  return { score: sum / (bw * bh), map, bw, bh, B };
}

export function worstRegion(res: SsimResult): string {
  let mi = 0;
  for (let i = 1; i < res.map.length; i++) if (res.map[i] < res.map[mi]) mi = i;
  const x = (mi % res.bw) / res.bw,
    y = Math.floor(mi / res.bw) / res.bh;
  return (y < 0.33 ? "top" : y > 0.66 ? "bottom" : "middle") + "-" + (x < 0.33 ? "left" : x > 0.66 ? "right" : "centre");
}

export function motionEnergy(g: Float32Array, prev: Float32Array | null): number {
  if (!prev) return 0;
  let s = 0;
  for (let i = 0; i < g.length; i += 3) if (Math.abs(g[i] - prev[i]) > 22) s++;
  return s / (g.length / 3);
}
