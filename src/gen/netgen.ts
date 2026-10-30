// Этап B: правила дорожной сети (mechanics/13-network-generation.md, BALANCE.netgen)
import { RoadNet } from '../world/RoadNet';
import { BALANCE } from '../sim/balance';

const NG = BALANCE.netgen;
export const CLS = ['street', 'avenue', 'highway', 'lane'] as const; // индекс = ROAD_TYPES
const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
/** §1: новый отрезок не ближе parallelMin к почти параллельной дороге (не своей) и не под острым углом к рёбрам узла-начала. */
export function spacingOk(net: RoadNet, ax: number, az: number, bx: number, bz: number, type: number, fromNode = -1): boolean {
  const cls = CLS[type]; const pm = (NG.parallelMin as any)[cls] * 0.5; /* ось–ось: проверяем полосу ±pm/2 от середины и концов */
  const L = Math.hypot(bx - ax, bz - az) || 1; const ux = (bx - ax) / L, uz = (bz - az) / L;
  for (const [px, pz] of [[(ax + bx) / 2, (az + bz) / 2], [bx, bz]]) {
    for (const e of net.edgesNear(px, pz, pm + 20)) {
      const E = net.edges[e]; if (!E.alive) continue; if (fromNode >= 0 && (E.a === fromNode || E.b === fromNode)) continue;
      const A = net.nodes[E.a], B = net.nodes[E.b]; const cos = Math.abs(((B.x - A.x) * ux + (B.z - A.z) * uz) / E.len);
      if (cos > 0.94 && segDist(px, pz, A.x, A.z, B.x, B.z) < pm) return false;
    }
  }
  if (fromNode >= 0) { const N0 = net.nodes[fromNode]; const ma = ((NG.minAngleDeg as any)[cls] ?? 30) * Math.PI / 180;
    for (const e of N0.edges) { const E = net.edges[e]; if (!E.alive) continue; const o = net.nodes[E.a === fromNode ? E.b : E.a]; const c = ((o.x - N0.x) * ux + (o.z - N0.z) * uz) / E.len; if (Math.acos(Math.max(-1, Math.min(1, c))) < ma) return false; } }
  return true;
}
/** Класс меняется только в перекрёстках: в узлах степени 2 с разными типами повышаем младший (шоссе не трогаем). */
export function unifyClasses(net: RoadNet): number {
  let changed = 0;
  for (let pass = 0; pass < 20; pass++) { let ch = 0;
    for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive) continue; const live = N0.edges.filter(e => net.edges[e].alive); if (live.length !== 2) continue;
      const [e1, e2] = live.map(e => net.edges[e]); if (e1.type === e2.type || e1.type === 2 || e2.type === 2) continue;
      const rank = (t: number) => t === 3 ? 0 : t === 0 ? 1 : 2; const hi = rank(e1.type) > rank(e2.type) ? e1.type : e2.type; e1.type = hi; e2.type = hi; ch++; }
    changed += ch; if (!ch) break; }
  return changed;
}
/** §3: связность — union-find, острова подключаются (≤ repairMaxLen) или удаляются (< minIslandEdges). */
export function repairNetwork(net: RoadNet, mainNode: number, okSeg: (ax: number, az: number, bx: number, bz: number) => boolean, log: string[], hwLink?: (a: number, b: number) => void) {
  const stats = { islands0: 0, connected: 0, removed: 0, left: 0 }; const hwTried = new Set<number>(); // повтор (шоссе не сомкнулось) — прямой связью
  for (let pass = 0; pass < NG.repairMaxPasses; pass++) {
    const P = new Int32Array(net.nodes.length).map((_, i) => i); const f = (x: number): number => { while (P[x] !== x) { P[x] = P[P[x]]; x = P[x]; } return x; };
    for (const E of net.edges) if (E.alive) { const a = f(E.a), b = f(E.b); if (a !== b) P[Math.max(a, b)] = Math.min(a, b); }
    const comps = new Map<number, number[]>(); for (let n = 0; n < net.nodes.length; n++) if (net.nodes[n].alive && net.nodes[n].edges.length) { const r = f(n); let c = comps.get(r); if (!c) comps.set(r, c = []); c.push(n); }
    const main = f(mainNode); const mainSet = new Set<number>([main]); // выходы с карты — тоже острова, но их только подключаем
    const islands = [...comps.entries()].filter(([r]) => !mainSet.has(r)).sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
    if (pass === 0) stats.islands0 = islands.length; if (!islands.length) break;
    const mainNodes = [...comps.entries()].filter(([r]) => mainSet.has(r)).flatMap(([, v]) => v);
    for (const [, nodes] of islands) {
      const hasOut = nodes.some(n => net.nodes[n].outside); const maxL = hasOut ? 1e9 : NG.repairMaxLen; let best = { d: Infinity, a: -1, b: -1 };
      for (const a of nodes) { const A = net.nodes[a]; const b = net.findNode(A.x, A.z, maxL, n => mainSet.has(f(n)) && net.nodes[n].edges.length > 0 && net.nodes[n].alive); if (b < 0) continue; const B = net.nodes[b]; const d = Math.hypot(A.x - B.x, A.z - B.z); if (d < best.d && (hasOut || okSeg(A.x, A.z, B.x, B.z))) best = { d, a, b }; }
      const ne = new Set(nodes.flatMap(n => net.nodes[n].edges)).size;
      if (best.a >= 0 && hasOut && hwLink && !hwTried.has(best.a)) { hwTried.add(best.a); hwLink(best.a, best.b); stats.connected++; } // выход с карты отрезан — достраиваем как шоссе (обход по рельефу + развязки/эстакады), а не прямой через кварталы
      else if (best.a >= 0) { const A = net.nodes[best.a], B = net.nodes[best.b]; net.addRoad(A.x, A.z, B.x, B.z, hasOut ? 2 : ne > 50 ? 1 : 0, 2, A.city); stats.connected++; }
      else if (!hasOut && (ne < NG.minIslandEdges || pass === NG.repairMaxPasses - 1)) { for (const n of nodes) for (const e of [...net.nodes[n].edges]) net.removeEdge(e); stats.removed++; }
      else stats.left++;
    }
    void mainNodes;
  }
  log.push(`связность: островов ${stats.islands0}, подключено ${stats.connected}, удалено ${stats.removed}`);
  return stats;
}
/** Проверка связности (для тестов): число компонент живой сети. */
export function components(net: RoadNet): number {
  const P = new Int32Array(net.nodes.length).map((_, i) => i); const f = (x: number): number => { while (P[x] !== x) { P[x] = P[P[x]]; x = P[x]; } return x; };
  for (const E of net.edges) if (E.alive) { const a = f(E.a), b = f(E.b); if (a !== b) P[Math.max(a, b)] = Math.min(a, b); }
  const s = new Set<number>(); for (let n = 0; n < net.nodes.length; n++) if (net.nodes[n].alive && net.nodes[n].edges.some(e => net.edges[e].alive)) s.add(f(n)); return s.size;
}
