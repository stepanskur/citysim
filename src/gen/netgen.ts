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
/** USER_FEEDBACK_2 A1/A2/A6: чистка сети после генерации.
 *  A1 — «дорога в дороге» и близкие параллельные: почти коллинеарное ребро, оба конца которого лежат в коридоре другого ребра, удаляется (оставляем старший класс/длиннее);
 *  A2 — тупик ближе порога к чужой дороге достраивается до неё (с разделением ребра);
 *  A6 — короткий изолированный отрезок проспекта (без соседних проспектов/шоссе) понижается до улицы. */
const RANK = [1, 2, 3, 0];
type P2 = { x: number; z: number };
/** Два почти параллельных отрезка перекрываются вдоль оси на ≥ 60 % короткого, и в зоне перекрытия расходятся не больше thr. */
export function overlapDup(A: P2, B: P2, P: P2, Q: P2, thr: number): boolean {
  const L1 = Math.hypot(B.x - A.x, B.z - A.z), L2 = Math.hypot(Q.x - P.x, Q.z - P.z); if (L1 < 0.5 || L2 < 0.5) return false;
  const [S, T, Ls, Lt] = L1 <= L2 ? [[A, B], [P, Q], L1, L2] as const : [[P, Q], [A, B], L2, L1] as const;
  const ux = (T[1].x - T[0].x) / Lt, uz = (T[1].z - T[0].z) / Lt; if (Math.abs(((S[1].x - S[0].x) * ux + (S[1].z - S[0].z) * uz) / Ls) < 0.97) return false;
  const pr = (p: P2) => (p.x - T[0].x) * ux + (p.z - T[0].z) * uz, lat = (p: P2) => Math.abs((p.x - T[0].x) * uz - (p.z - T[0].z) * ux);
  const s0 = pr(S[0]), s1 = pr(S[1]); const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(Lt, Math.max(s0, s1)); if (hi - lo < Ls * 0.6) return false;
  return lat(S[0]) <= thr + Math.max(0, -Math.min(s0, s1), Math.max(s0, s1) - Lt) && lat(S[1]) <= thr + Math.max(0, -Math.min(s0, s1), Math.max(s0, s1) - Lt) && Math.max(lat(S[0]), lat(S[1])) <= thr;
}
export function tidyNetwork(net: RoadNet, W: number[]): { dup: number; dead: number; shortAv: number; tangle: number; feeder: number } {
  const T = BALANCE.netgen as any; const deadThr = T.deadEndJoin ?? 18, avMin = T.avenueMinLen ?? 120; let dup = 0, dead = 0, shortAv = 0, tangle = 0, feeder = 0;
  for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!E.alive || E.type === 2 || E.lv) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
    for (const f of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 30)) { if (f === e) continue; const F = net.edges[f]; if (!F.alive || F.lv) continue; const P = net.nodes[F.a], Q = net.nodes[F.b];
      const cos = Math.abs(((B.x - A.x) * (Q.x - P.x) + (B.z - A.z) * (Q.z - P.z)) / (E.len * F.len)); if (cos < 0.97) continue;
      const thr = (W[E.type] + W[F.type]) / 2 + 4; if (!overlapDup(A, B, P, Q, thr)) continue;
      if (E.type === 2 && F.type !== 2) continue; if (F.type === 2 && E.type !== 2) { net.removeEdge(e); dup++; break; }
      if (RANK[E.type] > RANK[F.type] || (RANK[E.type] === RANK[F.type] && E.len > F.len)) continue; // e — младший/короче: удаляем его
      net.removeEdge(e); dup++; break; } }
  // «усики»: тупиковое ребро короче порога — огрызок у перекрёстка, убираем (повторно, цепочкой)
  for (let it = 0; it < 3; it++) for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const live = N0.edges.filter(e => net.edges[e].alive); if (live.length !== 1) continue; const E = net.edges[live[0]]; if (E.type === 2 || E.len >= deadThr) continue; const far = E.a === n ? E.b : E.a; if (net.nodes[far].edges.filter(e => net.edges[e].alive).length < 3) continue; net.removeEdge(live[0]); dead++; }
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const live = N0.edges.filter(e => net.edges[e].alive); if (live.length !== 1) continue;
    const own = net.edges[live[0]]; if (own.type === 2 || own.lv) continue; let best: { e: number; t: number; d: number } | null = null;
    for (const f of net.edgesNear(N0.x, N0.z, deadThr + 10)) { const F = net.edges[f]; if (!F.alive || f === live[0] || F.a === n || F.b === n || F.lv || F.type === 2) continue; const P = net.nodes[F.a], Q = net.nodes[F.b];
      const dx = Q.x - P.x, dz = Q.z - P.z; const t = Math.max(0, Math.min(1, ((N0.x - P.x) * dx + (N0.z - P.z) * dz) / (dx * dx + dz * dz || 1))); const d = Math.hypot(P.x + dx * t - N0.x, P.z + dz * t - N0.z); if (d < deadThr && (!best || d < best.d)) best = { e: f, t, d }; }
    if (!best) continue; const F = net.edges[best.e]; const P = net.nodes[F.a], Q = net.nodes[F.b]; const tx = P.x + (Q.x - P.x) * best.t, tz = P.z + (Q.z - P.z) * best.t;
    const m = best.t < 0.05 ? F.a : best.t > 0.95 ? F.b : net.splitEdge(best.e, tx, tz); if (m === n || net.edgeBetween(n, m) >= 0) continue;
    if (Math.hypot(net.nodes[m].x - N0.x, net.nodes[m].z - N0.z) < 0.5) continue; net.addEdge(n, m, own.type === 3 ? 3 : 0, own.city); dead++; }
  shortAv += fixAvenueDeadEnds(net);
  // 13: разворотные тупики не ближе culDeSacSpacing друг к другу — ближний короткий тупик убирается (если его ребро короче соседнего и не рвёт сеть)
  { const gap = T.culDeSacSpacing ?? 80; const ends = () => net.nodes.map((N0, n) => n).filter(n => { const N0 = net.nodes[n]; return N0.alive && !N0.outside && N0.edges.filter(e => net.edges[e].alive).length === 1; });
    const de = ends(); for (const a of de) { const A = net.nodes[a]; const la = A.edges.filter(e => net.edges[e].alive); if (la.length !== 1) continue; const Ea = net.edges[la[0]]; if (Ea.type === 2) continue;
      for (const b of de) { if (b === a) continue; const B = net.nodes[b]; const lb = B.edges.filter(e => net.edges[e].alive); if (lb.length !== 1 || Math.hypot(A.x - B.x, A.z - B.z) >= gap) continue; const Eb = net.edges[lb[0]];
        if (Ea.len > Eb.len) continue; const far = Ea.a === a ? Ea.b : Ea.a; if (net.nodes[far].edges.filter(e => net.edges[e].alive).length < 3) continue; net.removeEdge(la[0]); dead++; break; } } }
  // A6 (13: minChainLen): связная цепочка проспектов короче minChainLen.avenue, не примыкающая к шоссе, — улица
  { const minAv = T.minChainLen?.avenue ?? avMin; const seen = new Set<number>();
    for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!E.alive || E.type !== 1 || seen.has(e)) continue;
      const chain: number[] = [], st = [e]; seen.add(e); let len = 0, hw = false;
      while (st.length) { const x = st.pop()!; chain.push(x); len += net.edges[x].len; for (const nn of [net.edges[x].a, net.edges[x].b]) for (const f of net.nodes[nn].edges) { const F = net.edges[f]; if (!F.alive) continue; if (F.type === 2) hw = true; if (F.type === 1 && !seen.has(f)) { seen.add(f); st.push(f); } } }
      if (len < minAv && !hw) for (const x of chain) { net.edges[x].type = 0; shortAv++; } } }
  // A7: «сплетения» — два ребра из одного узла под острым углом (< tangleDeg): младшее/короткое убираем, если его дальний конец не станет тупиком
  const ang = (n: number, e: number) => { const E = net.edges[e]; const o = net.nodes[E.a === n ? E.b : E.a], N0 = net.nodes[n]; return Math.atan2(o.z - N0.z, o.x - N0.x); };
  const lim = (T.tangleDeg ?? 22) * Math.PI / 180;
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.edges.some(e => net.edges[e].alive && net.edges[e].type === 2)) continue;
    const L = () => N0.edges.filter(e => net.edges[e].alive && !net.edges[e].lv);
    for (let guard = 0; guard < 4; guard++) { const es = L(); let hit = -1;
      for (let i = 0; i < es.length && hit < 0; i++) for (let j = i + 1; j < es.length; j++) { let d = Math.abs(ang(n, es[i]) - ang(n, es[j])); if (d > Math.PI) d = 2 * Math.PI - d; if (d >= lim) continue;
        const Ei = net.edges[es[i]], Ej = net.edges[es[j]]; if (Ei.type === 2 && Ej.type === 2) continue;
        const lose = RANK[Ei.type] < RANK[Ej.type] || (RANK[Ei.type] === RANK[Ej.type] && Ei.len < Ej.len) ? es[i] : es[j]; const El = net.edges[lose]; if (El.type === 2) continue;
        const far = El.a === n ? El.b : El.a; if (net.nodes[far].edges.filter(e => net.edges[e].alive).length < 2) continue; hit = lose; break; }
      if (hit < 0) break; net.removeEdge(hit); tangle++; } }
  // A4: цепочка шоссе → проспект → улица → переулок. Узел, где наземное шоссе встречает только улицы/переулки: ближайшее по направлению ребро
  // и его продолжение (до feederLen) становятся проспектом; переулок, примыкающий к шоссе, — улицей.
  const fl = T.feederLen ?? 300;
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive) continue; const es = N0.edges.filter(e => net.edges[e].alive && !net.edges[e].lv);
    const hw = es.filter(e => net.edges[e].type === 2); if (!hw.length) continue; const rest = es.filter(e => net.edges[e].type !== 2); if (!rest.length) continue;
    for (const e of rest) if (net.edges[e].type === 3) { net.edges[e].type = 0; feeder++; }
    const hasAv = rest.some(e => net.edges[e].type === 1); const pick = hasAv ? -1 : rest.slice().sort((a, b) => net.edges[b].len - net.edges[a].len)[0];
    for (const e of rest) { const E = net.edges[e]; if (e === pick || E.type === 1) continue; const far = E.a === n ? E.b : E.a; // прочие улицы у шоссе: убрать (если не рвёт), иначе поднять до проспекта
      net.removeEdge(e); feeder++; } // тупиковый огрызок тоже убираем (иначе — проспект-тупик)
    if (hasAv) continue;
    let cur = n, e = pick, run = 0;
    while (e >= 0 && run < fl) { const E = net.edges[e]; if (E.type === 2) break; if (E.type !== 1) { E.type = 1; feeder++; } run += E.len; const nx = E.a === cur ? E.b : E.a; const h0 = ang(cur, e); cur = nx;
      let best = -1, bd = 0.5; for (const f of net.nodes[cur].edges) { if (f === e || !net.edges[f].alive || net.edges[f].lv || net.edges[f].type === 2) continue; let d = Math.abs(ang(cur, f) - h0); if (d > Math.PI) d = 2 * Math.PI - d; if (d < bd) { bd = d; best = f; } } e = best; } }
  return { dup, dead, shortAv, tangle, feeder };
}
/** Шоссе: короткие «шпильки» у стыков трасс (узел степени 2, излом > 12°, плечо < 30 м) снимаются — узел выкидывается, концы соединяются напрямую. */
export function smoothHighwayKinks(net: RoadNet): number { let fixed = 0;
  for (let it = 0; it < 3; it++) for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive) continue; const L = N0.edges.filter(e => net.edges[e].alive); if (L.length !== 2 || L.some(e => net.edges[e].type !== 2)) continue;
    const [e1, e2] = L.map(e => net.edges[e]); if (Math.min(e1.len, e2.len) > 60) continue; const sameLv = (e1.lv || 0) === (e2.lv || 0);
    const o1 = e1.a === n ? e1.b : e1.a, o2 = e2.a === n ? e2.b : e2.a; const A = net.nodes[o1], B = net.nodes[o2];
    const k = 180 - Math.acos(Math.max(-1, Math.min(1, ((A.x - N0.x) * (B.x - N0.x) + (A.z - N0.z) * (B.z - N0.z)) / (e1.len * e2.len)))) * 180 / Math.PI; if (k <= 12 || o1 === o2) continue;
    if (!sameLv || net.edgeBetween(o1, o2) >= 0) { const t = e1.len / (e1.len + e2.len); N0.x = A.x + (B.x - A.x) * t; N0.z = A.z + (B.z - A.z) * t; e1.len = Math.hypot(A.x - N0.x, A.z - N0.z); e2.len = Math.hypot(B.x - N0.x, B.z - N0.z); fixed++; continue; } // стык уровней (рампа): узел ставится на прямую
    net.removeEdge(L[0]); net.removeEdge(L[1]); net.addEdge(o1, o2, 2, -1, e1.lv || 0); fixed++; }
  return fixed; }

/** 13: проспект не заканчивается тупиком — от тупика до первого перекрёстка (степень ≥ 3) цепочка становится улицей. */
export function fixAvenueDeadEnds(net: RoadNet): number { let k = 0;
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const L = N0.edges.filter(e => net.edges[e].alive); if (L.length !== 1 || net.edges[L[0]].type !== 1) continue;
    const ch: number[] = []; let cur = n, e = L[0]; for (let g = 0; g < 200 && e >= 0; g++) { const E = net.edges[e]; if (E.type !== 1) break; ch.push(e); cur = E.a === cur ? E.b : E.a; const nx = net.nodes[cur].edges.filter(x => net.edges[x].alive && x !== e); e = nx.length === 1 ? nx[0] : -1; }
    const hwE = net.nodes[cur].edges.filter(x => net.edges[x].alive && net.edges[x].type === 2); const atHw = hwE.length > 0;
    if (atHw && hwE.length === 2 && net.nodes[cur].edges.filter(x => net.edges[x].alive && net.edges[x].type !== 2 && !ch.includes(x)).length === 0) { const C = net.nodes[cur]; const d = hwE.map(x => { const E = net.edges[x], o = net.nodes[E.a === cur ? E.b : E.a]; return [(o.x - C.x) / E.len, (o.z - C.z) / E.len]; });
      if (180 - Math.acos(Math.max(-1, Math.min(1, d[0][0] * d[1][0] + d[0][1] * d[1][1]))) * 180 / Math.PI > 12) continue; } // снятие подводки оставило бы излом шоссе — это стык трасс, подводку оставляем
    for (const x of ch) { if (atHw) net.removeEdge(x); else net.edges[x].type = 0; k++; } } // подводка-тупик от шоссе — убрать целиком
  return k; }
/** QA3 №6: финальный проход — тупик ближе порога к чужой дороге (в одном уровне) соединяется с ней (узел или разделение ребра); если зазор совсем мал — тупик переносится на дорогу. */
export function closeDeadEndGaps(net: RoadNet, thr: number): number {
  let made = 0; const live = (n: number) => net.nodes[n].edges.filter(e => net.edges[e].alive);
  const X = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => { const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz, den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) return false; const t = ((cx - ax) * sz - (cz - az) * sx) / den, u = ((cx - ax) * rz - (cz - az) * rx) / den; return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98; };
  // эстакада/шоссе, обрывающиеся в поле рядом с узлом: опустить последний пролёт и привязать к ближайшему узлу (≤ 1.5·thr)
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const L = live(n); if (L.length !== 1) continue; const own = net.edges[L[0]]; if (own.type !== 2) continue;
    let bn = -1, bd = thr * 1.5; for (const f of net.edgesNear(N0.x, N0.z, thr * 1.5 + 10)) { const F = net.edges[f]; if (!F.alive || F.lv || f === L[0]) continue; for (const k of [F.a, F.b]) { if (k === n) continue; const d = Math.hypot(net.nodes[k].x - N0.x, net.nodes[k].z - N0.z); if (d < bd) { bd = d; bn = k; } } }
    if (bn < 0) continue; const far = own.a === n ? own.b : own.a; { const F0 = net.nodes[far], B0 = net.nodes[bn]; const a1 = Math.atan2(N0.z - F0.z, N0.x - F0.x), a2 = Math.atan2(B0.z - F0.z, B0.x - F0.x); let da = Math.abs(a1 - a2); if (da > Math.PI) da = 2 * Math.PI - da; if (da > 6 * Math.PI / 180) continue; } /* не создавать излом шоссе */ const { type, city } = own; const m = (own as any).m || 0;
    net.removeEdge(L[0]); net.nodes[far].alive = true; net.addEdge(far, bn, type, city, 0, m); made++; }
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const L = live(n); if (L.length !== 1) continue; const own = net.edges[L[0]]; if (own.lv || own.type === 2) continue;
    const far = own.a === n ? own.b : own.a; let best = -1, bd = thr, bt = 0;
    for (const f of net.edgesNear(N0.x, N0.z, thr + 40)) { const F = net.edges[f]; if (!F.alive || F.lv || F.type === 2 || f === L[0] || F.a === n || F.b === n || F.a === far || F.b === far) continue; const A = net.nodes[F.a], B = net.nodes[F.b];
      const vx = B.x - A.x, vz = B.z - A.z, l2 = vx * vx + vz * vz; if (!l2) continue; const t = Math.max(0, Math.min(1, ((N0.x - A.x) * vx + (N0.z - A.z) * vz) / l2)); const d = Math.hypot(A.x + vx * t - N0.x, A.z + vz * t - N0.z); if (d < bd) { bd = d; best = f; bt = t; } }
    { // тупик улицы упёрся в шоссе/эстакаду ближе порога — укорачиваем его (обрыв не вплотную к шоссе)
      let hd = thr; for (const f of net.edgesNear(N0.x, N0.z, thr + 60)) { const F = net.edges[f]; if (!F.alive || !(F.type === 2 || F.lv)) continue; const A = net.nodes[F.a], B = net.nodes[F.b]; const vx = B.x - A.x, vz = B.z - A.z, l2 = vx * vx + vz * vz; if (!l2) continue; const t = Math.max(0, Math.min(1, ((N0.x - A.x) * vx + (N0.z - A.z) * vz) / l2)); hd = Math.min(hd, Math.hypot(A.x + vx * t - N0.x, A.z + vz * t - N0.z)); }
      if (hd < thr && hd < bd) { const cut = thr - hd + 4, F0 = net.nodes[far]; const { type, city } = own; const len = own.len;
        if (len - cut >= 20) { const k = (len - cut) / len; net.removeEdge(L[0]); F0.alive = true; const nn = net.newNode(F0.x + (N0.x - F0.x) * k, F0.z + (N0.z - F0.z) * k, N0.city); net.addEdge(far, nn, type, city, 0); made++; }
        else if (live(far).length >= 3) { net.removeEdge(L[0]); made++; }
        continue; } }
    if (best < 0) continue; const F = net.edges[best]; const A = net.nodes[F.a], B = net.nodes[F.b];
    let tgt: number; const px = A.x + (B.x - A.x) * bt, pz = A.z + (B.z - A.z) * bt;
    const sn = BALANCE.netgen.regMinNodeM; if (bt * F.len < sn) tgt = F.a; else if ((1 - bt) * F.len < sn) tgt = F.b; else tgt = -1; // не плодить огрызков < regMinNodeM
    const T = tgt >= 0 ? net.nodes[tgt] : { x: px, z: pz }; const small = bd < 2.5; const sx = small ? net.nodes[far].x : N0.x, sz = small ? net.nodes[far].z : N0.z;
    let bad = false; for (const g of net.edgesNear((sx + T.x) / 2, (sz + T.z) / 2, Math.hypot(T.x - sx, T.z - sz) / 2 + 30)) { const G = net.edges[g]; if (!G.alive || G.lv || g === best || g === L[0]) continue; const P = net.nodes[G.a], Q = net.nodes[G.b]; if (X(sx, sz, T.x, T.z, P.x, P.z, Q.x, Q.z)) { bad = true; break; } }
    if (!bad && tgt >= 0) { const lim = BALANCE.netgen.regAcuteDeg * Math.PI / 180, an = Math.atan2(sz - T.z, sx - T.x); for (const g of net.nodes[tgt].edges) { const G = net.edges[g]; if (!G.alive) continue; const o = net.nodes[G.a === tgt ? G.b : G.a]; let d = Math.abs(Math.atan2(o.z - T.z, o.x - T.x) - an); if (d > Math.PI) d = 2 * Math.PI - d; if (d < lim) { bad = true; break; } } } // без острых углов в узле привязки
    if (bad) continue; if (tgt < 0) tgt = net.splitEdge(best, px, pz); if (tgt < 0) continue;
    const { type, city } = own; if (small) { net.removeEdge(L[0]); net.nodes[far].alive = true; if (far !== tgt) net.addEdge(far, tgt, type, city, 0); } else net.addEdge(n, tgt, type, city, 0);
    made++; }
  return made;
}

/* ===== Регуляризация сети улиц (Степан/QA3 №4–10): метрики и чистка до нуля ===== */
type NM = { close: number; acute: number; deadNear: number; par: number; cross: number; shortAv: number; S: { k: string; x: number; z: number }[] };
const segX = (a: P2, b: P2, c: P2, d: P2) => { const den = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x); if (Math.abs(den) < 1e-9) return false;
  const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / den, u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / den; return t > 1e-3 && t < 1 - 1e-3 && u > 1e-3 && u < 1 - 1e-3; };
const dPS = (p: P2, a: P2, b: P2) => { const vx = b.x - a.x, vz = b.z - a.z, l = vx * vx + vz * vz; const t = l ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l)) : 0; return Math.hypot(a.x + t * vx - p.x, a.z + t * vz - p.z); };
const liveE = (net: RoadNet, n: number) => net.nodes[n].edges.filter(e => net.edges[e].alive);
const isStreet = (net: RoadNet, e: number) => { const E = net.edges[e]; return E.alive && E.type !== 2 && !(E.lv || 0); };
const nodeHasHw = (net: RoadNet, n: number) => liveE(net, n).some(e => net.edges[e].type === 2 || (net.edges[e].lv || 0) !== 0);
const angAt = (net: RoadNet, n: number, e: number) => { const E = net.edges[e]; const o = net.nodes[E.a === n ? E.b : E.a], N0 = net.nodes[n]; return Math.atan2(o.z - N0.z, o.x - N0.x); };
const dAng = (a: number, b: number) => { let d = Math.abs(a - b) % (2 * Math.PI); return d > Math.PI ? 2 * Math.PI - d : d; };
/** Метрики качества сети (то же, что считает QA3): узлы улиц ближе minNode, острые углы между уличными рёбрами в узле, тупики ближе deadNear к чужому ребру,
 *  параллельные улицы ближе parM без общего узла, пересечения в уровне без узла, цепочки проспектов короче avMin (не у шоссе). */
export function netMetrics(net: RoadNet): NM {
  const T = BALANCE.netgen; const R: NM = { close: 0, acute: 0, deadNear: 0, par: 0, cross: 0, shortAv: 0, S: [] }; const lim = T.regAcuteDeg * Math.PI / 180;
  const push = (k: string, x: number, z: number) => { if (R.S.length < 40) R.S.push({ k, x: Math.round(x), z: Math.round(z) }); };
  for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!E.alive) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
    if (isStreet(net, e) && E.len < T.regMinNodeM && !nodeHasHw(net, E.a) && !nodeHasHw(net, E.b)) { R.close++; push('close', A.x, A.z); }
    for (const f of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 20)) { if (f <= e) continue; const F = net.edges[f]; if (!F.alive) continue; const P = net.nodes[F.a], Q = net.nodes[F.b];
      const sh = E.a === F.a || E.a === F.b || E.b === F.a || E.b === F.b;
      if (!sh && (E.lv || 0) === (F.lv || 0) && segX(A, B, P, Q)) { R.cross++; push('cross', A.x, A.z); }
      if (!sh && isStreet(net, e) && isStreet(net, f) && E.len > 20 && F.len > 20) { const da = dAng(Math.atan2(B.z - A.z, B.x - A.x), Math.atan2(Q.z - P.z, Q.x - P.x)); if (Math.min(da, Math.PI - da) < 15 * Math.PI / 180) {
        const d = dPS({ x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, P, Q); if (d > 1 && d < T.regParM) { R.par++; push('par', (A.x + B.x) / 2, (A.z + B.z) / 2); } } } } }
  for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive) continue; const es = liveE(net, n);
    const st = es.filter(e => isStreet(net, e)); let bad = false; for (let i = 0; i < st.length && !bad; i++) for (let j = i + 1; j < st.length; j++) if (dAng(angAt(net, n, st[i]), angAt(net, n, st[j])) < lim) { bad = true; break; }
    if (bad && !nodeHasHw(net, n)) { R.acute++; push('acute', N0.x, N0.z); }
    if (es.length === 1 && !N0.outside && isStreet(net, es[0])) { for (const f of net.edgesNear(N0.x, N0.z, T.regDeadNearM + 2)) { const F = net.edges[f]; if (!F.alive || F.a === n || F.b === n) continue; if (dPS(N0, net.nodes[F.a], net.nodes[F.b]) < T.regDeadNearM) { R.deadNear++; push('dead', N0.x, N0.z); break; } } } }
  { const seen = new Set<number>(); for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!E.alive || E.type !== 1 || seen.has(e)) continue; let len = 0, hw = false; const st = [e]; seen.add(e);
      while (st.length) { const x = st.pop()!; len += net.edges[x].len; for (const nn of [net.edges[x].a, net.edges[x].b]) for (const f of net.nodes[nn].edges) { const F = net.edges[f]; if (!F.alive) continue; if (F.type === 2) hw = true; if (F.type === 1 && !seen.has(f)) { seen.add(f); st.push(f); } } }
      if (len < T.regAvMinM && !hw) { R.shortAv++; push('shortAv', net.nodes[E.a].x, net.nodes[E.a].z); } } }
  return R;
}
/** новое ребро a–o не пересекает чужие рёбра в уровне */
function freeSeg(net: RoadNet, a: number, o: number, skip: Set<number>) { const A = net.nodes[a], O = net.nodes[o];
  for (const f of net.edgesNear((A.x + O.x) / 2, (A.z + O.z) / 2, Math.hypot(A.x - O.x, A.z - O.z) / 2 + 10)) { if (skip.has(f)) continue; const F = net.edges[f]; if (!F.alive || F.lv || F.a === a || F.b === a || F.a === o || F.b === o) continue; if (segX(A, O, net.nodes[F.a], net.nodes[F.b])) return false; }
  return true; }
/** стянуть узел b в узел a (рёбра b переходят к a) */
function contract(net: RoadNet, a: number, b: number): boolean {
  const eb = liveE(net, b); const skip = new Set(eb); for (const f of eb) { const F = net.edges[f]; const o = F.a === b ? F.b : F.a; if (o === a) continue; if (!freeSeg(net, a, o, skip)) return false; }
  for (const f of eb) { const F = net.edges[f]; const o = F.a === b ? F.b : F.a; net.removeEdge(f); if (o !== a) net.addEdge(a, o, F.type, F.city, F.lv || 0, F.m || 0); }
  net.nodes[a].alive = true; return true; }
/** узел, ставший степени 2 с почти прямым продолжением, не трогаем; тупиковые огрызки короче stub — убираем цепочкой */
function pruneStubs(net: RoadNet, stub: number) { let k = 0;
  for (let it = 0; it < 4; it++) for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const es = liveE(net, n); if (es.length !== 1 || !isStreet(net, es[0])) continue;
    const E = net.edges[es[0]]; const far = E.a === n ? E.b : E.a; if (E.len < stub && liveE(net, far).length >= 3) { net.removeEdge(es[0]); k++; } }
  return k; }
/** удалить ребро, только если концы остаются связаны (иначе — откат) */
function safeRemove(net: RoadNet, e: number): boolean { const E = net.edges[e]; const { a, b } = E; net.removeEdge(e);
  const seen = new Set([a]), st = [a]; let ok = false; while (st.length && seen.size < 20000) { const x = st.pop()!; if (x === b) { ok = true; break; } for (const f of net.nodes[x].edges) { const F = net.edges[f]; if (!F.alive) continue; const o = F.a === x ? F.b : F.a; if (!seen.has(o)) { seen.add(o); st.push(o); } } }
  if (!ok && liveE(net, a).length && liveE(net, b).length) { net.nodes[a].alive = net.nodes[b].alive = true; net.addEdge(a, b, E.type, E.city, E.lv || 0, E.m || 0); return false; } return true; }
/** удалить ребро-мост: если отрезанная часть мала (≤ maxE рёбер) — убрать её целиком; иначе откат */
function forceRemove(net: RoadNet, e: number, maxE = 40): boolean { const E = net.edges[e]; if (!E.alive) return false; const { a, b } = E; net.removeEdge(e);
  const comp = (s0: number) => { const seen = new Set([s0]), st = [s0], es = new Set<number>(); while (st.length && es.size <= maxE) { const x = st.pop()!; for (const f of net.nodes[x].edges) { const F = net.edges[f]; if (!F.alive) continue; es.add(f); const o = F.a === x ? F.b : F.a; if (!seen.has(o)) { seen.add(o); st.push(o); } } } return { seen, es }; };
  const A = comp(a); if (A.seen.has(b)) return true; const B = comp(b); const small = A.es.size <= B.es.size ? A : B;
  if (small.es.size > maxE || [...small.seen].some(n => net.nodes[n].outside || nodeHasHw(net, n))) { net.nodes[a].alive = net.nodes[b].alive = true; net.addEdge(a, b, E.type, E.city, E.lv || 0, E.m || 0); return false; }
  for (const f of small.es) net.removeEdge(f); return true; }
export function regularizeNetwork(net: RoadNet, log: string[]): NM {
  const T = BALANCE.netgen; const lim = T.regAcuteDeg * Math.PI / 180; let ops = 0;
  for (let pass = 0; pass < T.regPasses; pass++) { let ch = 0;
    // 1) короткие уличные рёбра (< regMinNodeM) стягиваются: узел меньшей степени сливается в больший
    for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!isStreet(net, e) || E.len >= T.regMinNodeM) continue; if (nodeHasHw(net, E.a) || nodeHasHw(net, E.b)) continue;
      const da = liveE(net, E.a).length, db = liveE(net, E.b).length; const [keep, drop] = net.nodes[E.b].outside || db > da ? [E.b, E.a] : [E.a, E.b]; if (net.nodes[drop].outside) continue;
      if (contract(net, keep, drop) || (!net.nodes[keep].outside && contract(net, drop, keep))) ch++; else if (da === 1 || db === 1) { net.removeEdge(e); ch++; } else if (safeRemove(net, e) || (net.edgeBetween(E.a, E.b) >= 0 && forceRemove(net, net.edgeBetween(E.a, E.b)))) ch++; }
    // 2) острые углы между улицами в узле: убираем младшее/короткое ребро
    for (let n = 0; n < net.nodes.length; n++) { if (!net.nodes[n].alive || nodeHasHw(net, n)) continue;
      for (let g = 0; g < 4; g++) { const st = liveE(net, n).filter(e => isStreet(net, e)); let hit = -1;
        for (let i = 0; i < st.length && hit < 0; i++) for (let j = i + 1; j < st.length; j++) { if (dAng(angAt(net, n, st[i]), angAt(net, n, st[j])) >= lim) continue; const Ei = net.edges[st[i]], Ej = net.edges[st[j]];
          hit = RANK[Ei.type] < RANK[Ej.type] || (RANK[Ei.type] === RANK[Ej.type] && Ei.len < Ej.len) ? st[i] : st[j]; break; }
        if (hit < 0) break; if (safeRemove(net, hit)) { ch++; continue; }
        /* мост сети: острый отросток переводим на дальний конец соседнего ребра (o1–o2), если не пересекает */
        { const o1 = net.edges[hit].a === n ? net.edges[hit].b : net.edges[hit].a; hit = net.edgeBetween(n, o1); if (hit < 0) break; const H = net.edges[hit]; const oth = liveE(net, n).filter(e => e !== hit && isStreet(net, e)).sort((x, y) => dAng(angAt(net, n, x), angAt(net, n, hit)) - dAng(angAt(net, n, y), angAt(net, n, hit)))[0];
          let o2 = -1; if (oth !== undefined) { const O = net.edges[oth]; o2 = O.a === n ? O.b : O.a; if (o1 === o2 || net.edgeBetween(o1, o2) >= 0 || !freeSeg(net, o1, o2, new Set([hit, oth]))) o2 = -1; else { const P1 = net.nodes[o1], P2 = net.nodes[o2]; const a12 = Math.atan2(P2.z - P1.z, P2.x - P1.x), a21 = Math.atan2(P1.z - P2.z, P1.x - P2.x); if (liveE(net, o1).some(e => e !== hit && dAng(angAt(net, o1, e), a12) < lim) || liveE(net, o2).some(e => dAng(angAt(net, o2, e), a21) < lim)) o2 = -1; } }
          if (o2 < 0) { const N1 = net.nodes[o1]; const own = liveE(net, o1).filter(e => e !== hit);
            for (const c of net.nodesNear(N1.x, N1.z, 160).filter(c => c !== n && c !== o1 && net.nodes[c].alive && liveE(net, c).length && !nodeHasHw(net, c)).sort((p, q) => Math.hypot(net.nodes[p].x - N1.x, net.nodes[p].z - N1.z) - Math.hypot(net.nodes[q].x - N1.x, net.nodes[q].z - N1.z))) {
              if (net.edgeBetween(o1, c) >= 0 || !freeSeg(net, o1, c, new Set([hit]))) continue; const a1 = Math.atan2(net.nodes[c].z - N1.z, net.nodes[c].x - N1.x); if (own.some(e => dAng(angAt(net, o1, e), a1) < lim)) continue;
              const C = net.nodes[c]; const a2 = Math.atan2(N1.z - C.z, N1.x - C.x); if (liveE(net, c).some(e => dAng(angAt(net, c, e), a2) < lim)) continue; o2 = c; break; } }
          if (o2 < 0 && oth !== undefined) { const O = net.edges[oth]; const fo = O.a === n ? O.b : O.a, N0 = net.nodes[n], F0 = net.nodes[fo], N1 = net.nodes[o1];
            for (const fr of [0.5, 0.35, 0.65]) { const L = O.len * fr; if (L < T.regMinNodeM || O.len - L < T.regMinNodeM) continue; const x = N0.x + (F0.x - N0.x) * fr, z = N0.z + (F0.z - N0.z) * fr;
              const an = Math.atan2(N1.z - z, N1.x - x), a1 = Math.atan2(N0.z - z, N0.x - x), a2 = Math.atan2(F0.z - z, F0.x - x); if (dAng(an, a1) < lim || dAng(an, a2) < lim || Math.hypot(N1.x - x, N1.z - z) < T.regMinNodeM) continue;
              const tmp = net.newNode(x, z); const okS = freeSeg(net, o1, tmp, new Set([hit, oth])); net.nodes[tmp].alive = false; if (!okS) continue; o2 = net.splitEdge(oth, x, z); break; } }
          if (o2 < 0) { if (forceRemove(net, hit)) { ch++; continue; } break; } net.addEdge(o1, o2, H.type, H.city); net.removeEdge(hit); ch++; } } }
    // 3) параллельные улицы ближе regParM без общего узла: короткую/младшую убираем
    for (let e = 0; e < net.edges.length; e++) { if (!isStreet(net, e)) continue; const E = net.edges[e]; const A = net.nodes[E.a], B = net.nodes[E.b]; if (E.len <= 20) continue;
      for (const f of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 20)) { if (f === e || !isStreet(net, f)) continue; const F = net.edges[f]; if (F.len <= 20 || E.a === F.a || E.a === F.b || E.b === F.a || E.b === F.b) continue; const P = net.nodes[F.a], Q = net.nodes[F.b];
        const da = dAng(Math.atan2(B.z - A.z, B.x - A.x), Math.atan2(Q.z - P.z, Q.x - P.x)); if (Math.min(da, Math.PI - da) >= 15 * Math.PI / 180) continue;
        const d = Math.min(dPS({ x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 }, P, Q), dPS({ x: (P.x + Q.x) / 2, z: (P.z + Q.z) / 2 }, A, B)); if (d <= 1 || d >= T.regParM) continue;
        const lose = RANK[E.type] < RANK[F.type] || (RANK[E.type] === RANK[F.type] && E.len <= F.len) ? e : f; if (!safeRemove(net, lose)) continue; ch++; if (lose === e) break; } }
    // 4) тупики у чужого ребра ближе regDeadNearM: подключить (closeDeadEndGaps), иначе — убрать огрызок
    ch += closeDeadEndGaps(net, T.deadEndCloseM);
    for (let n = 0; n < net.nodes.length; n++) { const N0 = net.nodes[n]; if (!N0.alive || N0.outside) continue; const es = liveE(net, n); if (es.length !== 1 || !isStreet(net, es[0])) continue;
      for (const f of net.edgesNear(N0.x, N0.z, T.regDeadNearM + 2)) { const F = net.edges[f]; if (!F.alive || F.a === n || F.b === n) continue; if (dPS(N0, net.nodes[F.a], net.nodes[F.b]) < T.regDeadNearM) { net.removeEdge(es[0]); ch++; break; } } }
    ch += pruneStubs(net, T.regStubM);
    { const gap = (T as any).culDeSacSpacing ?? 80; const de = net.nodes.map((_, n) => n).filter(n => net.nodes[n].alive && !net.nodes[n].outside && liveE(net, n).length === 1 && isStreet(net, liveE(net, n)[0]));
      for (const a of de) { const la = liveE(net, a); if (la.length !== 1) continue; const A = net.nodes[a];
        for (const b of de) { if (b === a) continue; const lb = liveE(net, b); if (lb.length !== 1 || Math.hypot(A.x - net.nodes[b].x, A.z - net.nodes[b].z) >= gap) continue; if (net.edges[la[0]].len > net.edges[lb[0]].len) continue;
          const Ea = net.edges[la[0]]; const far = Ea.a === a ? Ea.b : Ea.a; if (liveE(net, far).length < 3) continue; net.removeEdge(la[0]); ch++; break; } } }
    // 5) цепочки проспектов короче regAvMinM без выхода к шоссе — улицы
    { const seen = new Set<number>(); for (let e = 0; e < net.edges.length; e++) { const E = net.edges[e]; if (!E.alive || E.type !== 1 || seen.has(e)) continue; let len = 0, hw = false; const chain: number[] = [], st = [e]; seen.add(e);
        while (st.length) { const x = st.pop()!; chain.push(x); len += net.edges[x].len; for (const nn of [net.edges[x].a, net.edges[x].b]) for (const f of net.nodes[nn].edges) { const F = net.edges[f]; if (!F.alive) continue; if (F.type === 2) hw = true; if (F.type === 1 && !seen.has(f)) { seen.add(f); st.push(f); } } }
        if (len < T.regAvMinM && !hw) { for (const x of chain) net.edges[x].type = 0; ch++; } } }
    // 6) пересечение в уровне без узла (улица × что угодно того же уровня): общий узел в точке пересечения
    for (let e = 0; e < net.edges.length; e++) { if (!isStreet(net, e)) continue; const E = net.edges[e]; const A = net.nodes[E.a], B = net.nodes[E.b];
      for (const f of net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 10)) { const F = net.edges[f]; if (f === e || !F.alive || (F.lv || 0) || F.a === E.a || F.a === E.b || F.b === E.a || F.b === E.b) continue; const P = net.nodes[F.a], Q = net.nodes[F.b]; if (!segX(A, B, P, Q)) continue;
        const den = (B.x - A.x) * (Q.z - P.z) - (B.z - A.z) * (Q.x - P.x); const t = ((P.x - A.x) * (Q.z - P.z) - (P.z - A.z) * (Q.x - P.x)) / den; const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        if ([A, B, P, Q].some(p => Math.hypot(p.x - x, p.z - z) < T.regMinNodeM) && (safeRemove(net, e) || (net.edgeBetween(E.a, E.b) >= 0 && forceRemove(net, net.edgeBetween(E.a, E.b))))) { ch++; break; } /* пересечение у самого узла — дало бы огрызок < regMinNodeM */
        if (!E.alive) break; const { a, b, type, city } = E; const m2 = net.splitEdge(f, x, z); net.removeEdge(e); net.nodes[a].alive = net.nodes[b].alive = true; net.addEdge(a, m2, type, city); net.addEdge(m2, b, type, city); ch++; break; } }
    ops += ch; if (!ch) break; }
  const m = netMetrics(net); log.push(`регуляризация сети: правок ${ops}; узлы<${T.regMinNodeM} м ${m.close}, острые ${m.acute}, тупики у дорог ${m.deadNear}, параллели ${m.par}, пересечения ${m.cross}, короткие проспекты ${m.shortAv}`); return m;
}
