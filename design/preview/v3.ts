// Превью v3: кривые дороги, профили с трамваем, станции, метро-рентген, мост и тоннель. Hash: curve|rail|metro|stops|bridge|profile
import * as THREE from 'three';
import { createModel, createStyledMaterial } from '../models';
import { applyScenePreset } from '../scene-preset';
import { buildCurvedRoad, P } from '../road-curves';
import { buildProfile, PROFILES, buildTrack, buildBridge, buildTunnelPortal, buildTunnelTube } from '../road-kit-v2';
import { metroUniforms, patchSurfaceForMetro, setSurfaceMetroState, addUnderground } from '../metro-view';

const view = location.hash.slice(1) || 'curve';
addEventListener('hashchange', () => location.reload());
const LBL: Record<string, string> = { curve: 'Плавные кривые: Catmull-Rom + скругления, разметка вдоль кривой', rail: 'Ж/д вокзал: здание, платформы с навесом, секции ×4', metro: 'Метро: режим «рентген» — павильоны + подземная платформа', stops: 'Остановки v2: автобус и трамвай (островная) на проспекте с трамваем', bridge: 'Мост (пролёт 32 м) и портал тоннеля', profile: 'Профили: шоссе · проспект с трамваем · улица · переулок' };
document.getElementById('lbl')!.textContent = 'v3 · ' + (LBL[view] ?? view);
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); applyScenePreset(r, scene, { time: 'day', dist: 200, shadowSize: 2048 });
const mat = createStyledMaterial();
const kit = () => new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const marksMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const add = (g: THREE.BufferGeometry, m: THREE.Material = mat, x = 0, y = 0, z = 0, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
const groundMat = new THREE.MeshLambertMaterial({ color: 0xa9cf7a });
const ground = add(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), groundMat, 0, -0.05, 0);
const cam = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.5, 6000);
const look = (px: number, py: number, pz: number, tx = 0, ty = 0, tz = 0) => { cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); };
const road = (ctrl: P[], cls: any, mode: any = 'catmull') => { const R = buildCurvedRoad(ctrl, cls, mode, 0.02); add(R.base, kit()); add(R.marks, marksMat); };

if (view === 'curve') {
  road([{ x: -160, z: 60 }, { x: -80, z: 40 }, { x: -20, z: -30 }, { x: 60, z: -40 }, { x: 140, z: 30 }], 'avenue');
  road([{ x: -120, z: -110 }, { x: -40, z: -110 }, { x: 0, z: -60 }, { x: 10, z: 80 }], 'street', 'fillet');
  road([{ x: 60, z: 100 }, { x: 110, z: 90 }, { x: 120, z: 40 }], 'lane', 'fillet');
  for (const [x, z, k] of [[-60, 90, 'house'], [-110, -10, 'resMid'], [30, 30, 'commercialSmall'], [90, -95, 'office']] as const) add(createModel({ type: 'building', kind: k as any }), mat, x, 0, z);
  for (let i = 0; i < 18; i++) add(createModel({ type: 'tree', kind: i % 2 ? 'deciduous' : 'pine' }), mat, -150 + i * 17, 0, 110 - (i % 3) * 6);
  look(-30, 170, 210, 0, 0, -10);
}
if (view === 'rail') {
  const n = 3; add(createModel({ type: 'station', kind: 'railStation', opts: { sections: n } }));
  for (const s of [-1, 1]) add(createModel({ type: 'station', kind: 'railPlatformSection' }), mat, s * (n * 6 + 6), 0, 0);
  for (const z of [4.6, -4.6]) add(buildTrack([{ x: -200, z }, { x: 200, z }]), kit());
  add(createModel({ type: 'vehicle', kind: 'locomotive' }), mat, -10, 0.69, 4.6, Math.PI / 2);
  for (let i = 1; i < 4; i++) add(createModel({ type: 'vehicle', kind: 'wagonPassenger' }), mat, -10 + i * 24.5, 0.69, 4.6, Math.PI / 2);
  look(-70, 45, 75, 0, 0, -8);
}
if (view === 'metro') {
  // поверхность: земля + кварталы; подземное: платформа + тоннели; режим включён
  const surf: THREE.Material[] = [groundMat, mat]; surf.forEach(m => patchSurfaceForMetro(m)); setSurfaceMetroState(surf, true); metroUniforms.uMetro.value = 1;
  ground.renderOrder = 10;
  road([{ x: -150, z: 20 }, { x: 150, z: 20 }], 'avenue');
  for (const [x, z, k] of [[-40, -30, 'resMid'], [10, -35, 'office'], [60, -30, 'resTower'], [-80, 60, 'house'], [40, 62, 'commercialSmall']] as const) add(createModel({ type: 'building', kind: k as any }), mat, x, 0, z);
  for (const x of [-22, 22]) add(createModel({ type: 'station', kind: 'metroEntrance' }), mat, x, 0, 4, x < 0 ? 0 : Math.PI);
  addUnderground(scene, createModel({ type: 'station', kind: 'metroPlatform', opts: { sections: 3 } }), 0xff7a59);
  for (const z of [-6.6, 6.6]) { addUnderground(scene, buildTunnelTube([{ x: -220, z }, { x: -18, z }], 5, 5, -12.2), 0xff7a59); addUnderground(scene, buildTunnelTube([{ x: 18, z }, { x: 140, z: z * 1.5 }, { x: 240, z: z + 60 }], 5, 5, -12.2), 0xff7a59); }
  look(-80, 70, 110, 0, -10, 0);
}
if (view === 'stops') {
  const ctr = [{ x: -120, z: 0 }, { x: 120, z: 0 }]; const pr = buildProfile(ctr, PROFILES.avenueTram, 0.02); add(pr.base, kit()); add(pr.marks, marksMat);
  add(createModel({ type: 'station', kind: 'tramStopV2' }), mat, 0, 0.17, 0);
  add(createModel({ type: 'station', kind: 'busStopV2' }), mat, -30, 0.17, -14.6);
  add(createModel({ type: 'vehicle', kind: 'tram' }), mat, 40, 0.02, 1.6, Math.PI / 2);
  add(createModel({ type: 'vehicle', kind: 'bus' }), mat, -32, 0.02, -10, -Math.PI / 2);
  add(createModel({ type: 'vehicle', kind: 'car' }), mat, 25, 0.02, -5.6, -Math.PI / 2);
  look(-40, 26, 38, -6, 0, -3);
}
if (view === 'bridge') {
  ground.visible = false; const water = add(new THREE.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6cc3d5 }), 0, -8, 0);
  add(new THREE.BoxGeometry(400, 10, 800), groundMat, -280, -5, 0); add(new THREE.BoxGeometry(400, 30, 800), groundMat, 280, -5, 0); void water;
  const ctr = [{ x: -90, z: 0 }, { x: 80, z: 0 }]; add(buildBridge(ctr, 14, 0, -8), kit()); const pr = buildProfile(ctr, PROFILES.street, 0.02); add(pr.base, kit()); add(pr.marks, marksMat);
  const pr2 = buildProfile([{ x: -160, z: 0 }, { x: -80, z: 0 }], PROFILES.street, 0.02); add(pr2.base, kit()); add(pr2.marks, marksMat);
  add(buildTunnelPortal({ x: 80, z: 0 }, { x: 1, z: 0 }, 13, 6, 0), kit());
  add(createModel({ type: 'vehicle', kind: 'bus' }), mat, -20, 0.37, -1.8, -Math.PI / 2);
  look(-110, 40, 90, 10, -4, 0);
}
if (view === 'profile') {
  let z = -45; for (const k of ['highway', 'avenueTram', 'street', 'lane']) { const p = buildProfile([{ x: -80, z }, { x: 80, z }], PROFILES[k], 0.02); add(p.base, kit()); add(p.marks, marksMat); z += p.width / 2 + 18; }
  add(buildTrack([{ x: -80, z: z + 4 }, { x: 80, z: z + 4 }]), kit());
  look(-75, 60, 95, 0, 0, -5);
}
cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
r.setAnimationLoop(() => r.render(scene, cam));
(window as any).ready = true;
