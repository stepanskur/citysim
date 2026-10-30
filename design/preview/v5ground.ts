import * as THREE from 'three';
import { createTuftGeometry, createGrassMaterial, scatterGrass, createBushGeometry, createBushMaterial, tickGround, BUSH } from '../ground';
import { GROUND_V5, BUILD, BUILD_MUTED, THEMES, THEMES_MUTED, GROUND } from '../palette';
import { createModel, createModelMaterial } from '../models/index';
const lbl = document.getElementById('lbl')!, info = document.getElementById('info')!;
const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
if (location.hash.startsWith('#palette')) {
  lbl.textContent = 'v5 · Палитра: до (сверху) / после mute() (снизу)';
  const rows: [string, number[], number[]][] = [];
  const add = (n: string, a: any, b: any) => { const fa: number[] = [], fb: number[] = []; const walk = (x: any, y: any) => { if (typeof x === 'number') { fa.push(x); fb.push(y); } else if (x && typeof x === 'object') for (const k in x) walk(x[k], y[k]); }; walk(a, b); rows.push([n, fa, fb]); };
  for (const k of ['resWalls', 'resRoofs', 'midWalls', 'comWalls', 'comAccent', 'indWalls']) add('BUILD.' + k, (BUILD as any)[k], (BUILD_MUTED as any)[k]);
  for (const k of ['lateSng', 'russianClassic', 'french']) add('THEMES.' + k, (THEMES as any)[k], (THEMES_MUTED as any)[k]);
  document.body.style.background = '#e9e6df';
  const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:60px 20px 20px;overflow:auto;font:12px Inter;color:#222';
  d.innerHTML = rows.map(([n, a, b]) => `<div style="margin:6px 0"><b>${n}</b><div>${a.map(c => `<span style="display:inline-block;width:34px;height:20px;background:${hex(c)}"></span>`).join('')}</div><div>${b.map(c => `<span style="display:inline-block;width:34px;height:20px;background:${hex(c)}"></span>`).join('')}</div></div>`).join('');
  document.body.appendChild(d); info.textContent = "s' = min(s·0.55, 0.30); l' ∈ [0.30, 0.90]; оттенок −15 % к 35°"; (window as any).ready = true;
} else {
  lbl.textContent = 'v5 · Земля: трава (инстансы, ветер), кусты, приглушённая палитра, дома на цоколе';
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
  const s = new THREE.Scene(); s.background = new THREE.Color(0xcfdbe6); s.fog = new THREE.Fog(0xcfdbe6, 120, 320);
  s.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.5)); const sun = new THREE.DirectionalLight(0xfff2dd, 1.6); sun.position.set(40, 60, 20); s.add(sun);
  const hAt = (x: number, z: number) => Math.sin(x * 0.03) * 0.8 + Math.cos(z * 0.04) * 0.6;
  const pg = new THREE.PlaneGeometry(400, 400, 100, 100); pg.rotateX(-Math.PI / 2); const pp = pg.attributes.position; for (let i = 0; i < pp.count; i++) pp.setY(i, hAt(pp.getX(i), pp.getZ(i)));
  pg.computeVertexNormals(); s.add(new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: GROUND_V5.grass })));
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, 400), new THREE.MeshLambertMaterial({ color: 0x6d6f7c })); road.rotation.x = -Math.PI / 2; road.position.set(-14, 1.6, 0); s.add(road);
  const mask = (x: number, z: number) => Math.abs(x + 14) < 7 ? null : (x > 4 && x < 30 && z > -12 && z < 12) ? null : Math.abs(x + 14) < 10 ? 'roadside' as const : x > 30 ? 'park' as const : 'meadow' as const;
  const ms = scatterGrass(-120, -120, 240, mask, hAt, 7); const tg = createTuftGeometry(); const gm = createGrassMaterial();
  const gi = new THREE.InstancedMesh(tg, gm, ms.length); ms.forEach((m, i) => gi.setMatrixAt(i, m)); s.add(gi);
  const bm = createBushMaterial(); const bi = new THREE.InstancedMesh(createBushGeometry(), bm, 300); let n = 0; const mm = new THREE.Matrix4();
  for (let k = 0; k < 300; k++) { const x = (Math.sin(k * 12.9898) * 43758.5453 % 1) * 120, z = (Math.sin(k * 78.233) * 12543.1 % 1) * 120; if (!mask(x, z)) continue; const rr = BUSH.r[0] + (k % 7) / 7 * (BUSH.r[1] - BUSH.r[0]); mm.compose(new THREE.Vector3(x, hAt(x, z), z), new THREE.Quaternion(), new THREE.Vector3(rr, rr, rr)); bi.setMatrixAt(n, mm); bi.setColorAt(n++, new THREE.Color(GROUND_V5.bush[k % 3])); }
  bi.count = n; s.add(bi);
  // дом на цоколе: y = max(углов), цоколь до min(углов) − 0.3
  const g = createModel({ type: 'building', kind: 'resMid' }); const h = new THREE.Mesh(g, createModelMaterial()); g.computeBoundingBox(); const bb = g.boundingBox!;
  const cs = [[4, -12], [30, -12], [4, 12], [30, 12]].map(([x, z]) => hAt(x, z)); const top = Math.max(...cs), bot = Math.min(...cs) - 0.3;
  const sx = 24 / (bb.max.x - bb.min.x); h.scale.setScalar(sx); h.position.set(17, top, 0); s.add(h);
  const pl = new THREE.Mesh(new THREE.BoxGeometry(24.4, top - bot + 0.2, (bb.max.z - bb.min.z) * sx + 0.4), new THREE.MeshLambertMaterial({ color: BUILD_MUTED.plinth })); pl.position.set(17, (top + bot) / 2 + 0.1, 0); s.add(pl);
  const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 1000); cam.position.set(-40, 22, 46); cam.lookAt(10, 0, 0);
  info.textContent = `трава: ${ms.length} пучков (1 draw call), кусты: ${n}; цвет земли ${hex(GROUND.grass)} → ${hex(GROUND_V5.grass)}`;
  let t = 0; const loop = () => { t += 1 / 60; tickGround(gm, bm, t, cam.position); r.render(s, cam); requestAnimationFrame(loop); }; loop();
  setTimeout(() => ((window as any).ready = true), 500);
}
