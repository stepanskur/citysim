export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type RNG = () => number;
export function hash2(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function strSeed(s: string): number {
  if (/^\d+$/.test(s)) return parseInt(s) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GR = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);
// Seeded 2D simplex noise
export class Noise {
  perm = new Uint8Array(512);
  constructor(seed: number) {
    const r = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  n2(xin: number, yin: number): number {
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t);
    let i1 = 0, j1 = 1; if (x0 > y0) { i1 = 1; j1 = 0; }
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255, P = this.perm;
    let n = 0, tt, g;
    tt = 0.5 - x0 * x0 - y0 * y0; if (tt > 0) { g = (P[ii + P[jj]] & 7) * 2; tt *= tt; n += tt * tt * (GR[g] * x0 + GR[g + 1] * y0); }
    tt = 0.5 - x1 * x1 - y1 * y1; if (tt > 0) { g = (P[ii + i1 + P[jj + j1]] & 7) * 2; tt *= tt; n += tt * tt * (GR[g] * x1 + GR[g + 1] * y1); }
    tt = 0.5 - x2 * x2 - y2 * y2; if (tt > 0) { g = (P[ii + 1 + P[jj + 1]] & 7) * 2; tt *= tt; n += tt * tt * (GR[g] * x2 + GR[g + 1] * y2); }
    return 70 * n;
  }
  fbm(x: number, y: number, oct = 5, lac = 2, gain = 0.5): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { s += a * this.n2(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
  ridged(x: number, y: number, oct = 4): number {
    let a = 1, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(this.n2(x * f, y * f)); s += a * v * v; n += a; a *= 0.5; f *= 2.1; }
    return s / n;
  }
}

export class MinHeap {
  ids: Int32Array; keys: Float64Array; size = 0;
  constructor(cap = 1024) { this.ids = new Int32Array(cap); this.keys = new Float64Array(cap); }
  clear() { this.size = 0; }
  push(id: number, k: number) {
    if (this.size >= this.ids.length) {
      const ni = new Int32Array(this.ids.length * 2); ni.set(this.ids); this.ids = ni;
      const nk = new Float64Array(this.keys.length * 2); nk.set(this.keys); this.keys = nk;
    }
    let i = this.size++;
    while (i > 0) { const p = (i - 1) >> 1; if (this.keys[p] <= k) break; this.ids[i] = this.ids[p]; this.keys[i] = this.keys[p]; i = p; }
    this.ids[i] = id; this.keys[i] = k;
  }
  pop(): number {
    const top = this.ids[0]; const n = --this.size; if (n <= 0) return top;
    const id = this.ids[n], k = this.keys[n]; let i = 0;
    while (true) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && this.keys[c + 1] < this.keys[c]) c++; if (this.keys[c] >= k) break; this.ids[i] = this.ids[c]; this.keys[i] = this.keys[c]; i = c; }
    this.ids[i] = id; this.keys[i] = k; return top;
  }
}

export function fmtMoney(v: number) { const s = Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' млн' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + ' тыс' : Math.round(v).toString(); return s + ' ₽'; }
export function fmtNum(v: number) { return Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' млн' : Math.abs(v) >= 1e4 ? (v / 1e3).toFixed(1) + ' тыс' : Math.round(v).toString(); }
