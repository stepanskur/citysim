import './style.css';
import { World } from './world/World';
import { Game, ungz } from './game';
import { attachRoutes } from './routes';
import { attachEngage } from './engage';
import { SIZES } from './world/consts';
import { ARCH_OPTIONS } from './render/Themes';
import GenWorker from './gen/gen.worker.ts?worker';
const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
function start(seed: number, size: number, snap?: any, neighbors = +(params.get('nb') ?? 2), arch = snap?.arch ?? params.get('arch') ?? 'mixed') {
  ui.innerHTML = `<div id="loading"><div style="font:800 32px var(--font)">City<span style="color:var(--accent)">Sim</span></div><div>Генерация мира…</div><div class="bar"><div id="lb" style="width:0"></div></div><div id="lt" class="hint"></div></div>`;
  const w = new GenWorker();
  let stepN = 0;
  w.onmessage = ev => {
    if (ev.data.progress) { const pr = ev.data.progress; const t = Array.isArray(pr) ? pr[0] : pr; const f = Array.isArray(pr) ? pr[1] : Math.min(0.95, (++stepN) / 9); (document.getElementById('lt') as HTMLElement).textContent = t; (document.getElementById('lb') as HTMLElement).style.width = (f * 100) + '%'; return; }
    const world = new World(ev.data.world); world.arch = arch; const g = new Game(world, snap);
    (window as any).game = g; (window as any).ready = true;
    attachRoutes(g); if (snap?.routes) try { (g as any).routes.load(snap.routes); } catch (e) { console.warn('routes load', e); }
    try { attachEngage(g, snap); } catch (e) { console.error('engage', e); }
    (window as any).debugInfo = () => ({ cities: g.eco.cities.map(c => [c.name, Math.round(c.pop)]), agents: g.traffic.active, money: Math.round(g.eco.money), fps: Math.round(g.fps), lines: g.transit.lines.length, q: g.eco.spawnQueue.length, min: g.eco.minutes, st: g.traffic.stats, scale: g.traffic.scale });
    w.terminate();
  };
  w.postMessage({ seed, sizeIdx: size, neighbors: snap?.neighbors ?? neighbors });
}
async function boot() {
  const ld = params.get('load');
  if (ld) { const raw = localStorage.getItem('citysim_save_' + ld); if (raw) { const s = JSON.parse(raw); s._tiles = await ungz(s.tiles); s._roads = await ungz(s.roads); if (s.rail) s._rail = await ungz(s.rail); /* этап D */ return start(s.seed, s.size, s); } }
  if (params.get('seed')) return start(+params.get('seed')!, +(params.get('size') ?? 2));
  let sel = 2, nb = 2, mode = 0, arch = 'mixed';
  document.body.classList.add('cs-root');
  const ic = (id: string) => `<svg class="cs-ico"><use href="#i-${id}"/></svg>`;
  const sizeIc = (i: number) => `<svg viewBox="0 0 34 22" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="${15 - i * 3}" y="${9 - i * 2}" width="${4 + i * 6}" height="${4 + i * 4}" rx="2"/></svg>`;
  // UI_AUDIT п.6: меню по design/menu-prototype.html
  ui.innerHTML = `<div id="menu"><div class="bg"></div>
    <div class="foot"><span>v2 «Пастила»</span><span>Одиночная игра · соседи — ИИ</span></div>
    <div class="wrap"><div class="eyebrow">${ic('sparkle')} Регион · экономика · транспорт</div><div class="logo">City<span>Sim</span></div><div class="subt">Стройте дороги и линии, развивайте города и выкупайте соседние подрегионы.</div>
    <div class="cs-glass card"><div class="lab"><span>Размер подрегиона / карты</span><span id="szinfo"></span></div><div class="sizes">${SIZES.map((s, i) => `<button class="size" data-i="${i}" aria-pressed="${i === sel}">${sizeIc(i)}<b>${s.name}</b><small>${(s.map / 1000).toFixed(1)} км · ${s.others + 1} гор.</small></button>`).join('')}</div>
    <div class="lab"><span>Архитектура</span></div><div class="cs-seg" id="arch">${ARCH_OPTIONS.map(o => `<button data-a="${o.id}" aria-pressed="${o.id === arch}" title="${o.hint}">${o.name}</button>`).join('')}</div><div class="hint" id="archhint" style="font-size:12px;color:var(--text-dim)">${ARCH_OPTIONS[0].hint}</div>
    <div class="lab"><span>Соседние регионы (ИИ)</span></div><div class="cs-seg" id="nb">${[1, 2, 3, 4].map(n => `<button data-n="${n}" aria-pressed="${n === nb}">${n}</button>`).join('')}</div>
    <div class="lab"><span>Seed</span></div><div class="seedrow"><input id="seed" class="cs-input" value="${Math.floor(Math.random() * 1e6)}"><button id="rnd" class="cs-btn cs-btn--icon" style="width:40px;height:40px" title="Случайный">${ic('dice')}</button></div>
    <div class="lab"><span>Режим</span></div><div class="cs-seg" id="mode"><button data-m="0" aria-pressed="true">Одиночная</button><button data-m="1" disabled title="Скоро">Мультиплеер · скоро</button></div>
    <div class="actions"><button id="go" class="cs-btn cs-btn--primary cs-btn--lg">${ic('play')} Создать мир</button></div>
    <div class="loads">${[1, 2, 3].map(i => { const m = localStorage.getItem('citysim_meta_' + i); if (!m) return ''; const j = JSON.parse(m); return `<button class="cs-btn" data-l="${i}">Загрузить слот ${i}: ${j.name}, день ${j.day}</button>`; }).join('')}</div></div></div>
    <div class="cs-glass preview"><div class="map"></div><div class="meta"><span>Пример плана региона</span><span>генератор v2</span></div></div></div>`;
  ui.querySelectorAll('.sizes button').forEach(b => (b as HTMLElement).onclick = () => { sel = +(b as HTMLElement).dataset.i!; ui.querySelectorAll('.sizes button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  ui.querySelectorAll('#nb button').forEach(b => (b as HTMLElement).onclick = () => { nb = +(b as HTMLElement).dataset.n!; ui.querySelectorAll('#nb button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  ui.querySelectorAll('#arch button').forEach(b => (b as HTMLElement).onclick = () => { arch = (b as HTMLElement).dataset.a!; ui.querySelectorAll('#arch button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); (document.getElementById('archhint') as HTMLElement).textContent = ARCH_OPTIONS.find(o => o.id === arch)!.hint; });
  void mode;
  (document.getElementById('rnd') as HTMLElement).onclick = () => (document.getElementById('seed') as HTMLInputElement).value = '' + Math.floor(Math.random() * 1e6);
  (document.getElementById('go') as HTMLElement).onclick = () => start(+(document.getElementById('seed') as HTMLInputElement).value || 1, sel, undefined, nb, arch);
  ui.querySelectorAll('button[data-l]').forEach(b => (b as HTMLElement).onclick = () => location.search = '?load=' + (b as HTMLElement).dataset.l);
}
boot();
