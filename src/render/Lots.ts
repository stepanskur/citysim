// Участки (лоты) вдоль улиц: фронтальная нарезка кварталов. Каждое ребро сети с обеих сторон
// делится на участки разной ширины/глубины (по типу застройки тайла), фасад — к улице.
// Занятость — разреженная сетка 4 м, общая для всего мира → участки разных улиц не пересекаются;
// угол квартала занимает тот, кто пришёл первым, остальные укорачиваются/пропускаются.
import { World } from '../world/World';
import { ROAD_TYPES } from '../world/RoadNet';
import { TILE, K } from '../world/consts';

export interface Lot { e: number; x: number; z: number; rot: number; w: number; d: number; k: number; cls: string; corner: boolean }
const CELL = 4;
const h3 = (a: number, b: number, c: number) => { const q = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return q - Math.floor(q); };

export class Lots {
  occ = new Map<number, number>(); // cell → edge id
  byEdge = new Map<number, Lot[]>(); cellsOf = new Map<number, number[]>(); props = new Map<number, number[][]>();
  constructor(public w: World) {}
  private key(cx: number, cz: number) { return cx * 100003 + cz; }
  /** Класс застройки по тайлу. */
  cls(k: number): { cls: string; W: [number, number]; D: [number, number]; sb: number; gap: number } | null {
    const w = this.w, kd = w.kind[k], st = w.style[k], L = w.bld[k];
    if (!L) return null;
    if (kd === K.RES) {
      if (st === 1) return { cls: 'slum', W: [8, 12], D: [10, 14], sb: 1, gap: 1.5 };
      if (st === 3) return { cls: 'hist', W: [10, 16], D: [14, 18], sb: 0.5, gap: 0 };
      if (st === 2) return { cls: 'panel', W: [36, 60], D: [16, 22], sb: 7, gap: 12 };
      if (L <= 2) return { cls: 'house', W: [14, 22], D: [20, 30], sb: 4, gap: 4 };
      if (L <= 8) return { cls: 'mid', W: [18, 30], D: [16, 22], sb: 2.5, gap: 0 };
      return { cls: 'tower', W: [26, 34], D: [26, 34], sb: 6, gap: 8 };
    }
    if (kd === K.COM) return L <= 4 || st === 3 ? { cls: 'shop', W: [12, 20], D: [14, 18], sb: 1, gap: 0 } : { cls: 'office', W: [26, 34], D: [26, 32], sb: 4, gap: 6 };
    if (kd === K.IND) return { cls: 'ind', W: [30, 50], D: [28, 42], sb: 6, gap: 6 };
    return null;
  }
  free(e: number, x: number, z: number, ux: number, uz: number, nx: number, nz: number, W: number, D: number) {
    const cells: number[] = [];
    for (let a = 0; a <= W; a += CELL * 0.9) for (let b = 0; b <= D; b += CELL * 0.9) {
      const px = x + ux * a + nx * b, pz = z + uz * a + nz * b; const c = this.key(Math.floor(px / CELL), Math.floor(pz / CELL));
      const o = this.occ.get(c); if (o !== undefined && o !== -e - 1) return null; cells.push(c);
    }
    // дороги: углы и середины сторон не ближе полуширины+1 м к любой улице
    for (const [a, b] of [[0, D], [W, D], [W / 2, D], [0, D / 2], [W, D / 2], [W / 2, D / 2]]) {
      const px = x + ux * a + nx * b, pz = z + uz * a + nz * b; const ne = this.w.net.nearestEdge(px, pz, 20);
      if (ne && ne.d < ROAD_TYPES[this.w.net.edges[ne.e].type].w / 2 + 2) return null;
      const i = Math.floor(px / TILE), j = Math.floor(pz / TILE); if (i < 0 || j < 0 || i >= this.w.N || j >= this.w.N || this.w.tileH(i, j) < 0.3) return null;
    }
    return cells;
  }
  edgeLots(e: number): Lot[] {
    const E = this.w.net.edges[e]; if (!E.alive) { this.drop(e); return []; }
    const have = this.byEdge.get(e); if (have) return have;
    const out: Lot[] = []; const props: number[][] = []; this.byEdge.set(e, out); this.props.set(e, props);
    if (E.type === 2) return out; // шоссе без фронтальной застройки
    const net = this.w.net, A = net.nodes[E.a], B = net.nodes[E.b]; const ux = (B.x - A.x) / E.len, uz = (B.z - A.z) / E.len; const hw = ROAD_TYPES[E.type].w / 2;
    const clr = (n: number) => { let r = 0; for (const e2 of net.nodes[n].edges) if (e2 !== e && net.edges[e2].alive) r = Math.max(r, ROAD_TYPES[net.edges[e2].type].w / 2); return r + 3; };
    const t0 = clr(E.a), t1 = E.len - clr(E.b); const N = this.w.N;
    for (const s of [1, -1]) {
      const nx = -uz * s, nz = ux * s; const f0 = hw + 2.5; let t = t0, first = true;
      while (t < t1 - 6) {
        const px = A.x + ux * (t + 6) + nx * (f0 + 8), pz = A.z + uz * (t + 6) + nz * (f0 + 8); const i = Math.floor(px / TILE), j = Math.floor(pz / TILE);
        if (i < 0 || j < 0 || i >= N || j >= N) { t += 8; continue; } const k = j * N + i; const C = this.cls(k);
        // фонари и деревья по тротуару
        const tk = Math.floor(t / 4);
        if (C && tk % 7 === 0) props.push([A.x + ux * t + nx * (hw + 1), A.z + uz * t + nz * (hw + 1), Math.atan2(-nx, -nz), 1]);
        else if (C && (C.cls === 'house' || C.cls === 'mid' || C.cls === 'panel' || C.cls === 'hist') && tk % 3 === 0 && E.type !== 3) props.push([A.x + ux * t + nx * (hw + 1.6), A.z + uz * t + nz * (hw + 1.6), 0, 2]);
        if (!C) { t += 4; first = false; continue; }
        const hv = h3(e, s * 31 + t | 0, 3);
        let W = Math.min(C.W[0] + (C.W[1] - C.W[0]) * hv, t1 - t); const D = C.D[0] + (C.D[1] - C.D[0]) * h3(e, t | 0, 7);
        if (W < C.W[0] * 0.6) break;
        // участок: от линии тротуара на глубину sb + D (+ двор)
        const x0 = A.x + ux * t + nx * f0, z0 = A.z + uz * t + nz * f0; let Dl = C.sb + D + (C.gap ? 4 : 2);
        let cells = this.free(e, x0, z0, ux, uz, nx, nz, W, Dl);
        if (!cells) { Dl = C.sb + D * 0.6; cells = this.free(e, x0, z0, ux, uz, nx, nz, W, Dl); if (cells) {} }
        if (!cells) { t += 4; first = false; continue; }
        for (const c of cells) this.occ.set(c, -e - 1); let co = this.cellsOf.get(e); if (!co) this.cellsOf.set(e, co = []); co.push(...cells);
        const bw = Math.max(5, W - C.gap), bd = Math.min(D, Dl - C.sb - 1);
        const cx = x0 + ux * W / 2 + nx * (C.sb + bd / 2), cz = z0 + uz * W / 2 + nz * (C.sb + bd / 2);
        out.push({ e, x: cx, z: cz, rot: Math.atan2(-nx, -nz), w: bw, d: bd, k, cls: C.cls, corner: first || t + W > t1 - 8 });
        t += W; first = false;
      }
    }
    return out;
  }
  drop(e: number) { if (!this.byEdge.has(e)) return; for (const c of this.cellsOf.get(e) || []) if (this.occ.get(c) === -e - 1) this.occ.delete(c); this.cellsOf.delete(e); this.byEdge.delete(e); this.props.delete(e); }
  /** Сбросить участки погибших рёбер (после правки сети). */
  gc() { for (const e of [...this.byEdge.keys()]) if (!this.w.net.edges[e]?.alive) this.drop(e); }
  netVer = -1;
}
