import * as THREE from 'three';
import { Lots } from './Lots';
import { createGroundMaterial, groundUniforms, surfaceWeights, groundSplatColor, blurVertexColors, patchFarFade } from '../../design/ground-material';
import { buildJunction, padRadiusFor, roadMaterials, type Arm } from '../../design/road-kit';
import { ROAD_SPEC, GROUND } from '../../design/palette';
const SWC = new THREE.Color(ROAD_SPEC.color.sidewalk);
const MEDC = new THREE.Color(GROUND.grass);
const ASPH = [0x7d8190, 0x5b5f70, 0x4f5366, 0x8d8f99];
/** Перекраска площадки перекрёстка дизайнера в нашу иерархию цветов асфальта. */
function recolorJunction(g: THREE.BufferGeometry, mainType: number) {
  const ca = g.attributes.color as THREE.BufferAttribute; const tc = new THREE.Color(); const src = [ROAD_SPEC.color.pad, ...ROAD_SPEC.color.asphalt].map(h => new THREE.Color(h)); const dst = [ASPH[mainType], ...ASPH].map(h => new THREE.Color(h));
  for (let i = 0; i < ca.count; i++) { tc.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); for (let k = 0; k < src.length; k++) if (Math.abs(tc.r - src[k].r) + Math.abs(tc.g - src[k].g) + Math.abs(tc.b - src[k].b) < 0.004) { ca.setXYZ(i, dst[k].r, dst[k].g, dst[k].b); break; } }
}
import { createStyledMaterial, styleUniforms } from '../../design/scene-preset';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const h01 = (a: number, b: number) => { const q = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return q - Math.floor(q); };
import { ModelLibrary, createVehicle, VEHICLE_LENGTH } from '../../design/models';
import { BUILD, ROADS } from '../../design/palette';
const TERRAIN_F1 = 0xd9c36a, TERRAIN_F2 = 0x9fb84f, TERRAIN_F3 = 0xc79a5a;
function whiteColors(g: THREE.BufferGeometry) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
import { World } from '../world/World';
import { TILE, CHUNK, K, Z, RES } from '../world/consts';
import { ROAD_TYPES } from '../world/RoadNet';
import { CameraCtl } from './Camera';
import { hash2, clamp, smooth } from '../util';

export type Overlay = 'none' | 'traffic' | 'land' | 'pollution' | 'transit' | 'resources' | 'zones' | 'territory';
export interface Quality { shadows: boolean; pixelRatio: number; viewDist: number; bldDist: number; agentCap: number; name: string }
export const QUALITIES: Quality[] = [
  { name: 'Низкое', shadows: false, pixelRatio: 0.75, viewDist: 3500, bldDist: 2200, agentCap: 1500 },
  { name: 'Среднее', shadows: true, pixelRatio: 1, viewDist: 6000, bldDist: 3500, agentCap: 4000 },
  { name: 'Высокое', shadows: true, pixelRatio: 1.5, viewDist: 10000, bldDist: 6000, agentCap: 8000 },
];
interface Chunk { id: number; terrain?: THREE.Mesh; tStep: number; roads?: THREE.Mesh; marks?: THREE.Mesh; blds: THREE.Object3D[]; bDetail: number }

const C = (h: number) => new THREE.Color(h);
const COL = { sand: C(0xd9c98f), grass: C(0x7fae55), grass2: C(0x6a9c48), forest: C(0x5f9148), rock: C(0x8a8378), snow: C(0xf2f2f2), fert: C(0xa9b85a), ore: C(0x9a7f6a), oil: C(0x5c5a52), under: C(0x6f8f7a),
  zr: C(0x8fd17a), zc: C(0x7aaee6), zi: C(0xe6c76a) };

export class Renderer {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); cam: THREE.PerspectiveCamera; ctl: CameraCtl;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; water: THREE.Mesh;
  chunks = new Map<number, Chunk>();
  overview?: THREE.Mesh;
  overlay: Overlay = 'none';
  q: Quality = QUALITIES[1];
  terrainMat: THREE.MeshLambertMaterial; roadMat: THREE.MeshLambertMaterial; bldMat: THREE.MeshLambertMaterial; plainMat: THREE.MeshLambertMaterial;
  geoBox: THREE.BoxGeometry; geoRoof: THREE.ConeGeometry; geoCyl: THREE.CylinderGeometry; geoTree: THREE.ConeGeometry;
  night = { value: 0 };
  vehMeshes: THREE.InstancedMesh[] = []; lib!: ModelLibrary;
  lightMesh: THREE.InstancedMesh; signalPoles!: THREE.InstancedMesh;
  lineGroup = new THREE.Group(); toolGroup = new THREE.Group();
  edgeLoad: (e: number) => number = () => 0;
  dummy = new THREE.Object3D(); tmpC = new THREE.Color();
  stats = { tris: 0, calls: 0 };
  constructor(public world: World, public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.pixelRatio));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.cam = new THREE.PerspectiveCamera(50, 1, 2, world.M * 3);
    this.scene.background = new THREE.Color(0x9cc7ea); this.scene.fog = new THREE.Fog(0x9cc7ea, 4000, 14000);
    this.hemi = new THREE.HemisphereLight(0xdfefff, 0x5a6a40, 1.4); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0008; this.sun.shadow.normalBias = 0.02; this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.terrainMat = createGroundMaterial();
    this.roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.plainMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.bldMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true }); // vertexColors: модели design/models
    const night = this.night;
    this.bldMat.onBeforeCompile = sh => {
      sh.uniforms.uNight = night;
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
        vWP = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
        vWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);
        #endif`);
      sh.fragmentShader = 'uniform float uNight; varying vec3 vWP; varying vec3 vWN;\nfloat hh(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        float side = 1.0 - step(0.5, abs(vWN.y));
        float fl = floor(vWP.y / 3.2); float col = floor((vWP.x + vWP.z) / 3.0);
        float wy = step(0.3, fract(vWP.y / 3.2)) * step(fract(vWP.y / 3.2), 0.75);
        float wx = step(0.25, fract((vWP.x + vWP.z) / 3.0)) * step(fract((vWP.x + vWP.z) / 3.0), 0.8);
        float win = side * wy * wx * step(4.0, vWP.y - 0.0) ;
        outgoingLight *= 1.0 - win * 0.18;
        outgoingLight += win * uNight * step(0.45, hh(vec2(fl, col))) * vec3(1.0, 0.78, 0.45) * 0.9;
        #include <opaque_fragment>`);
    };
    patchFarFade(this.bldMat); // FIX_VISUALS: вдали — десатурация/потолок яркости, без «белого шума»
    this.geoBox = new THREE.BoxGeometry(1, 1, 1); this.geoBox.translate(0, 0.5, 0);
    this.geoRoof = new THREE.ConeGeometry(0.75, 1, 4, 1); this.geoRoof.rotateY(Math.PI / 4); this.geoRoof.translate(0, 0.5, 0);
    this.geoCyl = new THREE.CylinderGeometry(0.5, 0.6, 1, 6); this.geoCyl.translate(0, 0.5, 0);
    this.geoTree = new THREE.ConeGeometry(1, 1, 5); this.geoTree.translate(0, 0.5, 0);
    for (const g of [this.geoBox, this.geoRoof, this.geoCyl, this.geoTree]) whiteColors(g);
    this.lib = new ModelLibrary();
    const wg = new THREE.PlaneGeometry(world.M * 3, world.M * 3); wg.rotateX(-Math.PI / 2); wg.translate(world.M / 2, 0, world.M / 2);
    this.water = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ color: GROUND.water, transparent: true, opacity: 0.86 }));
    this.water.receiveShadow = true; this.water.renderOrder = 1; this.scene.add(this.water);
    this.ctl = new CameraCtl(this.cam, canvas, (x, z) => world.hAt(x, z), world.M, (cx, cy) => this.pickScreen(cx, cy));
    const c0 = world.cities[0]; this.ctl.jump(c0.x, c0.z, Math.min(2500, c0.r * 1.3)); this.ctl.tx = c0.x; this.ctl.tz = c0.z; this.ctl.dist = this.ctl.gdist;
    // vehicles: car, truck, bus, tram, metro, train
    // модели транспорта из design/models (нос +Z → поворачиваем на +X, как ожидает симуляция)
    const N = { neutral: true };
    const train = (wag: 'wagonPassenger' | 'wagonFreight', n: number) => { const parts = [createVehicle('locomotive', N)]; let off = -VEHICLE_LENGTH.locomotive / 2; for (let q = 0; q < n; q++) { const g = createVehicle(wag, N); off -= VEHICLE_LENGTH[wag] / 2 + 0.6; g.translate(0, 0, off); off -= VEHICLE_LENGTH[wag] / 2; parts.push(g); } const m = mergeGeometries(parts); m.translate(0, 0, -off / 2 - VEHICLE_LENGTH.locomotive / 4); return m; };
    const geos = [createVehicle('car', N), createVehicle('truck', N), createVehicle('bus', N), createVehicle('tram', N), train('wagonPassenger', 2), train('wagonPassenger', 3)];
    const vehMat = patchFarFade(new THREE.MeshLambertMaterial({ vertexColors: true }));
    const caps = [12000, 4000, 1500, 600, 400, 300];
    geos.forEach((g, i) => {
      g.rotateY(Math.PI / 2); g.translate(0, 0.15, 0);
      const m = new THREE.InstancedMesh(g, vehMat, caps[i]); m.count = 0; m.frustumCulled = false; m.castShadow = i > 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps[i] * 3), 3);
      this.vehMeshes.push(m); this.scene.add(m);
    });
    const lg = new THREE.BoxGeometry(1, 0.06, 0.45);
    this.lightMesh = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 3000); this.lightMesh.count = 0; this.lightMesh.frustumCulled = false;
    this.lightMesh = new THREE.InstancedMesh(this.lib.get({ type: 'prop', kind: 'signalLamp' } as any, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1200); this.lightMesh.count = 0; this.lightMesh.frustumCulled = false;
    this.lightMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3), 3); this.scene.add(this.lightMesh); // линзы светофоров (design/models signalLamp)
    this.signalPoles = new THREE.InstancedMesh(this.lib.get({ type: 'prop', kind: 'trafficLight' } as any, 0), this.styledMat, 1200); this.signalPoles.count = 0; this.signalPoles.frustumCulled = false; this.signalPoles.castShadow = true; this.scene.add(this.signalPoles);
    this.scene.add(this.lineGroup); this.scene.add(this.toolGroup);
    this.buildOverview();
    { // V8: «юбка» земли за краем карты — нет жёсткого прямоугольника на фоне неба; уходит в туман
      const M = world.M, E = M * 4, parts: THREE.BufferGeometry[] = [];
      for (const [x0, z0, x1, z1] of [[-E, -E, M + E, 0], [-E, M, M + E, M + E], [-E, 0, 0, M], [M, 0, M + E, M]]) { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 8, 8); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); parts.push(g); }
      const sk = mergeGeometries(parts)!; const pa = sk.attributes.position as THREE.BufferAttribute; const cl = new Float32Array(pa.count * 3); const gc = new THREE.Color(GROUND.grass);
      for (let v = 0; v < pa.count; v++) { const x = pa.getX(v), z = pa.getZ(v); const ex = Math.min(Math.max(x, 1), M - 1), ez = Math.min(Math.max(z, 1), M - 1); const out = Math.hypot(x - ex, z - ez); pa.setY(v, out < 1 ? Math.max(world.hAt(ex, ez), 0.5) - 0.3 : 0.8); cl[v * 3] = gc.r; cl[v * 3 + 1] = gc.g; cl[v * 3 + 2] = gc.b; }
      sk.setAttribute('color', new THREE.BufferAttribute(cl, 3)); sk.computeVertexNormals();
      this.scene.add(new THREE.Mesh(sk, this.terrainMat));
    }
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  setQuality(q: Quality) { this.q = q; this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio)); this.renderer.shadowMap.enabled = q.shadows; this.sun.castShadow = q.shadows; this.scene.traverse(o => { if ((o as any).material) ((o as any).material as THREE.Material).needsUpdate = true; }); this.resize(); }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  // ---------- picking ----------
  ray = new THREE.Raycaster(); ndc = new THREE.Vector2();
  pickScreen(cx: number, cy: number): THREE.Vector3 | null {
    const r = this.canvas.getBoundingClientRect(); this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam); const o = this.ray.ray.origin, d = this.ray.ray.direction;
    let t = 0, prev = 0; const maxT = this.world.M * 3; let step = Math.max(2, this.ctl.dist / 300);
    const above = (tt: number) => { const x = o.x + d.x * tt, z = o.z + d.z * tt; return o.y + d.y * tt - Math.max(0, this.world.hAt(x, z)); };
    while (t < maxT) { if (above(t) < 0) { let a = prev, b = t; for (let k = 0; k < 20; k++) { const m = (a + b) / 2; if (above(m) < 0) b = m; else a = m; } const x = o.x + d.x * b, z = o.z + d.z * b; return new THREE.Vector3(x, Math.max(0, this.world.hAt(x, z)), z); } prev = t; t += step; step *= 1.01; }
    return null;
  }
  // ---------- colors ----------
  tileColor(i: number, j: number, out: THREE.Color) {
    const w = this.world, N = w.N; i = clamp(i, 0, N - 1); j = clamp(j, 0, N - 1); const k = j * N + i;
    const h = w.tileH(i, j), r = w.resource[k];
    if (h < -2) out.setHex(GROUND.sandWet);
    else { // FIX_VISUALS §2: смесь покрытий по физическим признакам, а не «цвет тайла»
      const kd = w.kind[k]; const urban = w.bld[k] && kd !== K.PARK && kd !== K.EXTRACT ? (kd === K.RES && w.style[k] === 0 ? 0.55 : 1) : w.cityOf[k] && w.road[k] ? 0.6 : 0;
      groundSplatColor(surfaceWeights(Math.max(0, h), w.tileSlope(i, j), r === RES.FOREST ? 1 : 0, r === RES.FERTILE || (kd === K.EXTRACT && r === RES.FERTILE) ? 1 : 0, urban), out);
      if (kd === K.PARK) out.setHex(GROUND.yardGrass);
    }
    const z = w.zone[k];
    if (this.overlay === 'resources') { if (r === RES.ORE) out.copy(COL.ore).multiplyScalar(1.3); else if (r === RES.OIL) out.setHex(0x222222); else if (r === RES.FERTILE) out.setHex(0xe0e050); else if (r === RES.FOREST) out.setHex(0x1f6a1f); else out.lerp(new THREE.Color(0x888888), 0.5); return out; }
    if (this.overlay === 'land' || this.overlay === 'pollution' || this.overlay === 'transit') {
      const gi = (i / w.GC) | 0, gj = (j / w.GC) | 0; const arr = this.overlay === 'land' ? w.landValue : this.overlay === 'pollution' ? w.pollution : w.transitCov;
      const v = clamp(arr[gj * w.GN + gi] / (this.overlay === 'land' ? 2 : 1), 0, 1);
      if (this.overlay === 'land') out.setRGB(1 - v, 0.25 + v * 0.75, 0.2); else if (this.overlay === 'pollution') out.setRGB(0.3 + v * 0.7, 0.75 - v * 0.5, 0.3); else out.setRGB(0.25, 0.3 + v * 0.6, 0.35 + v * 0.65);
      return out;
    }
    if (this.overlay === 'territory') { const o = w.sub.ownerAt((i + 0.5) * TILE, (j + 0.5) * TILE); if (o === 0) out.lerp(new THREE.Color(0x4fb3ff), 0.45); else if (o > 0) out.lerp(new THREE.Color(0xffb547), 0.4); else out.multiplyScalar(0.75); const S = w.sub; const fx = ((i + 0.5) * TILE) % S.size, fz = ((j + 0.5) * TILE) % S.size; if (fx < TILE * 2 || fz < TILE * 2) out.setHex(0xffffff); }
    if (w.road[k] === 4) { out.setHex(0x8c857a); return out; } // полотно дорог — геометрией; под ним земля участка
    if (z && !w.bld[k]) out.lerp(z === Z.R ? COL.zr : z === Z.C ? COL.zc : COL.zi, this.overlay === 'zones' ? 0.9 : 0.12);
    else if (this.overlay === 'zones' && z) out.lerp(z === Z.R ? COL.zr : z === Z.C ? COL.zc : COL.zi, 0.9);
    if (false) { const n = Math.sin(i * 0.37 + Math.sin(j * 0.21) * 2) * Math.sin(j * 0.29 + Math.sin(i * 0.17) * 2); out.multiplyScalar(0.97 + 0.035 * n); } // мягкая вариация оттенка
    return out;
  }
  buildOverview() {
    const w = this.world; const R = Math.min(256, w.N); const st = w.N / R;
    const g = new THREE.PlaneGeometry(w.M, w.M, R, R); g.rotateX(-Math.PI / 2); g.translate(w.M / 2, 0, w.M / 2);
    const pos = g.attributes.position as THREE.BufferAttribute; const col = new Float32Array(pos.count * 3); const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) { const x = pos.getX(v), z = pos.getZ(v); pos.setY(v, w.hAt(Math.min(x, w.M - 1), Math.min(z, w.M - 1)) - 1.5); this.tileColor(Math.floor(x / TILE), Math.floor(z / TILE), c); col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    void st;
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const mat = createGroundMaterial({ polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }); // V8: тот же материал, что у земли и «юбки» — без светлого квадрата
    if (this.overview) { this.scene.remove(this.overview); this.overview.geometry.dispose(); }
    this.overview = new THREE.Mesh(g, mat); this.overview.receiveShadow = false; this.scene.add(this.overview);
  }
  // ---------- chunk building ----------
  buildTerrain(ch: Chunk, step: number) {
    const w = this.world; const cx = ch.id % w.chunksN, cz = Math.floor(ch.id / w.chunksN);
    const i0 = cx * CHUNK, j0 = cz * CHUNK; const n = Math.min(CHUNK, w.N - i0), m = Math.min(CHUNK, w.N - j0);
    const nx = Math.ceil(n / step) + 1, nzv = Math.ceil(m / step) + 1;
    const pos = new Float32Array(nx * nzv * 3), col = new Float32Array(nx * nzv * 3); const c = new THREE.Color();
    for (let b = 0; b < nzv; b++) for (let a = 0; a < nx; a++) {
      const i = Math.min(i0 + a * step, i0 + n), j = Math.min(j0 + b * step, j0 + m); const v = (b * nx + a) * 3;
      pos[v] = i * TILE; pos[v + 1] = w.H(i, j); pos[v + 2] = j * TILE;
      // average color of 4 adjacent tiles
      let r = 0, gg = 0, bb = 0; for (const [di, dj] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) { this.tileColor(i + di, j + dj, c); r += c.r; gg += c.g; bb += c.b; }
      col[v] = r / 4; col[v + 1] = gg / 4; col[v + 2] = bb / 4;
    }
    if (this.overlay === 'none') blurVertexColors(col, nx, nzv, step === 1 ? 0 : 1); // QA v7: вблизи без размытия — резкие границы, деталь даёт шейдер
    const idx: number[] = [];
    for (let b = 0; b < nzv - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a; idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    if (ch.terrain) { ch.terrain.geometry.dispose(); ch.terrain.geometry = g; } else { ch.terrain = new THREE.Mesh(g, this.terrainMat); ch.terrain.receiveShadow = true; this.scene.add(ch.terrain); }
    ch.tStep = step;
  }
  roadColor(e: number, type: number, c: THREE.Color) {
    if (this.overlay === 'traffic') { const l = clamp(this.edgeLoad(e), 0, 1.2); if (l < 0.5) c.setRGB(0.2 + l * 1.4, 0.8, 0.25); else c.setRGB(0.95, clamp(1.6 - l * 1.4, 0, 0.8), 0.15); return c; }
    return c.setHex(ASPH[type] ?? (type === 4 ? 0x8c857a : ASPH[0])); // V8: улица светлее, проспект/шоссе темнее — иерархия читается // светло-серый асфальт (палитра)
  }
  padR(n: number) { const net = this.world.net; return padRadiusFor(net.nodes[n].edges.filter(e => net.edges[e].alive).map(e => ({ dx: 0, dz: 0, type: net.edges[e].type, len: 0 }))); }
  marksMat = roadMaterials().marks;
  buildRoads(ch: Chunk) {
    const w = this.world, net = w.net; const cs = CHUNK * TILE; const cx = (ch.id % w.chunksN) * cs, cz = Math.floor(ch.id / w.chunksN) * cs;
    const pos: number[] = [], col: number[] = [], idx: number[] = []; const c = new THREE.Color();
    const nodesDone = new Set<number>(); const jBase: THREE.BufferGeometry[] = [], jMarks: THREE.BufferGeometry[] = [];
    for (const e of net.edgesNear(cx + cs / 2, cz + cs / 2, cs * 0.75)) {
      const E = net.edges[e]; if (!E.alive) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
      if (w.chunkOfPos((A.x + B.x) / 2, (A.z + B.z) / 2) !== ch.id) continue;
      const hw = ROAD_SPEC.asphalt[E.type] / 2; const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const px = -dz * hw, pz = dx * hw;
      this.roadColor(e, E.type, c);
      const steps = Math.max(1, Math.ceil(E.len / 14));
      if (E.type !== 2) { // sidewalks
        const sw = hw + ROAD_SPEC.curbW + ROAD_SPEC.sidewalk[E.type]; const qx = -dz * sw, qz = dx * sw; const b1 = pos.length / 3;
        for (let s = 0; s <= steps; s++) { const x = A.x + (B.x - A.x) * s / steps, z = A.z + (B.z - A.z) * s / steps; const y = w.roadY(x, z) + ROAD_SPEC.y.sidewalk - 0.1; pos.push(x + qx, y, z + qz, x - qx, y, z - qz); col.push(SWC.r, SWC.g, SWC.b, SWC.r, SWC.g, SWC.b); }
        for (let s = 0; s < steps; s++) { const p = b1 + s * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      }
      for (let s = 0; s < steps; s++) { // bridge sides
        const x = A.x + (B.x - A.x) * (s + 0.5) / steps, z = A.z + (B.z - A.z) * (s + 0.5) / steps; if (w.hAt(x, z) > 0.8) continue;
        const xa = A.x + (B.x - A.x) * s / steps, za = A.z + (B.z - A.z) * s / steps, xb = A.x + (B.x - A.x) * (s + 1) / steps, zb = A.z + (B.z - A.z) * (s + 1) / steps;
        for (const sg of [1, -1]) { const b3 = pos.length / 3; const ox = px * sg * 1.05, oz = pz * sg * 1.05;
          pos.push(xa + ox, w.roadY(xa, za), za + oz, xb + ox, w.roadY(xb, zb), zb + oz, xa + ox, -3, za + oz, xb + ox, -3, zb + oz); for (let q = 0; q < 4; q++) col.push(0.62, 0.6, 0.56);
          idx.push(b3, b3 + 2, b3 + 1, b3 + 1, b3 + 2, b3 + 3, b3, b3 + 1, b3 + 2, b3 + 1, b3 + 3, b3 + 2); }
      }
      const base = pos.length / 3;
      for (let s = 0; s <= steps; s++) { const x = A.x + (B.x - A.x) * s / steps, z = A.z + (B.z - A.z) * s / steps; const y = w.roadY(x, z) + ROAD_SPEC.y.asphalt - 0.1 + E.type * 0.005; pos.push(x + px, y, z + pz, x - px, y, z - pz); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      for (let s = 0; s < steps; s++) { const p = base + s * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      // V8: проспект — зелёный разделитель, шоссе/проспект — белые краевые линии
      const strip = (o0: number, o1: number, dy: number, cr: number, cg: number, cb: number) => { const b4 = pos.length / 3; for (let s2 = 0; s2 <= steps; s2++) { const x = A.x + (B.x - A.x) * s2 / steps, z = A.z + (B.z - A.z) * s2 / steps; const y = w.roadY(x, z) + ROAD_SPEC.y.asphalt - 0.1 + dy; pos.push(x - dz * o0, y, z + dx * o0, x - dz * o1, y, z + dx * o1); col.push(cr, cg, cb, cr, cg, cb); } for (let s2 = 0; s2 < steps; s2++) { const p = b4 + s2 * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); } };
      if (this.overlay === 'none' && (E.type === 1 || E.type === 2)) {
        if (E.type === 1) { const m = ROAD_SPEC.median[1] / 2; strip(-m, m, 0.03, MEDC.r, MEDC.g, MEDC.b); }
        for (const sg of [1, -1]) strip(sg * (hw - 0.55), sg * (hw - 0.4), 0.025, 0.92, 0.91, 0.88);
      }
      // center dashes for avenues/highways
      if (E.type !== 3 && E.type !== 1) {
        const lc = this.overlay === 'traffic' ? c : new THREE.Color(0xd8d8c8);
        const nd = Math.floor(E.len / 9);
        const jA = net.nodes[E.a].edges.length >= 3 ? this.padR(E.a) + 16 : 0, jB = net.nodes[E.b].edges.length >= 3 ? this.padR(E.b) + 16 : 0;
        for (let s = 1; s < nd - 1; s += 1) { const t0 = (s * 9) / E.len, t1 = (s * 9 + 3) / E.len; if (t1 > 1) break; if (s * 9 < jA || s * 9 + 3 > E.len - jB) continue; const b2 = pos.length / 3;
          for (const t of [t0, t1]) { const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; const y = w.roadY(x, z) + 0.06 + E.type * 0.02; pos.push(x - dz * 0.25, y, z + dx * 0.25, x + dz * 0.25, y, z - dx * 0.25); col.push(lc.r, lc.g, lc.b, lc.r, lc.g, lc.b); }
          idx.push(b2, b2 + 2, b2 + 1, b2 + 1, b2 + 2, b2 + 3); }
      }
      for (const nn of [E.a, E.b]) {
        if (nodesDone.has(nn)) continue; const N0 = net.nodes[nn]; if (w.chunkOfPos(N0.x, N0.z) !== ch.id) continue; nodesDone.add(nn);
        const live = N0.edges.filter(e2 => net.edges[e2].alive);
        const y0 = w.roadY(N0.x, N0.z) - 0.1;
        if (live.length >= 3) { // эталонный перекрёсток дизайнера: площадка со скруглениями, бордюр, зебры, стоп-линии
          const R = this.padR(nn);
          const arms: Arm[] = live.map(e2 => { const E2 = net.edges[e2]; const o = net.nodes[E2.a === nn ? E2.b : E2.a]; return { dx: (o.x - N0.x) / E2.len, dz: (o.z - N0.z) / E2.len, type: E2.type, len: Math.max(R + 2, Math.min(E2.len / 2, R + 16)) }; });
          try { const J = buildJunction(N0.x, N0.z, arms, y0); recolorJunction(J.base, Math.max(...arms.map(a => a.type === 3 ? -1 : a.type)) < 0 ? 3 : Math.max(...arms.map(a => a.type === 3 ? -1 : a.type))); jBase.push(J.base); jMarks.push(J.marks); } catch { /* вырожденный узел — пропуск */ }
          continue;
        }
        let r = 0, rs = 0, mt = 0, me = N0.edges[0]; for (const e2 of live) { const t = net.edges[e2].type; r = Math.max(r, ROAD_SPEC.asphalt[t] / 2); rs = Math.max(rs, ROAD_SPEC.asphalt[t] / 2 + ROAD_SPEC.curbW + ROAD_SPEC.sidewalk[t]); if (t >= mt) { mt = t; me = e2; } }
        this.roadColor(me, mt, c); if (this.overlay === 'traffic') c.setHex(0x8a8a8a);
        const disc = (rad: number, y: number, cr: number, cg: number, cb: number) => { const b0 = pos.length / 3; pos.push(N0.x, y, N0.z); col.push(cr, cg, cb);
          for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; pos.push(N0.x + Math.cos(a) * rad, y, N0.z + Math.sin(a) * rad); col.push(cr, cg, cb); }
          for (let k = 0; k < 16; k++) idx.push(b0, b0 + 1 + ((k + 1) % 16), b0 + 1 + k); };
        if (rs > r) disc(rs, y0 + ROAD_SPEC.y.sidewalk - 0.005, SWC.r, SWC.g, SWC.b);
        disc(r, y0 + ROAD_SPEC.y.asphalt - 0.005, c.r, c.g, c.b);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    // flat normals up
    const nrm = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    g.computeBoundingSphere();
    // перекрёстки: базовый слой сливаем в общий меш дорог, разметку — в отдельный меш ch.marks
    let G: THREE.BufferGeometry = g;
    if (jBase.length) { const gi = g.toNonIndexed(); G = mergeGeometries([gi, ...jBase]) || g; gi.dispose(); jBase.forEach(x => x.dispose()); }
    if (ch.marks) { this.scene.remove(ch.marks); ch.marks.geometry.dispose(); ch.marks = undefined; }
    if (jMarks.length) { const mg = mergeGeometries(jMarks); jMarks.forEach(x => x.dispose()); if (mg) { ch.marks = new THREE.Mesh(mg, this.marksMat); ch.marks.renderOrder = ROAD_SPEC.renderOrder.marking; this.scene.add(ch.marks); } }
    if (G !== g) g.dispose();
    const g2 = G;
    if (ch.roads) { ch.roads.geometry.dispose(); ch.roads.geometry = g2; } else { ch.roads = new THREE.Mesh(g2, this.roadMat); ch.roads.receiveShadow = true; this.scene.add(ch.roads); }
  }
  /** Застройка чанка: здания строго по кварталам, фасадом к улице, с отступом; район = единый тип/палитра; высота — сглаженный градиент. */
  lots!: Lots;
  styledMat = patchFarFade(createStyledMaterial());
  buildBuildings(ch: Chunk, detail: number) {
    if (!this.lots) this.lots = new Lots(this.world);
    if (this.lots.netVer !== this.world.net.ver) { this.lots.gc(); this.lots.netVer = this.world.net.ver; }
    for (const o of ch.blds) { this.scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
    ch.blds = []; ch.bDetail = detail;
    const w = this.world, N = w.N; const cx = ch.id % w.chunksN, cz = Math.floor(ch.id / w.chunksN);
    const boxes: number[][] = [], roofs: number[][] = [], cyls: number[][] = [], trees: number[][] = [];
    const models = new Map<string, number[][]>(); // ключ модели → [x,y,z,sx,sy,sz,rot,color]
    const addM = (key: string, a: number[]) => { let l = models.get(key); if (!l) models.set(key, l = []); l.push(a); };
    const pick = (arr: number[], h: number) => arr[Math.floor(h * arr.length) % arr.length];
    // сглаженная этажность: среднее по 5×5 участкам того же типа (плавный градиент от центра)
    const smoothL = (i: number, j: number, kd: number) => { let s = 0, n = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const k2 = jj * N + ii; if (w.bld[k2] && w.kind[k2] === kd) { s += w.bld[k2]; n++; } } return n ? s / n : 1; };
    for (let j = cz * CHUNK; j < Math.min(N, cz * CHUNK + CHUNK); j++) for (let i = cx * CHUNK; i < Math.min(N, cx * CHUNK + CHUNK); i++) {
      const k = j * N + i; const L = w.bld[k]; const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE;
      if (!L) {
        // лес — только вне городов
        if (detail >= 2 && w.resource[k] === RES.FOREST && !w.cityOf[k] && !w.road[k] && !w.zone[k] && w.tileH(i, j) > 1) {
          for (let t = 0; t < 2; t++) { const tx = x + (hash2(i, j, 10 + t) - 0.5) * 12, tz = z + (hash2(i, j, 20 + t) - 0.5) * 12; const sc = 3 + hash2(i, j, 30 + t) * 3; trees.push([tx, w.hAt(tx, tz) - 0.5, tz, sc, sc * 2.6, sc, 0, 0x2f6e4a]); }
        }
        continue;
      }
      const kd = w.kind[k]; const st = w.style[k];
      if (detail === 0 && (kd === K.RES || kd === K.COM || kd === K.IND)) { // V8 блочный LOD: дальний квартал = масса одного цвета по району, высота сглажена
        const sm = smoothL(i, j, kd); const hgt = kd === K.IND ? 7 : Math.min(60, 2.5 + sm * 2.6); const dz = hash2(Math.floor(i / 4), Math.floor(j / 4), 5);
        const col = kd === K.RES ? (sm <= 2 ? pick([0xd9c7a8, 0xcfbfa4, 0xc8b59a], dz) : pick([0xd8d2c6, 0xcfd3d6, 0xd6cbbb], dz)) : kd === K.COM ? pick([0xc4ccd6, 0xbfc7cf], dz) : 0xaaa79f;
        boxes.push([x, w.hAt(x, z) - 0.3, z, 13.5, sm <= 2 && kd === K.RES ? 4 : hgt, 13.5, 0, col]); continue;
      }
      if (kd === K.RES || kd === K.COM || kd === K.IND) { // жилые/коммерческие/промышленные — по участкам (Lots); внутренность квартала — двор
        if (detail >= 2 && kd !== K.IND && this.lots && !this.lots.occ.has(Math.floor(x / 4) * 100003 + Math.floor(z / 4)) && !w.road[k]) {
          const y = w.hAt(x, z) - 0.2; const hq = hash2(i, j, 77);
          if (hq < 0.22) boxes.push([x, y, z, 9, 2.4, 5, 0, 0xb9b3a8]); // гаражи/сараи
          else if (hq < 0.34) boxes.push([x, y, z, 10, 0.25, 10, 0, 0xd9c7a0]); // детская площадка
          for (let q = 0; q < 2; q++) if (hash2(i, j, 80 + q) < 0.75) { const s2 = 2 + hash2(i, j, 82 + q) * 1.5; trees.push([x + (hash2(i, j, 84 + q) - 0.5) * 11, y, z + (hash2(i, j, 86 + q) - 0.5) * 11, s2, s2 * 2.4, s2, 0, pick([0x5ea845, 0x4c9a48, 0x77b84e], hash2(i, j, 88 + q))]); }
        }
        continue;
      }
      const y = Math.min(w.H(i, j), w.H(i + 1, j), w.H(i, j + 1), w.H(i + 1, j + 1)) - 0.2;
      if (detail < 1 && L < 3 && kd !== K.PORT) continue;
      // ориентация: фасад (+Z модели) к ближайшей улице, ось вдоль неё
      let rot = 0, front = 7.5, hwRoad = 4.5; const ne = w.net.nearestEdge(x, z, 30);
      if (ne) { const E = w.net.edges[ne.e]; const A = w.net.nodes[E.a], B = w.net.nodes[E.b]; const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; let nx = -dz, nz = dx; const px = A.x + (B.x - A.x) * ne.t - x, pz = A.z + (B.z - A.z) * ne.t - z; if (nx * px + nz * pz < 0) { nx = -nx; nz = -nz; } rot = Math.atan2(nx, nz); hwRoad = ROAD_TYPES[E.type].w / 2 + (E.type === 2 ? 1 : 2.5); front = ne.d - hwRoad; }
      if (front < 2.5) continue;
      const cr = Math.abs(Math.cos(rot)), sr = Math.abs(Math.sin(rot));
      // участок: вписываем повернутый прямоугольник в 15 м и отступаем от улицы
      const fit = (W: number, D: number, sb: number) => { D = Math.min(D, front - sb + 7); const f = Math.min(1, 15 / Math.max(W * cr + D * sr, W * sr + D * cr)); return [W * f, D * f] as [number, number]; };
      const dist = (key: number) => hash2(Math.floor(i / 5), Math.floor(j / 5), key); // единый «район» 5×5 участков
      const hv = hash2(i, j, 1);
      const sm = smoothL(i, j, kd); const Lv = Math.max(1, Math.round(sm * 0.75 + L * 0.25));
      const hitsRoad = (ox: number, oz: number, w2: number, d2: number) => { const c2 = Math.cos(rot), s2 = Math.sin(rot); for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) { const lx = u * w2 / 2, lz = v * d2 / 2; const px = ox + lx * c2 + lz * s2, pz = oz - lx * s2 + lz * c2; const e2 = w.net.nearestEdge(px, pz, 14); if (e2 && e2.d < ROAD_TYPES[w.net.edges[e2.e].type].w / 2 + 1.2) return true; } return false; };
      const place = (W0: number, D0: number, sb: number) => { const lotF = 0.72 + 0.28 * hash2(i, j, 51); let W = W0 * (W0 > 15 ? 1 : lotF), D = D0 * (0.8 + 0.2 * hash2(i, j, 52)); let r0 = place0(W, D, sb); for (let t = 0; t < 2 && hitsRoad(r0.ox, r0.oz, r0.w2, r0.d2); t++) { W *= 0.72; D *= 0.72; r0 = place0(W, D, sb); } if (hitsRoad(r0.ox, r0.oz, r0.w2, r0.d2)) r0.w2 = 0; return r0; };
      const place0 = (W: number, D: number, sb: number) => { const [w2, d2] = fit(W, D, sb); const shift = Math.max(0, 7.5 - d2 / 2 - Math.max(0, front - 7.5 + 0) * 0) ; void shift; const back = Math.min(0, (front - sb) - d2 / 2) ; return { w2, d2, ox: x + Math.sin(rot) * back, oz: z + Math.cos(rot) * back }; };
      if (detail >= 2 && (kd === K.RES || kd === K.COM) && ((i + j) % 3 === 0) && front > 3) { const f = front - 0.6; addM('prop#streetLight', [x + Math.sin(rot) * f, y + 0.2, z + Math.cos(rot) * f, 1, 1, 1, rot + Math.PI, 0xffffff]); }
      const resWall = pick(BUILD.resWalls, dist(3)), midWall = pick(BUILD.midWalls, dist(4)), towWall = pick(BUILD.towerWalls, dist(5));
      if (kd === K.RES) {
        if (st === 1) { // трущобы: низкие лачуги, приглушённые цвета, по уличной линии
          const P = place(9, 8, 1.5); boxes.push([P.ox, y, P.oz, P.w2, 2.6, P.d2, rot, pick([0x9a8f80, 0x8a8478, 0xa59680], dist(6))]); if (detail >= 1) roofs.push([P.ox, y + 2.6, P.oz, P.w2, 0.9, P.d2, rot, 0x6b6258]);
        } else if (Lv <= 2 && st !== 2) { // частный дом
          if (hash2(i, j, 61) < 0.15) continue; const P = place(10, 9, 4); if (detail >= 2) addM('house#' + Math.floor(dist(7) * 4), [P.ox, y, P.oz, P.w2 / 9, 1, P.d2 / 8, rot, resWall]);
          else { boxes.push([P.ox, y, P.oz, P.w2, 3 * Lv, P.d2, rot, resWall]); roofs.push([P.ox, y + 3 * Lv, P.oz, P.w2, 2.4, P.d2, rot, pick(BUILD.resRoofs, dist(8))]); }
          if (detail >= 2 && st !== 3 && hash2(i, j, 41) < 0.55 && front > 5) { const f = front - 1.2; trees.push([x + Math.sin(rot) * f + Math.cos(rot) * 4, y, z + Math.cos(rot) * f - Math.sin(rot) * 4, 2.2, 6, 2.2, 0, 0x5ea845]); }
        } else if (st === 3) { // исторический квартал: сплошная застройка по красной линии, скатные крыши
          const fl = Math.min(5, 2 + Math.round(Lv / 2)); const P = place(15.5, 12, 0.5); if (detail >= 2) addM('resMid#h' + fl, [P.ox, y, P.oz, P.w2 / 18, 1, P.d2 / 12, rot, pick(BUILD.resWalls, dist(9))]);
          else boxes.push([P.ox, y, P.oz, P.w2, fl * 3.2 + 0.8, P.d2, rot, pick(BUILD.resWalls, dist(9))]);
          if (detail >= 1) roofs.push([P.ox, y + fl * 3.2 + 0.8, P.oz, P.w2, 3, P.d2, rot, pick(BUILD.resRoofs, dist(10))]);
        } else if (Lv <= 9 || st === 2) { // средняя этажность / панельный район (единая этажность района)
          const fl = st === 2 ? (dist(11) < 0.5 ? 9 : 5) : Math.max(3, Math.min(8, Lv)); const P = place(15, 12, 3);
          if (detail >= 2) addM('resMid#' + fl, [P.ox, y, P.oz, P.w2 / 18, 1, P.d2 / 12, rot, st === 2 ? pick([0xe2e0d4, 0xcfd6d8, 0xd8c9b0], dist(12)) : midWall]);
          else boxes.push([P.ox, y, P.oz, P.w2, fl * 3.2 + 0.8, P.d2, rot, midWall]);
        } else { // башни: только у центра, высота — сглаженная
          const fl = Math.min(30, Math.round(Lv * 1.1)); const P = place(15, 15, 3);
          if (detail >= 2) addM('resTower#' + Math.min(4, Math.floor(fl / 8)), [P.ox, y, P.oz, P.w2 / 19, fl / (8 + 8 * Math.min(4, Math.floor(fl / 8))) , P.d2 / 19, rot, towWall]);
          else boxes.push([P.ox, y, P.oz, P.w2 * 0.85, fl * 3.2, P.d2 * 0.85, rot, towWall]);
        }
      } else if (kd === K.COM) {
        if (Lv <= 4 || st === 3) { const P = place(14, 12, 1); if (detail >= 2) addM('commercialSmall#' + Math.floor(dist(13) * 3), [P.ox, y, P.oz, P.w2 / 13, Math.max(1, Lv / 2.5), P.d2 / 12, rot, pick(BUILD.comWalls, dist(14))]); else boxes.push([P.ox, y, P.oz, P.w2, 4 + Lv * 3, P.d2, rot, pick(BUILD.comWalls, dist(14))]); }
        else { const fl = Math.min(40, Math.round(Lv * 1.2)); const P = place(15, 15, 2); if (detail >= 2) addM('office#' + Math.floor(dist(15) * 2), [P.ox, y, P.oz, P.w2 / 22, fl / 14, P.d2 / 22, rot, pick(BUILD.towerWalls, dist(16))]); else boxes.push([P.ox, y, P.oz, P.w2 * 0.85, fl * 3.4, P.d2 * 0.85, rot, pick(BUILD.towerWalls, dist(16))]); }
      } else if (kd === K.IND) {
        const P = place(15.5, 14, 2); if (detail >= 2) addM('industrial#' + Math.floor(dist(17) * 2), [P.ox, y, P.oz, P.w2 / 30, Math.min(2, 0.8 + Lv * 0.08), P.d2 / 20, rot, pick(BUILD.indWalls, dist(18))]);
        else boxes.push([P.ox, y, P.oz, P.w2, 6 + Lv, P.d2, rot, pick(BUILD.indWalls, dist(18))]);
      } else if (kd === K.EXTRACT) {
        const r = w.resource[k];
        if (r === RES.FERTILE || !r) boxes.push([x, y, z, 15.8, 0.4, 15.8, rot, pick([TERRAIN_F1, TERRAIN_F2, TERRAIN_F3], dist(19))]);
        else if (r === RES.FOREST) { boxes.push([x, y, z, 12, 4, 8, rot, 0x8a6a42]); cyls.push([x - 4, y, z + 4, 3, 2, 3, 0, 0x6d4c2c]); }
        else if (r === RES.ORE) { boxes.push([x, y, z, 12, 6, 12, rot, 0x6f6a66]); boxes.push([x + 3, y + 6, z, 3, 12, 3, rot, 0x4f4a46]); }
        else { boxes.push([x, y, z, 4, 3, 10, rot, 0x2a2a2a]); cyls.push([x, y, z - 5, 2, 7, 2, 0, 0x3a3a3a]); }
      } else if (kd === K.WAREHOUSE) { const P = place(15.5, 15, 1); if (detail >= 2) addM('warehouse#0', [P.ox, y, P.oz, P.w2 / 36, 1, P.d2 / 22, rot, 0xffffff]); else boxes.push([P.ox, y, P.oz, P.w2, 9, P.d2, rot, 0xb0b8c0]); }
      else if (kd === K.PARK) { boxes.push([x, y, z, 16, 0.4, 16, rot, 0x7fb352]); if (detail >= 2) { const n = 2 + Math.floor(hv * 3); for (let q = 0; q < n; q++) { const s2 = 2 + hash2(i, j, 30 + q) * 2; trees.push([x + (hash2(i, j, 31 + q) - 0.5) * 11, y, z + (hash2(i, j, 32 + q) - 0.5) * 11, s2, s2 * 2.4, s2, 0, pick([0x5ea845, 0x4c9a48, 0x77b84e], hash2(i, j, 33 + q))]); } } }
      else if (kd === K.STATION) { if (detail >= 2) addM('station#0', [x, y, z, 15 / 48, 1, 15 / 22, rot, 0xffffff]); else boxes.push([x, y, z, 15, 6, 12, rot, BUILD.stationWalls]); }
      else if (kd === K.PORT) { boxes.push([x, y, z, 16, 2, 16, 0, 0x6a6a6a]); boxes.push([x - 3, y + 2, z, 3, 22, 3, 0, 0xd9a03c]); boxes.push([x + 2, y + 22, z, 16, 2, 2, 0, 0xd9a03c]); boxes.push([x + 4, y + 2, z + 4, 6, 5, 6, 0, 0x2f7fbf]); boxes.push([x + 4, y + 2, z - 4, 6, 5, 6, 0, 0xbf3f2f]); }
    }
    // ── участки вдоль улиц: настоящие лоты разной ширины/глубины, фасадом к улице
    if (detail >= 1) {
      const x0 = cx * CHUNK * TILE, z0 = cz * CHUNK * TILE, cs = CHUNK * TILE;
      const seen = new Set<number>();
      for (const e of w.net.edgesNear(x0 + cs / 2, z0 + cs / 2, cs * 0.75 + 120)) {
        if (seen.has(e)) continue; seen.add(e);
        if (detail >= 2) for (const p of this.lots.edgeLots(e) && (this.lots.props.get(e) || [])) {
          if (p[0] < x0 || p[0] >= x0 + cs || p[1] < z0 || p[1] >= z0 + cs) continue; const py = w.hAt(p[0], p[1]);
          if (p[3] === 1) addM('prop#streetLight', [p[0], py + 0.1, p[1], 1, 1, 1, p[2], 0xffffff]); else trees.push([p[0], py, p[1], 2, 5.5, 2, 0, pick([0x5ea845, 0x4c9a48, 0x6fae4a], h01(p[0], p[1]))]);
        }
        for (const L of this.lots.edgeLots(e)) {
          if (L.x < x0 || L.x >= x0 + cs || L.z < z0 || L.z >= z0 + cs) continue;
          const k = L.k; if (!w.bld[k] || this.lots.cls(k)?.cls !== L.cls) continue;
          const ne = w.net.nearestEdge(L.x, L.z, 30); if (ne && ne.d < ROAD_TYPES[w.net.edges[ne.e].type].w / 2 + Math.min(L.w, L.d) / 2 - 1) continue; // новая дорога прошла по участку
          const i = k % N, j = (k / N) | 0, kd = w.kind[k]; const y = w.hAt(L.x, L.z) - 0.3; const rot = L.rot;
          const hv = h01(L.x, L.z), hv2 = h01(L.z, L.x + 7);
          const dist = (key: number) => hash2(Math.floor(i / 5), Math.floor(j / 5), key);
          const Lv = Math.max(1, Math.round(smoothL(i, j, kd) * 0.75 + w.bld[k] * 0.25) + (L.corner ? 1 : 0) + (hv < 0.15 ? -1 : hv > 0.88 ? 1 : 0));
          const cB = (arr: number[], key: number) => pick(arr, (dist(key) * 0.6 + hv2 * 0.4));
          const W = L.w, D = L.d;
          const cc = w.cities[w.cityOf[k] - 1] || w.cities[0]; const dn = cc ? Math.min(1, Math.hypot(L.x - cc.x, L.z - cc.z) / (cc.r * 0.45)) : 1; const grad = 1.35 - 0.75 * dn * dn; // пик в центре, спад к краю
          if (detail < 1 && Lv < 3) continue;
          switch (L.cls) {
            case 'slum': boxes.push([L.x, y, L.z, W, 2.6, D, rot, cB([0x9a8f80, 0x8a8478, 0xa59680, 0x8f9590], 6)]); if (detail >= 1) roofs.push([L.x, y + 2.6, L.z, W, 0.9, D, rot, 0x6b6258]); break;
            case 'house': {
              const dw = Math.min(W, 11), dd = Math.min(D * 0.55, 10); const ox = L.x - Math.sin(rot) * (D / 2 - dd / 2) * 0.3, oz = L.z - Math.cos(rot) * (D / 2 - dd / 2) * 0.3;
              if (detail >= 2) addM('house#' + Math.floor(hv2 * 4), [ox, y, oz, dw / 9, 0.9 + hv * 0.3, dd / 8, rot, cB(BUILD.resWalls, 3)]);
              else { boxes.push([ox, y, oz, dw, 3.2, dd, rot, cB(BUILD.resWalls, 3)]); roofs.push([ox, y + 3.2, oz, dw, 2.4, dd, rot, cB(BUILD.resRoofs, 8)]); }
              break; }
            case 'hist': { const fl = Math.min(6, 2 + Math.round(Lv / 2) + (hv > 0.6 ? 1 : 0)); if (detail >= 2) addM('resMid#h' + Math.min(5, fl), [L.x, y, L.z, W / 18, fl / Math.min(5, fl), D / 12, rot, cB(BUILD.resWalls, 9)]); else boxes.push([L.x, y, L.z, W, fl * 3.2 + 0.8, D, rot, cB(BUILD.resWalls, 9)]); if (detail >= 1) roofs.push([L.x, y + fl * 3.2 + 0.8, L.z, W, 3, D, rot, cB(BUILD.resRoofs, 10)]); break; }
            case 'mid': case 'panel': { const fl = L.cls === 'panel' ? (dist(11) < 0.4 ? 9 : dist(11) < 0.8 ? 12 : 5) : Math.max(3, Math.min(9, Lv)); const q = fl <= 4 ? 4 : fl <= 6 ? 6 : 9;
              const col = L.cls === 'panel' ? pick([0xe2e0d4, 0xcfd6d8, 0xd8c9b0, 0xc9d3c0, 0xe0cfc0], dist(12) * 0.7 + hv2 * 0.3) : cB(BUILD.midWalls, 4);
              if (detail >= 2) addM('resMid#' + q, [L.x, y, L.z, W / 18, fl / q, D / 12, rot, col]); else boxes.push([L.x, y, L.z, W, fl * 3.2 + 0.8, D, rot, col]); break; }
            case 'tower': { const fl = Math.max(9, Math.min(34, Math.round(Lv * grad * (0.65 + hv * 0.8)))); const v = Math.min(4, Math.floor(fl / 8)); if (detail >= 2) addM('resTower#' + v, [L.x, y, L.z, W / 19, fl / (8 + 8 * v), D / 19, rot, cB(BUILD.towerWalls, 5)]); else boxes.push([L.x, y, L.z, W * 0.85, fl * 3.2, D * 0.85, rot, cB(BUILD.towerWalls, 5)]); break; }
            case 'shop': if (detail >= 2) addM('commercialSmall#' + Math.floor(hv2 * 3), [L.x, y, L.z, W / 13, Math.max(1, Lv / 2.5), D / 12, rot, cB(BUILD.comWalls, 14)]); else boxes.push([L.x, y, L.z, W, 4 + Lv * 3, D, rot, cB(BUILD.comWalls, 14)]); break;
            case 'office': { const fl = Math.max(5, Math.min(44, Math.round(Lv * grad * (0.6 + hv * 0.9)))); if (detail >= 2) addM('office#' + Math.floor(hv2 * 2), [L.x, y, L.z, W / 22, fl / 14, D / 22, rot, cB(BUILD.towerWalls, 16)]); else boxes.push([L.x, y, L.z, W * 0.85, fl * 3.4, D * 0.85, rot, cB(BUILD.towerWalls, 16)]); break; }
            case 'ind': if (detail >= 2) addM('industrial#' + Math.floor(hv2 * 2), [L.x, y, L.z, W / 30, Math.min(2, 0.8 + Lv * 0.08), D / 20, rot, cB(BUILD.indWalls, 18)]); else boxes.push([L.x, y, L.z, W, 6 + Lv, D, rot, cB(BUILD.indWalls, 18)]); break;
          }
        }
      }
    }
    const mk = (geo: THREE.BufferGeometry, arr: number[][], cast: boolean, mat: THREE.Material = this.bldMat) => {
      arr = arr.filter(a => a[3] > 0.05 && a[5] > 0.05); if (!arr.length) return; const m = new THREE.InstancedMesh(geo, mat, arr.length); const d = this.dummy, c = this.tmpC;
      arr.forEach((a, n) => { d.position.set(a[0], a[1], a[2]); d.scale.set(a[3], a[4], a[5]); d.rotation.set(0, a[6], 0); d.updateMatrix(); m.setMatrixAt(n, d.matrix); m.setColorAt(n, c.setHex(a[7])); });
      m.castShadow = cast && this.q.shadows; m.receiveShadow = true; m.computeBoundingSphere(); this.scene.add(m); ch.blds.push(m);
    };
    for (const t of trees) { const k = t[3] / 2.6; addM(t[7] === 0x2f6e4a ? 'tree#conifer' : 'tree#deciduous', [t[0], t[1], t[2], k, k, k, hash2(t[0] | 0, t[2] | 0, 7) * 6.28, 0xffffff]); }
    mk(this.geoBox, boxes, true); mk(this.geoRoof, roofs, true); mk(this.geoCyl, cyls, true);
    for (const [key, arr] of models) mk(this.modelGeo(key), arr, true, this.styledMat); // модели дизайнера — фирменный материал (окна ночью по glow)
  }
  modelGeo(key: string): THREE.BufferGeometry {
    try { return this.modelGeo0(key); } catch (e) { if (!this.warned) { this.warned = true; console.warn('design model failed, fallback box', key, e); } return this.geoBox; }
  }
  warned = false;
  modelGeo0(key: string): THREE.BufferGeometry {
    const [kind, v] = key.split('#'); const opts: any = { neutral: true };
    if (kind === 'tree') return this.lib.get({ type: 'tree', kind: v as any, opts: {} } as any, 0);
    if (kind === 'prop') return this.lib.get({ type: 'prop', kind: v as any } as any, 0);
    if (kind === 'resMid') { opts.floors = v.startsWith('h') ? +v.slice(1) : +v; opts.lotW = 18; opts.lotD = 12; return this.lib.get({ type: 'building', kind: 'resMid', opts }, v.startsWith('h') ? 1 : 0); }
    if (kind === 'resTower') { opts.floors = 8 + 8 * +v; opts.lotW = 19; opts.lotD = 19; return this.lib.get({ type: 'building', kind: 'resTower', opts }, 0); }
    if (kind === 'office') { opts.floors = 14; opts.lotW = 22; opts.lotD = 22; return this.lib.get({ type: 'building', kind: 'office', opts }, +v); }
    if (kind === 'house') { opts.lotW = 9; opts.lotD = 8; opts.neutral = true; return this.lib.get({ type: 'building', kind: 'house', opts }, +v); }
    if (kind === 'commercialSmall') { opts.lotW = 13; opts.lotD = 12; opts.floors = 2; return this.lib.get({ type: 'building', kind: 'commercialSmall', opts }, +v); }
    if (kind === 'industrial') { opts.lotW = 30; opts.lotD = 20; delete opts.neutral; return this.lib.get({ type: 'building', kind: 'industrial', opts }, +v); }
    if (kind === 'warehouse') { opts.lotW = 36; opts.lotD = 22; delete opts.neutral; return this.lib.get({ type: 'building', kind: 'warehouse', opts }, 0); }
    delete opts.neutral; return this.lib.get({ type: 'building', kind: kind as any, opts }, 0);
  }
  disposeChunk(ch: Chunk) {
    for (const m of [ch.terrain, ch.roads, ch.marks]) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    for (const o of ch.blds) { this.scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
  }
  refreshAll() { for (const ch of this.chunks.values()) { this.world.dirtyTerrain.add(ch.id); this.world.dirtyRoads.add(ch.id); } this.buildOverview(); }
  refreshRoads() { for (const ch of this.chunks.values()) this.world.dirtyRoads.add(ch.id); }
  updateChunks() {
    const w = this.world; const cs = CHUNK * TILE; const tx = this.ctl.tx, tz = this.ctl.tz;
    const vd = Math.min(this.q.viewDist, Math.max(2500, this.ctl.dist * 2.5));
    const want = new Map<number, number>();
    const r = Math.ceil(vd / cs); const ci = Math.floor(tx / cs), cj = Math.floor(tz / cs);
    for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a >= w.chunksN || b >= w.chunksN) continue; const d = Math.hypot((a + 0.5) * cs - tx, (b + 0.5) * cs - tz); if (d > vd + cs) continue; want.set(b * w.chunksN + a, d);
    }
    for (const [id, ch] of this.chunks) if (!want.has(id)) { this.disposeChunk(ch); this.chunks.delete(id); }
    const order = [...want.entries()].sort((p, q) => p[1] - q[1]);
    let budget = 6; const t0 = performance.now();
    for (const [id, d] of order) {
      if (performance.now() - t0 > 12 && budget < 6) break;
      let ch = this.chunks.get(id); if (!ch) { ch = { id, tStep: 0, blds: [], bDetail: -1 }; this.chunks.set(id, ch); }
      const step = d < 1800 ? 1 : d < 4000 ? 2 : 4;
      if ((ch.tStep !== step || w.dirtyTerrain.has(id)) && budget > 0) { this.buildTerrain(ch, step); w.dirtyTerrain.delete(id); budget--; }
      if ((!ch.roads || w.dirtyRoads.has(id)) && budget > 0) { this.buildRoads(ch); w.dirtyRoads.delete(id); budget--; }
      const det = d > this.q.bldDist ? -1 : d < 1000 ? 2 : d < this.q.bldDist * 0.6 ? 1 : 0;
      if ((ch.bDetail !== det || w.dirtyBld.has(id)) && budget > 0) { if (det < 0) { for (const o of ch.blds) { this.scene.remove(o); (o as any).dispose?.(); } ch.blds = []; ch.bDetail = -1; } else this.buildBuildings(ch, det); w.dirtyBld.delete(id); budget--; }
    }
  }
  // ---------- lighting ----------
  setTimeOfDay(hours: number) {
    const a = (hours - 6) / 12 * Math.PI; const sy = Math.sin(a); const day = smooth(-0.15, 0.25, sy);
    this.night.value = 1 - smooth(-0.1, 0.15, sy); styleUniforms.uNight.value = this.night.value * 0.85; // доля горящих окон ночью (lit моделей задаёт порог)
    const tx = this.ctl.tx, tz = this.ctl.tz; const R = 3000;
    this.sun.position.set(tx + Math.cos(a) * R, Math.max(200, sy * R), tz + R * 0.35);
    this.sun.target.position.set(tx, 0, tz);
    this.sun.intensity = 2.4 * day; this.hemi.intensity = 0.35 + 1.1 * day;
    const sky = new THREE.Color(0x0b1430).lerp(new THREE.Color(0x9fd0f0), day); const dusk = Math.max(0, 1 - Math.abs(sy) * 4) * 0.5; sky.lerp(new THREE.Color(0xf09a5a), dusk);
    this.sun.color.setHex(0xfff2dd).lerp(new THREE.Color(0xff9a50), dusk * 1.5);
    (this.scene.background as THREE.Color).copy(sky); (this.scene.fog as THREE.Fog).color.copy(sky);
    const sc = Math.min(1200, Math.max(150, this.ctl.dist * 0.8)); this.renderer.shadowMap.enabled = this.q.shadows && this.ctl.dist < 2200; /* тени только вблизи */ const cam = this.sun.shadow.camera;
    cam.left = -sc; cam.right = sc; cam.top = sc; cam.bottom = -sc; cam.near = 10; cam.far = R * 2.5; cam.updateProjectionMatrix();
    (this.scene.fog as THREE.Fog).near = Math.max(900, this.ctl.dist * 1.2); groundUniforms.uTime.value = performance.now() / 1000; groundUniforms.uFogCol.value.copy((this.scene.fog as THREE.Fog).color); (this.scene.fog as THREE.Fog).far = Math.max(this.q.viewDist * 1.6, this.ctl.dist * 4);
  }
  render() { this.renderer.render(this.scene, this.cam); this.stats.tris = this.renderer.info.render.triangles; this.stats.calls = this.renderer.info.render.calls; }
}
