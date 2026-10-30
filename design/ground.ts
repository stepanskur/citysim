// v5 E1: трава и кусты — инстансинг, плотность по типу земли, ветер в вершинном шейдере.
import * as THREE from 'three';
import { GROUND_V5 } from './palette';
/** Плотности (шт/м²) и LOD. Трава — пучки (3 скрещенных треугольника, 9 верш.). */
export const GRASS = { tuftH: [0.35, 0.7], tuftW: 0.45, density: { meadow: 1.6, yard: 0.8, park: 1.2, roadside: 0.4 }, near: 90, fade: 140, maxInst: 60000, cell: 32 };
export const BUSH = { r: [0.7, 1.6], density: { meadow: 0.012, park: 0.03, yard: 0.02, forestEdge: 0.06 }, far: 600, maxInst: 6000 };
export const WIND = { dir: [0.8, 0.6] as [number, number], speed: 1.3, ampGrass: 0.12, ampBush: 0.035, gust: 0.025 };
export function createTuftGeometry(): THREE.BufferGeometry {
  const p: number[] = [];
  for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3, c = Math.cos(a) * GRASS.tuftW / 2, s = Math.sin(a) * GRASS.tuftW / 2; p.push(-c, 0, -s, c, 0, s, 0, 1, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('tip', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 1)); return g;
}
const windGLSL = /* glsl */`uniform float uTime; uniform vec2 uWind; uniform float uAmp; uniform vec3 uCam; uniform float uNear, uFade;
vec3 windOff(vec3 wp, float h){ float ph = dot(wp.xz, uWind) * 0.15 - uTime * ${WIND.speed.toFixed(2)}; float g = sin(ph) * 0.6 + sin(ph * 2.7 + wp.x * 0.05) * 0.4; return vec3(uWind.x, 0., uWind.y) * g * uAmp * h * h; }`;
export function createGrassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(...WIND.dir) }, uAmp: { value: WIND.ampGrass }, uCam: { value: new THREE.Vector3() }, uNear: { value: GRASS.near }, uFade: { value: GRASS.fade },
      uBase: { value: new THREE.Color(GROUND_V5.bladeBase) }, uTip: { value: new THREE.Color(GROUND_V5.bladeTip) } },
    vertexShader: windGLSL + `attribute float tip; varying float vT; varying float vF;
      void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.); float d = distance(wp.xz, uCam.xz); vF = 1. - smoothstep(uNear, uFade, d);
        wp.y -= (1. - vF) * 1.0; /* уход под землю вместо альфы — без сортировки */ wp.xyz += windOff(wp.xyz, tip); vT = tip; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 uBase, uTip; varying float vT; varying float vF; void main(){ gl_FragColor = vec4(mix(uBase, uTip, vT), 1.); }` });
}
/** Расстановка: blue-noise-ish джиттер-сетка; mask(x,z) → тип земли или null (дороги/дома/вода исключить маской). */
export function scatterGrass(x0: number, z0: number, size: number, mask: (x: number, z: number) => keyof typeof GRASS.density | null, hAt: (x: number, z: number) => number, seed = 1): THREE.Matrix4[] {
  const out: THREE.Matrix4[] = []; let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const step = 1 / Math.sqrt(GRASS.density.meadow); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let z = z0; z < z0 + size; z += step) for (let x = x0; x < x0 + size; x += step) {
    const px = x + rnd() * step, pz = z + rnd() * step; const t = mask(px, pz); if (!t || rnd() > GRASS.density[t] / GRASS.density.meadow) continue;
    const h = GRASS.tuftH[0] + rnd() * (GRASS.tuftH[1] - GRASS.tuftH[0]); q.setFromAxisAngle(up, rnd() * 6.283);
    out.push(m.clone().compose(new THREE.Vector3(px, hAt(px, pz) - 0.02, pz), q, new THREE.Vector3(1, h, 1))); if (out.length >= GRASS.maxInst) return out;
  }
  return out;
}
/** Куст: низкополигональная «подушка» (икосаэдр det 0, сплюснут 0.7), без подложки. */
export function createBushGeometry(): THREE.BufferGeometry { const g = new THREE.IcosahedronGeometry(1, 0); g.scale(1, 0.7, 1); g.translate(0, 0.45, 0); return g; }
export function createBushMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: GROUND_V5.bush[1], flatShading: true });
  m.onBeforeCompile = sh => { sh.uniforms.uTime = { value: 0 }; m.userData.sh = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 wq = modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.); transformed.xz += vec2(${WIND.dir[0]}, ${WIND.dir[1]}) * sin(dot(wq.xz, vec2(.13,.11)) - uTime * ${WIND.speed}) * ${WIND.ampBush} * max(position.y, 0.) * 3.;`); };
  return m;
}
export function tickGround(grass: THREE.ShaderMaterial, bush: THREE.Material, t: number, cam: THREE.Vector3) { grass.uniforms.uTime.value = t; grass.uniforms.uCam.value.copy(cam); const sh = (bush as any).userData.sh; if (sh) sh.uniforms.uTime.value = t; }
