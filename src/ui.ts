import * as THREE from 'three';
import type { Game } from './game';
import { SPEEDS } from './game';
import { TILE, K, Z, KIND_NAMES, RES_NAMES, CITY_KINDS, SIZES } from './world/consts';
import { ROAD_TYPES } from './world/RoadNet';
import { LINE_TYPES } from './sim/Transit';
import { GOODS, BASE_PRICE } from './sim/Economy';
import { PLACEABLES, ToolId } from './tools';
import { QUALITIES, Overlay } from './render/Renderer';
import { BALANCE } from './sim/balance';
import { fmtMoney, fmtNum, clamp } from './util';

const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
const TOOLS: { id: ToolId; name: string; key: string; subs?: string[] }[] = [
  { id: 'select', name: '🔍 Выбор / обзор', key: '1' },
  { id: 'road', name: '🛣 Дорога', key: '2', subs: ROAD_TYPES.map(r => r.name) },
  { id: 'curve', name: '〰 Кривая дорога', key: '3', subs: ROAD_TYPES.map(r => r.name) },
  { id: 'zone', name: '🏘 Зонирование', key: '4', subs: ['Снять зону', 'Жилая (Ж)', 'Коммерческая (К)', 'Промышленная (П)'] },
  { id: 'bulldoze', name: '💥 Снос', key: '5' },
  { id: 'terrain', name: '⛰ Рельеф', key: '6', subs: ['Поднять', 'Опустить', 'Выровнять'] },
  { id: 'place', name: '🏗 Здания', key: '7', subs: PLACEABLES.map(p => `${p.name} (${fmtMoney(p.cost)})`) },
  { id: 'line', name: '🚌 Линии транспорта', key: '8', subs: LINE_TYPES.map(t => t.name) },
];
const OVERLAYS: [Overlay, string][] = [['none', 'Обычный вид'], ['traffic', 'Загрузка дорог'], ['land', 'Стоимость земли'], ['pollution', 'Загрязнение'], ['transit', 'Покрытие транспортом'], ['resources', 'Ресурсы'], ['zones', 'Зоны'], ['territory', 'Территории']];

/** точка подключения панелей внешних модулей (например src/routes/): UI.registerPanel('routes','🔀 Маршруты', render) */
export class UI {
  static extraPanels = new Map<string, { title: string; render: (el: HTMLElement, g: Game, force: boolean) => void }>();
  static registerPanel(id: string, title: string, render: (el: HTMLElement, g: Game, force: boolean) => void) { UI.extraPanels.set(id, { title, render }); }
  root = document.getElementById('ui')!; top: HTMLElement; toolsEl: HTMLElement; sub: HTMLElement; right: HTMLElement; info: HTMLElement; notes: HTMLElement; mini: HTMLCanvasElement; hint: HTMLElement; legend: HTMLElement;
  panel = ''; lastUpd = 0; selCity = 0; miniBase: ImageData | null = null; miniT = 0; curLine = -1;
  constructor(public g: Game) {
    this.root.innerHTML = '';
    this.top = h(`<div id="top" class="panel">
      <div class="stat"><b id="money"></b><span>бюджет <i id="delta"></i></span></div>
      <div class="stat"><b id="pop"></b><span>население региона</span></div>
      <div class="stat"><b id="date"></b><span id="clock"></span></div>
      <div class="sp" id="speeds"></div>
      <div class="grow"></div>
      <select id="overlay">${OVERLAYS.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>
      <button data-p="eco">💰 Экономика</button><button data-p="transport">🚦 Транспорт</button><button data-p="cities">🏙 Города</button><button data-p="region">🗺 Регион</button><button data-p="charts">📈 Графики</button><button data-p="settings">⚙ Настройки</button><button data-p="save">💾 Сохранения</button><button data-p="help">❔</button>
    </div>`);
    for (const [id, pn] of UI.extraPanels) { const b = h(`<button data-p="${id}">${pn.title}</button>`); this.top.querySelector('button[data-p="settings"]')!.before(b); }
    this.toolsEl = h(`<div id="tools" class="panel"></div>`); this.sub = h(`<div id="sub" class="panel"></div>`);
    this.right = h(`<div id="right" class="panel"></div>`); this.info = h(`<div id="info" class="panel"></div>`); this.notes = h(`<div id="notes"></div>`);
    const miniWrap = h(`<div id="mini" class="panel"><canvas width="256" height="256"></canvas></div>`); this.mini = miniWrap.querySelector('canvas')!;
    this.hint = h(`<div style="position:fixed;pointer-events:none;background:rgba(0,0,0,.7);padding:3px 7px;border-radius:5px;font-size:12px;display:none;z-index:5"></div>`);
    this.legend = h(`<div class="legend panel"></div>`);
    for (const e of [this.top, this.toolsEl, this.sub, this.right, this.info, this.notes, miniWrap, this.hint, this.legend]) this.root.appendChild(e);
    const sp = this.top.querySelector('#speeds')!; ['⏸', '▶', '▶▶', '▶▶▶', '⏩'].forEach((t, i) => { const b = h(`<button title="Скорость ${SPEEDS[i]}× (клавиша ${i === 0 ? 'Пробел' : i})">${t}</button>`); b.onclick = () => this.setSpeed(i); sp.appendChild(b); });
    this.top.querySelectorAll('button[data-p]').forEach(b => (b as HTMLElement).onclick = () => this.open((b as HTMLElement).dataset.p!));
    (this.top.querySelector('#overlay') as HTMLSelectElement).onchange = e => this.setOverlay((e.target as HTMLSelectElement).value as Overlay);
    TOOLS.forEach(t => { const sp0 = t.name.indexOf(' '); const b = h(`<button data-t="${t.id}" title="${t.name.slice(sp0 + 1)} (${t.key})"><span><span class="ic">${t.name.slice(0, sp0)}</span><span class="lb"> ${t.name.slice(sp0 + 1)}</span></span><kbd>${t.key}</kbd></button>`); b.onclick = () => g.tools.set(t.id, t.id === 'zone' ? 1 : 0); this.toolsEl.appendChild(b); });
    { // V8: сворачиваемая панель инструментов; состояние в localStorage, на малых экранах по умолчанию свёрнута
      const tg = h(`<button id="tools-toggle" title="Свернуть/развернуть панель (Tab)">◀</button>`); this.toolsEl.prepend(tg);
      const saved = localStorage.getItem('citysim_tools'); let col = saved ? saved === '0' : (innerWidth < 1400 || innerHeight < 820);
      const apply = () => { this.toolsEl.classList.toggle('collapsed', col); tg.textContent = col ? '▶' : '◀ Свернуть'; };
      tg.onclick = () => { col = !col; localStorage.setItem('citysim_tools', col ? '0' : '1'); apply(); }; apply();
    }
    this.toolsEl.appendChild(h(`<div class="hint" style="margin-top:6px">ЛКМ — действие · ПКМ — вращение/отмена · Shift+ЛКМ или СКМ — сдвиг · колесо — зум · WASD/QE/RF</div>`));
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      const t = TOOLS.find(t => t.key === e.key); if (t && !e.ctrlKey) { g.tools.set(t.id, t.id === 'zone' ? 1 : 0); return; }
      if (e.code === 'Space') { e.preventDefault(); this.setSpeed(g.speed ? 0 : 1); }
      if (e.key === 'Tab') { e.preventDefault(); const t2 = TOOLS.find(t => t.id === g.tools.tool); if (t2?.subs) g.tools.set(t2.id, (g.tools.sub + 1) % t2.subs.length); }
      if (e.key === 'F5') { e.preventDefault(); this.quickSave(); }
    });
    window.addEventListener('pointermove', e => { this.hint.style.left = e.clientX + 16 + 'px'; this.hint.style.top = e.clientY + 14 + 'px'; this.hintT = performance.now(); });
    this.mini.onpointerdown = e => { const r = this.mini.getBoundingClientRect(); g.r.ctl.jump((e.clientX - r.left) / r.width * g.world.M, (e.clientY - r.top) / r.height * g.world.M); };
    this.refreshTools(); this.setSpeed(1);
  }
  hintT = 0; hintS = '';
  cursorHint(s: string) { this.hintS = s; this.hintSetT = performance.now(); }
  hintSetT = 0;
  setSpeed(i: number) { this.g.speed = i; this.top.querySelectorAll('#speeds button').forEach((b, k) => b.classList.toggle('on', k === i)); }
  setOverlay(o: Overlay) {
    this.g.r.overlay = o; (this.top.querySelector('#overlay') as HTMLSelectElement).value = o; this.g.r.refreshAll();
    const L: Record<string, string> = { traffic: '🟩 свободно → 🟨 → 🟥 пробка', land: '🟥 дешёвая → 🟩 дорогая земля', pollution: '🟩 чисто → 🟥 грязно', transit: 'голубой — зона пешей доступности остановок', resources: '🌲 лес · 🟫 руда · ⬛ нефть · 🟨 плодородная', zones: '🟩 жилая · 🟦 коммерческая · 🟨 промышленная', territory: '🟦 ваши подрегионы · 🟧 соседи (ИИ) · без цвета — свободные' };
    this.legend.style.display = o === 'none' ? 'none' : 'block'; this.legend.textContent = L[o] || '';
  }
  refreshTools() {
    const g = this.g; this.toolsEl.querySelectorAll('button[data-t]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.t === g.tools.tool));
    const t = TOOLS.find(t => t.id === g.tools.tool)!;
    if (!t.subs) { this.sub.style.display = 'none'; return; }
    this.sub.style.display = 'flex'; this.sub.innerHTML = `<b>${t.name}</b>`;
    t.subs.forEach((s, i) => { const b = h(`<button>${s}</button>`); b.classList.toggle('on', i === g.tools.sub); b.onclick = () => g.tools.set(t.id, i); this.sub.appendChild(b); });
    const tips: Record<string, string> = { road: 'Клик — начало, клик — конец (цепочка продолжается). Ctrl — шаг угла 15°. Esc/ПКМ — отмена. Пересечения создаются автоматически, над водой — мост (дороже).', curve: 'Клик: начало → контрольная точка → конец.', zone: 'Протяните прямоугольник. Зонируются только участки у дорог.', terrain: 'Удерживайте ЛКМ. «Выровнять» — к высоте точки нажатия.', place: 'Клик по участку у дороги.', line: 'Кликайте остановки (автобус/трамвай — у дорог). Enter или двойной клик — открыть линию. Линия ходит туда-обратно.' };
    this.sub.appendChild(h(`<div class="hint" style="max-width:220px">${tips[t.id] || ''}</div>`));
  }
  toast(text: string, lvl = 'warn') {
    for (const o of [...this.notes.children]) if ((o as HTMLElement).textContent === text) o.remove();
    const n = h(`<div class="note ${lvl}"></div>`); n.textContent = text; this.notes.prepend(n); setTimeout(() => n.remove(), 12000);
    while (this.notes.children.length > 3) this.notes.lastElementChild!.remove();
    setTimeout(() => { n.style.transition = 'opacity .6s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 700); }, 7000);
  }
  open(p: string) { this.panel = this.panel === p ? '' : p; this.top.querySelectorAll('button[data-p]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.p === this.panel)); this.right.style.display = this.panel ? 'block' : 'none'; this.renderPanel(true); }
  frame() {
    const now = performance.now();
    this.hint.style.display = now - this.hintSetT < 200 ? 'block' : 'none'; this.hint.textContent = this.hintS;
    if (now - this.lastUpd < 400) return; this.lastUpd = now;
    const g = this.g, e = g.eco; const y = e.yesterday;
    const inc = y.tR + y.tC + y.tI + y.fares + y.tariff, exp = y.roads + y.transit + y.services + y.interest;
    (this.top.querySelector('#money') as HTMLElement).textContent = fmtMoney(e.money); (this.top.querySelector('#money') as HTMLElement).style.color = e.money < 0 ? '#ff7060' : '';
    const dl = this.top.querySelector('#delta') as HTMLElement; dl.textContent = (inc - exp >= 0 ? '+' : '') + fmtMoney(inc - exp) + '/день'; dl.style.color = inc - exp >= 0 ? '#7fe08f' : '#ff8070';
    (this.top.querySelector('#pop') as HTMLElement).textContent = fmtNum(e.cities.reduce((s, c) => s + c.pop, 0));
    const hr = e.hour; (this.top.querySelector('#date') as HTMLElement).textContent = `День ${e.day}`; (this.top.querySelector('#clock') as HTMLElement).textContent = `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.floor((hr % 1) * 60)).padStart(2, '0')} · ${Math.round(g.fps)} FPS · авто ${g.traffic.active}`;
    if (this.panel) this.renderPanel(false);
    if (now - this.miniT > 3000) { this.miniT = now; this.drawMini(); } else this.drawMiniCam();
  }
  drawMini() {
    const w = this.g.world; const c = this.mini.getContext('2d')!; const S = 256; const img = c.createImageData(S, S); const st = w.N / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = Math.floor(x * st), j = Math.floor(y * st); const k = j * w.N + i; const hh = w.tileH(i, j); let r = 90, gg = 150, b = 70;
      if (hh < 0.3) { r = 40; gg = 100; b = 170; } else if (hh > 95) { r = gg = b = 150; }
      if (w.road[k]) { r = gg = b = 60; } else if (w.bld[k]) { const kd = w.kind[k]; if (kd === K.RES) { r = 200; gg = 190; b = 170; } else if (kd === K.COM) { r = 110; gg = 150; b = 220; } else { r = 200; gg = 170; b = 90; } }
      const o = (y * S + x) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    this.miniBase = img; this.drawMiniCam();
  }
  drawMiniCam() {
    if (!this.miniBase) return; const c = this.mini.getContext('2d')!; c.putImageData(this.miniBase, 0, 0); const w = this.g.world, ctl = this.g.r.ctl; const s = 256 / w.M;
    c.strokeStyle = '#fff'; c.lineWidth = 1.5; const r = Math.max(4, ctl.dist * 0.8 * s); c.strokeRect(ctl.tx * s - r, ctl.tz * s - r, r * 2, r * 2);
    c.fillStyle = '#fff'; c.font = '9px sans-serif'; for (const ci of w.cities) c.fillText(ci.name, ci.x * s - 15, ci.z * s);
  }
  // ---------- panels ----------
  renderPanel(force: boolean) {
    const ae = document.activeElement; if (!force && ae && this.right.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) return;
    const g = this.g, e = g.eco; const R = this.right; const p = this.panel;
    if (p === 'eco') {
      const y = e.yesterday; const c = e.cities[this.selCity];
      const row = (a: string, b: string) => `<tr><td>${a}</td><td>${b}</td></tr>`;
      R.innerHTML = `<h3>💰 Экономика региона</h3>
      <h4>Бюджет за вчера</h4><table>${row('Подоходный налог (Ж)', fmtMoney(y.tR))}${row('Налог на торговлю (К)', fmtMoney(y.tC))}${row('Налог на промышленность (П)', fmtMoney(y.tI))}${row('Плата за проезд', fmtMoney(y.fares))}${row('Пошлины (торговля)', fmtMoney(y.tariff))}
      ${row('<span style="color:#f99">Содержание дорог</span>', '−' + fmtMoney(y.roads))}${row('<span style="color:#f99">Общественный транспорт</span>', '−' + fmtMoney(y.transit))}${row('<span style="color:#f99">Городские службы</span>', '−' + fmtMoney(y.services))}${row('<span style="color:#f99">Проценты по кредитам</span>', '−' + fmtMoney(y.interest))}${row('<span style="color:#fc9">Строительство</span>', '−' + fmtMoney(y.build))}</table>
      <h4>Налоги (выше 9% — рост замедляется)</h4>
      ${(['R', 'C', 'I'] as const).map(k => `<div class="row" style="display:flex;gap:6px;align-items:center">${{ R: 'Жилой', C: 'Коммерч.', I: 'Пром.' }[k]} <input type="range" min="0" max="25" value="${e.tax[k]}" data-tax="${k}" style="flex:1"><b>${e.tax[k]}%</b></div>`).join('')}
      <h4>Кредиты</h4><div>${e.loans.map(l => `${fmtMoney(l.amount)} под ${(l.rate * 100).toFixed(0)}%`).join('<br>') || 'нет'}</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">${BALANCE.loans.offers.map((o, i) => `<button data-loan="${i}">${fmtMoney(o.amount)} · ${(o.annualRate * 100).toFixed(0)}%</button>`).join('')}<button id="repay" ${e.loans.length ? '' : 'disabled'}>Погасить первый</button></div>
      <h4>Отчёт по подрегионам (вчера, ваш регион)</h4><table>${e.cities.filter(c => e.owned(c)).map(c => { const l = e.cityLedgerY[c.id] || { inc: 0, exp: 0 }; return row(c.name, `<span style="color:var(--pos,#7fe08f)">+${fmtMoney(l.inc)}</span> / <span style="color:#f99">−${fmtMoney(l.exp)}</span>`); }).join('')}</table>
      <h4>Рынок: <select id="ecocity">${e.cities.map((c, i) => `<option value="${i}" ${i === this.selCity ? 'selected' : ''}>${c.name}</option>`).join('')}</select></h4>
      <table><tr><td><b>Товар</b></td><td><b>Запас</b></td><td><b>Пр-во/д</b></td><td><b>Потр/д</b></td><td><b>Цена</b></td></tr>
      ${GOODS.map((n, m) => `<tr><td>${n}</td><td>${fmtNum(c.stock[m])}</td><td>${fmtNum(c.prodDay[m])}</td><td>${fmtNum(c.consDay[m])}</td><td style="color:${c.price[m] > BASE_PRICE[m] * 1.2 ? '#f98' : c.price[m] < BASE_PRICE[m] * 0.8 ? '#8f8' : ''}">${c.price[m].toFixed(0)}</td></tr>`).join('')}</table>
      <div class="hint">Цепочки: добыча (зерно, древесина, руда, нефть) → переработка (продукты, пиломатериалы, сталь, топливо) → производство (товары) → торговля. Цена растёт при дефиците. Излишки вывозятся в другие города грузовиками, а через порт и внешние шоссе — на мировой рынок.</div>
      <table>${row('Грузовая пропускная способность', fmtNum(c.freightCap) + ' ед./день')}${row('Ввоз / вывоз (за тик)', fmtNum(c.tradeIn) + ' / ' + fmtNum(c.tradeOut))}${row('Импорт / экспорт с миром', fmtMoney(c.importVal) + ' / ' + fmtMoney(c.exportVal))}${row('Дефицит в торговле', (c.short * 100).toFixed(0) + '%')}</table>`;
      R.querySelectorAll('input[data-tax]').forEach(i => (i as HTMLInputElement).oninput = ev => { const t = ev.target as HTMLInputElement; g.exec({ a: 'tax', k: t.dataset.tax as any, v: +t.value }); (t.nextElementSibling as HTMLElement).textContent = t.value + '%'; });
      R.querySelectorAll('button[data-loan]').forEach(b => (b as HTMLElement).onclick = () => { g.exec({ a: 'loan', i: +(b as HTMLElement).dataset.loan! }); this.renderPanel(true); });
      (R.querySelector('#repay') as HTMLElement).onclick = () => { if (!g.exec({ a: 'repay' })) this.toast('Недостаточно средств для погашения', 'bad'); this.renderPanel(true); };
      (R.querySelector('#ecocity') as HTMLSelectElement).onchange = ev => { this.selCity = +(ev.target as HTMLSelectElement).value; this.renderPanel(true); };
    } else if (p === 'transport') {
      const t = g.traffic; const avg = t.stats.trips ? t.stats.tripTime / Math.max(1, t.stats.freeTime) : 1;
      R.innerHTML = `<h3>🚦 Транспорт</h3><table>
        <tr><td>Активных машин (агентов)</td><td>${t.active} / ${t.cap}</td></tr><tr><td>Один агент = людей/поездок</td><td>${t.scale.toFixed(1)}</td></tr>
        <tr><td>Поездок завершено</td><td>${fmtNum(t.stats.trips)}</td></tr><tr><td>Время в пути / свободное</td><td>×${avg.toFixed(2)}</td></tr><tr><td>Застряли и убраны</td><td>${t.stats.despawned}</td></tr>
        <tr><td>Пассажиров ОТ в день</td><td>${fmtNum(g.transit.lines.reduce((s, l) => s + l.riders, 0))}</td></tr></table>
        <h4>Пробки по городам</h4><table>${e.cities.map(c => `<tr><td>${c.name}</td><td>${bar(c.cong / 1.5, c.cong > 0.8 ? '#e55' : c.cong > 0.4 ? '#eb4' : '#5c6')} ×${(1 + c.cong).toFixed(2)} · авто ${(c.carShare * 100).toFixed(0)}%</td></tr>`).join('')}</table>
        <h4>Линии общественного транспорта</h4>
        ${g.transit.lines.map(l => `<div class="panel" style="padding:6px;margin:4px 0;border-left:5px solid #${l.color.toString(16).padStart(6, '0')}"><b>${l.name}</b> · ${(l.L / 2000).toFixed(1)} км · ${l.stops.length} ост.<br>
          Пассажиров: <b>${fmtNum(l.riders)}</b>/день · интервал ${g.transit.headwayMin(l).toFixed(1)} мин · доход ${fmtMoney(l.revenue - l.n * LINE_TYPES[l.type].upkeep)}/день ${l.cargo ? '· 🚚 грузы' : ''}<br>
          Составов: <button data-l="${l.id}" data-d="-1">−</button> <b>${l.n}</b> <button data-l="${l.id}" data-d="1">+</button> (${fmtMoney(LINE_TYPES[l.type].vehCost)})
          · Тариф: <button data-f="${l.id}" data-d="-5">−</button> ${l.fare} ₽ <button data-f="${l.id}" data-d="5">+</button> <button data-x="${l.id}">✖</button></div>`).join('') || '<div class="hint">Нет линий. Инструмент «Линии транспорта» (8).</div>'}
        <div class="hint">Жители выбирают способ поездки по времени (пешком до остановки + ожидание + в пути), цене (тариф vs топливо и парковка) и комфорту. Чем больше людей в ОТ — тем меньше машин и пробок. Остановки повышают стоимость земли.</div>`;
      R.querySelectorAll('button[data-l]').forEach(b => (b as HTMLElement).onclick = () => { const l = g.transit.lines.find(l => l.id === +(b as HTMLElement).dataset.l!)!; const d = +(b as HTMLElement).dataset.d!; if (d > 0) { if (e.money < LINE_TYPES[l.type].vehCost) return this.toast('Недостаточно средств', 'bad'); e.spend(LINE_TYPES[l.type].vehCost); } g.exec({ a: 'lineVeh', id: l.id, d }); this.renderPanel(true); });
      R.querySelectorAll('button[data-f]').forEach(b => (b as HTMLElement).onclick = () => { const l = g.transit.lines.find(l => l.id === +(b as HTMLElement).dataset.f!)!; g.exec({ a: 'lineFare', id: l.id, d: +(b as HTMLElement).dataset.d! }); this.renderPanel(true); });
      R.querySelectorAll('button[data-x]').forEach(b => (b as HTMLElement).onclick = () => { g.exec({ a: 'lineDel', id: +(b as HTMLElement).dataset.x! }); this.renderPanel(true); });
    } else if (p === 'cities') {
      R.innerHTML = `<h3>🏙 Города региона</h3>` + e.cities.map((c, i) => { const ci = g.world.cities[i]; return `<div class="panel" style="padding:8px;margin:6px 0">
        <div style="display:flex;justify-content:space-between"><b style="font-size:14px">${c.name}</b><button data-go="${i}">➜ показать</button></div>
        <div class="hint">План: ${g.world.cities[c.id].formRu || '—'} · районы: ${(g.world.cities[c.id].districts || []).map(d => d.name).join(', ')}</div>
        <div class="hint">${CITY_KINDS[ci.kind]} · ${c.outside ? 'выезд на внешнюю трассу · ' : ''}${c.port ? 'порт · ' : ''}радиус ${(c.rEff / 1000).toFixed(1)} км</div>
        <table><tr><td>Население</td><td><b>${fmtNum(c.pop)}</b></td></tr><tr><td>Рабочих мест / работников</td><td>${fmtNum(c.jobsTotal)} / ${fmtNum(c.workers)}</td></tr><tr><td>Безработица</td><td>${(c.unemp * 100).toFixed(1)}%</td></tr><tr><td>Заселённость жилья</td><td>${(c.occ * 100).toFixed(0)}%</td></tr>
        <tr><td>Привлекательность</td><td>${bar(c.attract, '#5ae')}</td></tr><tr><td>Средняя стоимость земли</td><td>${c.lvAvg.toFixed(2)}</td></tr></table>
        <div style="display:flex;gap:14px;align-items:center;margin-top:6px"><div class="dem">${demBar(c.dR, '#6c6')}${demBar(c.dC, '#69e')}${demBar(c.dI, '#eb5')}</div><div class="hint">Спрос Ж / К / П</div></div>
        <b>Темп роста: ${c.pace.toFixed(1)} зд./час</b><div class="hint">спрос ${c.paceF.demand.toFixed(2)} · налоги ×${c.paceF.tax.toFixed(2)} · пробки ×${c.paceF.cong.toFixed(2)} · снабжение ×${c.paceF.short.toFixed(2)} · цена земли ×${c.paceF.land.toFixed(2)} · новых улиц: ${c.expansions}</div></div>`; }).join('');
      R.querySelectorAll('button[data-go]').forEach(b => (b as HTMLElement).onclick = () => { const c = g.world.cities[+(b as HTMLElement).dataset.go!]; g.r.ctl.jump(c.x, c.z, c.r * 1.2); });
    } else if (p === 'charts') {
      if (!force && R.querySelector('canvas')) { this.drawCharts(); return; }
      R.innerHTML = `<h3>📈 Графики (последние 40 игровых часов)</h3>` + [['pop', 'Население региона'], ['money', 'Бюджет, ₽'], ['income', 'Доходы/расходы за день'], ['cong', 'Пробки (столица)'], ['riders', 'Пассажиры ОТ в день'], ['unemp', 'Безработица (столица), %']].map(([k, t]) => `<h4>${t}</h4><canvas class="chart" data-k="${k}" width="680" height="240"></canvas>`).join('');
      this.drawCharts();
    } else if (p === 'region') {
      const S = g.world.sub; const pop = e.playerPop(); const G = S.grid; const col = (o: number) => o === 0 ? '#4fb3ff' : o > 0 ? '#ffb547' : '#3a4558';
      let grid = `<div style="display:grid;grid-template-columns:repeat(${G},1fr);gap:3px;margin:8px 0">`;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const si = j * G + i, o = S.owner[si]; const bl = S.blocker(si, pop); const cl = S.claims.find(c => c.sub === si);
        grid += `<div data-sub="${si}" title="${o === 0 ? 'Ваш' : o > 0 ? e.cities[o].name : 'Свободен'}${cl ? ' · претендент: ' + e.cities[cl.ai].name : ''}" style="aspect-ratio:1;border-radius:6px;background:${col(o)};opacity:${o === -1 && !bl ? 1 : o === -1 ? 0.55 : 0.9};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;outline:${!bl && o === -1 ? '2px solid #5fd38a' : 'none'}">${o === 0 ? '★' : o > 0 ? e.cities[o].name.slice(0, 3) : cl ? '⚑' : ''}</div>`; }
      grid += '</div>';
      const cand = [...S.owner.keys()].filter(si => S.owner[si] === -1 && S.adj(si).some(n => S.owner[n] === 0));
      R.innerHTML = `<h3>🗺 Регион и расширение</h3><div class="hint">Один игрок = один регион. Вы начинаете с одного подрегиона; свободные соседние участки выкупаются мирно по мере роста. Участки соседей забрать нельзя. ★ — ваши, оранжевые — ИИ-соседи, тёмные — свободные (зелёная рамка — доступны сейчас).</div>${grid}
        <table><tr><td>Ваших подрегионов</td><td>${S.ownedCount()}</td></tr><tr><td>Население владений</td><td>${fmtNum(pop)}</td></tr><tr><td>Порог для следующего участка</td><td>${fmtNum(S.popGate())}</td></tr></table>
        <h4>Соседние свободные участки</h4>${cand.map(si => { const bl = S.blocker(si, pop); const pr = S.price(si); const cl = S.claims.find(c => c.sub === si); return `<div class="panel" style="padding:6px;margin:4px 0">Участок ${si % G + 1}:${(si / G | 0) + 1} · <b>${fmtMoney(pr)}</b>${cl ? ` · ⚑ претендует ${e.cities[cl.ai].name} (${Math.max(0, Math.ceil((cl.until - e.minutes) / 1440))} дн.)` : ''}<br>${bl ? `<span class="hint">${bl}</span>` : `<button data-buy="${si}" ${e.money < pr ? 'disabled' : ''}>Выкупить</button> <button data-look="${si}">Показать</button>`}</div>`; }).join('') || '<div class="hint">Нет свободных соседних участков — город растёт уплотнением.</div>'}
        <h4>Соседи</h4><table>${e.cities.filter(c => !e.owned(c)).map(c => `<tr><td>${c.name} <span class="hint">(ИИ, ${CITY_KINDS[g.world.cities[c.id].kind]})</span></td><td>${fmtNum(c.pop)} жит.</td></tr>`).join('')}${g.world.nbrs.map(n => `<tr><td>${n.name} <span class="hint">(соседний регион, ИИ)</span></td><td>шоссе на границе</td></tr>`).join('')}</table>
        <div class="hint">Режим: одиночная игра — соседние регионы и города ведёт ИИ. Мультиплеер: архитектура команд готова (см. PROGRESS.md), сервер ещё не реализован.</div>`;
      R.querySelectorAll('button[data-buy]').forEach(b => (b as HTMLElement).onclick = () => { g.exec({ a: 'buySub', i: +(b as HTMLElement).dataset.buy! }); this.renderPanel(true); });
      R.querySelectorAll('button[data-look],div[data-sub]').forEach(b => (b as HTMLElement).onclick = () => { const si = +((b as HTMLElement).dataset.look ?? (b as HTMLElement).dataset.sub)!; const c = S.center(si); g.r.ctl.jump(c.x, c.z, S.size * 0.9); if (g.r.overlay !== 'territory') this.setOverlay('territory'); });
    } else if (UI.extraPanels.has(p)) { UI.extraPanels.get(p)!.render(R, g, force);
    } else if (p === 'settings') {
      R.innerHTML = `<h3>⚙ Настройки</h3><h4>Качество графики</h4><div style="display:flex;gap:6px">${QUALITIES.map((q, i) => `<button data-q="${i}" class="${g.r.q === q ? 'on' : ''}">${q.name}</button>`).join('')}</div>
        <div class="hint">Влияет на тени, разрешение, дальность прорисовки и лимит машин-агентов (${g.traffic.cap}).</div>
        <h4>Время суток</h4><label><input type="checkbox" id="auto" ${g.autoTime ? 'checked' : ''}> смена дня и ночи</label><br><input type="range" min="0" max="24" step="0.5" value="${g.fixedHour}" id="hour" style="width:100%">
        <h4>Отладка</h4><div class="hint" id="dbg"></div>`;
      R.querySelectorAll('button[data-q]').forEach(b => (b as HTMLElement).onclick = () => { g.setQuality(+(b as HTMLElement).dataset.q!); this.renderPanel(true); });
      (R.querySelector('#auto') as HTMLInputElement).onchange = ev => g.autoTime = (ev.target as HTMLInputElement).checked;
      (R.querySelector('#hour') as HTMLInputElement).oninput = ev => { g.fixedHour = +(ev.target as HTMLInputElement).value; g.autoTime = false; (R.querySelector('#auto') as HTMLInputElement).checked = false; };
      (R.querySelector('#dbg') as HTMLElement).textContent = `Карта ${SIZES[g.world.sizeIdx].name} ${(g.world.M / 1000).toFixed(1)} км, seed ${g.world.seed}. Узлов дорог ${g.world.net.nodes.length}, сегментов ${g.world.net.edges.length}. Чанков ${g.r.chunks.size}, треугольников ${fmtNum(g.r.stats.tris)}, вызовов ${g.r.stats.calls}.`;
    } else if (p === 'save') {
      const slots = [1, 2, 3].map(i => { const m = localStorage.getItem('citysim_meta_' + i); return { i, m: m ? JSON.parse(m) : null }; });
      R.innerHTML = `<h3>💾 Сохранения</h3><div class="hint">Сохраняется seed мира + журнал действий игрока + сжатый снимок состояния (localStorage). F5 — быстрое сохранение в слот 1.</div>` + slots.map(s => `<div class="panel" style="padding:8px;margin:6px 0"><b>Слот ${s.i}</b> <span class="hint">${s.m ? `${s.m.name} · день ${s.m.day} · ${fmtNum(s.m.pop)} жит. · ${new Date(s.m.t).toLocaleString('ru')}` : 'пусто'}</span><br>
        <button data-s="${s.i}">Сохранить</button> <button data-ld="${s.i}" ${s.m ? '' : 'disabled'}>Загрузить</button></div>`).join('') + `<button id="newgame">🆕 Новая игра (меню)</button>`;
      R.querySelectorAll('button[data-s]').forEach(b => (b as HTMLElement).onclick = () => this.save(+(b as HTMLElement).dataset.s!));
      R.querySelectorAll('button[data-ld]').forEach(b => (b as HTMLElement).onclick = () => { location.search = '?load=' + (b as HTMLElement).dataset.ld; });
      (R.querySelector('#newgame') as HTMLElement).onclick = () => { location.search = ''; };
    } else if (p === 'help') {
      R.innerHTML = `<h3>❔ Как играть</h3><div style="line-height:1.6">
      <b>Камера:</b> ПКМ — вращение, Shift+ЛКМ / СКМ (или ЛКМ в режиме «Выбор») — перемещение, колесо — зум к курсору, WASD/стрелки — сдвиг, Q/E — поворот, R/F — наклон, +/− — зум. Клик по мини-карте — перелёт.<br>
      <b>Инструменты:</b> 1–8 (см. слева), Tab — подтип, Esc — отмена, Пробел — пауза, F5 — быстрое сохранение.<br>
      <b>Цель:</b> развивайте регион. Города растут сами без ограничений, но <i>темп</i> зависит от спроса на жильё, работу и товары, транспортной доступности, цены земли, пробок, дефицита и налогов (см. «Города»).<br>
      <b>Транспорт:</b> машины едут по графу дорог (иерархический A*), соблюдают дистанцию и светофоры; пробки возникают от реальной загрузки. Вблизи — отдельные машины, вдали — агрегированные потоки. Стройте проспекты, развязки, автобусы, трамваи, метро и поезда (поезд между городами возит и грузы).<br>
      <b>Экономика:</b> добыча → переработка → производство → торговля, цены от спроса и предложения, межгородская торговля и мировой рынок через порты и внешние трассы, бюджет, налоги, кредиты.<br>
      <b>Карты:</b> выпадающий список сверху — загрузка дорог, стоимость земли, загрязнение, покрытие транспортом, ресурсы, зоны.</div>`;
    }
  }
  loanSize() { return [100e3, 300e3, 1e6, 3e6, 10e6][this.g.world.sizeIdx]; }
  drawCharts() {
    const H = this.g.eco.histH as any;
    this.right.querySelectorAll('canvas.chart').forEach(cv => {
      const c = (cv as HTMLCanvasElement).getContext('2d')!; const k = (cv as HTMLElement).dataset.k!; const W = 680, Hh = 240; c.clearRect(0, 0, W, Hh);
      const series: [number[], string][] = k === 'income' ? [[H.income, '#6d6'], [H.expense, '#e66']] : [[H[k], '#5af']];
      let mn = Infinity, mx = -Infinity; for (const [s] of series) for (const v of s) { mn = Math.min(mn, v); mx = Math.max(mx, v); } if (!isFinite(mn)) return; if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
      c.strokeStyle = 'rgba(255,255,255,.1)'; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(0, i * Hh / 4); c.lineTo(W, i * Hh / 4); c.stroke(); }
      for (const [s, col] of series) { c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); s.forEach((v, i) => { const x = i / 239 * W, y = Hh - 10 - (v - mn) / (mx - mn) * (Hh - 20); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); }
      c.fillStyle = '#ccd'; c.font = '22px sans-serif'; c.fillText(k === 'money' || k === 'income' ? fmtMoney(mx) : fmtNum(mx), 6, 24); c.fillText(k === 'money' || k === 'income' ? fmtMoney(mn) : fmtNum(mn), 6, Hh - 6);
    });
  }
  async save(slot: number) {
    try { const s = await this.g.snapshot(); const str = JSON.stringify(s); localStorage.setItem('citysim_save_' + slot, str);
      localStorage.setItem('citysim_meta_' + slot, JSON.stringify({ name: this.g.world.cities[0].name, day: this.g.eco.day, pop: this.g.eco.cities.reduce((a, c) => a + c.pop, 0), t: Date.now() }));
      this.toast(`Сохранено в слот ${slot} (${(str.length / 1024).toFixed(0)} КБ)`, 'good'); if (this.panel === 'save') this.renderPanel(true);
    } catch (err: any) { this.toast('Ошибка сохранения: ' + err.message + ' (возможно, мир слишком большой для localStorage)', 'bad'); }
  }
  quickSave() { this.save(1); }
  showLine(_id: number) { if (this.panel !== 'transport') this.open('transport'); }
  inspect(p: THREE.Vector3) {
    const g = this.g, w = g.world; const i = Math.floor(p.x / TILE), j = Math.floor(p.z / TILE); if (i < 0 || j < 0 || i >= w.N || j >= w.N) return; const k = j * w.N + i;
    const ci = w.cityOf[k] ? w.cityOf[k] - 1 : w.nearestCity(p.x, p.z, 1.5); const city = ci >= 0 ? g.eco.cities[ci] : null;
    const ne = w.net.nearestEdge(p.x, p.z, 10);
    const zn = ['нет', 'жилая', 'коммерческая', 'промышленная'][w.zone[k]]; const st = ['', ' (трущобы)', ' (панельный спальный район)', ' (исторический центр)'][w.style[k]];
    let html = `<b>Участок ${i},${j}</b> ${city ? '· ' + city.name : ''}<table>
      <tr><td>Высота</td><td>${w.tileH(i, j).toFixed(1)} м</td></tr><tr><td>Ресурс</td><td>${RES_NAMES[w.resource[k]]}</td></tr><tr><td>Зона</td><td>${zn}</td></tr>
      <tr><td>Здание</td><td>${w.bld[k] ? KIND_NAMES[w.kind[k]] + st + ', ур. ' + w.bld[k] : '—'}</td></tr>
      ${w.kind[k] === K.RES ? `<tr><td>Жителей</td><td>≈${Math.round(w.bld[k] * 10 * (city?.occ ?? 1))}</td></tr>` : ''}
      <tr><td>Стоимость земли</td><td>${w.tileLV(k).toFixed(2)}</td></tr><tr><td>Загрязнение</td><td>${w.coarse(w.pollution, p.x, p.z).toFixed(2)}</td></tr><tr><td>Доступ ОТ</td><td>${(w.coarse(w.transitCov, p.x, p.z) * 100).toFixed(0)}%</td></tr>`;
    if (ne) { const E = w.net.edges[ne.e]; html += `<tr><td>Дорога</td><td>${ROAD_TYPES[E.type].name}, ${E.len.toFixed(0)} м</td></tr><tr><td>Загрузка</td><td>${(g.traffic.edgeLoad(ne.e) * 100).toFixed(0)}%</td></tr>`; }
    html += '</table><button id="closeinfo">Закрыть</button>';
    this.info.innerHTML = html; this.info.style.display = 'block'; (this.info.querySelector('#closeinfo') as HTMLElement).onclick = () => this.info.style.display = 'none';
  }
}
function bar(v: number, col: string) { return `<span style="display:inline-block;width:70px;height:8px;background:#223;border-radius:4px;vertical-align:middle"><span style="display:block;height:100%;width:${clamp(v, 0, 1) * 100}%;background:${col};border-radius:4px"></span></span>`; }
function demBar(v: number, col: string) { const hh = Math.abs(v) * 30 + 2; return `<div style="height:${hh}px;background:${v < 0 ? '#844' : col}" title="${(v * 100).toFixed(0)}%"></div>`; }
void Z;
