// Подключение вовлечённости к игре: attachEngage(game, snapshot?) из src/main.ts.
// Адаптер снимает метрики раз в игровой день, действия игрока идут командой {a:'eng',...} через game.exec (слой команд).
import * as THREE from 'three';
import '../../design/ui.css'; import './engage.css';
import type { Game } from '../game';
import { UI } from '../ui';
import { registerCommand } from '../commands';
import { BALANCE } from '../sim/balance';
import { LINE_TYPES } from '../sim/Transit';
import { PLACEABLES } from '../tools';
import { K, Z, TILE } from '../world/consts';
import { ENG, type Difficulty } from './consts';
import { Engage, type FeedItem, type EngCmd } from './engine';
import { ONBOARDING, TECHS, BRANCHES, ACHIEVEMENTS, UNLOCKS, EVENTS, whyNotGrowing, type Metrics } from './content';
import { SFX, soundOn, setSound } from './audio';
export { Engage } from './engine';

const h = (s: string) => { const d = document.createElement('div'); d.innerHTML = s.trim(); return d.firstElementChild as HTMLElement; };
const money = (v: number) => (v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('ru') + ' ₽';
const cfg = { paper: localStorage.getItem('citysim_paper') !== '0' };
let tab = 'goals';
UI.registerPanel('engage', '🎯 Развитие', (el, g, force) => { const s = (g as any).engage as EngageSystem | undefined; if (s && (force || s.dirty)) { s.dirty = false; s.renderPanel(el); } });
registerCommand('eng', (g, cmd) => { const s = (g as any).engage as EngageSystem | undefined; return s ? s.eng.apply(cmd as EngCmd) : false; });

export class EngageSystem {
  eng: Engage; dirty = true; lastDay = 0; sawBudget = false; goalEl: HTMLElement; floatEl: HTMLElement; advEl: HTMLElement | null = null; unread = 0; bell: HTMLElement;
  floats: { el: HTMLElement; x: number; z: number; y: number; born: number }[] = []; lastMoney = 0; idleT = performance.now(); lastPops: number[] = [];
  trafficSnap: { day: number; green: number; avg: number } | null = null;
  constructor(public g: Game, snap?: any) {
    this.eng = new Engage(g.world.seed);
    this.eng.host = { money: v => { g.eco.money += v; this.float(v > 0 ? '+' + money(v) : money(v), v > 0 ? 'money' : 'neg', 'top'); }, price: (gd, m) => { g.eco.worldPrice[gd] *= m; }, canPay: v => g.eco.money >= v, worldPrice: gd => g.eco.worldPrice[gd] };
    if (snap?.engage) this.eng.load(snap.engage);
    this.lastDay = g.eco.day; this.lastMoney = g.eco.money;
    this.floatEl = h('<div id="eng-float"></div>'); g.ui.root.appendChild(this.floatEl);
    this.goalEl = h('<div id="eng-goal" class="cs-panel"></div>'); g.ui.root.appendChild(this.goalEl);
    this.bell = g.ui.top.querySelector('button[data-p="engage"]') as HTMLElement; if (this.bell) this.bell.id = 'eng-bell';
    this.hooks(); this.renderGoal();
    const loop = () => { try { this.frame(); } catch (e) { console.error('engage', e); } requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    window.addEventListener('pointerdown', () => { this.idleT = performance.now(); }, true); window.addEventListener('keydown', () => { this.idleT = performance.now(); }, true);
  }
  cmd(c: any) { const ok = this.g.exec({ a: 'eng', ...c }); SFX.click(); this.dirty = true; this.renderGoal(); this.drain(); return ok; }
  hooks() {
    const g = this.g, T = g.tools as any, E = this.eng;
    // разблокировки 02 §4: проверка перед постройкой (без правок tools.ts)
    const place = T.place.bind(T); T.place = (p: any, sub: number, rec: boolean) => { if (!E.placeUnlocked(sub)) { const u = UNLOCKS.find(u => u.place === sub)!; SFX.bad(); return g.ui.toast(`🔒 ${PLACEABLES[sub].name}: ${E.unlockState(u.key).why}`, 'bad'); } return place(p, sub, rec); };
    const fin = T.finishLine.bind(T); T.finishLine = () => { const ty = T.sub; if (!E.lineUnlocked(ty)) { const u = UNLOCKS.find(u => u.line === ty)!; SFX.bad(); g.ui.toast(`🔒 ${LINE_TYPES[ty].name}: ${E.unlockState(u.key).why}. Подробнее — «🎯 Развитие»`, 'bad'); return; } return fin(); };
    // P1: «−₽» при постройке
    const spend = g.eco.spend.bind(g.eco); g.eco.spend = (v: number) => { spend(v); if (v > 0) { const c = T.cursor; if (c) this.float('−' + money(v).replace('−', ''), 'neg', c); } };
    const open = g.ui.open.bind(g.ui); g.ui.open = (p: string) => { if (p === 'eco') this.sawBudget = true; if (p === 'engage') { this.unread = 0; this.badge(); } open(p); };
    // сохранение
    const snapF = g.snapshot.bind(g); (g as any).snapshot = async () => ({ ...(await snapF()), engage: E.serialize() });
  }
  /** метрики региона игрока (раз в игровой день) */
  sample(): Metrics {
    const g = this.g, w = g.world, e = g.eco, S = w.sub, N = w.N; const zones: [number, number, number] = [0, 0, 0]; const bld = new Array(9).fill(0);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { if (S.ownerAt((i + 0.5) * TILE, (j + 0.5) * TILE) !== 0) continue; const k = j * N + i; const z = w.zone[k]; if (z >= Z.R && z <= Z.I) zones[z - 1]++; if (w.bld[k]) bld[w.kind[k]]++; }
    const own = e.cities.filter(c => S.ownerAt(c.x, c.z) === 0); const pop = own.reduce((s, c) => s + c.pop, 0) || 1; const wa = (f: (c: any) => number) => own.reduce((s, c) => s + f(c) * c.pop, 0) / pop;
    const y = e.yesterday; const lines: [number, number, number, number] = [0, 0, 0, 0]; let stopsMax = 0; for (const l of g.transit.lines) { if (S.ownerAt(l.stops[0].x, l.stops[0].z) === 0) { lines[l.type]++; stopsMax = Math.max(stopsMax, l.stops.length); } }
    let roads = 0, art = 0; for (const ed of w.net.edges) if (ed.alive) { roads++; if (ed.type >= 1) art++; }
    const rivals = new Map<string, number>(); for (const c of e.cities) { const o = S.ownerAt(c.x, c.z); if (o > 0) rivals.set(c.name, (rivals.get(c.name) ?? 0) + c.pop); }
    const routesActive = ((g as any).routes?.book?.routes ?? []).filter((r: any) => r.status === 'active').length;
    return { day: e.day, money: e.money, pop: own.reduce((s, c) => s + c.pop, 0), popAll: e.cities.reduce((s, c) => s + c.pop, 0), cities: own.length, roads, arterials: art, zones, bld, lines, stopsMax,
      riders: own.reduce((s, c) => s + c.transitRiders, 0), trips: own.reduce((s, c) => s + c.tripsDay, 0), cong: Math.min(1.5, wa(c => c.cong)), unemp: wa(c => c.unemp), short: wa(c => c.short),
      income: y.tR + y.tC + y.tI + y.fares + y.tariff, expense: y.roads + y.transit + y.services + y.interest, subs: S.ownedCount(), loans: e.loans.length, routesActive,
      maxCityPop: Math.max(0, ...own.map(c => c.pop)), water: own.some(c => c.kind === 'port' || c.port > 0), land: wa(c => c.lvAvg), poll: wa(c => c.poll), happy: Math.max(0, Math.min(1, wa(c => c.attract))),
      exports: own.reduce((s, c) => s + c.exportVal, 0), rivals: [...rivals].map(([name, pop]) => ({ name, pop })), sawBudget: this.sawBudget, scale: BALANCE.budget.startMoney[w.sizeIdx] / BALANCE.budget.startMoney[2] };
  }
  frame() {
    const g = this.g, now = performance.now();
    if (g.eco.day !== this.lastDay) { this.lastDay = g.eco.day; const m = this.sample(); this.eng.tickDay(m); this.applyMods(); this.popFloats(); this.drain(); this.dirty = true; this.renderGoal(); }
    // P1: счётчик бюджета
    const dm = g.eco.money - this.lastMoney; if (Math.abs(dm) > 1) { const el = g.ui.top.querySelector('#money'); if (el && Math.abs(dm) >= 1000) { el.classList.remove('eng-flash', 'eng-flash-neg'); void (el as HTMLElement).offsetWidth; el.classList.add(dm > 0 ? 'eng-flash' : 'eng-flash-neg'); } this.lastMoney = g.eco.money; }
    // float-тексты следуют за миром
    const cam = g.r.cam, v = new THREE.Vector3(), W = innerWidth, H = innerHeight;
    this.floats = this.floats.filter(f => { if (now - f.born > ENG.floatTextTtlSec * 1000) { f.el.remove(); return false; } if (!isNaN(f.x)) { v.set(f.x, f.y, f.z).project(cam); f.el.style.left = (v.x * 0.5 + 0.5) * W + 'px'; f.el.style.top = (-v.y * 0.5 + 0.5) * H + 'px'; f.el.style.display = v.z < 1 ? '' : 'none'; } return true; });
    // подсказка-«призрак»: 60 с без действий
    if (!this.eng.onbDone && now - this.idleT > 60000) { this.idleT = now; this.goalEl.classList.remove('pulse'); void this.goalEl.offsetWidth; this.goalEl.classList.add('pulse'); }
  }
  applyMods() { const gm = this.eng.mod('growth'); if (gm) for (const c of this.g.eco.cities) if (this.g.world.sub.ownerAt(c.x, c.z) === 0) c.occ = Math.max(0.5, Math.min(1, c.occ + gm)); }
  float(text: string, cls: string, at: 'top' | { x: number; z: number; y?: number }) {
    if (this.floats.length >= ENG.floatTextMaxOnScreen) { const o = this.floats.shift()!; o.el.remove(); }
    const el = h(`<div class="eng-ft ${cls}"></div>`); el.textContent = text; this.floatEl.appendChild(el);
    if (at === 'top') { const r = this.g.ui.top.querySelector('#money')?.getBoundingClientRect(); el.style.left = (r ? r.left + r.width / 2 : 120) + 'px'; el.style.top = (r ? r.bottom + 14 : 60) + 'px'; this.floats.push({ el, x: NaN, z: 0, y: 0, born: performance.now() }); }
    else this.floats.push({ el, x: at.x, z: at.z, y: at.y ?? this.g.world.hAt(at.x, at.z) + 40, born: performance.now() });
  }
  popFloats() { const e = this.g.eco; e.cities.forEach((c, i) => { const prev = this.lastPops[i]; this.lastPops[i] = c.pop; if (prev == null || this.g.world.sub.ownerAt(c.x, c.z) !== 0) return; const d = Math.round(c.pop - prev); if (Math.abs(d) >= 5) this.float((d > 0 ? '+' : '−') + Math.abs(d).toLocaleString('ru') + ' жит.', d > 0 ? 'pos' : 'neg', { x: c.x, z: c.z, y: this.g.world.hAt(c.x, c.z) + 120 }); }); }
  badge() { if (!this.bell) return; this.bell.querySelector('sup')?.remove(); if (this.unread) this.bell.appendChild(h(`<sup>${this.unread}</sup>`)); }
  drain() {
    for (const f of this.eng.drain()) {
      if (f.kind === 'day') continue;
      if (f.kind === 'month') { if (cfg.paper) this.paper(f.data); SFX.info(); continue; }
      if (f.kind === 'advisor') { this.showAdvisor(f.data); continue; }
      if (f.kind === 'milestone') { this.milestone(f); continue; }
      if (f.kind === 'event' && f.data?.ev) { SFX.alarm(); this.eventModal(f.data.ev, f.sev >= 3); continue; }
      this.toast(f); this.unread++; this.badge();
      if (f.kind === 'ach') SFX.ach(); else if (f.kind === 'goal' || f.kind === 'quest' && f.sev === 0 || f.kind === 'tech' || f.kind === 'unlock') SFX.quest(); else if (f.kind === 'reward' && f.sev === 0) SFX.coin(); else if (f.sev >= 2) SFX.bad();
      if (f.sev >= 3 && ENG.autoPauseOnCritical) { this.g.ui.setSpeed(0); this.modal(`<h2>${f.icon} ${f.title}</h2><p>${f.text}</p><button class="eng-opt" data-x>Понятно</button>`); }
    }
  }
  toast(f: FeedItem) {
    const n = h(`<div class="note eng ${f.sev >= 2 ? 'bad' : f.sev === 1 ? 'warn' : 'good'} ${f.target ? 'go' : ''}"><div class="i">${f.icon}</div><div><b></b><small></small></div></div>`);
    n.querySelector('b')!.textContent = f.title; n.querySelector('small')!.textContent = f.text;
    if (f.target) n.onclick = () => this.g.r.ctl.jump(f.target!.x, f.target!.z);
    if (f.data?.contract) { n.classList.add('go'); n.onclick = () => { tab = 'contracts'; if (this.g.ui.panel !== 'engage') this.g.ui.open('engage'); this.dirty = true; }; }
    const N = this.g.ui.notes; N.prepend(n); while (N.children.length > 6) N.lastElementChild!.remove();
    setTimeout(() => { n.style.transition = 'opacity .6s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 700); }, 7000);
  }
  modal(html: string, paper = false) {
    document.getElementById('eng-modal')?.remove(); const m = h(`<div id="eng-modal"><div class="box cs-panel ${paper ? 'eng-paper' : ''}">${html}</div></div>`); this.g.ui.root.appendChild(m);
    m.querySelectorAll('[data-x]').forEach(b => (b as HTMLElement).onclick = () => m.remove()); return m;
  }
  eventModal(uid: number, crit: boolean) {
    const ev = this.eng.events.find(e => e.uid === uid); if (!ev) return; const def = EVENTS.find(d => d.id === ev.id)!; const prevSpeed = this.g.speed;
    if (crit && ENG.autoPauseOnCritical) this.g.ui.setSpeed(0);
    const m = this.modal(`<h2>${def.icon} ${def.title}</h2><p>${def.text(this.eng.last!, ev.p)}</p>${ev.opts.map((o, i) => `<button class="eng-opt" data-o="${i}" ${o.cost && this.g.eco.money < o.cost ? 'disabled' : ''}>${String.fromCharCode(65 + i)}. ${o.label}${o.cost ? `<span class="c">${money(o.cost)}</span>` : ''}<small>${o.desc}${i === 0 ? ' · по умолчанию через ' + ENG.eventDecisionDays + ' дн.' : ''}</small></button>`).join('')}<div style="margin-top:10px;text-align:right"><button class="eng-x" data-x>Решить позже</button></div>`);
    m.querySelectorAll('button[data-o]').forEach(b => (b as HTMLElement).onclick = () => { if (this.cmd({ c: 'choose', ev: uid, opt: +(b as HTMLElement).dataset.o! })) { m.remove(); if (crit) this.g.ui.setSpeed(prevSpeed || 1); } });
    m.querySelector('[data-x]')!.addEventListener('click', () => { if (crit) this.g.ui.setSpeed(prevSpeed || 1); });
  }
  paper(r: any) {
    const f = (d: number, k: string) => `<span style="color:${(k === 'Пробки' ? -d : d) >= 0 ? '#2a7a3a' : '#a33'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}${k === 'Пробки' ? ' п.п.' : '%'}</span>`;
    this.modal(`<h2>ГОРОДСКОЙ ВЕСТНИК</h2><div style="text-align:center;font-size:12px">Месяц ${r.month} · репутация мэрии ${Math.round(r.rep)} (${r.dRep >= 0 ? '+' : ''}${r.dRep.toFixed(1)})</div><div class="hl">${r.headline}</div><div class="facts">${r.facts.map((x: any) => `<div>${x.k}<b>${x.v}</b>${f(x.d, x.k)}</div>`).join('')}</div><p>Совет редакции: ${r.advice}</p><div style="display:flex;justify-content:space-between;align-items:center"><label style="font-size:12px"><input type="checkbox" id="eng-np" ${cfg.paper ? '' : 'checked'}> не показывать автоматически</label><button class="eng-opt" style="width:auto;margin:0" data-x>Закрыть</button></div>`, true)
      .querySelector('#eng-np')!.addEventListener('change', e => { cfg.paper = !(e.target as HTMLInputElement).checked; localStorage.setItem('citysim_paper', cfg.paper ? '1' : '0'); });
  }
  milestone(f: FeedItem) {
    SFX.ach(); const root = this.g.ui.root; const b = h(`<div id="eng-banner"><div class="big">🏆 ${f.data.name}</div><div class="sm">${f.text}</div></div>`); root.appendChild(b); setTimeout(() => b.remove(), 3300);
    const cols = ['#ffd36a', '#5fe0c8', '#ff7a6a', '#8ab8ff', '#c49aff', '#5fe09a'];
    for (let i = 0; i < 90; i++) { const c = h('<i class="eng-conf"></i>'); c.style.left = Math.random() * 100 + 'vw'; c.style.background = cols[i % cols.length]; c.style.animationDuration = 2.5 + Math.random() * 2.5 + 's'; c.style.animationDelay = Math.random() * 0.8 + 's'; root.appendChild(c); setTimeout(() => c.remove(), 5500); }
    const own = this.g.eco.cities.find(c => this.g.world.sub.ownerAt(c.x, c.z) === 0); if (own) for (let i = 0; i < 6; i++) setTimeout(() => this.float('✨🎆✨', 'money', { x: own.x + (Math.random() - 0.5) * 400, z: own.z + (Math.random() - 0.5) * 400, y: 200 + Math.random() * 150 }), i * 400);
    const a = f.data.before, z = f.data.after; this.toast({ ...f, text: `Население ${Math.round(a.pop).toLocaleString('ru')} → ${Math.round(z.pop).toLocaleString('ru')}, бюджет ${money(a.money)} → ${money(z.money)}` });
  }
  showAdvisor(a: any) {
    this.advEl?.remove(); const el = h(`<div id="eng-adv" class="cs-panel"><div class="ava">${a.icon}</div><div style="flex:1"><div class="who">${a.who}</div><div class="txt"></div></div>${a.panel ? '<button class="cs-btn cs-btn--primary" data-s>Показать</button>' : ''}<button class="cs-btn" data-n>Не сейчас</button><button class="eng-x" data-c>✕</button></div>`);
    el.querySelector('.txt')!.textContent = a.text; this.g.ui.root.appendChild(el); this.advEl = el; SFX.info();
    (el.querySelector('[data-s]') as HTMLElement | null)?.addEventListener('click', () => { if (this.g.ui.panel !== a.panel) this.g.ui.open(a.panel); el.remove(); });
    (el.querySelector('[data-n]') as HTMLElement).onclick = () => { this.cmd({ c: 'snooze', adv: a.id }); el.remove(); }; (el.querySelector('[data-c]') as HTMLElement).onclick = () => el.remove();
    setTimeout(() => el.remove(), 25000);
  }
  renderGoal() {
    const E = this.eng, el = this.goalEl; const m = E.last;
    if (!E.onbDone) { const go = ONBOARDING[E.onb]; if (!go) { el.style.display = 'none'; return; } const p = m && E.onbBase && go.progress ? Math.max(0, Math.min(1, go.progress(m, E.onbBase))) : 0;
      const rw = Math.round((ENG.onboardingGoalRewards[E.onb] ?? 0) * Math.max(ENG.onboardingRewardMinScale, BALANCE.budget.startMoney[this.g.world.sizeIdx] / BALANCE.budget.startMoney[2]) * E.D.moneyMult / 1000) * 1000;
      el.style.display = ''; el.innerHTML = `<div class="row"><span>Цель ${E.onb + 1} из ${ONBOARDING.length}</span><button class="eng-x" data-skip>Пропустить обучение</button></div><div class="t">🎯 ${go.title}</div><div class="h">${go.hint}${go.key ? ` <kbd>${go.key}</kbd>` : ''}</div>${go.progress ? `<div class="cs-bar"><i style="width:${p * 100}%"></i></div>` : ''}<div class="row" style="margin-top:6px"><span>Награда: <b style="color:var(--money)">${money(rw)}</b>${go.rep ? ' · +' + go.rep + ' репутации' : ''}</span><span>проверка раз в игровой день</span></div>`;
      (el.querySelector('[data-skip]') as HTMLElement).onclick = () => this.cmd({ c: 'skipOnboarding' }); return; }
    if (!E.quests.length && !E.contracts.some(c => c.status === 'active')) { el.style.display = 'none'; return; }
    el.style.display = ''; el.innerHTML = `<div class="row"><span>Поручения мэрии</span><button class="eng-x" data-open>все ›</button></div>` + E.quests.map(q => `<div class="q"><b>📋 ${q.title}</b> <span class="row" style="display:inline">${q.text}</span><div class="cs-bar"><i style="width:${Math.min(100, q.streak / q.need * 100)}%"></i></div></div>`).join('') + E.contracts.filter(c => c.status === 'active').map(c => `<div class="q"><b>🤝 ${c.goodName}</b> <span class="row" style="display:inline">для «${c.from}», до дня ${c.deadline}</span><div class="cs-bar"><i style="width:${Math.min(100, c.delivered / c.value * 100)}%;background:var(--money)"></i></div></div>`).join('');
    (el.querySelector('[data-open]') as HTMLElement).onclick = () => { tab = 'goals'; this.g.ui.open('engage'); };
  }
  renderPanel(el: HTMLElement) {
    const E = this.eng, m = E.last, g = this.g; const tabs: [string, string][] = [['goals', 'Цели'], ['events', 'События' + (E.events.length ? ' •' : '')], ['contracts', 'Контракты'], ['tech', 'Исследования'], ['city', 'Почему не растёт'], ['ach', 'Достижения'], ['feed', 'Лента'], ['season', 'Сезон'], ['opts', 'Режим']];
    let html = `<h3>🎯 Развитие региона</h3><div class="eng-kpi"><div><b>${Math.round(E.rep)}</b><span>репутация</span></div><div><b>${E.rp}</b><span>очки развития (ОР)</span></div><div><b>${Object.keys(E.ach).filter(k => k.startsWith('a_')).length}/${ACHIEVEMENTS.length}</b><span>достижения</span></div></div><div class="eng-tabs">${tabs.map(t => `<button data-tab="${t[0]}" class="${tab === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div>`;
    if (tab === 'goals') {
      html += E.onbDone ? '' : `<div class="eng-card"><b>Обучение: ${E.onb}/${ONBOARDING.length}</b><div class="d">${ONBOARDING.map((o, i) => (i < E.onb ? '✅ ' : i === E.onb ? '▶ ' : '○ ') + o.title).join('<br>')}</div></div>`;
      html += E.quests.length ? E.quests.map(q => `<div class="eng-card"><b>📋 ${q.title}</b><div class="d">${q.text} · до дня ${q.deadline}</div><div class="cs-bar" style="margin-top:4px"><i style="width:${Math.min(100, q.streak / q.need * 100)}%"></i></div><div class="d">${q.streak}/${q.need} дн. подряд</div></div>`).join('') : `<div class="eng-card d">Поручения появляются в начале месяца из главных проблем города (максимум ${ENG.maxActiveQuests}).</div>`;
      html += `<h4>Разблокировки</h4>` + UNLOCKS.map(u => { const s = E.unlockState(u.key); return `<div class="eng-card ${s.ok ? 'done' : 'off'}"><b>${s.ok ? '🔓' : '🔒'} ${u.title}</b><div class="d">${s.ok ? 'доступно' : 'нужно: ' + s.why}</div></div>`; }).join('');
      html += `<div class="d" style="font-size:12px">Активные эффекты: ${E.mods.map(x => x.label + (x.until < 1e6 ? ` (до дня ${x.until})` : '')).join(', ') || 'нет'}</div>`;
    } else if (tab === 'events') {
      html += E.events.length ? E.events.map(e => { const d = EVENTS.find(x => x.id === e.id)!; return `<div class="eng-card"><b>${d.icon} ${d.title}</b><div class="d">решить до дня ${e.deadline}</div><button class="cs-btn" data-ev="${e.uid}">Открыть</button></div>`; }).join('') : '<div class="eng-card d">Сейчас всё спокойно. События случаются в среднем раз в 3 недели.</div>';
    } else if (tab === 'contracts') {
      html += E.contracts.length ? E.contracts.map(c => `<div class="eng-card"><b>🤝 ${c.goodName}</b><div class="d">«${c.from}» · ${money(c.value)} · до дня ${c.deadline} · отношения ${E.relations[c.from] ?? 50}</div>${c.status === 'offer' ? `<button class="cs-btn cs-btn--primary" data-ca="${c.uid}">Принять</button> <button class="cs-btn" data-cr="${c.uid}">Отклонить</button>` : `<div class="cs-bar"><i style="width:${Math.min(100, c.delivered / c.value * 100)}%;background:var(--money)"></i></div><div class="d">экспорт засчитан: ${money(c.delivered)}</div>`}</div>`).join('') : '<div class="eng-card d">Соседи присылают заказы примерно раз в 2 недели. Выполнение засчитывается по экспорту региона.</div>';
    } else if (tab === 'tech') {
      html += `<div class="d" style="font-size:12px;margin-bottom:6px">ОР в месяц ≈ ${Math.round(6 + (m ? m.income * 30 / 1e6 + 2 * m.pop / 1e5 : 0))}. Узел даёт право, репутация и потребность — допуск.</div><div class="eng-tree">${BRANCHES.map((b, bi) => `<div><h4>${b}</h4>${TECHS.filter(t => t.br === bi).map(t => { const has = E.has(t.id), st = E.techState(t.id); return `<div class="eng-node ${has ? 'has' : st.ok ? 'can' : ''}" ${st.ok ? `data-t="${t.id}"` : ''} title="${t.desc}${!has && !st.ok ? ' — ' + st.why : ''}"><b>${t.icon} ${t.title}</b>${has ? '✓ изучено' : t.cost + ' ОР'}</div>`; }).join('')}</div>`).join('')}</div>`;
    } else if (tab === 'city') {
      const own = g.eco.cities.filter(c => g.world.sub.ownerAt(c.x, c.z) === 0);
      html += own.map(c => { const f = whyNotGrowing(c.paceF); return `<div class="eng-card"><b>🏙 ${c.name}</b> <span class="d">${Math.round(c.pop).toLocaleString('ru')} жит.</span>${f.map(x => `<div class="eng-bar"><span>${x.k}</span><i style="width:${Math.max(3, Math.min(100, (1 + x.v) * 100))}px;background:${x.v < -0.3 ? 'var(--neg)' : x.v < -0.1 ? 'var(--warn)' : 'var(--pos)'}"></i>${(x.v >= 0 ? '+' : '') + x.v.toFixed(2)}</div>`).join('')}<div class="d">Главное: ${f[0].v < -0.05 ? f[0].k + ' — ' + f[0].tip : 'город растёт без ограничений'}</div><button class="cs-btn" data-jump="${c.x},${c.z}">Показать</button></div>`; }).join('');
      const t = this.trafficStat(); html += `<h4>Пробки: до / после</h4><div class="eng-card">Сейчас: зелёных рёбер ${Math.round(t.green * 100)}%, средняя загрузка ${Math.round(t.avg * 100)}%${this.trafficSnap ? `<br>Снимок (день ${this.trafficSnap.day}): зелёных ${Math.round(this.trafficSnap.green * 100)}% (${t.green >= this.trafficSnap.green ? '▲' : '▼'} ${Math.abs(Math.round((t.green - this.trafficSnap.green) * 100))} п.п.)` : ''}<div style="margin-top:6px"><button class="cs-btn" data-ov>Оверлей пробок</button> <button class="cs-btn" data-snap>Запомнить «до»</button></div></div>`;
    } else if (tab === 'ach') {
      html += `<div class="eng-ach">${ACHIEVEMENTS.map(a => `<div class="${E.ach[a.id] ? '' : 'no'}"><b>${a.icon} ${a.title}</b><br>${a.desc}${E.ach[a.id] ? ' · день ' + E.ach[a.id] : ''}</div>`).join('')}</div>`;
    } else if (tab === 'feed') {
      html += [...E.feed].reverse().slice(0, 60).map(f => `<div class="eng-card" style="border-left:3px solid ${['var(--pos)', 'var(--warn)', 'var(--neg)', 'var(--neg)'][f.sev]}"><b>${f.icon} ${f.title}</b> <span class="d">день ${f.day}</span><div class="d">${f.text}</div></div>`).join('') || '<div class="d">Пока пусто</div>';
    } else if (tab === 'season') {
      const cur = m ? [{ name: 'Вы', pop: m.pop }, ...m.rivals].map(r => ({ name: r.name, g: (r.pop - (E.season.base[r.name] ?? r.pop)) / Math.max(1, E.season.base[r.name] ?? 1) })).sort((a, b) => b.g - a.g) : [];
      html += `<div class="eng-card"><b>🏅 Сезон ${E.season.n}</b> <span class="d">${ENG.seasonLengthDays} игровых дней, рейтинг по росту населения; конец — день ${E.season.start + ENG.seasonLengthDays}</span>${cur.map((r, i) => `<div class="eng-bar"><span>${i + 1}. ${r.name}</span>${(r.g * 100).toFixed(1)}%</div>`).join('')}</div><div class="d" style="font-size:12px">Совместные проекты с соседями откроются в мультиплеере (узел «Совместные проекты»).</div>`;
    } else if (tab === 'opts') {
      html += `<div class="eng-card"><b>Режим сложности</b><div class="cs-seg" style="margin-top:6px">${(['relaxed', 'normal', 'hard'] as Difficulty[]).map(d => `<button data-diff="${d}" aria-pressed="${E.difficulty === d}">${{ relaxed: '🌿 Спокойный', normal: 'Обычный', hard: '🔥 Сложный' }[d]}</button>`).join('')}</div><div class="d" style="margin-top:6px">Спокойный: без кризисов и банкротства, награды ×2. Сложный: награды ×0,6, события ×1,5.</div></div>
        <div class="eng-card"><label><input type="checkbox" data-snd ${soundOn ? 'checked' : ''}> Звуки</label><br><label><input type="checkbox" data-paper ${cfg.paper ? 'checked' : ''}> Показывать «Вестник» в конце месяца</label></div>${E.months.length ? '<button class="cs-btn" data-lastpaper>Открыть последний «Вестник»</button>' : ''}`;
    }
    el.innerHTML = html;
    const on = (sel: string, f: (b: HTMLElement) => void) => el.querySelectorAll(sel).forEach(b => (b as HTMLElement).onclick = () => f(b as HTMLElement));
    on('[data-tab]', b => { tab = b.dataset.tab!; this.renderPanel(el); });
    on('[data-ev]', b => this.eventModal(+b.dataset.ev!, false));
    on('[data-ca]', b => { this.cmd({ c: 'contract', id: +b.dataset.ca!, accept: true }); this.renderPanel(el); }); on('[data-cr]', b => { this.cmd({ c: 'contract', id: +b.dataset.cr!, accept: false }); this.renderPanel(el); });
    on('[data-t]', b => { if (this.cmd({ c: 'research', t: b.dataset.t! })) this.renderPanel(el); });
    on('[data-jump]', b => { const [x, z] = b.dataset.jump!.split(',').map(Number); g.r.ctl.jump(x, z); });
    on('[data-ov]', () => g.ui.setOverlay('traffic')); on('[data-snap]', () => { this.trafficSnap = { day: g.eco.day, ...this.trafficStat() }; this.renderPanel(el); });
    on('[data-diff]', b => { this.cmd({ c: 'difficulty', d: b.dataset.diff as Difficulty }); this.renderPanel(el); });
    on('[data-lastpaper]', () => this.paper(E.months[E.months.length - 1]));
    el.querySelector('[data-snd]')?.addEventListener('change', e => setSound((e.target as HTMLInputElement).checked));
    el.querySelector('[data-paper]')?.addEventListener('change', e => { cfg.paper = (e.target as HTMLInputElement).checked; localStorage.setItem('citysim_paper', cfg.paper ? '1' : '0'); });
  }
  trafficStat() { const net = this.g.world.net; let n = 0, gr = 0, s = 0; for (let i = 0; i < net.edges.length; i++) { const e = net.edges[i]; if (!e.alive) continue; const l = this.g.traffic.edgeLoad(i); n++; s += Math.min(2, l); if (l < 0.6) gr++; } return { green: n ? gr / n : 1, avg: n ? s / n : 0 }; }
}
export function attachEngage(g: Game, snap?: any) { const s = new EngageSystem(g, snap); (g as any).engage = s; return s; }
void K;
