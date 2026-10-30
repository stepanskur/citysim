import * as THREE from 'three';
import { Lots } from './Lots';
import { createGroundMaterial, groundUniforms, surfaceWeights, groundSplatColor, blurVertexColors, patchFarFade } from '../../design/ground-material';
import { buildJunction, padRadiusFor, roadMaterials, type Arm } from '../../design/road-kit';
import { ROAD_SPEC, GROUND } from '../../design/palette';
import { buildBridge, buildTunnelPortal } from '../../design/road-kit-v2';
import { createTrafficNeonMaterial, nightUniforms, placeStreetLamps, StreetLampSet, CarLightSet, buildRoadGlowStrip, createRoadGlowMaterial, applyNightPreset, setNightDistance, patchNightReadable, createNightComposer } from '../../design/night';
import { createWaterMaterial, shoreDistance } from '../../design/water-material';
import { buildDeadEnd, END_CAP } from '../../design/road-joints';
import { layoutYard } from '../../design/yards';
const JCLS = ['street', 'avenue', 'highway', 'lane'] as const;
/** длина рукава площадки-разворота (как в buildDeadEnd): где начинается обычное ребро */
const deadEndTrim = (t: number) => { const cls = JCLS[t]; const Rb = END_CAP.bulbR[cls]; return t === 3 ? 2.25 + 3 + 2.25 : Rb + END_CAP.blend + 4 + Rb * 0.55; };
import { GRASS, BUSH, createTuftGeometry, createGrassMaterial, scatterGrass, createBushGeometry, createBushMaterial, tickGround } from '../../design/ground';
import { profileWidthOf } from '../world/roadProfiles';
const SWC = new THREE.Color(ROAD_SPEC.color.sidewalk);
const MEDC = new THREE.Color(GROUND.grass); const FARMINOR = new THREE.Color(0xb3b494);
const ASPH = [0x7a7e8b, 0x575b6c, 0x50546a, 0x868995]; // QA2 п.4: магистрали/шоссе по ROADS_SPEC (palette ROAD_SPEC.color.asphalt), не «чёрные»; // фикс «белых»: улица 0x9a9ea9→0x7a7e8b (на солнце и на светлом настиле читалась белой), иерархия сохранена; // V9: улица/переулок светлые, магистрали тёмные
const WMUL = [0.9, 1.0, 1.0, 0.85]; // QA2 п.4: ширина проспекта/шоссе ровно ROAD_SPEC.asphalt // V9: магистрали шире, улицы уже (только полотно рёбер)
/** Перекраска площадки перекрёстка дизайнера в нашу иерархию цветов асфальта. */
/** v5 тупик под наш профиль: асфальт — цвет класса, бордюр/тротуар опускаются на уровень тротуарной плиты рёбер (без ступеньки на стыке). */
function fitDeadEnd(g: THREE.BufferGeometry, t: number, yA: number) {
  const ca = g.attributes.color as THREE.BufferAttribute, pa = g.attributes.position as THREE.BufferAttribute; const as = new THREE.Color(0x4a4e63), dst = new THREE.Color(ASPH[t]), tc = new THREE.Color(), sw = new THREE.Color(ROAD_SPEC.color.sidewalk);
  for (let i = 0; i < ca.count; i++) { tc.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); const asph = pa.getY(i) <= yA + 0.01 && tc.r < 0.6; // асфальт — нижний слой; стенка бордюра светлая
    if (asph) ca.setXYZ(i, dst.r, dst.g, dst.b); else { ca.setXYZ(i, sw.r, sw.g, sw.b); if (pa.getY(i) > yA + 0.01) pa.setY(i, yA + ROAD_SPEC.y.sidewalk - ROAD_SPEC.y.asphalt); } }
}
/** design/night patchNightReadable без конфликта имён: его Object.assign(nightUniforms) перетирал uFar (vec4) материала земли — подставляем только uLift/uVision. */
function patchNight<T extends THREE.Material>(m: T): T {
  const tmp = patchNightReadable(new THREE.MeshLambertMaterial()); const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); const keep = { ...sh.uniforms }; tmp.onBeforeCompile(sh, r); for (const k of Object.keys(nightUniforms)) if (k !== 'uLift' && k !== 'uVision') { if (k in keep) sh.uniforms[k] = keep[k]; else delete sh.uniforms[k]; } };
  const pk = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => pk() + '|night'; return m;
}
/** QA6 п.3: ночной «пол» земли — тёмно-синий минимум яркости, растущий с дистанцией (не чёрная земля издали) */
const NIGHT_BLUE = { value: new THREE.Vector4(0, 0, 0, 0) };
function patchNightBlue<T extends THREE.Material>(m: T): T { const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); sh.uniforms.uNB = NIGHT_BLUE; sh.fragmentShader = 'uniform vec4 uNB;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  { float fz = clamp((gl_FragCoord.z / gl_FragCoord.w) / 6000.0, 0.0, 1.0); vec3 nb = uNB.rgb * uNB.a * (0.45 + 0.55 * fz); gl_FragColor.rgb = max(gl_FragColor.rgb, nb); }'); };
  const pk = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => pk() + '|nb'; return m; }
function recolorJunction(g: THREE.BufferGeometry, mainType: number) {
  const ca = g.attributes.color as THREE.BufferAttribute; const tc = new THREE.Color(); const src = [ROAD_SPEC.color.pad, ...ROAD_SPEC.color.asphalt].map(h => new THREE.Color(h)); const dst = [ASPH[mainType], ...ASPH].map(h => new THREE.Color(h));
  for (let i = 0; i < ca.count; i++) { tc.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); for (let k = 0; k < src.length; k++) if (Math.abs(tc.r - src[k].r) + Math.abs(tc.g - src[k].g) + Math.abs(tc.b - src[k].b) < 0.004) { ca.setXYZ(i, dst[k].r, dst[k].g, dst[k].b); break; } }
}
/** Фикс «белых артефактов» (запрос Степана): road-kit buildJunction обводит тротуаром/бордюром ВЕСЬ контур площадки,
 *  включая торцы рукавов, — бордюр (y +0.135) ложится поперёк проезжей части выше асфальта (белая полоса на каждом выезде),
 *  а у шоссе (тротуара нет, только обочина) кольцо тротуара торчит светлыми клиньями между рукавами. Здесь (без правки design/):
 *  выкидываем треугольники тротуара/бордюра, центр которых лежит в коридоре рукава; у узлов с шоссе тротуар/бордюр
 *  перекрашиваются в цвет обочины. Плюс площадка приподнята на +0.02 над рёбрами (z-fighting разных серых). */
function cleanJunction(g: THREE.BufferGeometry, arms: Arm[], ox: number, oz: number, R: number): THREE.BufferGeometry {
  const P = g.attributes.position as THREE.BufferAttribute, Cc = g.attributes.color as THREE.BufferAttribute;
  const light = [ROAD_SPEC.color.sidewalk, ROAD_SPEC.color.curb].map(h => new THREE.Color(h)); const sh = new THREE.Color(ROAD_SPEC.color.shoulder);
  const hasHw = arms.some(a => a.type === 2); const keep: number[] = []; const tc = new THREE.Color();
  for (let t = 0; t < P.count; t += 3) {
    tc.setRGB(Cc.getX(t), Cc.getY(t), Cc.getZ(t)); const isLight = light.some(l => Math.abs(tc.r - l.r) + Math.abs(tc.g - l.g) + Math.abs(tc.b - l.b) < 0.004);
    if (isLight) { const cx = (P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3 - ox, cz = (P.getZ(t) + P.getZ(t + 1) + P.getZ(t + 2)) / 3 - oz;
      let cut = false; for (const a of arms) { const al = cx * a.dx + cz * a.dz, ac = Math.abs(-cx * a.dz + cz * a.dx); if (al > R - 1 && ac < ROAD_SPEC.asphalt[a.type] / 2 + 0.6) { cut = true; break; } }
      if (cut) continue; }
    for (let q = 0; q < 3; q++) keep.push(t + q);
  }
  const pos = new Float32Array(keep.length * 3), col = new Float32Array(keep.length * 3), nrm = new Float32Array(keep.length * 3);
  keep.forEach((v, i) => { let r = Cc.getX(v), gg = Cc.getY(v), b = Cc.getZ(v); tc.setRGB(r, gg, b);
    if (hasHw && light.some(l => Math.abs(tc.r - l.r) + Math.abs(tc.g - l.g) + Math.abs(tc.b - l.b) < 0.004)) { r = sh.r; gg = sh.g; b = sh.b; }
    pos.set([P.getX(v), P.getY(v) + 0.02, P.getZ(v)], i * 3); col.set([r, gg, b], i * 3); nrm.set([0, 1, 0], i * 3); });
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.BufferAttribute(pos, 3)); o.setAttribute('color', new THREE.BufferAttribute(col, 3)); o.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.dispose(); return o;
}
import { createStyledMaterial, styleUniforms, applyScenePreset, SceneRig } from '../../design/scene-preset';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RailView } from './RailView';
const h01 = (a: number, b: number) => { const q = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return q - Math.floor(q); };
import { lotTheme, themedForLot, wallColor } from './Themes';
import { ModelLibrary, createVehicle, VEHICLE_LENGTH } from '../../design/models';
import { BUILD_MUTED as BUILD, ROADS, TERRAIN, GROUND_V5, mute } from '../../design/palette'; // E (HANDOFF_v5 ч.3): приглушённая палитра домов
const FIELD_C = [GROUND.field, GROUND.fieldPlowed, TERRAIN.field2 ?? GROUND.field].map(h => new THREE.Color(h));
function whiteColors(g: THREE.BufferGeometry) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3)); }
import { World } from '../world/World';
import { TILE, CHUNK, K, Z, RES } from '../world/consts';
import { ROAD_TYPES, MOD } from '../world/RoadNet';
import { BALANCE } from '../sim/balance';
import { CameraCtl } from './Camera';
import { hash2, clamp, smooth } from '../util';

export type Overlay = 'none' | 'traffic' | 'land' | 'pollution' | 'transit' | 'resources' | 'zones' | 'territory';
export interface Quality { shadows: boolean; pixelRatio: number; viewDist: number; bldDist: number; agentCap: number; name: string }
export const QUALITIES: Quality[] = [
  { name: 'Низкое', shadows: false, pixelRatio: 0.75, viewDist: 3500, bldDist: 2200, agentCap: 1500 },
  { name: 'Среднее', shadows: true, pixelRatio: 1, viewDist: 6000, bldDist: 3500, agentCap: 4000 },
  { name: 'Высокое', shadows: true, pixelRatio: 1.5, viewDist: 10000, bldDist: 6000, agentCap: 8000 },
];
interface Chunk { lamps?: StreetLampSet; glow?: THREE.Mesh; id: number; terrain?: THREE.Mesh; tStep: number; roads?: THREE.Mesh; bridges?: THREE.Mesh; rStep?: number; marks?: THREE.Mesh; blds: THREE.Object3D[]; bDetail: number }

const C = (h: number) => new THREE.Color(h);
const OV_R = new THREE.Color(0xb08f7c), OV_C = new THREE.Color(0x8d97ad), OV_I = new THREE.Color(0xa59670);
const COL = { sand: C(0xd9c98f), grass: C(0x7fae55), grass2: C(0x6a9c48), forest: C(0x5f9148), rock: C(0x8a8378), snow: C(0xf2f2f2), fert: C(0xa9b85a), ore: C(0x9a7f6a), oil: C(0x5c5a52), under: C(0x6f8f7a),
  zr: C(0x8fd17a), zc: C(0x7aaee6), zi: C(0xe6c76a) };

export class Renderer {
  rig!: SceneRig; renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); cam: THREE.PerspectiveCamera; ctl: CameraCtl;
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; water: THREE.Mesh;
  chunks = new Map<number, Chunk>();
  overview?: THREE.Mesh;
  overlay: Overlay = 'none';
  q: Quality = QUALITIES[1];
  bridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0xc4c0bc }); // color: приглушаем светлый бетон кита (настил/бордюры светились белым) // DoubleSide: у стенок bar() развёрнут порядок вершин (примечание Дезигнера)
  terrainMat: THREE.MeshLambertMaterial; roadMat: THREE.MeshLambertMaterial; bldMat: THREE.MeshLambertMaterial; plainMat: THREE.MeshLambertMaterial;
  geoBox: THREE.BoxGeometry; geoRoof: THREE.ConeGeometry; geoCyl: THREE.CylinderGeometry; geoTree: THREE.ConeGeometry;
  night = { value: 0 };
  carLights!: CarLightSet; nightComp: ReturnType<typeof createNightComposer> | null = null; lampPoleMat = createStyledMaterial(); glowMats = new Map<string, THREE.ShaderMaterial>(); vision = 0;
  vehMeshes: THREE.InstancedMesh[] = []; lib!: ModelLibrary;
  lightMesh: THREE.InstancedMesh; signalPoles!: THREE.InstancedMesh;
  lineGroup = new THREE.Group(); toolGroup = new THREE.Group();
  edgeLoad: (e: number) => number = () => 0;
  dummy = new THREE.Object3D(); tmpC = new THREE.Color();
  stats = { tris: 0, calls: 0 };
  /** этап D: режим метро (RailView, design/metro-view): поверхность полупрозрачная, тоннели/платформы видны «рентгеном» */
  metroManual = false; rail!: RailView;
  setMetroView(on: boolean) { if (!this.rail) return; this.rail.patch([this.terrainMat, this.roadMat, this.bldMat, this.plainMat, this.bridgeMat, this.marksMat, this.styledMat, this.skirtMat, this.ovMat, this.farMat]); this.rail.setOn(on); this.water.visible = !on; /* QA2 п.5: вода не заливает вид бирюзой; дома (styledMat) и подложка тоже «стекло» */ }
  skirtMat = createGroundMaterial({ polygonOffset: true, polygonOffsetFactor: 8, polygonOffsetUnits: 8 }); ovMat = createGroundMaterial(); // QA2 п.1: без polygonOffset — на крутом угле он «топил» подложку под воду (смещение по наклону)
  constructor(public world: World, public canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.q.pixelRatio));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.cam = new THREE.PerspectiveCamera(50, 1, 2, world.M * 3);
    // UI_AUDIT P2 п.16–17: пресет сцены «Пастила» — градиентный купол, персиковая дымка, ACES 1.05, sRGB, hemi/sun из WORLD
    this.rig = applyScenePreset(this.renderer, this.scene, { time: 12, shadows: true, shadowSize: 2048, dist: 3000 });
    this.hemi = this.rig.hemi; this.sun = this.rig.sun; this.scene.background = null;
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
    this.water = new THREE.Mesh(wg, this.makeWater()); wg.translate(0, -0.05, 0); // E6 (v5 ч.4): шейдер воды design/water-material, уровень −0.05 (нет мерцания кромки)
    this.water.renderOrder = 1; this.scene.add(this.water);
    this.ctl = new CameraCtl(this.cam, canvas, (x, z) => world.hAt(x, z), world.M, (cx, cy) => this.pickScreen(cx, cy));
    const c0 = world.cities[0]; this.ctl.jump(c0.x, c0.z, Math.min(2500, c0.r * 1.3)); this.ctl.tx = c0.x; this.ctl.tz = c0.z; this.ctl.dist = this.ctl.gdist;
    // vehicles: car, truck, bus, tram, metro, train
    // модели транспорта из design/models (нос +Z → поворачиваем на +X, как ожидает симуляция)
    const N = { neutral: true };
    const train = (wag: 'wagonPassenger' | 'wagonFreight', n: number) => { const parts = [createVehicle('locomotive', N)]; let off = -VEHICLE_LENGTH.locomotive / 2; for (let q = 0; q < n; q++) { const g = createVehicle(wag, N); off -= VEHICLE_LENGTH[wag] / 2 + 0.6; g.translate(0, 0, off); off -= VEHICLE_LENGTH[wag] / 2; parts.push(g); } const m = mergeGeometries(parts); m.translate(0, 0, -off / 2 - VEHICLE_LENGTH.locomotive / 4); return m; };
    const geos = [createVehicle('car', N), createVehicle('truck', N), createVehicle('bus', N), createVehicle('tram', N), train('wagonPassenger', 2), train('wagonPassenger', 3)];
    const vehMat = patchFarFade(createStyledMaterial()); // P2 п.15: фирменный материал и для транспорта
    const caps = [12000, 4000, 1500, 600, 400, 300];
    geos.forEach((g, i) => {
      g.rotateY(Math.PI / 2); g.translate(0, 0.15, 0);
      const m = new THREE.InstancedMesh(g, vehMat, caps[i]); m.count = 0; m.frustumCulled = false; m.castShadow = i > 0;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps[i] * 3), 3);
      this.vehMeshes.push(m); this.scene.add(m);
    });
    // D (v5, NIGHT_SPEC): ночь, в которой можно строить — подъём альбедо / «ночное видение» слоёв на основных материалах, фары машин, bloom
    for (const m of [this.terrainMat, this.ovMat, this.skirtMat, this.roadMat, this.bldMat, vehMat] as THREE.Material[]) patchNight(m); for (const m of [this.terrainMat, this.ovMat, this.skirtMat] as THREE.Material[]) patchNightBlue(m);
    this.carLights = new CarLightSet(caps[0] + caps[1]); for (const o of [this.carLights.head, this.carLights.tail, this.carLights.beam]) { o.geometry.rotateY(Math.PI / 2); o.geometry.translate(0, 0.15, 0); } this.scene.add(this.carLights.group);
    try { this.nightComp = createNightComposer(this.renderer, this.scene, this.cam); } catch { this.nightComp = null; }
    const lg = new THREE.BoxGeometry(1, 0.06, 0.45);
    this.lightMesh = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 3000); this.lightMesh.count = 0; this.lightMesh.frustumCulled = false;
    this.lightMesh = new THREE.InstancedMesh(this.lib.get({ type: 'prop', kind: 'signalLamp' } as any, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 1200); this.lightMesh.count = 0; this.lightMesh.frustumCulled = false;
    this.lightMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1200 * 3), 3); this.scene.add(this.lightMesh); // линзы светофоров (design/models signalLamp)
    this.signalPoles = new THREE.InstancedMesh(this.lib.get({ type: 'prop', kind: 'trafficLight' } as any, 0), this.styledMat, 1200); this.signalPoles.count = 0; this.signalPoles.frustumCulled = false; this.signalPoles.castShadow = true; this.scene.add(this.signalPoles);
    this.scene.add(this.lineGroup); this.scene.add(this.toolGroup); this.rail = new RailView(this.scene, () => this.world, this.bldMat, this.bridgeMat);
    this.buildOverview();
    { // V8: «юбка» земли за краем карты — нет жёсткого прямоугольника на фоне неба; уходит в туман
      const M = world.M, E = M * 4, parts: THREE.BufferGeometry[] = [];
      for (const [x0, z0, x1, z1] of [[-E, -E, M + E, 0], [-E, M, M + E, M + E], [-E, 0, 0, M], [M, 0, M + E, M]]) { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 96, 96); /* этап A: густая кромка — не пересекает рельеф */ g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2); parts.push(g); }
      const sk = mergeGeometries(parts)!; const pa = sk.attributes.position as THREE.BufferAttribute; const cl = new Float32Array(pa.count * 3); const gc = new THREE.Color(GROUND.grass);
      for (let v = 0; v < pa.count; v++) { const x = pa.getX(v), z = pa.getZ(v); const ex = Math.min(Math.max(x, 1), M - 1), ez = Math.min(Math.max(z, 1), M - 1); const out = Math.hypot(x - ex, z - ez); pa.setY(v, out < 1 ? Math.max(world.hAt(ex, ez), 0.5) - 1.2 : 0.8); /* этап A: кромка ниже земли карты — нет z-fighting */ cl[v * 3] = gc.r; cl[v * 3 + 1] = gc.g; cl[v * 3 + 2] = gc.b; }
      sk.setAttribute('color', new THREE.BufferAttribute(cl, 3)); sk.computeVertexNormals();
      this.scene.add(new THREE.Mesh(sk, this.skirtMat));
    }
    this.resize(); window.addEventListener('resize', () => this.resize());
  }
  setQuality(q: Quality) { this.q = q; document.documentElement.classList.toggle('noblur', q.name === 'Низкое'); /* этап A: без backdrop-filter на низком */ this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio)); this.renderer.shadowMap.enabled = q.shadows; this.sun.castShadow = q.shadows; this.scene.traverse(o => { if ((o as any).material) ((o as any).material as THREE.Material).needsUpdate = true; }); this.resize(); }
  resize() { const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight; this.renderer.setSize(w, h, false); this.nightComp?.composer.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
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
  terrMean: number[] | null = null;
  tileColor(i: number, j: number, out: THREE.Color) {
    const w = this.world, N = w.N; i = clamp(i, 0, N - 1); j = clamp(j, 0, N - 1); const k = j * N + i;
    const h = w.tileH(i, j), r = w.resource[k];
    if (h < -2) out.setHex(GROUND.sandWet);
    else { // FIX_VISUALS §2: смесь покрытий по физическим признакам, а не «цвет тайла»
      const kd = w.kind[k]; const urban = w.bld[k] && kd !== K.PARK && kd !== K.EXTRACT ? (kd === K.RES && w.style[k] === 0 ? 0.55 : 1) : w.cityOf[k] && w.road[k] ? 0.6 : 0;
      groundSplatColor(surfaceWeights(Math.max(0, h), w.tileSlope(i, j), r === RES.FOREST ? 1 : 0, r === RES.FERTILE || (kd === K.EXTRACT && r === RES.FERTILE) ? 1 : 0, urban), out);
      out.setHex(mute(out.getHex())); // E (v5 ч.3): приглушённая земля; парк больше не красится по вершинам (давало ромбы/полосы «подложки»)
      if (kd === K.EXTRACT && (r === RES.FERTILE || !r)) { /* P2 п.21: поля — сплатом рельефа (GROUND.field/fieldPlowed), полосы 3×1 участка, без плит */ const hq = hash2(Math.floor(i / 3), j, 19); out.lerp(FIELD_C[Math.floor(hq * 3)], 0.7); }
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
    for (let v = 0; v < pos.count; v++) { const x = pos.getX(v), z = pos.getZ(v); { const hh = w.hAt(Math.min(x, w.M - 1), Math.min(z, w.M - 1)); pos.setY(v, hh > 0 ? Math.max(hh - 1.5, hh * 0.5) : hh - 1.5); } /* QA2 п.1: низкая суша подложки не уходит под воду (раньше h−1.5 < 0 → «море» вместо суши) */ { const ti = Math.min(w.N - 1, Math.floor(x / TILE)), tj = Math.min(w.N - 1, Math.floor(z / TILE)); this.tileColor(ti, tj, c); const k = tj * w.N + ti; if (this.overlay === 'none' && w.bld[k]) { const zz = w.zone[k]; c.lerp(zz === Z.C ? OV_C : zz === Z.I ? OV_I : OV_R, 0.55); } } /* QA2 п.9: кварталы вдали — мягкий цвет зоны, а не белая «сетка» */ col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b; }
    void st; if (this.overlay === 'none') blurVertexColors(col, R + 1, R + 1, BALANCE.render.terrainBlurFar); // QA3: подложка без мозаики тайлов
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const mat = this.ovMat; // V8: тот же материал, что у земли и «юбки» — без светлого квадрата
    if (this.overview) { this.scene.remove(this.overview); this.overview.geometry.dispose(); }
    this.overview = new THREE.Mesh(g, mat); this.overview.receiveShadow = false; this.overview.renderOrder = 1; // V11: после земли чанков — перекрытые пиксели отсекаются по глубине
    this.buildFarRoads();
    this.scene.add(this.overview); // QA2 п.1: подложка всей карты ВСЕГДА в сцене (раньше add был проглочен комментарием → «море» вне чанков)
  }
  farRoads?: THREE.Mesh; farMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** QA2 п.1/4: магистрали и шоссе всей карты одной дешёвой лентой поверх подложки (под землёй чанков — там видны детальные дороги); концы скруглены. */
  buildFarRoads() {
    const w = this.world, net = w.net; const pos: number[] = [], col: number[] = []; const c = new THREE.Color();
    const tri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => { pos.push(ax, ay, az, bx, by, bz, cx, cy, cz); for (let q = 0; q < 3; q++) col.push(c.r, c.g, c.b); };
    const Y = (x: number, z: number) => { const h = w.hAt(x, z); if (h <= 0) return 0.3; const ov = Math.max(h - 1.5, h * 0.5); return ov + Math.min(0.4, (h - ov) * 0.6); }; // между подложкой и землёй чанков
    for (const E of net.edges) { if (!E.alive || (E.type !== 1 && E.type !== 2)) continue; const A = net.nodes[E.a], B = net.nodes[E.b]; const hw = ROAD_SPEC.asphalt[E.type] / 2 + 1; const L = Math.max(E.len, 1e-3); const dx = (B.x - A.x) / L, dz = (B.z - A.z) / L; c.setHex(ASPH[0]).lerp(new THREE.Color(ASPH[E.type]), BALANCE.render.farRoadDark); // QA3: издали шоссе не чёрная палка — серый асфальт
      const n = Math.max(1, Math.ceil(L / 40)); for (let s = 0; s < n; s++) { const x0 = A.x + (B.x - A.x) * s / n, z0 = A.z + (B.z - A.z) * s / n, x1 = A.x + (B.x - A.x) * (s + 1) / n, z1 = A.z + (B.z - A.z) * (s + 1) / n; const y0 = Y(x0, z0), y1 = Y(x1, z1);
        tri(x0 - dz * hw, y0, z0 + dx * hw, x1 + dz * hw, y1, z1 - dx * hw, x1 - dz * hw, y1, z1 + dx * hw); tri(x0 - dz * hw, y0, z0 + dx * hw, x0 + dz * hw, y0, z0 - dx * hw, x1 + dz * hw, y1, z1 - dx * hw); }
      for (const N0 of [A, B]) { const y = Y(N0.x, N0.z); for (let k = 0; k < 8; k++) { const a0 = k / 8 * Math.PI * 2, a1 = (k + 1) / 8 * Math.PI * 2; tri(N0.x, y, N0.z, N0.x + Math.cos(a1) * hw, y, N0.z + Math.sin(a1) * hw, N0.x + Math.cos(a0) * hw, y, N0.z + Math.sin(a0) * hw); } } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const nr = new Float32Array(pos.length); for (let i = 1; i < nr.length; i += 3) nr[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    if (this.farRoads) { this.scene.remove(this.farRoads); this.farRoads.geometry.dispose(); }
    this.farRoads = new THREE.Mesh(g, this.farMat); this.farRoads.renderOrder = 1; this.scene.add(this.farRoads);
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
    if (this.overlay === 'none') blurVertexColors(col, nx, nzv, step === 1 ? 0 : BALANCE.render.terrainBlurFar); /* QA3: издали без мозаики тайлов */ // QA v7: вблизи без размытия — резкие границы, деталь даёт шейдер
    const idx: number[] = [];
    for (let b = 0; b < nzv - 1; b++) for (let a = 0; a < nx - 1; a++) { const p = b * nx + a; idx.push(p, p + nx, p + 1, p + 1, p + nx, p + nx + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
    if (ch.terrain) { ch.terrain.geometry.dispose(); ch.terrain.geometry = g; } else { ch.terrain = new THREE.Mesh(g, this.terrainMat); ch.terrain.receiveShadow = true; this.scene.add(ch.terrain); }
    ch.tStep = step;
  }
  roadColor(e: number, type: number, c: THREE.Color) {
    if (this.overlay === 'traffic') { c.setHex(0x1a2238); return c; } // C2: асфальт в «ночном видении», загрузку рисует неоновая лента (neonFrame)
    return c.setHex(ASPH[type] ?? (type === 4 ? 0x8c857a : ASPH[0])); // V8: улица светлее, проспект/шоссе темнее — иерархия читается // светло-серый асфальт (палитра)
  }
  padR(n: number) { const net = this.world.net; return padRadiusFor(net.nodes[n].edges.filter(e => net.edges[e].alive).map(e => ({ dx: 0, dz: 0, type: net.edges[e].type, len: 0 }))); }
  marksMat = roadMaterials().marks;
  /** этап C: конструкция уровня ребра. Эстакада — пролёты road-kit-v2 buildBridge (настил, кессон, перила, опоры шагом pierSpacing)
   *  там, где настил выше земли > 2 м; тоннель — порталы buildTunnelPortal там, где проезжая часть уходит под землю (−1.5 м); видимая часть портала 4.5 м. */
  buildLevel(e: number, out: THREE.BufferGeometry[]) {
    const w = this.world, net = w.net, E = net.edges[e], A = net.nodes[E.a], B = net.nodes[E.b]; const lv = E.lv || 0; const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len;
    const wd = Math.min(profileWidthOf(E.type), ROAD_SPEC.asphalt[E.type] + 2); const at = (s: number) => ({ x: A.x + dx * s, z: A.z + dz * s });
    // B4: опора эстакады не ставится на дорогу под ней — если точка опоры попадает на наземное полотно (+ запас), пролёт идёт без этой опоры
    const pierOk = (s: number) => { const p = at(s); for (const f of net.edgesNear(p.x, p.z, 30)) { if (f === e) continue; const F = net.edges[f]; if (!F.alive || (F.lv || 0) > 0) continue; const P = net.nodes[F.a], Q = net.nodes[F.b]; const vx = Q.x - P.x, vz = Q.z - P.z; const t = Math.max(0, Math.min(1, ((p.x - P.x) * vx + (p.z - P.z) * vz) / (vx * vx + vz * vz || 1))); if (Math.hypot(P.x + vx * t - p.x, P.z + vz * t - p.z) < ROAD_SPEC.asphalt[F.type] / 2 + ROAD_SPEC.curbW + ROAD_SPEC.sidewalk[F.type] + 2.5) return false; } return true; };
    if (lv > 0) { const n = Math.max(1, Math.ceil(E.len / BALANCE.roads.pierSpacing)); for (let k = 0; k < n; k++) { const s0 = E.len * k / n, s1 = E.len * (k + 1) / n, sm = (s0 + s1) / 2; const p = at(sm);
        const ya = w.roadY(at(s0).x, at(s0).z) + w.edgeOff(e, s0), yb = w.roadY(at(s1).x, at(s1).z) + w.edgeOff(e, s1);
        if (Math.abs(ya - yb) > 0.15) { // рампа: плоский пролёт на высоте середины торчал над наклонным асфальтом светлой «ступенькой» — режем на куски по 6 м ниже полотна
          const m = Math.ceil((s1 - s0) / 6); for (let q = 0; q < m; q++) { const u0 = s0 + (s1 - s0) * q / m, u1 = s0 + (s1 - s0) * (q + 1) / m; const pa = at(u0), pb = at(u1);
            const y = Math.min(w.roadY(pa.x, pa.z) + w.edgeOff(e, u0), w.roadY(pb.x, pb.z) + w.edgeOff(e, u1)) - 0.25; const gy = w.hAt((pa.x + pb.x) / 2, (pa.z + pb.z) / 2); if (y - Math.max(gy, 0) < 2) continue;
            try { out.push(buildBridge([pa, pb], wd, y, Math.min(gy, y - 3), q === m - 1 && pierOk(u1) ? (u1 - u0) * 0.999 : 1e6)); } catch { /* */ } }
          continue; }
        const y = Math.min(ya, yb, w.roadY(p.x, p.z) + w.edgeOff(e, sm)) - 0.25; const gy = w.hAt(p.x, p.z); if (y - Math.max(gy, 0) < 2) continue;
        try { out.push(buildBridge([at(s0), at(s1)], wd, y, Math.min(gy, y - 3), pierOk(s1) ? (s1 - s0) * 0.999 : 1e6)); } catch { /* вырожденный */ } } }
    else { const steps = Math.ceil(E.len / 2); let prev = w.edgeOff(e, 0); for (let k = 1; k <= steps; k++) { const s = E.len * k / steps, o = w.edgeOff(e, s);
        if ((prev > -1.5) !== (o > -1.5)) { const p = at(s); const t = o < prev ? { x: dx, z: dz } : { x: -dx, z: -dz }; try { out.push(buildTunnelPortal(p, t, wd, 6, w.roadY(p.x, p.z) + o - 0.2)); } catch { /* */ } }
        prev = o; } }
  }
  buildRoads(ch: Chunk) {
    const w = this.world, net = w.net; const cs = CHUNK * TILE; const cx = (ch.id % w.chunksN) * cs, cz = Math.floor(ch.id / w.chunksN) * cs;
    const pos: number[] = [], col: number[] = [], idx: number[] = []; const c = new THREE.Color();
    const bridgeG: THREE.BufferGeometry[] = []; // этап C: мосты над водой (design/road-kit-v2 buildBridge, ширина по модульному профилю)
    const lampsY: [any, number][] = [], glowG: THREE.BufferGeometry[] = []; const nodesDone = new Set<number>(); const jBase: THREE.BufferGeometry[] = [], jMarks: THREE.BufferGeometry[] = [];
    for (const e of net.edgesNear(cx + cs / 2, cz + cs / 2, cs * 0.75)) {
      const E = net.edges[e]; if (!E.alive) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
      if (w.chunkOfPos((A.x + B.x) / 2, (A.z + B.z) / 2) !== ch.id) continue;
      const lv = E.lv || 0; const Y = (x: number, z: number, sd: number) => w.roadY(x, z) + (lv ? w.edgeOff(e, sd) : 0); // этап C: уровень ребра
      if (lv) this.buildLevel(e, bridgeG);
      if (!lv && ch.rStep !== 2 && E.type !== 3) { let wet = 0, gmin = 1e9; for (let q = 1; q < 8; q++) { const h = w.hAt(A.x + (B.x - A.x) * q / 8, A.z + (B.z - A.z) * q / 8); gmin = Math.min(gmin, h); if (h < 0.3) wet++; }
        if (wet >= 2) { const y = Math.max(w.roadY(A.x, A.z), w.roadY(B.x, B.z), 2.5); try { bridgeG.push(buildBridge([{ x: A.x, z: A.z }, { x: B.x, z: B.z }], Math.min(profileWidthOf(E.type), ROAD_SPEC.asphalt[E.type] + 2), y, Math.min(gmin, -1))); } catch { /* вырожденный */ } } }
      const far = ch.rStep >= 2; const minor = E.type === 0 || E.type === 3; const hw = ROAD_SPEC.asphalt[E.type] / 2 * WMUL[E.type] * (far && minor ? 1.1 : 1); const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const px = -dz * hw, pz = dx * hw;
      // B1: плавный переход ширины на стыке разных классов (узел степени 2) — узкое полотно и тротуар расширяются к узлу на длине taper (13: taperLenPerM·Δw, ≥ taperMinLen), без «ступеньки»
      const wideAt = (nn: number) => { const L = net.nodes[nn].edges.filter(x => x !== e && net.edges[x].alive); if (L.length !== 1) return 0; const t2 = net.edges[L[0]].type; if (t2 === E.type || t2 === 2 || (net.edges[L[0]].lv || 0) !== lv) return 0; return Math.max(0, ROAD_SPEC.asphalt[t2] / 2 * WMUL[t2] - hw); };
      const dA = far ? 0 : wideAt(E.a), dB = far ? 0 : wideAt(E.b); const NGB = BALANCE.netgen as any; const tl = (d: number) => Math.min(E.len * 0.45, Math.max(NGB.taperMinLen ?? 20, d * 2 * (NGB.taperLenPerM ?? 10)));
      const extra = (sd: number) => (dA > 0 ? dA * Math.max(0, 1 - sd / tl(dA)) : 0) + (dB > 0 ? dB * Math.max(0, 1 - (E.len - sd) / tl(dB)) : 0);
      this.roadColor(e, E.type, c); if (far && minor && this.overlay === 'none') c.lerp(FARMINOR, 0.75); if (far && E.type === 2 && this.overlay === 'none') c.lerp(new THREE.Color(ASPH[0]), 1 - BALANCE.render.farRoadDark); /* QA3: шоссе издали — серая полоса */ // V9: вдали второстепенные улицы растворяются в массе кварталов
      const steps = Math.max(1, Math.ceil(E.len / (lv ? 6 : dA || dB ? 5 : 14)));
      // v5 стыки: у тупика ребро начинается на trim площадки-разворота (design/road-joints buildDeadEnd), без белых торцов
      const dTrim = (nn: number) => { if (far || lv || E.type === 2) return 0; const L = net.nodes[nn].edges.filter(x => net.edges[x].alive).length; return L === 1 ? Math.min(E.len * 0.4, deadEndTrim(E.type)) : 0; };
      if (!far && !lv && E.len > 20) { const cls = JCLS[E.type]; const yE = w.roadY((A.x + B.x) / 2, (A.z + B.z) / 2); const tr = (nn: number) => net.nodes[nn].edges.filter(x => net.edges[x].alive).length >= 3 ? Math.max(8, this.padR(nn) + 2) : 4;
        try { for (const l of placeStreetLamps([{ x: A.x, z: A.z }, { x: B.x, z: B.z }], cls, { trimStart: tr(E.a), trimEnd: tr(E.b) })) lampsY.push([l, w.roadY(l.x, l.z) - 0.1]); } catch { /* */ }
        if (E.type === 1 || E.type === 2) glowG.push(buildRoadGlowStrip([{ x: A.x, z: A.z }, { x: B.x, z: B.z }], cls, yE + 0.12)); }
      const tA = dTrim(E.a), tB = dTrim(E.b); const U = (s: number) => (tA + (E.len - tA - tB) * s / steps) / E.len;
      if (E.type !== 2 && !far && lv <= 0) { // sidewalks (на эстакаде — нет: тротуар шире настила висел в воздухе белой полосой)
        const sw = hw + ROAD_SPEC.curbW + ROAD_SPEC.sidewalk[E.type]; const qx = -dz * sw, qz = dx * sw; const b1 = pos.length / 3;
        for (let s = 0; s <= steps; s++) { const u = U(s); const x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u; const y = Y(x, z, E.len * u) + ROAD_SPEC.y.sidewalk - 0.1; const k3 = 1 + extra(E.len * u) / sw; pos.push(x + qx * k3, y, z + qz * k3, x - qx * k3, y, z - qz * k3); col.push(SWC.r, SWC.g, SWC.b, SWC.r, SWC.g, SWC.b); }
        for (let s = 0; s < steps; s++) { const p = b1 + s * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      }
      for (let s = 0; s < steps && !lv; s++) { // bridge sides
        const x = A.x + (B.x - A.x) * (s + 0.5) / steps, z = A.z + (B.z - A.z) * (s + 0.5) / steps; if (w.hAt(x, z) > 0.8) continue;
        const xa = A.x + (B.x - A.x) * s / steps, za = A.z + (B.z - A.z) * s / steps, xb = A.x + (B.x - A.x) * (s + 1) / steps, zb = A.z + (B.z - A.z) * (s + 1) / steps;
        for (const sg of [1, -1]) { const b3 = pos.length / 3; const ox = px * sg * 1.05, oz = pz * sg * 1.05;
          pos.push(xa + ox, w.roadY(xa, za), za + oz, xb + ox, w.roadY(xb, zb), zb + oz, xa + ox, -3, za + oz, xb + ox, -3, zb + oz); for (let q = 0; q < 4; q++) col.push(0.62, 0.6, 0.56);
          idx.push(b3, b3 + 2, b3 + 1, b3 + 1, b3 + 2, b3 + 3, b3, b3 + 1, b3 + 2, b3 + 1, b3 + 3, b3 + 2); }
      }
      const base = pos.length / 3;
      for (let s = 0; s <= steps; s++) { const u = U(s); const x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u; const y = Y(x, z, E.len * u) + ROAD_SPEC.y.asphalt - 0.1 + E.type * 0.005; const k2 = 1 + extra(E.len * u) / hw; pos.push(x + px * k2, y, z + pz * k2, x - px * k2, y, z - pz * k2); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      for (let s = 0; s < steps; s++) { const p = base + s * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      // V8: проспект — зелёный разделитель, шоссе/проспект — белые краевые линии
      const deg = (nn: number) => net.nodes[nn].edges.filter(x => net.edges[x].alive).length; const cA = deg(E.a) >= 3 && !far ? Math.min(E.len * 0.45, this.padR(E.a)) : 0, cB = deg(E.b) >= 3 && !far ? Math.min(E.len * 0.45, this.padR(E.b)) : 0; // B1: разметка/разделитель не заходят на площадку перекрёстка (белые полосы поперёк стыка)
      const strip = (o0: number, o1: number, dy: number, cr: number, cg: number, cb: number) => { const b4 = pos.length / 3; for (let s2 = 0; s2 <= steps; s2++) { const u = (cA + (E.len - cA - cB) * s2 / steps) / E.len; const x = A.x + (B.x - A.x) * u, z = A.z + (B.z - A.z) * u; const y = Y(x, z, E.len * u) + ROAD_SPEC.y.asphalt - 0.1 + dy; pos.push(x - dz * o0, y, z + dx * o0, x - dz * o1, y, z + dx * o1); col.push(cr, cg, cb, cr, cg, cb); } for (let s2 = 0; s2 < steps; s2++) { const p = b4 + s2 * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); } };
      if (this.overlay === 'none' && (E.type === 1 || E.type === 2)) { // разделитель + краевые линии (видны и вдали)
        if (E.type === 1) { const m = ROAD_SPEC.median[1] / 2; strip(-m, m, 0.03, MEDC.r, MEDC.g, MEDC.b); }
        for (const sg of [1, -1]) strip(sg * (hw - 0.55), sg * (hw - 0.4), 0.025, 0.92, 0.91, 0.88);
      }
      // этап C: модули профиля — утопленные трамвайные рельсы по оси (road-kit-v2 embeddedTramRails, колея 1.524), автобусные полосы у бордюра
      const em = E.m || 0;
      if (em && this.overlay === 'none') {
        if (em & MOD.TRAM) { const tc = E.type === 0 || E.type === 3 ? [0] : [-hw * 0.28, hw * 0.28]; for (const o of tc) for (const r of [-0.762, 0.762]) { strip(o + r - 0.06, o + r + 0.06, 0.035, 0.55, 0.56, 0.6); strip(o + r - 0.16, o + r - 0.06, 0.033, 0.22, 0.22, 0.24); } }
        if (em & MOD.BUS) for (const sg of [1, -1]) strip(sg * (hw - 3.1), sg * (hw - 0.4), 0.03, 0.62, 0.27, 0.24);
        if (em & MOD.ONEWAY && !far) for (let d0 = Math.max(cA, 10) + 6; d0 < E.len - Math.max(cB, 10) - 4; d0 += 24) { // C: стрелки одностороннего движения a→b
          const t = d0 / E.len, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; const y = Y(x, z, d0) + ROAD_SPEC.y.asphalt + 0.04; const b5 = pos.length / 3;
          pos.push(x + dx * 2.2, y, z + dz * 2.2, x - dz * 1.1, y, z + dx * 1.1, x + dz * 1.1, y, z - dx * 1.1); for (let q = 0; q < 3; q++) col.push(0.92, 0.91, 0.88); idx.push(b5, b5 + 1, b5 + 2, b5, b5 + 2, b5 + 1); }
      }
      // center dashes for avenues/highways
      if (E.type === 2 && !far) { // V9: осевая только у шоссе; у проспекта — разделитель, у улиц нет
        const lc = this.overlay === 'traffic' ? c : new THREE.Color(0xd8d8c8);
        const nd = Math.floor(E.len / 9);
        const jA = net.nodes[E.a].edges.length >= 3 ? this.padR(E.a) + 16 : 0, jB = net.nodes[E.b].edges.length >= 3 ? this.padR(E.b) + 16 : 0;
        for (let s = 1; s < nd - 1; s += 1) { const t0 = (s * 9) / E.len, t1 = (s * 9 + 3) / E.len; if (t1 > 1) break; if (s * 9 < jA || s * 9 + 3 > E.len - jB) continue; const b2 = pos.length / 3;
          for (const t of [t0, t1]) { const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; const y = Y(x, z, E.len * t) + 0.06 + E.type * 0.02; pos.push(x - dz * 0.25, y, z + dx * 0.25, x + dz * 0.25, y, z - dx * 0.25); col.push(lc.r, lc.g, lc.b, lc.r, lc.g, lc.b); }
          idx.push(b2, b2 + 2, b2 + 1, b2 + 1, b2 + 2, b2 + 3); }
      }
      for (const nn of [E.a, E.b]) {
        if (nodesDone.has(nn)) continue; const N0 = net.nodes[nn]; if (w.chunkOfPos(N0.x, N0.z) !== ch.id) continue; nodesDone.add(nn);
        const live = N0.edges.filter(e2 => net.edges[e2].alive);
        const y0 = w.roadY(N0.x, N0.z) - 0.1 + w.nodeLift(nn);
        if (live.length >= 3 && !far) { // эталонный перекрёсток дизайнера: площадка со скруглениями, бордюр, зебры, стоп-линии
          const R = this.padR(nn);
          const arms: Arm[] = live.map(e2 => { const E2 = net.edges[e2]; const o = net.nodes[E2.a === nn ? E2.b : E2.a]; return { dx: (o.x - N0.x) / E2.len, dz: (o.z - N0.z) / E2.len, type: E2.type, len: Math.max(R + 2, Math.min(E2.len / 2, R + 16)) }; });
          try { const J = buildJunction(N0.x, N0.z, arms, y0); recolorJunction(J.base, Math.max(...arms.map(a => a.type === 3 ? -1 : a.type)) < 0 ? 3 : Math.max(...arms.map(a => a.type === 3 ? -1 : a.type))); jBase.push(cleanJunction(J.base, arms, N0.x, N0.z, R)); const mk = J.marks.attributes.position as THREE.BufferAttribute; for (let i = 0; i < mk.count; i++) mk.setY(i, mk.getY(i) + 0.02); jMarks.push(J.marks); } catch { /* вырожденный узел — пропуск */ }
          continue;
        }
        if (live.length === 1 && !far) { const E1 = net.edges[live[0]]; if (E1.type !== 2 && !(E1.lv || 0)) { const o = net.nodes[E1.a === nn ? E1.b : E1.a];
          try { const J = buildDeadEnd({ x: N0.x, z: N0.z }, { dx: (o.x - N0.x) / E1.len, dz: (o.z - N0.z) / E1.len, cls: JCLS[E1.type] }, E1.type === 3 ? 'round' : 'bulb', y0 + ROAD_SPEC.y.asphalt - 0.1 + 0.1); fitDeadEnd(J.base, E1.type, y0 + 0.1 - 0.1 + ROAD_SPEC.y.asphalt - 0.1 + 0.1); jBase.push(J.base); continue; } catch { /* вырожденный */ } } }
        let r = 0, rs = 0, mt = 0, me = N0.edges[0]; for (const e2 of live) { const t = net.edges[e2].type; r = Math.max(r, ROAD_SPEC.asphalt[t] / 2); rs = Math.max(rs, ROAD_SPEC.asphalt[t] / 2 + ROAD_SPEC.curbW + ROAD_SPEC.sidewalk[t]); if (t >= mt) { mt = t; me = e2; } }
        this.roadColor(me, mt, c); if (this.overlay === 'traffic') c.setHex(0x8a8a8a);
        const disc = (rad: number, y: number, cr: number, cg: number, cb: number) => { const b0 = pos.length / 3; pos.push(N0.x, y, N0.z); col.push(cr, cg, cb);
          for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; pos.push(N0.x + Math.cos(a) * rad, y, N0.z + Math.sin(a) * rad); col.push(cr, cg, cb); }
          for (let k = 0; k < 16; k++) idx.push(b0, b0 + 1 + ((k + 1) % 16), b0 + 1 + k); };
        if (rs > r && !far && !live.some(e2 => net.edges[e2].type === 2) && live.every(e2 => (net.edges[e2].lv || 0) === 0)) disc(rs, y0 + ROAD_SPEC.y.sidewalk - 0.005, SWC.r, SWC.g, SWC.b);
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
    if (ch.bridges) { this.scene.remove(ch.bridges); ch.bridges.geometry.dispose(); ch.bridges = undefined; }
    if (bridgeG.length) { const bg = mergeGeometries(bridgeG.map(g => g.index ? g.toNonIndexed() : g)); if (bg) { ch.bridges = new THREE.Mesh(bg, this.bridgeMat); ch.bridges.castShadow = ch.bridges.receiveShadow = true; this.scene.add(ch.bridges); } }
    if (ch.marks) { this.scene.remove(ch.marks); ch.marks.geometry.dispose(); ch.marks = undefined; }
    this.dropLamps(ch);
    if (lampsY.length) { const set = new StreetLampSet(lampsY.map(q => q[0]), this.lampPoleMat, 0); const M = new THREE.Matrix4(), T = new THREE.Matrix4();
      lampsY.forEach(([, y], i) => { T.makeTranslation(0, y, 0); for (const o of [set.poles, set.pools, set.cones]) { o.getMatrixAt(i, M); M.premultiply(T); o.setMatrixAt(i, M); } (set.dots.geometry.attributes.position as THREE.BufferAttribute).setY(i, (set.dots.geometry.attributes.position as THREE.BufferAttribute).getY(i) + y); });
      ch.lamps = set; this.scene.add(set.group); }
    if (glowG.length) { const gg = mergeGeometries(glowG); glowG.forEach(x => x.dispose()); if (gg) { ch.glow = new THREE.Mesh(gg, this.glowMat('avenue')); ch.glow.renderOrder = 6; ch.glow.frustumCulled = false; this.scene.add(ch.glow); } }
    if (jMarks.length) { const mg = mergeGeometries(jMarks); jMarks.forEach(x => x.dispose()); if (mg) { ch.marks = new THREE.Mesh(mg, this.marksMat); ch.marks.renderOrder = ROAD_SPEC.renderOrder.marking; this.scene.add(ch.marks); } }
    if (G !== g) g.dispose();
    const g2 = G;
    if (ch.roads) { ch.roads.geometry.dispose(); ch.roads.geometry = g2; } else { ch.roads = new THREE.Mesh(g2, this.roadMat); ch.roads.receiveShadow = true; this.scene.add(ch.roads); }
    ch.roads.visible = (g2.attributes.position?.count || 0) > 0; // V11: пустые чанки дорог не рисуем (сотни пустых draw call вдали)
  }
  /** Застройка чанка: здания строго по кварталам, фасадом к улице, с отступом; район = единый тип/палитра; высота — сглаженный градиент. */
  lots!: Lots;
  /** этап H: здания по темам Дезигнера (false — старые генераторы v2); счётчик построенных по темам */ themesOn = true; themeStats: Record<string, number> = {};
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
    // V11: дальний LOD — не инстансы-коробки, а один слитый меш на чанк (крыши жадно сливаются в полосы, скрытые стены и днища не рисуются)
    const i0 = cx * CHUNK, j0 = cz * CHUNK; const farT = new Float32Array(CHUNK * CHUNK).fill(NaN), farG = new Float32Array(CHUNK * CHUNK), farC = new Uint32Array(CHUNK * CHUNK);
    const farSet = (i: number, j: number, g: number, h: number, col: number) => { const li = (j - j0) * CHUNK + (i - i0); farG[li] = g; farT[li] = Math.round((g + h) * 2) / 2; farC[li] = col; };
    const pick = (arr: number[], h: number) => arr[Math.floor(h * arr.length) % arr.length];
    // V10: цвет района (8×8 тайлов) — насыщенные пятна: частный сектор тёплый, многоэтажки светлые, центр голубоватый, промзона коричневая
    const distCol = (kd: number, i: number, j: number, sm: number) => { const h = hash2(Math.floor(i / 8), Math.floor(j / 8), 7);
      return kd === K.COM ? pick(BUILD.comWalls, h) : kd === K.IND ? pick(BUILD.indWalls, h) : sm <= 2 ? pick(BUILD.resWalls, h) : pick(BUILD.midWalls.concat(BUILD.towerWalls), h); }; // P2 п.19: только палитра BUILD
    // сглаженная этажность: среднее по 5×5 участкам того же типа (плавный градиент от центра)
    const smoothL = (i: number, j: number, kd: number) => { let s = 0, n = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const k2 = jj * N + ii; if (w.bld[k2] && w.kind[k2] === kd) { s += w.bld[k2]; n++; } } return n ? s / n : 1; };
    for (let j = cz * CHUNK; j < Math.min(N, cz * CHUNK + CHUNK); j++) for (let i = cx * CHUNK; i < Math.min(N, cx * CHUNK + CHUNK); i++) {
      const k = j * N + i; const L = w.bld[k]; const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE;
      if (!L) {
        // V10: на дальнем LOD мелкие улицы/пустыри внутри застройки заливаются плитой цвета района — кварталы сливаются в пятна
        if (detail === 0 && w.cityOf[k] && (w.road[k] === 0 || w.road[k] === 1 || w.road[k] === 4)) {
          let nb = 0, nk = -1; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; const k2 = jj * N + ii; if (w.bld[k2]) { nb++; nk = k2; } }
          if (nb >= 2) { farSet(i, j, w.hAt(x, z) - 0.3, 1.6, distCol(w.kind[nk], i, j, 1)); continue; }
        }
        // лес — только вне городов
        if (detail >= 2 && w.resource[k] === RES.FOREST && !w.cityOf[k] && !w.road[k] && !w.zone[k] && w.tileH(i, j) > 1) {
          for (let t = 0; t < 2; t++) { const tx = x + (hash2(i, j, 10 + t) - 0.5) * 12, tz = z + (hash2(i, j, 20 + t) - 0.5) * 12; const sc = 3 + hash2(i, j, 30 + t) * 3; /* QA5 п.9: реже и вперемешку — хвойные, лиственные, кусты */ const RF = BALANCE.render, hk = hash2(i, j, 40 + t); if (hk > RF.forestKeep || !w.treeFree(tx, tz)) continue; const hm = hash2(i, j, 50 + t); if (hm < RF.forestConifer) trees.push([tx, w.hAt(tx, tz) - 0.5, tz, sc, sc * 2.6, sc, 0, 0x2f6e4a]); else if (hm < 1 - RF.forestBush) { const s2 = 2 + sc * 0.4; trees.push([tx, w.hAt(tx, tz) - 0.3, tz, s2, s2 * 2.4, s2, 0, 0x5ea845]); } else trees.push([tx, w.hAt(tx, tz) - 0.2, tz, 1.4, 1.2, 1.4, 0, 0x5a8f45]); }
        }
        continue;
      }
      const kd = w.kind[k]; const st = w.style[k];
      if (detail === 0 && (kd === K.RES || kd === K.COM || kd === K.IND) && !BALANCE.render.farLots) { // V8 блочный LOD: дальний квартал = масса одного цвета по району, высота сглажена
        const sm = smoothL(i, j, kd); const hgt = kd === K.IND ? 7 : Math.min(60, 2.5 + sm * 2.6); const dz = hash2(Math.floor(i / 4), Math.floor(j / 4), 5);
        const col = distCol(kd, i, j, sm); void dz;
        farSet(i, j, w.hAt(x, z) - 0.3, sm <= 2 && kd === K.RES ? 3.5 : hgt, col); continue; // V9: тайлы смыкаются в сплошную массу района
      }
      if (kd === K.RES || kd === K.COM || kd === K.IND) { // жилые/коммерческие/промышленные — по участкам (Lots); внутренность квартала — двор
        const isYard = (ii: number, jj: number) => { if (ii < 0 || jj < 0 || ii >= w.N || jj >= w.N) return false; const kk = jj * w.N + ii, kd2 = w.kind[kk]; const xx = (ii + 0.5) * TILE, zz = (jj + 0.5) * TILE;
          return (kd2 === K.RES || kd2 === K.COM) && w.chunkOfPos(xx, zz) === ch.id && !w.road[kk] && !this.lots!.occ.has(Math.floor(xx / 4) * 100003 + Math.floor(zz / 4)); };
        const YS: Set<number> = (boxes as any)._ys ??= new Set<number>();
        if (detail >= 2 && kd !== K.IND && this.lots && !YS.has(k) && isYard(i, j)) { // F3: двор квартала — design/yards layoutYard один раз на связную область
          const comp: number[] = [], st = [k]; YS.add(k); let i0 = i, i1 = i, j0 = j, j1 = j;
          while (st.length && comp.length < 64) { const kk = st.pop()!; comp.push(kk); const ii = kk % w.N, jj = (kk / w.N) | 0; i0 = Math.min(i0, ii); i1 = Math.max(i1, ii); j0 = Math.min(j0, jj); j1 = Math.max(j1, jj);
            for (const [a2, b2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n2 = (jj + b2) * w.N + ii + a2; if (!YS.has(n2) && isYard(ii + a2, jj + b2)) { YS.add(n2); st.push(n2); } } }
          const cset = new Set(comp); const bw = (i1 - i0 + 1) * TILE - 4, bd = (j1 - j0 + 1) * TILE - 4, cx0 = (i0 + i1 + 1) / 2 * TILE, cz0 = (j0 + j1 + 1) / 2 * TILE;
          const th = lotTheme(w, cx0, cz0, 'panel'); const items = layoutYard(th, bw, bd, (hash2(i0, j0, 91) * 1e9) | 0);
          for (const it of items) { const ix = cx0 + it.x, iz = cz0 + it.z; const kk = Math.floor(iz / TILE) * w.N + Math.floor(ix / TILE); if (!cset.has(kk) && it.kind !== 'path') continue; const yy = w.hAt(ix, iz) - 0.2;
            const iw = Math.min(it.w ?? 1, bw), id2 = Math.min(it.d ?? 1, bd), rot = it.rot ?? 0;
            if (it.kind === 'path') boxes.push([ix, yy, iz, iw, 0.32, id2, rot, 0xcfc6b4]);
            else if (it.kind === 'parking') boxes.push([ix, yy, iz, iw, 0.3, id2, 0, 0x7a7e8a]);
            else if (it.kind === 'playground') boxes.push([ix, yy, iz, iw, 0.35, id2, 0, 0xd9c7a0]);
            else if (it.kind === 'garage') boxes.push([ix, yy, iz, iw, 2.6, id2, 0, BUILD.concrete]);
            else if (it.kind === 'fountain') boxes.push([ix, yy, iz, 3, 0.9, 3, 0, 0xbfd8e0]);
            else if (it.kind === 'bench') boxes.push([ix, yy, iz, 1.6, 0.7, 0.5, rot, 0x8a6a4a]);
            else if (it.kind === 'bins') boxes.push([ix, yy, iz, 3, 1.2, 1.5, 0, 0x6a8a6a]);
            else if ((it.kind === 'tree' || it.kind === 'bush') && !w.treeFree(ix, iz)) { /* QA6: просека */ }
            else if (it.kind === 'tree') { const s2 = 2 + hash2(ix | 0, iz | 0, 5) * 1.5; trees.push([ix, yy, iz, s2, s2 * 2.4, s2, 0, pick([0x5ea845, 0x4c9a48, 0x77b84e], hash2(ix | 0, iz | 0, 6))]); }
            else if (it.kind === 'bush') trees.push([ix, yy, iz, 1.2, 1.1, 1.2, 0, 0x5a8f45]);
          }
        }
        continue;
      }
      const hc4 = [w.H(i, j), w.H(i + 1, j), w.H(i, j + 1), w.H(i + 1, j + 1)]; const y = Math.max(...hc4) - 0.05, yLo = Math.min(...hc4) - 0.3; // E5: дом по верхнему углу + цоколь, не «врастает»
      if (kd !== K.PARK && kd !== K.EXTRACT && w.bld[k] && y - yLo > 0.5) boxes.push([x, yLo, z, 13, y - yLo + 0.05, 13, 0, BUILD.plinth]);
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
          const P = place(9, 8, 1.5); boxes.push([P.ox, y, P.oz, P.w2, 2.6, P.d2, rot, pick([BUILD.plinth, BUILD.rooftop, BUILD.depotWalls], dist(6))]); if (detail >= 1) roofs.push([P.ox, y + 2.6, P.oz, P.w2, 0.9, P.d2, rot, 0x6b6258]);
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
          if (detail >= 2) addM('resMid#' + fl, [P.ox, y, P.oz, P.w2 / 18, 1, P.d2 / 12, rot, st === 2 ? pick(BUILD.towerWalls, dist(12)) : midWall]);
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
        if (r === RES.FERTILE || !r) { /* п.21: поле рисуется рельефом */ }
        else if (r === RES.FOREST) { boxes.push([x, y, z, 12, 4, 8, rot, BUILD.depotWalls]); cyls.push([x - 4, y, z + 4, 3, 2, 3, 0, BUILD.door]); }
        else if (r === RES.ORE) { boxes.push([x, y, z, 12, 6, 12, rot, BUILD.indWalls[1]]); boxes.push([x + 3, y + 6, z, 3, 12, 3, rot, BUILD.chimney]); }
        else { boxes.push([x, y, z, 4, 3, 10, rot, BUILD.indRoof[1]]); cyls.push([x, y, z - 5, 2, 7, 2, 0, BUILD.indAccent]); }
      } else if (kd === K.WAREHOUSE) { const P = place(15.5, 15, 1); if (detail >= 2) addM('warehouse#0', [P.ox, y, P.oz, P.w2 / 36, 1, P.d2 / 22, rot, 0xffffff]); else boxes.push([P.ox, y, P.oz, P.w2, 9, P.d2, rot, 0xb0b8c0]); }
      else if (kd === K.PARK) { /* E (s06): плита парка убрана */ if (detail >= 2) { const n = 2 + Math.floor(hv * 3); for (let q = 0; q < n; q++) { const s2 = 2 + hash2(i, j, 30 + q) * 2; trees.push([x + (hash2(i, j, 31 + q) - 0.5) * 11, y, z + (hash2(i, j, 32 + q) - 0.5) * 11, s2, s2 * 2.4, s2, 0, pick([0x5ea845, 0x4c9a48, 0x77b84e], hash2(i, j, 33 + q))]); } } }
      else if (kd === K.STATION) { if (detail >= 2) addM('station#0', [x, y, z, 15 / 48, 1, 15 / 22, rot, 0xffffff]); else boxes.push([x, y, z, 15, 6, 12, rot, BUILD.stationWalls]); }
      else if (kd === K.PORT) { boxes.push([x, y, z, 16, 2, 16, 0, 0x6a6a6a]); boxes.push([x - 3, y + 2, z, 3, 22, 3, 0, 0xd9a03c]); boxes.push([x + 2, y + 22, z, 16, 2, 2, 0, 0xd9a03c]); boxes.push([x + 4, y + 2, z + 4, 6, 5, 6, 0, 0x2f7fbf]); boxes.push([x + 4, y + 2, z - 4, 6, 5, 6, 0, 0xbf3f2f]); }
    }
    // ── участки вдоль улиц: настоящие лоты разной ширины/глубины, фасадом к улице
    if (detail >= 1 || BALANCE.render.farLots) { // A9: и вдали — простые коробки по участкам, повернутые фасадом к улице (не по сетке карты)
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
          const i = k % N, j = (k / N) | 0, kd = w.kind[k]; const rot = L.rot; const cr = Math.cos(rot), sr = Math.sin(rot); let yHi = -1e9, yLo2 = 1e9; for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const hx = u * L.w * 0.42, hz = v * L.d * 0.42; const hh = w.hAt(L.x + hx * cr + hz * sr, L.z - hx * sr + hz * cr); yHi = Math.max(yHi, hh); yLo2 = Math.min(yLo2, hh); } const y = yHi - 0.05; // E5: верхний угол пятна
          if (yHi - yLo2 > 0.3) boxes.push([L.x, yLo2 - 0.3, L.z, L.w * 0.86, yHi - yLo2 + 0.3, L.d * 0.86, rot, BUILD.plinth]); // цоколь
          const hv = h01(L.x, L.z), hv2 = h01(L.z, L.x + 7);
          const dist = (key: number) => hash2(Math.floor(i / 5), Math.floor(j / 5), key);
          const Lv = Math.max(1, Math.round(smoothL(i, j, kd) * 0.75 + w.bld[k] * 0.25) + (L.corner ? 1 : 0) + (hv < 0.15 ? -1 : hv > 0.88 ? 1 : 0));
          const cB = (arr: number[], key: number) => pick(arr, (dist(key) * 0.6 + hv2 * 0.4));
          const W = L.w, D = L.d;
          const cc = w.cities[w.cityOf[k] - 1] || w.cities[0]; const dn = cc ? Math.min(1, Math.hypot(L.x - cc.x, L.z - cc.z) / (cc.r * 0.45)) : 1; const grad = 1.35 - 0.75 * dn * dn; // пик в центре, спад к краю
          if (detail < 1) { const hgt = L.cls === 'ind' ? 6 + Lv : L.cls === 'house' || L.cls === 'slum' ? 3.4 : Math.min(60, Lv * 3 + 1); boxes.push([L.x, y, L.z, W * 0.9, hgt, D * 0.9, rot, distCol(kd, i, j, smoothL(i, j, kd))]); continue; }
          if (this.themesOn && L.cls !== 'slum' && L.cls !== 'ind') { // этап H: темы Дезигнера по участку
            const th = lotTheme(w, L.x, L.z, L.cls); const dens = Math.max(0, Math.min(1, L.cls === 'house' ? hv : L.cls === 'tower' || L.cls === 'office' ? (Lv * grad - 4) / 26 : (Lv - 1) / 8));
            const r = themedForLot(th, L.cls, W, D, dens, L.cls === 'panel' && dist(11) > 0.4);
            if (r) { const fs = BALANCE.themes.floorStep; const opts = { theme: r.theme, kind: r.kind, width: r.dims.w, depth: r.dims.d, floors: Math.max(1, Math.round(r.dims.floors / fs) * fs), seed: Math.floor(hv2 * 4), neutral: true, detail: detail >= 2 && !(r.theme === 'base' && String(r.kind).includes('office')) ? 1 : 0, lit: 0.5 };
              const ox = L.x + Math.sin(rot) * r.offsetZ, oz = L.z + Math.cos(rot) * r.offsetZ; addM('themed#' + JSON.stringify(opts), [ox, y, oz, 1, 1, 1, rot, wallColor(r.theme, hv2, cB(BUILD.midWalls, 4))]); this.themeStats[r.theme] = (this.themeStats[r.theme] || 0) + 1; continue; }
            this.themeStats.legacy = (this.themeStats.legacy || 0) + 1;
          }
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
    if (detail === 0) { const m = this.buildFarMass(farT, farG, farC, i0, j0); if (m) { this.scene.add(m); ch.blds.push(m); } }
    mk(this.geoBox, boxes, true); mk(this.geoRoof, roofs, true); mk(this.geoCyl, cyls, true);
    for (const [key, arr] of models) mk(this.modelGeo(key), arr, true, this.styledMat); // модели дизайнера — фирменный материал (окна ночью по glow)
  }
  buildFarMass(T: Float32Array, G: Float32Array, C: Uint32Array, i0: number, j0: number): THREE.Mesh | null {
    const P: number[] = [], Nn: number[] = [], Cl: number[] = []; const col = this.tmpC;
    const quad = (v: number[][], nx: number, ny: number, nz: number, c: number) => { col.setHex(c); for (const k of [0, 1, 2, 0, 2, 3]) { P.push(...v[k]); Nn.push(nx, ny, nz); Cl.push(col.r, col.g, col.b); } };
    const n = CHUNK; const at = (a: number, b: number) => (a < 0 || b < 0 || a >= n || b >= n) ? NaN : T[b * n + a];
    for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) {
      const k = b * n + a; const t = T[k]; if (Number.isNaN(t)) continue;
      // крыша: жадная полоса по x (одинаковые высота и цвет); начало полосы — только если слева другой
      if (!(a > 0 && T[k - 1] === t && C[k - 1] === C[k])) { let e = a; while (e + 1 < n && T[k + e + 1 - a] === t && C[k + e + 1 - a] === C[k]) e++;
        const x0 = (i0 + a) * TILE - 0.1, x1 = (i0 + e + 1) * TILE + 0.1, z0 = (j0 + b) * TILE - 0.1, z1 = (j0 + b + 1) * TILE + 0.1;
        quad([[x0, t, z0], [x0, t, z1], [x1, t, z1], [x1, t, z0]], 0, 1, 0, C[k]); }
      // стены только там, где сосед ниже (внутренние скрытые грани не рисуем); затемнение граней вместо освещения не нужно — Lambert
      const x0 = (i0 + a) * TILE, x1 = x0 + TILE, z0 = (j0 + b) * TILE, z1 = z0 + TILE; const g = G[k];
      const side = (nt: number, v: (lo: number) => number[][], nx: number, nz: number) => { const lo = Number.isNaN(nt) ? g : Math.max(g, nt); if (t - lo > 0.3) quad(v(lo), nx, 0, nz, C[k]); };
      side(at(a + 1, b), lo => [[x1, lo, z0], [x1, t, z0], [x1, t, z1], [x1, lo, z1]], 1, 0);
      side(at(a - 1, b), lo => [[x0, lo, z1], [x0, t, z1], [x0, t, z0], [x0, lo, z0]], -1, 0);
      side(at(a, b + 1), lo => [[x1, lo, z1], [x1, t, z1], [x0, t, z1], [x0, lo, z1]], 0, 1);
      side(at(a, b - 1), lo => [[x0, lo, z0], [x0, t, z0], [x1, t, z0], [x1, lo, z0]], 0, -1);
    }
    if (!P.length) return null;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(Cl, 3)); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.bldMat); m.receiveShadow = true; (m as any).dispose = () => geo.dispose(); return m;
  }
  modelGeo(key: string): THREE.BufferGeometry {
    try { return this.modelGeo0(key); } catch (e) { if (!this.warned) { this.warned = true; console.warn('design model failed, fallback box', key, e); } return this.geoBox; }
  }
  warned = false;
  modelGeo0(key: string): THREE.BufferGeometry {
    const [kind, v] = key.split('#'); const opts: any = { neutral: true };
    if (kind === 'themed') return this.lib.get({ type: 'themed', opts: JSON.parse(v) } as any, 0);
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
    for (const m of [ch.terrain, ch.roads, ch.marks, ch.bridges]) if (m) { this.scene.remove(m); m.geometry.dispose(); } this.dropLamps(ch);
    for (const o of ch.blds) { this.scene.remove(o); (o as THREE.InstancedMesh).dispose?.(); }
  }
  refreshAll() { for (const ch of this.chunks.values()) { this.world.dirtyTerrain.add(ch.id); this.world.dirtyRoads.add(ch.id); } this.buildOverview(); }
  refreshRoads() { for (const ch of this.chunks.values()) this.world.dirtyRoads.add(ch.id); }
  fogDay: THREE.Color | null = null; farEdges = -1; farBase = groundUniforms.uFar.value.clone(); farTint0 = groundUniforms.uFarTint.value;
  updateChunks() {
    const w = this.world; const cs = CHUNK * TILE; const tx = this.ctl.tx, tz = this.ctl.tz;
    const vd = Math.min(this.q.viewDist, Math.max(3000, this.ctl.dist * 3)); // этап A: дальше видно участки
    const want = new Map<number, number>();
    const r = Math.ceil(vd / cs); const ci = Math.floor(tx / cs), cj = Math.floor(tz / cs);
    for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
      if (a < 0 || b < 0 || a >= w.chunksN || b >= w.chunksN) continue; const d = Math.hypot((a + 0.5) * cs - tx, (b + 0.5) * cs - tz); if (d > vd + cs) continue; want.set(b * w.chunksN + a, d);
    }
    for (const [id, ch] of this.chunks) if (!want.has(id)) { this.disposeChunk(ch); this.chunks.delete(id); }
    if (w.dirtyRoads.size && w.net.edges.length !== this.farEdges) { this.farEdges = w.net.edges.length; this.buildFarRoads(); }
    const order = [...want.entries()].sort((p, q) => p[1] - q[1]);
    let budget = BALANCE.render.chunkOpsPerFrame; const t0 = performance.now(); let pend = 0;
    { /* QA4 п.1: после прыжка камеры ближние чанки сначала получают полотно дорог (раньше бюджет кадра съедали рельеф/дома — минуты «машины по траве» и диски узлов без дорог) */
      let rb = BALANCE.render.roadFirstOps; for (const [id, d] of order) { if (d > BALANCE.render.roadFirstM || rb <= 0) break; let ch = this.chunks.get(id); if (!ch) { ch = { id, tStep: 0, blds: [], bDetail: -1 }; this.chunks.set(id, ch); }
        if (!ch.roads || w.dirtyRoads.has(id)) { if (!ch.tStep) { this.buildTerrain(ch, 1); w.dirtyTerrain.delete(id); } ch.rStep = 1; this.buildRoads(ch); w.dirtyRoads.delete(id); rb--; } } } // QA2 п.2: бюджет кадра — не больше N операций и T мс; остальное в следующих кадрах (даль закрывает подложка)
    for (const [id, d] of order) {
      let ch = this.chunks.get(id); if (!ch) { ch = { id, tStep: 0, blds: [], bDetail: -1 }; this.chunks.set(id, ch); }
      // V10: LOD застройки/дорог считаем от КАМЕРЫ (3D), а не от точки прицела — иначе с высоты пригороды оставались в detail 1
      const cp = this.cam.position; const dc = Math.hypot((id % w.chunksN + 0.5) * cs - cp.x, cp.y, (Math.floor(id / w.chunksN) + 0.5) * cs - cp.z);
      const rs = dc < 1700 ? 1 : 2; const step = dc < 1500 ? 1 : dc < 3500 ? 2 : 4; // V11: шаг рельефа тоже от камеры
      const RB = BALANCE.render; const hy = ch.bDetail >= 0 ? RB.lodHyst : 0; // E2: гистерезис — дома не «переключаются» туда-сюда на границе LOD
      const det = d > this.q.bldDist ? -1 : dc < RB.lodNear + (ch.bDetail === 2 ? hy : -hy * 0) ? 2 : dc < RB.lodMid + (ch.bDetail >= 1 ? hy : 0) ? 1 : 0;
      if (performance.now() - t0 > BALANCE.render.chunkMsPerFrame && budget < BALANCE.render.chunkOpsPerFrame || budget <= 0) { if (ch.tStep !== step || ch.rStep !== rs || ch.bDetail !== det || !ch.roads) pend++; continue; }
      if ((ch.tStep !== step || w.dirtyTerrain.has(id)) && budget > 0) { this.buildTerrain(ch, step); w.dirtyTerrain.delete(id); budget--; }
      if ((!ch.roads || w.dirtyRoads.has(id) || ch.rStep !== rs) && budget > 0) { ch.rStep = rs; this.buildRoads(ch); w.dirtyRoads.delete(id); budget--; }
      if ((ch.bDetail !== det || w.dirtyBld.has(id) || ch.tStep !== step || ch.rStep !== rs) && budget <= 0) pend++;
      if ((ch.bDetail !== det || w.dirtyBld.has(id)) && budget > 0) { if (det < 0) { for (const o of ch.blds) { this.scene.remove(o); (o as any).dispose?.(); } ch.blds = []; ch.bDetail = -1; } else this.buildBuildings(ch, det); w.dirtyBld.delete(id); budget--; }
    }
    (window as any).chunkPending = pend;
  }
  dropLamps(ch: Chunk) { if (ch.lamps) { this.scene.remove(ch.lamps.group); ch.lamps.group.traverse(o => (o as any).geometry?.dispose()); ch.lamps = undefined; } if (ch.glow) { this.scene.remove(ch.glow); ch.glow.geometry.dispose(); ch.glow = undefined; } }
  glowMat(c: 'avenue' | 'highway') { let m = this.glowMats.get(c); if (!m) { m = createRoadGlowMaterial(c); this.glowMats.set(c, m); } return m; }
  /** D: кадр ночи — фонари/фары по LOD, дальность (затемнение издали, bloom), «ночное видение» при слое карты */
  nightFrame() {
    const n = this.night.value, d = this.ctl.dist; const NB = BALANCE.render as any;
    this.vision += ((this.overlay !== 'none' ? 1 : 0) - this.vision) * 0.2; nightUniforms.uVision.value = this.vision * Math.max(n, NB.visionDay ?? 0);
    nightUniforms.uLift.value *= 1; if (n > 0.5) setNightDistance(this.rig, d); else nightUniforms.uLift.value = 0;
    this.nightComp?.setDist(d); if (n > 0.5 && this.overlay !== 'traffic') { const RB = BALANCE.render; this.hemi.color.setHex(RB.nightHemiSky); this.hemi.groundColor.setHex(RB.nightHemiGround); this.hemi.intensity = Math.max(this.hemi.intensity, RB.nightHemiMin); } /* QA5 п.2: тёмно-синий ambient ночью */ { const on = THREE.MathUtils.smoothstep(n, 0.2, 0.7), RB = BALANCE.render; // QA4 п.3: даль ночью — тёмно-сине-зелёная, без чёрной дыры
      if (!this.fogDay) this.fogDay = groundUniforms.uFogCol.value.clone(); if (on > 0) { groundUniforms.uFogCol.value.copy(this.fogDay).lerp(new THREE.Color(RB.nightFarColor), on); groundUniforms.uFarTint.value = this.farTint0 + (RB.nightFarTint - this.farTint0) * on; } else { groundUniforms.uFogCol.value.copy(this.fogDay); groundUniforms.uFarTint.value = this.farTint0; } } if (this.waterMat) this.waterMat.uniforms.uNW.value = THREE.MathUtils.smoothstep(n, 0.2, 0.7);
    { const RB = BALANCE.render; const c = new THREE.Color(RB.nightGroundBlue); NIGHT_BLUE.value.set(c.r, c.g, c.b, this.overlay === 'traffic' ? 0 : THREE.MathUtils.smoothstep(n, 0.3, 0.8)); } /* QA6 п.3 */
    { const on = THREE.MathUtils.smoothstep(n, 0.2, 0.7), RB = BALANCE.render; /* QA3 №12/Степан: асфальт ночью светлее и холоднее земли, разметка читается */
      for (const [m, k] of [[this.roadMat, 1], [this.farMat, 1], [this.bridgeMat, 0.7], [this.marksMat, 1.6]] as [any, number][]) if (m && m.emissive) m.emissive.setHex(RB.nightRoadEmissive).multiplyScalar(on * k); }
    if (this.grassMat) { const gm = this.grassMat.uniforms as any; const k = 1 - BALANCE.render.grassNightDim * THREE.MathUtils.smoothstep(n, 0.2, 0.7); /* QA3: трава без освещения ночью «светилась» белыми крапинками */
      gm.uBase.value.set(GROUND_V5.bladeBase).multiplyScalar(k); gm.uTip.value.set(GROUND_V5.bladeTip).multiplyScalar(k); }
    for (const ch of this.chunks.values()) if (ch.lamps) { ch.lamps.update(n, d); ch.lamps.cones.visible = false; /* QA3 №12: пятна света на асфальте и вблизи */ { const u = (ch.lamps as any).u.dot; const on = THREE.MathUtils.smoothstep(n, 0.25, 0.7); u.uFade.value = Math.max(u.uFade.value, on * BALANCE.render.lampDotNear); } /* QA3 №12: цепочки фонарей видны и вблизи */ /* вблизи пятна под bloom читаются как шары в воздухе; */ /* конусы под bloom — пятна в воздухе; оставляем пятна на асфальте и плафоны */ }
    const v0 = this.vehMeshes[0], v1 = this.vehMeshes[1]; const on = n > 0.3 && d < 2600;
    if (on) { const a = this.carLights; const c0 = v0.count, c1 = v1.count; for (const o of [a.head, a.tail, a.beam]) { const arr = o.instanceMatrix.array as Float32Array; arr.set((v0.instanceMatrix.array as Float32Array).subarray(0, c0 * 16)); arr.set((v1.instanceMatrix.array as Float32Array).subarray(0, c1 * 16), c0 * 16); o.count = c0 + c1; o.instanceMatrix.needsUpdate = true; } }
    this.carLights.update(on ? n : 0, d);
  }
  // ---------- lighting ----------
  setTimeOfDay(hours: number) {
    const a = (hours - 6) / 12 * Math.PI; const sy = Math.sin(a);
    this.rig.setTime(hours); // P2: цвета неба/тумана/света, экспозиция, лавандовая тень — из scene-preset
    this.night.value = 1 - smooth(-0.1, 0.15, sy); styleUniforms.uNight.value = this.night.value * 0.85; if (this.night.value > 0.5) applyNightPreset(this.rig, this.renderer, this.scene); // D: пресет NIGHT_SPEC (луна, туман, экспозиция) // доля горящих окон ночью (lit моделей задаёт порог)
    const tx = this.ctl.tx, tz = this.ctl.tz; const R = 3000;
    this.sun.position.set(tx + Math.cos(a) * R, Math.max(200, sy * R), tz + R * 0.35);
    this.sun.target.position.set(tx, 0, tz);
    this.rig.sky.position.copy(this.cam.position); ((this.rig.sky.material as THREE.ShaderMaterial).uniforms.uSunDir.value as THREE.Vector3).set(Math.cos(a), Math.max(0.05, sy), 0.35).normalize();
    const sc = Math.min(1200, Math.max(150, this.ctl.dist * 0.8)); this.renderer.shadowMap.enabled = this.q.shadows && this.ctl.dist < 2200; /* тени только вблизи */ const cam = this.sun.shadow.camera;
    cam.left = -sc; cam.right = sc; cam.top = sc; cam.bottom = -sc; cam.near = 10; cam.far = R * 2.5; cam.updateProjectionMatrix();
    (this.scene.fog as THREE.Fog).near = Math.max(1500, this.ctl.dist * 2); /* QA2 п.9: даль без серой пелены */ { const U = groundUniforms.uFar.value; U.x = Math.max(this.farBase.x, this.ctl.dist * 1.6); U.y = Math.max(this.farBase.y, U.x * 3); U.z = this.farBase.z * 0.5; groundUniforms.uFarTint.value = this.farTint0 * 0.4; } groundUniforms.uTime.value = performance.now() / 1000; groundUniforms.uFogCol.value.copy((this.scene.fog as THREE.Fog).color); (this.scene.fog as THREE.Fog).far = Math.max(this.q.viewDist * 1.6, this.ctl.dist * 4);
  }
  /** C2 (USER_FEEDBACK_2, NIGHT_SPEC §8): слой загрузки — тёмная сцена + неоновая лента по дорогам, цвет по загрузке (design/night createTrafficNeonMaterial) */
  neon: THREE.Mesh | null = null; neonT = 0; neonMat: THREE.ShaderMaterial | null = null; dimSaved: number[] | null = null;
  neonFrame() {
    const on = this.overlay === 'traffic'; const now = performance.now();
    if (on && !this.dimSaved) { this.dimSaved = [this.hemi.intensity, this.sun.intensity]; this.hemi.intensity *= 0.35; this.sun.intensity *= 0.25; }
    if (!on && this.dimSaved) { this.hemi.intensity = this.dimSaved[0]; this.sun.intensity = this.dimSaved[1]; this.dimSaved = null; }
    if (!on) { if (this.neon) this.neon.visible = false; return; }
    nightUniforms.uTime.value = now / 1000;
    if (this.neon && now - this.neonT < 1000) { this.neon.visible = true; return; } this.neonT = now;
    const w = this.world, net = w.net; const R = Math.max(1500, this.ctl.dist * 2.5); const pos: number[] = [], uv: number[] = [], ld: number[] = [], idx: number[] = [];
    for (const e of net.edgesNear(this.ctl.tx, this.ctl.tz, R)) { const E = net.edges[e]; if (!E.alive || (E.lv || 0) < 0) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
      const hw = ROAD_TYPES[E.type].w * 0.42; const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const l = clamp(this.edgeLoad(e) / 1.1, 0, 1); const st = Math.max(1, Math.ceil(E.len / 24));
      const b0 = pos.length / 3; for (let s2 = 0; s2 <= st; s2++) { const t = s2 / st, x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t; const y = w.roadY(x, z) + w.edgeOff(e, E.len * t) + 0.35;
        pos.push(x - dz * hw, y, z + dx * hw, x + dz * hw, y, z - dx * hw); uv.push(E.len * t, 0, E.len * t, 1); ld.push(l, l); }
      for (let s2 = 0; s2 < st; s2++) { const p = b0 + s2 * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('load', new THREE.Float32BufferAttribute(ld, 1)); g.setIndex(idx);
    if (!this.neon) { this.neonMat = createTrafficNeonMaterial(); this.neon = new THREE.Mesh(g, this.neonMat); this.neon.frustumCulled = false; this.neon.renderOrder = 20; this.scene.add(this.neon); } else { this.neon.geometry.dispose(); this.neon.geometry = g; }
    this.neon.visible = true;
  }
  /** E6: поля воды в DataTexture N×N: flow.xy (м/с), глубина, расстояние до берега. Течение — вдоль берега (поворот ∇shore на 90°), быстрее в узких руслах; озёра и море — дрейф шейдера */
  waterMat: THREE.ShaderMaterial | null = null;
  makeWater(): THREE.ShaderMaterial {
    const w = this.world, N = w.N; const wet = new Uint8Array(N * N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) wet[j * N + i] = w.tileH(i, j) < 0 ? 1 : 0;
    const sh = shoreDistance(wet, N, TILE); const S = (i: number, j: number) => sh[clamp(j, 0, N - 1) * N + clamp(i, 0, N - 1)];
    const d = new Float32Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; const o = k * 4; if (!wet[k]) { d[o + 3] = 0; continue; }
      const gx = S(i + 1, j) - S(i - 1, j), gz = S(i, j + 1) - S(i, j - 1); let tx = -gz, tz = gx; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L; if (tx + 0.3 * tz < 0) { tx = -tx; tz = -tz; }
      const sd = sh[k]; const narrow = sd < 70 ? 1 : 0; const v = narrow * 0.9 * Math.min(1, sd / 12);
      d[o] = tx * v; d[o + 1] = tz * v; d[o + 2] = Math.max(0, -w.tileH(i, j)); d[o + 3] = sd - TILE * 0.5; }
    const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat, THREE.FloatType); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const m = createWaterMaterial(); m.uniforms.uField = { value: tex }; m.uniforms.uM = { value: w.M }; m.depthWrite = false; m.uniforms.uNW = { value: 0 }; m.uniforms.uWN = { value: BALANCE.render.nightWaterK }; // QA4 п.3: вода ночью темнее
    m.vertexShader = m.vertexShader.replace('attribute vec2 flow; attribute float depth; attribute float shore; varying vec2 vF; varying float vD, vS; varying vec3 vW;', 'varying vec3 vW;').replace('vF = flow; vD = depth; vS = shore; ', '');
    m.fragmentShader = m.fragmentShader.replace('varying vec2 vF; varying float vD, vS; varying vec3 vW;', 'uniform sampler2D uField; uniform float uM; varying vec3 vW; vec2 vF; float vD, vS;')
      .replace('gl_FragColor = vec4(col,', 'col *= mix(1., uWN, uNW); gl_FragColor = vec4(col,').replace('uniform sampler2D uField;', 'uniform sampler2D uField; uniform float uNW, uWN;')
      .replace('void main(){', 'void main(){ vec4 fld = texture2D(uField, vW.xz / uM); vF = fld.xy; vD = max(fld.z, 0.5); vS = max(fld.w, 0.); if (vW.x < 0. || vW.z < 0. || vW.x > uM || vW.z > uM) { vF = vec2(0.); vD = 6.; vS = 50.; }');
    this.waterMat = m; return m;
  }
  /** E1 (v5 ч.3): трава (пучки) и кусты вокруг камеры; пересев при сдвиге, маска исключает дороги, дома, воду */
  grass: THREE.InstancedMesh | null = null; bush: THREE.InstancedMesh | null = null; grassMat: THREE.ShaderMaterial | null = null; bushMat: THREE.MeshLambertMaterial | null = null; grassAt = { x: 1e9, z: 1e9, b: 0 };
  groundMask = (x: number, z: number): 'meadow' | 'yard' | 'park' | 'roadside' | null => {
    const w = this.world; const i = Math.floor(x / TILE), j = Math.floor(z / TILE); if (i < 0 || j < 0 || i >= w.N || j >= w.N) return null; const k = j * w.N + i;
    if (w.hAt(x, z) < 0.3) return null; const kd = w.kind[k]; if (kd === K.PARK) return 'park'; if (w.road[k]) return w.cityOf[k] ? null : 'roadside'; if (w.bld[k]) return kd === K.RES && w.style[k] === 0 ? 'yard' : null; if (kd === K.EXTRACT) return null; return w.cityOf[k] ? 'yard' : 'meadow'; };
  groundFrame() {
    const cx = this.ctl.tx, cz = this.ctl.tz, d = this.ctl.dist; const on = d < 700 && this.q.shadows !== undefined;
    if (!this.grassMat) { this.grassMat = createGrassMaterial(); this.bushMat = createBushMaterial(); this.bushMat.color.setHex(0xffffff); /* цвет — instanceColor */
      this.grass = new THREE.InstancedMesh(createTuftGeometry(), this.grassMat, GRASS.maxInst); this.grass.frustumCulled = false; this.grass.count = 0; this.scene.add(this.grass);
      this.bush = new THREE.InstancedMesh(createBushGeometry(), this.bushMat, BUSH.maxInst); this.bush.frustumCulled = false; this.bush.count = 0; this.bush.castShadow = true; this.bush.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BUSH.maxInst * 3), 3); this.scene.add(this.bush); }
    this.grass!.visible = on && d < 260; this.bush!.visible = on; if (!on) return;
    tickGround(this.grassMat, this.bushMat!, performance.now() / 1000, this.cam.position);
    const ver = this.world.net.version + this.bldVer() + this.world.railVer * 7919;
    if (Math.hypot(cx - this.grassAt.x, cz - this.grassAt.z) < 40 && ver === this.grassAt.b) return; this.grassAt = { x: cx, z: cz, b: ver };
    const R = GRASS.fade; const hAt = (x: number, z: number) => this.world.hAt(x, z);
    const ms = scatterGrass(Math.floor((cx - R) / 8) * 8, Math.floor((cz - R) / 8) * 8, R * 2, this.groundMask, hAt, 7 + Math.floor(cx / 8) * 31 + Math.floor(cz / 8));
    ms.forEach((m, i) => this.grass!.setMatrixAt(i, m)); this.grass!.count = ms.length; this.grass!.instanceMatrix.needsUpdate = true;
    // кусты: джиттер-сетка по детерминированному хэшу клетки — не «прыгают» при пересеве
    const BR = 420, st = 9; let n = 0; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color(); const BC = GROUND_V5.bush as number[];
    for (let gz = Math.floor((cz - BR) / st); gz <= Math.floor((cz + BR) / st) && n < BUSH.maxInst; gz++) for (let gx = Math.floor((cx - BR) / st); gx <= Math.floor((cx + BR) / st) && n < BUSH.maxInst; gx++) {
      const hv = hash2(gx, gz, 501); const x = (gx + hash2(gx, gz, 502)) * st, z = (gz + hash2(gx, gz, 503)) * st; const t = this.groundMask(x, z); if (!t || t === 'roadside' || !this.world.treeFree(x, z)) continue;
      const dens = t === 'park' ? BUSH.density.park : t === 'yard' ? BUSH.density.yard : (this.world.resource[Math.floor(z / TILE) * this.world.N + Math.floor(x / TILE)] === RES.FOREST ? BUSH.density.forestEdge : BUSH.density.meadow); if (hv > dens * st * st) continue;
      const r = BUSH.r[0] + hash2(gx, gz, 504) * (BUSH.r[1] - BUSH.r[0]); q.setFromAxisAngle(up, hash2(gx, gz, 505) * 6.28); m4.compose(new THREE.Vector3(x, this.world.hAt(x, z) - 0.1, z), q, new THREE.Vector3(r, r, r)); this.bush!.setMatrixAt(n, m4);
      this.bush!.setColorAt(n, col.setHex(BC[Math.floor(hash2(gx, gz, 506) * BC.length) % BC.length])); n++; }
    this.bush!.count = n; this.bush!.instanceMatrix.needsUpdate = true; if (this.bush!.instanceColor) this.bush!.instanceColor.needsUpdate = true;
  }
  bldVer() { return (this.world as any).bldVer || 0; }
  render() { if (this.waterMat) this.waterMat.uniforms.uTime.value = performance.now() / 1000; this.groundFrame(); this.neonFrame(); this.rail?.frame(1 / 60); const cn = Math.min(40, Math.max(1, this.ctl.dist * 0.01)); if (Math.abs(this.cam.near - cn) > 0.2 * cn) { this.cam.near = cn; this.cam.far = Math.max(this.world.M * 3, this.q.viewDist * 2); this.cam.updateProjectionMatrix(); } /* этап A: ближняя плоскость от дистанции — точность глубины, нет мигания (z-fighting) на краю карты */ const lo = this.ctl.dist < 1800; this.vehMeshes[0].visible = this.vehMeshes[1].visible = lo; /* V11: легковые/грузовики с высоты — субпиксельные, не рисуем */ this.nightFrame(); if (this.night.value > 0.5 && this.nightComp && this.q.shadows) this.nightComp.composer.render(); else this.renderer.render(this.scene, this.cam); this.stats.tris = this.renderer.info.render.triangles; this.stats.calls = this.renderer.info.render.calls; }
}
