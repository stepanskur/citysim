// Транспорт строится вдоль оси +Z (нос смотрит на +Z), origin — центр на уровне дороги.
import * as THREE from 'three';
import { GeoBuilder, hex, rng, shade, RGB, Rng } from './builder';
import { VEHICLES as V } from '../palette';

export type VehicleKind = 'car' | 'hatch' | 'van' | 'truck' | 'bus' | 'tram' | 'locomotive' | 'wagonPassenger' | 'wagonFreight' | 'wagonTank';
export interface VehicleOpts { seed?: number; /** Белый кузов для покраски через instanceColor. */ neutral?: boolean; color?: number; }

const glass = hex(V.glass), tire = hex(V.tire), light = hex(V.light), tail = hex(V.tail);
function body(r: Rng, o: VehicleOpts, set: number[]): RGB { return o.neutral ? [0.95, 0.95, 0.95] : hex(o.color ?? r.pick(set)); }
const sugar = hex(0xfff8ee), chrome = hex(0xd9dde3);
/** Фары (светятся ночью: glow), стопы, бамперы, решётка, номера. */
function lights(b: GeoBuilder, w: number, y: number, zf: number, zb: number) {
  b.glow = 0.01; for (const s of [-1, 1]) { b.box(s * (w / 2 - 0.28), y, zf + 0.02, 0.4, 0.2, 0.05, light, light, 0.03); b.box(s * (w / 2 - 0.28), y, zb - 0.07, 0.4, 0.18, 0.05, tail, tail, 0.03); } b.glow = 0;
  b.box(0, y - 0.32, zf + 0.04, w + 0.04, 0.22, 0.12, shade(tire, 1.6), undefined, 0.05); b.box(0, y - 0.32, zb - 0.16, w + 0.04, 0.22, 0.12, shade(tire, 1.6), undefined, 0.05);
  b.box(0, y - 0.05, zf + 0.03, w * 0.35, 0.16, 0.04, shade(tire, 1.3)); b.box(0, y - 0.3, zb - 0.2, 0.5, 0.12, 0.03, sugar);
}
function mirrors(b: GeoBuilder, w: number, y: number, z: number, c: RGB) { for (const s of [-1, 1]) b.box(s * (w / 2 + 0.1), y, z, 0.2, 0.14, 0.1, c); }
function wheels(b: GeoBuilder, w: number, zs: number[], r = 0.32) { for (const z of zs) for (const s of [-1, 1]) b.wheel(s * (w / 2 - 0.1), r, z, r, 0.25, tire); }

function car(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = body(r, o, V.car), L = 4.3, W = 1.8;
  b.box(0, 0.3, 0, W, 0.65, L, c, undefined, 0.12); mirrors(b, W, 1.0, 0.75, c);
  if (r.chance(0.12)) { b.glow = 0.01; b.box(0, 1.45, -0.4, 0.6, 0.22, 0.25, hex(0xffc145)); b.glow = 0; } else if (r.chance(0.2)) for (const s of [-1, 1]) b.box(s * 0.6, 1.47, -0.4, 0.06, 0.06, 1.4, chrome);
  // кабина с наклонными стёклами
  const y0 = 0.95, y1 = 1.45, zf = 0.7, zb = -1.3, zf2 = 0.2, zb2 = -1.0, hw = W / 2 - 0.08, tw = W / 2 - 0.15;
  b.quad([-hw, y0, zf], [hw, y0, zf], [tw, y1, zf2], [-tw, y1, zf2], glass);
  b.quad([hw, y0, zb], [-hw, y0, zb], [-tw, y1, zb2], [tw, y1, zb2], glass);
  b.quad([hw, y0, zf], [hw, y0, zb], [tw, y1, zb2], [tw, y1, zf2], shade(glass, 1.2));
  b.quad([-hw, y0, zb], [-hw, y0, zf], [-tw, y1, zf2], [-tw, y1, zb2], shade(glass, 1.2));
  b.quad([-tw, y1, zf2], [tw, y1, zf2], [tw, y1, zb2], [-tw, y1, zb2], c);
  lights(b, W, 0.7, L / 2, -L / 2); wheels(b, W, [1.35, -1.35]);
}
function hatch(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = body(r, o, V.car), L = 3.7, W = 1.7;
  b.box(0, 0.3, 0, W, 0.62, L, c, undefined, 0.12); b.box(0, 0.92, -0.35, W - 0.16, 0.55, 2.2, glass, c, 0.1); b.box(0, 1.4, -0.35, W - 0.2, 0.08, 2.0, c, c, 0.04); mirrors(b, W, 1.0, 0.75, c);
  lights(b, W, 0.7, L / 2, -L / 2); wheels(b, W, [1.15, -1.15], 0.3);
}
function van(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = body(r, o, [0xf2f2f2, 0x3c7fe8, 0xf2c13c]), L = 5, W = 2;
  b.box(0, 0.35, -0.3, W, 2.0, L - 0.6, c); b.box(0, 0.35, L / 2 - 0.5, W, 1.0, 0.8, c);
  b.quad([-W / 2 + 0.05, 1.4, 1.9], [W / 2 - 0.05, 1.4, 1.9], [W / 2 - 0.05, 2.2, 1.95], [-W / 2 + 0.05, 2.2, 1.95], glass);
  lights(b, W, 0.8, L / 2, -L / 2 + 0.3 - 0.3); wheels(b, W, [1.6, -1.6], 0.36);
}
function truck(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const cab = body(r, o, V.truckCab), cargo = o.neutral ? [0.9, 0.9, 0.9] as RGB : hex(r.pick(V.truckCargo)), W = 2.4;
  b.box(0, 0.5, 3.2, W, 2.5, 2.0, cab, undefined, 0.15); mirrors(b, W, 2.2, 4.0, hex(V.tire)); b.box(0, 3.0, 3.0, W - 0.4, 0.5, 1.4, cab, undefined, 0.2); b.box(0, 2.0, 4.22, W - 0.3, 0.8, 0.05, glass);
  b.box(0, 0.5, -1.2, W, 0.25, 7.2, hex(0x3a3d42));
  if (r.chance(0.7)) b.box(0, 0.75, -1.2, W, 2.8, 6.8, cargo, shade(cargo, 1.05));
  else { for (let z = -4; z < 2; z += 2) b.box(0, 0.75, z + 0.9, W - 0.2, 1.4, 1.8, shade(cargo, 0.9 + (z & 1) * 0.1)); }
  lights(b, W, 0.9, 4.2, -4.6); wheels(b, W, [3.2, -2.6, -3.7], 0.5);
}
function bus(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.95, 0.95, 0.95] as RGB : hex(o.color ?? V.bus), s = hex(V.busStripe), L = 12, W = 2.55, H = 3.0;
  b.box(0, 0.35, 0, W, H - 0.35, L, c, sugar, 0.18); mirrors(b, W, 2.3, L / 2 - 0.2, hex(V.tire));
  // ленточное остекление
  b.box(W / 2 + 0.03, 1.4, 0, 0.04, 1.1, L - 1.4, glass); b.box(-W / 2 - 0.03, 1.4, 0, 0.04, 1.1, L - 1.4, glass);
  b.box(0, 1.0, L / 2 + 0.03, W - 0.2, 1.7, 0.04, glass); b.box(0, 1.6, -L / 2 - 0.03, W - 0.4, 0.9, 0.04, glass);
  b.box(W / 2 + 0.04, 0.9, 0, 0.04, 0.3, L - 0.6, s); b.box(-W / 2 - 0.04, 0.9, 0, 0.04, 0.3, L - 0.6, s);
  for (const z of [3.5, -1.5]) b.box(W / 2 + 0.05, 0.4, z, 0.04, 2.2, 1.2, shade(glass, 1.3)); // двери
  b.box(0, H, -1, 1.6, 0.35, 3, hex(0xcfcfcf)); // кондиционер
  b.box(0, 2.6, L / 2 + 0.05, 1.4, 0.25, 0.04, hex(0xff9f2a)); // маршрутное табло
  lights(b, W, 0.7, L / 2, -L / 2); wheels(b, W, [3.8, -3.2], 0.5);
}
function tram(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.95, 0.95, 0.95] as RGB : hex(o.color ?? V.tram), s = hex(V.tramStripe), W = 2.5, secs = 3, SL = 9.5, H = 3.4;
  for (let i = 0; i < secs; i++) { const z = (i - (secs - 1) / 2) * (SL + 0.4);
    b.box(0, 0.4, z, W, H - 0.4, SL, c, sugar, 0.25);
    b.box(W / 2 + 0.03, 1.5, z, 0.04, 1.2, SL - 1, glass); b.box(-W / 2 - 0.03, 1.5, z, 0.04, 1.2, SL - 1, glass);
    b.box(W / 2 + 0.04, 0.6, z, 0.04, 0.5, SL, s); b.box(-W / 2 - 0.04, 0.6, z, 0.04, 0.5, SL, s);
    b.box(W / 2 + 0.05, 0.45, z + 2, 0.04, 2.4, 1.3, shade(glass, 1.3));
    if (i < secs - 1) b.box(0, 0.6, z + SL / 2 + 0.2, W - 0.3, H - 0.8, 0.5, hex(0x333333)); }
  const half = secs * (SL + 0.4) / 2 - 0.2;
  b.box(0, 1.1, half + 0.02, W - 0.2, 1.8, 0.04, glass); b.box(0, 1.1, -half - 0.02, W - 0.2, 1.8, 0.04, glass);
  b.box(0, H, 0, 0.3, 0.6, 0.3, hex(0x333333)); b.box(0, H + 0.6, 0, 1.6, 0.06, 0.4, hex(0x333333)); // токоприёмник
  lights(b, W, 0.8, half, -half);
}
function locomotive(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.95, 0.95, 0.95] as RGB : hex(o.color ?? V.loco), s = hex(V.locoStripe), W = 3.0, L = 18;
  b.box(0, 0.4, 0, W - 0.2, 0.7, L, hex(0x2a2d32)); // рама с тележками
  b.box(0, 1.1, 0, W, 3.0, L, c, shade(c, 1.15), 0.3);
  b.box(W / 2 + 0.03, 1.5, 0, 0.04, 0.35, L, s); b.box(-W / 2 - 0.03, 1.5, 0, 0.04, 0.35, L, s);
  for (const e of [1, -1]) { b.box(0, 2.6, e * (L / 2 + 0.02), W - 0.5, 1.0, 0.04, glass); b.box(0, 1.2, e * (L / 2 + 0.03), W, 0.5, 0.04, s);
    b.box(W / 2 + 0.03, 2.6, e * (L / 2 - 1.4), 0.04, 0.9, 1.4, glass); b.box(-W / 2 - 0.03, 2.6, e * (L / 2 - 1.4), 0.04, 0.9, 1.4, glass); }
  for (let z = -5; z <= 5; z += 2.5) b.box(0, 4.1, z, 1.6, 0.3, 1.6, hex(0x50555c)); // вентиляторы
  lights(b, W, 1.6, L / 2, -L / 2); wheels(b, W - 0.3, [-7, -5.6, 5.6, 7], 0.45);
}
function wagonPassenger(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.95, 0.95, 0.95] as RGB : hex(o.color ?? V.wagonPass), W = 2.9, L = 22;
  b.box(0, 0.4, 0, W - 0.3, 0.7, L, hex(0x2a2d32)); b.box(0, 1.1, 0, W, 2.9, L, c, hex(0xc8ccd6), 0.35);
  for (let z = -L / 2 + 2.5; z < L / 2 - 2; z += 1.8) for (const s of [1, -1]) b.box(s * (W / 2 + 0.03), 2.1, z, 0.04, 0.9, 1.2, glass);
  b.box(W / 2 + 0.04, 1.6, 0, 0.04, 0.2, L, hex(V.locoStripe)); b.box(-W / 2 - 0.04, 1.6, 0, 0.04, 0.2, L, hex(V.locoStripe));
  wheels(b, W - 0.3, [-9, -7.6, 7.6, 9], 0.45);
}
function wagonFreight(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.9, 0.9, 0.9] as RGB : hex(r.pick(V.wagonFreight)), W = 2.9, L = 14;
  b.box(0, 0.4, 0, W - 0.3, 0.7, L, hex(0x2a2d32)); b.box(0, 1.1, 0, W, 2.8, L, c);
  for (let z = -L / 2 + 1; z <= L / 2 - 1; z += 2) for (const s of [1, -1]) b.box(s * (W / 2 + 0.03), 1.1, z, 0.06, 2.8, 0.12, shade(c, 0.75)); // рёбра
  b.box(W / 2 + 0.04, 1.3, 0, 0.04, 2.3, 2.6, shade(c, 0.85)); b.box(-W / 2 - 0.04, 1.3, 0, 0.04, 2.3, 2.6, shade(c, 0.85));
  wheels(b, W - 0.3, [-5.5, -4.2, 4.2, 5.5], 0.45);
}
function wagonTank(b: GeoBuilder, r: Rng, o: VehicleOpts) {
  const c = o.neutral ? [0.9, 0.9, 0.9] as RGB : hex(r.pick([0x2a2d32, 0xd8d4cc, 0x8a4a3a])), W = 2.9, L = 14;
  b.box(0, 0.4, 0, W - 0.3, 0.7, L, hex(0x2a2d32));
  const tank = new GeoBuilder(); tank.ao = 0; tank.cyl(0, -L / 2 + 0.4, 0, 1.4, 1.4, L - 0.8, 8, c, shade(c, 0.9), Math.PI / 8);
  for (let i = 0; i < tank.pos.length; i += 3) { const x = tank.pos[i], y = tank.pos[i + 1], z = tank.pos[i + 2]; b.pos.push(x, z + 2.5, y); }
  // перестановка Y↔Z меняет порядок обхода — разворачиваем треугольники
  const start = b.pos.length - tank.pos.length; for (let i = start; i < b.pos.length; i += 9) for (let k = 0; k < 3; k++) { const t = b.pos[i + 3 + k]; b.pos[i + 3 + k] = b.pos[i + 6 + k]; b.pos[i + 6 + k] = t; }
  for (let i = 0; i < tank.col.length; i += 9) { b.col.push(...tank.col.slice(i, i + 3), ...tank.col.slice(i + 6, i + 9), ...tank.col.slice(i + 3, i + 6)); }
  b.box(0, 3.85, 0, 0.9, 0.35, 0.9, shade(c, 0.8));
  wheels(b, W - 0.3, [-5.5, -4.2, 4.2, 5.5], 0.45);
}

const IMPL: Record<VehicleKind, (b: GeoBuilder, r: Rng, o: VehicleOpts) => void> = { car, hatch, van, truck, bus, tram, locomotive, wagonPassenger, wagonFreight, wagonTank };
export const VEHICLE_KINDS = Object.keys(IMPL) as VehicleKind[];
/** Длина (м) для расстановки вагонов/интервалов. */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = { car: 4.3, hatch: 3.7, van: 5, truck: 9.2, bus: 12, tram: 29.3, locomotive: 18, wagonPassenger: 22, wagonFreight: 14, wagonTank: 14 };

export function createVehicle(kind: VehicleKind, opts: VehicleOpts = {}): THREE.BufferGeometry {
  const b = new GeoBuilder(); b.ao = 0.15; b.aoHeight = 1.2; IMPL[kind](b, rng(opts.seed ?? 1), opts); return b.build();
}
