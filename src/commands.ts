/**
 * Слой команд игрока. Любое изменение состояния региона игроком = сериализуемая команда (JSON),
 * которая применяется через Game.exec(cmd). Тот же путь используется для:
 *  - журнала действий в сохранении (replay),
 *  - будущего сетевого слоя (команды рассылаются сервером, симуляция детерминирована по seed),
 *  - модулей-плагинов (например src/routes/ для межрегиональных маршрутов) через registerCommand().
 * Формат: { a: <тип>, p?: number[], t?: number, ...доп. поля, m?: игровая минута, by?: id игрока }
 * НЕ меняйте существующие поля без записи в PROGRESS.md.
 */
export type Cmd =
  | { a: 'road'; p: [number, number, number, number]; t: number }          // ax,az,bx,bz, тип дороги
  | { a: 'curve'; p: [number, number, number, number, number, number]; t: number } // a, control, b
  | { a: 'zone'; p: [number, number, number, number]; t: number }          // прямоугольник, Z
  | { a: 'bull'; p: [number, number] }
  | { a: 'terra'; p: [number, number]; t: number; h: number; s: number }
  | { a: 'place'; p: [number, number]; t: number }
  | { a: 'line'; p: number[]; t: number }                                   // остановки x,z,...; тип LINE_TYPES
  | { a: 'lineVeh'; id: number; d: number } | { a: 'lineFare'; id: number; d: number } | { a: 'lineDel'; id: number }
  | { a: 'tax'; k: 'R' | 'C' | 'I'; v: number }
  | { a: 'loan'; i: number } | { a: 'repay' }
  | { a: 'buySub'; i: number }
  | { a: string; [k: string]: any };
export type CmdHandler = (game: any, cmd: any, replay: boolean) => boolean | void;
export const extraHandlers = new Map<string, CmdHandler>();
/** точка подключения для внешних модулей (src/routes/ и т.п.) */
export function registerCommand(a: string, h: CmdHandler) { extraHandlers.set(a, h); }
