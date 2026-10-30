// G1 (UI_SPEC v5): меню строительства как в Cities: Skylines — службы (Q W E R T), подвкладки (Tab), карточки (1–9), Esc.
// Разметка/стили — design/ui.css .cs-bm*, .cs-card, .cs-tip; картинки — public/cards (копия design/cards).
import type { Game } from './game';
import type { ToolId } from './tools';
import { PLACEABLES } from './tools';
import { ROAD_TYPES } from './world/RoadNet';
import { LINE_TYPES } from './sim/Transit';
import { fmtMoney } from './util';

interface Card { img: string; nm: string; desc: string; cost: number; upkeep: number; unit?: string; act: [ToolId, number]; lock?: (g: Game) => string }
interface Sub { nm: string; c: string; cards: Card[] }
interface Svc { id: string; ic: string; nm: string; hk: string; sub: Sub[] }
const ROAD_IMG = ['office', 'res-tower', 'industrial', 'house'];
const hasRail = (g: Game, t: number) => g.world.rail.edges.some((e: any) => e.alive && e.type === t);
const PL = (i: number) => PLACEABLES[i];
export const MENU: Svc[] = [
  { id: 'roads', ic: '🛣️', nm: 'Дороги', hk: 'Q', sub: [
    { nm: 'Прямые', c: '#c9c9d6', cards: ROAD_TYPES.map((r, i) => ({ img: ROAD_IMG[i], nm: r.name, desc: `${r.lanes * 2} полосы, ${Math.round(r.speed * 3.6)} км/ч, ширина ${r.w} м.`, cost: r.cost * 100, unit: '/100 м', upkeep: Math.round(r.upkeep * 100 * 7), act: ['road', i] as [ToolId, number] })) },
    { nm: 'Кривые', c: '#9fb4ff', cards: ROAD_TYPES.map((r, i) => ({ img: ROAD_IMG[i], nm: r.name + ' (кривая)', desc: 'Клик — начало, клик — изгиб, клик — конец.', cost: r.cost * 100, unit: '/100 м', upkeep: Math.round(r.upkeep * 100 * 7), act: ['curve', i] as [ToolId, number] })) },
    { nm: 'Узлы', c: '#ffc145', cards: ['Авто', 'Светофор', 'Приоритет', 'Без регулирования', 'Одностороннее ⇄'].map((nm, i) => ({ img: 'office', nm, desc: i < 4 ? 'Режим регулирования узла — клик по перекрёстку.' : 'Клик по улице: по ходу → обратно → двустороннее.', cost: 0, upkeep: 0, act: ['traffic', i] as [ToolId, number] })) }] },
  { id: 'zones', ic: '▦', nm: 'Зоны', hk: 'W', sub: [{ nm: 'Зонирование', c: '#5fe09a', cards: [
    { img: 'house', nm: 'Жилая', desc: 'Тема (СНГ / классика / Париж / пастила) — в панели кисти, Shift+колесо.', cost: 0, upkeep: 0, act: ['zone', 1] },
    { img: 'office', nm: 'Коммерческая', desc: 'Магазины и офисы.', cost: 0, upkeep: 0, act: ['zone', 2] },
    { img: 'industrial', nm: 'Промышленная', desc: 'Заводы и склады.', cost: 0, upkeep: 0, act: ['zone', 3] },
    { img: 'civic', nm: 'Снять зону', desc: 'Очистить зонирование участков.', cost: 0, upkeep: 0, act: ['zone', 0] }] }] },
  { id: 'services', ic: '🏛️', nm: 'Службы', hk: 'E', sub: [{ nm: 'Грузы', c: '#8ab8ff', cards: [
    { img: 'industrial', nm: PL(0).name, desc: PL(0).hint, cost: PL(0).cost, upkeep: 0, act: ['place', 0] },
    { img: 'rail-station', nm: PL(2).name, desc: PL(2).hint, cost: PL(2).cost, upkeep: 0, act: ['place', 2] },
    { img: 'civic', nm: PL(3).name, desc: PL(3).hint, cost: PL(3).cost, upkeep: 0, act: ['place', 3], lock: g => (g.eco as any).cities.reduce((s: number, c: any) => s + (c.pop || 0), 0) < 20000 ? 'Нужно население 20 000' : '' }] }] },
  { id: 'transit', ic: '🚌', nm: 'Транспорт', hk: 'R', sub: [
    { nm: 'Автобусы', c: '#ff7a59', cards: [{ img: 'bus', nm: 'Автобусная линия', desc: 'Кликайте остановки по улицам; двойной клик — завершить.', cost: LINE_TYPES[0].stopCost, unit: '/ост.', upkeep: LINE_TYPES[0].upkeep, act: ['line', 0] }] },
    { nm: 'Трамваи', c: '#1fc7b8', cards: [
      { img: 'tram', nm: 'Трамвайные пути', desc: 'По улице или отдельно; модуль «Трамвай» у дороги.', cost: Math.round(LINE_TYPES[1].kmCost / 10), unit: '/100 м', upkeep: 0, act: ['rail', 1] },
      { img: 'tram-stop', nm: 'Трамвайная линия', desc: 'Остановки по путям.', cost: LINE_TYPES[1].stopCost, unit: '/ост.', upkeep: LINE_TYPES[1].upkeep, act: ['line', 1], lock: g => hasRail(g, 1) || g.world.net.edges.some((e: any) => e.alive && (e.mods & 1)) ? '' : 'Нет трамвайных путей' }] },
    { nm: 'Метро', c: '#c49aff', cards: [
      { img: 'metro-platform', nm: 'Тоннель метро', desc: 'Глубина по уровню (L), по умолчанию −2.', cost: Math.round(LINE_TYPES[2].kmCost / 10), unit: '/100 м', upkeep: 0, act: ['rail', 2] },
      { img: 'metro-entrance', nm: 'Линия метро', desc: 'Станции по тоннелю.', cost: LINE_TYPES[2].stopCost, unit: '/ст.', upkeep: LINE_TYPES[2].upkeep, act: ['line', 2], lock: g => hasRail(g, 2) ? '' : 'Нет тоннеля метро' }] },
    { nm: 'Ж/д', c: '#7aaaff', cards: [
      { img: 'rail-platform', nm: 'Ж/д пути', desc: 'Секция пути с контактной сетью.', cost: Math.round(LINE_TYPES[3].kmCost / 10), unit: '/100 м', upkeep: 0, act: ['rail', 0] },
      { img: 'rail-loco', nm: 'Пригородная линия', desc: 'Маршрут поездов по путям.', cost: LINE_TYPES[3].stopCost, unit: '/ст.', upkeep: LINE_TYPES[3].upkeep, act: ['line', 3], lock: g => hasRail(g, 0) ? '' : 'Нет ж/д путей' }] }] },
  { id: 'parks', ic: '🌳', nm: 'Парки', hk: 'T', sub: [{ nm: 'Парки', c: '#5fe09a', cards: [{ img: 'tree-oak', nm: PL(1).name, desc: PL(1).hint, cost: PL(1).cost, upkeep: 0, act: ['place', 1] }] }] },
];

export class BuildMenu {
  el: HTMLElement; tip: HTMLElement; open = false; S = 0; T = 0; C = -1;
  constructor(private g: Game, parent: HTMLElement) {
    this.el = document.createElement('div'); this.el.className = 'cs-bm'; this.el.id = 'buildmenu'; this.el.hidden = true; this.el.style.bottom = '88px';
    this.el.innerHTML = `<div class="cs-bm-svc" role="tablist"></div><div class="cs-bm-body"><div class="cs-bm-sub"></div><div class="cs-bm-cards"></div></div>`;
    this.tip = document.createElement('div'); this.tip.className = 'cs-tip'; parent.append(this.el, this.tip);
    this.el.addEventListener('click', e => { const b = (e.target as HTMLElement).closest('[data-i],[data-t],[data-c]') as HTMLElement | null; if (!b) return;
      if (b.dataset.i) { this.S = +b.dataset.i; this.T = 0; this.C = -1; } else if (b.dataset.t) { this.T = +b.dataset.t; this.C = -1; } else if (b.getAttribute('aria-disabled') !== 'true') this.pick(+b.dataset.c!); this.draw(); });
    this.el.addEventListener('mouseover', e => this.hover(e)); this.el.addEventListener('mouseleave', () => this.tip.classList.remove('on'));
    // хоткеи: в открытом меню Q W E R T перехватываются у камеры (capture), B — открыть/закрыть
    window.addEventListener('keydown', e => { if ((e.target as HTMLElement).tagName === 'INPUT') return; const k = e.key.toUpperCase();
      if (k === 'B' || k === 'И') { this.toggle(); e.stopImmediatePropagation(); return; }
      if (!this.open) return; const i = MENU.findIndex(m => m.hk === k || m.hk === ({ Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T' } as any)[k]);
      if (i >= 0) { this.S = i; this.T = 0; this.C = -1; } else if (e.key === 'Tab') { this.T = (this.T + 1) % MENU[this.S].sub.length; this.C = -1; }
      else if (/^[1-9]$/.test(e.key)) { const n = +e.key - 1; if (n < MENU[this.S].sub[this.T].cards.length) this.pick(n); }
      else if (e.key === 'Escape') { if (this.C >= 0) { this.C = -1; g.tools.set('select', 0); g.ui.refreshTools(); } else this.toggle(false); }
      else return;
      e.preventDefault(); e.stopImmediatePropagation(); this.draw(); }, { capture: true });
  }
  toggle(on = !this.open) { this.open = on; this.el.hidden = !on; if (!on) this.tip.classList.remove('on'); this.draw(); }
  pick(i: number) { const c = MENU[this.S].sub[this.T].cards[i]; if (c.lock?.(this.g)) return; this.C = i; this.g.tools.set(c.act[0], c.act[1]); this.g.ui.refreshTools(); }
  draw() { if (!this.open) return; const g = this.g, m = MENU[this.S], sub = m.sub[this.T]; const $ = (s: string) => this.el.querySelector(s) as HTMLElement;
    $('.cs-bm-svc').innerHTML = MENU.map((s, i) => `<button role="tab" aria-selected="${i === this.S}" data-i="${i}" title="${s.nm} (${s.hk})"><span class="ic">${s.ic}</span>${s.nm}</button>`).join('');
    $('.cs-bm-sub').innerHTML = m.sub.map((s, i) => `<button aria-selected="${i === this.T}" data-t="${i}" style="--c:${s.c}"><i></i>${s.nm}</button>`).join('');
    $('.cs-bm-cards').innerHTML = sub.cards.map((c, i) => { const lk = c.lock?.(g) || '', poor = c.cost > g.eco.money;
      return `<div class="cs-card ${poor ? 'poor' : ''}" style="--i:${i}" data-c="${i}" aria-selected="${i === this.C}" aria-disabled="${!!lk}"><span class="hk">${i + 1}</span>${lk ? '<span class="lock">🔒</span>' : ''}<img src="cards/${c.img}.png" alt=""><div class="nm">${c.nm}</div><div class="pr"><b>${c.cost ? fmtMoney(c.cost) + (c.unit || '') : '—'}</b><span>${c.upkeep ? fmtMoney(c.upkeep) + '/нед' : ''}</span></div></div>`; }).join(''); }
  hover(e: MouseEvent) { const k = (e.target as HTMLElement).closest('.cs-card') as HTMLElement | null; if (!k) { this.tip.classList.remove('on'); return; }
    const c = MENU[this.S].sub[this.T].cards[+k.dataset.c!], r = k.getBoundingClientRect(), lk = c.lock?.(this.g) || '';
    this.tip.innerHTML = `<h4>${c.nm}</h4><p>${c.desc}</p><dl><dt>Стоимость</dt><dd>${c.cost ? fmtMoney(c.cost) + (c.unit || '') : '—'}</dd><dt>Содержание</dt><dd>${c.upkeep ? fmtMoney(c.upkeep) + '/нед' : '—'}</dd></dl>${lk ? `<div class="why">🔒 ${lk}</div>` : ''}`;
    this.tip.style.left = Math.min(r.left, innerWidth - 296) + 'px'; this.tip.style.top = (this.el.getBoundingClientRect().top - this.tip.offsetHeight - 10) + 'px'; void r; this.tip.classList.add('on'); }
}
