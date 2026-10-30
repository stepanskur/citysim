// Этап C: модульные профили дорог (mechanics/11 §2, design/road-kit-v2 PROFILES). ROAD_TYPES 0–3 — пресеты профилей.
import { PROFILES, profileWidth, type Strip } from '../../design/road-kit-v2';
export const PRESET_PROFILE = ['street', 'avenue', 'highway', 'lane'] as const; // индекс = ROAD_TYPES
/** Модули на дороге: полосы задаются составом профиля; avenueTram — проспект с трамвайным модулем. */
export function profileOf(type: number, modules: { tram?: boolean; oneLaneHighway?: boolean } = {}): Strip[] {
  if (type === 1 && modules.tram) return PROFILES.avenueTram;
  if (type === 2 && modules.oneLaneHighway) return [{ kind: 'shoulder' }, { kind: 'lane' }, { kind: 'median', w: 1 }, { kind: 'lane' }, { kind: 'shoulder' }];
  return PROFILES[PRESET_PROFILE[type]];
}
export const profileWidthOf = (type: number, modules = {}) => profileWidth(profileOf(type, modules));
