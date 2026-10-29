import { RoadNet, ROAD_TYPES } from './RoadNet';
import { TILE, CHUNK, SIZES, K, Z, markRoadTiles } from './consts';
import type { WorldData, CityInfo } from '../gen/worldgen';
import { lerp, clamp } from '../util';
import { Subregions } from './Subregions';

export class World {
  seed: number; sizeIdx: number; N: number; M: number; NV: number;
  heights: Float32Array; resource: Uint8Array; zone: Uint8Array; bld: Uint16Array; kind: Uint8Array; cityOf: Uint8Array; road: Uint8Array; style: Uint8Array;
  landValue: Float32Array; // coarse
  pollution: Float32Array; // coarse
  transitCov: Float32Array; // coarse
  GC = 8; GN: number;
  cities: CityInfo[];
  net: RoadNet;
  chunksN: number;
  /** подрегионы: каждый город = подрегион (диаграмма Вороного по взвешенному расстоянию до центра). owned[i]=1 — подрегион принадлежит игроку */
  sub!: Subregions; nbrs: { name: string; node: number; x: number; z: number; side: number }[] = [];
  // --- территория для src/routes (08/09): владелец 0 = игрок, >0 = ИИ-город, -1 = свободная земля ---
  rel = new Map<string, number>();
  ownerAt(x: number, z: number) { return this.sub.ownerAt(x, z); }
  isAI(o: number) { return o !== 0; }
  ownerName(o: number) { return o === 0 ? 'Вы' : o < 0 ? 'Свободная земля (казна)' : `${this.cities[o]?.name ?? 'Регион ' + o} (ИИ)`; }
  relation(a: number, b: number) { return this.rel.get(a < b ? a + ':' + b : b + ':' + a) ?? 55; }
  addRelation(a: number, b: number, d: number) { const k = a < b ? a + ':' + b : b + ':' + a; this.rel.set(k, Math.max(0, Math.min(100, this.relation(a, b) + d))); }
  canBuild(x: number, z: number) { return this.sub.ownerAt(x, z) === 0; }
  /** город (агрегат экономики) для тайла: в своём подрегионе — ближайший город того же владельца */
  cityForTile(x: number, z: number) { const o = this.sub.ownerAt(x, z); let best = -1, bd = Infinity; for (const c of this.cities) { const co = this.sub.ownerAt(c.x, c.z); if (o >= 0 && co !== o) continue; const d = Math.hypot(c.x - x, c.z - z) / c.r; if (d < bd) { bd = d; best = c.id; } } return best >= 0 ? best : this.nearestCity(x, z, 99); }
  zoneHook: ((k: number, z: number) => void) | null = null;
  bldHook: ((k: number, ok: number, ol: number, nk: number, nl: number) => void) | null = null;
  setBld(k: number, kind: number, level: number) { const ok = this.kind[k], ol = this.bld[k]; if (ok === kind && ol === level) return; this.kind[k] = level ? kind : 0; this.bld[k] = level; this.bldHook?.(k, ok, ol, this.kind[k], level); this.dirtyBld.add(this.chunkOfTile(k % this.N, (k / this.N) | 0)); }
  dirtyTerrain = new Set<number>(); dirtyRoads = new Set<number>(); dirtyBld = new Set<number>();
  constructor(d: WorldData) {
    this.seed = d.seed; this.sizeIdx = d.sizeIdx; this.N = d.N; this.M = d.N * TILE; this.NV = d.N + 1;
    this.heights = d.heights; this.resource = d.resource; this.zone = d.zone; this.bld = d.bld; this.kind = d.kind; this.cityOf = d.cityOf; this.road = d.road; this.style = d.style;
    this.cities = d.cities; this.net = RoadNet.deserialize(d.roads);
    this.GN = Math.ceil(this.N / this.GC);
    this.nbrs = (d as any).nbrs || [];
    this.landValue = new Float32Array(this.GN * this.GN); this.pollution = new Float32Array(this.GN * this.GN); this.transitCov = new Float32Array(this.GN * this.GN);
    this.chunksN = Math.ceil(this.N / CHUNK);
    this.net.onEdgeAdded = e => this.edgeChanged(e, true);
    this.net.onEdgeRemoved = e => this.edgeChanged(e, false);
  }
  get size() { return SIZES[this.sizeIdx]; }
  H(i: number, j: number) { return this.heights[clamp(j, 0, this.N) * this.NV + clamp(i, 0, this.N)]; }
  hAt(x: number, z: number) { const fx = x / TILE, fz = z / TILE; const i = Math.floor(fx), j = Math.floor(fz); const u = fx - i, v = fz - j; return lerp(lerp(this.H(i, j), this.H(i + 1, j), u), lerp(this.H(i, j + 1), this.H(i + 1, j + 1), u), v); }
  groundY(x: number, z: number) { return Math.max(this.hAt(x, z), 0); }
  roadY(x: number, z: number) { const h = this.hAt(x, z); return h > 1.2 ? h + 0.3 : Math.max(h + 0.3, 1.5 + Math.min(4, (1.2 - h) * 1.5)); }
  tileH(i: number, j: number) { return (this.H(i, j) + this.H(i + 1, j) + this.H(i, j + 1) + this.H(i + 1, j + 1)) / 4; }
  tileSlope(i: number, j: number) { const a = this.H(i, j), b = this.H(i + 1, j), c = this.H(i, j + 1), d = this.H(i + 1, j + 1); return (Math.max(a, b, c, d) - Math.min(a, b, c, d)) / TILE; }
  chunkOfTile(i: number, j: number) { return Math.floor(j / CHUNK) * this.chunksN + Math.floor(i / CHUNK); }
  chunkOfPos(x: number, z: number) { return this.chunkOfTile(clamp(Math.floor(x / TILE), 0, this.N - 1), clamp(Math.floor(z / TILE), 0, this.N - 1)); }
  markBld(i: number, j: number) { this.dirtyBld.add(this.chunkOfTile(i, j)); }
  edgeChanged(e: number, added: boolean) {
    const E = this.net.edges[e]; const A = this.net.nodes[E.a], B = this.net.nodes[E.b];
    const w = ROAD_TYPES[E.type].w;
    if (added) {
      markRoadTiles(this.N, this.road, A.x, A.z, B.x, B.z, E.type, w);
      // clear buildings under road
      this.forTilesAlong(A.x, A.z, B.x, B.z, w, k => { if (this.bld[k] && this.kind[k] !== K.PORT) this.setBld(k, 0, 0); this.zone[k] = 0; });
    } else {
      this.forTilesAlong(A.x, A.z, B.x, B.z, w + 8, k => { this.road[k] = 0; });
      for (const id of this.net.edgesNear((A.x + B.x) / 2, (A.z + B.z) / 2, E.len / 2 + 40)) { const F = this.net.edges[id]; if (!F.alive) continue; const C = this.net.nodes[F.a], D = this.net.nodes[F.b]; markRoadTiles(this.N, this.road, C.x, C.z, D.x, D.z, F.type, ROAD_TYPES[F.type].w); }
    }
    const steps = Math.ceil(E.len / 64);
    for (let s = 0; s <= steps; s++) { const x = A.x + (B.x - A.x) * s / steps, z = A.z + (B.z - A.z) * s / steps; const c = this.chunkOfPos(x, z); this.dirtyRoads.add(c); this.dirtyBld.add(c); }
    this.dirtyRoads.add(this.chunkOfPos((A.x + B.x) / 2, (A.z + B.z) / 2));
  }
  forTilesAlong(ax: number, az: number, bx: number, bz: number, w: number, cb: (k: number) => void) {
    const L = Math.hypot(bx - ax, bz - az); const steps = Math.max(1, Math.ceil(L / 4)); const seen = new Set<number>();
    for (let s = 0; s <= steps; s++) {
      const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
      for (let i = Math.floor((x - w / 2) / TILE); i <= Math.floor((x + w / 2) / TILE); i++) for (let j = Math.floor((z - w / 2) / TILE); j <= Math.floor((z + w / 2) / TILE); j++) {
        if (i < 0 || j < 0 || i >= this.N || j >= this.N) continue; const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE;
        if (Math.abs(cx - x) <= w / 2 + 2 && Math.abs(cz - z) <= w / 2 + 2) { const k = j * this.N + i; if (!seen.has(k)) { seen.add(k); cb(k); } }
      }
    }
  }
  roadAccess(i: number, j: number): number { // 0 none, 1 adjacent, 2 two tiles
    const N = this.N; let best = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
      if (this.road[jj * N + ii]) { if (Math.abs(a) <= 1 && Math.abs(b) <= 1) return 1; best = 2; }
    }
    return best;
  }
  nearestCity(x: number, z: number, factor = 1.6): number {
    let best = -1, bd = Infinity; for (const c of this.cities) { const d = Math.hypot(c.x - x, c.z - z) / c.r; if (d < factor && d < bd) { bd = d; best = c.id; } } return best;
  }
  coarse(arr: Float32Array, x: number, z: number) { const i = clamp(Math.floor(x / TILE / this.GC), 0, this.GN - 1), j = clamp(Math.floor(z / TILE / this.GC), 0, this.GN - 1); return arr[j * this.GN + i]; }
  tileLV(k: number) { const i = k % this.N, j = (k / this.N) | 0; return this.landValue[((j / this.GC) | 0) * this.GN + ((i / this.GC) | 0)]; }
  // terraform: level/raise/lower brush
  terraform(x: number, z: number, radius: number, mode: number, target: number, strength: number) {
    const N = this.N, NV = this.NV; const r = radius / TILE;
    const ci = x / TILE, cj = z / TILE;
    for (let j = Math.floor(cj - r); j <= Math.ceil(cj + r); j++) for (let i = Math.floor(ci - r); i <= Math.ceil(ci + r); i++) {
      if (i < 0 || j < 0 || i > N || j > N) continue; const d = Math.hypot(i - ci, j - cj) / r; if (d > 1) continue;
      const f = (1 - d * d) * strength; const k = j * NV + i;
      if (mode === 0) this.heights[k] += f * 2; else if (mode === 1) this.heights[k] -= f * 2; else this.heights[k] = lerp(this.heights[k], target, Math.min(1, f));
    }
    const cs = CHUNK * TILE;
    for (let a = Math.floor((x - radius - TILE) / cs); a <= Math.floor((x + radius + TILE) / cs); a++) for (let b = Math.floor((z - radius - TILE) / cs); b <= Math.floor((z + radius + TILE) / cs); b++) {
      if (a < 0 || b < 0 || a >= this.chunksN || b >= this.chunksN) continue; const c = b * this.chunksN + a; this.dirtyTerrain.add(c); this.dirtyRoads.add(c); this.dirtyBld.add(c);
    }
  }
  setZone(i: number, j: number, z: number) {
    const k = j * this.N + i; if (this.road[k] || this.tileH(i, j) < 0.5) return false;
    if (this.kind[k] >= K.WAREHOUSE) return false;
    if (this.zone[k] === z) return false;
    if (this.bld[k] && this.zone[k] !== z) this.setBld(k, 0, 0);
    this.zoneHook?.(k, z);
    this.zone[k] = z;
    if (z && !this.cityOf[k]) { const c = this.cityForTile((i + 0.5) * TILE, (j + 0.5) * TILE); if (c >= 0) this.cityOf[k] = c + 1; }
    this.dirtyTerrain.add(this.chunkOfTile(i, j)); this.markBld(i, j); return true;
  }
}
export { Z, K };
