/**
 * Этап D: единый транспортный граф для линий ОТ (mechanics/14 §1, решение 2 «один граф»).
 * Узлы: дорожные узлы [0, Nr) и рельсовые узлы [Nr, Nr + Nrail). Рёбра — ссылки на РЕАЛЬНЫЕ рёбра сетей:
 *  - трамвай: дорожные рёбра с модулем MOD.TRAM + рельсовые рёбра RAIL.TRAM; стыковка — рельсовый узел ↔ дорожный узел ≤ LINK_R м;
 *  - метро: рельсовые рёбра RAIL.METRO; ж/д: рельсовые рёбра RAIL.TRAIN.
 * Автобус по-прежнему ходит по дорожному графу (Traffic.astar). Трамвай в полосе дороги и на обособленном пути
 * едет по одним и тем же рёбрам, по которым их видит остальная симуляция.
 */
import type { World } from '../world/World';
import { MOD } from '../world/RoadNet';
import { RAIL } from '../world/World';

export const LINK_R = 15;
/** тип линии (LINE_TYPES) → разрешённые рёбра */
export function modeOf(lineType: number) { return lineType === 1 ? 'tram' : lineType === 2 ? 'metro' : lineType === 3 ? 'train' : 'bus'; }
type Mode = ReturnType<typeof modeOf>;
const RAIL_OF: Record<Mode, number> = { bus: -1, tram: RAIL.TRAM, metro: RAIL.METRO, train: RAIL.TRAIN };

export interface Step { node: number; x: number; z: number; dy: number; roadEdge: number }

export class TrackGraph {
  constructor(public w: World) { }
  get Nr() { return this.w.net.nodes.length; }
  pos(n: number) { const r = n >= this.Nr; const N = r ? this.w.rail.nodes[n - this.Nr] : this.w.net.nodes[n]; return { x: N.x, z: N.z, rail: r }; }
  okRoad(mode: Mode, e: number) { const E = this.w.net.edges[e]; return E.alive && mode === 'tram' && !!((E.m || 0) & MOD.TRAM); }
  okRail(mode: Mode, e: number) { const E = this.w.rail.edges[e]; return E.alive && E.type === RAIL_OF[mode]; }
  /** соседи узла: [сосед, длина, дорожное ребро или −1, рельсовое ребро или −1] */
  nbrs(mode: Mode, n: number): [number, number, number, number][] {
    const out: [number, number, number, number][] = []; const Nr = this.Nr, w = this.w;
    if (n < Nr) { for (const e of w.net.nodes[n].edges) if (this.okRoad(mode, e)) { const E = w.net.edges[e]; out.push([E.a === n ? E.b : E.a, E.len, e, -1]); }
      if (mode === 'tram') { const N = w.net.nodes[n]; for (const m of this.railNear(N.x, N.z)) out.push([Nr + m, Math.hypot(w.rail.nodes[m].x - N.x, w.rail.nodes[m].z - N.z), -1, -1]); } }
    else { const m = n - Nr; for (const e of w.rail.nodes[m].edges) if (this.okRail(mode, e)) { const E = w.rail.edges[e]; out.push([Nr + (E.a === m ? E.b : E.a), E.len, -1, e]); }
      if (mode === 'tram') { const N = w.rail.nodes[m]; const r = w.net.nearestNode(N.x, N.z, LINK_R); if (r >= 0 && w.net.nodes[r].edges.some(e => this.okRoad(mode, e))) out.push([r, Math.hypot(w.net.nodes[r].x - N.x, w.net.nodes[r].z - N.z), -1, -1]); } }
    return out;
  }
  railNear(x: number, z: number) { const w = this.w; const out: number[] = []; for (const e of w.rail.edgesNear(x, z, LINK_R + 2)) { const E = w.rail.edges[e]; if (!E.alive || E.type !== RAIL.TRAM) continue; for (const m of [E.a, E.b]) { const N = w.rail.nodes[m]; if (Math.hypot(N.x - x, N.z - z) <= LINK_R && !out.includes(m)) out.push(m); } } return out; }
  /** ближайший узел графа, пригодный для режима, в радиусе R */
  findNode(mode: Mode, x: number, z: number, R = 200): number {
    let best = -1, bd = R; const w = this.w;
    for (const e of w.rail.edgesNear(x, z, R)) if (this.okRail(mode, e)) { const E = w.rail.edges[e]; for (const m of [E.a, E.b]) { const N = w.rail.nodes[m]; const d = Math.hypot(N.x - x, N.z - z); if (d < bd) { bd = d; best = this.Nr + m; } } }
    if (mode === 'tram') for (const e of w.net.edgesNear(x, z, R)) if (this.okRoad(mode, e)) { const E = w.net.edges[e]; for (const m of [E.a, E.b]) { const N = w.net.nodes[m]; const d = Math.hypot(N.x - x, N.z - z); if (d < bd) { bd = d; best = m; } } }
    return best;
  }
  /** A* по единому графу; возвращает шаги с высотой (эстакада/тоннель/метро) и дорожным ребром для учёта пробок */
  path(mode: Mode, a: number, b: number, maxExp = 60000): Step[] | null {
    if (a === b) return [];
    const pb = this.pos(b); const g = new Map<number, number>([[a, 0]]); const prev = new Map<number, [number, number, number]>(); const open: [number, number][] = [[a, 0]]; let exp = 0;
    const h = (n: number) => { const p = this.pos(n); return Math.hypot(p.x - pb.x, p.z - pb.z); };
    while (open.length && exp++ < maxExp) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i][1] < open[bi][1]) bi = i; const [u] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
      if (u === b) break; const gu = g.get(u)!;
      for (const [v, L, re, ra] of this.nbrs(mode, u)) { const ng = gu + L; if (ng < (g.get(v) ?? Infinity)) { g.set(v, ng); prev.set(v, [u, re, ra]); open.push([v, ng + h(v)]); } }
    }
    if (!prev.has(b)) return null;
    const chain: Step[] = []; let v = b;
    while (v !== a) { const [u, re, ra] = prev.get(v)!; const p = this.pos(v);
      // высота вдоль ребра: дискретизация по 20 м, чтобы рампы эстакад/тоннелей читались
      const pu = this.pos(u); const L = Math.hypot(p.x - pu.x, p.z - pu.z); const n = re >= 0 || ra >= 0 ? Math.max(1, Math.ceil(L / 20)) : 1; const seg: Step[] = [];
      for (let k = n; k >= 1; k--) { const t = k / n; const x = pu.x + (p.x - pu.x) * t, z = pu.z + (p.z - pu.z) * t; let dy = 0;
        if (re >= 0) { const E = this.w.net.edges[re]; const s = E.a === u ? t * E.len : (1 - t) * E.len; dy = this.w.edgeOff(re, s); }
        if (ra >= 0) { const E = this.w.rail.edges[ra]; const s = E.a === u - this.Nr ? t * E.len : (1 - t) * E.len; dy = this.w.edgeOff(ra, s, this.w.rail); }
        seg.push({ node: k === n ? v : -1, x, z, dy, roadEdge: re }); }
      chain.push(...seg); v = u; }
    chain.reverse(); return chain;
  }
}
