// v5 F2: дворы по теме. Вход — полигон двора (внутренность квартала за вычетом пятен домов + отступ 3 м). Выход — список элементов (детерминирован по seed).
export type ThemeId = 'base' | 'lateSng' | 'russianClassic' | 'french';
export type YardItem = { kind: 'path' | 'bench' | 'playground' | 'tree' | 'bush' | 'parking' | 'lawn' | 'garage' | 'fountain' | 'bins'; x: number; z: number; w?: number; d?: number; rot?: number };
/** Правила (размеры в м). Площадь двора A: <300 — «карман», 300–1500 — обычный, >1500 — большой. */
export const YARD_RULES: Record<ThemeId, { parkingShare: number; parkingAlong: 'houses' | 'perimeter' | 'none'; playMinA: number; play: [number, number]; treeStep: number; benchPerPath: number; path: { w: number; style: 'diagonal' | 'cross' | 'ring' | 'axial' }; lawnShare: number; extras: YardItem['kind'][]; trees: string[] }> = {
  base:           { parkingShare: 0.15, parkingAlong: 'perimeter', playMinA: 500, play: [14, 10], treeStep: 9,  benchPerPath: 2, path: { w: 2.0, style: 'diagonal' }, lawnShare: 0.5,  extras: ['bins'],             trees: ['deciduous', 'birch'] },
  lateSng:        { parkingShare: 0.30, parkingAlong: 'houses',    playMinA: 400, play: [18, 12], treeStep: 8,  benchPerPath: 4, path: { w: 1.8, style: 'cross' },    lawnShare: 0.35, extras: ['garage', 'bins'],   trees: ['birch', 'poplar', 'deciduous'] },
  russianClassic: { parkingShare: 0.10, parkingAlong: 'perimeter', playMinA: 600, play: [12, 10], treeStep: 10, benchPerPath: 4, path: { w: 2.5, style: 'ring' },     lawnShare: 0.45, extras: ['fountain', 'bins'], trees: ['oak', 'deciduous'] },
  french:         { parkingShare: 0.0,  parkingAlong: 'none',      playMinA: 900, play: [10, 8],  treeStep: 7,  benchPerPath: 2, path: { w: 3.0, style: 'axial' },    lawnShare: 0.2,  extras: ['fountain'],         trees: ['poplar', 'deciduous'] },
};
export const YARD = { setback: 3, parkSlot: [2.5, 5.0], aisle: 6, benchGap: 12, minPocket: 120 };
/** Прямоугольный двор w×d (локальные оси, центр 0,0) — частый случай квартала; для произвольного — вписанный OBB. */
export function layoutYard(theme: ThemeId, w: number, d: number, seed = 1): YardItem[] {
  const R = YARD_RULES[theme], out: YardItem[] = []; let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const A = w * d; if (A < YARD.minPocket) return [{ kind: 'lawn', x: 0, z: 0, w, d }, { kind: 'tree', x: 0, z: 0 }];
  let x0 = -w / 2, x1 = w / 2; const z0 = -d / 2, z1 = d / 2;
  // 1) парковка: карманы вдоль домов (СНГ) — полоса 5 м + проезд 6 м вдоль длинной стороны
  if (R.parkingShare > 0 && A > 300) { const depth = YARD.parkSlot[1] + YARD.aisle; const n = Math.floor(w * R.parkingShare * 2 / YARD.parkSlot[0]);
    out.push({ kind: 'parking', x: 0, z: z0 + depth / 2, w: Math.min(w - 4, n * YARD.parkSlot[0]), d: depth }); }
  const zc0 = z0 + (R.parkingShare > 0 && A > 300 ? YARD.parkSlot[1] + YARD.aisle + 1 : 1);
  out.push({ kind: 'lawn', x: 0, z: (zc0 + z1) / 2, w: w - 2, d: z1 - zc0 - 1 });
  // 2) дорожки
  const cz = (zc0 + z1) / 2, hd = (z1 - zc0) / 2;
  const P = R.path; if (P.style === 'diagonal') { out.push({ kind: 'path', x: 0, z: cz, w: Math.hypot(w, 2 * hd), d: P.w, rot: Math.atan2(2 * hd, w) }); }
  else if (P.style === 'cross') { out.push({ kind: 'path', x: 0, z: cz, w, d: P.w }, { kind: 'path', x: 0, z: cz, w: P.w, d: 2 * hd }); }
  else if (P.style === 'ring') { const rw = w * 0.7, rd = hd * 1.4; for (const [px, pz, pw, pd] of [[0, cz - rd / 2, rw, P.w], [0, cz + rd / 2, rw, P.w], [-rw / 2, cz, P.w, rd], [rw / 2, cz, P.w, rd]]) out.push({ kind: 'path', x: px, z: pz, w: pw, d: pd }); }
  else out.push({ kind: 'path', x: 0, z: cz, w: P.w, d: 2 * hd });
  // 3) площадка — в центре наибольшего свободного квадранта
  if (A >= R.playMinA) out.push({ kind: 'playground', x: w / 4, z: cz - hd / 2 + R.play[1] / 2, w: R.play[0], d: R.play[1] });
  if (R.extras.includes('fountain') && A > 800) out.push({ kind: 'fountain', x: 0, z: cz });
  if (R.extras.includes('garage') && A > 900) out.push({ kind: 'garage', x: x0 + 6, z: z1 - 4, w: 9, d: 5 });
  if (R.extras.includes('bins')) out.push({ kind: 'bins', x: x1 - 3, z: zc0 + 1.5, w: 3, d: 1.5 });
  // 4) скамейки вдоль дорожек — шаг 12 м
  for (let k = 0; k < R.benchPerPath; k++) out.push({ kind: 'bench', x: (k + 0.5 - R.benchPerPath / 2) * YARD.benchGap * 0.8, z: cz + (k % 2 ? 1 : -1) * (P.w / 2 + 0.8), rot: k % 2 ? Math.PI : 0 });
  // 5) деревья — по периметру зелёной зоны с шагом treeStep, ±1 м джиттер, не на дорожках/площадке
  const busy = (x: number, z: number) => out.some(o => (o.kind === 'path' || o.kind === 'playground' || o.kind === 'parking' || o.kind === 'garage') && Math.abs(x - o.x) < (o.w ?? 0) / 2 + 1.5 && Math.abs(z - o.z) < (o.d ?? 0) / 2 + 1.5 && !o.rot);
  for (let x = x0 + 3; x <= x1 - 3; x += R.treeStep) for (const z of [zc0 + 2, z1 - 2]) { const tx = x + (rnd() - 0.5) * 2, tz = z + (rnd() - 0.5) * 2; if (!busy(tx, tz)) out.push({ kind: 'tree', x: tx, z: tz }); }
  for (let k = 0; k < Math.floor(A / 150); k++) { const bx = x0 + 2 + rnd() * (w - 4), bz = zc0 + 2 + rnd() * (z1 - zc0 - 4); if (!busy(bx, bz)) out.push({ kind: 'bush', x: bx, z: bz }); }
  return out;
}
/** Выбор темы зоны (F1): тема — свойство кисти/зоны, хранится в zoneTheme[k]; смешения нет. */
export const ZONE_THEME_UI = { default: 'lateSng' as ThemeId, order: ['lateSng', 'russianClassic', 'french', 'base'] as ThemeId[], hotkey: 'Shift+колесо — смена темы кисти', swatch: { lateSng: 0xc9d3dc, russianClassic: 0xe8b85a, french: 0xf1e6cf, base: 0xffd7b8 } };
