/**
 * Темы зданий — единый API.
 *   createThemedBuilding({ theme, kind, width, depth, floors, seed, lit, neutral }) → BufferGeometry (+ userData.details, userData.dims)
 *   dimensionsLimits(theme, kind) → Limits | null ;  fitDimensions(...) — clamp с шагом модуля
 *   dimensionsFromLot(theme, kind, lotW, lotD, density) — размер из участка
 * Также доступно через models/index.ts: createBuilding({theme,...}) (перегрузка) и createModel({type:'themed', opts}).
 */
import * as THREE from 'three';
import { GeoBuilder, rng } from '../builder';
import { createBuilding as createBaseBuilding } from '../buildings';
import { Ctx, Dims, Limits, ThemeId, ThemeKind, ThemedBuildingOpts, fitDims } from './common';
import { BASE_LIMITS, BASE_MAP, baseDetails } from './base';
import { SNG_LIMITS, buildSng } from './sng';
import { CLASSIC_LIMITS, buildClassic } from './classic';
import { FRENCH_LIMITS, buildFrench } from './french';
export * from './common';
export { BASE_LIMITS, SNG_LIMITS, CLASSIC_LIMITS, FRENCH_LIMITS };

export const THEME_IDS: ThemeId[] = ['base', 'lateSng', 'russianClassic', 'french'];
const LIM: Record<ThemeId, Partial<Record<ThemeKind, Limits>>> = { base: BASE_LIMITS, lateSng: SNG_LIMITS, russianClassic: CLASSIC_LIMITS, french: FRENCH_LIMITS };
/** Типы, доступные в теме. Нет resHigh у russianClassic/french — для них fallbackKind(). */
export const THEME_KINDS: Record<ThemeId, ThemeKind[]> = Object.fromEntries(THEME_IDS.map(t => [t, Object.keys(LIM[t]) as ThemeKind[]])) as Record<ThemeId, ThemeKind[]>;
/** Рекомендуемое число seed-вариаций на (тема, тип, размерный класс). */
export const THEME_VARIANTS = 4;

export function dimensionsLimits(theme: ThemeId, kind: ThemeKind): Limits | null { return LIM[theme][kind] ?? null; }
/** Ближайший доступный тип (resHigh → resMid в исторических темах). */
export function fallbackKind(theme: ThemeId, kind: ThemeKind): ThemeKind { if (LIM[theme][kind]) return kind; const order: ThemeKind[] = ['resHigh', 'resMid', 'office', 'commercial', 'resSmall']; return order.find(k => LIM[theme][k] && (kind === 'resHigh' ? k === 'resMid' : true)) ?? 'resMid'; }
export function fitDimensions(theme: ThemeId, kind: ThemeKind, o: { width?: number; depth?: number; floors?: number; height?: number } = {}): Dims { return fitDims(LIM[theme][fallbackKind(theme, kind)]!, o); }
/**
 * Размер из участка: фасад вдоль улицы = lotW − 2·боковой отступ (0 для исторических тем — сплошная застройка),
 * глубина = min(lotD − setback, лимит), этажность = lerp(min,max, density). Возвращает dims + смещение центра по Z от центра участка.
 */
export function dimensionsFromLot(theme: ThemeId, kind: ThemeKind, lotW: number, lotD: number, density = 0.5) {
  const L = LIM[theme][fallbackKind(theme, kind)]!; const side = L.setback > 0 ? Math.min(3, L.setback / 2) : 0;
  const dims = fitDims(L, { width: lotW - 2 * side, depth: lotD - L.setback, floors: Math.round(L.floors[0] + (L.floors[1] - L.floors[0]) * Math.max(0, Math.min(1, density))) });
  const fits = dims.w <= lotW + 1e-6 && dims.d + L.setback <= lotD + 1e-6;
  return { dims, offsetZ: lotD / 2 - L.setback - dims.d / 2, fits };
}
/** Ключ кэша (квантованный по модулю) — одинаковый ключ ⇒ одна геометрия ⇒ один InstancedMesh. */
export function themedCacheKey(o: ThemedBuildingOpts) { const D = fitDimensions(o.theme, o.kind, o); return `${o.theme}/${fallbackKind(o.theme, o.kind)}/${D.bays}x${D.d}x${D.floors}/${(o.seed ?? 1) % THEME_VARIANTS}/${o.neutral ? 'n' : 'c'}/${o.detail ?? 1}`; }

export function createThemedBuilding(o: ThemedBuildingOpts): THREE.BufferGeometry {
  const kind = fallbackKind(o.theme, o.kind); const D = fitDimensions(o.theme, kind, o); const r = rng((o.seed ?? 1) * 2654435761 % 4294967295 || 1);
  const b = new GeoBuilder(); b.aoHeight = 4; const c = new Ctx(b, r, D, { ...o, kind });
  let base: THREE.BufferGeometry | null = null;
  if (o.theme === 'base') { base = createBaseBuilding(BASE_MAP[kind], { lotW: D.w, lotD: D.d, floors: D.floors, seed: o.seed, lit: o.lit, neutral: o.neutral }); if ((o.detail ?? 1) > 0) baseDetails(c, kind); }
  else if (o.theme === 'lateSng') buildSng(c, kind); else if (o.theme === 'russianClassic') buildClassic(c, kind); else buildFrench(c, kind);
  let g = b.pos.length ? b.build() : null;
  if (base && g) g = mergeGeos([base, g]); else if (base) g = base;
  g!.userData = { details: c.det, dims: D, theme: o.theme, kind };
  return g!;
}
/** Склейка non-indexed геометрий с position/normal/color/glow (детали «вклеиваются» в здание — один draw call). */
export function mergeGeos(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, n] of [['position', 3], ['normal', 3], ['color', 3], ['glow', 1]] as const) {
    const total = gs.reduce((s, g) => s + g.attributes.position.count, 0); const arr = new Float32Array(total * n); let off = 0;
    for (const g of gs) { const a = g.getAttribute(name) as THREE.BufferAttribute | undefined; if (a) arr.set(a.array as Float32Array, off); off += g.attributes.position.count * n; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  out.computeBoundingBox(); out.computeBoundingSphere(); return out;
}
