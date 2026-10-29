/**
 * CitySim design/models — единый API процедурных low-poly моделей.
 * Все генераторы возвращают ОДНУ non-indexed THREE.BufferGeometry с атрибутами position/normal/color.
 * Материал: new THREE.MeshLambertMaterial({ vertexColors: true }) (flat-вид за счёт неиндексированных граней).
 * Для покраски инстансов используйте opts.neutral = true + InstancedMesh.setColorAt().
 */
import * as THREE from 'three';
import { createBuilding, BUILDING_KINDS, BuildingKind, BuildingOpts } from './buildings';
import { createVehicle, VEHICLE_KINDS, VEHICLE_LENGTH, VehicleKind, VehicleOpts } from './vehicles';
import { createTree, TREE_KINDS, TreeKind, TreeOpts } from './trees';
import { createProp, PropKind } from './props';
export * from './buildings'; export * from './vehicles'; export * from './trees'; export * from './props';
export { GeoBuilder, rng } from './builder';

export type ModelKind = { type: 'building'; kind: BuildingKind; opts?: BuildingOpts } | { type: 'vehicle'; kind: VehicleKind; opts?: VehicleOpts } | { type: 'tree'; kind: TreeKind; opts?: TreeOpts } | { type: 'prop'; kind: PropKind; seed?: number };

export function createModel(m: ModelKind): THREE.BufferGeometry {
  switch (m.type) { case 'building': return createBuilding(m.kind, m.opts); case 'vehicle': return createVehicle(m.kind, m.opts); case 'tree': return createTree(m.kind, m.opts); case 'prop': return createProp(m.kind, m.seed); }
}

/** Кэш вариаций: N геометрий на тип (seed 1..N). Один InstancedMesh на вариацию. */
export class ModelLibrary {
  private cache = new Map<string, THREE.BufferGeometry>();
  get(m: ModelKind, variant = 0): THREE.BufferGeometry {
    const key = JSON.stringify(m) + '#' + variant; let g = this.cache.get(key);
    if (!g) { const mm = structuredClone(m) as any; if (mm.type === 'prop') mm.seed = (mm.seed ?? 1) + variant; else mm.opts = { ...(mm.opts || {}), seed: (mm.opts?.seed ?? 1) + variant * 7919 }; g = createModel(mm); this.cache.set(key, g); }
    return g;
  }
  dispose() { this.cache.forEach(g => g.dispose()); this.cache.clear(); }
}

/** Общий материал для всех моделей. */
export { createStyledMaterial } from '../scene-preset';
/** Простой материал без ночного свечения. Для полного стиля используйте createStyledMaterial(). */
export const createModelMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });
export const KINDS = { buildings: BUILDING_KINDS, vehicles: VEHICLE_KINDS, trees: TREE_KINDS, props: ['streetLight', 'busStop', 'tramStop', 'trafficLight', 'bench', 'signalLamp'] as PropKind[] };
export { VEHICLE_LENGTH };
