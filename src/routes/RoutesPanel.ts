// UI маршрутов: кнопка, панель (Мои / Входящие / Исходящие / Архив), создание маршрута на карте, карточка заявки. Стиль — design/ui.css (.cs-*).
import '../../design/ui.css';
import './routes.css';
import type { Game } from '../game';
import { RoutesSystem } from './system';
import { MODE_INFO, STATUS_RU, FINAL } from './types';
import type { Route, RouteMode, OwnerId } from './types';
import { aiScore, totalKm, kmByOwner } from './rules';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const money = (v: number) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + ' млн' : Math.round(v).toLocaleString('ru-RU')) + ' ₽';
const OWNER_COLORS = ['#4fb3ff', '#ff5a4f', '#5fd38a', '#f5b13d', '#c48cff', '#6fc3ff', '#ffb547', '#ff6b9a'];
type Tab = 'mine' | 'in' | 'out' | 'archive';

export class RoutesPanel {
  el: HTMLElement; btn: HTMLElement; open = false; tab: Tab = 'mine'; sel = -1; drawing: RouteMode | null = null; dirty = true;
  constructor(public g: Game, public sys: RoutesSystem) {
    this.btn = document.createElement('button'); this.btn.className = 'cs-btn cs-btn--icon rt-fab'; this.btn.dataset.tip = 'Маршруты'; this.btn.innerHTML = '<svg class="cs-ico"><use href="#i-rail"/></svg><span class="rt-badge"></span>'; this.btn.onclick = () => this.toggle();
    this.el = document.createElement('div'); this.el.className = 'cs-root cs-glass cs-panel rt-panel'; this.el.style.display = 'none';
    const bar = document.getElementById('pbtns'); const st = bar?.querySelector('button[data-p="settings"]'); if (st) st.before(this.btn); else if (bar) bar.append(this.btn); else document.body.append(this.btn); document.body.append(this.el); sys.listeners.push(() => { this.dirty = true; });
    const cv = g.r.canvas;
    window.addEventListener('keydown', e => { if (!this.drawing) return; if (e.key === 'Enter') { e.stopImmediatePropagation(); this.finish(); } if (e.key === 'Escape') this.stopDraw(); }, true);
    cv.addEventListener('dblclick', e => { if (this.drawing) { e.stopImmediatePropagation(); this.finish(); } }, true);
    window.addEventListener('keydown', e => { if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.key === 'm' || e.key === 'ь')) this.toggle(); });
    setInterval(() => this.tick(), 300);
  }
  toggle() { this.open = !this.open; this.el.style.display = this.open ? 'block' : 'none'; this.dirty = true; }
  tick() {
    const me = this.sys.me; const pend = this.sys.book.incoming(me).filter(r => r.approvers.find(a => a.owner === me)?.status === 'pending' && !FINAL.includes(r.status)).length;
    const b = this.btn.querySelector('.rt-badge') as HTMLElement; b.textContent = pend ? String(pend) : ''; b.style.display = pend ? 'inline-block' : 'none';
    if (this.drawing && this.g.tools.tool !== 'line') this.drawing = null;
    if (this.open && this.dirty) { this.dirty = false; this.render(); }
  }
  startDraw(mode: RouteMode) { this.drawing = mode; this.g.tools.set('line', MODE_INFO[mode].lineType); this.g.ui.toast(`Маршрут «${MODE_INFO[mode].name}»: кликайте остановки на карте, Enter/двойной клик — готово, Esc — отмена`, 'good'); this.dirty = true; }
  stopDraw() { this.drawing = null; this.g.tools.set('select'); this.dirty = true; }
  finish() {
    const pts = this.g.tools.pts.map(p => ({ x: Math.round(p.x), z: Math.round(p.z) })); const mode = this.drawing!;
    if (pts.length < 2) return this.g.ui.toast('Нужно минимум 2 остановки', 'bad');
    const err = this.sys.cmd({ c: 'create', by: this.sys.me, mode, stops: pts }); this.stopDraw(); if (err) return;
    const r = this.sys.book.routes[this.sys.book.routes.length - 1]; this.sel = r.id; this.open = true; this.el.style.display = 'block';
    this.tab = r.approvers.length ? 'out' : 'mine';
    this.g.ui.toast(r.approvers.length ? `Маршрут проходит по чужим территориям (${r.approvers.length}) — проверьте условия и отправьте заявку` : `Маршрут «${r.name}» запущен`, r.approvers.length ? 'warn' : 'good'); this.dirty = true;
  }
  badge(r: Route) { return `<span class="rt-st rt-st-${r.status}">${STATUS_RU[r.status]}</span>`; }
  list(): Route[] {
    const b = this.sys.book, me = this.sys.me;
    if (this.tab === 'mine') return b.mine(me).filter(r => !FINAL.includes(r.status) && !r.approvers.length || r.initiator === me && ['active', 'suspended', 'disputed'].includes(r.status));
    if (this.tab === 'in') return b.incoming(me).filter(r => !FINAL.includes(r.status) && r.status !== 'draft');
    if (this.tab === 'out') return b.outgoing(me).filter(r => !FINAL.includes(r.status));
    return b.routes.filter(r => FINAL.includes(r.status) && (r.initiator === me || r.approvers.some(a => a.owner === me)));
  }
  render() {
    const me = this.sys.me; const t = this.sys.book.terr; const L = this.list();
    const tabs: [Tab, string][] = [['mine', 'Мои'], ['in', 'Входящие'], ['out', 'Исходящие'], ['archive', 'Архив']];
    const cnt = (k: Tab) => { const o = this.tab; this.tab = k; const n = this.list().length; this.tab = o; return n; };
    let html = `<div class="rt-head"><b>Маршруты</b><button class="cs-btn rt-x" data-a="close">✕</button></div>
      <div class="rt-tabs">${tabs.map(([k, n]) => `<button class="cs-btn ${this.tab === k ? 'on' : ''}" data-tab="${k}">${n} <span class="rt-n">${cnt(k)}</span></button>`).join('')}</div>
      <div class="rt-new">${this.drawing ? `<span>Рисуем: ${MODE_INFO[this.drawing].name} · остановок ${this.g.tools.pts.length}</span><button class="cs-btn" data-a="finish">Готово</button><button class="cs-btn" data-a="cancel">Отмена</button>`
        : (Object.keys(MODE_INFO) as RouteMode[]).map(m => `<button class="cs-btn" data-new="${m}">+ ${MODE_INFO[m].name}</button>`).join('')}</div><div class="rt-list">`;
    if (!L.length) html += `<div class="rt-empty">Пусто</div>`;
    for (const r of L) {
      const my = r.approvers.find(a => a.owner === me);
      html += `<div class="rt-item ${this.sel === r.id ? 'sel' : ''}" data-sel="${r.id}"><div class="rt-row"><b>${esc(r.name)}</b>${this.badge(r)}</div>
        <div class="rt-dim">${MODE_INFO[r.mode].name} · ${totalKm(r).toFixed(1)} км · ${r.stops.length} ост. · от ${esc(t.ownerName(r.initiator))}${my ? ` · ваше решение: ${({ pending: 'ждёт', approved: 'согласовано', rejected: 'отказ', countered: 'встречное', revoked: 'отозвано' })[my.status]}` : ''}</div></div>`;
      if (this.sel === r.id) html += this.card(r);
    }
    this.el.innerHTML = html + '</div>'; this.bind();
  }
  card(r: Route) {
    const me = this.sys.me, t = this.sys.book.terr, isInit = r.initiator === me, my = r.approvers.find(a => a.owner === me); const T = r.terms; const E = r.econ;
    const km = kmByOwner(r.segments); const tot = totalKm(r) || 1;
    const bar = [...km.entries()].map(([o, k]) => `<span style="flex:${k};background:${o < 0 ? '#555' : OWNER_COLORS[o % 8]}" title="${esc(t.ownerName(o))}: ${k.toFixed(1)} км"></span>`).join('');
    const ed = isInit && r.status === 'draft';
    const inp = (k: keyof typeof T, v: number, step: number, mul = 1) => ed ? `<input class="cs-input" type="number" step="${step}" data-term="${k}" data-mul="${mul}" value="${+(v * mul).toFixed(2)}">` : `<b>${+(v * mul).toFixed(2)}</b>`;
    let h = `<div class="rt-card"><div class="rt-bar">${bar}</div>
      <div class="rt-own">${[...km.entries()].map(([o, k]) => `<span><i style="background:${o < 0 ? '#555' : OWNER_COLORS[o % 8]}"></i>${esc(t.ownerName(o))}: ${k.toFixed(1)} км (${Math.round(k / tot * 100)}%)</span>`).join('')}</div>
      <div class="rt-terms"><label>Плата, ₽/ТС-км ${inp('tollPerVehKm', T.tollPerVehKm, 1)}</label><label>Плата груз, ₽/т-км ${inp('tollPerTonKm', T.tollPerTonKm, 0.1)}</label>
      <label>Доля выручки, % ${inp('revenueShare', T.revenueShare, 1, 100)}</label><label>Срок, мес ${inp('termMonths', T.termMonths, 1)}</label>
      <label>Уведомление об отзыве: <b>${T.withdrawNoticeDays} дн.</b></label><label>Штраф за отзыв: <b>${Math.round(T.withdrawPenaltyShare * 100)}% год. дохода</b></label></div>`;
    if (r.approvers.length) h += `<div class="rt-sub">Согласующие</div>` + r.approvers.map(a => {
      const ai = t.isAI(a.owner) && isInit && !['active', ...FINAL].includes(r.status) ? aiScore(r, a.owner, t) : null;
      return `<div class="rt-appr"><span>${esc(t.ownerName(a.owner))} · ${a.km.toFixed(1)} км</span><span class="rt-a-${a.status}">${({ pending: 'ждёт' + (a.deadline ? ` (до дня ${a.deadline})` : ''), approved: 'согласовал', rejected: 'отказал', countered: 'встречное', revoked: `отозвал (стоп в день ${a.noticeUntil})` })[a.status]}</span>
        ${ai ? `<div class="rt-dim">Прогноз ИИ: ${ai.verdict === 'approve' ? 'вероятно согласится' : ai.verdict === 'counter' ? 'встречное предложение' : 'откажет'} (оценка ${ai.score.toFixed(2)} / порог ${ai.threshold.toFixed(2)})</div>` : ''}
        ${a.note ? `<div class="rt-dim">«${esc(a.note)}»</div>` : ''}
        ${a.status === 'countered' && isInit && a.counterTerms ? `<div class="rt-dim">Просит: ${a.counterTerms.tollPerVehKm.toFixed(0)} ₽/ТС-км, доля ${Math.round(a.counterTerms.revenueShare * 100)}%, срок ${a.counterTerms.termMonths} мес <button class="cs-btn" data-cmd="acceptCounter" data-from="${a.owner}">Принять встречное</button></div>` : ''}</div>`;
    }).join('');
    h += `<div class="rt-sub">Экономика (месяц)</div><div class="rt-econ"><span>Выручка <b>${money(E.revenueMonth)}</b></span><span>Расходы <b>${money(E.costMonth)}</b></span><span>Плата за проезд <b>${money(E.tollPaidMonth)}</b></span><span>Доля выручки <b>${money(E.sharePaidMonth)}</b></span>
      ${Object.entries(E.byOwner).map(([o, v]) => `<span>${esc(t.ownerName(+o))}: <b class="${v >= 0 ? 'pos' : 'neg'}">${money(v)}</b></span>`).join('')}${isInit && r.status === 'draft' ? `<span>Стройка ≈ <b>${money(this.sys.buildCost(r))}</b></span>` : ''}</div>`;
    const B = (c: string, n: string, cls = '') => `<button class="cs-btn ${cls}" data-cmd="${c}">${n}</button>`; const btns: string[] = [];
    if (isInit) {
      if (r.status === 'draft') btns.push(B('submit', r.approvers.length ? 'Отправить на согласование' : 'Запустить', 'primary'), B('delete', 'Удалить', 'danger'));
      if (['submitted', 'review', 'partial'].includes(r.status)) btns.push(B('close', 'Отозвать заявку', 'danger'));
      if (r.status === 'active') btns.push(B('pause', 'Приостановить'));
      if (r.status === 'suspended') btns.push(B('resume', 'Возобновить / переотправить', 'primary'));
      if (['active', 'suspended', 'disputed'].includes(r.status)) btns.push(r.approvers.length ? B('close', 'Закрыть маршрут', 'danger') : B('delete', 'Удалить маршрут', 'danger'));
      if (FINAL.includes(r.status)) btns.push(B('delete', 'Удалить из архива'));
    }
    if (my && !FINAL.includes(r.status)) {
      if (['submitted', 'review', 'partial'].includes(r.status) && my.status === 'pending') btns.push(B('approve', 'Принять', 'primary'), B('counterUp', 'Встречное: плата +30%'), B('reject', 'Отклонить', 'danger'));
      if (my.status === 'approved') btns.push(B('revoke', 'Отозвать согласие', 'danger'));
      if (my.status === 'revoked') btns.push(B('reapprove', 'Вернуть согласие', 'primary'));
      if (r.status === 'active') btns.push(B('dispute', 'Оспорить'));
    }
    h += `<div class="rt-btns">${btns.join('')}</div><details><summary>История (${r.history.length})</summary>${r.history.map(x => `<div class="rt-dim">день ${x.day}: ${STATUS_RU[x.from]} → ${STATUS_RU[x.to]} (${esc(t.ownerName(x.by))})${x.note ? ' — ' + esc(x.note) : ''}</div>`).join('')}</details></div>`;
    return h;
  }
  bind() {
    const q = (s: string) => this.el.querySelectorAll(s) as NodeListOf<HTMLElement>; const me = this.sys.me;
    q('[data-a=close]').forEach(b => b.onclick = () => this.toggle());
    q('[data-a=finish]').forEach(b => b.onclick = () => this.finish()); q('[data-a=cancel]').forEach(b => b.onclick = () => this.stopDraw());
    q('[data-tab]').forEach(b => b.onclick = () => { this.tab = b.dataset.tab as Tab; this.dirty = true; this.tick(); });
    q('[data-new]').forEach(b => b.onclick = () => this.startDraw(b.dataset.new as RouteMode));
    q('[data-sel]').forEach(b => b.onclick = () => {
      const id = +b.dataset.sel!; this.sel = this.sel === id ? -1 : id; const r = this.sys.book.get(id);
      if (r && r.approvers.some(a => a.owner === me) && r.status === 'submitted') this.sys.cmd({ c: 'open', by: me, id });
      if (r) this.g.r.ctl.jump?.(r.stops[0].x, r.stops[0].z, (this.g.r.ctl as any).gdist ?? 2000); this.dirty = true; this.tick();
    });
    q('[data-term]').forEach(i => (i as HTMLInputElement).onchange = () => { const v = +(i as HTMLInputElement).value / +i.dataset.mul!; this.sys.cmd({ c: 'edit', by: me, id: this.sel, terms: { [i.dataset.term!]: v } }); this.dirty = true; });
    q('[data-cmd]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const c = b.dataset.cmd!; const id = this.sel; const r = this.sys.book.get(id)!;
      if (c === 'counterUp') this.sys.cmd({ c: 'counter', by: me, id, terms: { tollPerVehKm: r.terms.tollPerVehKm * 1.3, tollPerTonKm: r.terms.tollPerTonKm * 1.3 }, note: 'Прошу повысить плату' });
      else if (c === 'acceptCounter') this.sys.cmd({ c, by: me, id, from: +b.dataset.from! });
      else if (c === 'dispute') this.sys.cmd({ c, by: me, id, note: 'нарушение условий' });
      else if (c === 'reject') this.sys.cmd({ c, by: me, id, note: 'Не согласен' });
      else this.sys.cmd({ c: c as any, by: me, id });
      this.dirty = true; this.tick();
    });
  }
}
