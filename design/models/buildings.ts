// Здания v2 «Пастила»: единый язык форм — светлый цоколь, сахарный карниз, фаска кровли, рамы окон,
// один фирменный акцент (бирюза/коралл/шафран) на каждом здании. Вариации: seed → стиль крыши, пропорции, детали.
import * as THREE from 'three';
import type { ThemedBuildingOpts } from './themes/common';
import { createThemedBuilding } from './themes/index';
import { GeoBuilder, hex, rng, shade, mix, RGB, Rng } from './builder';
import { BUILD, BRAND } from '../palette';

export type BuildingKind = 'house' | 'resMid' | 'resTower' | 'commercialSmall' | 'office' | 'industrial' | 'warehouse' | 'civic' | 'station' | 'depot';
export interface BuildingOpts {
  seed?: number; lotW?: number; lotD?: number; floors?: number;
  /** Белые стены → цвет задаётся instanceColor (акценты остаются). */
  neutral?: boolean;
  /** Доля окон, которые загораются ночью (0..1). */
  lit?: number;
}
const FLOOR = 3.2;
const SUGAR = hex(BRAND.sugar), INK = hex(BRAND.ink), TEAL = hex(BRAND.teal), CORAL = hex(BRAND.coral), SAFF = hex(BRAND.saffron);
const P = (r: Rng, a: readonly number[]) => hex(r.pick(a));
const wallOf = (r: Rng, set: readonly number[], o: BuildingOpts): RGB => o.neutral ? [0.93, 0.93, 0.93] : P(r, set);
const glass = () => hex(BUILD.glass);
const door = (b: GeoBuilder, x: number, z: number, w: number, h: number, c: RGB, canopy?: RGB) => {
  b.box(x, 0, z + 0.02, w + 0.3, h + 0.2, 0.1, SUGAR, SUGAR); b.box(x, 0, z + 0.08, w, h, 0.1, c);
  if (canopy) b.box(x, h + 0.25, z + 0.5, w + 1, 0.12, 1.0, canopy, canopy, 0.04);
};

function house(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(7.5, 10.5), d = o.lotD ?? r.range(6.5, 8.5), fl = o.floors ?? r.int(1, 2), h = fl * 3;
  const wall = wallOf(r, BUILD.resWalls, o), roof = P(r, BUILD.resRoofs), lit = o.lit ?? 0.55;
  b.box(0, 0, 0, w + 0.3, 0.6, d + 0.3, hex(BUILD.plinth), undefined, 0.05);          // цоколь
  b.box(0, 0.6, 0, w, h - 0.6, d, wall);
  b.band(0, h - 0.25, 0, w, d, 0.25, 0.12, SUGAR);                                       // карниз
  b.windowGrid(0, 0, w, d, 0, fl, 3, glass(), SUGAR, { winW: 1.0, gap: 1.9, lit, r, sides: [0, 1, 2, 3] });
  door(b, r.range(-w / 4, w / 4), d / 2, 1.0, 2.1, hex(BUILD.door), r.chance(0.5) ? roof : undefined);
  const style = r.int(0, 3);
  if (style <= 1) { const rh = r.range(2.4, 3.6); b.gable(0, h, 0, w, d, rh, roof, wall); if (r.chance(0.7)) b.dormer(r.range(-w / 5, w / 5), h + 0.2, d / 4 - 0.3, wall, roof, glass()); }
  else if (style === 2) b.hip(0, h, 0, w, d, r.range(2, 2.8), roof);
  else { b.box(0, h, 0, w + 0.4, 0.4, d + 0.4, SUGAR, hex(BUILD.rooftop), 0.15); if (r.chance(0.7)) b.solar(-w / 5, h + 0.4, 0, w * 0.45, d * 0.55); }
  if (r.chance(0.6)) { const cx = w * r.range(0.15, 0.3); b.box(cx, h, -d * 0.15, 0.7, 3.2, 0.7, hex(BUILD.chimney), undefined, 0.05); b.box(cx, h + 3.2, -d * 0.15, 0.9, 0.18, 0.9, SUGAR, SUGAR); }
  if (r.chance(0.45)) { const gw = 3.6; b.box(w / 2 + gw / 2, 0, -d * 0.1, gw, 2.7, d * 0.7, shade(wall, 0.96), hex(BUILD.rooftop), 0.1); b.box(w / 2 + gw / 2, 0, d * 0.25 + 0.02, 2.6, 2.1, 0.08, SUGAR); }
  if (r.chance(0.4)) { b.box(0, 0, d / 2 + 1.6, w * 0.7, 0.25, 3, hex(BUILD.concrete)); b.box(-w * 0.35, 0.25, d / 2 + 3, 0.1, 0.8, 0.1, SUGAR); } // терраса
}
function resMid(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(14, 22), d = o.lotD ?? r.range(10, 13), fl = o.floors ?? r.int(3, 6), h = 1 + fl * FLOOR;
  const wall = wallOf(r, BUILD.midWalls, o), acc = r.pick([TEAL, CORAL, SAFF]), lit = o.lit ?? 0.5;
  b.box(0, 0, 0, w + 0.4, 1.0, d + 0.4, hex(BUILD.plinth), undefined, 0.06);
  b.box(0, 1, 0, w, h - 1, d, wall);
  for (let f = 1; f < fl; f++) b.band(0, 1 + f * FLOOR - 0.1, 0, w, d, 0.12, 0.05, shade(wall, 1.06)); // межэтажные тяги
  b.windowGrid(0, 0, w, d, 1, fl, FLOOR, glass(), SUGAR, { winW: 1.3, gap: 1.5, lit, r });
  door(b, 0, d / 2, 1.6, 2.4, hex(BUILD.door), acc);
  const balc = r.int(0, 2);   // 0 — нет, 1 — лоджии, 2 — открытые балконы
  if (balc) for (let f = 1; f < fl; f++) for (const s of [-1, 1]) { const x = s * w / 4, y = 1 + f * FLOOR;
    b.box(x, y, d / 2 + 0.7, 3.0, 0.15, 1.4, SUGAR, SUGAR);
    if (balc === 1) b.box(x, y + 0.15, d / 2 + 1.35, 3.0, 1.0, 0.1, mix(wall, acc, 0.35)); else { b.box(x, y + 1.0, d / 2 + 1.35, 3.0, 0.08, 0.08, SUGAR); for (let k = -1; k <= 1; k++) b.box(x + k * 1.4, y + 0.15, d / 2 + 1.35, 0.06, 0.85, 0.06, SUGAR); } }
  const roofT = r.int(0, 2);
  if (roofT === 0) b.hip(0, h, 0, w, d, 2.4, hex(r.pick(BUILD.resRoofs)), 0.45);
  else if (roofT === 1) { b.gable(0, h, 0, w, d, 3.2, hex(r.pick(BUILD.resRoofs)), wall, 0.45); for (let i = -1; i <= 1; i += 2) b.dormer(i * w / 4, h + 0.3, d / 4 - 0.4, wall, hex(BUILD.resRoofs[0]), glass()); }
  else { b.band(0, h, 0, w, d, 0.55, 0.2, SUGAR); b.box(w * 0.25, h + 0.55, 0, 3, 2.2, 3, hex(BUILD.concrete), undefined, 0.2); if (r.chance(0.6)) for (let i = 0; i < 3; i++) b.solar(-w * 0.3 + i * 2.6, h + 0.55, 0, 2.2, 1.6); else b.box(-w * 0.2, h + 0.55, 0, w * 0.35, 0.3, d * 0.6, hex(0x8cc461)); } // зелёная крыша
}
function resTower(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(15, 21), d = o.lotD ?? r.range(15, 21), fl = o.floors ?? r.int(10, 24), h = 5 + fl * FLOOR;
  const wall = wallOf(r, BUILD.towerWalls, o), acc = r.pick([TEAL, CORAL, SAFF]), lit = o.lit ?? 0.45;
  b.box(0, 0, 0, w + 3, 5, d + 3, hex(BUILD.concrete), undefined, 0.2);                      // стилобат
  b.box(0, 5, 0, w + 3.4, 0.4, d + 3.4, SUGAR, SUGAR, 0.15);
  b.box(0, 0.3, (d + 3) / 2 + 0.05, w * 0.8, 3.6, 0.1, glass());                              // витрины
  b.box(0, 5.4, 0, w, h - 5.4, d, wall);
  const corner = r.chance(0.5);
  b.windowGrid(0, 0, w, d, 5.4, fl, FLOOR, glass(), SUGAR, { winW: 1.6, gap: 1.2, lit, r });
  if (corner) for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (w / 2 - 0.4), 5.4, sz * (d / 2 - 0.4), 1.0, h - 5.4, 1.0, mix(wall, acc, 0.5)); // цветные пилоны-углы
  else b.box(0, 5.4, d / 2 + 0.25, 2.2, h - 5.4, 0.5, mix(wall, acc, 0.55));                 // вертикальный акцент-лопатка
  for (let f = 4; f < fl; f += 4) b.band(0, 5.4 + f * FLOOR - 0.15, 0, w, d, 0.3, 0.18, SUGAR);
  b.band(0, h, 0, w, d, 0.8, 0.25, SUGAR);
  b.box(0, h + 0.8, 0, w * 0.45, 3.2, d * 0.45, hex(BUILD.concrete), undefined, 0.3);
  if (r.chance(0.6)) for (let i = 0; i < 2; i++) b.solar(w * 0.3, h + 0.8, -d * 0.25 + i * d * 0.5 - 0.5, 3.2, 2);
  if (r.chance(0.5)) { b.cyl(-w * 0.3, h + 0.8, -d * 0.3, 1.2, 1.2, 2.4, 8, SUGAR); b.cyl(-w * 0.3, h + 3.2, -d * 0.3, 1.25, 0.2, 0.8, 8, acc); } // бак-«ротонда»
}
function commercialSmall(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(10, 16), d = o.lotD ?? r.range(10, 14), fl = o.floors ?? r.int(1, 3), h = 4.4 + (fl - 1) * FLOOR;
  const wall = wallOf(r, BUILD.comWalls, o), acc = P(r, BUILD.comAccent), lit = o.lit ?? 0.7;
  b.box(0, 0, 0, w, h, d, wall);
  b.box(0, 0, d / 2 + 0.03, w + 0.2, 0.4, 0.12, hex(BUILD.plinth));
  b.glow = r.range(0.05, 0.4); b.box(0, 0.4, d / 2 + 0.06, w * 0.86, 2.9, 0.08, glass()); b.glow = 0;       // витрина — светится вечером
  for (let x = -w * 0.43; x <= w * 0.43 + 0.01; x += w * 0.86 / 3) b.box(x, 0.4, d / 2 + 0.1, 0.15, 2.9, 0.08, SUGAR); // переплёт
  // полосатая маркиза: чередование акцент/сахар
  const n = 8; for (let i = 0; i < n; i++) { const x0 = -w * 0.46 + (w * 0.92) * i / n, x1 = x0 + w * 0.92 / n;
    b.quad([x0, 3.6, d / 2], [x1, 3.6, d / 2], [x1, 3.0, d / 2 + 1.5], [x0, 3.0, d / 2 + 1.5], i % 2 ? SUGAR : acc);
    b.quad([x0, 3.0, d / 2 + 1.5], [x1, 3.0, d / 2 + 1.5], [x1, 2.75, d / 2 + 1.5], [x0, 2.75, d / 2 + 1.5], i % 2 ? SUGAR : acc); }
  b.glow = 0.05; b.box(0, 3.75, d / 2 + 0.12, w * 0.55, 0.6, 0.14, acc, acc, 0.05); b.glow = 0;              // вывеска (неон)
  if (fl > 1) b.windowGrid(0, 0, w, d, 4.4, fl - 1, FLOOR, glass(), SUGAR, { winW: 1.5, gap: 1.4, lit, r });
  b.band(0, h, 0, w, d, 0.6, 0.18, SUGAR);
  b.box(-w * 0.2, h + 0.6, -d * 0.2, 2, 1.1, 1.5, hex(0xc8ccd6), undefined, 0.1); b.box(w * 0.2, h + 0.6, -d * 0.1, 1.4, 0.9, 1.2, hex(0xc8ccd6), undefined, 0.1);
  if (r.chance(0.5)) { b.box(w * 0.3, h + 0.6, d * 0.25, 0.1, 1.6, 0.1, INK); b.glow = 0.05; b.box(w * 0.3, h + 2.2, d * 0.25, 3.5, 1.2, 0.15, acc, acc, 0.1); b.glow = 0; } // крышная вывеска
}
function office(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(18, 26), d = o.lotD ?? r.range(18, 26), fl = o.floors ?? r.int(8, 30), h = fl * FLOOR;
  const g = o.neutral ? [0.86, 0.9, 0.95] as RGB : mix(glass(), hex(r.pick(BUILD.towerWalls)), r.range(0.1, 0.45)); const acc = r.pick([TEAL, CORAL, SAFF]);
  b.box(0, 0, 0, w + 4, 5.5, d + 4, hex(BUILD.concrete), undefined, 0.25); b.band(0, 5.5, 0, w + 4, d + 4, 0.4, 0.1, SUGAR);
  const tiers = fl > 14 ? r.int(2, 3) : 1; let y = 5.9, cw = w, cd = d;
  for (let t = 0; t < tiers; t++) {
    const th = (h - 5.9) * (tiers === 1 ? 1 : t === 0 ? 0.55 : (0.45 / (tiers - 1)));
    b.glow = 0; b.box(0, y, 0, cw, th, cd, g);
    for (let f = FLOOR; f < th - 0.5; f += FLOOR) { b.glow = r.chance(o.lit ?? 0.4) ? r.range(0.02, 1) : 0; b.box(0, y + f - 1.6, 0, cw + 0.06, 1.4, cd + 0.06, mix(g, hex(0xffffff), 0.12)); b.glow = 0; b.box(0, y + f, 0, cw + 0.25, 0.3, cd + 0.25, SUGAR, SUGAR); }
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) b.box(sx * cw, y, sz * cd, 0.7, th, 0.7, SUGAR, SUGAR);
    y += th; b.band(0, y, 0, cw, cd, 0.6, 0.25, t === tiers - 1 ? acc : SUGAR); y += 0.6; cw *= 0.74; cd *= 0.74;
  }
  b.box(0, y, 0, cw, 2.4, cd, hex(BUILD.concrete), undefined, 0.3);
  if (r.chance(0.6)) b.cyl(0, y + 2.4, 0, 0.35, 0.06, 12, 6, SUGAR); else { b.cyl(0, y + 2.4, 0, cw * 0.35, cw * 0.35, 0.2, 10, hex(0xf2f2f2)); }  // антенна / вертолётная площадка
}
function industrial(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(24, 36), d = o.lotD ?? r.range(16, 24), h = r.range(7, 10);
  const wall = wallOf(r, BUILD.indWalls, o), roof = P(r, BUILD.indRoof);
  b.box(0, 0, 0, w, h, d, wall, roof);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / Math.round(w / 6)) for (const s of [-1, 1]) b.box(x, 0, s * (d / 2 + 0.1), 0.4, h, 0.25, shade(wall, 0.9)); // пилястры
  b.band(0, h - 0.4, 0, w, d, 0.4, 0.15, SAFF);                                               // фирменная шафрановая полоса
  const n = Math.max(2, Math.round(w / 6)), sw = w / n;
  for (let i = 0; i < n; i++) { const x0 = -w / 2 + i * sw;
    b.quad([x0, h, d / 2], [x0, h, -d / 2], [x0 + sw, h + 2.4, -d / 2], [x0 + sw, h + 2.4, d / 2], roof);
    b.glow = r.range(0.1, 0.6); b.quad([x0 + sw, h, -d / 2], [x0 + sw, h, d / 2], [x0 + sw, h + 2.4, d / 2], [x0 + sw, h + 2.4, -d / 2], glass()); b.glow = 0;
    b.tri([x0, h, d / 2], [x0 + sw, h + 2.4, d / 2], [x0 + sw, h, d / 2], wall); b.tri([x0 + sw, h, -d / 2], [x0 + sw, h + 2.4, -d / 2], [x0, h, -d / 2], wall); }
  for (const x of [-w * 0.3, w * 0.05]) { b.box(x, 0, d / 2 + 0.05, 4.4, 4.9, 0.12, SUGAR); b.box(x, 0, d / 2 + 0.12, 4, 4.5, 0.1, SAFF); for (let y = 0.6; y < 4.5; y += 0.6) b.box(x, y, d / 2 + 0.18, 4, 0.06, 0.04, shade(SAFF, 0.85)); }
  const chim = r.int(1, 3); for (let i = 0; i < chim; i++) { const cx = w / 2 - 3 - i * 4, ch = h + r.range(10, 20);
    b.cyl(cx, 0, -d / 2 + 3, 1.4, 1.0, ch, 8, hex(BUILD.chimney)); for (const yy of [ch * 0.6, ch - 1.2]) b.cyl(cx, yy, -d / 2 + 3, 1.25, 1.25, 0.6, 8, SUGAR); }
  if (r.chance(0.7)) for (let i = 0; i < r.int(1, 3); i++) { const z = -d * 0.3 + i * 7; b.cyl(-w / 2 - 4, 0, z, 3, 3, 9, 10, hex(0xeceae6)); b.cyl(-w / 2 - 4, 9, z, 3.05, 0.4, 1.4, 10, TEAL); b.cyl(-w / 2 - 4, 3, z, 3.06, 3.06, 0.4, 10, SAFF); }
}
function warehouse(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(28, 44), d = o.lotD ?? r.range(18, 26), h = r.range(8, 11);
  const wall = wallOf(r, BUILD.indWalls, o), roof = P(r, BUILD.indRoof), acc = r.pick([TEAL, CORAL, SAFF]);
  b.box(0, 0, 0, w, h, d, wall);
  const segs = 6; for (let i = 0; i < segs; i++) { const a0 = Math.PI * i / segs, a1 = Math.PI * (i + 1) / segs;
    const p = (a: number, x: number) => [x, h + Math.sin(a) * 3, Math.cos(a) * d / 2];
    b.quad(p(a0, -w / 2), p(a0, w / 2), p(a1, w / 2), p(a1, -w / 2), shade(roof, 0.88 + 0.05 * Math.sin(a0 + 0.3)));
    b.tri([w / 2, h, 0], p(a1, w / 2), p(a0, w / 2), wall); b.tri([-w / 2, h, 0], p(a0, -w / 2), p(a1, -w / 2), wall); }
  b.box(0, h - 1.4, d / 2 + 0.05, w * 0.4, 1.0, 0.12, acc);                                   // логотип-полоса
  const docks = Math.floor(w / 6); for (let i = 0; i < docks; i++) { const x = -w / 2 + 3 + i * 6; b.box(x, 1.2, d / 2 + 0.05, 3.6, 3.6, 0.1, SUGAR); b.box(x, 1.2, d / 2 + 0.1, 3.2, 3.3, 0.1, hex(0x7a8090)); b.box(x, 4.7, d / 2 + 0.6, 4, 0.12, 1.2, acc); }
  b.box(0, 0, d / 2 + 1, w, 1.2, 2, hex(BUILD.concrete), undefined, 0.08);
}
function civic(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? r.range(24, 32), d = o.lotD ?? r.range(16, 22), h = 9.5;
  const wall = wallOf(r, BUILD.civicWalls, o), roof = hex(BUILD.civicRoof), acc = SAFF;
  b.box(0, 0, 0, w + 3, 0.6, d + 3, hex(BUILD.concrete)); b.box(0, 0.6, 0, w + 2, 0.6, d + 2, hex(BUILD.concrete)); // ступени
  b.box(0, 1.2, 0, w, h, d, wall);
  b.windowGrid(0, 0, w, d, 1.2, 2, 4.5, glass(), SUGAR, { winW: 1.4, winH: 2.6, gap: 1.8, lit: 0.6, r });
  b.band(0, h + 0.7, 0, w, d, 0.5, 0.3, SUGAR);
  const cols = r.pick([4, 6, 8]); for (let i = 0; i < cols; i++) { const x = -w * 0.3 + (w * 0.6) * i / (cols - 1); b.box(x, 1.2, d / 2 + 2.2, 1.0, 0.4, 1.0, SUGAR); b.cyl(x, 1.6, d / 2 + 2.2, 0.42, 0.38, 6.6, 8, SUGAR); }
  b.box(0, 8.2, d / 2 + 1.8, w * 0.7, 1.2, 3.8, SUGAR, SUGAR); b.gable(0, 9.4, d / 2 + 1.8, w * 0.7, 3.8, 2.2, roof, SUGAR, 0.15);
  const top = r.int(0, 2);
  b.hip(0, h + 1.2, 0, w, d, 3.4, roof);
  if (top === 0) { b.box(0, h + 1.2, 0, 5, 6, 5, wall, undefined, 0.2); b.cyl(0, h + 7.2, 0, 2.8, 2.8, 1.2, 12, SUGAR); b.cyl(0, h + 8.4, 0, 2.8, 0.25, 3.6, 12, roof); b.cyl(0, h + 12, 0, 0.12, 0.02, 2.2, 4, acc); } // барабан + купол
  else if (top === 1) { b.box(0, h + 1.2, -d * 0.2, 4, 10, 4, wall); b.windowAt(0, h + 7.5, -d * 0.2 + 2, 1.6, 1.6, 0, hex(0xfff6dc), acc); b.cyl(0, h + 11.2, -d * 0.2, 3.0, 0, 5, 4, roof, undefined, Math.PI / 4); } // часовая башня
  else b.cyl(0, h + 1.2, 0, 3, 0, 5, 8, roof);
}
function station(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? 48, d = o.lotD ?? 22; const wall = o.neutral ? [0.93, 0.93, 0.93] as RGB : hex(BUILD.stationWalls), roof = hex(BUILD.stationRoof);
  const bw = w * r.range(0.45, 0.6);
  b.box(0, 0, 4, bw + 0.4, 0.8, 10.4, hex(BUILD.plinth)); b.box(0, 0.8, 4, bw, 8.6, 10, wall);
  b.windowGrid(0, 4, bw, 10, 0.8, 2, 4.3, glass(), SUGAR, { winW: 1.8, winH: 2.4, gap: 1.4, lit: 0.8, r });
  b.band(0, 9.4, 4, bw, 10, 0.5, 0.25, SUGAR); b.gable(0, 9.9, 4, bw, 10, 3.6, roof, wall);
  // центральный ризалит с часами
  b.box(0, 0, 9.4, 8, 13, 1.6, wall); b.gable(0, 13, 9.4, 8, 1.6, 2.4, roof, wall, 0.2); b.cyl(0, 10.2, 10.25, 1.4, 1.4, 0.15, 12, SUGAR);
  b.glow = 0.01; b.box(0, 1, 10.25, 3.4, 4.5, 0.1, glass()); b.glow = 0;
  for (const z of [-4, -10]) { b.box(0, 0, z, w, 1.0, 3.6, hex(BUILD.concrete), undefined, 0.1); b.box(0, 1, z + 1.7, w, 0.02, 0.15, SAFF);
    for (let x = -w / 2 + 3; x < w / 2; x += 6) b.cyl(x, 1, z, 0.15, 0.15, 3.4, 6, SUGAR);
    b.quad([-w / 2, 4.7, z + 2.2], [w / 2, 4.7, z + 2.2], [w / 2, 4.4, z], [-w / 2, 4.4, z], roof); b.quad([w / 2, 4.2, z - 2.2], [-w / 2, 4.2, z - 2.2], [-w / 2, 4.4, z], [w / 2, 4.4, z], shade(roof, 0.85)); }
}
function depot(b: GeoBuilder, r: Rng, o: BuildingOpts) {
  const w = o.lotW ?? 40, d = o.lotD ?? 24, h = 8; const wall = o.neutral ? [0.93, 0.93, 0.93] as RGB : hex(BUILD.depotWalls), acc = r.pick([TEAL, CORAL]);
  b.box(0, 0, 0, w, h, d, wall, hex(0x8a90a0));
  const bays = Math.floor(w / 8); for (let i = 0; i < bays; i++) { const x = -w / 2 + 4 + i * 8;
    b.box(x, 0, d / 2 + 0.05, 5.6, 6.6, 0.1, SUGAR); b.box(x, 0, d / 2 + 0.1, 5, 6, 0.1, hex(0x5a6070)); b.glow = r.range(0.05, 0.5); b.box(x, 4.4, d / 2 + 0.15, 4.6, 1.2, 0.05, glass()); b.glow = 0; }
  b.band(0, h - 0.5, 0, w, d, 0.5, 0.15, acc);
  for (let x = -w / 2; x < w / 2 - 0.1; x += 5) b.gable(x + 2.5, h, 0, 5, d, 1.8, hex(0x8a90a0), wall, 0);
  b.glow = 0.02; b.box(w / 2 - 6, h + 0.5, d / 2 - 1, 8, 1.6, 0.3, acc, acc, 0.1); b.glow = 0;   // вывеска «ДЕПО»
}

const IMPL: Record<BuildingKind, (b: GeoBuilder, r: Rng, o: BuildingOpts) => void> = { house, resMid, resTower, commercialSmall, office, industrial, warehouse, civic, station, depot };
export const BUILDING_KINDS = Object.keys(IMPL) as BuildingKind[];
/** Рекомендуемое число вариаций (InstancedMesh на вариацию). */
export const BUILDING_VARIANTS: Record<BuildingKind, number> = { house: 8, resMid: 6, resTower: 6, commercialSmall: 6, office: 6, industrial: 4, warehouse: 4, civic: 4, station: 2, depot: 2 };

/** Перегрузки: createBuilding(kind, opts) — v2; createBuilding({ theme, kind, width, depth, floors, seed, lit, neutral }) — темы v4. */
export function createBuilding(kind: BuildingKind, opts?: BuildingOpts): THREE.BufferGeometry;
export function createBuilding(opts: ThemedBuildingOpts): THREE.BufferGeometry;
export function createBuilding(kind: BuildingKind | ThemedBuildingOpts, opts: BuildingOpts = {}): THREE.BufferGeometry {
  if (typeof kind === 'object') return createThemedBuilding(kind);
  const b = new GeoBuilder(); b.aoHeight = kind === 'house' ? 2.5 : 5; IMPL[kind](b, rng(opts.seed ?? 1), opts); return b.build();
}
