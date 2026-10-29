/**
 * FIX_VISUALS §2 — материал земли «Пастила».
 *  1) groundSplatColor(): цвет вершины = взвешенная смесь покрытий (а не «цвет тайла»).
 *  2) blurVertexColors(): сглаживание границ покрытий на сетке вершин (убирает «блочность»).
 *  3) createGroundMaterial(): MeshLambertMaterial + onBeforeCompile:
 *     – процедурная деталь (2 октавы value-noise в мировых координатах, 0.45/м и 0.045/м), затухает к 1400 м;
 *     – береговой переход: мокрый песок до +0.9 м над водой, полоса пены −0.05…+0.35 м, анимированная;
 *     – дальний LOD: десатурация + потолок яркости + подмешивание цвета тумана с 900 до 4500 м.
 *  4) patchFarFade(material): тот же дальний LOD для зданий/деревьев (вдали не «белый шум»).
 * Работает с three r186, WebGL2. Не зависит от src/.
 */
import * as THREE from 'three';
import { GROUND } from './palette';

export type Surface = 'grass' | 'meadow' | 'forest' | 'field' | 'sand' | 'rock' | 'snow' | 'yard' | 'shoreSand';
const SURF: Record<Surface, THREE.Color> = {
  grass: new THREE.Color(GROUND.grass), meadow: new THREE.Color(GROUND.meadow), forest: new THREE.Color(GROUND.forestFloor),
  field: new THREE.Color(GROUND.field), sand: new THREE.Color(GROUND.sand), rock: new THREE.Color(GROUND.rock),
  snow: new THREE.Color(GROUND.snow), yard: new THREE.Color(GROUND.yard), shoreSand: new THREE.Color(GROUND.shoreSand),
};

/** Веса покрытий для точки по физическим признакам (h — высота над водой, slope — уклон 0..1, forest/fertile/urban — 0..1). */
export function surfaceWeights(h: number, slope: number, forest: number, fertile: number, urban: number): Partial<Record<Surface, number>> {
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const shore = 1 - ss(0.4, 2.2, h);                      // пляж/берег 0…2 м
  const rock = ss(0.35, 0.6, slope) + ss(90, 120, h);     // крутые склоны и высокогорье
  const snow = ss(125, 140, h);
  const rest = Math.max(0, 1 - shore - rock - snow);
  return {
    shoreSand: shore, rock: Math.min(1, rock), snow,
    forest: rest * forest * 0.85, field: rest * fertile * (1 - urban) * 0.8, yard: rest * urban * 0.35,
    grass: rest * (1 - Math.min(1, forest * 0.85 + fertile * 0.8 + urban * 0.6)) * 0.7, meadow: rest * 0.3,
  };
}
export function groundSplatColor(w: Partial<Record<Surface, number>>, out = new THREE.Color()): THREE.Color {
  let r = 0, g = 0, b = 0, s = 0;
  for (const k in w) { const v = w[k as Surface]!; if (v <= 0) continue; const c = SURF[k as Surface]; r += c.r * v; g += c.g * v; b += c.b * v; s += v; }
  return s > 0 ? out.setRGB(r / s, g / s, b / s) : out.copy(SURF.grass);
}

/** Box-blur 3×3 по сетке вершин (nx × nz, RGB). passes: GROUND.blurPasses[lod]. Края не трогаем (стыки чанков совпадают). */
export function blurVertexColors(col: Float32Array, nx: number, nz: number, passes = 1) {
  const tmp = new Float32Array(col.length);
  for (let p = 0; p < passes; p++) {
    tmp.set(col);
    for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) for (let c = 0; c < 3; c++) {
      let s = 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) s += tmp[((j + b) * nx + i + a) * 3 + c] * (a === 0 && b === 0 ? 4 : a === 0 || b === 0 ? 2 : 1);
      col[(j * nx + i) * 3 + c] = s / 16;
    }
  }
}

export const groundUniforms = {
  uTime: { value: 0 }, uWaterY: { value: 0 },
  uDetail: { value: new THREE.Vector4(GROUND.detail.amp, GROUND.detail.scaleFine, GROUND.detail.scaleCoarse, GROUND.detail.ampCoarse) },
  uDetailFade: { value: new THREE.Vector2(GROUND.detail.fadeNear, GROUND.detail.fadeFar) },
  uShore: { value: new THREE.Vector4(GROUND.shore.wetTop, GROUND.shore.foamLo, GROUND.shore.foamHi, GROUND.shore.foamSpeed) },
  uWet: { value: new THREE.Color(GROUND.sandWet) }, uFoam: { value: new THREE.Color(GROUND.foam) },
  uFar: { value: new THREE.Vector4(GROUND.far.start, GROUND.far.end, GROUND.far.desat, GROUND.far.maxLuma) },
  uFarTint: { value: GROUND.far.tintToFog }, uFogCol: { value: new THREE.Color(0xf3dccb) },
};

const NOISE = /* glsl */`
float gh(vec2 p){ p = fract(p*vec2(127.1,311.7)); p += dot(p, p+19.19); return fract(p.x*p.y); }
float gn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(gh(i),gh(i+vec2(1,0)),f.x), mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x), f.y); }`;
const FAR = /* glsl */`
vec3 farFade(vec3 c, float d){
  float t = smoothstep(uFar.x, uFar.y, d);
  float l = dot(c, vec3(.299,.587,.114));
  c = mix(c, vec3(l), t*uFar.z);                         // десатурация вдали
  c *= min(1., mix(1., uFar.w, t) / max(l, 1e-3));       // потолок яркости: белые фасады не «искрят»
  return mix(c, uFogCol, t*uFarTint);
}`;

function vary(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGWorld = (modelMatrix * vec4(transformed,1.)).xyz;\n#ifdef USE_INSTANCING\nvGWorld = (modelMatrix * instanceMatrix * vec4(transformed,1.)).xyz;\n#endif');
}

/** Материал земли. Требует атрибут color (splat-цвет + blur). Обновляйте groundUniforms.uTime и uFogCol каждый кадр. */
export function createGroundMaterial(params: THREE.MeshLambertMaterialParameters = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, groundUniforms); vary(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGWorld; uniform float uTime, uWaterY, uFarTint; uniform vec4 uDetail, uShore, uFar; uniform vec2 uDetailFade; uniform vec3 uWet, uFoam, uFogCol;
${NOISE}${FAR}`).replace('#include <color_fragment>', `#include <color_fragment>
{
  float d = distance(cameraPosition, vGWorld);
  float fade = 1. - smoothstep(uDetailFade.x, uDetailFade.y, d);
  vec2 p = vGWorld.xz;
  float n1 = gn(p*uDetail.y) + .5*gn(p*uDetail.y*2.3+7.1) - .75;     // мелкое «зерно» травы
  float n2 = gn(p*uDetail.z) - .5;                                   // крупные пятна-оттенки
  diffuseColor.rgb *= 1. + (n1*uDetail.x*1.3)*fade + n2*uDetail.w*(.4+.6*fade);
  // берег
  float hy = vGWorld.y - uWaterY;
  float wet = 1. - smoothstep(uShore.y, uShore.x, hy);
  diffuseColor.rgb = mix(diffuseColor.rgb, uWet, wet*.75);
  float foamN = gn(p*.35 + vec2(uTime*uShore.w, -uTime*uShore.w*.7));
  float band = smoothstep(uShore.y, uShore.y+.08, hy) * (1. - smoothstep(uShore.z-.15, uShore.z, hy));
  diffuseColor.rgb = mix(diffuseColor.rgb, uFoam, band * smoothstep(.25,.75, foamN + .2*sin(uTime*1.7 + p.x*.08)) * .75);
  diffuseColor.rgb = farFade(diffuseColor.rgb, d);
}`);
  };
  m.customProgramCacheKey = () => 'cs-ground-v1';
  return m;
}

/** Дальний LOD для любого Lambert/Standard материала (здания, деревья, транспорт). Не меняет вершины, только цвет. */
export function patchFarFade<T extends THREE.Material>(m: T): T {
  const prev = m.onBeforeCompile?.bind(m);
  m.onBeforeCompile = (shader, r) => {
    prev?.(shader, r);
    Object.assign(shader.uniforms, { uFar: groundUniforms.uFar, uFarTint: groundUniforms.uFarTint, uFogCol: groundUniforms.uFogCol });
    vary(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGWorld; uniform vec4 uFar; uniform float uFarTint; uniform vec3 uFogCol;
${FAR}`).replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = farFade(diffuseColor.rgb, distance(cameraPosition, vGWorld));`);
  };
  const k = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => (k ? k() : '') + '|farfade';
  return m;
}
