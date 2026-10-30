// v5 E6: вода — flow map по течению (двухфазная адвекция), процедурные нормали, пена у берега, цвет по глубине, отражение неба (френель).
// Вершинные атрибуты на сетке воды: flow (vec2, м/с), depth (м, >0), shore (м до берега).
import * as THREE from 'three';
import { GROUND } from './palette';
export const WATER = {
  shallow: 0x7cc4c8, deep: 0x2f6f8e, skyTop: 0xbcd6ec, skyHor: 0xeef3f6, foam: GROUND.foam,
  depthFull: 6, /* м: глубже — цвет deep */ foamWidth: 2.2, foamNoise: 0.45, flowScale: 0.35, /* масштаб волн 1/м */ cycle: 1.6, /* с, период фаз flow map */ normalAmp: 0.55, fresnelPow: 4, specPow: 90, still: 0.06, /* м/с мин. дрейф озёр */
};
const noise = /* glsl */`float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = .5, s = 0.; for(int k=0;k<4;k++){ s += a*vn(p); p = mat2(1.6,1.2,-1.2,1.6)*p; a *= .5; } return s; }
vec2 grad(vec2 p){ float e = .05; return vec2(fbm(p+vec2(e,0))-fbm(p-vec2(e,0)), fbm(p+vec2(0,e))-fbm(p-vec2(0,e)))/(2.*e); }`;
export function createWaterMaterial(): THREE.ShaderMaterial {
  const c = (h: number) => new THREE.Color(h);
  return new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, uShallow: { value: c(WATER.shallow) }, uDeep: { value: c(WATER.deep) }, uSkyT: { value: c(WATER.skyTop) }, uSkyH: { value: c(WATER.skyHor) }, uFoam: { value: c(WATER.foam) } },
    vertexShader: `attribute vec2 flow; attribute float depth; attribute float shore; varying vec2 vF; varying float vD, vS; varying vec3 vW;
      void main(){ vF = flow; vD = depth; vS = shore; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: noise + `uniform float uTime; uniform vec3 uSun, uShallow, uDeep, uSkyT, uSkyH, uFoam; varying vec2 vF; varying float vD, vS; varying vec3 vW;
      void main(){
        vec2 fl = vF; if (length(fl) < ${WATER.still.toFixed(3)}) fl = vec2(${WATER.still.toFixed(3)}, 0.);
        float T = ${WATER.cycle.toFixed(2)}; float p0 = fract(uTime / T), p1 = fract(uTime / T + .5); float wgt = abs(1. - 2. * p0);
        vec2 uv = vW.xz * ${WATER.flowScale.toFixed(2)};
        vec2 g = mix(grad(uv - fl * p0 * T * ${WATER.flowScale.toFixed(2)}), grad(uv + 3.7 - fl * p1 * T * ${WATER.flowScale.toFixed(2)}), 1. - wgt);
        float spd = clamp(length(fl) / 1.5, 0., 1.);
        vec3 n = normalize(vec3(-g.x * ${WATER.normalAmp.toFixed(2)} * (.4 + spd), 1., -g.y * ${WATER.normalAmp.toFixed(2)} * (.4 + spd)));
        vec3 v = normalize(cameraPosition - vW); float fr = pow(1. - max(dot(n, v), 0.), ${WATER.fresnelPow.toFixed(1)});
        vec3 r = reflect(-v, n); vec3 sky = mix(uSkyH, uSkyT, clamp(r.y, 0., 1.));
        vec3 body = mix(uShallow, uDeep, smoothstep(0., ${WATER.depthFull.toFixed(1)}, vD));
        vec3 col = mix(body, sky, .15 + .65 * fr) + pow(max(dot(r, uSun), 0.), ${WATER.specPow.toFixed(1)}) * .9;
        float fn = fbm(vW.xz * .6 - fl * uTime * .6); float foam = smoothstep(${WATER.foamWidth.toFixed(2)}, 0., vS + fn * ${WATER.foamNoise.toFixed(2)} * ${WATER.foamWidth.toFixed(2)});
        foam = max(foam, smoothstep(.75, .95, fn) * spd * .5); /* пена на быстрине */
        col = mix(col, uFoam, foam * .85);
        gl_FragColor = vec4(col, mix(.72, .95, smoothstep(0., 2., vD)));
      }` });
}
/** Поле течения для реки: касательная к осевой полилинии × скорость (быстрее на середине: v·(1 − (d/hw)²)). Для озёр — слабый вихрь от ветра + 0.06 м/с. */
export function riverFlowAt(x: number, z: number, axis: { x: number; z: number }[], halfW: number, speed: number): { flow: [number, number]; shore: number } {
  let best = 1e9, tx = 1, tz = 0;
  for (let i = 0; i + 1 < axis.length; i++) { const a = axis[i], b = axis[i + 1], dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2)); const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t); if (d < best) { best = d; const L = Math.sqrt(L2); tx = dx / L; tz = dz / L; } }
  const k = Math.max(0, 1 - (best / halfW) ** 2) * speed; return { flow: [tx * k, tz * k], shore: Math.max(0, halfW - best) };
}
/** Дистанция до берега для произвольной маски (озёра): 2-проходный chamfer-DT по тайловой сетке (3/4), затем билинейно в вершины. */
export function shoreDistance(wet: Uint8Array, N: number, tile: number): Float32Array {
  const D = new Float32Array(N * N); for (let k = 0; k < N * N; k++) D[k] = wet[k] ? 1e6 : 0;
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= N || j >= N ? 0 : D[j * N + i]);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; if (!D[k]) continue; D[k] = Math.min(D[k], at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4); }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; if (!D[k]) continue; D[k] = Math.min(D[k], at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4); }
  for (let k = 0; k < N * N; k++) D[k] = D[k] / 3 * tile; return D;
}
