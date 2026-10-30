import { World } from '../world/World';
import { ROAD_TYPES, MOD } from '../world/RoadNet';
import { MinHeap, mulberry32 } from '../util';
import { BALANCE } from './balance';

export interface Veh { id: number; alive: boolean; type: number; path: Int32Array; pi: number; s: number; v: number; w: number; t: number; free: number; city: number; wait: number; color: number; dest: number }
const VLEN = [7, 12];
const CAR_COLORS = [0xd03030, 0x3060c0, 0xe0e0e0, 0x303030, 0x909090, 0xe0b020, 0x30a050, 0x8040a0, 0xf08030, 0x70b0e0];

export class Traffic {
  vehs: Veh[] = []; freeIds: number[] = []; active = 0;
  lanes: number[][] = []; laneW: Float32Array = new Float32Array(1024);
  activeLanes = new Set<number>();
  time = 0; rnd = mulberry32(7);
  cap = 4000; scale = 1; // persons per agent
  camX = 0; camZ = 0; lodR = 2500;
  cache = new Map<number, Int32Array | null>(); cacheVer = -1;
  // A* buffers
  g = new Float64Array(0); from = new Int32Array(0); stamp = new Int32Array(0); stampV = 1; heap = new MinHeap(4096); closed = new Int32Array(0);
  stats = { trips: 0, tripTime: 0, freeTime: 0, despawned: 0, rerouted: 0, cityTrips: new Float64Array(64), cityTime: new Float64Array(64), cityFree: new Float64Array(64) };
  onArrive: ((v: Veh) => void) | null = null;
  constructor(public world: World) { }
  /** этап F (12 §3): сглаженная стоимость проезда полосы t̃, с (EMA costSmoothing), по ней выбираются пути и объезды */
  costT = new Float32Array(0); costClock = 0; rerouteClock = 0; rerouted = 0; rerouteTried = 0;
  laneCost(l: number) { const c = this.costT[l]; if (c > 0) return c; const E = this.world.net.edges[l >> 1]; return E.len / this.laneSpeed(l); }
  updateCosts() {
    const C = BALANCE.congestion; const net = this.world.net; const n = net.edges.length * 2; if (this.costT.length < n) { const a = new Float32Array(n * 2); a.set(this.costT); this.costT = a; }
    for (let l = 0; l < n; l++) { const E = net.edges[l >> 1]; if (!E || !E.alive) continue; const t = E.len / this.laneSpeed(l); const o = this.costT[l]; this.costT[l] = o > 0 ? o + C.costSmoothing * (t - o) : t; }
    this.cache.clear(); // новые поездки сразу видят пробки
  }
  /** этап F (12 §3.4): агент, стоящий в очереди, с вероятностью awareShare перестраивает остаток пути, если выигрыш ≥ порога */
  rerouteStuck() {
    const C = BALANCE.congestion; const net = this.world.net;
    for (const l of this.activeLanes) { const arr = this.lanes[l]; if (!arr.length) continue; const E = net.edges[l >> 1]; const endNode = (l & 1) ? E.a : E.b;
      for (const id of arr) { const v = this.vehs[id]; if (v.wait < C.agentRerouteWaitSec || v.pi >= v.path.length - 2 || this.rnd() > C.awareShare) continue; this.rerouteTried++;
        let old = 0; for (let i = v.pi + 1; i < v.path.length; i++) old += this.laneCost(v.path[i]);
        const nl = v.path[v.pi + 1]; const saved = this.costT[nl]; this.costT[nl] = Math.max(saved, this.laneCost(nl)) + v.wait * 2; // затор впереди — штраф
        const np = this.astar(endNode, v.dest, 15, C.agentRerouteMaxExp); this.costT[nl] = saved; if (!np || !np.length) continue;
        let nw = 0; for (let i = 0; i < np.length; i++) nw += this.laneCost(np[i]); const oldEff = old + v.wait * 2;
        if (np[0] === nl || oldEff - nw < C.agentRerouteMinGainSec || (oldEff - nw) / oldEff < C.rerouteThreshold) continue;
        const p = new Int32Array(v.pi + 1 + np.length); p.set(v.path.subarray(0, v.pi + 1)); p.set(np, v.pi + 1); v.path = p; v.wait = 0; this.rerouted++; this.stats.rerouted++; } }
  }
  ensure() {
    const net = this.world.net; const nE = net.edges.length * 2;
    while (this.lanes.length < nE) this.lanes.push([]);
    if (this.laneW.length < nE) { const n = new Float32Array(nE * 2); n.set(this.laneW); this.laneW = n; }
    const nN = net.nodes.length;
    if (this.g.length < nN) { const L = nN * 2; this.g = new Float64Array(L); this.from = new Int32Array(L); this.stamp = new Int32Array(L); this.closed = new Int32Array(L); }
    if (this.cacheVer !== net.version) { this.cache.clear(); this.cacheVer = net.version; }
  }
  laneLoad(l: number) { const E = this.world.net.edges[l >> 1]; return this.laneW[l] * 7.5 / (E.len * ROAD_TYPES[E.type].lanes); }
  edgeLoad(e: number) { return Math.max(this.laneLoad(e * 2), this.laneLoad(e * 2 + 1)); }
  laneSpeed(l: number) { const E = this.world.net.edges[l >> 1]; const ld = this.laneLoad(l); return ROAD_TYPES[E.type].speed * Math.max(0.12, 1 - 0.85 * Math.min(1, ld * ld)); }
  // A* over directed lanes. typeMask: bitmask of allowed edge types
  astar(src: number, dst: number, typeMask = 15, maxExp = 80000): Int32Array | null {
    if (src === dst) return null;
    this.ensure(); const net = this.world.net; const N = net.nodes; const sv = ++this.stampV;
    const h = this.heap; h.clear(); const T = N[dst];
    this.g[src] = 0; this.from[src] = -1; this.stamp[src] = sv; h.push(src, 0); let exp = 0;
    while (h.size) {
      const u = h.pop(); if (u === dst) break; if (this.closed[u] === sv) continue; this.closed[u] = sv; if (++exp > maxExp) return null;
      const nu = N[u];
      for (const e of nu.edges) {
        const E = net.edges[e]; if (!E.alive || !((1 << E.type) & typeMask)) continue;
        const dir = E.a === u ? 0 : 1; if (dir && ((E.m || 0) & MOD.ONEWAY)) continue; const v = dir ? E.a : E.b; const l = e * 2 + dir;
        const c = this.g[u] + this.laneCost(l) + (nu.edges.length > 2 ? 3 : 0);
        if (this.stamp[v] !== sv || c < this.g[v]) { this.stamp[v] = sv; this.g[v] = c; this.from[v] = l; const nv = N[v]; h.push(v, c + Math.hypot(nv.x - T.x, nv.z - T.z) / 30); }
      }
    }
    if (this.stamp[dst] !== sv) return null;
    const out: number[] = []; let u = dst;
    while (u !== src) { const l = this.from[u]; out.push(l); const E = net.edges[l >> 1]; u = (l & 1) ? E.b : E.a; if (out.length > 100000) return null; }
    out.reverse(); return Int32Array.from(out);
  }
  gateways = new Map<number, number[]>(); gwVer = -1;
  cityGateways(c: number): number[] {
    const net = this.world.net; if (this.gwVer !== net.version) { this.gateways.clear(); this.gwVer = net.version; }
    let g = this.gateways.get(c); if (g) return g; g = [];
    const C = this.world.cities[c];
    for (const id of net.edgesNear(C.x, C.z, C.r * 1.2)) { const E = net.edges[id]; if (!E.alive || E.type !== 2) continue; for (const n of [E.a, E.b]) { const N0 = net.nodes[n]; const d = Math.hypot(N0.x - C.x, N0.z - C.z); if (d < C.r * 1.2 && d > C.r * 0.3 && !g.includes(n)) g.push(n); } }
    this.gateways.set(c, g); return g;
  }
  // hierarchical: local -> highway -> local for intercity trips
  route(src: number, dst: number): Int32Array | null {
    this.ensure(); const key = src * 1048576 + dst; if (this.cache.has(key)) return this.cache.get(key)!;
    const net = this.world.net; const A = net.nodes[src], B = net.nodes[dst];
    let p: Int32Array | null = null;
    const ca = this.world.nearestCity(A.x, A.z, 1.4), cb = this.world.nearestCity(B.x, B.z, 1.4);
    if (ca >= 0 && cb >= 0 && ca !== cb) {
      const ga = this.cityGateways(ca), gb = this.cityGateways(cb);
      if (ga.length && gb.length) {
        const near = (arr: number[], x: number, z: number) => arr.reduce((b, n) => { const d = Math.hypot(net.nodes[n].x - x, net.nodes[n].z - z); return d < b.d ? { n, d } : b; }, { n: -1, d: Infinity }).n;
        const g1 = near(ga, B.x, B.z), g2 = near(gb, A.x, A.z);
        const p1 = src === g1 ? new Int32Array(0) : this.astar(src, g1, 15, 30000);
        const p2 = g1 === g2 ? new Int32Array(0) : this.astar(g1, g2, 4, 60000);
        const p3 = g2 === dst ? new Int32Array(0) : this.astar(g2, dst, 15, 30000);
        if (p1 && p2 && p3) { p = new Int32Array(p1.length + p2.length + p3.length); p.set(p1); p.set(p2, p1.length); p.set(p3, p1.length + p2.length); }
      }
    }
    if (!p) p = this.astar(src, dst);
    if (this.cache.size > 6000) this.cache.clear();
    this.cache.set(key, p); return p;
  }
  spawn(src: number, dst: number, type: number, city: number): boolean {
    if (this.active >= this.cap) return false;
    const path = this.route(src, dst); if (!path || !path.length) return false;
    const l0 = path[0]; const ln = this.lanes[l0]; if (ln.length && this.vehs[ln[ln.length - 1]].s < 10) return false;
    let free = 0; for (let i = 0; i < path.length; i++) { const E = this.world.net.edges[path[i] >> 1]; free += E.len / ROAD_TYPES[E.type].speed; }
    const id = this.freeIds.length ? this.freeIds.pop()! : this.vehs.length;
    const v: Veh = { id, alive: true, type, path, pi: 0, s: 0, v: 5, w: this.scale * (type ? 2 : 1), t: 0, free, city, wait: 0, color: type ? 0xe8e8e8 : CAR_COLORS[Math.floor(this.rnd() * CAR_COLORS.length)], dest: dst };
    this.vehs[id] = v; this.active++; ln.push(id); this.laneW[l0] += v.w; this.activeLanes.add(l0); return true;
  }
  private remove(v: Veh, lane: number, arrived: boolean) {
    v.alive = false; this.active--; this.freeIds.push(v.id); this.laneW[lane] = Math.max(0, this.laneW[lane] - v.w);
    if (arrived) { const s = this.stats; s.trips++; s.tripTime += v.t; s.freeTime += v.free; if (v.city >= 0) { s.cityTrips[v.city] += v.w; s.cityTime[v.city] += v.t * v.w; s.cityFree[v.city] += v.free * v.w; } this.onArrive?.(v); }
    else this.stats.despawned++;
  }
  /** C (17 §1): режим узла. Авто: проспект × проспект и Y-развилка проспектов 30–60° (17 §5.1) — светофор; улицы — приоритет; переулки и узлы шоссе — без регулирования */
  modeCache = new Int8Array(0); modeVer = -1;
  nodeMode(node: number): number {
    const net = this.world.net; if (this.modeVer !== net.version || this.modeCache.length < net.nodes.length) { this.modeCache = new Int8Array(net.nodes.length * 2).fill(-1); this.modeVer = net.version; }
    const c = this.modeCache[node]; if (c >= 0) return c; const N0 = net.nodes[node]; let m = 3;
    if (N0.ctl) m = N0.ctl; else {
      const arms: { t: number; a: number }[] = []; for (const e of N0.edges) { const E = net.edges[e]; if (!E.alive) continue; const o = net.nodes[E.a === node ? E.b : E.a]; arms.push({ t: E.type, a: Math.atan2(o.z - N0.z, o.x - N0.x) }); }
      if (arms.length >= 3 && !arms.some(a => a.t === 2)) {
        const av = arms.filter(a => a.t === 1).length; const TC = BALANCE.trafficControl;
        let yfork = false; if (av >= 2 && arms.length === 3) for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { let d = Math.abs(arms[i].a - arms[j].a) * 180 / Math.PI; if (d > 180) d = 360 - d; if (d >= TC.yForkDeg[0] && d <= TC.yForkDeg[1]) yfork = true; }
        m = av >= 2 || yfork ? 1 : arms.some(a => a.t <= 1) ? 2 : 3;
      }
    }
    this.modeCache[node] = m; return m;
  }
  rank(t: number) { return [1, 2, 3, 0][t]; }
  green(node: number, edge: number): boolean {
    const net = this.world.net; const N0 = net.nodes[node]; if (N0.edges.length < 3) return true;
    const mode = this.nodeMode(node); if (mode === 3) return true;
    const E = net.edges[edge];
    if (mode === 2) { // приоритет: главная (старший класс) едет, второстепенная ждёт разрыва в потоке главной
      let top = 0; for (const e of N0.edges) { const X = net.edges[e]; if (X.alive) top = Math.max(top, this.rank(X.type)); }
      if (this.rank(E.type) >= top) return true;
      const gap = BALANCE.trafficControl.priorityGapM;
      for (const e of N0.edges) { const X = net.edges[e]; if (!X.alive || e === edge || this.rank(X.type) < top) continue; const l = e * 2 + (X.b === node ? 0 : 1); const arr = this.lanes[l]; if (arr && arr.length) { const v = this.vehs[arr[0]]; if (X.len - v.s < gap && v.v > 1) return false; } }
      return true;
    }
    const o = net.nodes[E.a === node ? E.b : E.a];
    const e0 = net.edges[N0.edges[0]]; const o0 = net.nodes[e0.a === node ? e0.b : e0.a];
    const base = Math.atan2(o0.z - N0.z, o0.x - N0.x); const ang = Math.atan2(o.z - N0.z, o.x - N0.x);
    let rel = ((ang - base) % Math.PI + Math.PI * 2) % Math.PI; const grp = rel < Math.PI / 4 || rel > Math.PI * 3 / 4 ? 0 : 1;
    const cyc = BALANCE.trafficControl.simCycle; const ph = Math.floor((this.time + (node * 7.31) % cyc) / (cyc / 2)) % 2;
    return ph === grp;
  }
  step(dt: number) {
    this.time += dt; this.ensure();
    const C = BALANCE.congestion; this.costClock += dt; if (this.costClock >= C.costUpdateSec || this.costT.length < this.world.net.edges.length * 2) { this.costClock = 0; this.updateCosts(); }
    this.rerouteClock += dt; if (this.rerouteClock >= C.agentRerouteTicks * 0.5) { this.rerouteClock = 0; this.rerouteStuck(); }
    const net = this.world.net; const moves: [Veh, number][] = [];
    for (const l of this.activeLanes) {
      const arr = this.lanes[l]; if (!arr.length) { this.activeLanes.delete(l); continue; }
      const E = net.edges[l >> 1];
      if (!E.alive) { for (const id of arr) this.remove(this.vehs[id], l, false); arr.length = 0; continue; }
      const len = E.len; const v0b = this.laneSpeed(l); const vmax = ROAD_TYPES[E.type].speed; const endNode = (l & 1) ? E.a : E.b;
      let leave = 0;
      for (let idx = 0; idx < arr.length; idx++) {
        const v = this.vehs[arr[idx]]; v.t += dt;
        let gap: number, vl = 0; let canGo = false; let next = -1;
        if (idx > leave) { const L = this.vehs[arr[idx - 1]]; gap = L.s - v.s - VLEN[L.type]; vl = L.v; }
        else {
          const toEnd = len - v.s;
          if (v.pi >= v.path.length - 1) { gap = toEnd + 50; canGo = true; }
          else {
            next = v.path[v.pi + 1]; const nE = net.edges[next >> 1];
            if (!nE || !nE.alive) { gap = toEnd + 20; canGo = true; next = -2; }
            else {
              const tail = this.lanes[next]; const space = tail.length ? this.vehs[tail[tail.length - 1]].s - VLEN[v.type] : 1e9;
              canGo = space > 1 && (toEnd > 25 || this.green(endNode, l >> 1));
              gap = canGo ? toEnd + Math.min(space, 60) : toEnd - 1;
            }
          }
        }
        const vt = (v.type ? 0.8 : 1) * v0b;
        const near = Math.abs(net.nodes[endNode].x - this.camX) + Math.abs(net.nodes[endNode].z - this.camZ) < this.lodR;
        if (near) { // IDM
          const sst = 2 + v.v * 1.3 + v.v * (v.v - vl) / 3.5; const acc = 1.6 * (1 - Math.pow(v.v / Math.max(1, vt), 4) - Math.pow(Math.max(0, sst) / Math.max(0.5, gap), 2));
          v.v = Math.max(0, Math.min(v.v + acc * dt, vmax * 1.05));
        } else v.v = vt; // aggregated mode
        v.v = Math.min(v.v, Math.max(0, gap) / dt);
        v.s += v.v * dt;
        if (v.v < 0.3) v.wait += dt; else v.wait = 0;
        if (v.s >= len) {
          if (v.pi >= v.path.length - 1 || next === -2) { this.remove(v, l, next !== -2); leave++; continue; }
          if (canGo) { v.s -= len; v.pi++; moves.push([v, next]); this.laneW[l] = Math.max(0, this.laneW[l] - v.w); leave++; continue; }
          v.s = len - 0.05;
        }
        if (v.wait > 120 && idx === leave) { this.remove(v, l, false); leave++; }
      }
      if (leave) arr.splice(0, leave);
    }
    for (const [v, nl] of moves) { const arr = this.lanes[nl]; arr.push(v.id); this.laneW[nl] += v.w; this.activeLanes.add(nl); }
  }
  /** Точка на полосе l на расстоянии s от её начала (со смещением вправо). */
  lanePt(l: number, s: number): [number, number, number, number] {
    const net = this.world.net; const E = net.edges[l >> 1]; const A = net.nodes[(l & 1) ? E.b : E.a], B = net.nodes[(l & 1) ? E.a : E.b];
    const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const off = ROAD_TYPES[E.type].w * 0.25 + 0.3; const ss = Math.max(0, Math.min(E.len, s));
    return [A.x + dx * ss - dz * off, A.z + dz * ss + dx * off, dx, dz];
  }
  forEachVisible(cx: number, cz: number, R: number, cb: (v: Veh, x: number, z: number, yaw: number, dy: number) => void, lead = 0) { // lead — сим-секунды после последнего тика: экстраполяция позиции
    const net = this.world.net; const R2 = R * R;
    // этап C: поворот в узле по квадратичной кривой Безье (вход — последние Rt м ребра, выход — первые Rt м следующего)
    const curve = (la: number, lb: number, t: number, Ra: number, Rb: number): [number, number, number] => {
      const Ea = net.edges[la >> 1]; const p0 = this.lanePt(la, Ea.len - Ra), pe = this.lanePt(la, Ea.len), ps = this.lanePt(lb, 0), p2 = this.lanePt(lb, Rb);
      const cxp = (pe[0] + ps[0]) / 2, czp = (pe[1] + ps[1]) / 2; const u = 1 - t;
      const x = u * u * p0[0] + 2 * u * t * cxp + t * t * p2[0], z = u * u * p0[1] + 2 * u * t * czp + t * t * p2[1];
      const tx = 2 * u * (cxp - p0[0]) + 2 * t * (p2[0] - cxp), tz = 2 * u * (czp - p0[1]) + 2 * t * (p2[1] - czp);
      return [x, z, Math.atan2(-tz, tx)];
    };
    const rt = (a: number, b: number) => Math.min(9, net.edges[a >> 1].len * 0.4, net.edges[b >> 1].len * 0.4);
    for (const l of this.activeLanes) {
      const E = net.edges[l >> 1]; if (!E.alive) continue; const A = net.nodes[(l & 1) ? E.b : E.a], B = net.nodes[(l & 1) ? E.a : E.b];
      const mx = (A.x + B.x) / 2 - cx, mz = (A.z + B.z) / 2 - cz; if (mx * mx + mz * mz > R2 + E.len * E.len) continue;
      const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const off = ROAD_TYPES[E.type].w * 0.25 + 0.3; const yaw = Math.atan2(-dz, dx);
      const lvE = E.lv || 0; const w = this.world; const offAt = (ss: number) => lvE ? w.edgeOff(l >> 1, (l & 1) ? E.len - ss : ss) : 0; // этап C: высота на эстакаде/в тоннеле
      for (const id of this.lanes[l]) { const v = this.vehs[id]; const s = Math.min(v.s + v.v * lead, E.len);
        const nl = v.path[v.pi + 1], pl = v.pi > 0 ? v.path[v.pi - 1] : undefined;
        if (nl !== undefined && net.edges[nl >> 1]?.alive) { const Rt = rt(l, nl); if (s > E.len - Rt && Rt > 1) { const [x, z, y] = curve(l, nl, (s - (E.len - Rt)) / Rt * 0.5, Rt, Rt); cb(v, x, z, y, offAt(s)); continue; } }
        if (pl !== undefined && net.edges[pl >> 1]?.alive) { const Rt = rt(pl, l); if (s < Rt && Rt > 1) { const [x, z, y] = curve(pl, l, 0.5 + s / Rt * 0.5, Rt, Rt); cb(v, x, z, y, offAt(s)); continue; } }
        cb(v, A.x + dx * s - dz * off, A.z + dz * s + dx * off, yaw, offAt(s)); }
    }
  }
  clear() { for (const l of this.activeLanes) { for (const id of this.lanes[l]) { const v = this.vehs[id]; v.alive = false; this.freeIds.push(id); } this.lanes[l].length = 0; this.laneW[l] = 0; } this.activeLanes.clear(); this.active = 0; }
}
