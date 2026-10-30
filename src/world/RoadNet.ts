export interface RNode { x: number; z: number; edges: number[]; alive: boolean; city: number; outside: boolean }
/** lv: уровень (0 земля, 1 эстакада/мост, −1 тоннель; mechanics/11 §5); m: модули профиля, биты MOD (mechanics/11 §2) */
export interface REdge { a: number; b: number; type: number; len: number; alive: boolean; city: number; lv?: number; m?: number }
export const MOD = { TRAM: 1, BUS: 2 } as const;
export const LEVEL_NAMES = ['Тоннель', 'Земля', 'Эстакада']; // индекс = lv + 1
export const ROAD_TYPES = [
  { name: 'Улица', w: 9, speed: 13, lanes: 1, cost: 60, upkeep: 0.25, color: 0x5d6066 },
  { name: 'Проспект', w: 15, speed: 17, lanes: 2, cost: 140, upkeep: 0.6, color: 0x505359 },
  { name: 'Шоссе', w: 18, speed: 28, lanes: 2, cost: 260, upkeep: 1.0, color: 0x45484d },
  { name: 'Переулок', w: 6, speed: 8, lanes: 1, cost: 35, upkeep: 0.15, color: 0x75726c },
];
const NC = 64, EC = 128;
const key = (cx: number, cz: number) => cx * 131072 + cz;

export class RoadNet {
  ver = 0;
  nodes: RNode[] = [];
  edges: REdge[] = [];
  nodeGrid = new Map<number, number[]>();
  edgeGrid = new Map<number, number[]>();
  version = 0;
  onEdgeAdded: ((e: number) => void) | null = null;
  onEdgeRemoved: ((e: number) => void) | null = null;

  newNode(x: number, z: number, city = -1): number {
    const id = this.nodes.length;
    this.nodes.push({ x, z, edges: [], alive: true, city, outside: false });
    const k = key(Math.floor(x / NC), Math.floor(z / NC));
    let c = this.nodeGrid.get(k); if (!c) this.nodeGrid.set(k, (c = []));
    c.push(id); return id;
  }
  nearestNode(x: number, z: number, maxR: number, filter?: (n: number) => boolean): number {
    let best = -1, bd = maxR * maxR;
    const r = Math.ceil(maxR / NC), cx = Math.floor(x / NC), cz = Math.floor(z / NC);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      const c = this.nodeGrid.get(key(cx + i, cz + j)); if (!c) continue;
      for (const n of c) { const nd = this.nodes[n]; if (!nd.alive || (filter && !filter(n))) continue; const d = (nd.x - x) ** 2 + (nd.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    return best;
  }
  // nearest node with expanding search
  findNode(x: number, z: number, maxR = 4000, filter?: (n: number) => boolean): number {
    for (let r = 128; r <= maxR * 2; r *= 2) { const n = this.nearestNode(x, z, Math.min(r, maxR), filter); if (n >= 0) return n; if (r >= maxR) break; }
    return -1;
  }
  private edgeCells(e: REdge, cb: (k: number) => void) {
    const A = this.nodes[e.a], B = this.nodes[e.b];
    const x0 = Math.floor(Math.min(A.x, B.x) / EC), x1 = Math.floor(Math.max(A.x, B.x) / EC);
    const z0 = Math.floor(Math.min(A.z, B.z) / EC), z1 = Math.floor(Math.max(A.z, B.z) / EC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) cb(key(i, j));
  }
  edgeBetween(a: number, b: number): number {
    for (const e of this.nodes[a].edges) { const E = this.edges[e]; if (E.alive && ((E.a === a && E.b === b) || (E.a === b && E.b === a))) return e; }
    return -1;
  }
  addEdge(a: number, b: number, type: number, city = -1, lv = 0, m = 0): number {
    if (a === b) return -1;
    const ex = this.edgeBetween(a, b); if (ex >= 0) { if (this.edges[ex].type < type) this.edges[ex].type = type; return ex; }
    const A = this.nodes[a], B = this.nodes[b];
    const id = this.edges.length;
    const e: REdge = { a, b, type, len: Math.max(1, Math.hypot(A.x - B.x, A.z - B.z)), alive: true, city: city >= 0 ? city : (A.city >= 0 ? A.city : B.city) }; if (lv) e.lv = lv; if (m) e.m = m;
    this.edges.push(e); A.edges.push(id); B.edges.push(id);
    this.edgeCells(e, k => { let c = this.edgeGrid.get(k); if (!c) this.edgeGrid.set(k, (c = [])); c.push(id); });
    this.version++; this.onEdgeAdded?.(id);
    return id;
  }
  removeEdge(id: number) {
    const e = this.edges[id]; if (!e.alive) return; e.alive = false; this.ver++;
    for (const n of [e.a, e.b]) { const nd = this.nodes[n]; nd.edges = nd.edges.filter(x => x !== id); }
    this.edgeCells(e, k => { const c = this.edgeGrid.get(k); if (c) { const i = c.indexOf(id); if (i >= 0) c.splice(i, 1); } });
    for (const n of [e.a, e.b]) { const nd = this.nodes[n]; if (nd.edges.length === 0 && !nd.outside) nd.alive = false; }
    this.version++; this.onEdgeRemoved?.(id);
  }
  splitEdge(id: number, x: number, z: number): number {
    const e = this.edges[id]; const { a, b, type, city } = e; const lv = e.lv || 0, m = e.m || 0;
    const n = this.newNode(x, z, this.nodes[a].city >= 0 ? this.nodes[a].city : this.nodes[b].city);
    this.removeEdge(id); this.nodes[a].alive = true; this.nodes[b].alive = true;
    this.addEdge(a, n, type, city, lv, m); this.addEdge(n, b, type, city, lv, m);
    return n;
  }
  edgesNear(x: number, z: number, r: number): number[] {
    const out = new Set<number>(); const x0 = Math.floor((x - r) / EC), x1 = Math.floor((x + r) / EC), z0 = Math.floor((z - r) / EC), z1 = Math.floor((z + r) / EC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const c = this.edgeGrid.get(key(i, j)); if (c) for (const e of c) out.add(e); }
    return [...out];
  }
  nearestEdge(x: number, z: number, maxR: number): { e: number; t: number; d: number } | null {
    let best: any = null;
    for (const id of this.edgesNear(x, z, maxR)) {
      const e = this.edges[id]; if (!e.alive) continue; const A = this.nodes[e.a], B = this.nodes[e.b];
      const dx = B.x - A.x, dz = B.z - A.z; const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (z - A.z) * dz) / L2));
      const d = Math.hypot(A.x + dx * t - x, A.z + dz * t - z);
      if (d <= maxR && (!best || d < best.d)) best = { e: id, t, d };
    }
    return best;
  }
  // resolve point to node: snap to node, else split edge, else create
  pointNode(x: number, z: number, snap: number, city = -1): number {
    const n = this.nearestNode(x, z, snap); if (n >= 0) return n;
    const ne = this.nearestEdge(x, z, snap * 0.6);
    if (ne && ne.t > 0.02 && ne.t < 0.98) { const e = this.edges[ne.e]; const A = this.nodes[e.a], B = this.nodes[e.b]; return this.splitEdge(ne.e, A.x + (B.x - A.x) * ne.t, A.z + (B.z - A.z) * ne.t); }
    return this.newNode(x, z, city);
  }
  // add road segment with automatic intersections. returns created edge ids
  addRoad(ax: number, az: number, bx: number, bz: number, type: number, snap = 10, city = -1, lv = 0, m = 0): number[] {
    const na = this.pointNode(ax, az, snap, city);
    const nb = this.pointNode(bx, bz, snap, city);
    if (na === nb) return [];
    const A = this.nodes[na], B = this.nodes[nb];
    const pts: { t: number; n: number }[] = [{ t: 0, n: na }, { t: 1, n: nb }];
    const minx = Math.min(A.x, B.x), maxx = Math.max(A.x, B.x), minz = Math.min(A.z, B.z), maxz = Math.max(A.z, B.z);
    const cand = new Set<number>();
    const x0 = Math.floor(minx / EC), x1 = Math.floor(maxx / EC), z0 = Math.floor(minz / EC), z1 = Math.floor(maxz / EC);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const c = this.edgeGrid.get(key(i, j)); if (c) for (const e of c) cand.add(e); }
    const rx = B.x - A.x, rz = B.z - A.z;
    const hits: { t: number; e: number; u: number }[] = [];
    for (const id of cand) {
      const e = this.edges[id]; if (!e.alive) continue;
      if (e.a === na || e.b === na || e.a === nb || e.b === nb) continue;
      if ((e.lv || 0) !== lv) continue; // этап C: разные уровни пересекаются без перекрёстка (путепровод/тоннель)
      const C = this.nodes[e.a], D = this.nodes[e.b]; const sx = D.x - C.x, sz = D.z - C.z;
      const den = rx * sz - rz * sx; if (Math.abs(den) < 1e-9) continue;
      const t = ((C.x - A.x) * sz - (C.z - A.z) * sx) / den; const u = ((C.x - A.x) * rz - (C.z - A.z) * rx) / den;
      if (t > 0.001 && t < 0.999 && u > -0.001 && u < 1.001) hits.push({ t, e: id, u });
    }
    hits.sort((p, q) => p.t - q.t);
    for (const h of hits) {
      const e = this.edges[h.e]; if (!e.alive) continue;
      const px = A.x + rx * h.t, pz = A.z + rz * h.t;
      let n: number;
      const C = this.nodes[e.a], D = this.nodes[e.b];
      if (Math.hypot(C.x - px, C.z - pz) < 6) n = e.a; else if (Math.hypot(D.x - px, D.z - pz) < 6) n = e.b; else n = this.splitEdge(h.e, px, pz);
      pts.push({ t: h.t, n });
    }
    pts.sort((p, q) => p.t - q.t);
    const out: number[] = [];
    for (let i = 0; i + 1 < pts.length; i++) { if (pts[i].n === pts[i + 1].n) continue; const id = this.addEdge(pts[i].n, pts[i + 1].n, type, city, lv, m); if (id >= 0) out.push(id); }
    return out;
  }
  serialize() {
    const N = this.nodes.length, E = this.edges.length;
    const nx = new Float32Array(N), nz = new Float32Array(N), nc = new Int16Array(N), nf = new Uint8Array(N);
    this.nodes.forEach((n, i) => { nx[i] = n.x; nz[i] = n.z; nc[i] = n.city; nf[i] = (n.alive ? 1 : 0) | (n.outside ? 2 : 0); });
    const ea = new Int32Array(E), eb = new Int32Array(E), et = new Uint8Array(E), ec = new Int16Array(E), el = new Int8Array(E), em = new Uint8Array(E);
    this.edges.forEach((e, i) => { ea[i] = e.a; eb[i] = e.b; et[i] = e.alive ? e.type : 255; ec[i] = e.city; el[i] = e.lv || 0; em[i] = e.m || 0; });
    return { nx, nz, nc, nf, ea, eb, et, ec, el, em };
  }
  static deserialize(d: any): RoadNet {
    const r = new RoadNet();
    for (let i = 0; i < d.nx.length; i++) { const id = r.newNode(d.nx[i], d.nz[i], d.nc[i]); r.nodes[id].alive = !!(d.nf[i] & 1); r.nodes[id].outside = !!(d.nf[i] & 2); }
    for (let i = 0; i < d.ea.length; i++) {
      if (d.et[i] === 255) { r.edges.push({ a: d.ea[i], b: d.eb[i], type: 0, len: 1, alive: false, city: d.ec[i] }); continue; }
      r.addEdge(d.ea[i], d.eb[i], d.et[i], d.ec[i], d.el?.[i] || 0, d.em?.[i] || 0);
    }
    return r;
  }
}
