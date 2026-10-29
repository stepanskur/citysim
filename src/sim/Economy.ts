import { World } from '../world/World';
import { Traffic } from './Traffic';
import { Transit, LINE_TYPES } from './Transit';
import { TILE, K, Z, RES } from '../world/consts';
import { ROAD_TYPES } from '../world/RoadNet';
import { BALANCE } from './balance';
import { clamp, mulberry32, hash2, fmtNum, fmtMoney } from '../util';

const GT = BALANCE.goods.types; const GID = ['grain', 'wood', 'ore', 'oil', 'food', 'furniture', 'metal', 'fuel', 'consumer'];
export const GOODS = GID.map(g => GT[g].name);
export const BASE_PRICE = GID.map(g => GT[g].basePrice);
const B = BALANCE, PB = B.population, BG = B.budget;
const GROWTH_MULT = 6; // ускорение относительно 04-growth (0,4%/день), чтобы рост был заметен за минуты игры
const EXT_PER_L = [0, B.goods.extraction.FOREST.perLevelDay, B.goods.extraction.ORE.perLevelDay, B.goods.extraction.FERTILE.perLevelDay, B.goods.extraction.OIL.perLevelDay];
const RES_TO_RAW = [-1, 1, 2, 0, 3]; // resource -> raw commodity
const RES_PER_L = PB.residentsPerResLevel, JOBS = { [K.COM]: PB.jobsPerComLevel, [K.IND]: PB.jobsPerIndLevel, [K.EXTRACT]: PB.jobsPerExtractLevel, [K.WAREHOUSE]: PB.jobsPerWarehouseLevel * 4, [K.PORT]: 300, [K.STATION]: 20 } as Record<number, number>;

export class CityState {
  resL = 0; comL = 0; indL = 0; extL = [0, 0, 0, 0, 0]; ware = 0; port = 0; parks = 0; stations = 0; jobsTotal = 0;
  occ = 0.92; pop = 0; workers = 0; employed = 0; unemp = 0; attract = 0.5; rEff: number;
  dR = 0.3; dC = 0.2; dI = 0.2; pace = 0; paceF = { demand: 0, tax: 1, cong: 1, short: 1, land: 1 };
  stock = new Float64Array(9); price = Float64Array.from(BASE_PRICE); prodDay = new Float64Array(9); consDay = new Float64Array(9);
  short = 0; salesDay = 0; cong = 0; congIdx = 0; lvAvg = 0.8; poll = 0; transitRiders = 0; carShare = 1; tripsDay = 0;
  tradeIn = 0; tradeOut = 0; exportVal = 0; importVal = 0; freightCap = 0; outside = false;
  lists: number[][] = [[], [], [], []]; aiSave = 0; built = 0; expansions = 0;
  hist: { pop: number[] } = { pop: [] };
  constructor(public id: number, public name: string, public x: number, public z: number, r: number, public kind: string) { this.rEff = r; }
}

export class Economy {
  cities: CityState[] = [];
  money = 0; loans: { amount: number; rate: number }[] = []; tax = { R: BG.defaultTax.res * 100, C: BG.defaultTax.com * 100, I: BG.defaultTax.ind * 100 };
  loanTerms: { amount: number; rate: number; months: number }[] = [];
  cityLedger: Record<number, { inc: number; exp: number }> = {}; cityLedgerY: Record<number, { inc: number; exp: number }> = {};
  minutes = 8 * 60; // game time
  popG: Float32Array; jobG: Float32Array; indG: Float32Array; parkG: Float32Array; comG: Float32Array;
  lvCursor = 0; rnd = mulberry32(99);
  today = this.newLedger(); yesterday = this.newLedger();
  histH = { pop: [] as number[], money: [] as number[], cong: [] as number[], riders: [] as number[], unemp: [] as number[], income: [] as number[], expense: [] as number[] };
  worldPrice = Float64Array.from(BASE_PRICE);
  roadUpkeepDay = 0; roadVer = -1;
  spawnQueue: [number, number, number, number][] = []; // srcTile, dstTile, type, city
  notes: (t: string, lvl: string) => void = () => { };
  cool = new Map<string, number>();
  growthTotal = 0; frontier = true;
  constructor(public world: World, public traffic: Traffic, public transit: Transit) {
    const w = world; const G = w.GN * w.GN;
    this.popG = new Float32Array(G); this.jobG = new Float32Array(G); this.indG = new Float32Array(G); this.parkG = new Float32Array(G); this.comG = new Float32Array(G);
    this.money = BG.startMoney[w.sizeIdx];
    for (const c of w.cities) this.cities.push(new CityState(c.id, c.name, c.x, c.z, c.r, c.kind));
    for (const n of w.net.nodes) if (n.outside) { const c = w.nearestCity(n.x, n.z, 99); if (c >= 0) this.cities[c].outside = true; }
    // census
    const N = w.N;
    for (let k = 0; k < N * N; k++) {
      if (w.bld[k]) this.applyBld(k, w.kind[k], w.bld[k], 1);
      if (w.zone[k] && w.cityOf[k]) this.cities[w.cityOf[k] - 1].lists[w.zone[k]].push(k);
    }
    w.bldHook = (k, ok, ol, nk, nl) => { if (ol) this.applyBld(k, ok, ol, -1); if (nl) this.applyBld(k, nk, nl, 1); };
    w.zoneHook = (k, z) => { const c = w.cityOf[k]; if (z && c) this.cities[c - 1].lists[z].push(k); };
    for (const c of this.cities) { c.pop = c.resL * RES_PER_L * c.occ; for (let m = 0; m < 9; m++) c.stock[m] = 50 + c.pop * 0.05; }
    for (let i = 0; i < this.world.GN * this.world.GN; i++) this.lvPass(i);
  }
  newLedger() { return { tR: 0, tC: 0, tI: 0, fares: 0, tariff: 0, roads: 0, transit: 0, services: 0, interest: 0, build: 0 }; }
  cityOfTile(k: number) { const c = this.world.cityOf[k]; if (c) return c - 1; const N = this.world.N; const ci = this.world.nearestCity((k % N + 0.5) * TILE, ((k / N | 0) + 0.5) * TILE, 99); if (ci >= 0) this.world.cityOf[k] = ci + 1; return ci; }
  applyBld(k: number, kind: number, L: number, s: number) {
    const ci = this.cityOfTile(k); if (ci < 0) return; const c = this.cities[ci]; const w = this.world; const N = w.N;
    const g = (((k / N) | 0) / w.GC | 0) * w.GN + ((k % N) / w.GC | 0);
    const jobs = (JOBS[kind] || 0) * (kind === K.COM || kind === K.IND || kind === K.EXTRACT ? L : 1) * s;
    c.jobsTotal += jobs; this.jobG[g] += jobs;
    if (kind === K.RES) { c.resL += L * s; this.popG[g] += L * RES_PER_L * s; }
    else if (kind === K.COM) { c.comL += L * s; this.comG[g] += L * s; }
    else if (kind === K.IND) { c.indL += L * s; this.indG[g] += L * s; }
    else if (kind === K.EXTRACT) { c.extL[w.resource[k] || RES.FERTILE] += L * s; this.indG[g] += L * 0.4 * s; }
    else if (kind === K.WAREHOUSE) c.ware += s; else if (kind === K.PORT) c.port += s; else if (kind === K.PARK) { c.parks += s; this.parkG[g] += s; } else if (kind === K.STATION) c.stations += s;
  }
  get hour() { return (this.minutes / 60) % 24; } get day() { return Math.floor(this.minutes / 1440) + 1; }
  note(key: string, text: string, lvl = 'warn') { if (this.minutes < 3 * 1440) return; /* первые 3 дня — без тревог: город раскачивается */ key = key.replace(/\d+$/, ''); const t = this.cool.get(key) || -1e9; if (this.minutes - t < 60 * 8) return; this.cool.set(key, this.minutes); this.notes(text, lvl); }
  // land value / pollution pass for one coarse cell
  lvPass(g: number) {
    const w = this.world, GN = w.GN, GC = w.GC; const gi = g % GN, gj = (g / GN) | 0; const cs = GC * TILE;
    const x = (gi + 0.5) * cs, z = (gj + 0.5) * cs; const ci = w.nearestCity(x, z, 99); if (ci < 0) return;
    const c = this.cities[ci]; const d = Math.hypot(x - c.x, z - c.z);
    let roads = 0; for (let j = gj * GC; j < Math.min(w.N, gj * GC + GC); j += 2) for (let i = gi * GC; i < Math.min(w.N, gi * GC + GC); i += 2) if (w.road[j * w.N + i]) roads++;
    let park = 0, com = 0, pn = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = gi + a, jj = gj + b; if (ii < 0 || jj < 0 || ii >= GN || jj >= GN) continue; const k = jj * GN + ii; park += this.parkG[k]; com += this.comG[k]; pn += w.pollution[k]; }
    const own = Math.min(2, this.indG[g] * 0.02 + this.traffic.laneW.length * 0); w.pollution[g] = clamp(own * 0.6 + pn / 9 * 0.38, 0, 1.5);
    const scale = 0.5 + Math.log10(c.pop + 10) / 6;
    const prox = Math.exp(-d / (c.rEff * 0.55));
    const water = w.hAt(x, z) > 0 && (w.hAt(x + cs, z) < 0 || w.hAt(x - cs, z) < 0 || w.hAt(x, z + cs) < 0 || w.hAt(x, z - cs) < 0) ? 0.25 : 0;
    w.landValue[g] = clamp(0.2 + 1.3 * prox * scale + 0.5 * Math.min(1, roads / 6) + 0.6 * w.transitCov[g] + 0.35 * Math.min(1, park / 3) + 0.25 * Math.min(1, com / 60) + water - 0.9 * w.pollution[g], 0, 3);
  }
  roadUpkeep() { const net = this.world.net; if (net.version === this.roadVer) return this.roadUpkeepDay; let s = 0; for (const e of net.edges) if (e.alive) { const A = net.nodes[e.a]; if (this.world.canBuild(A.x, A.z)) s += e.len * ROAD_TYPES[e.type].upkeep * BG.roadUpkeepMult / B.time.daysPerMonth; } this.roadVer = net.version; return (this.roadUpkeepDay = s); }
  /** 04-growth: фактор налога −(t−0.10)/(0.30−0.10) → множитель темпа */
  taxF(t: number) { return clamp(1 - (t / 100 - BG.taxNeutral) / (BG.taxMax - BG.taxNeutral), 0, 1.5); }
  damp(p: number) { return Math.pow(B.growth.sizeDampP0 / (B.growth.sizeDampP0 + p), B.growth.sizeDampGamma); }
  owned(c: CityState) { return this.world.sub.ownerAt(c.x, c.z) === 0; }
  playerPop() { return this.cities.reduce((s, c) => s + (this.owned(c) ? c.pop : 0), 0); }
  todFactor(h: number) { const g = (m: number, s: number) => Math.exp(-((h - m) ** 2) / (2 * s * s)); return 0.25 + 2.2 * g(8, 1.3) + 1.9 * g(18, 1.6) + 0.6 * g(13, 2.5); }
  // ---------- main tick (dtH game hours) ----------
  tick(dtH: number) {
    const dtD = dtH / 24; const w = this.world; const L = this.today; const hour = this.hour;
    const prevDay = this.day; this.minutes += dtH * 60;
    // traffic stats -> congestion
    const st = this.traffic.stats;
    for (const c of this.cities) {
      const n = st.cityTrips[c.id]; if (n > 0) { const ratio = st.cityTime[c.id] / Math.max(1, st.cityFree[c.id]); c.congIdx = c.congIdx * 0.7 + clamp(ratio - 1, 0, 4) * 0.3; }
      st.cityTrips[c.id] = 0; st.cityTime[c.id] = 0; st.cityFree[c.id] = 0;
    }
    // transit (daily ridership model)
    const riders = this.transit.update(this.popG, this.jobG, this.cities.map(c => c.jobsTotal), this.cities.map(c => clamp(1 - c.congIdx * 0.4, 0.3, 1)), this.cities.map(c => c.price[7] / BASE_PRICE[7] * 80));
    for (const c of this.cities) c.transitRiders = 0;
    for (const ln of this.transit.lines) { const share = ln.riders / Math.max(1, ln.cities.length); for (const ci of ln.cities) this.cities[ci].transitRiders += share; L.fares += ln.revenue * dtD; if (ln.active) L.transit += ln.n * LINE_TYPES[ln.type].upkeep * dtD; }
    // land value passes
    const G = w.GN * w.GN; const per = Math.ceil(G / 18); for (let i = 0; i < per; i++) { this.lvPass(this.lvCursor); this.lvCursor = (this.lvCursor + 1) % G; }
    let totalTrips = 0;
    for (const c of this.cities) {
      // population & labour
      c.pop = c.resL * RES_PER_L * c.occ; c.workers = c.pop * PB.workforceShare; c.employed = Math.min(c.workers, c.jobsTotal);
      c.unemp = c.workers > 0 ? 1 - c.employed / c.workers : 0; const staff = c.jobsTotal > 0 ? c.employed / c.jobsTotal : 0;
      // production chain
      const P = c.prodDay.fill(0), Cn = c.consDay.fill(0), S = c.stock;
      for (let r = 1; r <= 4; r++) { const raw = RES_TO_RAW[r]; P[raw] += c.extL[r] * EXT_PER_L[r] * staff; }
      for (let m = 0; m < 4; m++) S[m] += P[m] * dtD;
      const procCap = c.indL * 0.5 * 2.5 * staff * dtD; const rawTot = S[0] + S[1] + S[2] + S[3] + 1e-6;
      for (let m = 0; m < 4; m++) { const use = Math.min(S[m], procCap * S[m] / rawTot); S[m] -= use; S[4 + m] += use; P[4 + m] += use / dtD; Cn[m] += use / dtD; }
      const manuCap = c.indL * 0.5 * 1.5 * staff * dtD; const goods = Math.max(0, Math.min(manuCap, S[5] / 0.5, S[6] / 0.5));
      S[5] -= goods * 0.5; S[6] -= goods * 0.5; S[8] += goods; P[8] += goods / dtD; Cn[5] += goods * 0.5 / dtD; Cn[6] += goods * 0.5 / dtD;
      const perRes = B.needs.goodsPerResidentMonth[1] / B.time.daysPerMonth, mix = B.needs.consumptionMix; const dFood = c.pop * perRes * mix.food, dGoods = c.pop * perRes * (mix.consumer + mix.furniture), dFuel = c.pop * perRes * mix.fuel * c.carShare + c.indL * 0.05;
      const comCap = c.comL * 2.5 * Math.max(0.3, staff);
      const wantSales = (dFood + dGoods) * dtD; const cap = comCap * dtD;
      const sf = Math.min(S[4], dFood * dtD, cap * dFood / (dFood + dGoods + 1e-6)), sg = Math.min(S[8], dGoods * dtD, cap * dGoods / (dFood + dGoods + 1e-6));
      S[4] -= sf; S[8] -= sg; const fu = Math.min(S[7], dFuel * dtD); S[7] -= fu;
      Cn[4] += sf / dtD; Cn[8] += sg / dtD; Cn[7] += fu / dtD;
      c.short = clamp(1 - (sf + sg + fu) / Math.max(1e-6, wantSales + dFuel * dtD), 0, 1);
      c.salesDay = (sf * c.price[4] + sg * c.price[8]) / dtD;
      // prices
      const need = [procCap / dtD / 4, procCap / dtD / 4, procCap / dtD / 4, procCap / dtD / 4, dFood, manuCap / dtD * 0.5, manuCap / dtD * 0.5, dFuel, dGoods];
      for (let m = 0; m < 9; m++) { const target = need[m] * B.goods.retailTargetStockDays + 1; const p = BASE_PRICE[m] * clamp(Math.pow((target + 2) / (S[m] + 2), B.prices.elasticity), B.prices.minMult, B.prices.maxMult); c.price[m] += (p - c.price[m]) * B.prices.smoothing; }
      c.freightCap = 600 + c.ware * 500 + c.port * 5000 + c.stations * 1500 + (c.outside ? 1500 : 0) + this.transit.lines.filter(l => l.cargo && l.cities.includes(c.id)).reduce((s, l) => s + l.n * 2500, 0);
      // budget
      const own = this.owned(c); const wage = PB.wagePerMonth.reduce((s, v, i) => s + v * PB.incomeClassShares[i], 0);
      let outV = 0; for (let m = 0; m < 9; m++) outV += P[m] * c.price[m] * (m < 4 ? 1 : 0.35);
      const tR = this.tax.R / 100 * c.employed * wage * 10 * BG.resTaxBaseShare / B.time.daysPerMonth * dtD, tC = this.tax.C / 100 * c.salesDay * BG.profitShare * dtD, tI = this.tax.I / 100 * outV * BG.profitShare * dtD;
      const sv = c.pop / 1000 * BG.servicesUpkeepPer1000 / B.time.daysPerMonth * dtD;
      if (own) { L.tR += tR; L.tC += tC; L.tI += tI; L.services += sv; const cl = this.cityLedger[c.id] ||= { inc: 0, exp: 0 }; cl.inc += tR + tC + tI; cl.exp += sv; }
      // demand
      const jobsFree = c.jobsTotal - c.workers;
      const lv = c.lvAvg; c.poll = 0;
      const transitShare = clamp(c.transitRiders / Math.max(1, c.workers * 2), 0, 0.8);
      c.carShare = 1 - transitShare;
      c.cong = clamp(c.congIdx, 0, 3);
      const taxPen = Math.max(0, (this.tax.R - 9) * 0.04);
      c.attract = clamp((1 - c.unemp) * 0.7 + lv * 0.12 + transitShare * 0.3 - taxPen - c.cong * 0.25 - c.short * 0.35, -1, 1.5);
      c.occ = clamp(c.occ + dtD * 0.8 * (c.attract - 0.55) * (c.occ > 0.97 && c.attract > 0.55 ? 0.1 : 1), 0.5, 1);
      c.dR = clamp(0.25 + 0.9 * jobsFree / Math.max(300, c.workers) + (c.occ - 0.9) * 4 - c.unemp * 2.5 + (c.attract - 0.6) * 0.5, -1, 1);
      c.dC = clamp(0.15 + (wantSales / dtD - comCap) / Math.max(1, wantSales / dtD) * 1.2 + (c.unemp > 0.08 ? 0.2 : 0), -1, 1);
      c.dI = clamp(0.1 + c.unemp * 3 + c.short * 0.5 + (c.price[8] / BASE_PRICE[8] - 1) * 0.5 + (c.exportVal > 0 ? 0.15 : 0) - (c.jobsTotal > c.workers * 1.1 ? 0.6 : 0), -1, 1);
      if (this.owned(c) && this.frontier) { c.dR = clamp(c.dR + B.expansion.frontierDemandBonus, -1, 1); c.dI = clamp(c.dI + B.expansion.frontierDemandBonus, -1, 1); }
      // growth pace (events/hour)
      const base = (c.resL + c.comL + c.indL + 40) * B.growth.baseDailyRate * GROWTH_MULT * this.damp(c.pop) / 24; // уровней в час при D=1
      const congF = clamp(1.25 - c.cong * 0.55, 0.2, 1.2); const shortF = clamp(1 - c.short * 0.6, 0.3, 1); const landF = clamp(1.25 / (0.6 + 0.35 * lv), 0.5, 1.5);
      c.paceF = { demand: Math.max(0, c.dR) + Math.max(0, c.dC) + Math.max(0, c.dI), tax: (this.taxF(this.tax.R) + this.taxF(this.tax.C) + this.taxF(this.tax.I)) / 3, cong: congF, short: shortF, land: landF };
      const ev = (z: number, d: number, tf: number) => { const n = base * Math.max(0, Math.abs(d) < B.growth.deadband ? 0 : d) * tf * congF * (z === Z.R ? 1 : shortF) * (z === Z.I ? landF : Math.sqrt(landF)) * dtH; let k = Math.floor(n) + (this.rnd() < n % 1 ? 1 : 0); let made = 0; while (k-- > 0) made += this.grow(c, z) ? 1 : 0; return n; };
      c.pace = ev(Z.R, c.dR, this.taxF(this.tax.R)) + ev(Z.C, c.dC, this.taxF(this.tax.C)) + ev(Z.I, c.dI, this.taxF(this.tax.I)); c.pace /= dtH;
      if (c.occ < 0.62 && this.rnd() < B.growth.decayDailyMax * 250 * dtD * 24) this.decay(c);
      // trips (commute + freight)
      const trips = c.employed * 2 * this.todFactor(hour) / 24 / 1.25 * dtH; c.tripsDay = c.employed * 2; totalTrips += trips;
      const carT = trips * c.carShare / this.traffic.scale; let n = Math.floor(carT) + (this.rnd() < carT % 1 ? 1 : 0); n = Math.min(n, 60);
      for (let i = 0; i < n; i++) { const a = this.pickTile(c, Z.R), b = this.pickTile(c, this.rnd() < c.comL / (c.comL + c.indL + 1) ? Z.C : Z.I); if (a >= 0 && b >= 0) this.spawnQueue.push([a, b, 0, c.id]); }
      const fr = (c.salesDay / 400 + c.indL * 0.4) * this.todFactor(hour) / 24 * dtH / this.traffic.scale / 4; let nf = Math.min(15, Math.floor(fr) + (this.rnd() < fr % 1 ? 1 : 0));
      for (let i = 0; i < nf; i++) { const a = this.pickTile(c, Z.I), b = this.pickTile(c, Z.C); if (a >= 0 && b >= 0) this.spawnQueue.push([a, b, 1, c.id]); }
      // notifications
      if (c.pop > 500) {
        if (c.unemp > 0.12) this.note('u' + c.id, `${c.name}: высокая безработица ${(c.unemp * 100).toFixed(0)}% — нужно больше коммерции и промышленности`, 'bad');
        if (c.occ > 0.985 && c.dR > 0.5) this.note('h' + c.id, `${c.name}: нехватка жилья — зонируйте жилые кварталы`);
        if (c.short > 0.3) this.note('s' + c.id, `${c.name}: дефицит товаров (${(c.short * 100).toFixed(0)}%) — развивайте производство, склады и торговлю`, 'bad');
        if (c.cong > 0.8) this.note('c' + c.id, `${c.name}: сильные пробки замедляют рост — стройте проспекты и общественный транспорт`, 'bad');
        for (const m of [1e4, 5e4, 1e5, 5e5, 1e6, 3e6, 1e7]) if (c.pop >= m && (c.hist as any)['m' + m] !== 1) { (c.hist as any)['m' + m] = 1; if (this.minutes > 600) this.note('p' + c.id + m, `${c.name}: население превысило ${fmtNum(m)}!`, 'good'); }
      }
    }
    // agent scale: keep active agents near cap
    const desired = totalTrips / dtH * 0.35; this.traffic.scale = clamp(this.traffic.scale * 0.8 + 0.2 * Math.max(1, desired / (this.traffic.cap * 0.75)), 1, 1e5);
    this.trade(dtD);
    // budget
    L.roads += this.roadUpkeep() * dtD; for (const ln of this.loans) L.interest += ln.amount * ln.rate / 365 * dtD;
    const inc = (L.tR + L.tC + L.tI + L.fares + L.tariff), exp = (L.roads + L.transit + L.services + L.interest);
    this.money += 0; // applied incrementally below
    this.applyLedgerDelta();
    if (this.money < 0) this.note('money', `Бюджет в минусе: ${fmtMoney(this.money)}. Поднимите налоги или возьмите кредит`, 'bad');
    // world price random walk
    for (let m = 0; m < 9; m++) this.worldPrice[m] = clamp(this.worldPrice[m] * (1 + (this.rnd() - 0.5) * 0.02), BASE_PRICE[m] * 0.6, BASE_PRICE[m] * 1.8);
    // history
    const H = this.histH; const push = (a: number[], v: number) => { a.push(v); if (a.length > 240) a.shift(); };
    push(H.pop, this.cities.reduce((s, c) => s + c.pop, 0)); push(H.money, this.money); push(H.cong, this.cities[0].cong); push(H.riders, riders);
    push(H.unemp, this.cities[0].unemp * 100); push(H.income, inc); push(H.expense, exp);
    if (this.day !== prevDay) { this.frontier = this.world.sub.frontier(); if (this.day % B.expansion.aiDecisionDays === 0 || this.day === 2) this.aiExpansion(); const S = this.world.sub; if (S.ownedCount() && this.day % 3 === 0) { for (let s2 = 0; s2 < S.owner.length; s2++) if (!S.blocker(s2, this.playerPop()) && this.money >= S.price(s2)) { this.note('sub', 'Доступен к выкупу соседний участок — откройте панель «Регион»', 'good'); break; } } }
    if (this.day !== prevDay) { this.yesterday = this.today; this.today = this.newLedger(); this.cityLedgerY = this.cityLedger; this.cityLedger = {}; this.lastApplied = this.newLedger(); }
    for (const c of this.cities) { let s = 0, n = 0; const GN = w.GN; const gi = Math.floor(c.x / TILE / w.GC), gj = Math.floor(c.z / TILE / w.GC); const r = Math.ceil(c.rEff / TILE / w.GC); for (let a = -r; a <= r; a += 2) for (let b = -r; b <= r; b += 2) { const ii = gi + a, jj = gj + b; if (ii < 0 || jj < 0 || ii >= GN || jj >= GN) continue; if (this.popG[jj * GN + ii] + this.jobG[jj * GN + ii] > 0) { s += w.landValue[jj * GN + ii]; n++; } } c.lvAvg = n ? s / n : 0.5; }
  }
  lastApplied = this.newLedger();
  applyLedgerDelta() {
    const T = this.today as any, A = this.lastApplied as any; let d = 0;
    for (const k of ['tR', 'tC', 'tI', 'fares', 'tariff']) { d += T[k] - A[k]; A[k] = T[k]; }
    for (const k of ['roads', 'transit', 'services', 'interest']) { d -= T[k] - A[k]; A[k] = T[k]; }
    this.money += d;
  }
  spend(v: number) { this.money -= v; this.today.build += v; this.lastApplied.build += v; }
  pickTile(c: CityState, z: number): number {
    const L = c.lists[z]; const w = this.world;
    for (let t = 0; t < 8; t++) { if (!L.length) return -1; const i = Math.floor(this.rnd() * L.length); const k = L[i]; if (w.zone[k] !== z) { L[i] = L[L.length - 1]; L.pop(); continue; } if (w.bld[k] && this.rnd() * 20 < w.bld[k] + 2) return k; }
    return -1;
  }
  maxLevel(c: CityState, z: number, lv: number) { const pf = 1 + Math.log2(1 + c.pop / 4000); if (z === Z.I) return Math.floor(2 + pf * 0.8 + lv); if (z === Z.C) return Math.floor(1 + lv * 1.4 * pf); return Math.floor(1 + lv * 1.1 * pf); }
  grow(c: CityState, z: number): boolean {
    const w = this.world; const L = c.lists[z]; const N = w.N;
    let best = -1, bs = -1e9;
    for (let t = 0; t < 14 && L.length; t++) {
      const i = Math.floor(this.rnd() * L.length); const k = L[i];
      if (w.zone[k] !== z || w.road[k]) { L[i] = L[L.length - 1]; L.pop(); continue; }
      const ti = k % N, tj = (k / N) | 0; const acc = w.roadAccess(ti, tj); if (!acc) continue;
      const lv = w.tileLV(k); const lvl = w.bld[k]; if (lvl && lvl >= this.maxLevel(c, z, lv)) continue;
      const sc = (z === Z.I ? 2 - lv : lv) + (acc === 1 ? 0.5 : 0) - lvl * 0.03 + this.rnd() * 0.3 - (z === Z.R ? w.pollution[((tj / w.GC) | 0) * w.GN + ((ti / w.GC) | 0)] : 0);
      if (sc > bs) { bs = sc; best = k; }
    }
    if (best < 0) { if (this.rnd() < 0.35) this.expand(c); return false; }
    const k = best; const lvl = w.bld[k];
    let kind = z === Z.R ? K.RES : z === Z.C ? K.COM : K.IND;
    if (z === Z.I && w.resource[k] && (w.resource[k] !== RES.FERTILE || Math.hypot((k % N) * TILE - c.x, ((k / N) | 0) * TILE - c.z) > c.rEff * 0.6)) kind = K.EXTRACT;
    if (lvl && w.kind[k] !== kind && w.kind[k] !== K.RES && w.kind[k] !== K.COM && w.kind[k] !== K.IND && w.kind[k] !== K.EXTRACT) return false;
    if (kind === K.EXTRACT && lvl >= 4) return false;
    if (w.style[k] === 1 && w.tileLV(k) > 1.1) w.style[k] = 0; // gentrification of slums
    w.setBld(k, kind, (w.kind[k] === kind ? lvl : 0) + 1); c.built++; this.growthTotal++;
    return true;
  }
  decay(c: CityState) { const k = this.pickTile(c, Z.R); if (k >= 0 && this.world.bld[k]) this.world.setBld(k, K.RES, this.world.bld[k] - 1); }
  // city grows new streets at its edge when zoned land runs out
  expand(c: CityState) {
    const w = this.world, net = w.net; const ci = w.cities[c.id];
    const es = net.edgesNear(c.x, c.z, c.rEff * 1.1); if (!es.length) return;
    for (let t = 0; t < 10; t++) {
      const e = net.edges[es[Math.floor(this.rnd() * es.length)]]; if (!e.alive || e.type === 2) continue;
      const A = net.nodes[e.a], B = net.nodes[e.b]; const da = Math.hypot(A.x - c.x, A.z - c.z), db = Math.hypot(B.x - c.x, B.z - c.z);
      const [P, Q] = da > db ? [A, B] : [B, A]; const dp = Math.max(da, db); if (dp < c.rEff * 0.5) continue;
      const dirx = (P.x - Q.x) / e.len, dirz = (P.z - Q.z) / e.len; const turn = [0, Math.PI / 2, -Math.PI / 2][Math.floor(this.rnd() * 3)];
      const ca = Math.cos(turn), sa = Math.sin(turn); let hx = dirx * ca - dirz * sa, hz = dirx * sa + dirz * ca;
      if (hx * (P.x - c.x) + hz * (P.z - c.z) < -0.2 * dp) continue;
      const Ln = 70 + this.rnd() * 60; const x = P.x + hx * Ln, z = P.z + hz * Ln;
      if (x < 50 || z < 50 || x > w.M - 50 || z > w.M - 50) continue;
      if (w.sub.ownerAt(x, z) !== w.sub.ownerAt(c.x, c.z)) continue;
      let ok = true; for (let s = 1; s <= 8; s++) { const h = w.hAt(P.x + hx * Ln * s / 8, P.z + hz * Ln * s / 8); if (h < 0.6 || Math.abs(h - w.hAt(P.x + hx * Ln * (s - 1) / 8, P.z + hz * Ln * (s - 1) / 8)) > Ln / 8 * 0.25) { ok = false; break; } }
      if (!ok) continue;
      const ids = net.addRoad(P.x, P.z, x, z, this.rnd() < 0.15 ? 3 : 0, 25, c.id); if (!ids.length) continue;
      // zone along the new street
      const d = Math.hypot(x - c.x, z - c.z) / Math.max(1, c.rEff); const ang = Math.atan2(z - c.z, x - c.x); const dang = Math.abs(((ang - ci.indDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const zt = dang < 0.5 && d > 0.5 ? Z.I : this.rnd() < 0.15 ? Z.C : Z.R;
      w.forTilesAlong(P.x, P.z, x, z, ROAD_TYPES[0].w + 40, k => { const i = k % w.N, j = (k / w.N) | 0; if (!w.road[k] && !w.zone[k] && !w.bld[k] && w.tileSlope(i, j) < 0.22 && w.roadAccess(i, j)) { w.cityOf[k] = c.id + 1; w.setZone(i, j, zt); } });
      c.rEff = Math.max(c.rEff, Math.hypot(x - c.x, z - c.z) + 50); c.expansions++; return;
    }
  }
  trade(dtD: number) {
    const cs = this.cities; for (const c of cs) { c.tradeIn = c.tradeOut = 0; c.exportVal = 0; c.importVal = 0; }
    const capLeft = cs.map(c => c.freightCap * dtD);
    for (let m = 0; m < 9; m++) {
      const target = cs.map(c => c.consDay[m] * 3 + 2);
      for (const a of cs) for (const b of cs) {
        if (a === b) continue; const sur = a.stock[m] - target[a.id] * 1.3; const def = target[b.id] - b.stock[m]; if (sur <= 0 || def <= 0) continue;
        if (b.price[m] < a.price[m] * 1.05) continue;
        const q = Math.min(sur, def, capLeft[a.id], capLeft[b.id]); if (q <= 0) continue;
        a.stock[m] -= q; b.stock[m] += q; capLeft[a.id] -= q; capLeft[b.id] -= q; a.tradeOut += q; b.tradeIn += q;
        this.today.tariff += q * a.price[m] * 0.03;
        const trucks = Math.min(3, q / 200 / Math.max(1, this.traffic.scale / 3)); if (this.rnd() < trucks) { const s = this.pickTile(a, Z.I), d = this.pickTile(b, Z.C); if (s >= 0 && d >= 0) this.spawnQueue.push([s, d, 1, a.id]); }
      }
      // world market via ports / outside highways
      for (const c of cs) {
        if (!c.outside && !c.port) continue;
        const wp = this.worldPrice[m]; const cap = capLeft[c.id] * (c.port ? 2 : 1);
        if (c.stock[m] < target[c.id] * 0.6 && cap > 0) { const q = Math.min(target[c.id] - c.stock[m], cap); c.stock[m] += q; capLeft[c.id] -= q; c.importVal += q * wp * 1.2; c.tradeIn += q; this.today.tariff += q * wp * 0.05; }
        else if (c.stock[m] > target[c.id] * 2.5 && cap > 0) { const q = Math.min(c.stock[m] - target[c.id] * 2, cap); c.stock[m] -= q; capLeft[c.id] -= q; c.exportVal += q * wp * 0.9; c.tradeOut += q; this.today.tariff += q * wp * 0.04; }
      }
    }
  }
  takeLoan(amount: number, rate = 0.06 + this.loans.length * 0.02) { this.loans.push({ amount, rate }); this.money += amount; this.notes(`Получен кредит ${fmtMoney(amount)}`, 'good'); }
  repayLoan() { const l = this.loans[0]; if (!l || this.money < l.amount) return false; this.money -= l.amount; this.loans.shift(); return true; }
  /** выкуп свободного подрегиона (08 §2). Возвращает текст ошибки или '' */
  buySub(si: number): string { const S = this.world.sub; const b = S.blocker(si, this.playerPop()); if (b) return b; const p = S.price(si); if (this.money < p) return 'недостаточно средств'; this.money -= p; this.today.build += p; this.lastApplied.build += p; S.buy(si, 0); this.newSubUntil[si] = this.minutes + 30 * 1440; return ''; }
  newSubUntil: Record<number, number> = {};
  /** ИИ-соседи: копят и выкупают свободные участки у своих границ (08 §6), с правом первого выкупа у игрока (§3) */
  aiExpansion() {
    const S = this.world.sub; const X = B.expansion;
    for (const cl of [...S.claims]) if (this.minutes >= cl.until && S.owner[cl.sub] === -1) { S.buy(cl.sub, cl.ai); this.notes(`${this.cities[cl.ai].name} выкупил свободный участок у границы`, 'warn'); }
    for (const c of this.cities) {
      if (this.owned(c) || c.id === 0) continue; c.aiSave += c.pop * 2.5 * X.aiSaveShare * X.aiDecisionDays;
      if (Math.max(c.dR, c.dI) < 0.2) continue;
      for (let s = 0; s < S.owner.length; s++) {
        if (S.owner[s] !== -1 || S.border(s, c.id) === 0 || S.claims.some(q => q.sub === s)) continue;
        const price = S.price(s); if (c.aiSave < price) break;
        c.aiSave -= price; const first = S.border(s, 0) >= S.border(s, c.id);
        S.claims.push({ sub: s, ai: c.id, until: this.minutes + (first ? X.firstRefusalDays : 3) * 1440 });
        this.notes(first ? `${c.name} претендует на свободный участок. Право первого выкупа у вас: ${X.firstRefusalDays} дн. (панель «Регион»)` : `${c.name} выкупает участок у своей границы`, 'warn'); break;
      }
    }
  }
  serialize() { return { sub: this.world.sub.serialize(), money: this.money, loans: this.loans, tax: this.tax, minutes: this.minutes, worldPrice: [...this.worldPrice], cities: this.cities.map(c => ({ occ: c.occ, rEff: c.rEff, stock: [...c.stock], price: [...c.price], congIdx: c.congIdx })) }; }
  load(d: any) { this.world.sub.load(d.sub); this.money = d.money; this.loans = d.loans; this.tax = d.tax; this.minutes = d.minutes; this.worldPrice = Float64Array.from(d.worldPrice); d.cities.forEach((s: any, i: number) => { const c = this.cities[i]; if (!c) return; c.occ = s.occ; c.rEff = s.rEff; c.stock = Float64Array.from(s.stock); c.price = Float64Array.from(s.price); c.congIdx = s.congIdx; }); }
}
void hash2;
