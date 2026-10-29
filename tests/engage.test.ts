// Детерминизм и базовые сценарии вовлечённости: npm run test:engage
import { Engage } from '../src/engage/engine';
import type { Metrics } from '../src/engage/content';
const ok = (c: any, msg: string) => { if (!c) { console.error('FAIL', msg); process.exit(1); } console.log('ok', msg); };
function M(day: number, o: Partial<Metrics> = {}): Metrics { return { day, money: 300000, pop: 2000 + day * 40, popAll: 9000, cities: 1, roads: 100, arterials: 3, zones: [100, 30, 30], bld: [0, 60, 10, 10, 0, 0, 0, 0, 0], lines: [0, 0, 0, 0], stopsMax: 0, riders: 50, trips: 1000, cong: 0.5, unemp: 0.05, short: 0.1, income: 3000, expense: 2500, subs: 1, loans: 0, routesActive: 0, maxCityPop: 2000, water: true, land: 0.7, poll: 0.2, happy: 0.75, exports: 2000, rivals: [{ name: 'Сосед', pop: 5000 + day * 10 }], sawBudget: false, scale: 0.0375, ...o }; }
function run(seed: number, days: number, play = true) {
  const e = new Engage(seed); let money = 300000; e.host = { money: v => { money += v; }, price() { }, canPay: v => money >= v, worldPrice: () => 1000 }; const log: string[] = [];
  for (let d = 1; d <= days; d++) {
    const m = M(d, { money, roads: 100 + (d > 2 ? 1 : 0), zones: [d > 3 ? 130 : 100, d > 4 ? 45 : 30, 30], lines: [d > 5 ? 1 : 0, 0, 0, 0], stopsMax: d > 5 ? 4 : 0, sawBudget: d > 6 });
    e.tickDay(m); for (const f of e.drain()) if (f.kind !== 'day') log.push(d + ':' + f.kind + ':' + f.title);
    if (play) for (const ev of [...e.events]) e.apply({ a: 'eng', c: 'choose', ev: ev.uid, opt: 1 });
    if (play) for (const k of e.contracts.filter(k => k.status === 'offer')) e.apply({ a: 'eng', c: 'contract', id: k.uid, accept: true });
    if (play && d % 30 === 0) { const t = ['lanes', 'incub', 'hear', 'sort'].find(t => e.techState(t).ok); if (t) e.apply({ a: 'eng', c: 'research', t }); }
  }
  return { e, log, money };
}
const a = run(42, 240), b = run(42, 240), c = run(7, 240);
ok(JSON.stringify(a.e.serialize()) === JSON.stringify(b.e.serialize()) && a.log.join() === b.log.join(), 'детерминизм по seed');
ok(JSON.stringify(a.log) !== JSON.stringify(c.log), 'разные seed → разные события');
ok(a.e.onbDone && a.e.onb === 5, 'онбординг 5 целей пройден');
ok(a.log.some(l => l.includes(':event:')), 'случайные события возникают: ' + a.log.filter(l => l.includes(':event:')).length);
ok(a.e.months.length === 8 && a.e.months[0].headline.length > 0, 'месячные отчёты: ' + a.e.months[0].headline);
ok(a.log.some(l => l.includes(':quest:Новое поручение')), 'поручения генерируются');
ok(a.log.some(l => l.includes(':contract:')), 'контракты соседей');
ok(a.e.techs.length > 0, 'исследования: ' + a.e.techs.join(','));
ok(Object.keys(a.e.ach).some(k => k.startsWith('a_')), 'достижения: ' + Object.keys(a.e.ach).join(','));
ok(a.e.season.results.length > 0, 'сезоны: ' + JSON.stringify(a.e.season.results[0].table));
const r = new Engage(1); r.load(JSON.parse(JSON.stringify(a.e.serialize()))); ok(JSON.stringify(r.serialize()) === JSON.stringify(a.e.serialize()), 'сохранение/загрузка');
console.log(a.log.slice(0, 25).join('\n'));
