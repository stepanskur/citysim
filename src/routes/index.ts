// Точка подключения маршрутов: attachRoutes(game) после создания Game.
import type { Game } from '../game';
import { RoutesSystem } from './system';
import { RoutesPanel } from './RoutesPanel';
export * from './types'; export * from './rules'; export { RoutesSystem } from './system';
export function attachRoutes(g: Game) {
  const sys = new RoutesSystem(g); const panel = new RoutesPanel(g, sys);
  const loop = () => { sys.frame(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  (g as any).routes = sys; return { sys, panel };
}
