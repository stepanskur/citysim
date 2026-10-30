/**
 * v5 Ночной стиль (NIGHT_SPEC.md): пресет сцены, фонари (модель, расстановка, инстансинг, пятна света, конусы),
 * фары/габариты машин, неон магистралей, вид «из космоса» (точки огней + bloom), «ночное видение» слоёв карты,
 * читаемость для стройки (подъём земли, курсор, сетка). Цвета — palette.ts → NIGHT.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { NIGHT } from './palette';
import { GeoBuilder, hex } from './models/builder';
import { P, arcLengths, sampleAt, offsetPolyline, RoadClass, CURVED_PROFILES } from './road-curves';
import type { SceneRig } from './scene-preset';

// ───────────────────────────── 1. Правила расстановки фонарей ─────────────────────────────
/** step — шаг вдоль оси (м), h — высота светоточки, arm — вылет кронштейна, layout — схема, light — тип лампы,
 *  pool — радиус светового пятна на асфальте (м), cone — показывать конус вблизи. Отступ опоры: 0.6 м за бордюр. */
export const LAMP_RULES: Record<RoadClass, { step: number; h: number; arm: number; layout: 'median' | 'both' | 'stagger' | 'single'; light: 'sodium' | 'led' | 'cold'; pool: number; cone: boolean }> = {
  highway: { step: 42, h: 12, arm: 2.2, layout: 'median', light: 'sodium', pool: 14, cone: true },
  avenue:  { step: 32, h: 10, arm: 1.8, layout: 'both',   light: 'led',    pool: 11, cone: true },
  street:  { step: 28, h: 8,  arm: 1.4, layout: 'stagger', light: 'sodium', pool: 9,  cone: true },
  lane:    { step: 30, h: 6,  arm: 0.9, layout: 'single', light: 'sodium', pool: 7,  cone: false },
};
/** Отступ от перекрёстка: первый фонарь не ближе 6 м к краю площадки; на площадке перекрёстка — 1 фонарь на угол (≥ avenue). */
export const LAMP_JOINT = { clear: 6, cornerLampFrom: 'avenue' as RoadClass };
export interface Lamp { x: number; z: number; ax: number; az: number; h: number; arm: number; light: 'sodium' | 'led' | 'cold'; pool: number; double?: boolean }

/** Фонари вдоль оси дороги (center — та же ось, что у buildCurvedRoad). Детерминированно. */
export function placeStreetLamps(center: P[], cls: RoadClass, opts: { trimStart?: number; trimEnd?: number } = {}): Lamp[] {
  const R = LAMP_RULES[cls], pr = CURVED_PROFILES[cls], S = arcLengths(center), L = S[S.length - 1];
  const off = pr.halfAsphalt + pr.curb + 0.6, out: Lamp[] = [];
  const s0 = (opts.trimStart ?? 0) + LAMP_JOINT.clear, s1 = L - (opts.trimEnd ?? 0) - LAMP_JOINT.clear; let k = 0;
  for (let s = s0 + R.step / 2; s <= s1; s += R.step, k++) {
    const { p, t } = sampleAt(center, S, s); const n = { x: -t.z, z: t.x };
    const put = (side: number, dbl = false) => out.push({ x: p.x + n.x * off * side * (dbl ? 0 : 1), z: p.z + n.z * off * side * (dbl ? 0 : 1), ax: -n.x * side, az: -n.z * side, h: R.h, arm: R.arm, light: R.light, pool: R.pool, double: dbl });
    if (R.layout === 'median') put(1, true);
    else if (R.layout === 'both') { put(1); put(-1); }
    else if (R.layout === 'stagger') put(k % 2 ? 1 : -1);
    else put(1);
  }
  return out;
}

// ───────────────────────────── 2. Модель фонаря ─────────────────────────────
/** Опора: конусная труба Ø0.18→0.11, кронштейн, плафон (glow=1 — светится ночью через styled material).
 *  Геометрия в единичном масштабе высоты h, кронштейн по +Z. double — Т-образная (для разделительной). */
export function createStreetLampGeometry(h = 8, arm = 1.4, double = false): THREE.BufferGeometry {
  const b = new GeoBuilder(); b.ao = 0.08; b.aoHeight = 1.5; const pole = hex(0x3a3f52), shade = hex(0x2b2f45);
  b.box(0, 0, 0, 0.32, 0.5, 0.32, hex(0x6a6f80));           // фундамент-стакан
  b.cyl(0, 0.5, 0, 0.09, 0.055, h - 0.5, 6, pole);
  for (const s of double ? [1, -1] : [1]) {
    b.box(0, h - 0.05, s * arm / 2, 0.08, 0.08, arm, pole);
    b.box(0, h - 0.12, s * arm, 0.34, 0.14, 0.62, shade);    // корпус
    b.glow = 0.01; b.box(0, h - 0.16, s * arm, 0.28, 0.03, 0.54, hex(NIGHT.lamp.led)); b.glow = 0; // рассеиватель (горит при uNight>0.01)
  }
  return b.build();
}

// ───────────────────────────── 3. Набор фонарей: инстансинг + LOD ─────────────────────────────
const poolVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`;
/** Пятно: мягкий диск 1−r² с лёгким «эллипсом» вдоль дороги; аддитивно, depthWrite=false, polygonOffset −4. */
const poolFS = `uniform vec3 uCol; uniform float uI; uniform float uFade; varying vec2 vUv;
  void main(){ vec2 d = vUv*2.0-1.0; float r = dot(d,d); float a = pow(max(0.0,1.0-r),2.2) * uI * uFade; if(a<0.003) discard; gl_FragColor = vec4(uCol*a, 1.0); }`;
const coneFS = `uniform vec3 uCol; uniform float uI; uniform float uFade; varying vec2 vUv;
  void main(){ float a = (1.0 - vUv.y) * (0.35 + 0.65*vUv.y) * uI * uFade; gl_FragColor = vec4(uCol*a,1.0); }`;
const dotVS = `attribute vec3 col; varying vec3 vC; uniform float uPx; uniform float uScale;
  void main(){ vC = col; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uScale * 2600.0 / -mv.z, 2.0, uPx); }`;
const dotFS = `varying vec3 vC; uniform float uI; uniform float uFade;
  void main(){ vec2 d = gl_PointCoord*2.0-1.0; float a = exp(-dot(d,d)*3.0) * uFade; if(a<0.01) discard; gl_FragColor = vec4(vC*uI*a,1.0); }`;
const add = (u: Record<string, any>, vs: string, fs: string) => new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });

/** Пороги LOD огней (м до камеры по высоте/дистанции орбиты). Плавное затухание на 20 % ширины. */
export const LIGHT_LOD = { cone: 260, pole: 700, pool: 4000, dotFrom: 450, carLights: 900, carDots: 2600 };
const fade = (d: number, far: number) => 1 - THREE.MathUtils.smoothstep(d, far * 0.8, far);

export class StreetLampSet {
  readonly group = new THREE.Group(); poles: THREE.InstancedMesh; pools: THREE.InstancedMesh; cones: THREE.InstancedMesh; dots: THREE.Points;
  private u = { pool: { uCol: { value: new THREE.Color(NIGHT.lamp.pool) }, uI: { value: NIGHT.intensity.pool }, uFade: { value: 1 } }, cone: { uCol: { value: new THREE.Color(NIGHT.lamp.pool) }, uI: { value: NIGHT.intensity.cone }, uFade: { value: 1 } }, dot: { uI: { value: NIGHT.intensity.spaceDot }, uFade: { value: 0 }, uPx: { value: 4 }, uScale: { value: 1 } } };
  /** poleMat — общий styled material (createStyledMaterial), чтобы плафоны горели по uNight. */
  constructor(lamps: Lamp[], poleMat: THREE.Material, y = 0) {
    const n = lamps.length, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const pg = createStreetLampGeometry(1, 1);
    // одна геометрия на все высоты: масштаб (h/8 по Y, arm по Z) — опоры одинаковой пропорции; double — отдельный набор не нужен для превью
    this.poles = new THREE.InstancedMesh(createStreetLampGeometry(8, 1.4), poleMat, n); void pg;
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), add(this.u.pool, poolVS, poolFS), n);
    const cg = new THREE.CylinderGeometry(0.25, 1, 1, 12, 1, true).translate(0, -0.5, 0); // вершина вверху (y=0), низ y=−1
    const cuv = cg.getAttribute('uv'); for (let i = 0; i < cuv.count; i++) cuv.setY(i, 1 - cuv.getY(i)); // vUv.y: 0 у лампы → 1 у земли
    this.cones = new THREE.InstancedMesh(cg, add(this.u.cone, poolVS, coneFS), n); (this.cones.material as THREE.ShaderMaterial).side = THREE.DoubleSide; (this.cones.material as THREE.ShaderMaterial).polygonOffset = false;
    const dp: number[] = [], dc: number[] = [];
    lamps.forEach((l, i) => {
      const ang = Math.atan2(l.ax, l.az); Q.setFromAxisAngle(up, ang);
      M.compose(V.set(l.x, y, l.z), Q, S.set(1, l.h / 8, l.arm / 1.4)); this.poles.setMatrixAt(i, M);
      const hx = l.x + l.ax * l.arm, hz = l.z + l.az * l.arm;
      M.compose(V.set(hx + l.ax * l.pool * 0.15, y + 0.04, hz + l.az * l.pool * 0.15), Q, S.set(l.pool * 0.85 * 0.55, 1, l.pool * 0.55)); /* QA9 п.1: пятно меньше */ this.pools.setMatrixAt(i, M);
      M.compose(V.set(hx, y + l.h - 0.2, hz), new THREE.Quaternion(), S.set(l.pool * 0.55, l.h - 0.2, l.pool * 0.55)); this.cones.setMatrixAt(i, M);
      const c = new THREE.Color(NIGHT.lamp[l.light]); dp.push(hx, y + l.h, hz); dc.push(c.r, c.g, c.b);
    });
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); dg.setAttribute('col', new THREE.Float32BufferAttribute(dc, 3));
    this.dots = new THREE.Points(dg, add(this.u.dot, dotVS, dotFS)); (this.dots.material as THREE.ShaderMaterial).polygonOffset = false;
    this.poles.castShadow = false; this.poles.receiveShadow = true; this.pools.renderOrder = 3; this.cones.renderOrder = 4; this.dots.renderOrder = 5;
    for (const o of [this.poles, this.pools, this.cones, this.dots]) { o.frustumCulled = false; this.group.add(o); }
  }
  /** night 0..1 (uNight), dist — дистанция камеры до цели. Вызывать раз в кадр. */
  update(night: number, dist: number) {
    const on = THREE.MathUtils.smoothstep(night, 0.25, 0.7);
    this.u.pool.uFade.value = on * fade(dist, LIGHT_LOD.pool) * (1 - 0.75 * THREE.MathUtils.smoothstep(dist, 150, 700)) /* QA9 п.1: издали пятна гаснут, а не ярче */ * (1 - 0.85 * nightUniforms.uVision.value); // издали пятна чуть ярче; в слоях — приглушены // издали пятна ярче → «сетка огней» this.u.cone.uFade.value = on * fade(dist, LIGHT_LOD.cone) * (1 - nightUniforms.uVision.value);
    this.u.dot.uFade.value = on * THREE.MathUtils.smoothstep(dist, LIGHT_LOD.dotFrom * 0.7, LIGHT_LOD.dotFrom);
    this.u.dot.uScale.value = 1; this.poles.visible = dist < LIGHT_LOD.pole; this.cones.visible = this.u.cone.uFade.value > 0.01; this.pools.visible = this.u.pool.uFade.value > 0.01;
  }
}

// ───────────────────────────── 4. Фары и габариты ─────────────────────────────
/** Пара фар (передний свес машины, local +Z — вперёд) и пара габаритов; длина L, ширина W. Одна геометрия «огни машины». */
export function createCarLightsGeometry(L = 4.4, W = 1.8, h = 0.62) {
  const b = new GeoBuilder(); b.ao = 0;
  for (const s of [-1, 1]) { b.box(s * (W / 2 - 0.25), h, L / 2 + 0.01, 0.34, 0.14, 0.04, [1, 1, 1]); }
  const head = b.build(); const t = new GeoBuilder(); t.ao = 0;
  for (const s of [-1, 1]) t.box(s * (W / 2 - 0.2), h + 0.05, -L / 2 - 0.01, 0.3, 0.12, 0.04, [1, 1, 1]);
  return { head, tail: t.build() };
}
/** Луч фар на асфальте: вытянутый аддитивный эллипс 3.2×11 м перед машиной (только LOD < 250 м). */
export function createHeadBeamGeometry() { return new THREE.PlaneGeometry(3.2, 11).rotateX(-Math.PI / 2).translate(0, 0.05, 2.2 + 5.5); }
export class CarLightSet {
  head: THREE.InstancedMesh; tail: THREE.InstancedMesh; beam: THREE.InstancedMesh; readonly group = new THREE.Group();
  private bu = { uCol: { value: new THREE.Color(NIGHT.lamp.head) }, uI: { value: 0.55 }, uFade: { value: 1 } };
  constructor(max: number) {
    const g = createCarLightsGeometry(); const hm = new THREE.MeshBasicMaterial({ color: new THREE.Color(NIGHT.lamp.head).multiplyScalar(NIGHT.intensity.carHead), toneMapped: false });
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(NIGHT.lamp.tail).multiplyScalar(NIGHT.intensity.carTail), toneMapped: false });
    this.head = new THREE.InstancedMesh(g.head, hm, max); this.tail = new THREE.InstancedMesh(g.tail, tm, max);
    this.beam = new THREE.InstancedMesh(createHeadBeamGeometry(), add(this.bu, poolVS, poolFS), max); this.beam.renderOrder = 3;
    for (const o of [this.head, this.tail, this.beam]) { o.frustumCulled = false; o.count = 0; this.group.add(o); }
  }
  /** Те же матрицы, что у InstancedMesh машин (копировать после обновления трафика). brake — индексы тормозящих (красный ярче через setColorAt). */
  sync(src: THREE.InstancedMesh, n = src.count) { for (const o of [this.head, this.tail, this.beam]) { (o.instanceMatrix.array as Float32Array).set((src.instanceMatrix.array as Float32Array).subarray(0, n * 16)); o.count = n; o.instanceMatrix.needsUpdate = true; } }
  update(night: number, dist: number) { const on = night > 0.3; this.head.visible = this.tail.visible = on && dist < LIGHT_LOD.carDots; this.beam.visible = on && dist < 250; this.bu.uFade.value = fade(dist, 250); }
}

// ───────────────────────────── 5. Неон магистралей (вид издали) ─────────────────────────────
/** Светящаяся полоса по оси магистрали (2 полосы по краям проезжей части). Видна с dist > 400, цвет — lamp.sodium (шоссе) / led (проспект). */
export function buildRoadGlowStrip(center: P[], cls: RoadClass, y = 0.06): THREE.BufferGeometry {
  const half = CURVED_PROFILES[cls].halfAsphalt, pos: number[] = [], uv: number[] = [];
  for (const s of [1, -1]) { const a = offsetPolyline(center, s * (half - 1)), b = offsetPolyline(center, s * (half - 3.2)), S = arcLengths(a);
    for (let i = 0; i < a.length - 1; i++) { pos.push(a[i].x, y, a[i].z, b[i].x, y, b[i].z, a[i + 1].x, y, a[i + 1].z, a[i + 1].x, y, a[i + 1].z, b[i].x, y, b[i].z, b[i + 1].x, y, b[i + 1].z);
      uv.push(S[i], 0, S[i], 1, S[i + 1], 0, S[i + 1], 0, S[i], 1, S[i + 1], 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return g;
}
export const nightUniforms = { uFar: { value: 0 }, uTime: { value: 0 }, uVision: { value: 0 }, uLift: { value: NIGHT.scene.groundLift } };
/** Материал неона: бегущие «огни машин» по длине дуги (uv.x, период 18 м), яркость растёт с дистанцией (uFar). */
export function createRoadGlowMaterial(cls: RoadClass) {
  const c = new THREE.Color(cls === 'highway' ? NIGHT.lamp.sodium : NIGHT.lamp.led);
  return new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { ...nightUniforms, uCol: { value: c }, uI: { value: NIGHT.intensity.highwayNeon } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uCol; uniform float uI, uFar, uTime, uVision; varying vec2 vUv;
      void main(){ float edge = 1.0 - abs(vUv.y*2.0-1.0); float run = 0.55 + 0.45*smoothstep(0.6,1.0, fract(vUv.x/18.0 - uTime*0.9));
        float a = edge*edge * run * uI * uFar * (1.0 - uVision); if(a<0.004) discard; gl_FragColor = vec4(uCol*a,1.0); }` });
}

// ───────────────────────────── 6. Пресет сцены ─────────────────────────────
/** Ночь, в которой можно строить: небо/туман из NIGHT.scene, «лунный» хеми 1.05, экспозиция 1.25. Вызывать после rig.setTime('night'). */
export function applyNightPreset(rig: SceneRig, renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const N = NIGHT.scene; rig.setTime('night');
  rig.hemi.color.set(N.hemiSky); rig.hemi.groundColor.set(N.hemiGround); rig.hemi.intensity = N.hemiI;
  rig.sun.color.set(N.moon); rig.sun.intensity = N.moonI; renderer.toneMappingExposure = N.exposure;
  (scene.fog as THREE.Fog).color.set(N.fog); const su = (rig.sky.material as THREE.ShaderMaterial).uniforms; su.uZenith.value.set(N.zenith); su.uHorizon.value.set(N.horizon); su.uSun.value.set(0x000000);
  rig.uniforms.uNight.value = 1;
}
/** Издали сцена темнеет (хеми ×farHemi), а огни ярчают — силуэт города рисуют огни. Вызывать при смене дистанции камеры. */
export function setNightDistance(rig: SceneRig, d: number) {
  const N = NIGHT.scene, k = THREE.MathUtils.smoothstep(d, N.farFrom, N.farTo);
  rig.hemi.intensity = N.hemiI * (1 - k * (1 - N.farHemi)); rig.sun.intensity = N.moonI * (1 - k * 0.7); nightUniforms.uLift.value = N.groundLift * (1 - k * 0.6);
}
/** Подъём земли/фасадов: outgoing = max(outgoing, albedo·uLift) — чтобы зоны/рельеф/дороги читались (строить можно). */
export function patchNightReadable<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { prev?.call(m, sh, r); Object.assign(sh.uniforms, nightUniforms);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLift; uniform float uVision;')
      .replace('#include <opaque_fragment>', `outgoingLight = max(outgoingLight, diffuseColor.rgb * uLift);
      // «ночное видение»: монохромный сине-стальной тон + подсветка верхних граней (читаемость форм)
      { float l = dot(outgoingLight, vec3(0.3,0.59,0.11)); vec3 v = mix(vec3(${c3(NIGHT.vision.base)}), vec3(${c3(NIGHT.vision.baseHi)}), clamp(l*1.6,0.0,1.0));
        v += vec3(${c3(NIGHT.vision.buildingsEdge)}) * 0.35 * smoothstep(0.6,1.0, normal.y);
        outgoingLight = mix(outgoingLight, v, uVision); }
      #include <opaque_fragment>`); };
  const pk = m.customProgramCacheKey.bind(m); m.customProgramCacheKey = () => pk() + '|night'; return m;
}
function c3(h: number) { const c = new THREE.Color(h); return `${c.r.toFixed(3)},${c.g.toFixed(3)},${c.b.toFixed(3)}`; }

// ───────────────────────────── 7. Bloom ─────────────────────────────
/** Композер: Render → UnrealBloom (threshold 0.82, только HDR-источники) → Output. Сила растёт с высотой камеры до farStrength. */
export function createNightComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const size = renderer.getSize(new THREE.Vector2()); const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera)); const B = NIGHT.bloom;
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), B.strength, B.radius, B.threshold); composer.addPass(bloom); composer.addPass(new OutputPass());
  return { composer, bloom, setDist(d: number) { const k = THREE.MathUtils.smoothstep(d, 300, 1500); bloom.strength = B.strength + (B.farStrength - B.strength) * k; nightUniforms.uFar.value = THREE.MathUtils.smoothstep(d, 250, 900); } };
}

// ───────────────────────────── 8. «Ночное видение» слоёв карты ─────────────────────────────
export type MapLayer = 'none' | 'traffic' | 'zones' | 'landValue' | 'noise' | 'coverage';
/** Неоновая лента загрузки: ширина = ширина проезжей части, цвет по load 0..1 (NIGHT.vision.traffic), поток бежит по направлению. */
export function createTrafficNeonMaterial() {
  const ramp = NIGHT.vision.traffic.map(h => new THREE.Color(h));
  return new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { ...nightUniforms, uRamp: { value: ramp } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    vertexShader: 'attribute float load; varying float vL; varying vec2 vUv; void main(){ vL=load; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uRamp[5]; uniform float uTime; varying float vL; varying vec2 vUv;
      vec3 ramp(float t){ t=clamp(t,0.0,1.0)*4.0; int i=int(floor(t)); float f=fract(t); vec3 a=uRamp[0],b=uRamp[1];
        if(i==1){a=uRamp[1];b=uRamp[2];} else if(i==2){a=uRamp[2];b=uRamp[3];} else if(i>=3){a=uRamp[3];b=uRamp[4];} return mix(a,b,i>=4?1.0:f); }
      void main(){ float edge = 1.0-abs(vUv.y*2.0-1.0); float core = smoothstep(0.0,0.5,edge);
        float flow = 0.6+0.4*smoothstep(0.7,1.0,fract(vUv.x/12.0 - uTime*(1.4-vL)));     // забитые дороги «ползут»
        gl_FragColor = vec4(ramp(vL) * (0.18+0.75*core) * flow * (0.7+0.5*vL), 1.0); }` });
}
/** Зоны: заливка лота альфа 0.28 + контур 0.6 м яркостью ×2.2 (vision.zones). Цвет — instanceColor. */
export function createZoneNeonMaterial() {
  return new THREE.ShaderMaterial({ side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5,
    uniforms: { uSize: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vC; varying vec2 vS; void main(){ vUv=uv; vC=instanceColor; vS=vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[2].xyz)); gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; varying vec3 vC; varying vec2 vS;
      void main(){ vec2 m = min(vUv, 1.0-vUv) * vS; float e = 1.0 - smoothstep(0.3, 0.9, min(m.x,m.y)); gl_FragColor = vec4(vC * (0.22 + e*2.2), 1.0); }` });
}
/** Состояние слоя: vision 0→1 за 250 мс (ease-out), остальное (неон/зоны) появляется со сдвигом 120 мс. */
export const LAYER_TRANSITION = { ms: 250, overlayDelayMs: 120, ease: 'cubic-bezier(.2,.8,.2,1)' };

// ───────────────────────────── 9. Стройка ночью ─────────────────────────────
/** Курсор-кольцо и сетка стройки: аддитивные, toneMapped=false — читаются и днём (×0.6), и ночью (×1.0). */
export function createBuildGridMaterial(cell = 8) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, uniforms: { uCell: { value: cell }, uCol: { value: new THREE.Color(NIGHT.build.grid) }, uA: { value: NIGHT.build.gridAlpha }, uCenter: { value: new THREE.Vector2() }, uR: { value: 120 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: `uniform float uCell, uA, uR; uniform vec3 uCol; uniform vec2 uCenter; varying vec3 vW;
      void main(){ vec2 g = abs(fract(vW.xz/uCell - 0.5) - 0.5) / fwidth(vW.xz/uCell); float l = 1.0 - min(min(g.x,g.y),1.0);
        float r = 1.0 - smoothstep(uR*0.6, uR, distance(vW.xz, uCenter)); gl_FragColor = vec4(uCol, l*uA*r); }` });
}
export function createCursorRing(r = 6): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.5, r, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(NIGHT.build.cursor).multiplyScalar(2), toneMapped: false, transparent: true, opacity: 0.95, depthTest: false }));
  m.renderOrder = 10; return m;
}
