// Этап H: темы зданий Дезигнера (design/models/themes, THEMES_SPEC v4). Выбор темы квартала, тип по классу участка,
// размер — dimensionsFromLot (центр сдвигается на offsetZ к улице, фасад +Z), fits=false → другой тип или base.
import { dimensionsFromLot, fallbackKind, type ThemeId, type ThemeKind } from '../../design/models/themes';
import { THEMES_MUTED as THEMES } from '../../design/palette'; // E: приглушённые темы
import type { World } from '../world/World';
import { BALANCE } from '../sim/balance';
import { ZONE_THEME_UI } from '../../design/yards';

export type Arch = 'mixed' | ThemeId;
export const ARCH_OPTIONS: { id: Arch; name: string; hint: string }[] = [
  { id: 'base', name: 'Пастила', hint: 'фирменный стиль v2: пастельные дома и стекло' },
  { id: 'lateSng', name: 'Позднее СНГ', hint: 'панельки, дворы, до 16 эт.' },
  { id: 'russianClassic', name: 'Рус. классика', hint: 'доходные дома, сплошная застройка, до 5 эт.' },
  { id: 'french', name: 'Париж', hint: 'Осман: мансарды, балконы, до 7 эт.' },
  { id: 'mixed', name: 'Смешанный (старый)', hint: 'не по умолчанию: тема по кварталам; кисть зоны важнее' },
];
export interface Quarter { t: ThemeId; e: number }
const h = (a: number, b: number, c: number) => { const q = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return q - Math.floor(q); };
const QB = () => BALANCE.themes;
export const quarterKey = (x: number, z: number) => Math.floor(x / QB().quarterSize) * 100003 + Math.floor(z / QB().quarterSize);

/** Тема квартала (фиксируется при первой постройке, хранится в world.quarters вместе с epoch — игровым годом застройки). §5 */
export function quarterTheme(w: World, x: number, z: number, cls: string): Quarter {
  const W = w as any; if (!W.quarters) W.quarters = new Map<number, Quarter>(); const key = quarterKey(x, z); let q = W.quarters.get(key) as Quarter | undefined; if (q) return q;
  const arch: Arch = W.arch || 'lateSng'; const epoch = Math.floor(W.gameYear || 0);
  let t: ThemeId;
  if (arch !== 'mixed') t = cls === 'ind' ? 'base' : arch;
  else {
    let best = Infinity, ci = 0; w.cities.forEach((c: any, i: number) => { const d = Math.hypot(c.x - x, c.z - z) / Math.max(1, c.r); if (d < best) { best = d; ci = i; } });
    const c = w.cities[ci] as any; const d = Math.hypot(c.x - x, c.z - z); const B = QB();
    const west = ((W.seed ?? 0) + ci) % 3 === 0; // «Западный» регион по seed — Париж вместо классики
    if (cls === 'office' || cls === 'ind' || epoch > B.lateEpoch) t = 'base';                                   // деловой центр / поздние районы — стекло
    else if (d <= B.coreRadius && epoch < B.coreEpoch) t = west ? 'french' : 'russianClassic';                  // исторический центр
    else if ((epoch >= B.ringEpoch[0] && epoch <= B.ringEpoch[1]) || cls === 'panel' || cls === 'mid' || cls === 'tower') t = 'lateSng'; // кольцо новостроек
    else t = 'base';
  }
  q = { t, e: epoch }; W.quarters.set(key, q); return q;
}
/** До 20 % «вкраплений» соседней темы на стыке районов (по seed лота). §5.3 */
export function lotTheme(w: World, x: number, z: number, cls: string): ThemeId {
  // F1: тема — свойство зоны (кисть), смешения нет; не задана — тема мира (по умолчанию Позднее СНГ)
  const i = Math.floor(x / 16), j = Math.floor(z / 16), zt = w.zoneTheme?.[j * w.N + i] | 0; if (zt) return ZONE_THEME_UI.order[zt - 1];
  const q = quarterTheme(w, x, z, cls); if (((w as any).arch || 'lateSng') !== 'mixed') return q.t;
  const S = QB().quarterSize; const r = h(x, z, 3); if (r >= QB().mixShare) return q.t;
  const dirs = [[S, 0], [-S, 0], [0, S], [0, -S]]; const [dx, dz] = dirs[Math.floor(h(z, x, 5) * 4)];
  const n = quarterTheme(w, x + dx, z + dz, cls).t; return n;
}
const KIND: Record<string, ThemeKind> = { house: 'resSmall', hist: 'resMid', mid: 'resMid', panel: 'resMid', tower: 'resHigh', shop: 'commercial', office: 'office' };
const ALT: Record<ThemeKind, ThemeKind[]> = { resHigh: ['resMid', 'resSmall'], resMid: ['resSmall', 'commercial'], resSmall: ['resMid'], commercial: ['resSmall', 'resMid'], office: ['commercial', 'resMid'] };
/** Подбор (тема, тип, размеры) под участок: fits=false → другой тип, затем base. null — не влезает никуда (рисуем по-старому). */
export function themedForLot(theme: ThemeId, cls: string, lotW: number, lotD: number, density: number, panelHigh = false) {
  let kind0 = KIND[cls]; if (!kind0) return null; if (cls === 'panel' && panelHigh) kind0 = 'resHigh';
  for (const th of theme === 'base' ? ['base' as ThemeId] : [theme, 'base' as ThemeId]) for (const k of [kind0, ...ALT[kind0]]) {
    const kk = fallbackKind(th, k); const r = dimensionsFromLot(th, kk, lotW, lotD, density); if (r.fits) return { theme: th, kind: kk, ...r };
  }
  return null;
}
/** Цвет стен под instanceColor (neutral-геометрия) — палитра темы */
export function wallColor(theme: ThemeId, hv: number, fallback: number) {
  const T: any = THEMES; const arr: number[] | undefined = theme === 'lateSng' ? T.lateSng.panels : theme === 'russianClassic' ? T.russianClassic.walls : theme === 'french' ? T.french.stone : undefined;
  return arr ? arr[Math.floor(hv * arr.length) % arr.length] : fallback;
}
