// v5 · стыки: joints-cross | joints-trans | joints-ends
import * as THREE from 'three';
import { applyScenePreset } from '../scene-preset';
import { buildCurvedRoad, P, RoadClass } from '../road-curves';
import { buildNodeMesh, JointArm, EndCap } from '../road-joints';

const view = location.hash.slice(1);
const LBL: Record<string, string> = { 'joints-cross': 'Стыки: X, T, Y(40°), 5 рукавов — скругления бордюра, зебры, стоп-линии, без наложений', 'joints-trans': 'Переходы: проспект→улица, улица→переулок (сужение 1:8), излом 35° со сменой класса, шоссе→проспект', 'joints-ends': 'Концы: разворотная площадка, полукруг, торцевая шапка — тротуар обходит торец, нет белых обрезков' };
document.getElementById('lbl')!.textContent = 'v5 · ' + LBL[view];
const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(1); r.setSize(innerWidth, innerHeight); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); applyScenePreset(r, scene, { time: 'day', dist: 220, shadowSize: 2048 });
const kit = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const marks = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const g = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xa9c58a })); g.position.y = -0.06; g.receiveShadow = true; scene.add(g);
const addG = (geo: THREE.BufferGeometry, m: THREE.Material) => { const o = new THREE.Mesh(geo, m); o.receiveShadow = true; scene.add(o); };
const info: string[] = [];
function node(c: P, arms: { a: number; cls: RoadClass; len?: number }[], cap: EndCap = 'bulb', label = '') {
  const A: JointArm[] = arms.map(x => ({ dx: Math.cos(x.a * Math.PI / 180), dz: Math.sin(x.a * Math.PI / 180), cls: x.cls }));
  const J = buildNodeMesh(c, A, 0, cap); addG(J.base, kit); addG(J.marks, marks);
  A.forEach((a, i) => { const t = J.trims[i], L = arms[i].len ?? 70; const R = buildCurvedRoad([{ x: c.x + a.dx * t, z: c.z + a.dz * t }, { x: c.x + a.dx * (t + L), z: c.z + a.dz * (t + L) }], a.cls, 'fillet'); addG(R.base, kit); addG(R.marks, marks); });
  info.push(`${label}: trims ${J.trims.map(t => t.toFixed(1)).join(' / ')} м`);
}
const cam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 5000);
if (view === 'joints-cross') {
  node({ x: -80, z: -45 }, [{ a: 0, cls: 'avenue' }, { a: 90, cls: 'street' }, { a: 180, cls: 'avenue' }, { a: 270, cls: 'street' }], 'bulb', 'X проспект×улица');
  node({ x: 80, z: -45 }, [{ a: 0, cls: 'street' }, { a: 180, cls: 'street' }, { a: 90, cls: 'lane' }], 'bulb', 'T улица+переулок');
  node({ x: -80, z: 65 }, [{ a: 180, cls: 'street' }, { a: 0, cls: 'street' }, { a: -40, cls: 'street' }], 'bulb', 'Y острый 40°');
  node({ x: 85, z: 70 }, [{ a: 0, cls: 'street' }, { a: 75, cls: 'street' }, { a: 150, cls: 'avenue' }, { a: 220, cls: 'lane' }, { a: 290, cls: 'street' }], 'bulb', '5 рукавов');
  cam.position.set(0, 230, 190); cam.lookAt(0, 0, 10);
}
if (view === 'joints-trans') {
  node({ x: -70, z: -50 }, [{ a: 180, cls: 'avenue' }, { a: 0, cls: 'street' }], 'bulb', 'проспект→улица (как s01)');
  node({ x: 70, z: -50 }, [{ a: 180, cls: 'street' }, { a: 0, cls: 'lane' }], 'bulb', 'улица→переулок');
  node({ x: -60, z: 55 }, [{ a: 180, cls: 'avenue' }, { a: 35, cls: 'street' }], 'bulb', 'излом 35° + смена класса');
  node({ x: 80, z: 55 }, [{ a: 180, cls: 'highway' }, { a: 0, cls: 'avenue' }], 'bulb', 'шоссе→проспект');
  cam.position.set(0, 210, 175); cam.lookAt(0, 0, 5);
}
if (view === 'joints-ends') {
  node({ x: -75, z: -40 }, [{ a: 0, cls: 'street', len: 50 }], 'bulb', 'улица: разворотная площадка R10');
  node({ x: 50, z: -40 }, [{ a: 0, cls: 'lane', len: 50 }], 'bulb', 'переулок: площадка R7.5');
  node({ x: -75, z: 40 }, [{ a: 0, cls: 'street', len: 50 }], 'round', 'улица: полукруг');
  node({ x: 50, z: 40 }, [{ a: 0, cls: 'street', len: 50 }], 'flat', 'улица: торцевая шапка (временный конец)');
  node({ x: -10, z: 110 }, [{ a: 0, cls: 'avenue', len: 60 }], 'bulb', 'проспект: площадка R14');
  cam.position.set(-10, 170, 175); cam.lookAt(-5, 0, 25);
}
document.getElementById('info')!.textContent = info.join('\n');
r.render(scene, cam); const loop = () => { r.render(scene, cam); requestAnimationFrame(loop); }; loop();
(window as any).ready = true;
