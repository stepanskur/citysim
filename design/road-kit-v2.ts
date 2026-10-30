/**
 * Road kit v2: поперечные профили по полосам (strip-модель), модули полос (трамвай в асфальте, автобусная,
 * велодорожка), ж/д / метро / трамвайный путь, мосты, тоннели. Всё строится вдоль произвольной осевой
 * (ломаная из road-curves.ts), так что кривые и прямые обслуживает один код. Размеры — ROADS_SPEC.md.
 */
import * as THREE from 'three';
import { P, ribbon, dashedAlong, offsetPolyline, arcLengths, sampleAt } from './road-curves';

type C3 = [number, number, number];
const hx = (h: number): C3 => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const KIT_COL = {
  asphalt: 0x4a4e63, asphaltBus: 0xb5574a, bike: 0x3f8f7a, curb: 0xe6ddd0, sidewalk: 0xd9cbb7, median: 0x8fbf6a,
  white: 0xfff8ee, yellow: 0xffc145, railHead: 0xd8dde6, railWeb: 0x8a8f9c, sleeper: 0xb07a52, sleeperConcrete: 0xc9c2b6,
  ballast: 0xa49a8c, tramGroove: 0x2b2f45, deck: 0xcfc6b8, pier: 0xe9e1d4, railing: 0xfff8ee, portal: 0xe7a88a, tunnelIn: 0x1b1e30,
};
/** Тип полосы: ширина (м), высота верха (м от уровня проезжей части), цвет, разметка. */
export type StripKind = 'lane' | 'busLane' | 'tramLane' | 'bike' | 'median' | 'curb' | 'sidewalk' | 'shoulder';
export const STRIP: Record<StripKind, { w: number; h: number; col: number }> = {
  lane: { w: 3.5, h: 0, col: KIT_COL.asphalt }, busLane: { w: 3.5, h: 0, col: KIT_COL.asphaltBus }, tramLane: { w: 3.2, h: 0, col: KIT_COL.asphalt },
  bike: { w: 1.75, h: 0.02, col: KIT_COL.bike }, median: { w: 2, h: 0.15, col: KIT_COL.median }, curb: { w: 0.3, h: 0.15, col: KIT_COL.curb },
  sidewalk: { w: 2.5, h: 0.15, col: KIT_COL.sidewalk }, shoulder: { w: 2.5, h: 0, col: 0x5a5e72 },
};
export interface Strip { kind: StripKind; w?: number }
/** Профили слева направо (по ходу оси). Сумма ширин — полная ширина в красных линиях. */
export const PROFILES: Record<string, Strip[]> = {
  highway: [{ kind: 'shoulder' }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'median', w: 3 }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'shoulder' }],
  avenueTram: [{ kind: 'sidewalk', w: 3.5 }, { kind: 'curb' }, { kind: 'bike' }, { kind: 'busLane' }, { kind: 'lane' }, { kind: 'tramLane' }, { kind: 'tramLane' }, { kind: 'lane' }, { kind: 'busLane' }, { kind: 'bike' }, { kind: 'curb' }, { kind: 'sidewalk', w: 3.5 }],
  avenue: [{ kind: 'sidewalk', w: 3.5 }, { kind: 'curb' }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'median', w: 2 }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'curb' }, { kind: 'sidewalk', w: 3.5 }],
  street: [{ kind: 'sidewalk' }, { kind: 'curb' }, { kind: 'lane' }, { kind: 'lane' }, { kind: 'curb' }, { kind: 'sidewalk' }],
  lane: [{ kind: 'sidewalk', w: 1.5 }, { kind: 'curb', w: 0.2 }, { kind: 'lane', w: 4.5 }, { kind: 'curb', w: 0.2 }, { kind: 'sidewalk', w: 1.5 }],
};
export const profileWidth = (p: Strip[]) => p.reduce((s, x) => s + (x.w ?? STRIP[x.kind].w), 0);

class Acc { p: number[] = []; c: number[] = []; geo() { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.computeVertexNormals(); return g; } }

/** Брусок вдоль оси: смещения a..b, низ y0, верх y1 (верх + 2 боковины). */
function bar(A: Acc, ctr: P[], a: number, b: number, y0: number, y1: number, col: C3) {
  ribbon(ctr, b, a, y1, col, A.p, A.c);
  const side = (d: number, flip: boolean) => { const L = offsetPolyline(ctr, d); const k = 0.82; const cc: C3 = [col[0] * k, col[1] * k, col[2] * k];
    for (let i = 0; i < L.length - 1; i++) { const p = L[i], q = L[i + 1]; const v = flip ? [p.x, y0, p.z, q.x, y0, q.z, q.x, y1, q.z, p.x, y0, p.z, q.x, y1, q.z, p.x, y1, p.z] : [p.x, y0, p.z, q.x, y1, q.z, q.x, y0, q.z, p.x, y0, p.z, p.x, y1, p.z, q.x, y1, q.z]; A.p.push(...v); for (let j = 0; j < 6; j++) A.c.push(...cc); } };
  if (y1 - y0 > 1e-3) { side(a, false); side(b, true); }
}
/** Повторяющийся объект вдоль оси с шагом step (шпалы, стойки ограждения). */
function along(ctr: P[], step: number, f: (p: P, t: P) => void, start = step / 2) { const S = arcLengths(ctr); for (let s = start; s < S[S.length - 1]; s += step) { const r = sampleAt(ctr, S, s); f(r.p, r.t); } }
function oBox(A: Acc, p: P, t: P, off: number, y0: number, len: number, w: number, h: number, col: C3) { // ориентированный бокс
  const n = { x: -t.z, z: t.x }, c = { x: p.x + n.x * off, z: p.z + n.z * off };
  const seg: P[] = [{ x: c.x - t.x * len / 2, z: c.z - t.z * len / 2 }, { x: c.x + t.x * len / 2, z: c.z + t.z * len / 2 }];
  bar(A, seg, w / 2, -w / 2, y0, y0 + h, col);
}

/** Поперечный профиль вдоль оси. Возвращает base + marks (marks рисовать с polygonOffset −2/−2, renderOrder 2). */
export function buildProfile(ctr: P[], prof: Strip[], y = 0) {
  const base = new Acc(), marks = new Acc(); const W = profileWidth(prof); let x = W / 2; const WH = hx(KIT_COL.white);
  prof.forEach((s, i) => {
    const w = s.w ?? STRIP[s.kind].w, d = STRIP[s.kind]; const a = x, b = x - w; x = b;
    bar(base, ctr, a, b, y - 0.3, y + d.h, hx(d.col));
    if (s.kind === 'tramLane') embeddedTramRails(base, ctr, (a + b) / 2, y);
    if (s.kind === 'busLane') { along(ctr, 40, (p, t) => oBox(marks, p, t, (a + b) / 2, y + 0.01, 2.2, 1.6, 0.005, WH)); } // «А» блоками
    const nx = prof[i + 1]; if (nx && (['lane', 'busLane', 'tramLane'] as StripKind[]).includes(s.kind) && (['lane', 'busLane', 'tramLane'] as StripKind[]).includes(nx.kind)) {
      if (s.kind === nx.kind && s.kind !== 'tramLane') dashedAlong(ctr, b, 0.15, 3, 6, y + 0.01, WH, marks.p, marks.c); else ribbon(ctr, b + 0.1, b - 0.1, y + 0.01, s.kind === 'tramLane' || nx.kind === 'tramLane' ? hx(KIT_COL.yellow) : WH, marks.p, marks.c);
    }
  });
  return { base: base.geo(), marks: marks.geo(), width: W };
}
/** Трамвайные рельсы, утопленные в покрытие: головка на уровне асфальта, тёмный жёлоб 0.05 м с внутренней стороны. Колея 1.524. */
export function embeddedTramRails(A: Acc, ctr: P[], off: number, y: number) {
  for (const s of [-0.762, 0.762]) { bar(A, ctr, off + s + 0.04, off + s - 0.04, y, y + 0.012, hx(KIT_COL.railHead)); const g = off + s - Math.sign(s) * 0.07; bar(A, ctr, g + 0.025, g - 0.025, y, y + 0.006, hx(KIT_COL.tramGroove)); }
}
/** Путь на балласте (ж/д, наземный трамвай/метро). sleeper: дерево 2.6×0.24 шаг 0.6 / бетон 2.7×0.3 шаг 0.6. */
export function buildTrack(ctr: P[], o: { y?: number; ballast?: boolean; concrete?: boolean; gauge?: number } = {}) {
  const A = new Acc(); const y = o.y ?? 0, g = (o.gauge ?? 1.524) / 2, bal = o.ballast ?? true; const yb = y + (bal ? 0.35 : 0);
  if (bal) { bar(A, ctr, 1.6, -1.6, y, yb, hx(KIT_COL.ballast)); bar(A, ctr, 2.4, 1.6, y, y + 0.17, hx(KIT_COL.ballast)); bar(A, ctr, -1.6, -2.4, y, y + 0.17, hx(KIT_COL.ballast)); }
  along(ctr, 0.6, (p, t) => oBox(A, { x: p.x, z: p.z }, { x: -t.z, z: t.x }, 0, yb, o.concrete ? 2.7 : 2.6, o.concrete ? 0.3 : 0.24, 0.16, hx(o.concrete ? KIT_COL.sleeperConcrete : KIT_COL.sleeper)));
  for (const s of [-g, g]) { bar(A, ctr, s + 0.04, s - 0.04, yb + 0.16, yb + 0.31, hx(KIT_COL.railWeb)); bar(A, ctr, s + 0.037, s - 0.037, yb + 0.31, yb + 0.34, hx(KIT_COL.railHead)); }
  return A.geo();
}
/** Мост: настил толщиной 1.2 м (балка-кессон), опоры шагом span, перила 1.1 м со стойками шаг 2 м. ctr — ось на уровне настила y. */
export function buildBridge(ctr: P[], width: number, y: number, groundY: number, span = 32) {
  const A = new Acc(), w = width / 2;
  bar(A, ctr, w + 0.5, -w - 0.5, y - 1.2, y, hx(KIT_COL.deck));
  bar(A, ctr, w * 0.7, -w * 0.7, y - 2.0, y - 1.2, hx(0xbdb4a5)); // кессон
  for (const s of [1, -1]) { bar(A, ctr, s * (w + 0.5), s * (w + 0.2), y, y + 0.35, hx(KIT_COL.curb)); bar(A, ctr, s * (w + 0.45), s * (w + 0.3), y + 1.0, y + 1.1, hx(KIT_COL.railing)); }
  along(ctr, 2, (p, t) => { for (const s of [1, -1]) oBox(A, p, t, s * (w + 0.38), y + 0.35, 0.08, 0.08, 0.65, hx(KIT_COL.railing)); });
  along(ctr, span, (p, t) => { oBox(A, p, t, 0, groundY - 1, 2.2, width * 0.55, y - 2 - groundY + 1, hx(KIT_COL.pier)); oBox(A, p, t, 0, y - 2.6, 3, width * 0.9, 0.6, hx(KIT_COL.pier)); }, span);
  return A.geo();
}
/** Портал тоннеля: стена‑оголовок 3 м над сводом, тёмный проём, откосы. Ставится в точке p с направлением t (въезд по +t). */
export function buildTunnelPortal(p: P, t: P, width: number, height = 6, y = 0) {
  const A = new Acc(), n = { x: -t.z, z: t.x }, W = width / 2 + 1;
  oBox(A, p, n, 0, y, 1.2, width + 6, height + 3, hx(KIT_COL.portal)); // оголовок (n как «касательная» → стена поперёк оси)
  // проём — тёмная вставка чуть впереди стены
  const q = { x: p.x - t.x * 0.62, z: p.z - t.z * 0.62 }; oBox(A, q, n, 0, y, 0.02, width + 1, height, hx(KIT_COL.tunnelIn));
  oBox(A, { x: p.x - t.x * 0.7, z: p.z - t.z * 0.7 }, n, 0, y + height + 2.6, 0.3, width + 6.4, 0.4, hx(KIT_COL.white)); // карниз
  for (const s of [1, -1]) oBox(A, { x: p.x - t.x * 4 + n.x * s * (W + 2), z: p.z - t.z * 4 + n.z * s * (W + 2) }, t, 0, y, 7, 1, height * 0.6, hx(KIT_COL.portal)); // подпорные стенки
  return A.geo();
}
/** Внутренность тоннеля (для x-ray): лоток + стены + свод из 8 граней. */
export function buildTunnelTube(ctr: P[], width: number, height: number, y: number) {
  const A = new Acc(), w = width / 2; bar(A, ctr, w, -w, y - 0.4, y, hx(0x55597a));
  for (const s of [1, -1]) bar(A, ctr, s * (w + 0.3), s * w, y, y + height * 0.6, hx(0xf3ebe0));
  const N = 8; for (let i = 0; i < N; i++) { const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N; const x0 = w * Math.cos(a0), x1 = w * Math.cos(a1); const y0 = y + height * 0.6 + height * 0.4 * Math.sin(a0), y1 = y + height * 0.6 + height * 0.4 * Math.sin(a1);
    const L0 = offsetPolyline(ctr, x0), L1 = offsetPolyline(ctr, x1); const m = Math.min(L0.length, L1.length);
    for (let k = 0; k < m - 1; k++) { A.p.push(L0[k].x, y0, L0[k].z, L1[k].x, y1, L1[k].z, L0[k + 1].x, y0, L0[k + 1].z, L0[k + 1].x, y0, L0[k + 1].z, L1[k].x, y1, L1[k].z, L1[k + 1].x, y1, L1[k + 1].z); for (let j = 0; j < 6; j++) A.c.push(0.95, 0.92, 0.88); } }
  return A.geo();
}
