// Пресет сцены «Пастила»: градиентное небо, персиково-голубая дымка, тёплое солнце + лавандовые тени,
// ACES, общий материал с ночным свечением окон (атрибут glow) и тонировкой теней.
import * as THREE from 'three';
import { WORLD } from './palette';

export type TimeOfDay = keyof typeof WORLD;
export interface SceneRig { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; sky: THREE.Mesh; uniforms: StyleUniforms; setTime(t: TimeOfDay | number): void; }
export interface StyleUniforms { uNight: { value: number }; uGlowColor: { value: THREE.Color }; uShadowTint: { value: THREE.Color }; uTime: { value: number } }

export const styleUniforms: StyleUniforms = { uNight: { value: 0 }, uGlowColor: { value: new THREE.Color(0xffc878) }, uShadowTint: { value: new THREE.Color(WORLD.day.shadowTint) }, uTime: { value: 0 } };

/** Общий материал моделей design/models: vertex colors + окна, загорающиеся ночью + тонирование неосвещённых граней. */
export function createStyledMaterial(u: StyleUniforms = styleUniforms): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight; uniform vec3 uGlowColor; uniform vec3 uShadowTint; varying float vGlow;')
      .replace('#include <opaque_fragment>', `
        // лавандовые тени: тёмные участки уходят в холодный тон, светлые остаются тёплыми
        float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
        outgoingLight = mix(outgoingLight, outgoingLight * (uShadowTint * 1.6), (1.0 - smoothstep(0.08, 0.45, lum)) * 0.35);
        // ночные окна: светятся те, чей порог glow < uNight
        float on = step(0.0001, vGlow) * step(vGlow, uNight);
        outgoingLight = mix(outgoingLight, uGlowColor * (1.2 + 0.4 * fract(vGlow * 37.0)), on * 0.92);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'pastila-v2';
  return m;
}

function skyDome(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSun: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 uZenith, uHorizon, uSun; uniform vec3 uSunDir; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, 0.0, 1.0); vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
        float s = max(dot(normalize(vDir), normalize(uSunDir)), 0.0); c += uSun * (pow(s, 8.0) * 0.25 + pow(s, 400.0) * 1.2);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat); m.scale.setScalar(50000); m.frustumCulled = false; m.renderOrder = -1; return m;
}

/** Настраивает renderer/scene. dist — примерная дистанция камеры (для тумана и тени). */
export function applyScenePreset(renderer: THREE.WebGLRenderer, scene: THREE.Scene, opts: { time?: TimeOfDay | number; shadows?: boolean; shadowSize?: number; dist?: number } = {}): SceneRig {
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = opts.shadows ?? true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const dist = opts.dist ?? 400;
  const hemi = new THREE.HemisphereLight(); const sun = new THREE.DirectionalLight(); sun.castShadow = opts.shadows ?? true;
  const ss = opts.shadowSize ?? 2048; sun.shadow.mapSize.set(ss, ss); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -dist, right: dist, top: dist, bottom: -dist, near: 1, far: dist * 6 }); sun.shadow.camera.updateProjectionMatrix();
  const sky = skyDome(); scene.add(hemi, sun, sun.target, sky);
  scene.fog = new THREE.Fog(0xffffff, dist * 1.2, dist * 5);
  const lerp = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);
  const setTime = (t: TimeOfDay | number) => {
    // число 0..24 → смесь пресетов
    let A: TimeOfDay = 'day', B: TimeOfDay = 'day', k = 0;
    if (typeof t === 'string') { A = B = t; } else {
      const h = ((t % 24) + 24) % 24;
      const keys: [number, TimeOfDay][] = [[0, 'night'], [5, 'night'], [6.5, 'dawn'], [9, 'day'], [17, 'day'], [19, 'dusk'], [21, 'night'], [24, 'night']];
      for (let i = 0; i < keys.length - 1; i++) if (h >= keys[i][0] && h <= keys[i + 1][0]) { A = keys[i][1]; B = keys[i + 1][1]; k = (h - keys[i][0]) / (keys[i + 1][0] - keys[i][0]); break; }
    }
    const a = WORLD[A], b = WORLD[B], m = (x: number, y: number) => x + (y - x) * k;
    hemi.color.copy(lerp(a.hemiSky, b.hemiSky, k)); hemi.groundColor.copy(lerp(a.hemiGround, b.hemiGround, k)); hemi.intensity = m(a.hemiI, b.hemiI);
    sun.color.copy(lerp(a.sun, b.sun, k)); sun.intensity = m(a.sunI, b.sunI); renderer.toneMappingExposure = m(a.exposure, b.exposure);
    (scene.fog as THREE.Fog).color.copy(lerp(a.fog, b.fog, k));
    const hourAngle = typeof t === 'number' ? ((t - 6) / 12) * Math.PI : ({ day: 0.42, dawn: 0.1, dusk: 0.9, night: 0.3 } as const)[t] * Math.PI;
    const el = Math.max(0.12, Math.sin(hourAngle)) * 0.9; sun.position.set(Math.cos(hourAngle) * dist * 2 - dist * 0.6, el * dist * 1.1, dist * 1.4);
    const su = (sky.material as THREE.ShaderMaterial).uniforms; su.uZenith.value.copy(lerp(a.zenith, b.zenith, k)); su.uHorizon.value.copy(lerp(a.horizon, b.horizon, k)); su.uSunDir.value.copy(sun.position).normalize(); su.uSun.value.copy(sun.color);
    styleUniforms.uShadowTint.value.copy(lerp(a.shadowTint, b.shadowTint, k));
    styleUniforms.uNight.value = (A === 'night' ? 1 - 0 : A === 'dusk' ? 0.5 : 0) * (1 - k) + (B === 'night' ? 1 : B === 'dusk' ? 0.5 : 0) * k;
  };
  setTime(opts.time ?? 'day');
  return { hemi, sun, sky, uniforms: styleUniforms, setTime };
}
