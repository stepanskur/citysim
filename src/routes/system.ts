// Интеграция маршрутов с игрой: территория по умолчанию, хуки Transit, экономика, тики. Без правок Transit.ts.
import type { Game } from '../game';
import { LINE_TYPES } from '../sim/Transit';
import { RouteBook, DAYS_PER_MONTH } from './rules';
import { MODE_INFO } from './types';
import type { Territory, OwnerId, Route, RouteCommand, AIProfile } from './types';

const KIND_PROFILE: Record<string, AIProfile> = { trade: 'cooperative', resort: 'cooperative', port: 'mercantile', agri: 'cautious', industrial: 'protectionist' };

/** Территория по умолчанию. Если мир/подрегионы предоставят world.ownerAt / ownerName / isAI / relation — используются они (хук для 08-expansion). Иначе: подрегион = город, подрегион 0 — игрок 0, остальные — ИИ-соседи (владелец = индекс города). */
export function defaultTerritory(g: Game, me: OwnerId = 0): Territory {
  const w: any = g.world; const rel = new Map<string, number>();
  const key = (a: number, b: number) => a < b ? a + ':' + b : b + ':' + a;
  return {
    ownerAt: (x, z) => w.ownerAt ? w.ownerAt(x, z) : (w.subOf ? w.subOf(x, z) : w.nearestCity(x, z, 1e9)),
    cityAt: (x, z) => w.nearestCity(x, z, 1e9),
    isAI: o => w.isAI ? w.isAI(o) : o !== me,
    profile: o => KIND_PROFILE[w.cities[o]?.kind] ?? 'cautious',
    relation: (a, b) => w.relation ? w.relation(a, b) : (rel.get(key(a, b)) ?? 55),
    addRelation: (a, b, d) => { if (w.addRelation) return w.addRelation(a, b, d); rel.set(key(a, b), Math.max(0, Math.min(100, (rel.get(key(a, b)) ?? 55) + d))); },
    ownerName: o => o === me ? 'Вы' : w.ownerName ? w.ownerName(o) : o < 0 ? 'Свободная земля' : `${w.cities[o]?.name ?? 'Регион ' + o} (ИИ)`,
    aiContext: (o, r) => ({ vcAdd: MODE_INFO[r.mode].lineType === 0 ? 0.4 : 0.1, competition: 0.2, strategic: r.mode.startsWith('cargo') ? 1 : 0.5 }),
    pay: (from, to, amt) => { if (from === me) g.eco.spend(amt); else if (to === me) g.eco.money += amt; },
  };
}

export class RoutesSystem {
  book: RouteBook; me: OwnerId = 0; lastDay = -1; monthAcc = new Map<number, { rev: number; days: number }>(); seen = 0;
  listeners: (() => void)[] = [];
  constructor(public g: Game, terr?: Territory) {
    this.book = new RouteBook(terr ?? defaultTerritory(g, this.me));
    this.book.onActivate = r => this.activate(r); this.book.onDeactivate = r => this.deactivate(r);
    this.book.onChange = () => this.listeners.forEach(f => f());
  }
  /** Единая точка входа для действий (в мультиплеере — отправка на сервер, здесь — локальное применение + журнал сохранения). */
  cmd(c: RouteCommand) { const e = this.book.apply(c); if (e) this.g.ui.toast(e, 'bad'); else this.g.log({ a: 'route', cmd: c }); return e; }
  buildCost(r: Route) { return this.g.transit.buildCost(MODE_INFO[r.mode].lineType, r.stops); }
  private activate(r: Route) {
    const T = MODE_INFO[r.mode].lineType; const ex = r.lineId != null ? this.g.transit.lines.find(l => l.id === r.lineId) : null;
    if (ex) { ex.active = true; this.g.transit.version++; return; }
    if (r.initiator === this.me) { const c = this.buildCost(r); if (this.g.eco.money < c) this.g.ui.toast(`Маршрут «${r.name}»: не хватает ${Math.round(c)} ₽ на строительство, строим в долг`, 'warn'); this.g.eco.spend(c); }
    const ln = this.g.transit.build(T, r.stops);
    if (!ln) { this.g.ui.toast(`Маршрут «${r.name}»: не удалось проложить по сети (остановки у связанных дорог?)`, 'bad'); return; }
    ln.route = r.id; ln.name = r.name; ln.cargo = MODE_INFO[r.mode].cargo; if (ln.cargo && r.mode === 'cargoTruck') ln.freightOnly = true; r.lineId = ln.id;
  }
  private deactivate(r: Route) { const ln = this.g.transit.lines.find(l => l.id === r.lineId); if (ln) { ln.active = false; this.g.transit.version++; } }
  /** Вызывать каждый кадр (дешёво): дневные тики и месячные расчёты. */
  frame() {
    const day = this.g.eco.day; if (day === this.lastDay) return;
    const first = this.lastDay < 0; this.lastDay = day; if (first) { this.book.day = day; return; }
    this.book.tickDay(day);
    for (const r of this.book.routes) {
      const ln = this.g.transit.lines.find(l => l.id === r.lineId); if (!ln) continue;
      const acc = this.monthAcc.get(r.id) ?? { rev: 0, days: 0 }; acc.rev += ln.active ? ln.revenue : 0; acc.days++; this.monthAcc.set(r.id, acc);
      if (acc.days >= DAYS_PER_MONTH) {
        const T = LINE_TYPES[ln.type]; const vehKmDay = ln.active ? ln.n * T.speed * ln.speedF * 18 * 3600 / 1000 : 0;
        const paxKmDay = ln.riders * Math.min(ln.L / 4, 8000) / 1000; const opCost = ln.n * T.upkeep * 24 * DAYS_PER_MONTH / 24;
        this.book.settleMonth(r, acc.rev, vehKmDay, paxKmDay, opCost); this.monthAcc.set(r.id, { rev: 0, days: 0 });
      }
    }
    // уведомления для меня
    const N = this.book.notices; for (; this.seen < N.length; this.seen++) { const n = N[this.seen]; if (n.to === this.me) this.g.ui.toast('🛤 ' + n.text, n.lvl === 'info' ? 'warn' : n.lvl); }
    this.listeners.forEach(f => f());
  }
  serialize() { return this.book.serialize(); }
  load(s: any) { this.book.load(s); this.seen = this.book.notices.length; }
}
