import { placeSignals, signalState, SIGNAL_STATE_COLOR, type Approach } from '../design/traffic-signals';
import { SIGNAL } from '../design/palette';
import { SIGNAL_LAMPS } from '../design/models/props';
import * as THREE from 'three';
import { World } from './world/World';
import { Renderer, QUALITIES } from './render/Renderer';
import { Traffic } from './sim/Traffic';
import { Transit, LINE_TYPES } from './sim/Transit';
import { Economy } from './sim/Economy';
import { Tools } from './tools';
import { Cmd, extraHandlers } from './commands';
import { BALANCE } from './sim/balance';
import { Subregions } from './world/Subregions';
import { UI } from './ui';
import { TILE } from './world/consts';
import { RoadNet } from './world/RoadNet';

export const SPEEDS = [0, 1, 3, 8, 20];
export class Game {
  r: Renderer; traffic: Traffic; transit: Transit; eco: Economy; tools: Tools; ui: UI;
  speed = 1; acc = 0; ecoAcc = 0; last = performance.now(); fps = 60; frameN = 0;
  actions: any[] = []; origHeights: Float32Array; autoTime = true; fixedHour = 13; lineVer = -1; tt = 0; t0 = performance.now();
  constructor(public world: World, snapshot?: any) {
    world.sub = new Subregions(world);
    this.origHeights = world.heights.slice();
    if (snapshot) this.applySnapshotWorld(snapshot);
    if (snapshot?.arch) world.arch = snapshot.arch; if (snapshot?.quarters) world.quarters = new Map(snapshot.quarters);
    this.r = new Renderer(world, document.getElementById('c') as HTMLCanvasElement);
    this.traffic = new Traffic(world); this.transit = new Transit(world, this.traffic);
    { const net = world.net; if (!net.nodes.some(n => n.alive && n.ctl)) { let k = 0; for (let i = 0; i < net.nodes.length; i++) if (net.nodes[i].alive && this.traffic.nodeMode(i) === 1) { net.nodes[i].ctl = 1; k++; } if (k) net.version++; } } // QA5 п.1: базовые светофоры записаны в узел (ctl=1), инструмент меняет режим
    this.eco = new Economy(world, this.traffic, this.transit);
    this.r.edgeLoad = e => this.traffic.edgeLoad(e);
    this.tools = new Tools(this);
    this.ui = new UI(this);
    this.eco.notes = (t, l) => this.ui.toast(t, l);
    const q = +(localStorage.getItem('citysim_quality') ?? 1); this.setQuality(q);
    if (snapshot) this.applySnapshotSim(snapshot);
    this.ui.toast(`Добро пожаловать! Регион: ${world.cities.length} городов. Столица — ${world.cities[0].name}.`, 'good');
    requestAnimationFrame(() => this.loop());
  }
  setQuality(i: number) { const q = QUALITIES[i]; this.r.setQuality(q); this.traffic.cap = q.agentCap; localStorage.setItem('citysim_quality', '' + i); }
  /** Единая точка применения команд игрока (см. src/commands.ts). replay=true — без записи в журнал (повтор/сеть). */
  exec(cmd: Cmd, replay = false): boolean {
    const T = this.tools, V = (x: number, z: number) => new THREE.Vector3(x, this.world.hAt(x, z), z); const p: any = (cmd as any).p; const save = T.sub, saveLv = T.lv, saveM = T.mods; let ok: any = true;
    try {
      switch (cmd.a) {
        case 'road': T.sub = cmd.t; T.lv = (cmd as any).lv || 0; T.mods = (cmd as any).m || 0; ok = T.buildRoad(V(p[0], p[1]), V(p[2], p[3]), false); break;
        case 'curve': T.sub = cmd.t; T.lv = (cmd as any).lv || 0; T.mods = (cmd as any).m || 0; T.buildCurve(V(p[0], p[1]), V(p[2], p[3]), V(p[4], p[5]), false); break;
        case 'zone': T.sub = cmd.t; if (cmd.th !== undefined) T.zoneTh = cmd.th; T.applyZone(V(p[0], p[1]), V(p[2], p[3]), false); break;
        case 'rail': T.lv = (cmd as any).lv || 0; ok = T.buildRail(V(p[0], p[1]), V(p[2], p[3]), cmd.t, false); break;
        case 'bull': T.bulldoze(V(p[0], p[1]), false); break;
        case 'ctl': ok = T.applyCtl(p[0], p[1], cmd.t); break; // C: режим узла
        case 'oneway': ok = T.applyOneWay(p[0], p[1], (cmd as any).d); break; // C: одностороннее
        case 'terra': this.world.terraform(p[0], p[1], 60, cmd.t, cmd.h, cmd.s); break;
        case 'place': T.place(V(p[0], p[1]), cmd.t, false); break;
        case 'line': { const st: { x: number; z: number }[] = []; for (let i = 0; i < p.length; i += 2) st.push({ x: p[i], z: p[i + 1] }); ok = !!this.transit.build(cmd.t, st); break; }
        case 'lineVeh': { const l = this.transit.lines.find(l => l.id === cmd.id); if (l) l.n = Math.max(1, l.n + cmd.d); break; }
        case 'lineAuto': { const l = this.transit.lines.find(l => l.id === cmd.id); if (l) l.autoVehicles = !!cmd.on; break; }
        case 'lineFare': { const l = this.transit.lines.find(l => l.id === cmd.id); if (l) l.fare = Math.max(0, l.fare + cmd.d); break; }
        case 'lineDel': { const ln = this.transit.lines.find(l => l.id === cmd.id); const R = (this as any).routes; if (ln && ln.route != null && R && !replay) { const rt = R.book.routes.find((r: any) => r.id === ln.route); if (rt && !['closed', 'rejected', 'expired', 'withdrawn'].includes(rt.status)) R.cmd({ c: 'close', by: 0, id: rt.id }); } this.transit.remove(cmd.id); break; }
        case 'tax': (this.eco.tax as any)[cmd.k] = cmd.v; break;
        case 'loan': { const o = BALANCE.loans.offers[cmd.i]; this.eco.takeLoan(o.amount, o.annualRate); break; }
        case 'repay': ok = this.eco.repayLoan(); break;
        case 'buySub': { const err = this.eco.buySub(cmd.i); ok = !err; if (err) this.ui.toast('Выкуп невозможен: ' + err, 'bad'); else { this.ui.toast('Подрегион выкуплен! Можно зонировать и строить.', 'good'); this.r.refreshAll(); } break; }
        default: { const h = extraHandlers.get(cmd.a); ok = h ? h(this, cmd, replay) !== false : false; }
      }
    } finally { T.sub = save; T.lv = saveLv; T.mods = saveM; }
    if (ok && !replay && !['road', 'curve', 'zone', 'bull', 'place', 'line', 'rail'].includes(cmd.a)) this.log({ ...cmd });
    return !!ok;
  }
  last0 = performance.now();
  log(a: any) { a.m = Math.round(this.eco.minutes); this.actions.push(a); }
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(); this.last0 = this.last; const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.fps = this.fps * 0.95 + 0.05 / Math.max(dt, 1e-3);
    this.r.ctl.update(dt); const P = ((window as any).prof ||= {}); let tp = performance.now(); const mark = (k: string) => { const t = performance.now(); P[k] = (P[k] || 0) * 0.95 + (t - tp) * 0.05; tp = t; };
    // fixed-timestep simulation
    const sp = SPEEDS[this.speed];
    if (sp > 0) {
      this.acc += Math.min(0.5, (now - this.last0) / 1000) * sp; /* QA2 п.3: симуляция не теряет время на медленных кадрах (раньше dt резался до 0.1 с → машины «ползли» при 2–5 FPS) */ const STEP = 0.5; let n = 0; const t0 = performance.now();
      while (this.acc >= STEP && n < 40) { this.traffic.camX = this.r.ctl.tx; this.traffic.camZ = this.r.ctl.tz; this.traffic.step(STEP); this.acc -= STEP; n++; if (performance.now() - t0 > 25) { this.acc = Math.min(this.acc, 2); break; } }
      this.ecoAcc += Math.min(0.5, (now - this.last0) / 1000) * sp * 5; // game minutes (1x: 5 game minutes per real second = BALANCE: 1 мин / 200 мс)
      while (this.ecoAcc >= 10) { this.ecoAcc -= 10; this.eco.tick(10 / 60); this.world.gameYear = this.eco.minutes / 1440 / 365; try { (this as any).routes?.frame(); } catch (e) { console.error('routes.frame', e); } }
    }
    mark('sim'); this.tt += dt * sp;
    this.processSpawns();
    this.tools.frame(dt);
    const hour = this.autoTime ? ((this.eco.minutes + this.ecoAcc) / 60) % 24 : this.fixedHour;
    this.r.setTimeOfDay(hour);
    mark('misc'); if (this.frameN++ % 2 === 0) this.r.updateChunks(); mark('chunks');
    this.drawVehicles(); mark('veh');
    if (this.transit.version !== this.lineVer) { this.lineVer = this.transit.version; this.buildLineMeshes(); }
    { const rv = this.world.railVer + ':' + this.transit.version + ':' + this.world.net.version; if (rv !== this.r.rail.ver && this.frameN % 10 === 0) { this.r.rail.ver = rv; this.r.rail.build(this.transit.lines); /* QA6: деревья у новых остановок */ const w = this.world; const sp = this.transit.lines.flatMap(l => l.type >= 1 ? l.stops.map(s => ({ x: s.x, z: s.z })) : []); if (sp.length !== w.stopPts.length) { w.stopPts = sp; for (const p of sp) w.markBld(Math.floor(p.x / TILE), Math.floor(p.z / TILE)); (w as any).bldVer = ((w as any).bldVer || 0) + 1; } } } /* этап D: пути и станции Дезигнера */
    if (this.r.overlay === 'traffic' && this.frameN % 90 === 0) this.r.refreshRoads();
    this.r.render(); mark('render');
    this.ui.frame(); mark('ui');
  }
  processSpawns() {
    const q = this.eco.spawnQueue; const w = this.world; const N = w.N; let budget = 25; const t0 = performance.now();
    while (q.length && budget-- > 0 && performance.now() - t0 < 6) {
      const [a, b, type, city] = q.shift()!;
      const na = w.net.findNode((a % N + 0.5) * TILE, ((a / N | 0) + 0.5) * TILE, 300), nb = w.net.findNode((b % N + 0.5) * TILE, ((b / N | 0) + 0.5) * TILE, 300);
      if (na >= 0 && nb >= 0 && na !== nb) this.traffic.spawn(na, nb, type, city);
    }
    if (q.length > 600) q.splice(0, q.length - 600);
  }
  dummy = new THREE.Object3D(); col = new THREE.Color();
  drawVehicles() {
    const r = this.r, w = this.world; const m = r.vehMeshes; const cnt = [0, 0, 0, 0, 0, 0]; const d = this.dummy;
    const R = Math.min(3000, r.ctl.dist * 2.5 + 300);
    if (r.ctl.dist < 6000) this.traffic.forEachVisible(r.ctl.tx, r.ctl.tz, R, (v, x, z, yaw, dy) => {
      const mi = v.type ? 1 : 0; const M = m[mi]; const i = cnt[mi]; if (i >= M.instanceMatrix.count) return;
      d.position.set(x, w.roadY(x, z) + dy, z); d.rotation.set(0, yaw, 0); d.scale.set(1, 1, 1); d.updateMatrix(); M.setMatrixAt(i, d.matrix); M.setColorAt(i, this.col.setHex(v.color)); cnt[mi]++;
    }, this.acc); // этап A: позиция экстраполируется на накопленное время до следующего тика
    const tt = this.tt;
    this.transit.forEachVehicle(tt, (ln, x, z, yaw, dy) => {
      const mi = LINE_TYPES[ln.type].veh; const M = m[mi]; const i = cnt[mi]; if (i >= M.instanceMatrix.count) return;
      const y = ln.track ? (ln.type >= 2 ? Math.max(w.hAt(x, z), 0) : w.roadY(x, z)) + (dy || 0) + (ln.type >= 2 ? 0.5 : 0) /* этап D: по путям, dy — эстакада/тоннель */ : ln.type === 2 ? Math.max(w.hAt(x, z), 0) + 9 : ln.type === 3 ? Math.max(w.hAt(x, z), 1.5) + 0.8 : w.roadY(x, z);
      d.position.set(x, y, z); d.rotation.set(0, yaw, 0); d.updateMatrix(); M.setMatrixAt(i, d.matrix); M.setColorAt(i, this.col.setHex(ln.color)); cnt[mi]++;
    });
    m.forEach((M, i) => { M.count = cnt[i]; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true; });
    // traffic lights near camera
    const L = r.lightMesh; let n = 0;
    const P = r.signalPoles; let np = 0;
    const sigLod = BALANCE.render.signalLodDist, kd = SIGNAL.lodDist / sigLod; if (r.ctl.dist < sigLod) { // QA5 п.1: светофоры видны с игровой дистанции // светофоры: модели дизайнера (столб + линза), FIX_VISUALS §1
      const net = w.net; const cx = r.ctl.tx, cz = r.ctl.tz; const RR = Math.max(320, r.ctl.dist * 0.9); const tt = performance.now() / 1000;
      for (let a = Math.floor((cx - RR) / 64); a <= Math.floor((cx + RR) / 64); a++) for (let b = Math.floor((cz - RR) / 64); b <= Math.floor((cz + RR) / 64); b++) {
        const cell = net.nodeGrid.get(a * 131072 + b); if (!cell) continue;
        for (const id of cell) { const N0 = net.nodes[id]; if (!N0.alive || N0.edges.length < 3 || this.traffic.nodeMode(id) !== 1) continue; // C: светофор только в режиме «светофор»
          const app: Approach[] = []; for (const e of N0.edges) { const E = net.edges[e]; const oi = E.a === id ? E.b : E.a; const o = net.nodes[oi]; if (!E.alive || !o.alive) continue; app.push({ e, dx: (o.x - N0.x) / E.len, dz: (o.z - N0.z) / E.len, type: E.type, len: E.len, alive: true }); }
          const cd = Math.hypot(N0.x - r.cam.position.x, N0.z - r.cam.position.z);
          for (const sp of placeSignals(N0.x, N0.z, app, Math.min(cd, r.ctl.dist) * kd)) { if (np >= 1200) break;
            const y = w.roadY(sp.x, sp.z); d.position.set(sp.x, y, sp.z); d.rotation.set(0, sp.rot, 0); d.scale.setScalar(sp.scale * BALANCE.render.signalScale); d.updateMatrix(); P.setMatrixAt(np, d.matrix);
            const st = signalState(sp.group, id, tt, this.traffic.green(id, sp.e)); const lp = SIGNAL_LAMPS[st]; const sk = sp.scale * BALANCE.render.signalScale;
            d.position.set(sp.x + (Math.sin(sp.rot) * lp[2] + Math.cos(sp.rot) * lp[0]) * sk, y + lp[1] * sk, sp.z + (Math.cos(sp.rot) * lp[2] - Math.sin(sp.rot) * lp[0]) * sk); d.scale.setScalar(sk * BALANCE.render.signalLampK * Math.min(BALANCE.render.signalFarBoostMax, 1 + Math.max(0, r.ctl.dist - 150) / 150)); /* QA5 п.1: линзы крупнее издали */ d.updateMatrix(); L.setMatrixAt(np, d.matrix); L.setColorAt(np, this.col.setHex(SIGNAL_STATE_COLOR[st])); np++; n++; }
        }
      }
      d.scale.set(1, 1, 1);
    }
    P.count = np; P.instanceMatrix.needsUpdate = true;
    L.count = n; L.instanceMatrix.needsUpdate = true; if (L.instanceColor) L.instanceColor.needsUpdate = true;
  }
  buildLineMeshes() {
    const grp = this.r.lineGroup; while (grp.children.length) { const o = grp.children.pop() as THREE.Mesh; o.geometry?.dispose(); }
    const w = this.world;
    for (const ln of this.transit.lines) {
      if (ln.track) continue; /* этап D: линия по путям — пути и станции рисует RailView */
      const T = ln.type; const pos: number[] = []; const idx: number[] = []; const P = ln.pts; const n = P.length / 2;
      const width = [1.6, 2.6, 5, 6][T]; const yOff = (x: number, z: number) => T === 2 ? Math.max(w.hAt(x, z), 0) + 8.6 : T === 3 ? Math.max(w.hAt(x, z), 1.5) + 0.5 : w.roadY(x, z) + 0.15;
      const half = T >= 2 ? Math.ceil(n / 2) : n; // pendulum lines: draw only forward half for rails
      for (let i = 0; i + 1 < half; i++) {
        const ax = P[i * 2], az = P[i * 2 + 1], bx = P[i * 2 + 2], bz = P[i * 2 + 3]; const L = Math.hypot(bx - ax, bz - az); if (L < 0.1) continue;
        const steps = Math.max(1, Math.ceil(L / 20)); const px = -(bz - az) / L * width / 2, pz = (bx - ax) / L * width / 2;
        for (let s = 0; s < steps; s++) { const t0 = s / steps, t1 = (s + 1) / steps; const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1; const b = pos.length / 3;
          pos.push(x0 + px, yOff(x0, z0), z0 + pz, x0 - px, yOff(x0, z0), z0 - pz, x1 + px, yOff(x1, z1), z1 + pz, x1 - px, yOff(x1, z1), z1 - pz); idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
          if (T === 2 && (s + i) % 3 === 0) { const pl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.5), this.r.plainMat); const h0 = Math.max(w.hAt(x0, z0), -3); pl.scale.y = 8.6 - h0 + Math.max(w.hAt(x0, z0), 0); pl.geometry.translate(0, 0.5, 0); pl.position.set(x0, h0, z0); grp.add(pl); }
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: T === 3 ? 0x6a5a4a : T === 2 ? 0x9aa0a8 : ln.color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 })); grp.add(mesh);
      if (T !== 0) for (const s of ln.stops) { const st = new THREE.Mesh(new THREE.CylinderGeometry(T >= 2 ? 7 : 3, T >= 2 ? 7 : 3, T === 2 ? 10 : 4, 8), new THREE.MeshLambertMaterial({ color: ln.color })); st.position.set(s.x, Math.max(w.hAt(s.x, s.z), 0) + (T === 2 ? 5 : 2), s.z); grp.add(st); }
    }
  }
  // ---------- save / load ----------
  async snapshot() {
    const w = this.world; const N = w.N;
    const diffIdx: number[] = [], diffH: number[] = []; for (let i = 0; i < w.heights.length; i++) if (Math.abs(w.heights[i] - this.origHeights[i]) > 0.01) { diffIdx.push(i); diffH.push(w.heights[i]); }
    const tiles = new Uint8Array(N * N * 6); tiles.set(w.zone, 0); tiles.set(w.kind, N * N); tiles.set(new Uint8Array(w.bld.buffer.slice(0)), N * N * 2); tiles.set(w.style, N * N * 4); tiles.set(w.cityOf, N * N * 5);
    const r = w.net.serialize();
    const roadsBuf = packArrays([r.nx, r.nz, r.nc, r.nf, r.ea, r.eb, r.et, r.ec, r.el, r.em]); /* этап C: + уровни и модули рёбер */
    const rr = w.rail.serialize(); const railBuf = rr.ea.length ? packArrays([rr.nx, rr.nz, rr.nc, rr.nf, rr.ea, rr.eb, rr.et, rr.ec, rr.el, rr.em]) : null;
    const zt: number[] = []; for (let i = 0; i < w.zoneTheme.length; i++) if (w.zoneTheme[i]) zt.push(i, w.zoneTheme[i]);
    return { v: 1, zt, arch: w.arch, quarters: [...w.quarters], rail: railBuf ? await gz(railBuf) : undefined, seed: w.seed, size: w.sizeIdx, neighbors: w.nbrs.length, routes: (this as any).routes?.serialize(), actions: this.actions.slice(-5000), tiles: await gz(tiles), roads: await gz(roadsBuf), hIdx: diffIdx, hVal: diffH, eco: this.eco.serialize(), lines: this.transit.serialize(), cam: [this.r.ctl.gx, this.r.ctl.gz, this.r.ctl.gdist] };
  }
  applySnapshotWorld(s: any) {
    const w = this.world; const N = w.N;
    s.hIdx.forEach((i: number, k: number) => { w.heights[i] = s.hVal[k]; });
    const t: Uint8Array = s._tiles; w.zone.set(t.subarray(0, N * N)); w.kind.set(t.subarray(N * N, N * N * 2)); w.bld.set(new Uint16Array(t.slice(N * N * 2, N * N * 4).buffer)); w.style.set(t.subarray(N * N * 4, N * N * 5)); w.cityOf.set(t.subarray(N * N * 5, N * N * 6));
    const a = unpackArrays(s._roads, [Float32Array, Float32Array, Int16Array, Uint8Array, Int32Array, Int32Array, Uint8Array, Int16Array, Int8Array, Uint8Array]);
    w.net = RoadNet.deserialize({ nx: a[0], nz: a[1], nc: a[2], nf: a[3], ea: a[4], eb: a[5], et: a[6], ec: a[7], el: a[8], em: a[9] });
    if (s._rail) { const b = unpackArrays(s._rail, [Float32Array, Float32Array, Int16Array, Uint8Array, Int32Array, Int32Array, Uint8Array, Int16Array, Int8Array, Uint8Array]); w.rail = RoadNet.deserialize({ nx: b[0], nz: b[1], nc: b[2], nf: b[3], ea: b[4], eb: b[5], et: b[6], ec: b[7], el: b[8], em: b[9] }); w.hookRail(); w.railLift.clear(); }
    w.liftCache.clear(); w.net.onEdgeAdded = e => w.edgeChanged(e, true); w.net.onEdgeRemoved = e => w.edgeChanged(e, false);
    w.road.fill(0); for (const e of w.net.edges) if (e.alive && (e.lv || 0) >= 0) { const A = w.net.nodes[e.a], B = w.net.nodes[e.b]; markRoad(w, A.x, A.z, B.x, B.z, e.type); }
    if (s.zt) for (let i = 0; i < s.zt.length; i += 2) w.zoneTheme[s.zt[i]] = s.zt[i + 1];
    this.actions = s.actions || [];
  }
  applySnapshotSim(s: any) {
    this.eco.load(s.eco);
    for (const l of s.lines) { const ln = this.transit.build(l.type, l.stops.map((p: number[]) => ({ x: p[0], z: p[1] }))); if (ln) { ln.n = l.n; ln.fare = l.fare; ln.name = l.name; ln.autoVehicles = !!l.auto; } }
    if (s.cam) this.r.ctl.jump(s.cam[0], s.cam[1], s.cam[2]);
  }
}
import { markRoadTiles } from './world/consts';
import { ROAD_TYPES } from './world/RoadNet';
function markRoad(w: World, ax: number, az: number, bx: number, bz: number, t: number) { markRoadTiles(w.N, w.road, ax, az, bx, bz, t, ROAD_TYPES[t].w); }
function packArrays(arrs: ArrayBufferView[]) { const total = arrs.reduce((s, a) => s + 4 + a.byteLength, 0); const out = new Uint8Array(total); const dv = new DataView(out.buffer); let o = 0; for (const a of arrs) { dv.setUint32(o, a.byteLength, true); o += 4; out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), o); o += a.byteLength; } return out; }
function unpackArrays(buf: Uint8Array, types: any[]) { const dv = new DataView(buf.buffer, buf.byteOffset); let o = 0; return types.map(T => { if (o + 4 > buf.byteLength) return undefined; /* старые сохранения без новых массивов */ const n = dv.getUint32(o, true); o += 4; const a = new T(buf.slice(o, o + n).buffer); o += n; return a; }); }
export async function gz(data: Uint8Array): Promise<string> {
  const cs = new Blob([data as any]).stream().pipeThrough(new CompressionStream('gzip')); const buf = new Uint8Array(await new Response(cs).arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000) as any); return btoa(s);
}
export async function ungz(b64: string): Promise<Uint8Array> {
  const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const ds = new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(ds).arrayBuffer());
}
