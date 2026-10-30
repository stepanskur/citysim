/** Этап E (mechanics/15): линия по остановкам — матрица посадок/высадок, загрузка перегонов, расписание, автоподбор ТС. Чистые функции. */
import { BALANCE } from './balance';
const B = () => BALANCE.lines;
export type PeriodId = 'amPeak' | 'day' | 'pmPeak' | 'evening' | 'night';

/** §1: проверка шага остановок; возвращает предупреждения по перегонам */
export function spacingWarnings(type: number, stops: { x: number; z: number }[]) {
  const mn = B().stopSpacingMin[type] ?? 0, mx = B().stopSpacingMax[type] ?? 1e9; const out: { i: number; d: number; kind: 'slow' | 'gap' }[] = [];
  for (let i = 1; i < stops.length; i++) { const d = Math.hypot(stops[i].x - stops[i - 1].x, stops[i].z - stops[i - 1].z); if (d < mn) out.push({ i, d, kind: 'slow' }); else if (d > mx) out.push({ i, d, kind: 'gap' }); }
  return out;
}
/** §3: board/alight/segLoad по матрице T (T[i][j], i<j — «туда», i>j — «обратно») */
export function loadsFromOD(T: number[][]) {
  const n = T.length; const board = new Array(n).fill(0), alight = new Array(n).fill(0); const fwd = new Array(Math.max(0, n - 1)).fill(0), back = new Array(Math.max(0, n - 1)).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const t = T[i][j] || 0; if (!t || i === j) continue; board[i] += t; alight[j] += t;
    if (i < j) for (let k = i; k < j; k++) fwd[k] += t; else for (let k = j; k < i; k++) back[k] += t; }
  return { board, alight, fwd, back };
}
/** Гравитационная OD по остановкам: жители у i × рабочие места у j, без пар i=j; нормировано к total поездок */
export function gravityOD(pops: number[], jobs: number[], total: number) {
  const n = pops.length; const T = pops.map(() => new Array(n).fill(0)); let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) { const v = pops[i] * jobs[j] / (1 + Math.abs(i - j) * 0.15); T[i][j] = v; s += v; }
  const k = s > 0 ? total / s : 0; for (const r of T) for (let j = 0; j < n; j++) r[j] *= k; return T;
}
/** Время оборота, мин: путь (длина L — уже туда-обратно) + стоянки + 2 мин на развороты по концам */
export function cycleTimeMin(L: number, speed: number, stops: number, type: number, loop = false) {
  const dw = type <= 1 ? B().dwellMin : B().dwellMin * 0.6; return L / speed / 60 + dw * stops * (loop ? 1 : 2) + (loop ? 0 : 4);
}
/** §2: интервалы и ТС по периодам из базового (пикового) интервала */
export function schedule(cycleMin: number, nPeak: number) {
  const base = Math.max(2, Math.min(30, cycleMin / Math.max(1, nPeak))); const P = B().periods;
  return (Object.keys(P) as PeriodId[]).map(id => { const m = P[id].headwayMult; const hw = m > 0 ? Math.min(30, base * m) : 0; return { period: id, headwayMin: hw, vehicles: hw ? Math.ceil(cycleMin / hw) : 0, hours: P[id].to - P[id].from }; });
}
/** ёмкость в час при интервале */ export const capPerHour = (headwayMin: number, cap: number) => headwayMin > 0 ? 60 / headwayMin * cap : 0;
/** §4: автоподбор: целевое число ТС, не больше ±autoMaxDailyChange от текущего, интервал 2–30 мин */
export function autoTarget(cycleMin: number, maxSegLoadPeakHour: number, cap: number, cur: number) {
  let n = Math.ceil(cycleMin * maxSegLoadPeakHour / (cap * 60 * B().targetLoad));
  n = Math.max(n, Math.ceil(cycleMin / 30)); n = Math.min(n, Math.floor(cycleMin / 2)); n = Math.max(1, n);
  const step = Math.max(1, Math.round(cur * B().autoMaxDailyChange)); return Math.max(cur - step, Math.min(cur + step, n));
}
/** §3.3: переполнение: доля поездок, теряемая из-за пропуска переполненных ТС */
export const crowdLoss = (load: number) => load > 1 ? (load - 1) / load * 0.5 : 0;
