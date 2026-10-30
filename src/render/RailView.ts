/** Этап D: визуал рельсовой сети и станций + режим metro-view (design/metro-view.ts).
 *  - наземные/эстакадные пути: road-kit-v2 buildTrack (+ buildBridge под эстакадой, buildTunnelPortal на входе в тоннель);
 *  - тоннели метро: buildTunnelTube → addUnderground (видны только в metro-view, «рентген» сквозь полупрозрачную поверхность);
 *  - станции Дезигнера (design/models/stations createStation): busStopV2 / tramStopV2 / metroEntrance + metroPlatform / railStation,
 *    ориентированы по направлению маршрута в точке остановки. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildTrack, buildBridge, buildTunnelPortal, buildTunnelTube } from '../../design/road-kit-v2';
import { createStation, STATION_MODULE } from '../../design/models/stations';
import { patchSurfaceForMetro, metroUniforms, addUnderground, METRO_VIEW } from '../../design/metro-view';
import type { World } from '../world/World';
import { RAIL } from '../world/World';
import type { Line } from '../sim/Transit';
import { ROAD_SPEC } from '../../design/palette';
import { BALANCE } from '../sim/balance';

const TUNNEL_AXIS = METRO_VIEW.lineColors[0];
export class RailView {
  surface = new THREE.Group(); under = new THREE.Group(); ver = '';
  target = 0; surfMats: THREE.Material[] = [];
  constructor(public scene: THREE.Scene, public world: () => World, public mat: THREE.Material, public bridgeMat: THREE.Material) { scene.add(this.surface, this.under); this.under.visible = false; }
  /** патч материалов поверхности: уникальный ключ программы на материал (у ground-material свой onBeforeCompile) */
  patch(mats: THREE.Material[]) { for (const m of mats) { if (this.surfMats.includes(m)) continue; const prevKey = m.customProgramCacheKey?.bind(m); patchSurfaceForMetro(m); m.transparent = false; const id = m.uuid; m.customProgramCacheKey = () => 'metro|' + id + '|' + (prevKey ? prevKey() : ''); m.needsUpdate = true; this.surfMats.push(m); } }
  setOn(on: boolean) { if ((this.target === 1) === on) return; this.target = on ? 1 : 0; for (const m of this.surfMats) { m.transparent = on; m.depthWrite = !on; m.needsUpdate = true; } if (on) this.under.visible = true; }
  frame(dt: number) { const u = metroUniforms.uMetro; const k = Math.min(1, dt * 1000 / METRO_VIEW.transitionMs); u.value += (this.target - u.value) * Math.max(k, 0.05); if (Math.abs(u.value - this.target) < 0.01) u.value = this.target; this.under.visible = u.value > 0.01; }
  clear(g: THREE.Group) { while (g.children.length) { const o = g.children.pop() as THREE.Mesh; o.geometry?.dispose(); const mm = o.material as THREE.Material; if (mm && mm !== this.mat && mm !== this.bridgeMat) mm.dispose(); } }
  build(lines: Line[]) {
    const w = this.world(), R = w.rail; this.clear(this.surface); this.clear(this.under);
    const axis: THREE.BufferGeometry[] = []; const surf: THREE.BufferGeometry[] = [], br: THREE.BufferGeometry[] = [], tube: THREE.BufferGeometry[] = [];
    const Y = (x: number, z: number) => Math.max(w.hAt(x, z), 0);
    for (let e = 0; e < R.edges.length; e++) { const E = R.edges[e]; if (!E.alive) continue; const A = R.nodes[E.a], B = R.nodes[E.b]; const dx = (B.x - A.x) / E.len, dz = (B.z - A.z) / E.len; const lv = E.lv || 0;
      const n = Math.max(1, Math.ceil(E.len / 6)); let prev = w.edgeOff(e, 0, R);
      for (let k = 0; k < n; k++) { const s0 = E.len * k / n, s1 = E.len * (k + 1) / n; const pa = { x: A.x + dx * s0, z: A.z + dz * s0 }, pb = { x: A.x + dx * s1, z: A.z + dz * s1 };
        const o0 = w.edgeOff(e, s0, R), o1 = w.edgeOff(e, s1, R); const ya = Y(pa.x, pa.z) + o0, yb = Y(pb.x, pb.z) + o1, y = Math.min(ya, yb);
        if ((prev > -1.5) !== (o1 > -1.5)) { const t = o1 < prev ? { x: dx, z: dz } : { x: -dx, z: -dz }; try { surf.push(buildTunnelPortal(pb, t, 9, 6, Y(pb.x, pb.z) + o1 - 0.2)); } catch { /* */ } }
        prev = o1;
        if (Math.max(o0, o1) < -1.5) { try { tube.push(buildTunnelTube([pa, pb], 9, 6, y)); tube.push(buildTrack([pa, pb], { y, ballast: false, concrete: true })); axis.push(this.ribbon(pa, pb, y + 7, 3.2)); } catch { /* */ } continue; }
        try { surf.push(buildTrack([pa, pb], { y: y + 0.02, ballast: lv === 0 && (E.type !== RAIL.TRAM || !this.onRoad(w, (pa.x + pb.x) / 2, (pa.z + pb.z) / 2)) /* QA3 №2: трамвай вне дороги — на балласте, виден */, concrete: E.type !== RAIL.TRAM })); } catch { /* */ }
        if (lv > 0) { const gy = w.hAt((pa.x + pb.x) / 2, (pa.z + pb.z) / 2); if (y - Math.max(gy, 0) >= 2) try { br.push(buildBridge([pa, pb], 6, y - 0.05, Math.min(gy, y - 3), k % 5 === 4 ? (s1 - s0) * 0.999 : 1e6)); } catch { /* */ } }
      } }
    // станции по линиям
    const SM = STATION_MODULE as any;
    for (const ln of lines) { const P = ln.pts; const ys = ln.ys;
      for (const st of ln.stops) { let bi = 0, bd = 1e18; for (let i = 0; i < P.length / 2; i++) { const d = (P[i * 2] - st.x) ** 2 + (P[i * 2 + 1] - st.z) ** 2; if (d < bd) { bd = d; bi = i; } }
        const j = Math.min(P.length / 2 - 1, bi + 1), i0 = j === bi ? bi - 1 : bi; let tx = P[j * 2] - P[i0 * 2], tz = P[j * 2 + 1] - P[i0 * 2 + 1]; const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        const rot = -Math.atan2(tz, tx), nx = -tz, nz = tx; const dy = ys ? ys[bi] : 0; const gy = w.roadY(st.x, st.z);
        const put = (geo: THREE.BufferGeometry, x: number, y: number, z: number, under = false) => { geo.rotateY(rot); geo.translate(x, y, z); if (under) { addUnderground(this.under, geo, ln.color); } else { const m = new THREE.Mesh(geo, this.mat); m.castShadow = true; this.surface.add(m); } };
        if (ln.type === 0) { const off = ROAD_SPEC.asphalt[0] / 2 + 2.2; const RB = BALANCE.render, k = RB.busStopScale, o2 = off + 1.2 * (k - 1); put(createStation('busStopV2').scale(k, k, k), st.x + nx * o2, gy, st.z + nz * o2);
          // заметный столб-указатель «А» (виден со средней дистанции)
          const ph = RB.busStopPoleH, sg = RB.busStopSign, pole = new THREE.CylinderGeometry(0.12, 0.12, ph, 6).translate(0, ph / 2, 0), sign = new THREE.BoxGeometry(0.2, sg, sg).translate(0, ph + sg / 2 - 0.2, 0);
          const pm = new THREE.Mesh(pole, new THREE.MeshLambertMaterial({ color: 0x2b2f3a })), sm = new THREE.Mesh(sign, new THREE.MeshLambertMaterial({ color: 0x1e88e5, emissive: 0x1e88e5, emissiveIntensity: 0.45 }));
          const px = st.x + nx * (off - 0.6) + tx * 3, pz = st.z + nz * (off - 0.6) + tz * 3; for (const m of [pm, sm]) { m.position.set(px, gy, pz); m.rotation.y = rot; m.castShadow = true; this.surface.add(m); } }
        else if (ln.type === 1) put(createStation('tramStopV2'), st.x + nx * (ln.track ? 3 : 6), gy + dy + 0.05, st.z + nz * (ln.track ? 3 : 6));
        else if (ln.type === 2) { put(createStation('metroEntrance'), st.x + nx * 16, Y(st.x + nx * 16, st.z + nz * 16), st.z + nz * 16); put(createStation('metroPlatform', { sections: 3 }), st.x, Y(st.x, st.z) + dy + SM.metroDepth, st.z, true); }
        else { const off = SM.railTrackOffset ?? 4.6; put(createStation('railStation', { sections: 3 }), st.x + nx * off, Y(st.x, st.z) + dy, st.z + nz * off); }
      } }
    const add = (gs: THREE.BufferGeometry[], mat: THREE.Material, grp: THREE.Group) => { if (!gs.length) return; const g = mergeGeometries(gs.map(x => x.index ? x.toNonIndexed() : x)); gs.forEach(x => x.dispose()); if (g) { const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; grp.add(m); } };
    add(surf, this.mat, this.surface); add(br, this.bridgeMat, this.surface);
    if (tube.length) { const g = mergeGeometries(tube.map(x => x.index ? x.toNonIndexed() : x)); tube.forEach(x => x.dispose()); if (g) addUnderground(this.under, g); }
    if (axis.length) { const g = mergeGeometries(axis); axis.forEach(x => x.dispose()); if (g) addUnderground(this.under, g, 0xffffff); } // QA2 п.5: чёткая ось тоннеля
  }
  /** яркая лента-ось тоннеля (видна сверху сквозь «стекло» поверхности) */
  onRoad(w: any, x: number, z: number) { const net = w.net; const a0 = Math.floor(x / 64), b0 = Math.floor(z / 64);
    for (let a = a0 - 1; a <= a0 + 1; a++) for (let b = b0 - 1; b <= b0 + 1; b++) { const cell = net.nodeGrid.get(a * 131072 + b); if (!cell) continue;
      for (const id of cell) for (const e of net.nodes[id].edges) { const E = net.edges[e]; if (!E.alive || (E.lv || 0) !== 0) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
        const vx = B.x - A.x, vz = B.z - A.z, L2 = vx * vx + vz * vz || 1; const t = Math.max(0, Math.min(1, ((x - A.x) * vx + (z - A.z) * vz) / L2));
        if (Math.hypot(A.x + vx * t - x, A.z + vz * t - z) < 6) return true; } }
    return false; }
  ribbon(a: { x: number; z: number }, b: { x: number; z: number }, y: number, wd: number) { const L = Math.hypot(b.x - a.x, b.z - a.z) + wd * 0.5; const g = new THREE.BoxGeometry(L, 0.6, wd); g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x)); g.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2); const c = new THREE.Color(TUNNEL_AXIS); const n = g.attributes.position.count; const col = new Float32Array(n * 3); for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); return g; }
}
