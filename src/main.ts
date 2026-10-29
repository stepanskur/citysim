import './style.css';
import { World } from './world/World';
import { Game, ungz } from './game';
import { attachRoutes } from './routes';
import { attachEngage } from './engage';
import { SIZES } from './world/consts';
import GenWorker from './gen/gen.worker.ts?worker';
const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui')!;
function start(seed: number, size: number, snap?: any, neighbors = +(params.get('nb') ?? 2)) {
  ui.innerHTML = `<div id="loading"><div style="font:800 32px var(--font)">City<span style="color:var(--accent)">Sim</span></div><div>Генерация мира…</div><div class="bar"><div id="lb" style="width:0"></div></div><div id="lt" class="hint"></div></div>`;
  const w = new GenWorker();
  let stepN = 0;
  w.onmessage = ev => {
    if (ev.data.progress) { const pr = ev.data.progress; const t = Array.isArray(pr) ? pr[0] : pr; const f = Array.isArray(pr) ? pr[1] : Math.min(0.95, (++stepN) / 9); (document.getElementById('lt') as HTMLElement).textContent = t; (document.getElementById('lb') as HTMLElement).style.width = (f * 100) + '%'; return; }
    const world = new World(ev.data.world); const g = new Game(world, snap);
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
  if (ld) { const raw = localStorage.getItem('citysim_save_' + ld); if (raw) { const s = JSON.parse(raw); s._tiles = await ungz(s.tiles); s._roads = await ungz(s.roads); return start(s.seed, s.size, s); } }
  if (params.get('seed')) return start(+params.get('seed')!, +(params.get('size') ?? 2));
  let sel = 2, nb = 2, mode = 0;
  document.body.classList.add('cs-root');
  ui.innerHTML = `<div id="menu"><div class="wrap"><div class="logo">City<span>Sim</span></div><div class="subt">Регион, города, экономика и транспорт. Стройте дороги, линии и покупайте соседние подрегионы.</div>
    <div class="panel" style="padding:20px"><div style="font-weight:600;font-size:var(--fs-lg)">Новая игра</div>
    <div class="row">Размер подрегиона / карты</div><div class="sizes">${SIZES.map((s, i) => `<button data-i="${i}" class="${i === sel ? 'on' : ''}"><b>${s.name}</b><small>${(s.map / 1000).toFixed(1)} км · ${s.others + 1} гор.</small></button>`).join('')}</div>
    <div class="row">Соседние регионы (ИИ)</div><div class="seg" id="nb">${[1, 2, 3, 4].map(n => `<button data-n="${n}" class="${n === nb ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="row">Seed</div><div style="display:flex;gap:6px"><input id="seed" style="flex:1;font-family:var(--mono)" value="${Math.floor(Math.random() * 1e6)}"><button id="rnd">🎲</button></div>
    <div class="row">Режим</div><div class="seg" id="mode"><button data-m="0" class="on">Одиночная (соседи — ИИ)</button><button data-m="1" disabled title="Скоро">Мультиплеер · скоро</button></div>
    <div style="display:flex;gap:8px;margin-top:20px"><button id="go" class="primary" style="flex:1;justify-content:center">Создать мир</button></div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${[1, 2, 3].map(i => { const m = localStorage.getItem('citysim_meta_' + i); if (!m) return ''; const j = JSON.parse(m); return `<button data-l="${i}">Загрузить слот ${i}: ${j.name}, день ${j.day}</button>`; }).join('')}</div></div></div></div>`;
  ui.querySelectorAll('.sizes button').forEach(b => (b as HTMLElement).onclick = () => { sel = +(b as HTMLElement).dataset.i!; ui.querySelectorAll('.sizes button').forEach(x => x.classList.toggle('on', x === b)); });
  ui.querySelectorAll('#nb button').forEach(b => (b as HTMLElement).onclick = () => { nb = +(b as HTMLElement).dataset.n!; ui.querySelectorAll('#nb button').forEach(x => x.classList.toggle('on', x === b)); });
  void mode;
  (document.getElementById('rnd') as HTMLElement).onclick = () => (document.getElementById('seed') as HTMLInputElement).value = '' + Math.floor(Math.random() * 1e6);
  (document.getElementById('go') as HTMLElement).onclick = () => start(+(document.getElementById('seed') as HTMLInputElement).value || 1, sel, undefined, nb);
  ui.querySelectorAll('button[data-l]').forEach(b => (b as HTMLElement).onclick = () => location.search = '?load=' + (b as HTMLElement).dataset.l);
}
boot();
