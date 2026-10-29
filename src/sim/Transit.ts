import { BALANCE } from './balance';
import { World } from '../world/World';
import { Traffic } from './Traffic';
import { TILE } from '../world/consts';
import { clamp } from '../util';

export const LINE_TYPES = [
  { name: 'Автобус', speed: 9, cap: 80, upkeep: 350, vehCost: 15000, kmCost: 0, stopCost: 2000, catch: 450, onRoad: true, color: 0xf2c230, veh: 2, congestion: 1 },
  { name: 'Трамвай', speed: 11, cap: 220, upkeep: 600, vehCost: 40000, kmCost: 35000, stopCost: 6000, catch: 500, onRoad: true, color: 0xe04848, veh: 3, congestion: 0.35 },
  { name: 'Метро', speed: 20, cap: 1100, upkeep: 2200, vehCost: 150000, kmCost: 260000, stopCost: 60000, catch: 800, onRoad: false, color: 0x3a8ee0, veh: 4, congestion: 0 },
  { name: 'Поезд', speed: 30, cap: 1200, upkeep: 2600, vehCost: 200000, kmCost: 110000, stopCost: 80000, catch: 900, onRoad: false, color: 0x8a5cd0, veh: 5, congestion: 0 },
];
export interface Line { id: number; type: number; name: string; color: number; stops: { x: number; z: number; node: number }[]; pts: Float32Array; cum: Float32Array; L: number; n: number; fare: number; riders: number; revenue: number; ok: boolean; edges: number[]; speedF: number; cargo: boolean; cities: number[]; active: boolean; route?: number; extDemand: number; share: number; freightOnly?: boolean }

export class Transit {
  lines: Line[] = []; nextId = 1; version = 0;
  constructor(public world: World, public traffic: Traffic) { }
  build(type: number, stops: { x: number; z: number }[]): Line | null {
    const T = LINE_TYPES[type]; const net = this.world.net;
    const st = stops.map(s => ({ x: s.x, z: s.z, node: T.onRoad ? net.findNode(s.x, s.z, 200) : -1 }));
    if (st.length < 2) return null;
    const pts: number[] = []; const edges: number[] = [];
    const seq = [...st, ...st.slice(0, -1).reverse()]; // pendulum: there and back
    for (let i = 0; i + 1 < seq.length; i++) {
      const a = seq[i], b = seq[i + 1];
      if (T.onRoad) {
        if (a.node < 0 || b.node < 0) return null; if (a.node === b.node) continue;
        const p = this.traffic.astar(a.node, b.node, 15, 60000); if (!p) return null;
        let u = a.node; if (!pts.length) pts.push(net.nodes[u].x, net.nodes[u].z);
        for (const l of p) { const E = net.edges[l >> 1]; edges.push(l >> 1); u = (l & 1) ? E.a : E.b; pts.push(net.nodes[u].x, net.nodes[u].z); }
      } else { if (!pts.length) pts.push(a.x, a.z); pts.push(b.x, b.z); }
    }
    const P = Float32Array.from(pts); const cum = new Float32Array(P.length / 2); let L = 0;
    for (let i = 1; i < cum.length; i++) { L += Math.hypot(P[i * 2] - P[i * 2 - 2], P[i * 2 + 1] - P[i * 2 - 1]); cum[i] = L; }
    if (L < 50) return null;
    const cities = [...new Set(st.map(s => this.world.nearestCity(s.x, s.z, 1.6)).filter(c => c >= 0))];
    const line: Line = { id: this.nextId++, type, name: `${T.name} ${this.nextId - 1}`, color: T.color, stops: st, pts: P, cum, L, n: Math.max(1, Math.round(L / 2500)), fare: BALANCE.transport.defaultFare[type], riders: 0, revenue: 0, ok: true, edges, speedF: 1, cargo: type === 3 && cities.length > 1, cities, active: true, extDemand: 0, share: 0 };
    this.lines.push(line); this.version++; return line;
  }
  buildCost(type: number, stops: { x: number; z: number }[]) {
    const T = LINE_TYPES[type]; let L = 0; for (let i = 1; i < stops.length; i++) L += Math.hypot(stops[i].x - stops[i - 1].x, stops[i].z - stops[i - 1].z);
    return stops.length * T.stopCost + L / 1000 * T.kmCost + T.vehCost;
  }
  remove(id: number) { this.lines = this.lines.filter(l => l.id !== id); this.version++; }
  posAt(line: Line, s: number): [number, number, number] {
    s = ((s % line.L) + line.L) % line.L; const c = line.cum; let lo = 0, hi = c.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const t = (s - c[lo]) / Math.max(0.001, c[hi] - c[lo]); const P = line.pts;
    const x = P[lo * 2] + (P[hi * 2] - P[lo * 2]) * t, z = P[lo * 2 + 1] + (P[hi * 2 + 1] - P[lo * 2 + 1]) * t;
    return [x, z, Math.atan2(-(P[hi * 2 + 1] - P[lo * 2 + 1]), P[hi * 2] - P[lo * 2])];
  }
  // positions of all vehicles at time t (seconds)
  forEachVehicle(t: number, cb: (line: Line, x: number, z: number, yaw: number) => void) {
    for (const ln of this.lines) { if (!ln.active) continue; const sp = LINE_TYPES[ln.type].speed * ln.speedF; for (let i = 0; i < ln.n; i++) { const [x, z, yaw] = this.posAt(ln, t * sp + i * ln.L / ln.n); cb(ln, x, z, yaw); } }
  }
  headwayMin(ln: Line) { return ln.L / (LINE_TYPES[ln.type].speed * ln.speedF) / ln.n / 60; }
  // daily ridership model (logit mode choice). popAt/jobAt: coarse grids
  update(popG: Float32Array, jobG: Float32Array, cityJobs: number[], carSpeedF: number[], fuelPrice: number[]) {
    const w = this.world; const GN = w.GN; const cs = w.GC * TILE;
    w.transitCov.fill(0);
    let total = 0;
    for (const ln of this.lines) {
      const T = LINE_TYPES[ln.type]; if (!ln.active || ln.freightOnly) { ln.riders = 0; ln.revenue = 0; continue; }
      // congestion along road route
      if (T.onRoad && ln.edges.length) { let s = 0; for (let i = 0; i < ln.edges.length; i += 3) s += Math.min(1.2, this.traffic.edgeLoad(ln.edges[i])); const avg = s / Math.ceil(ln.edges.length / 3); ln.speedF = clamp(1 - avg * 0.7 * T.congestion, 0.3, 1); }
      const R = T.catch; const pops: number[] = [], jobs: number[] = [];
      for (const st of ln.stops) {
        let p = 0, j = 0; const r = Math.ceil(R / cs); const gi = Math.floor(st.x / cs), gj = Math.floor(st.z / cs);
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const ii = gi + a, jj = gj + b; if (ii < 0 || jj < 0 || ii >= GN || jj >= GN) continue; const d = Math.hypot(a, b) * cs; if (d > R) continue; const k = jj * GN + ii; const f = 1 - d / R * 0.6; p += popG[k] * f; j += jobG[k] * f; w.transitCov[k] = Math.max(w.transitCov[k], (1 - d / R) * (ln.type >= 2 ? 1 : 0.6)); }
        pops.push(p); jobs.push(j);
      }
      const c0 = ln.cities[0] ?? 0; const cj = Math.max(1, ln.cities.reduce((s, c) => s + (cityJobs[c] || 0), 0));
      let demand = 0; const sj = jobs.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pops.length; i++) demand += pops[i] * 0.5 * Math.min(1, (sj - jobs[i]) / cj) * 2;
      demand += ln.extDemand;
      const avgDist = Math.min(ln.L / 4, 8000); const sp = T.speed * ln.speedF;
      const tT = 7 + this.headwayMin(ln) / 2 + avgDist / sp / 60; const carV = 12 * (carSpeedF[c0] ?? 1);
      const tC = 4 + avgDist / carV / 60; const costC = (fuelPrice[c0] ?? 80) * avgDist / 1000 * 0.1 + 25;
      const U = (tC - tT) * 0.12 + (costC - ln.fare) * 0.03 + (ln.type >= 2 ? 0.4 : 0);
      const share = 1 / (1 + Math.exp(-U)) * 0.9;
      const capDay = ln.n * T.cap * (18 * 3600 / (ln.L / sp)) * 0.6;
      ln.riders = Math.min(demand * share, capDay); ln.revenue = ln.riders * ln.fare * (1 - ln.share); total += ln.riders;
    }
    return total;
  }
  serialize() { return this.lines.map(l => ({ type: l.type, stops: l.stops.map(s => [Math.round(s.x), Math.round(s.z)]), n: l.n, fare: l.fare, name: l.name })); }
}
