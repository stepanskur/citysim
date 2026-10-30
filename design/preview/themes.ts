// Превью тем v4. Hash: base | sng | classic | french | scale | night
import * as THREE from 'three';
import { createBuilding, createStyledMaterial, createModel, THEME_KINDS, ThemeId, ThemeKind, Dims } from '../models';
import { applyScenePreset } from '../scene-preset';

const view = location.hash.slice(1) || 'sng'; addEventListener('hashchange', () => location.reload());
const TH: Record<string, ThemeId> = { base: 'base', sng: 'lateSng', classic: 'russianClassic', french: 'french' };
const LBL: Record<string, string> = { base: 'Тема base — генераторы v2 + слой деталей', sng: 'Позднее СНГ — хрущёвка, брежневка, 16 эт., универсам, НИИ', classic: 'Российская классика — особняк, доходный дом, торговый дом, контора', french: 'Париж (Осман) — maison, immeuble 6–7 эт., лавки, бюро', scale: 'Масштабирование: одно здание при разных размерах — детали добавляются по правилам', night: 'Ночь: окна светятся (атрибут glow)' };
document.getElementById('lbl')!.textContent = 'v4 · ' + LBL[view];
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); applyScenePreset(r, scene, { time: view === 'night' ? 'night' : 'day', dist: 260, shadowSize: 2048 });
const mat = createStyledMaterial(); mat.side = THREE.DoubleSide;
const g = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc9d6a8 })); g.receiveShadow = true; scene.add(g);
const info: string[] = [];
const put = (geo: THREE.BufferGeometry, x: number, z: number, label: string) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  const D = geo.userData.dims as Dims; const det = geo.userData.details as Record<string, number>; info.push(`${label}: ${D.w.toFixed(1)}×${D.d}м, ${D.floors} эт. → ${Object.entries(det).map(([k, v]) => k + ' ' + v).join(', ')}`);
  const pave = new THREE.Mesh(new THREE.BoxGeometry(D.w + 4, 0.1, D.d + 4), new THREE.MeshLambertMaterial({ color: 0xe6ddd0 })); pave.position.set(x, 0.05, z); pave.receiveShadow = true; scene.add(pave); };
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 8000);

if (TH[view] || view === 'night') {
  const theme = TH[view] ?? 'russianClassic'; const kinds = THEME_KINDS[theme]; let x = 0;
  const themes: ThemeId[] = view === 'night' ? ['lateSng', 'russianClassic', 'french'] : [theme];
  themes.forEach((t, row) => { x = 0; for (const k of (view === 'night' ? THEME_KINDS[t].slice(0, 3) : kinds)) {
    const geo = createBuilding({ theme: t, kind: k as ThemeKind, seed: 3 + row * 7 + Math.round(x), lit: 0.6 }); const w = (geo.userData.dims as Dims).w;
    put(geo, x + w / 2, -row * 40, `${t}/${k}`); x += w + 10; } });
  const cx = x / 2; const far = Math.max(90, x * 0.95) * (view === 'base' ? 1.5 : 1);
  cam.position.set(cx - far * 0.08, far * 0.4, far * 0.95); cam.lookAt(cx, 8, view === 'night' ? -30 : 0);
  if (view === 'night') for (let i = 0; i < 6; i++) { const l = createModel({ type: 'prop', kind: 'streetLight' }); const m = new THREE.Mesh(l, mat); m.position.set(i * 30, 0, 18); scene.add(m); }
}
if (view === 'scale') {
  const rows: [ThemeId, ThemeKind, [number, number, number][]][] = [
    ['lateSng', 'resMid', [[24, 12, 9], [48, 12, 9], [84, 13.2, 9]]],
    ['lateSng', 'resSmall', [[24, 11, 4], [48, 11, 5]]],
    ['russianClassic', 'resMid', [[16, 12, 4], [32, 16, 5], [56, 22, 5]]],
    ['french', 'resMid', [[12.5, 12, 5], [25, 16, 6], [42.5, 22, 7]]],
  ];
  rows.reverse().forEach(([t, k, sizes], ri) => { let x = 0; for (const [w, d, f] of sizes) { const geo = createBuilding({ theme: t, kind: k, width: w, depth: d, floors: f, seed: 5 }); put(geo, x + w / 2, -ri * 52, `${t}/${k}`); x += w + 12; } });
  cam.position.set(80, 135, 165); cam.lookAt(85, 6, -70); (document.getElementById('info') as HTMLElement).style.cssText = 'top:52px;bottom:auto;font-size:10px;opacity:.85';
}
document.getElementById('info')!.textContent = info.join('\n');
r.setAnimationLoop(() => r.render(scene, cam)); (window as any).ready = true;
