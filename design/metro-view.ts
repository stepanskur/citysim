/**
 * Режим метро «рентген»: поверхность приглушается и становится полупрозрачной, подземные объекты
 * (тоннели, станции, поезда) рисуются ПОСЛЕ неё с depthTest=false и fresnel‑кромкой — видны сквозь землю.
 *
 * Порядок отрисовки (renderOrder):
 *   0  — обычный мир (в режиме: dim‑униформ, опасити 1, depthWrite true)
 *   10 — terrain «стекло»: opacity 0.35, depthWrite false, цвет * 0.45 + lavender*0.2
 *   20 — подземные тела: MetroXRayMaterial (opacity 0.85, depthTest false, depthWrite false, side Front)
 *   21 — кромки: тот же материал с uEdgeOnly=1 (fresnel^2.5 * 1.6), additive
 *   30 — подписи/иконки станций (Sprite, depthTest false)
 */
import * as THREE from 'three';
import { BRAND } from './palette';

export const METRO_VIEW = {
  surfaceDim: 0.45, surfaceDesat: 0.6, surfaceOpacity: 0.35, surfaceTint: BRAND.lavender,
  bodyOpacity: 0.85, edgePower: 2.5, edgeGain: 1.6, edgeColor: 0x5fe0c8,
  depthFadeNear: 4, depthFadeFar: 40, // глубже — тусклее (по |y|)
  lineColors: [0xff7a59, 0x1fa39a, 0xffc145, 0x8f86b8, 0x4fb3ff, 0x9bd16a],
  renderOrder: { surface: 10, body: 20, edge: 21, labels: 30 }, transitionMs: 350,
};

/** Общий униформ режима: 0 — обычный вид, 1 — метро. Анимируйте за transitionMs. */
export const metroUniforms = { uMetro: { value: 0 } };

/** Патч для любого MeshStandard/Lambert поверхности: затемнение + десатурация + прозрачность по uMetro. */
export function patchSurfaceForMetro<M extends THREE.Material>(m: M): M {
  m.transparent = true;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r);
    sh.uniforms.uMetro = metroUniforms.uMetro;
    sh.fragmentShader = 'uniform float uMetro;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      { vec3 c = gl_FragColor.rgb; float l = dot(c, vec3(.299,.587,.114));
        c = mix(c, vec3(l), ${METRO_VIEW.surfaceDesat.toFixed(2)} * uMetro);
        c = mix(c, c * ${METRO_VIEW.surfaceDim.toFixed(2)} + vec3(${new THREE.Color(METRO_VIEW.surfaceTint).toArray().map(v => (v * 0.2).toFixed(3)).join(',')}), uMetro);
        gl_FragColor.rgb = c; gl_FragColor.a *= mix(1.0, ${METRO_VIEW.surfaceOpacity.toFixed(2)}, uMetro); }`);
  };
  m.customProgramCacheKey = () => 'metroSurf';
  return m;
}
/** Переключить depthWrite поверхности (вызывайте при входе/выходе), иначе подземное «рвётся». */
export function setSurfaceMetroState(mats: THREE.Material[], on: boolean) { for (const m of mats) { m.depthWrite = !on; m.needsUpdate = true; } }

/** Материал подземных объектов: вершинные цвета + fresnel‑кромка + затухание по глубине. */
export function createMetroXRayMaterial(opts: { edgeOnly?: boolean; color?: number } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, side: THREE.FrontSide, vertexColors: true,
    blending: opts.edgeOnly ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uMetro: metroUniforms.uMetro, uEdge: { value: new THREE.Color(opts.color ?? METRO_VIEW.edgeColor) }, uEdgeOnly: { value: opts.edgeOnly ? 1 : 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vY;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.);
#ifdef USE_INSTANCING
        wp = modelMatrix * instanceMatrix * vec4(position,1.);
#endif
        vY = wp.y; vC = color; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float uMetro; uniform vec3 uEdge; uniform float uEdgeOnly; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vY;
      void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), ${METRO_VIEW.edgePower.toFixed(1)}) * ${METRO_VIEW.edgeGain.toFixed(1)};
        float d = 1. - .5 * smoothstep(${METRO_VIEW.depthFadeNear.toFixed(1)}, ${METRO_VIEW.depthFadeFar.toFixed(1)}, -vY);
        float lam = .55 + .45 * max(0., dot(normalize(vN), normalize(vec3(.4,1.,.3))));
        vec3 body = vC * lam * d + uEdge * f * .35;
        if (uEdgeOnly > .5) gl_FragColor = vec4(uEdge * f, f * uMetro);
        else gl_FragColor = vec4(body, ${METRO_VIEW.bodyOpacity.toFixed(2)} * uMetro); }`,
  });
}
/** Включить объект как «подземный»: два меша (тело + кромка) с нужным renderOrder. */
export function addUnderground(scene: THREE.Object3D, geo: THREE.BufferGeometry, lineColor?: number) {
  const body = new THREE.Mesh(geo, createMetroXRayMaterial()); body.renderOrder = METRO_VIEW.renderOrder.body;
  const edge = new THREE.Mesh(geo, createMetroXRayMaterial({ edgeOnly: true, color: lineColor })); edge.renderOrder = METRO_VIEW.renderOrder.edge;
  scene.add(body, edge); return { body, edge };
}
