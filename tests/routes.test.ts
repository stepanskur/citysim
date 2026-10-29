// Проверка логики согласования: npm run test:routes
import assert from 'node:assert/strict';
import { RouteBook, aiScore } from '../src/routes/rules';
import type { Territory, AIProfile } from '../src/routes/types';

// Мир: x<1000 → игрок 0, 1000..2000 → игрок 1 (человек), 2000..3000 → ИИ 2, >3000 свободно
function terr(rel = 60, prof: AIProfile = 'cooperative'): Territory & { money: Record<number, number> } {
  const money: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
  return { money, ownerAt: x => x < 1000 ? 0 : x < 2000 ? 1 : x < 3000 ? 2 : -1, cityAt: x => Math.floor(x / 500), isAI: o => o === 2, profile: () => prof,
    relation: () => rel, ownerName: o => 'Игрок ' + o, pay: (f, t, a) => { money[f] -= a; money[t] += a; }, aiContext: () => ({ vcAdd: 0.1, competition: 0.1, strategic: 1 }) };
}
let n = 0; const ok = (name: string, f: () => void) => { f(); n++; console.log('✓', name); };

ok('внутренний маршрут активен сразу', () => {
  const b = new RouteBook(terr()); assert.equal(b.apply({ c: 'create', by: 0, mode: 'bus', stops: [{ x: 100, z: 0 }, { x: 900, z: 0 }] }), null);
  assert.equal(b.routes[0].status, 'active'); assert.equal(b.routes[0].approvers.length, 0); assert.equal(b.routes[0].scope, 'intraRegion');
});
ok('через свободную землю — без согласования', () => { const b = new RouteBook(terr()); b.apply({ c: 'create', by: 2, mode: 'rail', stops: [{ x: 2100, z: 0 }, { x: 3900, z: 0 }] }); assert.equal(b.routes[0].status, 'active'); });
ok('межрегиональный: нужны все, частично → активен', () => {
  const t = terr(); const b = new RouteBook(t); let act = 0; b.onActivate = () => act++;
  b.apply({ c: 'create', by: 0, mode: 'rail', stops: [{ x: 100, z: 0 }, { x: 2900, z: 0 }] }); const r = b.routes[0];
  assert.equal(r.scope, 'interRegion'); assert.deepEqual(r.approvers.map(a => a.owner), [1, 2]); assert.equal(r.status, 'draft');
  assert.ok(Math.abs(r.approvers[0].km - 1) < 0.01);
  b.apply({ c: 'submit', by: 0, id: r.id }); assert.equal(r.status, 'submitted');
  assert.ok(b.notices.some(x => x.to === 1) && b.notices.some(x => x.to === 2));
  assert.ok(b.apply({ c: 'approve', by: 5, id: r.id })); // посторонний
  b.apply({ c: 'approve', by: 1, id: r.id }); assert.equal(r.status, 'partial'); assert.equal(act, 0);
  b.tickDay(1); b.tickDay(2); assert.equal(r.status, 'partial');
  b.tickDay(3); assert.equal(r.status, 'active', 'ИИ согласовал через 3 дня'); assert.equal(act, 1);
});
ok('отказ одного → rejected', () => {
  const b = new RouteBook(terr()); b.apply({ c: 'create', by: 0, mode: 'bus', stops: [{ x: 100, z: 0 }, { x: 1500, z: 0 }] });
  b.apply({ c: 'submit', by: 0, id: 1 }); b.apply({ c: 'reject', by: 1, id: 1, note: 'нет' }); assert.equal(b.routes[0].status, 'rejected');
  assert.ok(b.apply({ c: 'approve', by: 1, id: 1 }));
});
ok('таймаут ответа → expired', () => {
  const b = new RouteBook(terr()); b.apply({ c: 'create', by: 0, mode: 'bus', stops: [{ x: 100, z: 0 }, { x: 1500, z: 0 }] }); b.apply({ c: 'submit', by: 0, id: 1 });
  for (let d = 1; d <= 15; d++) b.tickDay(d); assert.equal(b.routes[0].status, 'expired');
});
ok('отзыв согласия → уведомление 60 дн → suspended, штраф, повторное согласие', () => {
  const t = terr(); const b = new RouteBook(t); let off = 0; b.onDeactivate = () => off++;
  b.apply({ c: 'create', by: 0, mode: 'tram', stops: [{ x: 100, z: 0 }, { x: 1500, z: 0 }] }); const r = b.routes[0];
  b.apply({ c: 'submit', by: 0, id: 1 }); b.apply({ c: 'approve', by: 1, id: 1 }); assert.equal(r.status, 'active');
  b.settleMonth(r, 1_000_000, 500, 20000, 300_000); assert.ok(r.econ.byOwner[1] > 0); assert.ok(t.money[1] > 0);
  const before = t.money[1]; b.tickDay(10); b.apply({ c: 'revoke', by: 1, id: 1 }); assert.ok(t.money[1] < before, 'штраф');
  assert.equal(r.status, 'active'); b.tickDay(69); assert.equal(r.status, 'active'); b.tickDay(70); assert.equal(r.status, 'suspended'); assert.equal(off, 1);
  b.apply({ c: 'reapprove', by: 1, id: 1 }); assert.equal(r.status, 'active');
});
ok('встречное предложение и его принятие сбрасывает согласия', () => {
  const b = new RouteBook(terr()); b.apply({ c: 'create', by: 0, mode: 'rail', stops: [{ x: 100, z: 0 }, { x: 2900, z: 0 }] });
  b.apply({ c: 'submit', by: 0, id: 1 }); b.apply({ c: 'approve', by: 2, id: 1 }); b.apply({ c: 'counter', by: 1, id: 1, terms: { tollPerVehKm: 30 } });
  const r = b.routes[0]; assert.equal(r.status, 'review'); b.apply({ c: 'acceptCounter', by: 0, id: 1, from: 1 });
  assert.equal(r.terms.tollPerVehKm, 30); assert.equal(r.status, 'submitted'); assert.ok(r.approvers.every(a => a.status === 'pending'));
});
ok('ИИ: плохие отношения/протекционист → отказ; скоринг детерминирован', () => {
  const t = terr(0, 'protectionist'); const b = new RouteBook(t); b.apply({ c: 'create', by: 0, mode: 'rail', stops: [{ x: 2100, z: 0 }, { x: 2900, z: 0 }, { x: 100, z: 0 }] });
  const r = b.routes[0]; const s1 = aiScore(r, 2, t), s2 = aiScore(r, 2, t); assert.deepEqual(s1, s2);
  b.apply({ c: 'submit', by: 0, id: 1 }); for (let d = 1; d <= 3; d++) b.tickDay(d); assert.notEqual(r.status, 'active');
});
ok('распределение выручки по км и эскроу в споре', () => {
  const t = terr(); const b = new RouteBook(t); b.apply({ c: 'create', by: 0, mode: 'rail', stops: [{ x: 0, z: 0 }, { x: 3000, z: 0 }] });
  const r = b.routes[0]; b.apply({ c: 'submit', by: 0, id: 1 }); b.apply({ c: 'approve', by: 1, id: 1 }); b.apply({ c: 'approve', by: 2, id: 1 });
  const E = b.settleMonth(r, 9e6, 3000, 1e5, 2e6); assert.ok(Math.abs(E.byOwner[1] - E.byOwner[2]) < 1); assert.ok(Math.abs(E.sharePaidMonth - 0.05 * 9e6) < 1);
  b.apply({ c: 'dispute', by: 1, id: 1, note: 'неуплата' }); assert.equal(r.status, 'disputed'); const m = t.money[1]; b.settleMonth(r, 9e6, 3000, 1e5, 2e6); assert.equal(t.money[1], m);
  b.tickDay(30); assert.equal(r.status, 'active');
});
console.log(`\nВсе проверки пройдены: ${n}`);
