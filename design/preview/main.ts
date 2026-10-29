import * as THREE from 'three';
import { ModelLibrary, createStyledMaterial, KINDS, VEHICLE_LENGTH, BUILDING_VARIANTS, BuildingKind } from '../models';
import { applyScenePreset, TimeOfDay } from '../scene-preset';
import { TERRAIN, ROADS } from '../palette';

const hash = location.hash.slice(1).split(',');
const time = (hash.find(h => ['day', 'dusk', 'night', 'dawn'].includes(h)) ?? 'day') as TimeOfDay;
const view = hash.find(h => ['veh', 'grid', 'street', 'trees'].includes(h)) ?? 'hero';
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const rig = applyScenePreset(r, scene, { time, dist: 260, shadowSize: 2048 });
const mat = createStyledMaterial(), lib = new ModelLibrary();
const flat = (w: number, d: number, c: number, x: number, z: number, y = 0.02) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: c })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; };
flat(4000, 4000, TERRAIN.grass, 0, 0, 0);
const add = (g: THREE.BufferGeometry, x: number, z: number, ry = 0, s = 1) => { const m = new THREE.Mesh(g, mat); m.position.set(x, 0, z); m.rotation.y = ry; m.scale.setScalar(s); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
const width = (g: THREE.BufferGeometry) => { g.computeBoundingBox(); const b = g.boundingBox!; return { w: b.max.x - b.min.x, d: b.max.z - b.min.z }; };
let tris = 0;

// --- Сетка вариаций: строка на тип здания, по 6 вариаций
const rows: BuildingKind[] = ['house', 'resMid', 'commercialSmall', 'resTower', 'office', 'industrial', 'warehouse', 'civic', 'station', 'depot'];
let z = -40;
for (const k of rows) {
  const n = Math.min(6, BUILDING_VARIANTS[k] < 6 ? Math.max(3, BUILDING_VARIANTS[k]) : 6); let x = -130, rowD = 0;
  flat(300, 4, ROADS.sidewalk, 0, z + 3, 0.03); flat(300, 8, ROADS.asphalt, 0, z + 9, 0.035);
  for (let v = 0; v < n; v++) { const g = lib.get({ type: 'building', kind: k }, v); const { w, d } = width(g); add(g, x + w / 2, z - d / 2 + 1); x += w + 5; rowD = Math.max(rowD, d); }
  z -= rowD + 18;
}
// --- транспорт на первой улице
let x = -110; for (const k of ['car', 'hatch', 'bus', 'car', 'van', 'truck', 'car', 'tram', 'hatch', 'car'] as const) { const L = VEHICLE_LENGTH[k]; add(lib.get({ type: 'vehicle', kind: k }, Math.abs(x | 0) % 9), x + L / 2, -31 + (k === 'tram' ? 2.5 : 0), Math.PI / 2); x += L + 3; }
flat(300, 7, ROADS.ballast, 0, 18, 0.03);
x = -80; for (const k of ['locomotive', 'wagonPassenger', 'wagonPassenger', 'wagonFreight', 'wagonTank', 'wagonFreight', 'wagonFreight'] as const) { const L = VEHICLE_LENGTH[k]; add(lib.get({ type: 'vehicle', kind: k }, 1), x + L / 2, 18, -Math.PI / 2); x += L + 1; }
// --- деревья и пропсы
for (let i = 0; i < 120; i++) { const k = KINDS.trees[i % KINDS.trees.length]; add(lib.get({ type: 'tree', kind: k }, i % 5), -140 + (i % 40) * 7 + Math.sin(i * 7.1) * 2, 30 + Math.floor(i / 40) * 9 + Math.cos(i * 3.3) * 2, i * 1.7, 0.85 + (i * 37 % 10) / 30); }
x = -126; for (const k of KINDS.props) { add(lib.get({ type: 'prop', kind: k }), x, 8); x += 12; }
for (let i = 0; i < 12; i++) add(lib.get({ type: 'prop', kind: 'streetLight' }), -120 + i * 22, -26.5, Math.PI);
scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.attributes.glow) tris += m.geometry.attributes.position.count / 3; });

const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 1, 100000);
const views: Record<string, [number[], number[]]> = {
  hero: [[150, 170, 160], [-20, 0, -70]], grid: [[0, 520, 260], [0, 0, -170]], veh: [[-55, 14, -2], [-75, 2, -32]],
  street: [[-150, 40, 10], [-60, 6, -60]], trees: [[-20, 30, 85], [-40, 4, 35]],
};
const [p, t] = views[view]; cam.position.set(p[0], p[1], p[2]); cam.lookAt(t[0], t[1], t[2]);
rig.sun.target.position.set(t[0], 0, t[2]); rig.sun.position.add(rig.sun.target.position);
r.render(scene, cam); (window as any).debugInfo = () => ({ tris, view, time }); (window as any).ready = true; (window as any).__d = { r, scene, rig };
setInterval(() => r.render(scene, cam), 500);
