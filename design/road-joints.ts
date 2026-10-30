/**
 * v5 Гладкие стыки дорог (B1, ROADS_JOINTS в HANDOFF_v5 / ROADS_SPEC §v5).
 * Один меш на узел: перекрёсток (≥3 рукава), переход (2 рукава: смена класса/ширины, излом), конец (1 рукав: разворотная
 * площадка, полукруг, торцевая шапка). Нет перекрытий с рёбрами: рёбра начинаются ровно на trim[i] от узла, ширины совпадают.
 * Метод для узлов ≥3 и концов: SDF «скруглённое объединение» полос рукавов (точное скругление дугой радиуса R), контуры
 * уровней асфальт/бордюр/тротуар — изолинии SDF (концентрические дуги R, R−c, R−c−sw), снятые лучами из центра узла.
 */
import * as THREE from 'three';
import { P, RoadClass, CURVED_PROFILES } from './road-curves';

export const JOINT_COL = { asphalt: 0x4a4e63, curb: 0xe6ddd0, curbSide: 0xbdb3a6, sidewalk: 0xd9cbb7, white: 0xfff8ee, yellow: 0xffc145, skirt: 0x8a8578 };
/** Радиус скругления бордюра (по асфальту) по старшему классу в узле; всегда ≥ curb+sidewalk+1.5 (иначе тротуар «выворачивается»). */
export const CORNER_R: Record<RoadClass, number> = { lane: 6, street: 8, avenue: 12, highway: 15 };
/** Высоты слоёв (м от отметки проезжей части узла). Рёбра обязаны использовать те же. */
export const Z_LAYERS = { skirt: -0.3, asphalt: 0, curbTop: 0.15, sidewalk: 0.15, marks: 0.02, marksPolyOffset: -2, pools: 0.04, overlay: 0.1 };
/** Разметка у перекрёстка: зебра 3 м (полосы 0.5/0.5), за ней стоп-линия 0.4 м; краевые/осевые линии рёбер начинаются после trim. */
export const JOINT_MARKS = { zebraW: 3, zebraStripe: 0.5, zebraFrom: 5.0, stopW: 0.4, stopAt: 1.0, straightTail: 5.5 };
/** Переход ширины: длина L = max(12, 8·|Δ полуширины асфальта|), профиль — smoothstep; ставится на рукаве младшего класса. */
export const TAPER = { min: 12, perMeter: 8 };
/** Концы: разворотная площадка (радиус асфальта), полукруг, шапка (скругление углов асфальта 1.5 м). */
export const END_CAP = { bulbR: { lane: 7.5, street: 10, avenue: 14, highway: 0 } as Record<RoadClass, number>, flatR: 1.5, blend: 5 };

export interface JointArm { dx: number; dz: number; cls: RoadClass }
export interface JointMesh { base: THREE.BufferGeometry; marks: THREE.BufferGeometry; trims: number[] }
type C3 = [number, number, number];
const hx = (h: number): C3 => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const prof = (c: RoadClass) => { const p = CURVED_PROFILES[c]; return { hw: p.halfAsphalt, c: p.curb, sw: p.sidewalk }; };
const RANK: Record<RoadClass, number> = { lane: 0, street: 1, avenue: 2, highway: 3 };

class Acc { p: number[] = []; c: number[] = [];
  tri(a: number[], b: number[], d: number[], col: C3) { // ориентируем нормалью вверх (или наружу для вертикали — двусторонний материал)
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = d[0] - a[0], vz = d[2] - a[2]; const ny = uz * vx - ux * vz;
    if (ny < 0) this.p.push(...a, ...d, ...b); else this.p.push(...a, ...b, ...d); for (let i = 0; i < 3; i++) this.c.push(...col); }
  quad(a: number[], b: number[], c: number[], d: number[], col: C3) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  wall(a: number[], b: number[], y0: number, y1: number, col: C3) { this.p.push(a[0], y0, a[2], b[0], y0, b[2], b[0], y1, b[2], a[0], y0, a[2], b[0], y1, b[2], a[0], y1, a[2]); for (let i = 0; i < 6; i++) this.c.push(...col); }
  geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return g; }
}

// ───────────── SDF ─────────────
function sdBox(px: number, pz: number, cx: number, cz: number, ux: number, uz: number, hu: number, hv: number, rr = 0) {
  const dx = px - cx, dz = pz - cz; const u = Math.abs(dx * ux + dz * uz) - hu + rr, v = Math.abs(-dx * uz + dz * ux) - hv + rr;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - rr;
}
/** Скруглённое объединение (IQ opUnionRound): точная дуга радиуса r в вогнутых углах. */
const uRound = (a: number, b: number, r: number) => Math.max(r, Math.min(a, b)) - Math.hypot(Math.max(r - a, 0), Math.max(r - b, 0));

interface Shape { sdf(x: number, z: number): number; cuts: { ux: number; uz: number; L: number; hv: number }[]; extra: number[] }
/** Контур уровня `lv` лучами из (0,0): углы angs, обрезка торцами рукавов (плоский срез на trim). */
function contour(S: Shape, lv: number, angs: number[], rMax: number): P[] {
  return angs.map(a => { const ox = Math.cos(a), oz = Math.sin(a); let lo = 0, hi = 0.25;
    while (hi < rMax && S.sdf(ox * hi, oz * hi) < lv) { lo = hi; hi += 0.25; }
    for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (S.sdf(ox * m, oz * m) < lv) lo = m; else hi = m; }
    let r = (lo + hi) / 2;
    for (const c of S.cuts) { const cs = ox * c.ux + oz * c.uz; if (cs <= 1e-4) continue; const rc = c.L / cs; const v = Math.abs(-ox * c.uz + oz * c.ux) * rc; if (v <= c.hv + lv + 1e-3 && rc < r) r = rc; }
    return { x: ox * r, z: oz * r }; });
}
/** Меш из SDF-фигуры: асфальт (веер), вертикаль бордюра, бордюр, тротуар, юбка. center — мировой центр лучей. */
function meshShape(S: Shape, center: P, y: number, curb: number, sw: number, A: Acc, rMax: number, asphaltCol = hx(JOINT_COL.asphalt)) {
  const set = new Set<number>(); for (let i = 0; i < 160; i++) set.add(i / 160 * Math.PI * 2); for (const a of S.extra) set.add((a + Math.PI * 4) % (Math.PI * 2));
  const angs = [...set].sort((a, b) => a - b);
  const lv = [0, curb, curb + sw].map(l => contour(S, l, angs, rMax).map(p => ({ x: p.x + center.x, z: p.z + center.z })));
  const C = [center.x, y, center.z], n = angs.length, ys = y + Z_LAYERS.curbTop;
  const v = (p: P, yy: number) => [p.x, yy, p.z];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; const a0 = lv[0][i], a1 = lv[0][j]; A.tri(C, v(a0, y), v(a1, y), asphaltCol);
    const b0 = lv[1][i], b1 = lv[1][j], s0 = lv[2][i], s1 = lv[2][j];
    if (Math.hypot(b0.x - a0.x, b0.z - a0.z) > 0.01 || Math.hypot(b1.x - a1.x, b1.z - a1.z) > 0.01) {
      A.wall(v(a0, y), v(a1, y), y, ys, hx(JOINT_COL.curbSide)); A.quad(v(a0, ys), v(a1, ys), v(b1, ys), v(b0, ys), hx(JOINT_COL.curb)); }
    if (sw > 0 && (Math.hypot(s0.x - b0.x, s0.z - b0.z) > 0.01 || Math.hypot(s1.x - b1.x, s1.z - b1.z) > 0.01)) A.quad(v(b0, ys), v(b1, ys), v(s1, ys), v(s0, ys), hx(JOINT_COL.sidewalk));
    const o0 = lv[2][i], o1 = lv[2][j]; if (Math.hypot(o0.x - o1.x, o0.z - o1.z) > 0.01) A.wall(v(o0, ys), v(o1, ys), y + Z_LAYERS.skirt, ys, hx(JOINT_COL.skirt));
  }
  return lv;
}
/** Полоса разметки поперёк/вдоль в локальных координатах рукава (u вдоль, v поперёк). */
function markRect(M: Acc, o: P, d: P, u0: number, u1: number, v0: number, v1: number, y: number, col: C3) {
  const n = { x: -d.z, z: d.x }; const at = (u: number, w: number) => [o.x + d.x * u + n.x * w, y, o.z + d.z * u + n.z * w];
  M.quad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), col);
}

// ───────────── Перекрёсток (≥3 рукава) ─────────────
/** trim для рукава i: проекция точки касания скругления на ось + прямой хвост под зебру. */
export function junctionTrims(arms: JointArm[], R: number): number[] {
  const ang = arms.map(a => Math.atan2(a.dz, a.dx)); const ord = arms.map((_, i) => i).sort((a, b) => ang[a] - ang[b]); const out = arms.map(() => 0);
  ord.forEach((i, k) => { for (const j of [ord[(k + 1) % ord.length], ord[(k - 1 + ord.length) % ord.length]]) {
    let th = Math.abs(ang[j] - ang[i]); if (th > Math.PI) th = 2 * Math.PI - th; const pi = prof(arms[i].cls), pj = prof(arms[j].cls);
    const u = th > (150 * Math.PI) / 180 ? pj.hw : ((pj.hw + R) + (pi.hw + R) * Math.cos(th)) / Math.sin(th);
    out[i] = Math.max(out[i], u); } });
  return out.map((u, i) => Math.max(u, prof(arms[i].cls).hw) + JOINT_MARKS.straightTail);
}
export function buildJunctionV5(node: P, arms: JointArm[], y = 0): JointMesh {
  const top = arms.reduce((m, a) => RANK[a.cls] > RANK[m] ? a.cls : m, 'lane' as RoadClass); const pt = prof(top);
  const ps = arms.map(a => prof(a.cls)); const curb = Math.max(...ps.map(p => p.c)), sw = Math.max(...ps.map(p => p.sw));
  const R = Math.max(CORNER_R[top], curb + sw + 1.5); const dirs = arms.map(a => { const l = Math.hypot(a.dx, a.dz); return { x: a.dx / l, z: a.dz / l }; });
  const trims = junctionTrims(arms.map((a, i) => ({ ...a, dx: dirs[i].x, dz: dirs[i].z })), R);
  const S: Shape = { cuts: [], extra: [], sdf: (x, z) => { let d = 1e9; dirs.forEach((u, i) => { const hb = ps[i].hw, L = trims[i] + 2, a = -pt.hw; const cu = (a + L) / 2;
    const di = sdBox(x, z, u.x * cu, u.z * cu, u.x, u.z, (L - a) / 2, hb); d = i === 0 ? di : uRound(d, di, R); }); return d; } };
  dirs.forEach((u, i) => { S.cuts.push({ ux: u.x, uz: u.z, L: trims[i], hv: ps[i].hw }); const n = { x: -u.z, z: u.x };
    for (const o of [0, ps[i].c, ps[i].c + ps[i].sw]) for (const s of [1, -1]) { const w = ps[i].hw + o; S.extra.push(Math.atan2(u.z * trims[i] + n.z * w * s, u.x * trims[i] + n.x * w * s)); } });
  const A = new Acc(), M = new Acc(); meshShape(S, node, y, curb, sw, A, Math.max(...trims) + 30);
  // разметка: зебры и стоп-линии на прямом хвосте каждого рукава (правостороннее движение: въезд — правая половина по ходу к узлу)
  const W = hx(JOINT_COL.white), ym = y + Z_LAYERS.marks;
  dirs.forEach((u, i) => { const L = trims[i], hw = ps[i].hw; if (arms[i].cls === 'highway') return;
    const z0 = L - JOINT_MARKS.zebraFrom; for (let v = -hw + 0.5; v + JOINT_MARKS.zebraStripe <= hw - 0.3; v += JOINT_MARKS.zebraStripe * 2) markRect(M, node, u, z0, z0 + JOINT_MARKS.zebraW, v, v + JOINT_MARKS.zebraStripe, ym, W);
    const sa = L - JOINT_MARKS.stopAt; markRect(M, node, u, sa - JOINT_MARKS.stopW, sa, 0, -hw + 0.3, ym, W); });
  return { base: A.geo(), marks: M.geo(), trims };
}

// ───────────── Конец дороги (1 рукав) ─────────────
export type EndCap = 'bulb' | 'round' | 'flat';
/** Конец без «белых» торцов: асфальт, бордюр и тротуар обходят торец. trims[0] — где начинается обычное ребро. */
export function buildDeadEnd(node: P, arm: JointArm, cap: EndCap, y = 0): JointMesh {
  const p = prof(arm.cls), l = Math.hypot(arm.dx, arm.dz), u = { x: arm.dx / l, z: arm.dz / l };
  if (cap === 'bulb' && !END_CAP.bulbR[arm.cls]) cap = 'round';
  const Rb = cap === 'bulb' ? END_CAP.bulbR[arm.cls] : p.hw; const back = cap === 'bulb' ? Rb * 0.55 : cap === 'round' ? -p.hw : -1.5; // центр лучей внутри площадки
  const L = cap === 'flat' ? 2 : cap === 'round' ? p.hw + 3 : Rb + END_CAP.blend + 4; const cx = -u.x * back, cz = -u.z * back; // центр лучей — центр площадки
  const S: Shape = { cuts: [], extra: [], sdf: (x, z) => { x += cx; z += cz; const Lb = cap === 'bulb' ? L : L + p.hw + 2; /* бокс длиннее среза: скругление дальнего торца не попадает в trim */ const box = sdBox(x, z, u.x * Lb / 2, u.z * Lb / 2, u.x, u.z, Lb / 2 + 0.01, p.hw, cap === 'flat' ? END_CAP.flatR : cap === 'round' ? p.hw : 0);
    if (cap !== 'bulb') return box; const circ = Math.hypot(x + u.x * back, z + u.z * back) - Rb; return uRound(box, circ, END_CAP.blend); } };
  const n = { x: -u.z, z: u.x }; S.cuts.push({ ux: u.x, uz: u.z, L: L + back, hv: p.hw });
  for (const o of [0, p.c, p.c + p.sw]) for (const s of [1, -1]) S.extra.push(Math.atan2(u.z * (L + back) + n.z * (p.hw + o) * s, u.x * (L + back) + n.x * (p.hw + o) * s));
  const A = new Acc(), M = new Acc(); meshShape(S, { x: node.x + cx, z: node.z + cz }, y, p.c, p.sw, A, L + Rb + 30);
  return { base: A.geo(), marks: M.geo(), trims: [L] };
}

// ───────────── Переход (2 рукава): смена класса и/или излом ─────────────
/** Ось перехода и профиль по длине. a — рукав «откуда» (старший), b — младший. Излом > 4° — скругление дугой R=rMin класса b.
 *  Возвращает trims: [для a, для b]. Сужение — на рукаве b (младший), длина TAPER. */
export function buildTransition(node: P, a: JointArm, b: JointArm, y = 0): JointMesh {
  if (RANK[b.cls] > RANK[a.cls]) { const r = buildTransition(node, b, a, y); return { ...r, trims: [r.trims[1], r.trims[0]] }; }
  const pa = prof(a.cls), pb = prof(b.cls); const la = Math.hypot(a.dx, a.dz), lb = Math.hypot(b.dx, b.dz); const ua = { x: a.dx / la, z: a.dz / la }, ub = { x: b.dx / lb, z: b.dz / lb };
  const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, ua.x * ub.x + ua.z * ub.z))); // 0 — прямо
  const Lt = pa.hw === pb.hw && pa.sw === pb.sw ? 0 : Math.max(TAPER.min, TAPER.perMeter * Math.abs(pa.hw - pb.hw));
  const R = Math.max(15, pa.hw + pa.c + pa.sw + 3); const tl = turn > (4 * Math.PI) / 180 ? R * Math.tan(turn / 2) : 0;
  // ось: от точки a (tl) через дугу к точке b (tl), затем прямой участок сужения длиной Lt по b
  const pts: P[] = []; const pA = { x: node.x + ua.x * tl, z: node.z + ua.z * tl };
  if (tl > 0) { const bis = { x: ua.x + ub.x, z: ua.z + ub.z }; const bl = Math.hypot(bis.x, bis.z); const dC = R / Math.cos(turn / 2);
    const C = { x: node.x + bis.x / bl * dC, z: node.z + bis.z / bl * dC }; const a0 = Math.atan2(pA.z - C.z, pA.x - C.x); const pB = { x: node.x + ub.x * tl, z: node.z + ub.z * tl }; let a1 = Math.atan2(pB.z - C.z, pB.x - C.x);
    let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; const N = Math.max(4, Math.ceil(Math.abs(da) / (5 * Math.PI / 180)));
    for (let k = 0; k <= N; k++) { const t = a0 + da * k / N; pts.push({ x: C.x + Math.cos(t) * R, z: C.z + Math.sin(t) * R }); } }
  else { pts.push(pA); }
  const startB = tl; const NT = Math.max(2, Math.ceil(Lt / 1.5)); for (let k = tl > 0 ? 1 : 0; k <= NT; k++) { const s = startB + Lt * k / NT; pts.push({ x: node.x + ub.x * s, z: node.z + ub.z * s }); }
  if (pts.length < 2) pts.push({ x: node.x + ub.x * 0.5, z: node.z + ub.z * 0.5 });
  // профиль по точкам: на дуге — профиль a, на сужении — smoothstep a→b
  const nArc = tl > 0 ? pts.length - NT : 1; const k01 = (i: number) => i < nArc ? 0 : (() => { const t = (i - nArc + 1) / NT; return t * t * (3 - 2 * t); })();
  const A = new Acc(), M = new Acc(); const ys = y + Z_LAYERS.curbTop, W = hx(JOINT_COL.white);
  const off = (i: number, d: number): number[] => { const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)]; const tx = p1.x - p0.x, tz = p1.z - p0.z, t = Math.hypot(tx, tz) || 1; return [pts[i].x - tz / t * d, 0, pts[i].z + tx / t * d]; };
  const lerp = (x: number, z: number, k: number) => x + (z - x) * k;
  for (let i = 0; i < pts.length - 1; i++) { const k0 = k01(i), k1 = k01(i + 1);
    const hw0 = lerp(pa.hw, pb.hw, k0), hw1 = lerp(pa.hw, pb.hw, k1), c0 = lerp(pa.c, pb.c, k0), c1 = lerp(pa.c, pb.c, k1), s0 = lerp(pa.sw, pb.sw, k0), s1 = lerp(pa.sw, pb.sw, k1);
    const Y = (q: number[], yy: number) => [q[0], yy, q[2]];
    A.quad(Y(off(i, hw0), y), Y(off(i + 1, hw1), y), Y(off(i + 1, -hw1), y), Y(off(i, -hw0), y), hx(JOINT_COL.asphalt));
    for (const sg of [1, -1]) { A.wall(Y(off(i, sg * hw0), y), Y(off(i + 1, sg * hw1), y), y, ys, hx(JOINT_COL.curbSide));
      A.quad(Y(off(i, sg * hw0), ys), Y(off(i + 1, sg * hw1), ys), Y(off(i + 1, sg * (hw1 + c1)), ys), Y(off(i, sg * (hw0 + c0)), ys), hx(JOINT_COL.curb));
      if (s0 + s1 > 0) A.quad(Y(off(i, sg * (hw0 + c0)), ys), Y(off(i + 1, sg * (hw1 + c1)), ys), Y(off(i + 1, sg * (hw1 + c1 + s1)), ys), Y(off(i, sg * (hw0 + c0 + s0)), ys), hx(JOINT_COL.sidewalk));
      // краевая сплошная плавно следует за кромкой (0.35..0.5 м от бордюра)
      M.quad(Y(off(i, sg * (hw0 - 0.35)), y + Z_LAYERS.marks), Y(off(i + 1, sg * (hw1 - 0.35)), y + Z_LAYERS.marks), Y(off(i + 1, sg * (hw1 - 0.5)), y + Z_LAYERS.marks), Y(off(i, sg * (hw0 - 0.5)), y + Z_LAYERS.marks), W); } }
  // хвост a за узлом (от node до tl по оси a) — тоже часть перехода: прямой кусок, чтобы ребро a начиналось на tl
  return { base: A.geo(), marks: M.geo(), trims: [tl, tl + Lt] };
}

/** Диспетчер по степени узла. arms — направления от узла. */
export function buildNodeMesh(node: P, arms: JointArm[], y = 0, cap: EndCap = 'bulb'): JointMesh {
  if (arms.length >= 3) return buildJunctionV5(node, arms, y);
  if (arms.length === 2) return buildTransition(node, arms[0], arms[1], y);
  return buildDeadEnd(node, arms[0], cap, y);
}
