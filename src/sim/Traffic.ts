import { World } from '../world/World';
import { ROAD_TYPES } from '../world/RoadNet';
import { MinHeap, mulberry32 } from '../util';

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
  stats = { trips: 0, tripTime: 0, freeTime: 0, despawned: 0, cityTrips: new Float64Array(64), cityTime: new Float64Array(64), cityFree: new Float64Array(64) };
  onArrive: ((v: Veh) => void) | null = null;
  constructor(public world: World) { }
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
        const dir = E.a === u ? 0 : 1; const v = dir ? E.a : E.b; const l = e * 2 + dir;
        const c = this.g[u] + E.len / this.laneSpeed(l) + (nu.edges.length > 2 ? 3 : 0);
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
  green(node: number, edge: number): boolean {
    const net = this.world.net; const N0 = net.nodes[node]; if (N0.edges.length < 3) return true;
    const E = net.edges[edge]; const o = net.nodes[E.a === node ? E.b : E.a];
    const e0 = net.edges[N0.edges[0]]; const o0 = net.nodes[e0.a === node ? e0.b : e0.a];
    const base = Math.atan2(o0.z - N0.z, o0.x - N0.x); const ang = Math.atan2(o.z - N0.z, o.x - N0.x);
    let rel = ((ang - base) % Math.PI + Math.PI * 2) % Math.PI; const grp = rel < Math.PI / 4 || rel > Math.PI * 3 / 4 ? 0 : 1;
    const cyc = 24; const ph = Math.floor((this.time + (node * 7.31) % cyc) / (cyc / 2)) % 2;
    return ph === grp;
  }
  step(dt: number) {
    this.time += dt; this.ensure();
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
  forEachVisible(cx: number, cz: number, R: number, cb: (v: Veh, x: number, z: number, yaw: number) => void) {
    const net = this.world.net; const R2 = R * R;
    for (const l of this.activeLanes) {
      const E = net.edges[l >> 1]; if (!E.alive) continue; const A = net.nodes[(l & 1) ? E.b : E.a], B = net.nodes[(l & 1) ? E.a : E.b];
      const mx = (A.x + B.x) / 2 - cx, mz = (A.z + B.z) / 2 - cz; if (mx * mx + mz * mz > R2 + E.len * E.len) continue;
      const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const off = ROAD_TYPES[E.type].w * 0.25 + 0.3; const yaw = Math.atan2(-dz, dx);
      for (const id of this.lanes[l]) { const v = this.vehs[id]; const s = Math.min(v.s, E.len); cb(v, A.x + dx * s - dz * off, A.z + dz * s + dx * off, yaw); }
    }
  }
  clear() { for (const l of this.activeLanes) { for (const id of this.lanes[l]) { const v = this.vehs[id]; v.alive = false; this.freeIds.push(id); } this.lanes[l].length = 0; this.laneW[l] = 0; } this.activeLanes.clear(); this.active = 0; }
}
