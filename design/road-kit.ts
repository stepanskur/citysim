/**
 * FIX_VISUALS §3 — эталонная геометрия перекрёстка: площадка со скруглёнными углами (а не тёмный восьмиугольник),
 * бордюр, тротуар, разметка (осевая, «зебры», стоп-линии). Выход — два меша-слоя с vertex colors:
 *   base  (тротуар → бордюр → асфальт, y из ROAD_SPEC.y) и marks (разметка, отдельный материал с polygonOffset).
 * Рукава строятся до arm.len (обычно — до середины ребра; вторая половина — от соседнего узла).
 */
import * as THREE from 'three';
import { ROAD_SPEC } from './palette';

export interface Arm { dx: number; dz: number; type: number; len: number }
type V2 = [number, number];
const C = (h: number) => new THREE.Color(h);

class Mesh2 {
  p: number[] = []; c: number[] = [];
  tri(a: V2, b: V2, d: V2, y: number, col: THREE.Color) {
    // всегда лицом вверх
    const cr = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]); const [B, D] = cr > 0 ? [d, b] : [b, d];
    for (const q of [a, B, D]) { this.p.push(q[0], y, q[1]); this.c.push(col.r, col.g, col.b); }
  }
  quad(a: V2, b: V2, c2: V2, d: V2, y: number, col: THREE.Color) { this.tri(a, b, c2, y, col); this.tri(a, c2, d, y, col); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); const n = new Float32Array(this.p.length); for (let i = 1; i < n.length; i += 3) n[i] = 1; g.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return g; }
}
const add = (a: V2, b: V2, s = 1): V2 => [a[0] + b[0] * s, a[1] + b[1] * s];
function lineX(p: V2, d: V2, q: V2, e: V2): V2 | null { const den = d[0] * e[1] - d[1] * e[0]; if (Math.abs(den) < 0.08) return null; const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den; return add(p, d, t); }
function offsetLoop(L: V2[], o: number): V2[] { // наружу при CCW-обходе
  const n = L.length; return L.map((p, i) => { const a = L[(i - 1 + n) % n], b = L[(i + 1) % n]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; return [p[0] + tz * o, p[1] - tx * o] as V2; });
}

export function padRadiusFor(arms: Arm[]) { let r = 0; for (const a of arms) r = Math.max(r, ROAD_SPEC.asphalt[a.type] / 2 + ROAD_SPEC.cornerR[a.type]); return r; }

export function buildJunction(nx: number, nz: number, armsIn: Arm[], y0 = 0) {
  const S = ROAD_SPEC, M = S.marking; const arms = [...armsIn].sort((a, b) => Math.atan2(a.dz, a.dx) - Math.atan2(b.dz, b.dx));
  const O: V2 = [nx, nz]; const R = padRadiusFor(arms);
  const loop: V2[] = []; const inner: V2[] = [];
  arms.forEach((a, i) => {
    const d: V2 = [a.dx, a.dz], n: V2 = [-a.dz, a.dx], h = S.asphalt[a.type] / 2;
    const b = arms[(i + 1) % arms.length], db: V2 = [b.dx, b.dz], nb: V2 = [-b.dz, b.dx], hb = S.asphalt[b.type] / 2;
    const rNear = add(add(O, d, R), n, -h), rFar = add(add(O, d, a.len), n, -h), lFar = add(add(O, d, a.len), n, h), lNear = add(add(O, d, R), n, h);
    loop.push(rNear, rFar, lFar, lNear); inner.push(rNear, lNear);
    // скругление угла: квадратичная Безье lNear → (пересечение кромок) → rNear соседа
    const nextR = add(add(O, db, R), nb, -hb);
    const ctl = lineX(add(O, n, h), d, add(O, nb, -hb), db) ?? [(lNear[0] + nextR[0]) / 2, (lNear[1] + nextR[1]) / 2];
    const seg = 8; for (let k = 1; k < seg; k++) { const t = k / seg, u = 1 - t; const q: V2 = [u * u * lNear[0] + 2 * u * t * ctl[0] + t * t * nextR[0], u * u * lNear[1] + 2 * u * t * ctl[1] + t * t * nextR[1]]; loop.push(q); inner.push(q); }
  });
  const base = new Mesh2(), marks = new Mesh2();
  const cA = C(S.color.pad), cCurb = C(S.color.curb), cSw = C(S.color.sidewalk), cM = C(M.color), cY = C(M.yellow);
  // тротуар и бордюр (кольца вокруг контура; торцы рукавов тоже обводятся — в игре их перекроет продолжение улицы)
  const curb = offsetLoop(loop, S.curbW), maxSw = Math.max(...arms.map(a => S.sidewalk[a.type] || S.shoulder[a.type]));
  const sw = offsetLoop(loop, S.curbW + maxSw);
  for (let i = 0; i < loop.length; i++) { const j = (i + 1) % loop.length;
    base.quad(curb[i], sw[i], sw[j], curb[j], y0 + S.y.sidewalk, cSw);
    base.quad(loop[i], curb[i], curb[j], loop[j], y0 + S.y.sidewalk + S.curbH * 0.5, cCurb); }
  // асфальт: веер из центра узла по контуру (контур звёздный относительно узла)
  for (let i = 0; i < inner.length; i++) base.tri(O, inner[i], inner[(i + 1) % inner.length], y0 + S.y.pad, cA);
  arms.forEach(a => { const col = C(S.color.asphalt[a.type]); const d: V2 = [a.dx, a.dz], n: V2 = [-a.dz, a.dx], h = S.asphalt[a.type] / 2;
    base.quad(add(add(O, d, R), n, -h), add(add(O, d, a.len), n, -h), add(add(O, d, a.len), n, h), add(add(O, d, R), n, h), y0 + S.y.asphalt, col); });
  // разметка
  const ym = y0 + S.y.marking;
  const rect = (c0: V2, d: V2, n: V2, a0: number, a1: number, w0: number, w1: number, col: THREE.Color) => marks.quad(add(add(c0, d, a0), n, w0), add(add(c0, d, a1), n, w0), add(add(c0, d, a1), n, w1), add(add(c0, d, a0), n, w1), ym, col);
  for (const a of arms) {
    const d: V2 = [a.dx, a.dz], n: V2 = [-a.dz, a.dx], h = S.asphalt[a.type] / 2;
    const z0 = R + M.zebraFromPad, z1 = z0 + M.zebraDepth, st = z1 + M.stopFromZebra;
    if (M.zebraOn[a.type]) for (let w = -h + 0.4; w + M.zebraW <= h - 0.3; w += M.zebraW + M.zebraGap) rect(O, d, n, z0, z1, w, w + M.zebraW, cM);
    rect(O, d, n, st, st + M.stopW, -h + 0.3, -0.15, cM);                                  // стоп-линия: правая (въездная) половина
    const kind = M.centerline[a.type];
    if (kind === 'double') { rect(O, d, n, st, a.len, -M.doubleGap / 2 - M.centerW, -M.doubleGap / 2, cY); rect(O, d, n, st, a.len, M.doubleGap / 2, M.doubleGap / 2 + M.centerW, cY); }
    else if (kind === 'dash') { rect(O, d, n, st, st + 12, -M.centerW / 2, M.centerW / 2, cM); for (let s = st + 12 + M.gap; s + M.dash <= a.len; s += M.dash + M.gap) rect(O, d, n, s, s + M.dash, -M.centerW / 2, M.centerW / 2, cM); }
    if (a.type === 2 || a.type === 1) for (const sg of [-1, 1]) rect(O, d, n, st, a.len, sg * (h - M.edgeInset) - M.edgeW / 2, sg * (h - M.edgeInset) + M.edgeW / 2, cM); // краевые
  }
  return { base: base.geo(), marks: marks.geo(), padR: R };
}

/** Материалы слоёв с правильным polygonOffset/renderOrder (см. FIX_VISUALS §3.5). */
export function roadMaterials() {
  const P = ROAD_SPEC.polygonOffset;
  const base = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: P.asphalt[0], polygonOffsetUnits: P.asphalt[1] });
  const marks = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: ROAD_SPEC.marking.alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: P.marking[0], polygonOffsetUnits: P.marking[1] });
  return { base, marks };
}
