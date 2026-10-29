// Ядро вовлечённости (mechanics/10-engagement.md). Детерминированное по seed, без DOM/Three.
// Действия игрока — только команды EngCmd через apply(); ход времени — tickDay(metrics) раз в игровой день.
// Внешние эффекты (деньги, цены) — через Host. Состояние сериализуемо (serialize/load).
import { mulberry32 } from '../util';
import { BALANCE } from '../sim/balance';
import { ENG, type Difficulty } from './consts';
import { ONBOARDING, QUEST_TPL, EVENTS, ACHIEVEMENTS, TECHS, UNLOCKS, ADVISORS, CONTRACT_GOODS, advisorSays, EVENT_REP_INVESTOR, type Metrics, type Effect, type ModKey, type Advice } from './content';

export type EngCmd = { a: 'eng'; by?: number } & (
  | { c: 'choose'; ev: number; opt: number } | { c: 'research'; t: string } | { c: 'skipOnboarding' }
  | { c: 'contract'; id: number; accept: boolean } | { c: 'snooze'; adv: string } | { c: 'difficulty'; d: Difficulty });
export interface FeedItem { id: number; day: number; kind: string; sev: 0 | 1 | 2 | 3; icon: string; title: string; text: string; target?: { x: number; z: number }; groupKey?: string; data?: any }
export interface Host { money(v: number): void; price(good: number, mult: number): void; canPay(v: number): boolean; worldPrice(good: number): number }
export interface ActiveEvent { uid: number; id: string; day: number; deadline: number; p: any; opts: { label: string; desc: string; cost?: number }[] }
export interface Quest { uid: number; tpl: string; p: any; deadline: number; streak: number; need: number; title: string; text: string }
export interface Contract { uid: number; from: string; good: number; goodName: string; value: number; deadline: number; delivered: number; status: 'offer' | 'active' }
export interface Summary { day: number; pop: number; dPop: number; money: number; dMoney: number; income: number; expense: number; cong: number; riders: number }
export interface MonthReport { month: number; headline: string; facts: { k: string; v: string; d: number }[]; advice: string; rep: number; dRep: number }
export const MILESTONES = [{ pop: 1e4, name: 'Городок', money: 200000 }, { pop: 1e5, name: 'Город', money: 1e6 }, { pop: 5e5, name: 'Крупный город', money: 5e6 }, { pop: 1e6, name: 'Мегаполис', money: 12e6 }, { pop: 3e6, name: 'Гигаполис', money: 30e6 }];
const DPM = BALANCE.time.daysPerMonth;
/** базовые ОР в месяц сверх формулы 10 §5.1 (решение: иначе посёлок копит 20 ОР ~10 лет) */
export const RP_BASE_MONTH = 6;

export class Engage {
  difficulty: Difficulty = 'normal'; rep = BALANCE.reputation.start; rp = 10; rpAcc = 0;
  onb = 0; onbBase: Metrics | null = null; onbDone = false;
  quests: Quest[] = []; events: ActiveEvent[] = []; lastEventDay = 0; contracts: Contract[] = []; relations: Record<string, number> = {};
  ach: Record<string, number> = {}; techs: string[] = []; mods: { k: ModKey; v: number; until: number; label: string }[] = [];
  milestones: number[] = []; uid = 1; lastDay = 0; last: Metrics | null = null; first: Metrics | null = null;
  feed: FeedItem[] = []; cool: Record<string, number> = {}; advCool: Record<string, number> = {}; advisor: Advice | null = null;
  days: Summary[] = []; months: MonthReport[] = []; monthStart: Metrics | null = null; negMonths = 0; season = { n: 1, start: 1, base: {} as Record<string, number>, results: [] as { n: number; table: { name: string; growth: number }[] }[] };
  stats = { totalRiders: 0, daysNoDebt: 0, crisesSolved: 0, contracts: 0, techs: 0, quests: 0, plusMonths: 0 };
  /** одноразовые сигналы для UI (не сериализуются) */ out: FeedItem[] = []; host: Host = { money() { }, price() { }, canPay: () => true, worldPrice: () => 1000 };
  constructor(public seed: number) { }
  rng(day: number, salt: number) { return mulberry32((this.seed * 7919) ^ (day * 104729) ^ (salt * 15485863)); }
  get D() { return ENG.difficulty[this.difficulty]; }
  mod(k: ModKey) { return this.mods.reduce((s, m) => s + (m.k === k ? m.v : 0), 0); }
  has(t: string) { return this.techs.includes(t); }
  scaleReward(v: number, m: Metrics) { return Math.round(v * Math.max(ENG.onboardingRewardMinScale, m.scale) * this.D.moneyMult / 1000) * 1000; }
  /** допуск к строительству (02 §4): репутация + потребность (+узел) */
  unlockState(key: string, m: Metrics | null = this.last) { const u = UNLOCKS.find(u => u.key === key)!; if (this.ach['u_' + key]) return { ok: true, why: '' };
    const why = [u.tech && !this.has(u.tech) ? 'узел «' + TECHS.find(t => t.id === u.tech)!.title + '»' : '', this.rep < u.rep ? `репутация ≥ ${u.rep}` : '', m && !u.need(m) ? u.needText : ''].filter(Boolean); return { ok: !why.length, why: why.join(', ') }; }
  lineUnlocked(type: number) { const u = UNLOCKS.find(u => u.line === type); return !u || this.unlockState(u.key).ok; }
  placeUnlocked(i: number) { const u = UNLOCKS.find(u => u.place === i); return !u || this.unlockState(u.key).ok; }
  techState(id: string) { const t = TECHS.find(x => x.id === id)!; if (this.has(id)) return { ok: false, why: 'изучено' }; const miss = t.req.filter(r => !this.has(r)); if (miss.length) return { ok: false, why: 'сначала: ' + miss.map(r => TECHS.find(x => x.id === r)!.title).join(', ') }; if (this.rp < t.cost) return { ok: false, why: `нужно ${t.cost} ОР` }; return { ok: true, why: '' }; }
  /** P2: лента с анти-спамом по groupKey */
  push(f: Omit<FeedItem, 'id' | 'day'>) {
    if (f.groupKey) { const c = this.cool[f.groupKey]; if (c != null && this.lastDay - c < ENG.alertCooldownDays) return; this.cool[f.groupKey] = this.lastDay; }
    if (f.sev <= 1 && this.feed.filter(x => x.day === this.lastDay && x.sev <= 1).length >= ENG.feedMaxPerDay) return;
    const it: FeedItem = { id: this.uid++, day: this.lastDay, ...f }; this.feed.push(it); if (this.feed.length > 200) this.feed.shift(); this.out.push(it);
  }
  give(e: Effect, src: string, icon = '🎁') {
    if (e.money) this.host.money(e.money); if (e.rep) this.rep = Math.max(0, Math.min(100, this.rep + e.rep)); if (e.rp) this.rp += e.rp;
    if (e.mod) this.mods.push({ k: e.mod.k, v: e.mod.v, until: this.lastDay + e.mod.days, label: e.mod.label });
    if (e.price) this.host.price(e.price.good, e.price.mult);
    const parts = [e.money ? `${e.money > 0 ? '+' : '−'}${Math.abs(Math.round(e.money)).toLocaleString('ru')} ₽` : '', e.rep ? `${e.rep > 0 ? '+' : ''}${e.rep} репутации` : '', e.rp ? `+${e.rp} ОР` : '', e.mod ? e.mod.label : ''].filter(Boolean);
    if (parts.length) this.push({ kind: 'reward', sev: (e.money ?? 0) < 0 || (e.rep ?? 0) < 0 ? 1 : 0, icon, title: src, text: parts.join(' · '), data: e });
  }
  apply(c: EngCmd): boolean {
    switch (c.c) {
      case 'difficulty': this.difficulty = c.d; return true;
      case 'skipOnboarding': this.onbDone = true; return true;
      case 'snooze': this.advCool[c.adv] = this.lastDay + ENG.advisorSnoozeDays; if (this.advisor?.id === c.adv) this.advisor = null; return true;
      case 'research': { const st = this.techState(c.t); if (!st.ok) return false; const t = TECHS.find(x => x.id === c.t)!; this.rp -= t.cost; this.techs.push(t.id); this.stats.techs++;
        this.push({ kind: 'tech', sev: 0, icon: t.icon, title: 'Исследовано: ' + t.title, text: t.desc }); if (t.eff) this.give(t.eff, t.title, t.icon); return true; }
      case 'contract': { const k = this.contracts.find(x => x.uid === c.id && x.status === 'offer'); if (!k) return false; if (c.accept) { k.status = 'active'; this.push({ kind: 'contract', sev: 0, icon: '🤝', title: 'Контракт принят', text: `${k.goodName} для «${k.from}» до дня ${k.deadline}` }); } else this.contracts = this.contracts.filter(x => x !== k); return true; }
      case 'choose': {
        const i = this.events.findIndex(e => e.uid === c.ev); if (i < 0) return false; const ev = this.events[i]; const def = EVENTS.find(d => d.id === ev.id)!;
        const o = def.options(this.last!, ev.p)[c.opt]; if (!o) return false; const cost = ev.opts[c.opt].cost ?? 0;
        if (cost && !this.host.canPay(cost)) return false; this.resolve(ev, c.opt, cost); return true;
      }
    }
    return false;
  }
  resolve(ev: ActiveEvent, opt: number, cost: number) {
    const def = EVENTS.find(d => d.id === ev.id)!; const opts = def.options(this.last!, ev.p); const o = opts[opt];
    this.events = this.events.filter(e => e !== ev); if (cost) this.host.money(-cost);
    let eff = o.eff;
    if (o.fail && this.rng(ev.uid, 77)() < o.fail) { eff = { rep: -3, money: -Math.round((cost || 10000) * 2) }; this.push({ kind: 'event', sev: 2, icon: def.icon, title: 'Не получилось', text: 'Ситуация вышла из-под контроля' }); }
    else if (def.crisis && opt < opts.length - 1) this.stats.crisesSolved++;
    this.give(eff, def.title + ': ' + o.label, def.icon);
  }
  tickDay(m: Metrics) {
    const d = m.day; if (d <= this.lastDay) return; this.lastDay = d;
    if (!this.first) { this.first = m; this.onbBase = m; this.monthStart = m; for (const ms of MILESTONES) if (m.pop >= ms.pop) this.milestones.push(ms.pop); for (const r of m.rivals) this.relations[r.name] ??= 50; this.seasonStart(m); }
    const prev = this.last ?? m; this.last = m;
    // модификаторы
    const bonus = Math.round(m.income * (this.mod('income') - this.mod('tripCut') * 0.5) + m.expense * this.mod('upkeep')); if (bonus) this.host.money(bonus);
    this.mods = this.mods.filter(x => x.until > d);
    this.stats.totalRiders += m.riders; this.stats.daysNoDebt = m.loans ? 0 : this.stats.daysNoDebt + 1;
    // ОР (10 §5.1), начисляются дробно каждый день
    this.rpAcc += (RP_BASE_MONTH + ENG.rpPerMillionIncome * (m.income * DPM / 1e6) + ENG.rpPer100kPop * (m.pop / 1e5)) / DPM; if (this.rpAcc >= 1) { const n = Math.floor(this.rpAcc); this.rp += n; this.rpAcc -= n; }
    this.tickOnboarding(m); this.tickMilestones(m); this.tickQuests(m); this.tickEvents(m); this.tickContracts(m); this.tickUnlocks(m);
    for (const a of ACHIEVEMENTS) if (!this.ach[a.id] && a.test(m, this.stats)) this.unlockAch(a.id);
    this.tickAdvisors(m);
    const sm: Summary = { day: d, pop: m.pop, dPop: m.pop - prev.pop, money: m.money, dMoney: m.money - prev.money, income: m.income, expense: m.expense, cong: m.cong, riders: m.riders };
    this.days.push(sm); if (this.days.length > 60) this.days.shift();
    this.out.push({ id: 0, day: d, kind: 'day', sev: 0, icon: '📅', title: 'Итоги дня ' + d, text: '', data: sm });
    if (d % DPM === 0) this.month(m);
    if (d - this.season.start >= ENG.seasonLengthDays) this.seasonEnd(m);
  }
  tickOnboarding(m: Metrics) {
    if (this.onbDone) return; const g = ONBOARDING[this.onb]; if (!g) { this.onbDone = true; return; }
    if (g.done(m, this.onbBase!)) {
      const money = this.scaleReward(ENG.onboardingGoalRewards[this.onb] ?? 50000, m); this.onb++; this.onbBase = m; this.stats.quests++;
      this.push({ kind: 'goal', sev: 0, icon: '✅', title: 'Цель выполнена', text: g.title }); this.give({ money, rep: g.rep }, 'Цель «' + g.title + '»', '✅');
      if (this.onb >= ONBOARDING.length) { this.onbDone = true; this.unlockAch('a_onb'); this.push({ kind: 'goal', sev: 0, icon: '🎓', title: 'Обучение пройдено', text: 'Дальше — поручения, события и исследования. Советники подскажут, если что-то пойдёт не так.' }); }
    }
  }
  tickMilestones(m: Metrics) {
    for (const ms of MILESTONES) if (m.pop >= ms.pop && !this.milestones.includes(ms.pop)) {
      this.milestones.push(ms.pop); const st = this.monthStart ?? m;
      this.push({ kind: 'milestone', sev: 0, icon: '🏆', title: 'Новая веха: ' + ms.name, text: `Население ${ms.pop.toLocaleString('ru')}`, data: { name: ms.name, before: { pop: st.pop, money: st.money, riders: st.riders }, after: { pop: m.pop, money: m.money, riders: m.riders } } });
      this.give({ money: Math.round(ms.money * this.D.moneyMult) }, 'Веха «' + ms.name + '»', '🏆');
    }
  }
  genQuests(m: Metrics) {
    const r = this.rng(m.day, 5); const cand = QUEST_TPL.filter(t => !this.quests.some(q => q.tpl === t.id)).map(t => ({ t, s: t.problem(m) + r() * 0.05 })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    while (this.quests.length < ENG.maxActiveQuests && cand.length) { const t = cand.shift()!.t; const p = t.params ? t.params(m) : {};
      const q: Quest = { uid: this.uid++, tpl: t.id, p, deadline: m.day + t.months * DPM, streak: 0, need: t.streak, title: t.title, text: t.text(p) }; this.quests.push(q);
      this.push({ kind: 'quest', sev: 0, icon: '📋', title: 'Новое поручение: ' + t.title, text: q.text + ` (срок ${t.months} мес.)` }); }
  }
  tickQuests(m: Metrics) {
    if (this.onbDone && (m.day % DPM === 1 || !this.quests.length && m.day % 5 === 0)) this.genQuests(m);
    for (const q of [...this.quests]) { const t = QUEST_TPL.find(x => x.id === q.tpl)!; q.streak = t.day(m, q.p) ? q.streak + 1 : 0;
      if (q.streak >= q.need) { this.quests = this.quests.filter(x => x !== q); this.stats.quests++; this.push({ kind: 'quest', sev: 0, icon: '✅', title: 'Поручение выполнено', text: q.title }); const e = { ...t.reward }; if (e.money) e.money = this.scaleReward(e.money, m); this.give(e, q.title, '📋'); }
      else if (m.day > q.deadline) { this.quests = this.quests.filter(x => x !== q); this.push({ kind: 'quest', sev: 1, icon: '⌛', title: 'Поручение провалено', text: q.title }); this.give({ rep: -1 }, 'Провал поручения', '⌛'); } }
  }
  stress(m: Metrics) { return Math.max(0, Math.min(1, Math.max(m.cong, m.short * 2, m.unemp * 3, m.money < 0 ? 1 : 0))); }
  tickEvents(m: Metrics) {
    const d = m.day;
    for (const e of [...this.events]) if (d > e.deadline) { const cost = e.opts[0].cost ?? 0; const pay = !cost || this.host.canPay(cost); const opt = pay ? 0 : e.opts.length - 1;
      this.push({ kind: 'event', sev: 1, icon: '⏱', title: 'Время вышло', text: 'Применён вариант «' + e.opts[opt].label + '»' }); this.resolve(e, opt, pay ? cost : 0); }
    if (this.events.length || d - this.lastEventDay < ENG.eventMinGapDays || d < 5) return;
    // динамическая сложность (10 §7.1): при стрессе кризисы реже
    const s = this.stress(m); const dyn = s > ENG.stressHigh ? ENG.dynMinMult : s < ENG.stressLow ? ENG.dynMaxMult : 1;
    const r = this.rng(d, 1); if (r() >= ENG.eventDailyChance * this.D.eventMult) return;
    const ws = EVENTS.map(e => (this.difficulty === 'relaxed' && e.crisis ? 0 : e.id === 'invest' ? (this.rep >= EVENT_REP_INVESTOR ? 1 : 0) : e.weight(m, d)) * (e.crisis ? dyn : 1)); const tot = ws.reduce((a, b) => a + b, 0); if (tot <= 0) return;
    let x = r() * tot, k = 0; while (k < ws.length - 1 && (x -= ws[k]) > 0) k++; if (!ws[k]) return;
    const def = EVENTS[k]; const p = def.params ? def.params(m, r) : {}; const uid = this.uid++; this.lastEventDay = d;
    const ev: ActiveEvent = { uid, id: def.id, day: d, deadline: d + ENG.eventDecisionDays, p, opts: def.options(m, p).map(o => ({ label: o.label, desc: o.desc, cost: o.cost })) };
    this.events.push(ev); this.push({ kind: 'event', sev: def.crisis ? 3 : 2, icon: def.icon, title: def.title, text: def.text(m, p), data: { ev: uid } });
  }
  tickContracts(m: Metrics) {
    const d = m.day;
    for (const k of [...this.contracts]) {
      if (k.status === 'active') { k.delivered += m.exports ?? 0;
        if (k.delivered >= k.value) { this.contracts = this.contracts.filter(x => x !== k); this.stats.contracts++; this.relations[k.from] = (this.relations[k.from] ?? 50) + ENG.contractRelationOk; this.push({ kind: 'contract', sev: 0, icon: '🤝', title: 'Контракт выполнен', text: `«${k.from}»: отношения +${ENG.contractRelationOk}` }); this.give({ money: Math.round(k.value * (ENG.contractPremium - 1)), rep: 1 }, 'Премия по контракту', '🤝'); continue; } }
      if (d > k.deadline) { this.contracts = this.contracts.filter(x => x !== k); if (k.status === 'active') { this.relations[k.from] = (this.relations[k.from] ?? 50) + ENG.contractRelationFail; this.push({ kind: 'contract', sev: 2, icon: '🤝', title: 'Контракт сорван', text: `«${k.from}»: штраф и отношения ${ENG.contractRelationFail}` }); this.give({ money: -Math.round(k.value * ENG.contractPenaltyShare), rep: -2 }, 'Штраф за срыв', '🤝'); } }
    }
    // предложение раз в ~15 дней, если есть соседи и экспорт
    if (m.rivals.length && d % 15 === 7 && this.contracts.length < 2 && m.pop > 1500) {
      const r = this.rng(d, 9); const from = m.rivals[Math.floor(r() * m.rivals.length)].name; const G = CONTRACT_GOODS[Math.floor(r() * CONTRACT_GOODS.length)];
      const qty = Math.max(20, Math.round((m.exports > 0 ? m.exports * 10 : m.pop * 0.6) / this.host.worldPrice(G.g) / 10) * 10); const value = Math.round(qty * this.host.worldPrice(G.g) * ENG.contractPremium);
      const k: Contract = { uid: this.uid++, from, good: G.g, goodName: `${qty} ед. «${G.name}»`, value, deadline: d + 20, delivered: 0, status: 'offer' }; this.contracts.push(k);
      this.push({ kind: 'contract', sev: 1, icon: '📨', title: 'Заказ от соседа «' + from + '»', text: `${k.goodName} на ${value.toLocaleString('ru')} ₽ за 20 дней. Засчитывается экспорт региона. Премия ×${ENG.contractPremium}.`, data: { contract: k.uid } });
    }
  }
  tickUnlocks(m: Metrics) { for (const u of UNLOCKS) if (!this.ach['u_' + u.key] && this.unlockState(u.key, m).ok) { this.ach['u_' + u.key] = m.day; this.push({ kind: 'unlock', sev: 0, icon: '🔓', title: 'Доступно: ' + u.title, text: 'Город дорос — можно строить' }); } }
  tickAdvisors(m: Metrics) {
    if (this.advisor && this.lastDay - (this.advCool[this.advisor.id] ?? 0) > ENG.advisorCooldownDays) this.advisor = null;
    if (this.advisor) return; let best: Advice | null = null;
    for (const a of ADVISORS) { if ((this.advCool[a.id] ?? -99) > m.day - ENG.advisorCooldownDays) continue; const s = advisorSays(a.id, m); if (s && (!best || s.sev > best.sev)) best = s; }
    if (best) { this.advisor = best; this.advCool[best.id] = m.day; this.out.push({ id: 0, day: m.day, kind: 'advisor', sev: 0, icon: best.icon, title: best.who, text: best.text, data: best }); }
  }
  month(m: Metrics) {
    const st = this.monthStart ?? m; const mo = Math.round(m.day / DPM);
    const happy = m.happy, budget = m.money < 0 ? 0 : Math.max(0, Math.min(1, 0.5 + (m.income - m.expense) / Math.max(1, m.income + m.expense))), congInv = 1 - Math.min(1, m.cong), goods = 1 - Math.min(1, m.short);
    let dRep = BALANCE.reputation.monthlyScale * (0.4 * (happy - 0.5) + 0.2 * (budget - 0.5) + 0.2 * (congInv - 0.5) + 0.2 * (goods - 0.5));
    if (this.has('hear') && happy > 0.6) dRep += 1; this.rep = Math.max(0, Math.min(100, this.rep + dRep));
    const dM = m.money - st.money; this.stats.plusMonths = dM > 0 ? this.stats.plusMonths + 1 : 0; this.negMonths = m.money < 0 ? this.negMonths + 1 : 0;
    if (this.D.bankruptcyMonths && this.negMonths >= this.D.bankruptcyMonths) this.push({ kind: 'alert', sev: 3, icon: '⚠', title: 'Угроза банкротства', text: `Бюджет в минусе ${this.negMonths} мес. подряд: срочно сократите расходы или возьмите кредит.`, groupKey: 'bankrupt' });
    const pct = (a: number, b: number) => b ? (a - b) / Math.abs(b) : 0;
    const ch = [
      { k: 'Население', d: pct(m.pop, st.pop), v: Math.round(m.pop).toLocaleString('ru'), h: (x: number) => x >= 0 ? `Город растёт: +${Math.round(x * 100)}% жителей за месяц` : `Отток жителей: ${Math.round(x * 100)}% за месяц` },
      { k: 'Пробки', d: m.cong - st.cong, v: Math.round(m.cong * 100) + '%', h: (x: number) => x <= 0 ? `Пробки сократились на ${Math.round(-x * 100)} п.п.` : `Пробки выросли на ${Math.round(x * 100)} п.п.` },
      { k: 'Бюджет', d: pct(m.money, st.money), v: Math.round(m.money).toLocaleString('ru') + ' ₽', h: (x: number) => x >= 0 ? `Казна пополнилась на ${Math.round(x * 100)}%` : `Казна похудела на ${Math.round(-x * 100)}%` },
      { k: 'Пассажиры ОТ', d: pct(m.riders, st.riders || 1), v: Math.round(m.riders).toLocaleString('ru') + '/день', h: (x: number) => x >= 0 ? `Общественный транспорт: +${Math.round(x * 100)}% пассажиров` : `Пассажиров ОТ стало меньше на ${Math.round(-x * 100)}%` },
    ];
    const top = [...ch].sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0]; const adv = ADVISORS.map(a => advisorSays(a.id, m)).filter(Boolean).sort((a, b) => b!.sev - a!.sev)[0];
    const rep: MonthReport = { month: mo, headline: top.h(top.d), facts: ch.slice(0, 3).map(c => ({ k: c.k, v: c.v, d: c.d })), advice: adv ? adv.text : 'Город спокоен — время расширяться и исследовать.', rep: this.rep, dRep };
    this.months.push(rep); if (this.months.length > 24) this.months.shift(); this.monthStart = m;
    this.out.push({ id: 0, day: m.day, kind: 'month', sev: 0, icon: '📰', title: 'Вестник, месяц ' + mo, text: rep.headline, data: rep });
  }
  seasonStart(m: Metrics) { this.season.start = m.day; this.season.base = { 'Вы': m.pop }; for (const r of m.rivals) this.season.base[r.name] = r.pop; }
  seasonEnd(m: Metrics) {
    const cur: Record<string, number> = { 'Вы': m.pop }; for (const r of m.rivals) cur[r.name] = r.pop;
    const table = Object.keys(cur).map(n => ({ name: n, growth: (cur[n] - (this.season.base[n] ?? cur[n])) / Math.max(1, this.season.base[n] ?? 1) })).sort((a, b) => b.growth - a.growth);
    this.season.results.push({ n: this.season.n, table }); if (this.season.results.length > 10) this.season.results.shift(); const place = table.findIndex(t => t.name === 'Вы') + 1;
    this.push({ kind: 'season', sev: 1, icon: '🏅', title: `Сезон ${this.season.n} завершён`, text: `Ваше место: ${place} из ${table.length} по росту населения` }); if (place === 1 && table.length > 1) this.give({ rep: 2, rp: 5 }, 'Победа в сезоне', '🏅');
    this.season.n++; this.seasonStart(m);
  }
  unlockAch(id: string) { if (this.ach[id]) return; this.ach[id] = this.lastDay || 1; const a = ACHIEVEMENTS.find(x => x.id === id)!; this.push({ kind: 'ach', sev: 0, icon: a.icon, title: 'Достижение: ' + a.title, text: a.desc }); this.rp += 2; }
  drain() { const o = this.out; this.out = []; return o; }
  serialize() { const { out, host, ...s } = this as any; void out; void host; return JSON.parse(JSON.stringify(s)); }
  load(s: any) { if (s) Object.assign(this, s, { out: [] }); }
}
