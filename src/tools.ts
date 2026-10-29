import * as THREE from 'three';
import type { Game } from './game';
import { TILE, K, Z } from './world/consts';
import { ROAD_TYPES } from './world/RoadNet';
import { LINE_TYPES } from './sim/Transit';
import { fmtMoney } from './util';

export const PLACEABLES = [
  { kind: K.WAREHOUSE, name: 'Грузовой склад', cost: 45000, hint: '+500 ед./день грузовой пропускной способности' },
  { kind: K.PARK, name: 'Парк', cost: 8000, hint: 'повышает стоимость земли вокруг' },
  { kind: K.STATION, name: 'Ж/Д терминал', cost: 70000, hint: '+1500 ед./день грузопотока' },
  { kind: K.PORT, name: 'Порт', cost: 250000, hint: 'у воды: импорт/экспорт с мировым рынком' },
];
export type ToolId = 'select' | 'road' | 'curve' | 'zone' | 'bulldoze' | 'terrain' | 'place' | 'line';

export class Tools {
  tool: ToolId = 'select'; sub = 0;
  pts: THREE.Vector3[] = []; cursor: THREE.Vector3 | null = null; dragStart: THREE.Vector3 | null = null; down = false; levelH = 0;
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
    });
  }
  set(t: ToolId, sub = 0) { this.tool = t; this.sub = sub; this.cancel(); this.g.r.ctl.panLeft = t === 'select'; this.g.ui.refreshTools(); }
  cancel() { this.pts = []; this.dragStart = null; this.down = false; }
  onDown(e: PointerEvent) {
    if (e.button === 2) { if (this.pts.length || this.dragStart) { this.cancel(); } return; }
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
    }
  }
  onUp(_e: PointerEvent) {
    if (this.tool === 'zone' && this.dragStart && this.cursor) this.applyZone(this.dragStart, this.cursor);
    this.dragStart = null; this.down = false;
  }
  snap(p: THREE.Vector3) {
    const net = this.g.world.net; const n = net.nearestNode(p.x, p.z, 18); if (n >= 0) return new THREE.Vector3(net.nodes[n].x, p.y, net.nodes[n].z);
    if (this.pts.length && this.g.r.ctl.keys.has('ControlLeft')) { const a = this.pts[this.pts.length - 1]; const ang = Math.atan2(p.z - a.z, p.x - a.x); const sa = Math.round(ang / (Math.PI / 12)) * Math.PI / 12; const L = Math.hypot(p.x - a.x, p.z - a.z); return new THREE.Vector3(a.x + Math.cos(sa) * L, p.y, a.z + Math.sin(sa) * L); }
    return p.clone();
  }
  roadCost(a: THREE.Vector3, b: THREE.Vector3, type: number) {
    const L = Math.hypot(b.x - a.x, b.z - a.z); let water = 0; const n = Math.ceil(L / 10); for (let s = 0; s <= n; s++) if (this.g.world.hAt(a.x + (b.x - a.x) * s / n, a.z + (b.z - a.z) * s / n) < 0.5) water++;
    return L * ROAD_TYPES[type].cost * (1 + 3 * water / (n + 1));
  }
  buildRoad(a: THREE.Vector3, b: THREE.Vector3, record = true): boolean {
    const g = this.g; const L = Math.hypot(b.x - a.x, b.z - a.z); if (L < 8) return false;
    if (!this.own(a) || !this.own(b)) return false;
    const cost = this.roadCost(a, b, this.sub); if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return false; }
    const segs = Math.ceil(L / 200); let ok = 0;
    for (let s = 0; s < segs; s++) { const t0 = s / segs, t1 = (s + 1) / segs; ok += g.world.net.addRoad(a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1, this.sub, 12).length; }
    if (ok) { g.eco.spend(cost); if (record) g.log({ a: 'road', p: [a.x, a.z, b.x, b.z], t: this.sub }); }
    return ok > 0;
  }
  buildCurve(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, record = true) {
    const g = this.g; if (!this.own(a) || !this.own(b) || !this.own(c)) return; const pts = this.bezier(a, c, b); let cost = 0; for (let i = 1; i < pts.length; i++) cost += this.roadCost(pts[i - 1], pts[i], this.sub);
    if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return; }
    for (let i = 1; i < pts.length; i++) g.world.net.addRoad(pts[i - 1].x, pts[i - 1].z, pts[i].x, pts[i].z, this.sub, i === 1 || i === pts.length - 1 ? 12 : 3);
    g.eco.spend(cost); if (record) g.log({ a: 'curve', p: [a.x, a.z, c.x, c.z, b.x, b.z], t: this.sub });
  }
  bezier(a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3) {
    const L = a.distanceTo(c) + c.distanceTo(b); const n = Math.max(3, Math.ceil(L / 40)); const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push(new THREE.Vector3(u * u * a.x + 2 * u * t * c.x + t * t * b.x, 0, u * u * a.z + 2 * u * t * c.z + t * t * b.z)); }
    return out;
  }
  applyZone(a: THREE.Vector3, b: THREE.Vector3, record = true) {
    const w = this.g.world; const i0 = Math.floor(Math.min(a.x, b.x) / TILE), i1 = Math.floor(Math.max(a.x, b.x) / TILE), j0 = Math.floor(Math.min(a.z, b.z) / TILE), j1 = Math.floor(Math.max(a.z, b.z) / TILE);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 40000) { this.g.ui.toast('Слишком большая область', 'bad'); return; }
    let n = 0; for (let j = Math.max(0, j0); j <= Math.min(w.N - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(w.N - 1, i1); i++) { if (!w.canBuild((i + 0.5) * TILE, (j + 0.5) * TILE)) continue; if (this.sub && !w.roadAccess(i, j)) continue; if (w.setZone(i, j, this.sub)) n++; }
    if (n && record) this.g.log({ a: 'zone', p: [a.x, a.z, b.x, b.z], t: this.sub });
    this.g.ui.toast(`${this.sub ? 'Зонировано' : 'Снято зонирование'}: ${n} участков`, 'good');
  }
  bulldoze(p: THREE.Vector3, record = true) {
    if (!this.g.world.canBuild(p.x, p.z)) return;
    const w = this.g.world; const i = Math.floor(p.x / TILE), j = Math.floor(p.z / TILE); const k = j * w.N + i;
    if (i >= 0 && j >= 0 && i < w.N && j < w.N && w.bld[k]) { w.setBld(k, 0, 0); if (w.kind[k] === 0 && w.zone[k] === 0) { } this.g.eco.spend(200); if (record) this.g.log({ a: 'bull', p: [p.x, p.z] }); return; }
    const ne = w.net.nearestEdge(p.x, p.z, 10); if (ne) { w.net.removeEdge(ne.e); this.g.eco.spend(100); if (record) this.g.log({ a: 'bull', p: [p.x, p.z] }); }
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
    const stops = this.pts.map(p => ({ x: p.x, z: p.z })); const cost = g.transit.buildCost(this.sub, stops);
    if (g.eco.money < cost) { g.ui.toast('Недостаточно средств: нужно ' + fmtMoney(cost), 'bad'); return; }
    const ln = g.transit.build(this.sub, stops); if (!ln) { g.ui.toast('Не удалось проложить маршрут (остановки должны быть у связанных дорог)', 'bad'); return; }
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
    const ring = (p: THREE.Vector3, r: number, col: number) => { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 32), this.mat(col, 0.8)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, Math.max(p.y, 0) + 1.5, p.z); add(m); };
    if (this.tool === 'road') { const sp = this.snap(c); ring(sp, 10, 0x4fc3ff); if (this.pts.length) { const a = this.pts[0]; const cost = this.roadCost(a, sp, this.sub); seg(a, sp, ROAD_TYPES[this.sub].w, this.g.eco.money >= cost ? 0x4fc3ff : 0xff4040); this.g.ui.cursorHint(`${(a.distanceTo(sp)).toFixed(0)} м · ${fmtMoney(cost)}`); } }
    else if (this.tool === 'curve') { const sp = this.snap(c); ring(sp, 10, 0x4fc3ff); const pts = [...this.pts, sp]; if (pts.length === 2) seg(pts[0], pts[1], 2, 0x999999); if (pts.length === 3) { const bz = this.bezier(pts[0], pts[1], pts[2]); for (let i = 1; i < bz.length; i++) seg(bz[i - 1], bz[i], ROAD_TYPES[this.sub].w, 0x4fc3ff); } }
    else if (this.tool === 'zone' && this.dragStart) {
      const a = this.dragStart; const x0 = Math.floor(Math.min(a.x, c.x) / TILE) * TILE, x1 = (Math.floor(Math.max(a.x, c.x) / TILE) + 1) * TILE, z0 = Math.floor(Math.min(a.z, c.z) / TILE) * TILE, z1 = (Math.floor(Math.max(a.z, c.z) / TILE) + 1) * TILE;
      const col = [0xff5050, 0x50e050, 0x50a0ff, 0xffd040][this.sub]; const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 2, z1 - z0), this.mat(col, 0.35)); m.position.set((x0 + x1) / 2, w.hAt((x0 + x1) / 2, (z0 + z1) / 2) + 2, (z0 + z1) / 2); add(m);
      this.g.ui.cursorHint(`${(x1 - x0) / TILE}×${(z1 - z0) / TILE} участков`);
    }
    else if (this.tool === 'zone' || this.tool === 'place' || this.tool === 'select' || this.tool === 'bulldoze') { const i = Math.floor(c.x / TILE), j = Math.floor(c.z / TILE); const m = new THREE.Mesh(new THREE.BoxGeometry(TILE, 1, TILE), this.mat(this.tool === 'bulldoze' ? 0xff3030 : 0xffffff, 0.35)); m.position.set((i + 0.5) * TILE, w.tileH(i, j) + 1, (j + 0.5) * TILE); add(m); if (this.tool === 'place') this.g.ui.cursorHint(`${PLACEABLES[this.sub].name} · ${fmtMoney(PLACEABLES[this.sub].cost)}`); }
    else if (this.tool === 'terrain') ring(c, 60, [0x50ff50, 0xff8050, 0x50c0ff][this.sub]);
    else if (this.tool === 'line') { const T = LINE_TYPES[this.sub]; const pts = [...this.pts, c]; for (const p of pts) ring(p, T.catch * 0.1, T.color); for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], 3, T.color, this.sub === 2 ? 9 : 2); if (this.pts.length) this.g.ui.cursorHint(`${this.pts.length} ост. · ${fmtMoney(this.g.transit.buildCost(this.sub, pts.map(p => ({ x: p.x, z: p.z }))))} · Enter/двойной клик — готово`); }
  }
  frame(dt: number) {
    if (this.tool === 'terrain' && this.down && this.cursor) { const g = this.g; if (g.eco.money < 20) return; g.world.terraform(this.cursor.x, this.cursor.z, 60, this.sub, this.levelH, dt * 2.5); g.eco.spend(dt * 400); this.tAcc = (this.tAcc || 0) + dt; if (this.tAcc > 0.25) { this.tAcc = 0; g.log({ a: 'terra', p: [this.cursor.x, this.cursor.z], t: this.sub, h: this.levelH, s: 0.625 }); } }
    if (this.tool === 'bulldoze' && this.down && this.cursor) this.bulldoze(this.cursor);
    this.updatePreview();
  }
  tAcc = 0;
}
