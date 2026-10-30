// Рендер превью карточек меню строительства (256×160, прозрачный фон, изометрия 35°).
import * as THREE from 'three';
import { createModel, createModelMaterial, type ModelKind } from '../models/index';
export const CARD_MODELS: Record<string, ModelKind> = {
  'bus-stop': { type: 'station', kind: 'busStopV2' }, 'bus-depot': { type: 'building', kind: 'depot' }, 'bus': { type: 'vehicle', kind: 'bus' },
  'tram-stop': { type: 'station', kind: 'tramStopV2' }, 'tram': { type: 'vehicle', kind: 'tram' },
  'rail-station': { type: 'station', kind: 'railStation' }, 'rail-platform': { type: 'station', kind: 'railPlatformSection' }, 'rail-loco': { type: 'vehicle', kind: 'locomotive' },
  'metro-entrance': { type: 'station', kind: 'metroEntrance' }, 'metro-platform': { type: 'station', kind: 'metroPlatform' },
  'civic': { type: 'building', kind: 'civic' }, 'office': { type: 'building', kind: 'office' }, 'house': { type: 'building', kind: 'house' },
  'res-tower': { type: 'building', kind: 'resTower' }, 'industrial': { type: 'building', kind: 'industrial' }, 'tree-oak': { type: 'tree', kind: 'oak' },
};
const W = 256, H = 160;
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setSize(W, H); r.setPixelRatio(2);
document.body.appendChild(r.domElement);
const out: Record<string, string> = {};
for (const [id, m] of Object.entries(CARD_MODELS)) {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xfff4e6, 0x6b6f8a, 1.6)); const d = new THREE.DirectionalLight(0xffffff, 1.4); d.position.set(5, 8, 4); s.add(d);
  const g = createModel(m); g.computeBoundingBox(); const b = g.boundingBox!; const c = b.getCenter(new THREE.Vector3()); const sz = b.getSize(new THREE.Vector3());
  s.add(new THREE.Mesh(g, createModelMaterial()));
  const R = Math.max(sz.x, sz.y * 1.4, sz.z) * 0.62; const cam = new THREE.OrthographicCamera(-R * W / H, R * W / H, R, -R, 0.1, 1000);
  cam.position.set(c.x + 40, c.y + 30, c.z + 40); cam.lookAt(c); r.setClearColor(0, 0); r.render(s, cam);
  out[id] = r.domElement.toDataURL('image/png');
}
(window as any).cards = out; (window as any).ready = true;
