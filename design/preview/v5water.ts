import * as THREE from 'three';
import { createWaterMaterial, riverFlowAt } from '../water-material';
import { GROUND } from '../palette';
document.getElementById('lbl')!.textContent = 'v5 · Вода: течение (flow map), пена у берега, глубина, отражение неба';
const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const s = new THREE.Scene(); s.background = new THREE.Color(0xcfdbe6); s.add(new THREE.HemisphereLight(0xffffff, 0x8a9a7a, 1.5));
const axis = Array.from({ length: 40 }, (_, i) => ({ x: -200 + i * 10, z: Math.sin(i * 0.25) * 30 })); const hw = 22;
const g = new THREE.PlaneGeometry(400, 160, 200, 80); g.rotateX(-Math.PI / 2); const P = g.attributes.position; const fl: number[] = [], dp: number[] = [], sh: number[] = [];
for (let i = 0; i < P.count; i++) { const f = riverFlowAt(P.getX(i), P.getZ(i), axis, hw, 1.4); fl.push(...f.flow); sh.push(f.shore); dp.push(f.shore * 0.35); }
g.setAttribute('flow', new THREE.Float32BufferAttribute(fl, 2)); g.setAttribute('depth', new THREE.Float32BufferAttribute(dp, 1)); g.setAttribute('shore', new THREE.Float32BufferAttribute(sh, 1));
// вода — только где shore>0 (отбросить остальное через индекс)
const idx = g.index!; const keep: number[] = []; for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (sh[a] > 0 || sh[b] > 0 || sh[c] > 0) keep.push(a, b, c); } g.setIndex(keep);
const m = createWaterMaterial(); s.add(new THREE.Mesh(g, m));
const land = new THREE.Mesh(new THREE.PlaneGeometry(400, 160), new THREE.MeshLambertMaterial({ color: GROUND.shoreSand })); land.rotation.x = -Math.PI / 2; land.position.y = -0.3; s.add(land);
const cam = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 1000); cam.position.set(-20, 55, 85); cam.lookAt(0, 0, 0);
document.getElementById('info')!.textContent = 'скорость 1.4 м/с на стрежне, профиль v·(1−(d/hw)²); пена 2.2 м; глубина = 0.35·dist до берега';
let t = 0; const loop = () => { t += 1 / 60; m.uniforms.uTime.value = t; r.render(s, cam); requestAnimationFrame(loop); }; loop(); setTimeout(() => ((window as any).ready = true), 400);
