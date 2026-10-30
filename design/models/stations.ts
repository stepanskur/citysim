/**
 * Модульные станции: ж/д вокзал, метро (павильон + подземная платформа), остановки v2.
 * Ось платформы — X (вдоль путей), путь(и) при z>0. Модуль секции = STATION_MODULE.section м.
 * Для удлинения: createStation('railPlatformSection') ставится шагом section по X от края railStation.
 */
import * as THREE from 'three';
import { GeoBuilder, hex, shade, RGB } from './builder';
import { BRAND, VEHICLES } from '../palette';

export type StationKind = 'railStation' | 'railPlatformSection' | 'metroEntrance' | 'metroPlatform' | 'metroPlatformSection' | 'busStopV2' | 'tramStopV2';
export const STATION_KINDS: StationKind[] = ['railStation', 'railPlatformSection', 'metroEntrance', 'metroPlatform', 'metroPlatformSection', 'busStopV2', 'tramStopV2'];
export interface StationOpts { seed?: number; /** число секций платформы (railStation / metroPlatform), по умолч. 3 */ sections?: number; /** 1 = одна сторона, 2 = островная */ sides?: 1 | 2; neutral?: boolean; /** метро: потолок станции (для обычного разреза), по умолч. нет */ ceiling?: boolean }

/** Габариты (м). Совпадают с ROADS_SPEC.md §6. */
export const STATION_MODULE = {
  section: 12,          // длина секции платформы
  railPlatformH: 1.1, railPlatformW: 6, railTrackOffset: 4.6, // ось пути от оси платформы
  metroDepth: 12,       // уровень головки рельса под землёй (y = -12)
  metroPlatformW: 10, metroTrackOffset: 6.6, metroColumnStep: 6,
  busStopL: 6, tramStopL: 18, tramIslandW: 3, stopCurb: 0.15,
};

const C = {
  sugar: hex(BRAND.sugar), teal: hex(BRAND.teal), coral: hex(BRAND.coral), saffron: hex(BRAND.saffron), ink: hex(BRAND.ink), lav: hex(BRAND.lavender),
  concrete: hex(0xd8d2c6), paving: hex(0xe8dccb), edge: hex(0xffd65a), glass: hex(0x9fd3e0), brick: hex(0xe7a88a), roof: hex(0x2f8f88),
  tile: hex(0xf3ebe0), dark: hex(0x3a3f5a), wood: hex(0xb07a52),
};

/** Платформа: плита + жёлтая линия края + опционально навес. x от x0 длиной L. */
function platform(b: GeoBuilder, x0: number, L: number, w: number, h: number, canopy: boolean, accent: RGB, y = 0) {
  const cx = x0 + L / 2;
  b.box(cx, y, 0, L, h, w, C.concrete, C.paving, 0.04);
  for (const s of [-1, 1]) b.box(cx, y + h, s * (w / 2 - 0.3), L, 0.015, 0.25, C.edge); // тактильная полоса
  if (!canopy) return;
  const step = STATION_MODULE.section / 2;
  for (let x = x0 + step / 2; x < x0 + L; x += step) { b.box(x, y + h, 0, 0.22, 3.4, 0.22, C.sugar); b.box(x, y + h + 3.2, 0, 0.22, 0.2, w * 0.7, C.sugar); }
  // навес-«крыло»: два ската к центру (бабочка), кромка акцентом
  const yt = y + h + 3.6, wh = w / 2 + 0.4;
  b.quad([x0, yt, 0], [x0 + L, yt, 0], [x0 + L, yt + 0.5, wh], [x0, yt + 0.5, wh], C.roof);
  b.quad([x0, yt + 0.5, -wh], [x0 + L, yt + 0.5, -wh], [x0 + L, yt, 0], [x0, yt, 0], C.roof);
  b.quad([x0, yt + 0.5, wh], [x0 + L, yt + 0.5, wh], [x0 + L, yt + 0.3, wh], [x0, yt + 0.3, wh], accent);
  b.quad([x0 + L, yt + 0.5, -wh], [x0, yt + 0.5, -wh], [x0, yt + 0.3, -wh], [x0 + L, yt + 0.3, -wh], accent);
  // табло
  b.box(cx, y + h + 2.6, 0, 1.6, 0.45, 0.1, C.ink); b.glow = 0.5; b.box(cx, y + h + 2.65, 0.06, 1.4, 0.3, 0.02, C.saffron); b.glow = 0;
  for (let x = x0 + 3; x < x0 + L - 2; x += 6) { b.box(x, y + h + 0.4, 0, 1.6, 0.08, 0.45, C.wood); b.box(x, y + h, 0, 0.1, 0.4, 0.3, C.ink); }
}

/** Рельсы на шпалах вдоль X (балласт опционально). */
export function trackX(b: GeoBuilder, x0: number, L: number, z: number, y: number, ballast = true) {
  if (ballast) b.box(x0 + L / 2, y, z, L, 0.35, 3.2, hex(0xa49a8c), hex(0xb5ab9c), 0.3);
  const yb = y + (ballast ? 0.35 : 0);
  for (let x = x0 + 0.3; x < x0 + L; x += 0.6) b.box(x, yb, z, 0.24, 0.16, 2.6, C.wood);
  for (const s of [-0.76, 0.76]) b.box(x0 + L / 2, yb + 0.16, z + s, L, 0.18, 0.08, hex(0x8a8f9c), hex(0xd8dde6));
}

function stationBuilding(b: GeoBuilder, cx: number, cz: number) {
  const W = 26, D = 12;
  b.box(cx, 0, cz, W, 0.5, D + 1, C.concrete);
  b.box(cx, 0.5, cz, W, 7, D, C.brick, undefined, 0.05);
  b.band(cx, 7.5, cz, W, D, 0.4, 0.25, C.sugar);
  b.windowGrid(cx, cz, W, D, 1.4, 1, 6, C.glass, C.sugar, { winW: 2.2, winH: 4, gap: 1.2 } as any);
  b.hip(cx, 7.9, cz, W, D, 3.4, C.roof, 0.6);
  // центральный ризалит с часами
  b.box(cx, 0.5, cz - D / 2 - 1, 8, 9.5, 2.2, C.sugar);
  b.gable(cx, 10, cz - D / 2 - 1, 8, 2.2, 2.2, C.roof, C.sugar, 0.3);
  b.cyl(cx, 7.4, cz - D / 2 - 2.15, 1.1, 1.1, 0.12, 16, C.ink, undefined, 0); // циферблат
  b.glow = 0.4; b.box(cx, 0.5, cz - D / 2 - 2.12, 3.2, 4.2, 0.04, C.glass); b.glow = 0;
  b.box(cx, 0.5, cz - D / 2 - 3.3, 6, 0.15, 2.2, C.paving);
}

function metroLogo(b: GeoBuilder, x: number, y: number, z: number) {
  b.cyl(x, 0, z, 0.08, 0.08, y, 6, C.ink);
  b.glow = 0.3; b.box(x, y, z, 1.1, 1.1, 0.25, C.coral); b.box(x, y + 0.25, z + 0.13, 0.7, 0.6, 0.02, C.sugar); b.glow = 0;
}

export function createStation(kind: StationKind, o: StationOpts = {}): THREE.BufferGeometry {
  const b = new GeoBuilder(); const n = Math.max(1, o.sections ?? 3); const M = STATION_MODULE;
  if (kind === 'railStation' || kind === 'railPlatformSection') {
    const L = kind === 'railStation' ? n * M.section : M.section, x0 = -L / 2;
    platform(b, x0, L, M.railPlatformW, M.railPlatformH, true, C.coral);
    trackX(b, x0, L, M.railTrackOffset, 0);
    if ((o.sides ?? 2) === 2) trackX(b, x0, L, -M.railTrackOffset, 0);
    if (kind === 'railStation') {
      // здание вокзала сбоку (z<0), переходный мостик над путём
      const bz = -M.railTrackOffset - 2.2 - 6 - 3;
      stationBuilding(b, 0, bz);
      const bx = x0 + M.section / 2;
      for (const z of [bz + 6, -M.railPlatformW / 2 + 0.6]) b.box(bx, 0, z, 2.6, 6.5, 2.6, C.sugar);
      b.box(bx, 6.5, (bz + 6 - M.railPlatformW / 2) / 2, 3, 2.8, Math.abs(bz + 6 + M.railPlatformW / 2) + 2.6, C.glass, C.roof);
    }
  }
  if (kind === 'metroEntrance') {
    // наземный павильон 6×4: стеклянный короб, навес-козырёк с кораллом, лестница вниз (уклон 30°)
    b.box(0, 0, 0, 7, 0.2, 5, C.paving);
    b.box(0, 0.2, 1.2, 6, 0.15, 2.4, C.ink); // проём лестницы
    for (let i = 0; i < 8; i++) b.box(0, 0.2 - i * 0.3, 1.2 - 1.2 + i * 0.3 + 0.15, 2.4, 0.06, 0.3, C.tile);
    for (const x of [-3, 3]) b.box(x, 0.2, 0, 0.18, 3, 4.4, C.sugar);
    b.box(0, 0.2, -2.1, 6, 3, 0.18, C.glass);
    b.glow = 0.35; b.box(0, 0.4, -2.0, 5.6, 2.6, 0.02, hex(0xffe7b0)); b.glow = 0;
    b.box(0, 3.2, 0, 7.2, 0.35, 5.2, C.sugar, C.teal, 0.08);
    b.box(0, 3.2, 2.6, 7.2, 0.35, 0.05, C.coral);
    metroLogo(b, 4.2, 3.2, 2);
  }
  if (kind === 'metroPlatform' || kind === 'metroPlatformSection') {
    const L = kind === 'metroPlatform' ? n * M.section : M.section, x0 = -L / 2, y = 0; // строим на 0 (AO), сдвиг вниз в конце
    const W = M.metroPlatformW, T = M.metroTrackOffset, H = 6;
    // коробка тоннеля станции: пол, свод (без верха снаружи — для x-ray), торцы стен
    b.box(0, y - 0.6, 0, L, 0.4, W + 2 * T + 4, C.dark, hex(0x55597a));
    for (const s of [-1, 1]) b.box(0, y - 0.6, s * (W / 2 + T + 2), L, H + 0.6, 0.4, C.tile);
    platform(b, x0, L, W, 1.0, false, C.coral, y - 0.2);
    for (const s of [-1, 1]) trackX(b, x0, L, s * T, y - 0.2, false);
    // колонны с капителями в два ряда
    for (let x = x0 + M.metroColumnStep / 2; x < x0 + L; x += M.metroColumnStep) for (const s of [-1, 1]) {
      b.cyl(x, y + 0.8, s * 2.2, 0.35, 0.35, H - 1.6, 8, C.sugar);
      b.box(x, y + H - 0.8, s * 2.2, 1.2, 0.3, 1.2, C.saffron);
    }
    if (o.ceiling) b.box(0, y + H - 0.5, 0, L, 0.3, W + 2 * T + 4, shade(C.tile, 0.92)); // потолок (в x-ray выключен)
    b.glow = 1e-3; for (let x = x0 + 3; x < x0 + L; x += 6) b.box(x, y + H - 0.55, 0, 2.4, 0.05, 0.5, hex(0xfff2cc)); b.glow = 0; // светильники (всегда горят)
    if (kind === 'metroPlatform') for (const xe of [x0 + 2, x0 + L - 2]) { // эскалаторные наклонные ходы к павильонам
      const dir = xe < 0 ? -1 : 1;
      for (let i = 0; i < 10; i++) b.box(xe + dir * (i * 1.2 + 0.6), y + 0.8 + i * (M.metroDepth / 10), 0, 1.2, 0.5, 3.2, C.tile);
    }
    const g = b.build(); g.translate(0, -M.metroDepth, 0); return g;
  }
  if (kind === 'busStopV2' || kind === 'tramStopV2') {
    const tram = kind === 'tramStopV2', L = tram ? M.tramStopL : M.busStopL, acc = hex(tram ? VEHICLES.tram : VEHICLES.bus);
    const pw = tram ? M.tramIslandW : 2.4, ph = tram ? 0.3 : M.stopCurb;
    platform(b, -L / 2, L, pw, ph, false, acc);
    const SL = 4.2; // модуль павильона
    const cnt = tram ? 2 : 1;
    for (let k = 0; k < cnt; k++) {
      const cx = tram ? (k - 0.5) * (SL + 3) : 0;
      for (const x of [cx - SL / 2, cx + SL / 2]) b.box(x, ph, -pw / 2 + 0.4, 0.1, 2.5, 0.1, C.ink);
      b.box(cx, ph + 0.2, -pw / 2 + 0.3, SL, 2.1, 0.05, C.glass);
      b.box(cx - SL / 2, ph + 0.2, -pw / 2 + 0.9, 0.05, 2.1, 1.2, C.glass);
      b.box(cx, ph + 2.5, -pw / 2 + 0.9, SL + 0.4, 0.14, 1.6, C.sugar, acc, 0.05);
      b.box(cx, ph + 0.45, -pw / 2 + 0.55, SL * 0.6, 0.07, 0.38, C.wood);
      b.glow = 0.45; b.box(cx + SL / 2 - 0.1, ph + 0.4, -pw / 2 + 1.1, 0.08, 1.7, 0.9, hex(0xffe7b0)); b.glow = 0; // светящийся сити-формат
    }
    // стойка-знак с акцентным «таблетом»
    const sx = L / 2 - 0.6; b.cyl(sx, ph, 0, 0.05, 0.05, 2.8, 6, C.ink); b.box(sx, ph + 2.5, 0, 0.7, 0.7, 0.06, acc, C.sugar, 0.03);
    b.box(sx, ph + 2.62, 0.04, 0.42, 0.42, 0.02, C.sugar);
  }
  return b.build();
}
