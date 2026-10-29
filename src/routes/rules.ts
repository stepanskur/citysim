// Логика маршрутов: жизненный цикл, ИИ, экономика. Константы — mechanics/07-balance-constants.ts (BALANCE.routes).
import { BALANCE } from '../../mechanics/07-balance-constants';
import { MODE_INFO, FINAL } from './types';
import type { Route, RouteCommand, RouteStatus, Terms, Territory, OwnerId, Segment, Stop, RouteNotice, AIProfile, RouteMode, GameDay } from './types';

export const RB = BALANCE.routes;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const DAYS_PER_MONTH = 30;

export function defaultTerms(mode: RouteMode): Terms {
  return { tollPerVehKm: RB.defaultTollPerVehKm, tollPerTonKm: RB.defaultTollPerTonKm, revenueShare: RB.defaultRevenueShare, termMonths: RB.defaultTermMonths, withdrawNoticeDays: RB.withdrawNoticeDays, withdrawPenaltyShare: RB.withdrawPenaltyShare };
}
export function normTerms(t: Terms): Terms { return { ...t, termMonths: clamp(Math.round(t.termMonths), RB.minTermMonths, RB.maxTermMonths), revenueShare: clamp(t.revenueShare, 0, 0.9), tollPerVehKm: Math.max(0, t.tollPerVehKm), tollPerTonKm: Math.max(0, t.tollPerTonKm) }; }

/** Разбить трассу (ломаная по остановкам) на участки по владельцам, шаг 50 м. */
export function computeSegments(stops: Stop[], terr: Territory, step = 50): Segment[] {
  const out: Segment[] = [];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1], b = stops[i]; const L = Math.hypot(b.x - a.x, b.z - a.z); const n = Math.max(1, Math.ceil(L / step));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n; const o = terr.ownerAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t); const km = L / n / 1000;
      const last = out[out.length - 1]; if (last && last.owner === o) last.km += km; else out.push({ owner: o, km });
    }
  }
  return out;
}
export function kmByOwner(segs: Segment[]): Map<OwnerId, number> { const m = new Map<OwnerId, number>(); for (const s of segs) m.set(s.owner, (m.get(s.owner) || 0) + s.km); return m; }
export function foreignOwners(segs: Segment[], initiator: OwnerId): OwnerId[] { return [...kmByOwner(segs).keys()].filter(o => o !== initiator && o >= 0).sort((a, b) => a - b); }
export function scopeOf(stops: Stop[], segs: Segment[], initiator: OwnerId, terr: Territory) {
  if (foreignOwners(segs, initiator).length) return 'interRegion' as const;
  const cities = new Set(stops.map(s => terr.cityAt ? terr.cityAt(s.x, s.z) : 0)); return cities.size > 1 ? 'intraRegion' as const : 'intraCity' as const;
}

/** Скоринг ИИ (09 §4). */
export function aiScore(r: Route, owner: OwnerId, terr: Territory) {
  const S = RB.aiScoring; const prof = RB.aiProfiles[terr.profile(owner)];
  const ap = r.approvers.find(a => a.owner === owner); const km = ap?.km ?? 0;
  const cargo = MODE_INFO[r.mode].cargo; const tripsDay = Math.max(1, r.econ.vehKmDay / Math.max(0.1, totalKm(r)));
  const toll = (cargo ? r.terms.tollPerTonKm * 40 : r.terms.tollPerVehKm) * km * tripsDay * DAYS_PER_MONTH;
  const shareInc = r.terms.revenueShare * Math.max(r.econ.revenueMonth, estRevenue(r)) * km / Math.max(0.1, foreignKm(r));
  const costs = km * 2000 + 1;                                     // издержки: износ дорог/шум, ₽/мес на км
  const benefit = clamp((toll + shareInc) / costs / 2, 0, 1);
  const ctx = terr.aiContext?.(owner, r) ?? {};
  const risk = clamp(0.5 * (ctx.vcAdd ?? 0.2) + 0.3 * (ctx.competition ?? 0.2) + 0.2 * (r.terms.termMonths / 120), 0, 1);
  const relationN = terr.relation(owner, r.initiator) / 100; const strategic = ctx.strategic ?? 0.5;
  const parts = { benefit: S.benefit * benefit, risk: -S.risk * risk, relation: S.relation * relationN, strategic: S.strategic * strategic };
  const score = parts.benefit + parts.risk + parts.relation + parts.strategic + 0.2;
  const threshold = S.acceptThreshold + prof.thresholdShift;
  const verdict: 'approve' | 'counter' | 'reject' = score >= threshold ? 'approve' : score >= threshold - S.counterBand ? 'counter' : 'reject';
  const worst = parts.risk < -0.1 && (ctx.vcAdd ?? 0) > (ctx.competition ?? 0) ? 'пробки на моих дорогах' : parts.risk < -0.1 ? 'конкуренция с моими линиями' : relationN < 0.4 ? 'низкие отношения' : 'невыгодные условия';
  return { score, threshold, verdict, parts, reason: worst, profile: terr.profile(owner) as AIProfile };
}
export const totalKm = (r: Route) => r.segments.reduce((s, x) => s + x.km, 0);
export const foreignKm = (r: Route) => r.segments.filter(s => s.owner !== r.initiator && s.owner >= 0).reduce((s, x) => s + x.km, 0);
function estRevenue(r: Route) { return totalKm(r) * (MODE_INFO[r.mode].cargo ? 60000 : 90000); }

const emptyEcon = () => ({ revenueMonth: 0, costMonth: 0, tollPaidMonth: 0, sharePaidMonth: 0, byOwner: {}, vehKmDay: 0, paxKmDay: 0, balance: 0, unpaidMonths: 0 });

/** Книга маршрутов: состояние + применение команд + дневной тик. Детерминирована (нет Math.random/Date). */
export class RouteBook {
  routes: Route[] = []; nextId = 1; day: GameDay = 0; notices: RouteNotice[] = []; log: { day: GameDay; cmd: RouteCommand }[] = [];
  onActivate?: (r: Route) => void; onDeactivate?: (r: Route) => void; onChange?: () => void;
  constructor(public terr: Territory) { }
  get(id: number) { return this.routes.find(r => r.id === id); }
  private note(to: OwnerId, r: Route, text: string, lvl: RouteNotice['lvl'] = 'info') { this.notices.push({ day: this.day, to, routeId: r.id, text, lvl }); if (this.notices.length > 300) this.notices.splice(0, this.notices.length - 300); }
  private set(r: Route, to: RouteStatus, by: OwnerId, note?: string) {
    if (r.status === to) return; const from = r.status; r.history.push({ day: this.day, from, to, by, note }); r.status = to;
    const running = (s: RouteStatus) => s === 'active' || s === 'disputed';
    if (!running(from) && running(to)) { r.activeSince ??= this.day; r.expiresDay = this.day + r.terms.termMonths * DAYS_PER_MONTH; this.onActivate?.(r); }
    if (running(from) && !running(to)) this.onDeactivate?.(r);
  }
  private involved(r: Route) { return [r.initiator, ...r.approvers.map(a => a.owner)]; }
  private notifyAll(r: Route, text: string, lvl: RouteNotice['lvl'], except?: OwnerId) { for (const o of this.involved(r)) if (o !== except) this.note(o, r, text, lvl); }
  private reroute(r: Route) {
    r.segments = computeSegments(r.stops, this.terr); r.scope = scopeOf(r.stops, r.segments, r.initiator, this.terr);
    const km = kmByOwner(r.segments);
    r.approvers = foreignOwners(r.segments, r.initiator).map(o => ({ owner: o, km: km.get(o)!, status: 'pending' as const, deadline: 0 }));
  }
  /** Применить команду. Возвращает текст ошибки или null. */
  apply(cmd: RouteCommand): string | null {
    const err = this.exec(cmd); if (!err) { this.log.push({ day: this.day, cmd }); this.onChange?.(); } return err;
  }
  private exec(cmd: RouteCommand): string | null {
    if (cmd.c === 'create') {
      if (cmd.stops.length < 2) return 'Нужно минимум 2 остановки';
      const r: Route = { id: this.nextId++, name: cmd.name || `${MODE_INFO[cmd.mode].name} №${this.nextId - 1}`, initiator: cmd.by, mode: cmd.mode, stops: cmd.stops.map(s => ({ x: s.x, z: s.z })), segments: [], scope: 'intraCity', terms: normTerms({ ...defaultTerms(cmd.mode), ...cmd.terms }), status: 'draft', approvers: [], history: [], counterRounds: 0, createdDay: this.day, econ: emptyEcon() };
      this.reroute(r); r.econ.vehKmDay = totalKm(r) * 2 * 24; this.routes.push(r);
      if (!r.approvers.length) { this.set(r, 'active', cmd.by, 'внутри своего региона — без согласования'); r.expiresDay = undefined; }
      return null;
    }
    const r = this.get(cmd.id); if (!r) return 'Маршрут не найден';
    const ap = r.approvers.find(a => a.owner === cmd.by); const isInit = cmd.by === r.initiator;
    if (FINAL.includes(r.status) && cmd.c !== 'delete') return 'Заявка уже закрыта';
    switch (cmd.c) {
      case 'edit': {
        if (!isInit) return 'Менять может только инициатор';
        if (cmd.terms) r.terms = normTerms({ ...r.terms, ...cmd.terms }); if (cmd.name) r.name = cmd.name;
        if (cmd.stops) {
          if (cmd.stops.length < 2) return 'Нужно минимум 2 остановки';
          const oldForeign = foreignOwners(r.segments, r.initiator).join(); const segs = computeSegments(cmd.stops, this.terr);
          const newForeign = foreignOwners(segs, r.initiator).join();
          if (newForeign && (newForeign !== oldForeign || r.status !== 'active')) {
            // изменение трассы через новый чужой участок → новая заявка; старая трасса работает, пока та рассматривается
            if (r.status === 'active') { this.exec({ c: 'create', by: r.initiator, mode: r.mode, stops: cmd.stops, terms: r.terms, name: r.name + ' (новая трасса)' }); return null; }
            r.stops = cmd.stops.map(s => ({ ...s })); this.reroute(r); if (r.status !== 'draft') this.set(r, 'draft', cmd.by, 'трасса изменена'); return null;
          }
          r.stops = cmd.stops.map(s => ({ ...s })); this.reroute(r);
          if (!r.approvers.length && r.status !== 'active') this.set(r, 'active', cmd.by, 'трасса только по своей территории');
        } else if (cmd.terms && r.approvers.length && r.status !== 'draft') { for (const a of r.approvers) a.status = 'pending'; this.set(r, 'draft', cmd.by, 'условия изменены'); }
        return null;
      }
      case 'submit': {
        if (!isInit) return 'Отправить может только инициатор';
        if (r.status !== 'draft' && r.status !== 'suspended') return 'Отправить можно черновик или приостановленный маршрут';
        if (!r.approvers.length) { this.set(r, 'active', cmd.by); return null; }
        for (const a of r.approvers) {
          if (r.status === 'suspended' && a.status === 'approved') continue;
          a.status = 'pending'; a.note = undefined; a.counterTerms = undefined; a.noticeUntil = undefined;
          a.deadline = this.day + (this.terr.isAI(a.owner) ? RB.responseTimeoutDays : RB.responseTimeoutDays);
          a.decideAt = this.terr.isAI(a.owner) ? this.day + RB.aiResponseDays : undefined;
          this.note(a.owner, r, `Новая заявка на маршрут «${r.name}» от ${this.terr.ownerName(r.initiator)}: ${a.km.toFixed(1)} км по вашей территории`, 'info');
        }
        this.set(r, 'submitted', cmd.by); this.recompute(r, cmd.by); return null;
      }
      case 'open': if (!ap) return 'Вы не согласующий'; if (r.status === 'submitted') this.set(r, 'review', cmd.by); return null;
      case 'approve': case 'reapprove': {
        if (!ap) return 'Вы не согласующий';
        if (!['submitted', 'review', 'partial', 'active', 'suspended', 'disputed'].includes(r.status)) return 'Заявка не на согласовании';
        if (ap.status === 'approved' && !ap.noticeUntil) return null;
        ap.status = 'approved'; ap.noticeUntil = undefined; ap.note = undefined; this.terr.addRelation?.(cmd.by, r.initiator, RB.relationOnApprove);
        this.note(r.initiator, r, `${this.terr.ownerName(cmd.by)} согласовал маршрут «${r.name}»`, 'good');
        this.recompute(r, cmd.by); return null;
      }
      case 'reject': {
        if (!ap) return 'Вы не согласующий'; if (!['submitted', 'review', 'partial'].includes(r.status)) return 'Отклонить можно только заявку на согласовании (для действующего — «Отозвать согласие»)';
        ap.status = 'rejected'; ap.note = cmd.note; this.set(r, 'rejected', cmd.by, cmd.note);
        this.notifyAll(r, `${this.terr.ownerName(cmd.by)} отклонил маршрут «${r.name}»${cmd.note ? ': ' + cmd.note : ''}`, 'bad', cmd.by); return null;
      }
      case 'counter': {
        if (!ap) return 'Вы не согласующий'; if (!['submitted', 'review', 'partial'].includes(r.status)) return 'Заявка не на согласовании';
        if (r.counterRounds >= RB.maxCounterOffers) return 'Лимит встречных предложений исчерпан';
        r.counterRounds++; ap.status = 'countered'; ap.counterTerms = normTerms({ ...r.terms, ...cmd.terms }); ap.note = cmd.note;
        this.set(r, 'review', cmd.by, 'встречное предложение');
        this.note(r.initiator, r, `${this.terr.ownerName(cmd.by)} прислал встречное предложение по «${r.name}»`, 'warn'); return null;
      }
      case 'acceptCounter': {
        if (!isInit) return 'Только инициатор'; const a = r.approvers.find(x => x.owner === cmd.from && x.status === 'countered'); if (!a) return 'Нет встречного предложения';
        r.terms = a.counterTerms!; this.set(r, 'draft', cmd.by, 'принято встречное'); return this.exec({ c: 'submit', by: cmd.by, id: r.id });
      }
      case 'revoke': {
        if (!ap || ap.status !== 'approved') return 'Нечего отзывать';
        if (['submitted', 'review', 'partial'].includes(r.status)) { ap.status = 'pending'; this.recompute(r, cmd.by); return null; }
        ap.status = 'revoked'; ap.noticeUntil = this.day + r.terms.withdrawNoticeDays;
        this.terr.addRelation?.(cmd.by, r.initiator, RB.relationOnWithdraw);
        const early = r.expiresDay != null && this.day < r.expiresDay;
        const yearIncomeOnTerr = (r.econ.byOwner[cmd.by] ?? 0) * 12;
        const penalty = early ? RB.withdrawPenaltyShare * yearIncomeOnTerr : 0;
        if (penalty > 0) this.terr.pay?.(cmd.by, r.initiator, penalty, `штраф за отзыв согласия по «${r.name}»`);
        this.notifyAll(r, `${this.terr.ownerName(cmd.by)} отозвал согласие по «${r.name}». Маршрут остановится через ${r.terms.withdrawNoticeDays} дн. (день ${ap.noticeUntil})${penalty ? `, штраф ${Math.round(penalty)} ₽` : ''}`, 'bad', cmd.by);
        return null;
      }
      case 'pause': if (!isInit || r.status !== 'active') return 'Пауза доступна инициатору активного маршрута'; this.set(r, 'suspended', cmd.by, 'пауза'); return null;
      case 'resume': {
        if (!isInit || r.status !== 'suspended') return 'Маршрут не приостановлен';
        if (r.approvers.every(a => a.status === 'approved')) { this.set(r, 'active', cmd.by, 'возобновлён'); return null; }
        return this.exec({ c: 'submit', by: cmd.by, id: r.id });
      }
      case 'close': { if (!isInit) return 'Закрыть может только инициатор'; this.set(r, 'withdrawn', cmd.by, 'закрыт инициатором'); this.notifyAll(r, `Маршрут «${r.name}» закрыт инициатором`, 'warn', cmd.by); return null; }
      case 'delete': {
        if (!isInit) return 'Удалить может только инициатор';
        if (!['draft', ...FINAL].includes(r.status) && r.approvers.length) return 'Сначала закройте маршрут';
        if (r.status === 'active' || r.status === 'disputed') this.onDeactivate?.(r);
        this.routes = this.routes.filter(x => x !== r); return null;
      }
      case 'dispute': {
        if (r.status !== 'active' || (!ap && !isInit)) return 'Спор можно открыть только по активному маршруту';
        r.disputeUntil = this.day + RB.disputeDays; this.set(r, 'disputed', cmd.by, cmd.note);
        for (const o of this.involved(r)) if (o !== cmd.by) this.terr.addRelation?.(cmd.by, o, RB.relationOnDispute);
        this.notifyAll(r, `Спор по маршруту «${r.name}»: ${cmd.note}`, 'warn', cmd.by); return null;
      }
      case 'resolveDispute': {
        if (r.status !== 'disputed') return 'Нет спора'; r.disputeUntil = undefined;
        this.set(r, cmd.forInitiator ? 'active' : 'suspended', cmd.by, cmd.forInitiator ? 'спор решён в пользу инициатора' : 'спор решён против инициатора'); return null;
      }
    }
    return 'Неизвестная команда';
  }
  private recompute(r: Route, by: OwnerId) {
    const ok = r.approvers.filter(a => a.status === 'approved').length;
    if (ok === r.approvers.length) { if (r.status !== 'active') { this.set(r, 'active', by, 'согласовано всеми'); this.notifyAll(r, `Маршрут «${r.name}» согласован всеми и запущен`, 'good'); } }
    else if (ok > 0 && ['submitted', 'review'].includes(r.status)) this.set(r, 'partial', by);
    else if (ok === 0 && r.status === 'partial') this.set(r, 'submitted', by);
  }
  /** ИИ-решения, таймауты, уведомления об отзыве, сроки — вызывать раз в игровой день. */
  tickDay(day: GameDay) {
    this.day = day;
    for (const r of [...this.routes]) {
      if (FINAL.includes(r.status)) continue;
      if (['submitted', 'review', 'partial'].includes(r.status)) {
        for (const a of r.approvers) {
          if (a.status !== 'pending' && !(a.status === 'countered' && this.terr.isAI(a.owner))) continue;
          if (a.status === 'pending' && this.terr.isAI(a.owner) && a.decideAt != null && day >= a.decideAt) this.aiDecide(r, a.owner);
          if (FINAL.includes(r.status)) break;
          if (a.status === 'pending' && day === a.deadline - 3) this.note(a.owner, r, `До истечения ответа по «${r.name}» 3 дня`, 'warn');
          if (a.status === 'pending' && day >= a.deadline) { this.set(r, 'expired', a.owner, 'таймаут ответа (молчание = отказ)'); this.notifyAll(r, `Заявка «${r.name}» истекла: ${this.terr.ownerName(a.owner)} не ответил`, 'bad'); break; }
        }
      }
      if (r.status === 'active' || r.status === 'disputed' || r.status === 'suspended') {
        const lapsed = r.approvers.filter(a => a.status === 'revoked' && a.noticeUntil != null && day >= a.noticeUntil);
        if (lapsed.length && r.status !== 'suspended') this.set(r, 'suspended', lapsed[0].owner, 'период уведомления после отзыва истёк');
        if (r.status === 'suspended' && lapsed.length && day >= lapsed[0].noticeUntil! + r.terms.withdrawNoticeDays) this.set(r, 'withdrawn', -1, 'нет решения после приостановки');
      }
      if (r.status === 'disputed' && r.disputeUntil != null && day >= r.disputeUntil) {
        const fault = r.econ.unpaidMonths >= 2; r.disputeUntil = undefined; this.set(r, fault ? 'suspended' : 'active', -1, fault ? 'спор решён против инициатора (неуплата)' : 'спор решён в пользу инициатора');
      }
      if (r.status === 'active' && r.approvers.length && r.expiresDay != null) {
        if (day === r.expiresDay - 30) this.note(r.initiator, r, `Срок соглашения по «${r.name}» истекает через 30 дней`, 'warn');
        if (day >= r.expiresDay) { this.set(r, 'expired', -1, 'срок соглашения истёк'); this.notifyAll(r, `Соглашение по «${r.name}» истекло`, 'warn'); }
      }
    }
  }
  private aiDecide(r: Route, owner: OwnerId) {
    const s = aiScore(r, owner, this.terr);
    if (s.verdict === 'approve') this.exec({ c: 'approve', by: owner, id: r.id });
    else if (s.verdict === 'counter' && r.counterRounds < RB.maxCounterOffers) {
      const mult = RB.aiProfiles[s.profile].tollMult; const t: Partial<Terms> = mult > 1 ? { tollPerVehKm: r.terms.tollPerVehKm * mult, tollPerTonKm: r.terms.tollPerTonKm * mult } : { revenueShare: r.terms.revenueShare + 0.05, termMonths: Math.max(RB.minTermMonths, Math.round(r.terms.termMonths / 2)) };
      this.exec({ c: 'counter', by: owner, id: r.id, terms: t, note: `Готов согласовать на изменённых условиях (${s.reason})` });
    } else this.exec({ c: 'reject', by: owner, id: r.id, note: s.reason });
    this.onChange?.();
  }
  /** Месячный расчёт экономики (09 §5). revenue — выручка за месяц (из Transit), vehKmDay/paxKmDay — пробег/пасс-км в сутки. */
  settleMonth(r: Route, revenue: number, vehKmDay: number, paxKmDay: number, opCost: number) {
    const E = r.econ; const tot = Math.max(1e-6, totalKm(r)); const cargo = MODE_INFO[r.mode].cargo;
    E.revenueMonth = revenue; E.vehKmDay = vehKmDay; E.paxKmDay = paxKmDay; E.byOwner = {}; E.tollPaidMonth = 0; E.sharePaidMonth = 0;
    if (r.status !== 'active' && r.status !== 'disputed') { E.costMonth = opCost; E.balance = -opCost; E.byOwner[r.initiator] = -opCost; return E; }
    const fk = foreignKm(r); const km = kmByOwner(r.segments);
    for (const a of r.approvers) {
      const frac = (km.get(a.owner) || 0) / tot;
      const toll = (cargo ? r.terms.tollPerTonKm * paxKmDay : r.terms.tollPerVehKm * vehKmDay) * frac * DAYS_PER_MONTH;
      const share = fk > 0 ? r.terms.revenueShare * revenue * (km.get(a.owner) || 0) / fk : 0;
      const pay = toll + share; const escrow = r.status === 'disputed';
      E.tollPaidMonth += toll; E.sharePaidMonth += share; E.byOwner[a.owner] = escrow ? 0 : pay;
      if (!escrow) this.terr.pay?.(r.initiator, a.owner, pay, `плата за маршрут «${r.name}»`);
    }
    E.costMonth = opCost + E.tollPaidMonth + E.sharePaidMonth; E.balance = revenue - E.costMonth; E.byOwner[r.initiator] = E.balance;
    E.unpaidMonths = E.balance < 0 ? E.unpaidMonths + 1 : 0; return E;
  }
  serialize() { return { routes: this.routes, nextId: this.nextId, day: this.day }; }
  load(s: any) { if (!s) return; this.routes = s.routes; this.nextId = s.nextId; this.day = s.day; }
  incoming(me: OwnerId) { return this.routes.filter(r => r.approvers.some(a => a.owner === me)); }
  outgoing(me: OwnerId) { return this.routes.filter(r => r.initiator === me && r.approvers.length); }
  mine(me: OwnerId) { return this.routes.filter(r => r.initiator === me); }
}
