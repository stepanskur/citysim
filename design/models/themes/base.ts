/** Тема «base»: текущие генераторы v2 (buildings.ts) + слой масштабируемых деталей поверх. */
import { Ctx, Limits, ThemeKind, downpipes, acUnits, roofKit, canopy, fireEscape, RULES } from './common';
import { H } from './common';
import { BUILD } from '../../palette';

export const BASE_MAP: Record<ThemeKind, 'house' | 'resMid' | 'resTower' | 'commercialSmall' | 'office'> = { resSmall: 'house', resMid: 'resMid', resHigh: 'resTower', commercial: 'commercialSmall', office: 'office' };
/** floorH/groundH повторяют формулы buildings.ts: высота карниза = groundH + floors·floorH. */
export const BASE_LIMITS: Record<ThemeKind, Limits> = {
  resSmall: { w: [6, 12], d: [6, 10], floors: [1, 2], module: 1.5, dModule: 0.5, floorH: 3, groundH: 0, setback: 3 },
  resMid: { w: [12.8, 32], d: [10, 14], floors: [3, 6], module: 3.2, dModule: 1, floorH: 3.2, groundH: 1, setback: 4 },
  resHigh: { w: [14.4, 24], d: [14, 24], floors: [10, 24], module: 3.2, dModule: 1, floorH: 3.2, groundH: 5, setback: 8 },
  commercial: { w: [9.6, 19.2], d: [10, 16], floors: [1, 3], module: 3.2, dModule: 1, floorH: 3.2, groundH: 1.2, setback: 2 },
  office: { w: [16, 32], d: [16, 32], floors: [8, 30], module: 3.2, dModule: 1, floorH: 3.2, groundH: 0, setback: 6 },
};
/** Детали поверх базовой геометрии (её строит index.ts через createBuilding). */
export function baseDetails(c: Ctx, kind: ThemeKind) {
  const { D } = c; const top = D.eave + D.floorH - (kind === 'resSmall' ? 0 : 0); const bay = D.w / D.bays;
  if (kind === 'resSmall') { downpipes(c, D.floors * 3, [0, 1], H(BUILD.trim), 99); return; }
  downpipes(c, top, [0, 1], H(BUILD.trim));
  acUnits(c, [0, 1, 2, 3], kind === 'office' ? 0.6 : 1, D.groundH + 1, D.floorH, D.floors, bay);
  if (kind !== 'resMid') roofKit(c, top, 1.2, kind === 'office' ? 1.5 : 1); // у resMid скатная крыша v2 — без крышного набора
  if (kind !== 'resHigh' && D.floors >= RULES.fireEscape.minFloors && D.d >= RULES.fireEscape.minDepth) fireEscape(c, 3, 0, D.groundH, D.floorH, D.floors);
  const nEnt = Math.max(1, Math.round(D.w / RULES.entrance.spacing)); for (let i = 0; i < nEnt; i++) canopy(c, 0, -D.w / 2 + D.w / nEnt * (i + 0.5), 2.7, 2.2, 1.0, H(BUILD.trim));
}
