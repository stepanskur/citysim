// Превью FIX_VISUALS: земля (splat+blur+шейдер), перекрёстки road-kit, светофоры. Hash: cross | ground | far, + day/dusk/night.
import * as THREE from 'three';
import { ModelLibrary, createStyledMaterial, SIGNAL_LAMPS } from '../models';
import { applyScenePreset, TimeOfDay } from '../scene-preset';
import { GROUND, SIGNAL } from '../palette';
import { createGroundMaterial, groundUniforms, surfaceWeights, groundSplatColor, blurVertexColors, patchFarFade } from '../ground-material';
import { buildJunction, roadMaterials, Arm } from '../road-kit';
import { placeSignals, signalState, SIGNAL_STATE_COLOR, Approach } from '../traffic-signals';

const hash = location.hash.slice(1).split(',');
const time = (hash.find(h => ['day', 'dusk', 'night', 'dawn'].includes(h)) ?? 'day') as TimeOfDay;
const view = hash.find(h => ['ground', 'far', 'signal'].includes(h)) ?? 'cross';
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
const rig = applyScenePreset(r, scene, { time, dist: view === 'cross' ? 160 : 420, shadowSize: 2048 });
const mat = patchFarFade(createStyledMaterial()), lib = new ModelLibrary();

// ---------- рельеф: озеро на юго-западе, холмы на севере, ровная площадка города
const S = 1600, STEP = 5, NV = S / STEP + 1;
const sn = (x: number, z: number) => Math.sin(x * .013 + Math.sin(z * .009) * 2) * Math.cos(z * .011 - x * .004) + .5 * Math.sin(x * .031 + z * .027);
const H = (x: number, z: number) => {
  const lake = Math.hypot((x + 260) / 1.3, z - 200); const l = Math.max(0, 1 - lake / 230);
  const hills = Math.max(0, -z - 250) * .06 * (1 + .5 * sn(x, z));
  const city = Math.exp(-((x - 20) ** 2 + (z + 10) ** 2) / (2 * 190 ** 2));
  const base = 2.2 + sn(x, z) * 1.6 + hills - l * l * 9;
  return base * (1 - city * .85) + 4.5 * city;
};
const pos = new Float32Array(NV * NV * 3), col = new Float32Array(NV * NV * 3); const c = new THREE.Color();
for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
  const x = -S / 2 + i * STEP, z = -S / 2 + j * STEP, h = H(x, z), k = (j * NV + i) * 3;
  const slope = Math.hypot(H(x + 2, z) - H(x - 2, z), H(x, z + 2) - H(x, z - 2)) / 4;
  const forest = Math.max(0, Math.min(1, (sn(x * 1.7 + 300, z * 1.7) - .35) * 2.5)) * (z < -150 || x > 380 ? 1 : .2);
  const fertile = Math.max(0, Math.min(1, (sn(x * .8 - 700, z * .8 + 50) - .6) * 3)) * (x > 300 ? 1 : 0);
  const urban = Math.exp(-((x - 20) ** 2 + (z + 10) ** 2) / (2 * 150 ** 2));
  groundSplatColor(surfaceWeights(h, slope, forest, fertile, urban), c);
  pos[k] = x; pos[k + 1] = h; pos[k + 2] = z; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
}
blurVertexColors(col, NV, NV, GROUND.blurPasses[0]);
const idx: number[] = []; for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NV - 1; i++) { const p = j * NV + i; idx.push(p, p + NV, p + 1, p + 1, p + NV, p + NV + 1); }
const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(idx); tg.computeVertexNormals();
const terrain = new THREE.Mesh(tg, createGroundMaterial()); terrain.receiveShadow = true; scene.add(terrain);
const water = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ color: GROUND.water, transparent: true, opacity: .86 }));
water.rotation.x = -Math.PI / 2; water.position.y = 0; water.renderOrder = 1; scene.add(water);
groundUniforms.uWaterY.value = 0; groundUniforms.uFogCol.value.copy((scene.fog as THREE.Fog | undefined)?.color ?? new THREE.Color(GROUND.grass));

// ---------- перекрёстки
const RM = roadMaterials(); const Y = H(20, -10) + .02;
const junctions: { x: number; z: number; arms: Arm[] }[] = [
  { x: 0, z: 0, arms: [{ dx: 1, dz: 0, type: 1, len: 60 }, { dx: -1, dz: 0, type: 1, len: 60 }, { dx: 0, dz: 1, type: 0, len: 60 }, { dx: 0, dz: -1, type: 0, len: 60 }] },
  { x: 120, z: 0, arms: [{ dx: -1, dz: 0, type: 1, len: 60 }, { dx: 1, dz: 0, type: 1, len: 60 }, { dx: .6, dz: -.8, type: 0, len: 70 }] },
  { x: 0, z: -120, arms: [{ dx: 0, dz: 1, type: 0, len: 60 }, { dx: 1, dz: 0, type: 3, len: 60 }, { dx: -1, dz: 0, type: 0, len: 80 }] },
];
const signalGeo = lib.get({ type: 'prop', kind: 'trafficLight' }), lampGeo = lib.get({ type: 'prop', kind: 'signalLamp' });
const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false });
let nid = 0;
for (const J of junctions) {
  const { base, marks } = buildJunction(J.x, J.z, J.arms, Y);
  const mb = new THREE.Mesh(base, RM.base); mb.receiveShadow = true; mb.renderOrder = 3; scene.add(mb);
  const mm = new THREE.Mesh(marks, RM.marks); mm.renderOrder = 4; scene.add(mm);
  const app: Approach[] = J.arms.map((a, e) => ({ e, dx: a.dx, dz: a.dz, type: a.type, len: a.len * 2, alive: true }));
  for (const p of placeSignals(J.x, J.z, app, 0)) {
    const m = new THREE.Mesh(signalGeo, mat); m.position.set(p.x, Y, p.z); m.rotation.y = p.rot; m.scale.setScalar(p.scale); m.castShadow = true; scene.add(m);
    const st = signalState(p.group, nid, 4.5);
    const [lx, ly, lz] = SIGNAL_LAMPS[st]; const lamp = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: SIGNAL_STATE_COLOR[st], toneMapped: false }));
    lamp.position.set(lx, ly, lz + .005); m.add(lamp); void lampMat;
  }
  nid++;
}
// ---------- застройка по углам и машины
const B = (kind: string, v: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(lib.get({ type: 'building', kind } as never, v), mat); m.position.set(x, Y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; scene.add(m); };
B('resMid', 1, -26, -26, 0); B('commercialSmall', 2, 28, -24, 0); B('resMid', 3, -27, 27, Math.PI); B('house', 3, 30, 30, Math.PI); B('house', 2, 60, -26, 0); B('resTower', 2, -70, 30, Math.PI); B('house', 4, -60, -24, 0);
B('commercialSmall', 4, 150, 22, Math.PI); B('house', 5, 90, 24, Math.PI); B('house', 1, 30, -140, 0); B('house', 6, -40, -140, 0);
const V = (kind: string, v: number, x: number, z: number, ry: number) => { const m = new THREE.Mesh(lib.get({ type: 'vehicle', kind } as never, v), mat); m.position.set(x, Y + .1, z); m.rotation.y = ry; m.castShadow = true; scene.add(m); };
V('car', 1, 20, 2.8, -Math.PI / 2); V('bus', 2, -24, -3, Math.PI / 2); V('hatch', 3, 1.8, 22, Math.PI); V('car', 4, -1.8, -26, 0); V('van', 1, 44, -3, Math.PI / 2);
for (let i = 0; i < 90; i++) { const a = i * 2.39, rr = 200 + (i % 9) * 25; const x = Math.cos(a) * rr + 120, z = Math.sin(a) * rr - 260; if (H(x, z) < 1) continue; const t = new THREE.Mesh(lib.get({ type: 'tree', kind: i % 3 ? 'pine' : 'deciduous' } as never, i % 5), mat); t.position.set(x, H(x, z) - .3, z); t.castShadow = true; scene.add(t); }

const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 20000);
const views: Record<string, [number[], number[]]> = { cross: [[30, 30, 52], [-2, 0, 2]], ground: [[-40, 190, 330], [-120, 0, 60]], far: [[500, 520, 700], [-60, 0, -40]], signal: [[9, 4.2, 23], [4.4, 3.2, 15.5]] };
const [p0, t0] = views[view]; cam.position.set(p0[0], p0[1] + Y, p0[2]); cam.lookAt(t0[0], Y + t0[1], t0[2]);
rig.setTime(time);
let t = 0; r.setAnimationLoop(() => { t += 1 / 60; groundUniforms.uTime.value = t; r.render(scene, cam); });
(window as any).ready = true;
