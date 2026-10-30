/**
 * Общая база тем: размеры/лимиты/автоподгонка, система координат фасадов, правила роста деталей.
 * Оси: здание центрировано в (0,0), ширина w по X, глубина d по Z, фасад 0 (улица) смотрит в +Z,
 * 1 — двор (−Z), 2 — торец +X, 3 — торец −X. Высота от y=0 (земля участка).
 */
import { GeoBuilder, hex, shade, RGB, Rng } from '../builder';
import { THEMES } from '../../palette';

export type ThemeId = 'base' | 'lateSng' | 'russianClassic' | 'french';
export type ThemeKind = 'resSmall' | 'resMid' | 'resHigh' | 'commercial' | 'office';
export interface ThemedBuildingOpts {
  theme: ThemeId; kind: ThemeKind;
  /** м по фасаду; подгоняется к шагу модуля */ width?: number;
  /** м в глубину */ depth?: number;
  /** этажи; если не задано — height/floorH или середина диапазона */ floors?: number;
  /** альтернатива floors: высота карниза в м */ height?: number;
  seed?: number; lit?: number; neutral?: boolean;
  /** уровень деталей: 0 — без мелочи (дальний LOD), 1 — всё (по умолчанию) */ detail?: 0 | 1;
}
export interface Limits { w: [number, number]; d: [number, number]; floors: [number, number]; module: number; dModule: number; floorH: number; groundH: number; setback: number }
export interface Dims { w: number; d: number; floors: number; bays: number; floorH: number; groundH: number; eave: number }
/** Учёт деталей — кладётся в geometry.userData.details (для тестов/подсказок UI). */
export type DetailCount = Record<string, number>;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** Автоподгонка: clamp в лимиты + округление к шагу модуля (вниз, чтобы влезть в участок). */
export function fitDims(L: Limits, o: { width?: number; depth?: number; floors?: number; height?: number }): Dims {
  const bays = Math.max(Math.ceil(L.w[0] / L.module), Math.min(Math.floor(L.w[1] / L.module), Math.floor((o.width ?? (L.w[0] + L.w[1]) / 2) / L.module + 1e-6)));
  const dRaw = clamp(o.depth ?? (L.d[0] + L.d[1]) / 2, L.d[0], L.d[1]); const d = Math.max(L.d[0], Math.floor(dRaw / L.dModule + 1e-6) * L.dModule);
  const fl0 = o.floors ?? (o.height !== undefined ? Math.round((o.height - L.groundH) / L.floorH) + 1 : Math.round((L.floors[0] + L.floors[1]) / 2));
  const floors = clamp(Math.round(fl0), L.floors[0], L.floors[1]);
  return { w: bays * L.module, d, floors, bays, floorH: L.floorH, groundH: L.groundH, eave: L.groundH + (floors - 1) * L.floorH };
}

/** Контекст генератора. */
export class Ctx {
  det: DetailCount = {};
  constructor(public b: GeoBuilder, public r: Rng, public D: Dims, public o: ThemedBuildingOpts) {}
  count(k: string, n = 1) { this.det[k] = (this.det[k] ?? 0) + n; }
  len(side: number) { return side < 2 ? this.D.w : this.D.d; }
  /** точка фасада: u вдоль (слева направо, глядя на фасад), o — наружу. */
  P(side: number, u: number, o = 0): [number, number] { const { w, d } = this.D; return side === 0 ? [u, d / 2 + o] : side === 1 ? [-u, -d / 2 - o] : side === 2 ? [w / 2 + o, -u] : [-w / 2 - o, u]; }
  /** Бокс на фасаде: du вдоль, dout наружу (от плоскости стены). */
  fbox(side: number, u: number, y: number, du: number, h: number, dout: number, c: RGB, top?: RGB, out0 = 0) {
    const [x, z] = this.P(side, u, out0 + dout / 2); side < 2 ? this.b.box(x, y, z, du, h, dout, c, top) : this.b.box(x, y, z, dout, h, du, c, top);
  }
  /** Плоский прямоугольник на фасаде (наклейка): u0..u1, v0..v1, вынос o. */
  fquad(side: number, u0: number, v0: number, u1: number, v1: number, o: number, c: RGB) {
    const a = this.P(side, u0, o), b = this.P(side, u1, o); this.b.quad([a[0], v0, a[1]], [b[0], v0, b[1]], [b[0], v1, b[1]], [a[0], v1, a[1]], c);
  }
  win(side: number, u: number, y: number, ww: number, wh: number, glass: RGB, frame: RGB, lit = this.o.lit ?? 0.5) { const [x, z] = this.P(side, u, 0); this.b.windowAt(x, y, z, ww, wh, side, glass, frame, lit, this.r); }
  /** центры пролётов фасада */
  bays(side: number, step: number) { const L = this.len(side), n = Math.max(1, Math.round(L / step)), s = L / n; return Array.from({ length: n }, (_, i) => -L / 2 + s * (i + 0.5)); }
  wall(c: RGB): RGB { return this.o.neutral ? [0.93, 0.93, 0.93] : c; }
}
export const H = (n: number) => hex(n);
export const DET = THEMES.details;

// ------------------------------------------------------------------ правила роста деталей
/** Таблица правил (числа — в THEMES_SPEC.md §3). */
export const RULES = {
  downpipe: { cornerAlways: true, spacing: 12 },            // + промежуточная каждые 12 м фасада
  ac: { perM2Facade: 1 / 70, minFloors: 2 },                 // кондиционеров ≈ площадь фасада/70 × themeRate
  roofVent: { perM2Roof: 1 / 90 }, antenna: { perM2Roof: 1 / 250, minFloors: 3 }, dish: { perM2Roof: 1 / 300 },
  entrance: { spacing: 14 },                                  // подъездов = round(w/14)
  elevatorOverrun: { minFloors: 7 }, fireEscape: { minFloors: 4, minDepth: 12 },
  sign: { minWidth: 20 }, lightWell: { minDepth: 18, minWidth: 18 }, balconyFromFloors: 3,
};

export function downpipes(c: Ctx, top: number, sides: number[], col = H(DET.downpipe), spacing = RULES.downpipe.spacing) {
  for (const s of sides) { const L = c.len(s); const n = Math.max(0, Math.floor(L / spacing) - 1); const us = [-L / 2 + 0.25, L / 2 - 0.25]; for (let i = 1; i <= n; i++) us.push(-L / 2 + (L / (n + 1)) * i);
    for (const u of us) { c.fbox(s, u, 0.15, 0.14, top - 0.15, 0.14, col, undefined, 0.02); c.fbox(s, u, top - 0.5, 0.36, 0.45, 0.3, col, undefined, 0.0); c.fbox(s, u, 0, 0.3, 0.15, 0.35, col); c.count('downpipe'); } }
}
/** Блоки кондиционеров: число растёт с площадью фасада; висят у окон, детерминированно по seed. */
export function acUnits(c: Ctx, sides: number[], rate: number, y0: number, floorH: number, floors: number, bayStep: number) {
  if (floors < RULES.ac.minFloors) return;
  for (const s of sides) { const area = c.len(s) * floors * floorH; const n = Math.round(area * RULES.ac.perM2Facade * rate); const bays = c.bays(s, bayStep);
    for (let i = 0; i < n; i++) { const u = c.r.pick(bays) + bayStep * 0.42 * (c.r.chance(0.5) ? 1 : -1); const fl = c.r.int(1, floors - 1); const y = y0 + (fl - 1) * floorH + floorH * 0.15;
      c.fbox(s, u, y, 0.8, 0.55, 0.3, H(DET.ac)); c.fquad(s, u - 0.3, y + 0.1, u + 0.3, y + 0.45, 0.305, H(DET.acGrille)); c.count('ac'); } }
}
export function roofKit(c: Ctx, y: number, inset: number, mult = 1) {
  const { w, d, floors } = c.D, A = w * d, r = c.r; const rx = (m: number) => r.range(-w / 2 + inset + m, w / 2 - inset - m), rz = (m: number) => r.range(-d / 2 + inset + m, d / 2 - inset - m);
  const nv = Math.max(1, Math.round(A * RULES.roofVent.perM2Roof * mult)); for (let i = 0; i < nv; i++) { const x = rx(1), z = rz(1); if (r.chance(0.5)) c.b.box(x, y, z, 0.9, 0.9, 0.9, H(DET.vent)); else { c.b.cyl(x, y, z, 0.25, 0.25, 1.4, 6, H(DET.vent)); c.b.cyl(x, y + 1.4, z, 0.4, 0, 0.3, 6, shade(H(DET.vent), 0.8)); } c.count('roofVent'); }
  if (floors >= RULES.antenna.minFloors) { const na = Math.max(1, Math.round(A * RULES.antenna.perM2Roof * mult)); for (let i = 0; i < na; i++) { const x = rx(1), z = rz(1); c.b.box(x, y, z, 0.06, 3.2, 0.06, H(DET.antenna)); for (let k = 0; k < 3; k++) c.b.box(x, y + 1.8 + k * 0.45, z, 1.2 - k * 0.3, 0.04, 0.04, H(DET.antenna)); c.count('antenna'); } }
  const nd = Math.round(A * RULES.dish.perM2Roof * mult); for (let i = 0; i < nd; i++) dish(c, rx(1), y, rz(1));
}
export function dish(c: Ctx, x: number, y: number, z: number) { c.b.box(x, y, z, 0.08, 0.6, 0.08, H(DET.antenna)); c.b.cyl(x, y + 0.5, z + 0.1, 0.05, 0.4, 0.18, 8, H(DET.dish)); c.count('dish'); }
export function parapet(c: Ctx, y: number, h: number, t: number, col: RGB) { const { w, d } = c.D; c.b.box(0, y, d / 2 - t / 2, w, h, t, col); c.b.box(0, y, -d / 2 + t / 2, w, h, t, col); c.b.box(w / 2 - t / 2, y, 0, t, h, d - 2 * t, col); c.b.box(-w / 2 + t / 2, y, 0, t, h, d - 2 * t, col); c.count('parapet'); }
/** Лифтовая надстройка над подъездом. */
export function elevatorOverrun(c: Ctx, x: number, z: number, y: number, col: RGB) { c.b.box(x, y, z, 3.6, 2.8, 4.2, col, shade(col, 0.9)); c.b.box(x, y + 2.8, z, 3.9, 0.15, 4.5, shade(col, 0.85)); c.count('elevatorOverrun'); }
/** Пожарная лестница на торце: площадки на каждом этаже + марши. */
export function fireEscape(c: Ctx, side: number, u: number, y0: number, floorH: number, floors: number) {
  const col = H(DET.fireEscape); for (let f = 1; f < floors; f++) { const y = y0 + (f - 1) * floorH + floorH - 0.1; c.fbox(side, u, y, 2.4, 0.06, 1.0, col); c.fbox(side, u, y + 0.9, 2.4, 0.05, 0.05, col, undefined, 0.95); }
  c.fbox(side, u - 1.15, y0, 0.06, (floors - 1) * floorH + 1, 0.06, col, undefined, 0.95); c.fbox(side, u + 1.15, y0 + 2.5, 0.06, (floors - 1) * floorH - 1.5, 0.06, col, undefined, 0.95);
  c.count('fireEscape');
}
/** Вывеска на длинном фасаде (светится ночью). */
export function sign(c: Ctx, side: number, u: number, y: number, len: number, col: RGB, bg: RGB) { c.fbox(side, u, y, len, 0.8, 0.12, bg); const g = c.b.glow; c.b.glow = 0.15; c.fquad(side, u - len / 2 + 0.2, y + 0.18, u + len / 2 - 0.2, y + 0.62, 0.125, col); c.b.glow = g; c.count('sign'); }
/** Козырёк входа. */
export function canopy(c: Ctx, side: number, u: number, y: number, wdt: number, out: number, col: RGB) { c.fbox(side, u, y, wdt, 0.14, out, col, shade(col, 1.05)); c.count('canopy'); }
/** Световой колодец (двор‑карман): тёмная выемка в крыше со стенками. */
export function lightWell(c: Ctx, y: number, ww: number, dd: number, wall: RGB) { c.b.box(0, y - 0.01, 0, ww, 0.02, dd, shade(wall, 0.35)); for (const s of [-1, 1]) { c.b.box(0, y - 0.01, s * dd / 2, ww, 0.25, 0.12, shade(wall, 0.9)); c.b.box(s * ww / 2, y - 0.01, 0, 0.12, 0.25, dd, shade(wall, 0.9)); } c.count('lightWell'); }
