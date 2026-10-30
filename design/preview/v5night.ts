// v5 · ночь: night-street | night-space | night-layers | night-zones | night-build
import * as THREE from 'three';
import { createStyledMaterial, createBuilding, createModel, ThemeId, ThemeKind, Dims } from '../models';
import { applyScenePreset } from '../scene-preset';
import { buildCurvedRoad, P, RoadClass, CURVED_PROFILES } from '../road-curves';
import { setNightDistance, placeStreetLamps, StreetLampSet, CarLightSet, buildRoadGlowStrip, createRoadGlowMaterial, applyNightPreset, patchNightReadable, createNightComposer, nightUniforms, createTrafficNeonMaterial, createZoneNeonMaterial, createBuildGridMaterial, createCursorRing } from '../night';
import { NIGHT } from '../palette';

const view = location.hash.slice(1) || 'night-street';
const LBL: Record<string, string> = { 'night-street': 'Ночь вблизи: фонари (пятна + конусы), фары/габариты, окна', 'night-space': 'Ночь издали: «снимок из космоса» — точки огней, неон магистралей, bloom', 'night-layers': 'Слой «Загрузка дорог» в ночном видении', 'night-zones': 'Слой «Зоны» в ночном видении', 'night-build': 'Стройка ночью: подъём земли, сетка, курсор, призрак' };
document.getElementById('lbl')!.textContent = 'v5 · ' + LBL[view];
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); const space = view === 'night-space';
const rig = applyScenePreset(r, scene, { time: 'night', dist: space ? 1500 : 400, shadowSize: 1024, shadows: !space }); applyNightPreset(rig, r, scene);
const mat = patchNightReadable(createStyledMaterial()); mat.side = THREE.DoubleSide;
const groundMat = patchNightReadable(new THREE.MeshLambertMaterial({ color: 0x8fb06a }));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), groundMat); ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
const roadMat = patchNightReadable(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
const marksMat = patchNightReadable(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
if (view === 'night-layers' || view === 'night-zones') nightUniforms.uVision.value = 1;

// город: сетка кварталов 96 м, каждый 3-й — проспект, по краю — шоссе
const N = space ? 15 : 6, B = 96, H = N * B / 2; const roads: { c: P[]; cls: RoadClass }[] = [];
for (let i = 0; i <= N; i++) { const cls: RoadClass = i === 0 || i === N ? 'highway' : i % 3 === 0 ? 'avenue' : 'street';
  roads.push({ c: [{ x: -H, z: -H + i * B }, { x: H, z: -H + i * B }], cls }); roads.push({ c: [{ x: -H + i * B, z: -H }, { x: -H + i * B, z: H }], cls: i % 3 === 0 && i && i < N ? 'avenue' : i === 0 || i === N ? 'highway' : 'street' }); }
const lamps = roads.flatMap(R => { const g = buildCurvedRoad(R.c, R.cls, 'fillet'); const a = new THREE.Mesh(g.base, roadMat); a.receiveShadow = true; scene.add(a); scene.add(new THREE.Mesh(g.marks, marksMat));
  if (R.cls !== 'street') { const m = new THREE.Mesh(buildRoadGlowStrip(g.center, R.cls), createRoadGlowMaterial(R.cls)); m.renderOrder = 3; scene.add(m); }
  return placeStreetLamps(g.center, R.cls); });
const L = new StreetLampSet(lamps, mat); scene.add(L.group);

// дома: инстансы по кэшу геометрий (тема lateSng/russianClassic)
const cache = new Map<string, THREE.BufferGeometry>(); const inst = new Map<string, THREE.Matrix4[]>(); let rs = 7;
const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
  const cx = -H + bx * B + B / 2, cz = -H + bz * B + B / 2, center = Math.hypot(cx, cz) < N * B * 0.22;
  const theme: ThemeId = center ? 'russianClassic' : 'lateSng'; const kind: ThemeKind = center ? 'resMid' : (rnd() < 0.4 ? 'resHigh' : 'resMid');
  for (const [ox, oz, ry] of [[0, -22, 0], [0, 22, Math.PI]] as const) {
    const w = center ? 48 : 42, key = `${theme}|${kind}|${(bx + bz) % 3}`;
    if (!cache.has(key)) cache.set(key, createBuilding({ theme, kind, width: w, depth: 14, floors: kind === 'resHigh' ? 14 : undefined, seed: 11 + (bx + bz) % 3, lit: 0.55 }));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx + ox, 0, cz + oz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    (inst.get(key) ?? inst.set(key, []).get(key)!).push(m);
  } }
inst.forEach((ms, k) => { const im = new THREE.InstancedMesh(cache.get(k)!, mat, ms.length); ms.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = !space; scene.add(im); });

// машины по полосам
const carGeo = createModel({ type: 'vehicle', kind: 'car' }); const carsN = space ? 1400 : 160;
const cars = new THREE.InstancedMesh(carGeo, mat, carsN); const Mx = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
for (let i = 0; i < carsN; i++) { const R = roads[Math.floor(rnd() * roads.length)], dir = rnd() < 0.5 ? 1 : -1, pr = CURVED_PROFILES[R.cls];
  const a = R.c[0], b = R.c[1], t = rnd(), lane = (pr.halfAsphalt / pr.lanes) * (Math.floor(rnd() * pr.lanes) + 0.5); const tx = (b.x - a.x), tz = (b.z - a.z), l = Math.hypot(tx, tz);
  const nx = -tz / l * dir, nz = tx / l * dir; Q.setFromAxisAngle(up, Math.atan2(tx * dir, tz * dir));
  Mx.compose(new THREE.Vector3(a.x + tx * t - nx * lane, 0, a.z + tz * t - nz * lane), Q, new THREE.Vector3(1, 1, 1)); cars.setMatrixAt(i, Mx); }
scene.add(cars); const CL = new CarLightSet(carsN); CL.sync(cars); scene.add(CL.group);

const cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 1, 20000); const info: string[] = [];
if (view === 'night-street') { cam.position.set(-H + B * 1.5 + 70, 55, -H + B * 3 + 95); cam.lookAt(-H + B * 1.5 - 10, 0, -H + B * 3 - 20); }
else if (space) { cam.position.set(0, 1900, 1350); cam.lookAt(0, 0, 60); }
else { cam.position.set(0, 520, 470); cam.lookAt(0, 0, 0); }
const dist = cam.position.length();

if (view === 'night-layers') { // неон загрузки: лента по каждой дороге с load
  const nm = createTrafficNeonMaterial(); roads.forEach((R, i) => { const half = CURVED_PROFILES[R.cls].halfAsphalt; const a = R.c[0], b = R.c[1]; const l = Math.hypot(b.x - a.x, b.z - a.z); const tx = (b.x - a.x) / l, tz = (b.z - a.z) / l, nx = -tz * half, nz = tx * half;
    const load = R.cls === 'highway' ? 0.85 : R.cls === 'avenue' ? 0.55 + 0.4 * ((i * 37) % 7) / 7 : ((i * 53) % 11) / 11 * 0.6;
    const p = [a.x + nx, 0.1, a.z + nz, a.x - nx, 0.1, a.z - nz, b.x + nx, 0.1, b.z + nz, b.x + nx, 0.1, b.z + nz, a.x - nx, 0.1, a.z - nz, b.x - nx, 0.1, b.z - nz];
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, l, 0, l, 0, 0, 1, l, 1], 2)); g.setAttribute('load', new THREE.Float32BufferAttribute(Array(6).fill(load), 1));
    const m = new THREE.Mesh(g, nm); m.renderOrder = 6; scene.add(m); });
  info.push('Ночное видение: сцена → сине-стальной монохром (uVision=1), здания читаются по граням; загрузка — неон 5 ступеней 0x2fe6a0 → 0xff2f5a, поток бежит медленнее на забитых.');
}
if (view === 'night-zones') { const zm = createZoneNeonMaterial(); const Z = NIGHT.vision.zones; const zs = [Z.R, Z.C, Z.I, Z.O];
  const zi = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), zm, N * N * 4); let k = 0;
  for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) for (const [ox, oz] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) { const s = new THREE.Vector3(36, 1, 30);
    zi.setMatrixAt(k, new THREE.Matrix4().compose(new THREE.Vector3(-H + bx * B + B / 2 + ox, 0.2, -H + bz * B + B / 2 + oz), new THREE.Quaternion(), s)); zi.setColorAt(k++, new THREE.Color(zs[(bx * 3 + bz + (ox > 0 ? 1 : 0)) % 4])); }
  zi.renderOrder = 6; scene.add(zi); info.push('Зоны: заливка 0.22 + контур ×2.2 (R зелёный, C синий, I шафран, O фиолет), здания приглушены — видно, что где.');
}
if (view === 'night-build') { const gm = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), createBuildGridMaterial(8)); gm.position.y = 0.3; gm.renderOrder = 7; scene.add(gm);
  const c = createCursorRing(9); c.position.set(-40, 0.4, 20); scene.add(c); (gm.material as THREE.ShaderMaterial).uniforms.uCenter.value.set(-40, 20);
  const gh = new THREE.Mesh(createBuilding({ theme: 'lateSng', kind: 'resMid', width: 36, depth: 12, seed: 3 }), new THREE.MeshBasicMaterial({ color: new THREE.Color(NIGHT.build.ghost).multiplyScalar(1.4), transparent: true, opacity: NIGHT.build.ghostAlpha, toneMapped: false, depthWrite: false }));
  gh.position.set(-40, 0, 20); scene.add(gh); cam.position.set(60, 210, 260); cam.lookAt(-30, 0, 10);
  info.push('Стройка ночью: земля не темнее albedo×0.16, сетка 8 м (альфа 0.22, радиус 120 м от курсора), курсор и призрак — аддитивный бирюзовый, toneMapped=false.');
}
const C = createNightComposer(r, scene, cam); C.setDist(cam.position.length()); setNightDistance(rig, cam.position.length());
L.update(1, cam.position.distanceTo(new THREE.Vector3(0, 0, 0)) * (view === 'night-street' ? 0.15 : 1)); CL.update(1, view === 'night-street' ? 100 : dist);
info.push(`фонарей ${lamps.length} (инстансы: опоры/пятна/конусы/точки — 4 draw call), машин ${carsN} (+2 draw call огней), домов-геометрий ${cache.size}`);
document.getElementById('info')!.textContent = info.join('\n');
let t = 0; const loop = () => { t += 0.016; nightUniforms.uTime.value = t; C.composer.render(); requestAnimationFrame(loop); }; loop();
(window as any).ready = true;
