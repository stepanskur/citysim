import { spacingWarnings, cycleTimeMin } from './sim/LineLoad';
import * as THREE from 'three';
import type { Game } from './game';
import { TILE, K, Z } from './world/consts';
import { ROAD_TYPES, MOD, levelName, RoadNet } from './world/RoadNet';
import { BALANCE } from './sim/balance';
import { RAIL, RAIL_TYPES } from './world/World';
import { tessellateBeziers } from '../design/road-curves';
import { LINE_TYPES } from './sim/Transit';
import { fmtMoney } from './util';

export const PLACEABLES = [
  { kind: K.WAREHOUSE, name: 'Грузовой склад', cost: 45000, hint: '+500 ед./день грузовой пропускной способности' },
  { kind: K.PARK, name: 'Парк', cost: 8000, hint: 'повышает стоимость земли вокруг' },
  { kind: K.STATION, name: 'Ж/Д терминал', cost: 70000, hint: '+1500 ед./день грузопотока' },
  { kind: K.PORT, name: 'Порт', cost: 250000, hint: 'у воды: импорт/экспорт с мировым рынком' },
];
export type ToolId = 'select' | 'road' | 'curve' | 'zone' | 'bulldoze' | 'terrain' | 'place' | 'line' | 'rail' | 'traffic';

export class Tools {
  tool: ToolId = 'select'; sub = 0;
  pts: THREE.Vector3[] = []; cursor: THREE.Vector3 | null = null; dragStart: THREE.Vector3 | null = null; down = false; levelH = 0;
  /** этап C: уровень прокладки (−1 тоннель, 0 земля, 1 эстакада) и модули (MOD.TRAM | MOD.BUS) */ lv = 0; mods = 0;
  preview: THREE.Object3D[] = [];
  constructor(public g: Game) {
    const cv = g.r.canvas;
    cv.addEventListener('pointerdown', e => this.onDown(e));
    cv.addEventListener('pointermove', e => { this.cursor = g.r.pickScreen(e.clientX, e.clientY); });
    window.addEventListener('pointerup', e => this.onUp(e));
    cv.addEventListener('dblclick', () => { if (this.tool === 'line') this.finishLine(); });
    window.addEventListener('keydown', e => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'Escape') this.cancel();
      if (e.key === 'Enter' && this.tool === 'line') this.finishLine();
      if (this.tool === 'road' || this.tool === 'curve' || this.tool === 'rail') { const k = e.key; // B3: L — по кругу, PageUp/+ и PageDown/− — шаг уровня (18 §2)
        if (k === 'l' || k === 'L' || k === 'д' || k === 'Д') { const [lo, hi] = this.lvRange(); this.lv = this.lv >= hi ? lo : this.lv + 1; this.g.ui.refreshTools(); }
        else if (k === 'PageUp' || k === '+' || k === '=') { this.stepLv(1); e.preventDefault?.(); }
        else if (k === 'PageDown' || k === '-' || k === '_') { this.stepLv(-1); e.preventDefault?.(); } }
    });
  }
  set(t: ToolId, sub = 0) { const prevT = this.tool, prevS = this.sub; this.tool = t; this.sub = sub; this.cancel(); if (prevT !== t || prevS !== sub) this.lv = t === 'rail' && sub === RAIL.METRO ? -1 : 0; /* QA2 п.6: уровень (мост/тоннель) сбрасывается при смене инструмента; метро — тоннель по умолчанию */
    this.g.r.setMetroView?.(t === 'rail' && sub === RAIL.METRO || (t === 'line' && sub === 2) || this.g.r.metroManual); /* mechanics/14 §4: режим метро включается инструментом метро */ this.g.r.ctl.panLeft = t === 'select'; this.g.ui.refreshTools(); }
  cancel() { this.pts = []; this.dragStart = null; this.down = false; }
  onDown(e: PointerEvent) {
    if (e.button === 2) { if (this.pts.length || this.dragStart) { this.cancel(); } return; }
    (document.activeElement as HTMLElement | null)?.blur?.(); // QA2: Enter после кликов по карте не «нажимает» последнюю кнопку UI (была смена инструмента вместо завершения линии)
    if (e.button !== 0 || e.shiftKey) return;
    const p = this.g.r.pickScreen(e.clientX, e.clientY); if (!p) return;
    const g = this.g;
    switch (this.tool) {
      case 'select': this.g.ui.inspect(p); break;
      case 'road': {
        const sp = this.snap(p);
        if (!this.pts.length) this.pts = [sp];
        else { if (this.buildRoad(this.pts[0], sp)) this.pts = [sp]; }
        break;
      }
      case 'rail': {
        const sp = this.snapRail(p);
        if (!this.pts.length) this.pts = [sp];
        else { if (this.buildRail(this.pts[0], sp, this.sub)) this.pts = [sp]; }
        break;
      }
      case 'curve': {
        const sp = this.snap(p); this.pts.push(sp);
        if (this.pts.length === 3) { this.buildCurve(this.pts[0], this.pts[1], this.pts[2]); this.pts = []; }
        break;
      }
      case 'zone': this.dragStart = p; this.down = true; break;
      case 'bulldoze': this.bulldoze(p); this.down = true; break;
      case 'terrain': if (!this.own(p)) break; this.down = true; this.levelH = g.world.hAt(p.x, p.z); break;
      case 'place': this.place(p); break;
      case 'line': this.pts.push(p.clone()); break;
      case 'traffic': this.trafficClick(p); break;
    }
  }
  onUp(_e: PointerEvent) {
    if (this.tool === 'zone' && this.dragStart && this.cursor) this.applyZone(this.dragStart, this.cursor);
    this.dragStart = null; this.down = false;
  }
  snap(p: THREE.Vector3) {
    const net = this.g.world.net; const n = net.nearestNode(p.x, p.z, BALANCE.construction.snapNode); if (n >= 0) return new THREE.Vector3(net.nodes[n].x, p.y, net.nodes[n].z);
    const pe = this.snapOnEdge(net, p, -1); if (pe) return pe; // B5 (18): к любой точке ребра — узел создаст splitEdge
    const n2 = net.nearestNode(p.x, p.z, 18); if (n2 >= 0) return new THREE.Vector3(net.nodes[n2].x, p.y, net.nodes[n2].z);
    if (this.pts.length && this.g.r.ctl.keys.has('ControlLeft')) { const a = this.pts[this.pts.length - 1]; const ang = Math.atan2(p.z - a.z, p.x - a.x); const sa = Math.round(ang / (Math.PI / 12)) * Math.PI / 12; const L = Math.hypot(p.x - a.x, p.z - a.z); return new THREE.Vector3(a.x + Math.cos(sa) * L, p.y, a.z + Math.sin(sa) * L); }
    return p.clone();
  }
  /** стоимость: база × множитель уровня (BALANCE.roads bridgeBase и tunnelBase, mechanics/11 §5) + модули (BALANCE.roads.modules) */
  roadCost(a: THREE.Vector3, b: THREE.Vector3, type: number, lv = this.lv, mods = this.mods) {
    const RB = BALANCE.roads; const L = Math.hypot(b.x - a.x, b.z - a.z); let water = 0; const n = Math.ceil(L / 10); for (let s = 0; s <= n; s++) if (this.g.world.hAt(a.x + (b.x - a.x) * s / n, a.z + (b.z - a.z) * s / n) < 0.5) water++;
    const lvMul = lv > 0 ? RB.bridgeBase + RB.bridgePerM * 7 * lv : lv < 0 ? RB.tunnelBase + RB.tunnelPerM * 10 * -lv : 1 + 3 * water / (n + 1);
    const modC = (mods & MOD.TRAM ? RB.modules.tramShared.costPerM : 0) + (mods & MOD.BUS ? RB.modules.bus.costPerM * 2 : 0);
    return L * (ROAD_TYPES[type].cost * lvMul + modC);
  }
  /** B6 (18 §1): здания под будущей трассой и компенсация за снос = levelValue[уровень] × площадь участка × compensationMult[зона] */
  demoList(a: THREE.Vector3, b: THREE.Vector3, w: number, lv: number, rail = false): { k: number; cost: number }[] {
    if (lv < 0) return []; const W = this.g.world; const C = BALANCE.construction; const out: { k: number; cost: number }[] = []; const ZM = [C.compensationMult.O, C.compensationMult.R, C.compensationMult.C, C.compensationMult.I];
    W.forTilesAlong(a.x, a.z, b.x, b.z, w, k => { if (!W.bld[k] || W.kind[k] === K.PORT || (rail && W.kind[k] === K.STATION) || out.some(o => o.k === k)) return; out.push({ k, cost: C.levelValue[Math.min(5, W.bld[k])] * TILE * TILE * (ZM[W.zone[k]] ?? 1) }); });
    return out;
  }
  demoCost(l: { cost: number }[]) { let s = 0; for (const o of l) s += o.cost; return Math.round(s); }
  /** B3 (18 §3): рельеф под дорогой в уровне земли — насыпь/выемка к линейному профилю между концами, не глубже embankmentMax */
  gradeUnder(a: THREE.Vector3, b: THREE.Vector3, w: number) {
    const W = this.g.world; const L = Math.hypot(b.x - a.x, b.z - a.z); const ha = W.hAt(a.x, a.z), hb = W.hAt(b.x, b.z); if (ha < 0.5 || hb < 0.5) return;
    const n = Math.ceil(L / 8); const M = BALANCE.construction.gradeMaxDh;
    for (let s = 0; s <= n; s++) { const t = s / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; const h = W.hAt(x, z); if (h < 0.5) continue;
      const tgt = ha + (hb - ha) * t; if (Math.abs(h - tgt) < 0.3) continue; W.terraform(x, z, w / 2 + 4, 2, h + Math.max(-M, Math.min(M, tgt - h)), 0.9); }
  }
  buildRoad(a: THREE.Vector3, b: THREE.Vector3, record = true): boolean {
    const g = this.g; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 8) return false;
    if (!this.own(a) || !this.own(b)) return false;
    const cost = this.roadCost(a, b, this.sub) + this.demoCost(this.demoList(a, b, ROAD_TYPES[this.sub].w, this.lv)); if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return false; }
    const segs = Math.ceil(L / 200); let ok = 0;
    for (let s = 0; s < segs; s++) { const t0 = s / segs, t1 = (s + 1) / segs; ok += g.world.net.addRoad(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1, this.sub, 12, -1, this.lv, this.mods).length; }
    if (ok) { g.eco.spend(cost); if (this.lv === 0) this.gradeUnder(a, b, ROAD_TYPES[this.sub].w); if (record) g.log({ a: 'road', p: [a.x, a.z, b.x, b.z], t: this.sub, ...this.lvm() }); }
    return ok > 0;
  }
  /** B5: проекция на ближайшее ребро в пределах snapEdge + полуширина (type ≥ 0 — только этот тип; концы ребра не трогаем) */
  snapOnEdge(net: RoadNet, p: THREE.Vector3, type: number): THREE.Vector3 | null {
    const ne = net.nearestEdge(p.x, p.z, 14); if (!ne || ne.t < 0.03 || ne.t > 0.97) return null; const E = net.edges[ne.e]; if (type >= 0 && E.type !== type) return null;
    const hw = net === this.g.world.net ? ROAD_TYPES[E.type].w / 2 : 2; if (ne.d > BALANCE.construction.snapEdge + hw) return null;
    const A = net.nodes[E.a], B = net.nodes[E.b]; return new THREE.Vector3(A.x + (B.x - A.x) * ne.t, p.y, A.z + (B.z - A.z) * ne.t);
  }
  /** этап D: привязка пути — к узлам рельсовой сети того же типа, для трамвая — ещё к дорожным узлам с трамвайным модулем */
  snapRail(p: THREE.Vector3) {
    const w = this.g.world; let best: THREE.Vector3 | null = null, bd = 18;
    for (const e of w.rail.edgesNear(p.x, p.z, 20)) { const E = w.rail.edges[e]; if (!E.alive || E.type !== this.sub) continue; for (const n of [E.a, E.b]) { const N = w.rail.nodes[n]; const d = Math.hypot(N.x - p.x, N.z - p.z); if (d < bd) { bd = d; best = new THREE.Vector3(N.x, p.y, N.z); } } }
    if (!best || bd > BALANCE.construction.snapNode) { const pe = this.snapOnEdge(w.rail, p, this.sub); if (pe) return pe; } // B5
    if (!best && this.sub === RAIL.TRAM) { const n = w.net.nearestNode(p.x, p.z, 18); if (n >= 0 && w.net.nodes[n].edges.some(e => (w.net.edges[e].m || 0) & MOD.TRAM)) best = new THREE.Vector3(w.net.nodes[n].x, p.y, w.net.nodes[n].z); }
    if (!best && this.pts.length && this.g.r.ctl.keys.has('ControlLeft')) return this.snap(p);
    return best || p.clone();
  }
  railLv(t = this.sub) { return t === RAIL.METRO ? (this.lv > 0 ? 1 : Math.min(-1, this.lv)) : this.lv; }
  /** B3: допустимый диапазон уровней для текущего инструмента (07 construction.levelRange) */
  lvRange(): [number, number] { const R = BALANCE.construction.levelRange; return this.tool === 'rail' ? (this.sub === RAIL.METRO ? [R.metro[0], 1] : this.sub === RAIL.TRAM ? R.tram : R.rail) : R.road; }
  stepLv(d: number) { const [lo, hi] = this.lvRange(); this.lv = Math.max(lo, Math.min(hi, this.lv + d)); this.g.ui.refreshTools(); }
  /** путь: стоимость = kmCost системы (mechanics/14 §1: трамвай 35, ж/д 110, метро 260 ₽/м); эстакада/тоннель для наземных систем — множители BALANCE.roads; эстакадное метро ×0.6 */
  railCost(a: THREE.Vector3, b: THREE.Vector3, t = this.sub) {
    const RB = BALANCE.roads; const L = Math.hypot(b.x - a.x, b.z - a.z); const lv = this.railLv(t); const base = LINE_TYPES[[3, 1, 2][t]].kmCost / 1000;
    const mul = t === RAIL.METRO ? (lv > 0 ? 0.6 : 1) : lv > 0 ? RB.bridgeBase + RB.bridgePerM * 7 : lv < 0 ? RB.tunnelBase + RB.tunnelPerM * 10 : 1;
    return L * base * mul;
  }
  buildRail(a: THREE.Vector3, b: THREE.Vector3, t = this.sub, record = true): boolean {
    const g = this.g; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 8) return false;
    if (!this.own(a) || !this.own(b)) return false;
    const cost = this.railCost(a, b, t) + this.demoCost(this.demoList(a, b, 7, this.railLv(t), true)); if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return false; }
    const lv = this.railLv(t); const segs = Math.ceil(L / 200); let ok = 0;
    for (let s = 0; s < segs; s++) { const t0 = s / segs, t1 = (s + 1) / segs; ok += g.world.rail.addRoad(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1, t, 12, -1, lv, 0).length; }
    if (ok) { g.eco.spend(cost); if (record) g.log({ a: 'rail', p: [a.x, a.z, b.x, b.z], t, ...(lv ? { lv } : {}) }); }
    return ok > 0;
  }
  /** необязательные поля команды (этап C), чтобы старые команды не менялись */
  lvm(): { lv?: number; m?: number } { const o: any = {}; if (this.lv) o.lv = this.lv; if (this.mods) o.m = this.mods; return o; }
  /** минимальный радиус класса дороги по mechanics/11 §3 (BALANCE.roads.classes); проспект — 160 м */
  minRadius(type = this.sub) { const C = BALANCE.roads.classes; return [C.street.minRadius, 160, C.highway.minRadius, C.lane.minRadius][type]; }
  buildCurve(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, record = true): boolean {
    const g = this.g; if (!this.own(a) || !this.own(b) || !this.own(c)) return false; const cv = this.curve(a, c, b); const pts = cv.pts;
    if (cv.rMin < this.minRadius() * BALANCE.roads.minRadiusSoftShare) { if (record) g.ui.toast(`Слишком крутая кривая: R ${cv.rMin.toFixed(0)} м, минимум ${(this.minRadius() * BALANCE.roads.minRadiusSoftShare).toFixed(0)} м для «${ROAD_TYPES[this.sub].name}»`, 'bad'); return false; }
    let cost = 0; for (let i = 1; i < pts.length; i++) cost += this.roadCost(pts[i - 1], pts[i], this.sub);
    if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return false; }
    for (let i = 1; i < pts.length; i++) g.world.net.addRoad(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, this.sub, i === 1 || i === pts.length - 1 ? 12 : 3, -1, this.lv, this.mods);
    if (record && cv.rMin < this.minRadius()) g.ui.toast(`Радиус ${cv.rMin.toFixed(0)} м меньше нормы ${this.minRadius()} м: скорость на кривой снижена до ${(cv.vMax * 3.6).toFixed(0)} км/ч`, 'warn');
    g.eco.spend(cost); if (record) g.log({ a: 'curve', p: [a.x, a.z, c.x, c.z, b.x, b.z], t: this.sub, ...this.lvm() });
    return true;
  }
  /** Кривая через road-curves (Дезигнер): квадратичная Безье → кубическая → tessellateBeziers; радиус по дискретной кривизне;
   *  разбиение на рёбра графа: n = ceil(L / sqrt(8·R·chordError)), длина ребра в [segMinLen, 60] (mechanics/11 §3). */
  curve(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3) {
    const k = 2 / 3; const fine = tessellateBeziers([[{ x: a.x, z: a.z }, { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k }, { x: b.x + (c.x - b.x) * k, z: b.z + (c.z - b.z) * k }, { x: b.x, z: b.z }]]);
    let rMin = Infinity; for (let i = 1; i < fine.length - 1; i++) { const p = fine[i - 1], q = fine[i], r = fine[i + 1]; const A = Math.hypot(q.x - p.x, q.z - p.z), B = Math.hypot(r.x - q.x, r.z - q.z), C = Math.hypot(r.x - p.x, r.z - p.z); const cr = Math.abs((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x)); if (cr > 1e-6) rMin = Math.min(rMin, A * B * C / (2 * cr)); }
    const S = [0]; for (let i = 1; i < fine.length; i++) S.push(S[i - 1] + Math.hypot(fine[i].x - fine[i - 1].x, fine[i].z - fine[i - 1].z)); const L = S[S.length - 1];
    const RB = BALANCE.roads; const segL = Math.max(RB.segMinLen, Math.min(60, Math.sqrt(8 * Math.min(rMin, 1e6) * RB.chordError))); const n = Math.max(2, Math.ceil(L / segL));
    const pts: THREE.Vector3[] = []; let j = 0; for (let i = 0; i <= n; i++) { const s = L * i / n; while (j < S.length - 2 && S[j + 1] < s) j++; const u = (s - S[j]) / Math.max(1e-6, S[j + 1] - S[j]); pts.push(new THREE.Vector3(fine[j].x + (fine[j + 1].x - fine[j].x) * u, 0, fine[j].z + (fine[j + 1].z - fine[j].z) * u)); }
    const vMax = Math.sqrt(rMin * 9.81 * 0.2); // v = sqrt(R·g·(e+f)), e+f ≈ 0.2
    return { pts, rMin, vMax, fine };
  }
  bezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3) { return this.curve(a, c, b).pts; }
  /** F1: тема кисти зонирования (индекс в ZONE_THEME_UI.order; по умолчанию — Позднее СНГ) */
  zoneTh = 0;
  applyZone(a: THREE.Vector3, b: THREE.Vector3, record = true) {
    const w = this.g.world; const i0 = Math.floor(Math.min(a.x, b.x) / TILE), i1 = Math.floor(Math.max(a.x, b.x) / TILE), j0 = Math.floor(Math.min(a.z, b.z) / TILE), j1 = Math.floor(Math.max(a.z, b.z) / TILE);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) { this.g.ui.toast('Слишком большая область', 'bad'); return; }
    let n = 0; for (let j = Math.max(0, j0); j <= Math.min(w.N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w.N - 1, i1); i++) { if (!w.canBuild((i + 0.5) * TILE, (j + 0.5) * TILE)) continue; if (this.sub && !w.roadAccess(i, j)) continue; const ch = w.setZone(i, j, this.sub); if (this.sub) { const k = j * w.N + i; if (w.zone[k] === this.sub && w.setZoneTheme(i, j, this.zoneTh + 1)) { if (!ch) n++; } } if (ch) n++; }
    if (n && record) this.g.log({ a: 'zone', p: [a.x, a.z, b.x, b.z], t: this.sub, th: this.zoneTh });
    this.g.ui.toast(`${this.sub ? 'Зонировано' : 'Снято зонирование'}: ${n} участков`, 'good');
  }
  /** C (17 §1, §5): режим узла (sub 0–3) или одностороннее на ребре (sub 4: нет → по ходу → обратно → нет) */
  trafficClick(p: THREE.Vector3) {
    const g = this.g, net = g.world.net;
    if (this.sub === 4) { const ne = net.nearestEdge(p.x, p.z, 10); if (!ne) return; const E = net.edges[ne.e]; if (E.type === 2) return g.ui.toast('Шоссе уже одностороннее по полосам', 'bad');
      const d = (E.m || 0) & MOD.ONEWAY ? (this.owFlip.has(ne.e) ? 0 : -1) : 1; g.exec({ a: 'oneway', p: [p.x, p.z], d }); return; }
    let best = -1, bd = 16; for (const id of net.nodesNear(p.x, p.z, 16)) { const N = net.nodes[id]; const d = Math.hypot(N.x - p.x, N.z - p.z); if (N.alive && N.edges.length >= 3 && d < bd) { bd = d; best = id; } }
    if (best < 0) return g.ui.toast('Выберите перекрёсток (3+ ветви)', 'bad');
    if (this.sub === 1 && net.nodes[best].edges.some(e => net.edges[e].alive && net.edges[e].type === 2)) return g.ui.toast('На узлах шоссе светофор не ставится', 'bad');
    g.exec({ a: 'ctl', p: [net.nodes[best].x, net.nodes[best].z], t: this.sub });
  }
  owFlip = new Set<number>(); demoMat: THREE.LineBasicMaterial | null = null;
  /** исполнение команд C (вызывается из Game.exec) */
  applyCtl(x: number, z: number, t: number): boolean {
    const g = this.g, net = g.world.net; let best = -1, bd = 3; for (const id of net.nodesNear(x, z, 4)) { const N = net.nodes[id]; const d = Math.hypot(N.x - x, N.z - z); if (N.alive && d < bd) { bd = d; best = id; } }
    if (best < 0) return false; const C = BALANCE.trafficControl.cost; const cost = t === 1 ? C.signal : t === 2 ? C.priority : 0;
    if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return false; }
    g.eco.spend(cost); net.nodes[best].ctl = t || undefined; net.version++; g.ui.toast(['Узел: авто', 'Светофор', 'Приоритет (знаки)', 'Без регулирования'][t] + (cost ? ' · ' + fmtMoney(cost) : ''), 'good'); return true;
  }
  applyOneWay(x: number, z: number, d: number): boolean {
    const g = this.g, net = g.world.net; const ne = net.nearestEdge(x, z, 10); if (!ne) return false; const E = net.edges[ne.e]; const a = E.a, b = E.b, m0 = E.m || 0;
    const id = net.setOneWay(ne.e, d); if (id < 0) return false;
    if (!net.flowOk(a) || !net.flowOk(b)) { // откат
      const E2 = net.edges[id]; if (d < 0) { net.removeEdge(id); net.addEdge(a, b, E2.type, E2.city, E2.lv || 0, m0); } else net.setOneWay(id, m0 & MOD.ONEWAY ? 1 : 0);
      g.ui.toast('Тупик без выезда', 'bad'); return false; }
    this.owFlip.delete(ne.e); if (d < 0) this.owFlip.add(id); g.ui.toast(d ? 'Одностороннее движение' : 'Двустороннее движение', 'good'); return true;
  }
  bulldoze(p: THREE.Vector3, record = true) {
    if (!this.g.world.canBuild(p.x, p.z)) return;
    const w = this.g.world; const i = Math.floor(p.x / TILE), j = Math.floor(p.z / TILE); const k = j * w.N + i;
    if (i >= 0 && j >= 0 && i < w.N && j < w.N && w.bld[k]) { w.setBld(k, 0, 0); if (w.kind[k] === 0 && w.zone[k] === 0) { } this.g.eco.spend(200); if (record) this.g.log({ a: 'bull', p: [p.x, p.z] }); return; }
    const ne = w.net.nearestEdge(p.x, p.z, 10); if (ne) { w.net.removeEdge(ne.e); this.g.eco.spend(100); if (record) this.g.log({ a: 'bull', p: [p.x, p.z] }); return; }
    const nr = w.rail.nearestEdge(p.x, p.z, 8); if (nr) { w.rail.removeEdge(nr.e); this.g.eco.spend(100); if (record) this.g.log({ a: 'bull', p: [p.x, p.z] }); } // этап D: снос пути
  }
  place(p: THREE.Vector3, sub = this.sub, record = true) {
    const g = this.g, w = g.world; const P = PLACEABLES[sub]; const i = Math.floor(p.x / TILE), j = Math.floor(p.z / TILE); const k = j * w.N + i;
    if (!this.own(p)) return; if (w.road[k] || w.tileH(i, j) < 0.5) return g.ui.toast('Здесь нельзя строить', 'bad');
    if (!w.roadAccess(i, j)) return g.ui.toast('Нужен доступ к дороге', 'bad');
    if (P.kind === K.PORT) { let wat = false; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) if (w.tileH(i + a, j + b) < 0) wat = true; if (!wat) return g.ui.toast('Порт нужно строить у воды', 'bad'); }
    if (g.eco.money < P.cost) return g.ui.toast('Недостаточно средств', 'bad');
    w.zone[k] = Z.NONE; w.setBld(k, P.kind, 1); g.eco.spend(P.cost); if (record) g.log({ a: 'place', p: [p.x, p.z], t: sub });
    g.ui.toast(`Построено: ${P.name}`, 'good');
  }
  /** проверка владения подрегионом (08-expansion) */
  own(p: { x: number; z: number }, quiet = false) { const ok = this.g.world.canBuild(p.x, p.z); if (!ok && !quiet) this.g.ui.toast('Это не ваш подрегион: стройте на своей территории или выкупите участок (панель «Регион»)', 'bad'); return ok; }
  finishLine() {
    const g = this.g; if (this.pts.length < 2) { g.ui.toast('Нужно минимум 2 остановки', 'bad'); return; }
    if (!this.pts.every(p => this.own(p, true))) { g.ui.toast('Все остановки должны быть в ваших подрегионах. Межрегиональные маршруты — панель «Маршруты»', 'bad'); return; }
    const stops = this.pts.map(p => ({ x: p.x, z: p.z })); const cost = g.transit.buildCost(this.sub, stops, this.sub >= 1);
    if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return; }
    const ln = g.transit.build(this.sub, stops, true); if (!ln) { g.ui.toast('Не удалось проложить маршрут: ' + (g.transit.lastErr || 'остановки должны быть у связанных дорог'), 'bad'); return; }
    g.eco.spend(cost); g.log({ a: 'line', t: this.sub, p: stops.flatMap(s => [s.x, s.z]) });
    g.ui.toast(`Открыта линия «${ln.name}», длина ${(ln.L / 2000).toFixed(1)} км`, 'good'); this.pts = []; g.ui.showLine(ln.id);
  }
  // preview drawing each frame
  mats = new Map<number, THREE.Material>();
  mat(c: number, op = 0.6) { let m = this.mats.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, depthTest: false }); this.mats.set(c, m); } return m; }
  updatePreview() {
    const grp = this.g.r.toolGroup; for (const o of this.preview) { grp.remove(o); (o as THREE.Mesh).geometry?.dispose(); } this.preview = [];
    const w = this.g.world; const c = this.cursor; if (!c) return;
    const add = (o: THREE.Object3D) => { o.renderOrder = 10; grp.add(o); this.preview.push(o); };
    const seg = (a: THREE.Vector3, b: THREE.Vector3, width: number, col: number, yo = 1) => {
      const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 0.5) return; const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.6, width), this.mat(col));
      m.position.set((a.x + b.x) / 2, Math.max(w.hAt((a.x + b.x) / 2, (a.z + b.z) / 2), 1) + yo, (a.z + b.z) / 2); m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x); add(m);
    };
    const demo = (l: { k: number }[]) => { const W = this.g.world; for (const o of l.slice(0, 200)) { const i = o.k % W.N, j = (o.k / W.N) | 0; const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE, hh = 6 + W.bld[o.k] * 4; // B6: красный контур здания под снос
      const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TILE * 0.9, hh, TILE * 0.9)), (this.demoMat ||= new THREE.LineBasicMaterial({ color: 0xff3030, depthTest: false }))); m.position.set(x, W.hAt(x, z) + hh / 2, z); add(m);
      const f = new THREE.Mesh(new THREE.BoxGeometry(TILE * 0.92, hh + 0.5, TILE * 0.92), this.mat(0xff3030, 0.22)); f.position.copy(m.position); add(f); } };
    const ring = (p: THREE.Vector3, r: number, col: number) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 32), this.mat(col, 0.8)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, Math.max(p.y, 0) + 1.5, p.z); add(m); };
    if (this.tool === 'road') { const sp = this.snap(c); ring(sp, 10, 0x4fc3ff); if (this.pts.length) { const a = this.pts[0]; const cost = this.roadCost(a, sp, this.sub); const dl = this.demoList(a, sp, ROAD_TYPES[this.sub].w, this.lv); const dc = this.demoCost(dl); demo(dl); seg(a, sp, ROAD_TYPES[this.sub].w, this.g.eco.money >= cost + dc ? 0x4fc3ff : 0xff4040); this.g.ui.cursorHint(`${(a.distanceTo(sp)).toFixed(0)} м · ${fmtMoney(cost + dc)} · ${levelName(this.lv)}${dl.length ? ` · снос ${dl.length} зд.: ${fmtMoney(dc)}` : ''}`); } }
    else if (this.tool === 'curve') { const sp = this.snap(c); ring(sp, 10, 0x4fc3ff); const pts = [...this.pts, sp]; if (pts.length === 3) { const cv = this.curve(pts[0], pts[1], pts[2]); const rm = this.minRadius(); this.g.ui.cursorHint(`R мин ${isFinite(cv.rMin) ? cv.rMin.toFixed(0) : '∞'} м · норма ${rm} м${cv.rMin < rm * 0.5 ? ' — нельзя' : cv.rMin < rm ? ' — со снижением скорости' : ''} · ${levelName(this.lv)}`); } if (pts.length === 2) seg(pts[0], pts[1], 2, 0x999999); if (pts.length === 3) { const bz = this.bezier(pts[0], pts[1], pts[2]); for (let i = 1; i < bz.length; i++) seg(bz[i - 1], bz[i], ROAD_TYPES[this.sub].w, 0x4fc3ff); } }
    else if (this.tool === 'rail') { const sp = this.snapRail(c); const col = [0x8a5cd0, 0xe04848, 0x3a8ee0][this.sub]; ring(sp, 10, col); if (this.pts.length) { const a = this.pts[0]; const cost = this.railCost(a, sp); const dl = this.demoList(a, sp, 7, this.railLv(), true); const dc = this.demoCost(dl); demo(dl); seg(a, sp, RAIL_TYPES[this.sub].w, this.g.eco.money >= cost + dc ? col : 0xff4040, this.railLv() < 0 ? 0.5 : this.railLv() > 0 ? 8 : 1); this.g.ui.cursorHint(`${a.distanceTo(sp).toFixed(0)} м · ${fmtMoney(cost + dc)} · ${levelName(this.railLv())}${dl.length ? ` · снос ${dl.length} зд.: ${fmtMoney(dc)}` : ''}`); } }
    else if (this.tool === 'zone' && this.dragStart) {
      const a = this.dragStart; const x0 = Math.floor(Math.min(a.x, c.x) / TILE) * TILE, x1 = (Math.floor(Math.max(a.x, c.x) / TILE) + 1) * TILE, z0 = Math.floor(Math.min(a.z, c.z) / TILE) * TILE, z1 = (Math.floor(Math.max(a.z, c.z) / TILE) + 1) * TILE;
      const col = [0xff5050, 0x50e050, 0x50a0ff, 0xffd040][this.sub]; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 2, z1 - z0), this.mat(col, 0.35)); m.position.set((x0 + x1) / 2, w.hAt((x0 + x1) / 2, (z0 + z1) / 2) + 2, (z0 + z1) / 2); add(m);
      this.g.ui.cursorHint(`${(x1 - x0) / TILE}×${(z1 - z0) / TILE} участков`);
    }
    else if (this.tool === 'zone' || this.tool === 'place' || this.tool === 'select' || this.tool === 'bulldoze') { const i = Math.floor(c.x / TILE), j = Math.floor(c.z / TILE); const m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 1, TILE), this.mat(this.tool === 'bulldoze' ? 0xff3030 : 0xffffff, 0.35)); m.position.set((i + 0.5) * TILE, w.tileH(i, j) + 1, (j + 0.5) * TILE); add(m); if (this.tool === 'place') this.g.ui.cursorHint(`${PLACEABLES[this.sub].name} · ${fmtMoney(PLACEABLES[this.sub].cost)}`); }
    else if (this.tool === 'terrain') ring(c, 60, [0x50ff50, 0xff8050, 0x50c0ff][this.sub]);
    else if (this.tool === 'line') { const T = LINE_TYPES[this.sub]; const pts = [...this.pts, c]; for (const p of pts) ring(p, T.catch * 0.1, T.color); for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 3, T.color, this.sub === 2 ? 9 : 2); if (this.pts.length) { const sw = spacingWarnings(this.sub, pts); const last = sw.find(w => w.i === pts.length - 1); let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        const cyc = cycleTimeMin(L * 2, T.speed, pts.length, this.sub);
        this.g.ui.cursorHint(`${this.pts.length} ост. · ${(L / 1000).toFixed(1)} км · оборот ${cyc.toFixed(0)} мин · ${fmtMoney(this.g.transit.buildCost(this.sub, pts.map(p => ({ x: p.x, z: p.z }))))}${last ? (last.kind === 'slow' ? ` · ⚠ ${Math.round(last.d)} м — слишком часто, линия медленная (мин ${BALANCE.lines.stopSpacingMin[this.sub]} м)` : ` · ⚠ ${Math.round(last.d)} м — пропуск охвата (макс ${BALANCE.lines.stopSpacingMax[this.sub]} м)`) : ''} · Enter/двойной клик — готово`); } }
  }
  frame(dt: number) {
    if (this.tool === 'terrain' && this.down && this.cursor) { const g = this.g; if (g.eco.money < 20) return; g.world.terraform(this.cursor.x, this.cursor.z, 60, this.sub, this.levelH, dt * 2.5); g.eco.spend(dt * 400); this.tAcc = (this.tAcc || 0) + dt; if (this.tAcc > 0.25) { this.tAcc = 0; g.log({ a: 'terra', p: [this.cursor.x, this.cursor.z], t: this.sub, h: this.levelH, s: 0.625 }); } }
    if (this.tool === 'bulldoze' && this.down && this.cursor) this.bulldoze(this.cursor);
    this.updatePreview();
  }
  tAcc = 0;
}
