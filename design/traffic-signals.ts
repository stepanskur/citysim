/**
 * FIX_VISUALS §1 — размещение светофоров и визуальные фазы. Чистая математика, без THREE-сцены.
 * Координаты: 1 юнит = 1 м, Y вверх, правостороннее движение.
 */
import { SIGNAL, ROAD_SPEC } from './palette';

export interface Approach { /** id ребра */ e: number; /** единичный вектор ОТ узла вдоль ребра */ dx: number; dz: number; /** тип ROAD_TYPES */ type: number; /** длина ребра, м */ len: number; alive: boolean }
export interface SignalPlacement { e: number; x: number; z: number; /** rotation.y модели (лицо +Z смотрит навстречу подъезжающим) */ rot: number; /** 0 = главная ось, 1 = второстепенная (для фаз) */ group: 0 | 1; scale: number }

/** Радиус площадки перекрёстка: половина самого широкого полотна + радиус скругления углов этого класса. */
export function padRadius(app: Approach[]): number {
  let r = 0; for (const a of app) if (a.alive) r = Math.max(r, ROAD_SPEC.asphalt[a.type] / 2 + ROAD_SPEC.cornerR[a.type] * 0.5); return r;
}

/** Нужен ли светофор на узле. */
export function needsSignals(app: Approach[]): boolean {
  const live = app.filter(a => a.alive);
  if (live.length < 3) return false;                                   // 2 подхода — это изгиб дороги, а не перекрёсток
  const major = live.filter(a => a.type === 0 || a.type === 1 || a.type === 2).length;
  if (major < 2) return false;                                         // переулки регулируются «помехой справа»
  if (live.every(a => a.type === 2)) return false;                     // развязка шоссе — без светофоров
  return true;
}

/**
 * Позиции: по одному светофору на каждый живой подход (справа по ходу, за бордюром),
 * плюс второй «дальний» (слева, на разделителе) для проспектов и шоссе (полотно ≥ 12 м).
 * camDist — расстояние от камеры до узла (для LOD).
 */
export function placeSignals(nx: number, nz: number, app: Approach[], camDist = 0): SignalPlacement[] {
  if (camDist > SIGNAL.lodDist || !needsSignals(app)) return [];
  const live = app.filter(a => a.alive);
  const pad = padRadius(live);
  const scale = camDist <= SIGNAL.lodFadeFrom ? 1 : 1 - (camDist - SIGNAL.lodFadeFrom) / (SIGNAL.lodDist - SIGNAL.lodFadeFrom);
  // главная ось = направление самого «старшего» подхода (шоссе > проспект > улица)
  const rank = (t: number) => [1, 2, 3, 0][t];
  const main = live.reduce((m, a) => rank(a.type) > rank(m.type) ? a : m, live[0]);
  const out: SignalPlacement[] = [];
  for (const a of live) {
    if (a.len < pad * 2 + 6) continue;                                // слишком короткое ребро — светофор упрётся в соседний узел
    const half = ROAD_SPEC.asphalt[a.type] / 2;
    const rx = a.dz, rz = -a.dx;                                       // «право» для машины, едущей К узлу (вектор −d)
    const along = pad + SIGNAL.back;                                   // за стоп-линией, у пешеходного перехода
    const lat = half + ROAD_SPEC.curbW + SIGNAL.side;                  // за бордюром на тротуаре
    const group: 0 | 1 = Math.abs(a.dx * main.dx + a.dz * main.dz) > Math.cos(35 * Math.PI / 180) ? 0 : 1;
    const rot = Math.atan2(a.dx, a.dz);
    out.push({ e: a.e, x: nx + a.dx * along + rx * lat, z: nz + a.dz * along + rz * lat, rot, group, scale });
    if (ROAD_SPEC.asphalt[a.type] >= 12) {                             // дублирующий слева (на разделителе)
      const ml = ROAD_SPEC.median[a.type] / 2 * 0.5;
      out.push({ e: a.e, x: nx + a.dx * along - rx * ml, z: nz + a.dz * along - rz * ml, rot, group, scale });
    }
  }
  return out;
}

export type SignalState = 0 | 1 | 2; // 0 красный, 1 жёлтый, 2 зелёный (= индекс лампы в SIGNAL_LAMPS: 0 верх-красный … 2 низ-зелёный)

/**
 * Визуальная фаза. Если в симуляции есть green(node,e) — передайте его в simGreen и время до переключения в tLeft.
 * Иначе — детерминированный цикл: G 18 c → Y 3 c → all-red 1 c для группы 0, затем то же для группы 1 (цикл 44 c).
 */
export function signalState(group: 0 | 1, nodeId: number, t: number, simGreen?: boolean, tLeft?: number): SignalState {
  const { green: G, yellow: Y, allRed: R } = SIGNAL.phase;
  if (simGreen !== undefined) return simGreen ? (tLeft !== undefined && tLeft < Y ? 1 : 2) : 0;
  const cyc = 2 * (G + Y + R); const off = ((nodeId * 2654435761) >>> 0) % 1000 / 1000 * cyc;
  let p = (t + off) % cyc; if (group === 1) p = (p + G + Y + R) % cyc;
  return p < G ? 2 : p < G + Y ? 1 : 0;
}
export const SIGNAL_STATE_COLOR = [SIGNAL.red, SIGNAL.yellow, SIGNAL.green];
