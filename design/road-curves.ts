/**
 * Плавные кривые дорог. 2D в плоскости XZ (P = {x, z}).
 * Сплайны: Catmull-Rom (центростремит., alpha=.5), кубический Безье, клотоида (Френель, рядом Эйлера).
 * Скругление ломаной: fillet по углу с мин. радиусом класса, переходные клотоиды (опц.).
 * Тесселяция по кривизне: шаг ds = clamp(sqrt(8*R*tol), dsMin, dsMax), tol = 0.03 м хорды.
 * Лента со смещением без самопересечения: смещение d по нормали, точки, где d*k > 1 (внутр. сторона, R<|d|),
 * схлопываются в одну (clip), плюс пост-фильтр петель (выкидываем точки с обратным направлением касательной).
 */
import * as THREE from 'three';

export interface P { x: number; z: number }
export type RoadClass = 'highway' | 'avenue' | 'street' | 'lane';
/** Мин. радиус по оси (м) и параметры: R_min = v²/(127(e+f)) с запасом; для игры округлено. */
export const CURVE_SPEC: Record<RoadClass, { rMin: number; rPref: number; clothoidA: number; speed: number }> = {
  highway: { rMin: 120, rPref: 250, clothoidA: 80, speed: 90 },
  avenue: { rMin: 45, rPref: 80, clothoidA: 30, speed: 60 },
  street: { rMin: 15, rPref: 25, clothoidA: 0, speed: 40 },
  lane: { rMin: 8, rPref: 12, clothoidA: 0, speed: 20 },
};
export const TESS = { tol: 0.03, dsMin: 0.75, dsMax: 16, maxTurnPerSeg: (6 * Math.PI) / 180 };

const sub = (a: P, b: P): P => ({ x: a.x - b.x, z: a.z - b.z }); const add = (a: P, b: P): P => ({ x: a.x + b.x, z: a.z + b.z });
const mul = (a: P, k: number): P => ({ x: a.x * k, z: a.z * k }); const len = (a: P) => Math.hypot(a.x, a.z);
const norm = (a: P): P => { const l = len(a) || 1; return { x: a.x / l, z: a.z / l }; };
const cross = (a: P, b: P) => a.x * b.z - a.z * b.x; const dot = (a: P, b: P) => a.x * b.x + a.z * b.z;

export function bezier3(p0: P, p1: P, p2: P, p3: P, t: number): P {
  const u = 1 - t; return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, z: u * u * u * p0.z + 3 * u * u * t * p1.z + 3 * u * t * t * p2.z + t * t * t * p3.z };
}
/** Центростремительный Catmull-Rom → сегменты Безье (без петель и каспов). */
export function catmullRomToBezier(pts: P[], alpha = 0.5): [P, P, P, P][] {
  const out: [P, P, P, P][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const d1 = Math.max(1e-4, len(sub(p1, p0)) ** alpha), d2 = Math.max(1e-4, len(sub(p2, p1)) ** alpha), d3 = Math.max(1e-4, len(sub(p3, p2)) ** alpha);
    const b1 = { x: (d1 * d1 * p2.x - d2 * d2 * p0.x + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.x) / (3 * d1 * (d1 + d2)), z: (d1 * d1 * p2.z - d2 * d2 * p0.z + (2 * d1 * d1 + 3 * d1 * d2 + d2 * d2) * p1.z) / (3 * d1 * (d1 + d2)) };
    const b2 = { x: (d3 * d3 * p1.x - d2 * d2 * p3.x + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.x) / (3 * d3 * (d3 + d2)), z: (d3 * d3 * p1.z - d2 * d2 * p3.z + (2 * d3 * d3 + 3 * d3 * d2 + d2 * d2) * p2.z) / (3 * d3 * (d3 + d2)) };
    out.push([p1, i === 0 ? add(p1, mul(sub(p2, p1), 1 / 3)) : b1, i === pts.length - 2 ? sub(p2, mul(sub(p2, p1), 1 / 3)) : b2, p2]);
  }
  return out;
}
/** Клотоида: точка на длине s при параметре A (k = s/A²), начало в 0, касательная +X. */
export function clothoid(s: number, A: number): P {
  const t = s / A; let x = 0, z = 0, term = 1; // ряд для C/S Френеля, 8 членов достаточно для s/A < 2
  for (let n = 0; n < 8; n++) { const tt = t ** (4 * n + 1), f = (-1) ** n / fact(2 * n); x += f * tt / ((4 * n + 1) * 2 ** (2 * n)); z += (-1) ** n / fact(2 * n + 1) * t ** (4 * n + 3) / ((4 * n + 3) * 2 ** (2 * n + 1)); void term; }
  return { x: x * A, z: z * A };
}
function fact(n: number) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }

/** Скругление ломаной: для каждого внутреннего узла — дуга радиуса R = max(rMin, min(rPref, по свободной длине)). */
export function filletPolyline(pts: P[], cls: RoadClass): { pts: P[]; radii: number[] } {
  const S = CURVE_SPEC[cls]; const out: P[] = [pts[0]]; const radii: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = norm(sub(pts[i - 1], pts[i])), c = norm(sub(pts[i + 1], pts[i]));
    const theta = Math.acos(Math.max(-1, Math.min(1, dot(a, c)))); // внутренний угол
    const turn = Math.PI - theta; if (turn < 1e-3) { out.push(pts[i]); continue; }
    const avail = Math.min(len(sub(pts[i - 1], pts[i])), len(sub(pts[i + 1], pts[i]))) * 0.5;
    let R = Math.min(S.rPref, avail / Math.tan(turn / 2)); R = Math.max(R, Math.min(S.rMin, avail / Math.tan(turn / 2)));
    const tl = R * Math.tan(turn / 2), t1 = add(pts[i], mul(a, tl)), t2 = add(pts[i], mul(c, tl));
    const bis = norm(add(a, c)), ctr = add(pts[i], mul(bis, R / Math.sin(theta / 2)));
    const ang = (q: P) => Math.atan2(q.z - ctr.z, q.x - ctr.x); let a0 = ang(t1), a1 = ang(t2);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const ds = Math.max(TESS.dsMin, Math.min(TESS.dsMax, Math.sqrt(8 * R * TESS.tol)));
    const n = Math.max(2, Math.ceil(Math.max(Math.abs(da) * R / ds, Math.abs(da) / TESS.maxTurnPerSeg)));
    for (let k = 0; k <= n; k++) { const t = a0 + da * k / n; out.push({ x: ctr.x + R * Math.cos(t), z: ctr.z + R * Math.sin(t) }); }
    radii.push(R);
  }
  out.push(pts[pts.length - 1]); return { pts: out, radii };
}

/** Адаптивная тесселяция Безье по кривизне (оценка через угол поворота касательной). */
export function tessellateBeziers(segs: [P, P, P, P][]): P[] {
  const out: P[] = [];
  for (const s of segs) {
    const N = 64; const fine: P[] = []; for (let i = 0; i <= N; i++) fine.push(bezier3(s[0], s[1], s[2], s[3], i / N));
    if (!out.length) out.push(fine[0]); let last = fine[0], lastDir = norm(sub(fine[1], fine[0])), acc = 0;
    for (let i = 1; i <= N; i++) {
      acc += len(sub(fine[i], fine[i - 1]));
      const dir = i < N ? norm(sub(fine[i + 1], fine[i])) : lastDir; const turn = Math.acos(Math.max(-1, Math.min(1, dot(dir, lastDir))));
      const k = turn / Math.max(1e-6, acc), R = k > 1e-6 ? 1 / k : 1e9, ds = Math.max(TESS.dsMin, Math.min(TESS.dsMax, Math.sqrt(8 * R * TESS.tol)));
      if (i === N || acc >= ds || turn > TESS.maxTurnPerSeg) { out.push(fine[i]); last = fine[i]; lastDir = dir; acc = 0; }
    }
    void last;
  }
  return out;
}

/** Смещённая линия (d>0 — влево) без петель на внутренней стороне. */
export function offsetPolyline(pts: P[], d: number): P[] {
  const n = pts.length; const res: P[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = i > 0 ? norm(sub(pts[i], pts[i - 1])) : norm(sub(pts[1], pts[0])), t1 = i < n - 1 ? norm(sub(pts[i + 1], pts[i])) : t0;
    const t = norm(add(t0, t1)); const nrm = { x: -t.z, z: t.x }; const miter = Math.max(0.5, dot(nrm, { x: -t0.z, z: t0.x }));
    res.push(add(pts[i], mul(nrm, d / miter)));
  }
  // фильтр петель: точка выкидывается, если её отрезок смотрит против исходной касательной
  const clean: P[] = [res[0]];
  for (let i = 1; i < n; i++) { const ref = norm(sub(pts[i], pts[i - 1])); const seg = sub(res[i], clean[clean.length - 1]); if (dot(seg, ref) > 1e-4 || i === n - 1) clean.push(res[i]); }
  return clean;
}
/** Длины дуги вдоль ломаной. */
export function arcLengths(pts: P[]) { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + len(sub(pts[i], pts[i - 1]))); return s; }
/** Точка/касательная на длине s. */
export function sampleAt(pts: P[], S: number[], s: number): { p: P; t: P } {
  let i = 1; while (i < S.length - 1 && S[i] < s) i++; const f = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]);
  return { p: add(pts[i - 1], mul(sub(pts[i], pts[i - 1]), Math.max(0, Math.min(1, f)))), t: norm(sub(pts[i], pts[i - 1])) };
}

/** Лента между смещениями dL..dR на высоте y, цвет col → массивы для BufferGeometry. */
export function ribbon(center: P[], dL: number, dR: number, y: number, col: [number, number, number], pos: number[], colr: number[]) {
  if (dL < dR) [dL, dR] = [dR, dL]; // всегда лево>право → нормали вверх
  const L = offsetPolyline(center, dL), R = offsetPolyline(center, dR);
  // выравниваем по длине дуги: обе стороны ресемплируем на одинаковое число точек
  const m = Math.max(L.length, R.length), SL = arcLengths(L), SR = arcLengths(R);
  const at = (A: P[], S: number[], k: number) => sampleAt(A, S, S[S.length - 1] * k / (m - 1)).p;
  for (let k = 0; k < m - 1; k++) {
    const a = at(L, SL, k), b = at(L, SL, k + 1), c = at(R, SR, k + 1), d = at(R, SR, k);
    pos.push(a.x, y, a.z, b.x, y, b.z, d.x, y, d.z, b.x, y, b.z, c.x, y, c.z, d.x, y, d.z);
    for (let q = 0; q < 6; q++) colr.push(...col);
  }
}
/** Прерывистая разметка вдоль кривой: штрих dash, пробел gap, ширина w, смещение off. */
export function dashedAlong(center: P[], off: number, w: number, dash: number, gap: number, y: number, col: [number, number, number], pos: number[], colr: number[]) {
  const line = offsetPolyline(center, off), S = arcLengths(line), total = S[S.length - 1];
  for (let s = gap / 2; s < total - 0.01; s += dash + gap) {
    const seg: P[] = []; for (let u = s; u <= Math.min(total, s + dash) + 1e-6; u += Math.min(1, dash / 2)) seg.push(sampleAt(line, S, u).p);
    if (seg.length > 1) ribbon(seg, w / 2, -w / 2, y, col, pos, colr);
  }
}

export interface CurvedRoadProfile { halfAsphalt: number; curb: number; sidewalk: number; center: 'double' | 'dashed' | 'none'; lanes: number }
export const CURVED_PROFILES: Record<RoadClass, CurvedRoadProfile> = {
  highway: { halfAsphalt: 7, curb: 0.3, sidewalk: 0, center: 'double', lanes: 3 },
  avenue: { halfAsphalt: 7, curb: 0.3, sidewalk: 3.5, center: 'double', lanes: 2 },
  street: { halfAsphalt: 3.5, curb: 0.3, sidewalk: 2.5, center: 'dashed', lanes: 1 },
  lane: { halfAsphalt: 2.25, curb: 0.2, sidewalk: 1.5, center: 'none', lanes: 1 },
};
const hx = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** Полная кривая дорога: асфальт, бордюр, тротуар, разметка. Возвращает {base, marks} (marks — polygonOffset). */
export function buildCurvedRoad(ctrl: P[], cls: RoadClass, mode: 'fillet' | 'catmull' = 'catmull', y = 0) {
  const pr = CURVED_PROFILES[cls];
  const center = mode === 'catmull' ? tessellateBeziers(catmullRomToBezier(ctrl)) : filletPolyline(ctrl, cls).pts;
  const bp: number[] = [], bc: number[] = [], mp: number[] = [], mc: number[] = [];
  const A = hx(0x4a4e63), CURB = hx(0xe6ddd0), SW = hx(0xd9cbb7), W = hx(0xfff8ee), Y = hx(0xffc145);
  ribbon(center, pr.halfAsphalt, -pr.halfAsphalt, y, A, bp, bc);
  for (const s of [1, -1]) {
    ribbon(center, s * pr.halfAsphalt, s * (pr.halfAsphalt + pr.curb), y + 0.15, CURB, bp, bc);
    if (pr.sidewalk) ribbon(center, s * (pr.halfAsphalt + pr.curb), s * (pr.halfAsphalt + pr.curb + pr.sidewalk), y + 0.15, SW, bp, bc);
    ribbon(center, s * (pr.halfAsphalt - 0.35), s * (pr.halfAsphalt - 0.5), y + 0.02, W, mp, mc); // краевая сплошная
    const lw = pr.halfAsphalt / pr.lanes; for (let l = 1; l < pr.lanes; l++) dashedAlong(center, s * lw * l, 0.15, 3, 6, y + 0.02, W, mp, mc);
  }
  if (pr.center === 'double') for (const s of [1, -1]) ribbon(center, s * 0.1, s * 0.25, y + 0.02, Y, mp, mc);
  if (pr.center === 'dashed') dashedAlong(center, 0, 0.15, 3, 6, y + 0.02, W, mp, mc);
  const mk = (p: number[], c: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.computeVertexNormals(); return g; };
  return { base: mk(bp, bc), marks: mk(mp, mc), center };
}
