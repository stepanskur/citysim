// Подрегионы (mechanics/08-expansion.md §1–3, §6). Квадратная сетка; owner: -1 свободен, 0 игрок, k>0 — ИИ-город с id=k.
import { BALANCE } from '../sim/balance';
import { TILE } from './consts';
import type { World } from './World';
const X = BALANCE.expansion;
export interface Claim { sub: number; ai: number; until: number }
export class Subregions {
  grid: number; size: number; owner: Int16Array; boughtN = 0; claims: Claim[] = []; version = 0;
  constructor(public w: World) {
    this.grid = Math.max(3, Math.ceil(w.M / X.subregionSize)); this.size = w.M / this.grid;
    this.owner = new Int16Array(this.grid * this.grid).fill(-1);
    // города занимают свои подрегионы; главный (id 0) — игрок
    for (const c of [...w.cities].reverse()) { const s = this.at(c.x, c.z); this.owner[s] = c.id === 0 ? 0 : c.id; }
    // крупные ИИ-города сразу держат соседний участок в сторону от игрока
    for (const c of w.cities) if (c.id && c.r > w.cities[0].r * 0.45) { for (const n of this.adj(this.at(c.x, c.z))) if (this.owner[n] === -1) { this.owner[n] = c.id; break; } }
  }
  at(x: number, z: number) { const i = Math.min(this.grid - 1, Math.max(0, Math.floor(x / this.size))), j = Math.min(this.grid - 1, Math.max(0, Math.floor(z / this.size))); return j * this.grid + i; }
  ownerAt(x: number, z: number) { return this.owner[this.at(x, z)]; }
  adj(s: number) { const g = this.grid, i = s % g, j = (s / g) | 0; const r: number[] = []; if (i > 0) r.push(s - 1); if (i < g - 1) r.push(s + 1); if (j > 0) r.push(s - g); if (j < g - 1) r.push(s + g); return r; }
  center(s: number) { return { x: (s % this.grid + 0.5) * this.size, z: (((s / this.grid) | 0) + 0.5) * this.size }; }
  ownedCount() { let n = 0; for (const o of this.owner) if (o === 0) n++; return n; }
  popGate() { return Math.round(X.popGateBase * Math.pow(X.popGateGrowth, this.boughtN)); }
  /** цена по 08 §2 */
  price(s: number) {
    const w = this.w; const N = w.N; const t0 = Math.floor((s % this.grid) * this.size / TILE), u0 = Math.floor(((s / this.grid) | 0) * this.size / TILE), n = Math.floor(this.size / TILE);
    let res = 0, lv = 0, lvn = 0; for (let j = u0; j < Math.min(N, u0 + n); j += 2) for (let i = t0; i < Math.min(N, t0 + n); i += 2) { if (w.resource[j * N + i]) res += 4; }
    const GC = w.GC; for (let j = Math.floor(u0 / GC); j < Math.min(w.GN, Math.ceil((u0 + n) / GC)); j++) for (let i = Math.floor(t0 / GC); i < Math.min(w.GN, Math.ceil((t0 + n) / GC)); i++) { lv += w.landValue[j * w.GN + i]; lvn++; }
    const lvN = Math.min(1, (lvn ? lv / lvn : 0.5) / 2);
    const sizeF = (this.size / X.subregionSize) ** 2; // маленькие карты — участки меньше, дешевле
    return Math.round((X.baseLandPrice * Math.max(0.15, sizeF) + X.resourceTilePrice * res) * Math.pow(X.ownedCountMult, this.boughtN) * (0.7 + 0.6 * lvN) / 1000) * 1000;
  }
  /** почему нельзя купить (или null — можно, кроме денег) */
  blocker(s: number, pop: number): string | null {
    if (this.owner[s] === 0) return 'уже ваш'; if (this.owner[s] > 0) return 'принадлежит соседу — забрать нельзя';
    if (!this.adj(s).some(n => this.owner[n] === 0)) return 'не граничит с вашими владениями';
    if (pop < this.popGate()) return `нужно население ≥ ${this.popGate().toLocaleString('ru')}`;
    const c = this.claims.find(c => c.sub === s); if (c && c.ai !== 0 && this.border(s, c.ai) > this.border(s, 0)) return 'право первого выкупа у соседа';
    return null;
  }
  border(s: number, who: number) { return this.adj(s).filter(n => this.owner[n] === who).length; }
  buy(s: number, who = 0) { this.owner[s] = who; if (who === 0) this.boughtN++; this.claims = this.claims.filter(c => c.sub !== s); this.version++; }
  frontier() { for (let s = 0; s < this.owner.length; s++) if (this.owner[s] === -1 && this.adj(s).some(n => this.owner[n] === 0)) return true; return false; }
  serialize() { return { owner: [...this.owner], boughtN: this.boughtN, claims: this.claims }; }
  load(d: any) { if (!d) return; this.owner.set(d.owner); this.boughtN = d.boughtN; this.claims = d.claims || []; this.version++; }
}
