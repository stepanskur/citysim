import { mulberry32, Noise, smooth, clamp, lerp, MinHeap } from '../util';
import { RoadNet, ROAD_TYPES } from '../world/RoadNet';
import { spacingOk, unifyClasses, repairNetwork } from './netgen';
import { BALANCE } from '../sim/balance';
import { LEVEL_DECK, LEVEL_GRADE } from '../world/World';
import { filletPolyline } from '../../design/road-curves';
import { TILE, SIZES, Z, K, RES, markRoadTiles } from '../world/consts';

export interface CityInfo { id: number; name: string; x: number; z: number; r: number; kind: string; pattern: string; main: boolean; indDir: number; form?: string; formRu?: string; axis?: number; aniso?: number; districts?: { name: string; type: string; x: number; z: number }[] }

const FORM_RU: Record<string, string> = { grid: 'сеточный', radial: 'радиально-кольцевой', linear: 'линейный', poly: 'полицентричный', hilly: 'холмистый', port: 'портовый', river: 'речной', resort: 'курортный' };
const SYL1 = ['Ново', 'Старо', 'Красно', 'Бело', 'Зелено', 'Светло', 'Камен', 'Яро', 'Вла', 'Желез', 'Сосн', 'Берёз', 'Волго', 'Озер', 'Речн', 'Солн', 'Медно', 'Сине', 'Тихо', 'Золото'];
const SYL2 = ['горск', 'дар', 'поль', 'град', 'бург', 'ск', 'ово', 'инск', 'огорск', 'речье', 'морск', 'ярск', 'дольск', 'полье', 'вск'];

export function genWorld(seed: number, sizeIdx: number, progress?: (s: string) => void, neighbors = 2) {
  const S = SIZES[sizeIdx];
  const M = S.map, N = M / TILE, NV = N + 1;
  const rnd = mulberry32(seed);
  const nz = new Noise(seed), nz2 = new Noise(seed ^ 0x9e3779b9);
  const heights = new Float32Array(NV * NV);
  const cxm = M / 2, czm = M / 2;
  const coastA = rnd() * Math.PI * 2, cdx = Math.cos(coastA), cdz = Math.sin(coastA);
  const hasCoast = rnd() < 0.75;
  // main city position: near center
  const mainX = cxm + (rnd() - 0.5) * M * 0.12, mainZ = czm + (rnd() - 0.5) * M * 0.12;
  progress?.('Рельеф...');
  const o1 = rnd() * 1000, o2 = rnd() * 1000;
  for (let j = 0; j < NV; j++) for (let i = 0; i < NV; i++) {
    const x = i * TILE, z = j * TILE;
    const cont = nz.fbm(x * 0.00011 + o1, z * 0.00011 + o2, 4);
    let h = cont * 45 + 16;
    h += nz2.fbm(x * 0.0011, z * 0.0011, 4) * 10;
    const mm = smooth(0.05, 0.45, nz.fbm(x * 0.00016 + 77, z * 0.00016 - 31, 3));
    const rr = nz2.ridged(x * 0.00045 + 13, z * 0.00045 + 7, 4);
    h += rr * rr * 170 * mm;
    if (hasCoast) { const d = ((x - cxm) * cdx + (z - czm) * cdz) / (M / 2); h -= smooth(0.3, 0.95, d) * 80; }
    const dm = Math.hypot(x - mainX, z - mainZ);
    const f = smooth(S.r * 1.9, S.r * 0.5, dm);
    const flat = Math.max(5, cont * 15 + 14 + nz2.fbm(x * 0.0011, z * 0.0011, 3) * 4);
    h = lerp(h, flat, f * 0.85);
    heights[j * NV + i] = h;
  }
  const H = (i: number, j: number) => heights[clamp(j, 0, N) * NV + clamp(i, 0, N)];
  // rivers
  progress?.('Реки...');
  const orig = heights.slice();
  const nRivers = 1 + sizeIdx + Math.floor(rnd() * 2);
  for (let r = 0; r < nRivers; r++) {
    let si = -1, sj = -1;
    for (let t = 0; t < 200; t++) { const i = Math.floor(rnd() * N), j = Math.floor(rnd() * N); if (H(i, j) > 45) { si = i; sj = j; break; } }
    if (si < 0) continue;
    let i = si, j = sj; let width = 1; const visited = new Set<number>();
    let pdi = 0, pdj = 0;
    for (let step = 0; step < N * 6; step++) {
      visited.add(j * NV + i);
      const w = Math.min(4, width);
      for (let a = -w - 1; a <= w + 1; a++) for (let b = -w - 1; b <= w + 1; b++) {
        const ii = i + a, jj = j + b; if (ii < 0 || jj < 0 || ii > N || jj > N) continue;
        const d = Math.hypot(a, b); const bed = d <= w ? -3 : lerp(-3, 1e9, (d - w) / 2);
        const k = jj * NV + ii; if (d <= w) heights[k] = Math.min(heights[k], -3); else heights[k] = Math.min(heights[k], Math.max(heights[k] * 0.5 + 0.5, 1.2));
        void bed;
      }
      if (H(i, j) < -2.9 && step > 10 && heights[j * NV + i] < -2 && isSea(i, j)) break;
      let best = -1, bh = 1e9, bi = 0, bj = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue; const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii > N || jj > N) { best = -2; break; }
        if (visited.has(jj * NV + ii)) continue;
        const hh = orig[jj * NV + ii] - (a === pdi && b === pdj ? 0.6 : 0) + nz.n2(ii * 0.3, jj * 0.3) * 0.5;
        if (hh < bh) { bh = hh; bi = ii; bj = jj; best = 1; }
      }
      if (best !== 1) break;
      pdi = bi - i; pdj = bj - j; i = bi; j = bj; width += 0.012;
    }
  }
  function isSea(i: number, j: number) { // sample far-ish neighbors are also water
    let c = 0; for (let a = -8; a <= 8; a += 4) for (let b = -8; b <= 8; b += 4) if (H(i + a, j + b) < 0) c++;
    return c > 20;
  }
  const tileH = (i: number, j: number) => (H(i, j) + H(i + 1, j) + H(i, j + 1) + H(i + 1, j + 1)) / 4;
  const tileSlope = (i: number, j: number) => { const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1); return (Math.max(a, b, c, d) - Math.min(a, b, c, d)) / TILE; };
  const hAt = (x: number, z: number) => { const fx = x / TILE, fz = z / TILE; const i = Math.floor(fx), j = Math.floor(fz); const u = fx - i, v = fz - j; return lerp(lerp(H(i, j), H(i + 1, j), u), lerp(H(i, j + 1), H(i + 1, j + 1), u), v); };

  progress?.('Ресурсы...');
  const resource = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE; const h = tileH(i, j), sl = tileSlope(i, j);
    if (h < 0.6) continue;
    let r = 0;
    if (h > 18 && nz2.ridged(x * 0.0026 + 300, z * 0.0026) > 0.9) r = RES.ORE;
    else if (h < 45 && nz.fbm(x * 0.0022 + 400, z * 0.0022 + 400, 3) > 0.5) r = RES.OIL;
    else if (h < 35 && sl < 0.1 && nz2.fbm(x * 0.0014 + 200, z * 0.0014, 3) > 0.18) r = RES.FERTILE;
    else if (h > 3 && h < 95 && nz.fbm(x * 0.0019 + 50, z * 0.0019 - 50, 4) > 0.12) r = RES.FOREST;
    resource[j * N + i] = r;
  }

  progress?.('Города...');
  const cities: CityInfo[] = [];
  const name = () => SYL1[Math.floor(rnd() * SYL1.length)] + SYL2[Math.floor(rnd() * SYL2.length)];
  const usedNames = new Set<string>();
  const uname = () => { for (let t = 0; t < 50; t++) { const n = name(); if (!usedNames.has(n)) { usedNames.add(n); return n; } } return name() + ' ' + cities.length; };
  cities.push({ id: 0, name: uname(), x: mainX, z: mainZ, r: S.r, kind: 'trade', pattern: 'grid', main: true, indDir: 0 });
  for (let c = 0; c < S.others; c++) {
    const r = S.r * (0.22 + rnd() * 0.35);
    let best: any = null;
    for (let t = 0; t < 300; t++) {
      const x = r + 200 + rnd() * (M - 2 * r - 400), z = r + 200 + rnd() * (M - 2 * r - 400);
      if (cities.some(o => Math.hypot(o.x - x, o.z - z) < (o.r + r) * 1.35 + 500)) continue;
      const i = Math.floor(x / TILE), j = Math.floor(z / TILE); const h = tileH(i, j); if (h < 2 || h > 90) continue;
      let sc = 0, cnt = 0; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const ii = Math.floor((x + a * r / 3) / TILE), jj = Math.floor((z + b * r / 3) / TILE); if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue; cnt++; if (tileH(ii, jj) > 1) sc += 1 - Math.min(1, tileSlope(ii, jj) * 4); }
      sc /= cnt || 1;
      if (!best || sc > best.sc) best = { x, z, sc };
    }
    if (best && best.sc > 0.3) cities.push({ id: cities.length, name: uname(), x: best.x, z: best.z, r, kind: 'trade', pattern: 'grid', main: false, indDir: 0 });
  }
  // character + pattern
  for (const c of cities) {
    let water = 0, ore = 0, oil = 0, fert = 0, mount = 0, cnt = 0, slopeSum = 0, slope2 = 0; let wx = 0, wz = 0, rx = 0, rz = 0;
    const R = c.r * 1.4;
    for (let a = -12; a <= 12; a++) for (let b = -12; b <= 12; b++) {
      const x = c.x + a * R / 12, z = c.z + b * R / 12; if (Math.hypot(x - c.x, z - c.z) > R) continue;
      const i = Math.floor(x / TILE), j = Math.floor(z / TILE); if (i < 0 || j < 0 || i >= N || j >= N) continue; cnt++;
      const h = tileH(i, j); const res = resource[j * N + i];
      if (h < 0) { water++; wx += x - c.x; wz += z - c.z; }
      if (res === RES.ORE) { ore++; rx += x - c.x; rz += z - c.z; } if (res === RES.OIL) { oil++; rx += x - c.x; rz += z - c.z; } if (res === RES.FERTILE) fert++; if (h > 80) mount++;
      if (Math.hypot(x - c.x, z - c.z) < c.r) { const s = tileSlope(i, j); slopeSum += s; slope2 += s * s; }
    }
    const f = (v: number) => v / Math.max(1, cnt);
    if (f(water) > 0.06) { c.kind = 'port'; c.indDir = Math.atan2(wz, wx); }
    else if (f(ore + oil) > 0.04) { c.kind = 'industrial'; c.indDir = Math.atan2(rz, rx); }
    else if (f(fert) > 0.15) { c.kind = 'agri'; c.indDir = rnd() * Math.PI * 2; }
    else if (f(mount) > 0.05) { c.kind = 'resort'; c.indDir = rnd() * Math.PI * 2; }
    else { c.kind = 'trade'; c.indDir = rnd() * Math.PI * 2; }
    const ms = slopeSum / Math.max(1, cnt);
    const roll = rnd();
    c.pattern = ms < 0.035 ? (roll < 0.65 ? 'grid' : 'radial') : ms < 0.07 ? (roll < 0.5 ? 'radial' : 'organic') : 'organic';
    if (c.main && sizeIdx >= 3 && roll < 0.3) c.pattern = 'radial';
    // характер города: уникальная форма плана от seed и рельефа
    const r2 = rnd(); let form: string;
    if (c.kind === 'port') form = r2 < 0.5 ? 'port' : r2 < 0.8 ? 'river' : 'linear';
    else if (ms > 0.06 || c.kind === 'resort') form = c.kind === 'resort' && r2 < 0.6 ? 'resort' : 'hilly';
    else form = ['grid', 'radial', 'linear', 'poly', 'grid', 'radial', 'hilly'][Math.floor(r2 * 7)];
    if (c.main && sizeIdx >= 3 && form === 'hilly' && r2 < 0.5) form = 'poly';
    c.form = form; c.formRu = FORM_RU[form];
    c.axis = f(water) > 0.03 ? Math.atan2(wz, wx) + Math.PI / 2 : rnd() * Math.PI; c.aniso = form === 'linear' || form === 'river' ? 1.9 + rnd() * 0.8 : form === 'port' ? 1.3 : 1 + rnd() * 0.3;
  }

  progress?.('Дороги...');
  const net = new RoadNet();
  const okSeg = (ax: number, az: number, bx: number, bz: number, allowWater: number) => {
    const L = Math.hypot(bx - ax, bz - az); const n = Math.ceil(L / 8); let wat = 0;
    let ph = hAt(ax, az);
    for (let s = 1; s <= n; s++) { const x = ax + (bx - ax) * s / n, z = az + (bz - az) * s / n; if (x < 20 || z < 20 || x > M - 20 || z > M - 20) return false; const h = hAt(x, z); if (h < 0.5) wat += L / n; if (Math.abs(h - ph) / (L / n) > 0.28 && h > 0.5 && ph > 0.5) return false; ph = h; }
    return wat <= allowWater;
  };
  for (const c of cities) {
    const crnd = mulberry32(seed + c.id * 7919);
    const F = c.form!, ax = c.axis!, an = c.aniso!;
    const bnd = (x: number, z: number) => { const a = Math.atan2(z - c.z, x - c.x); const el = Math.sqrt(an) / Math.hypot(Math.cos(a - ax) / 1, Math.sin(a - ax) * an) ; return el * c.r * (0.7 + 0.45 * nz.fbm(Math.cos(a) * 1.3 + c.id * 10, Math.sin(a) * 1.3, 3) + 0.25 * nz2.n2(x * 0.0015, z * 0.0015)); };
    const inside = (x: number, z: number) => Math.hypot(x - c.x, z - c.z) < bnd(x, z);
    const dens = (x: number, z: number) => nz2.fbm(x * 0.0022 + c.id * 50, z * 0.0022, 3); // district density field
    // organic growth (historic core & suburbs)
    const organic = (sx: number, sz: number, rad: number, stepMin: number, stepVar: number, maxE: number, mainType: number, branch: number) => {
      let start = net.nearestNode(sx, sz, 30); if (start < 0) start = net.newNode(sx, sz, c.id);
      const front: { n: number; h: number; t: number }[] = []; const a0 = crnd() * Math.PI * 2;
      const arms = 3 + Math.floor(crnd() * 2);
      for (let k = 0; k < arms; k++) front.push({ n: start, h: a0 + k * Math.PI * 2 / arms + (crnd() - 0.5) * 0.6, t: mainType });
      let made = 0, it = 0;
      while (front.length && made < maxE && it++ < maxE * 5) {
        const fi = Math.floor(crnd() * Math.min(front.length, 8)); const f = front.splice(fi, 1)[0]; const P = net.nodes[f.n];
        for (const dh of [0, 0.15, -0.15, 0.5, -0.5]) {
          const h = f.h + dh + nz.n2(P.x * 0.006, P.z * 0.006) * 0.12; /* почти прямые улицы */ const L = stepMin + crnd() * stepVar;
          const x = P.x + Math.cos(h) * L, z = P.z + Math.sin(h) * L;
          if (Math.hypot(x - sx, z - sz) > rad || !inside(x, z) || hAt(x, z) < 0.6 || !okSeg(P.x, P.z, x, z, f.t === 1 ? 160 : 0)) continue;
          const near = net.nearestNode(x, z, L * 0.45, n => n !== f.n);
          if (near < 0 && !spacingOk(net, P.x, P.z, x, z, f.t, f.n)) continue; // этап B: отступы и углы (13 §1)
          if (near >= 0) { const Q = net.nodes[near]; if (okSeg(P.x, P.z, Q.x, Q.z, 0)) made += net.addRoad(P.x, P.z, Q.x, Q.z, f.t, 3, c.id).length; break; }
          made += net.addRoad(P.x, P.z, x, z, f.t, 3, c.id).length;
          const nn = net.nearestNode(x, z, 2); if (nn < 0) break;
          front.push({ n: nn, h, t: f.t }); // этап B: класс не меняется посреди дороги
          const side = f.t === 1 ? 0 : 3;
          if (crnd() < branch) front.push({ n: nn, h: h + Math.PI / 2 + (crnd() - 0.5) * 0.12, t: crnd() < 0.5 ? side : 0 });
          if (crnd() < branch) front.push({ n: nn, h: h - Math.PI / 2 + (crnd() - 0.5) * 0.12, t: crnd() < 0.5 ? side : 0 });
          break;
        }
      }
    };
    const core = c.r * (F === 'hilly' || F === 'river' ? 0.26 + crnd() * 0.1 : F === 'grid' ? 0.1 + crnd() * 0.06 : 0.16 + crnd() * 0.1);
    // 1. historic core: dense, crooked, narrow lanes
    organic(c.x, c.z, core, BALANCE.netgen.junctionSpacing.street, 30, Math.PI * core * core / (70 * 70) * 2, 0, 0.42); // этап B: шаг ≥ junctionSpacing.street, кварталы ≥ blockMin
    // 2. radial arterials (old roads to the countryside)
    const spokes = F === 'radial' ? 5 + Math.floor(crnd() * 2) : F === 'linear' || F === 'river' ? 2 : F === 'grid' ? 2 : 3 + Math.floor(crnd() * 2);
    for (let k = 0; k < spokes; k++) {
      let a = (spokes === 2 ? ax + k * Math.PI : k / spokes * Math.PI * 2) + (crnd() - 0.5) * (spokes === 2 ? 0.1 : 0.5); let x = c.x + Math.cos(a) * core * 0.85, z = c.z + Math.sin(a) * core * 0.85; // луч начинается от края ядра — без «звезды» в центре
      for (let s = 0; s < 60; s++) {
        a += nz.n2(x * 0.002, z * 0.002) * 0.07; const L = 110; const nx2 = x + Math.cos(a) * L, nz3 = z + Math.sin(a) * L;
        if (Math.hypot(nx2 - c.x, nz3 - c.z) > bnd(nx2, nz3) * 1.05 || !okSeg(x, z, nx2, nz3, 220)) break;
        net.addRoad(x, z, nx2, nz3, 1, 8, c.id); x = nx2; z = nz3;
      }
    }
    // 2b. кольца (радиальный город) и дополнительные ядра (полицентричный)
    if (F === 'radial') for (const rf of [0.45]) { const rr = c.r * rf, n = Math.max(12, Math.ceil(rr * Math.PI * 2 / 110)); let px = 0, pz = 0, okp = false; for (let q = 0; q <= n; q++) { const a = q / n * Math.PI * 2, x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; const ok2 = inside(x, z) && hAt(x, z) > 0.6; if (okp && ok2 && okSeg(px, pz, x, z, 120)) net.addRoad(px, pz, x, z, 1, 10, c.id); px = x; pz = z; okp = ok2; } }
    if (F === 'poly') { const nc = 2 + Math.floor(crnd() * 2); for (let q = 0; q < nc; q++) { const a = crnd() * Math.PI * 2, d = c.r * (0.45 + crnd() * 0.2); const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (hAt(x, z) < 1) continue; organic(x, z, c.r * 0.16, 34, 24, 60, 0, 0.5); net.addRoad(c.x + (x - c.x) / d * core, c.z + (z - c.z) / d * core, x, z, 1, 12, c.id); } }
    // 3. planned districts: sectors with own grid angle & block size; holes left by density field
    const nSec = F === 'grid' || F === 'linear' ? 1 : F === 'radial' ? 6 + Math.floor(crnd() * 3) : 3 + Math.floor(crnd() * 4); const secOff = crnd() * Math.PI * 2;
    for (let sct = 0; sct < nSec; sct++) {
      const th = F === 'radial' ? secOff + (sct + 0.5) / nSec * Math.PI * 2 : F === 'grid' || F === 'linear' || F === 'river' ? ax + (crnd() < 0.7 ? 0 : 0.25) : crnd() * Math.PI; const ct = Math.cos(th), st = Math.sin(th);
      const BM = BALANCE.netgen.blockMin; const sA0 = F === 'grid' ? 80 + crnd() * 30 : F === 'resort' ? 110 + crnd() * 60 : 70 + crnd() * 90, sA = Math.max(BM, sA0), sB = Math.max(BM, sA * (0.8 + crnd() * 1.0)); // этап B: квартал не меньше blockMin
      const a0 = secOff + sct / nSec * Math.PI * 2, a1 = secOff + (sct + 1) / nSec * Math.PI * 2;
      const inSec = (x: number, z: number) => { if (nSec === 1) return true; const a = Math.atan2(z - c.z, x - c.x); const d = ((a - a0) % (Math.PI * 2) + Math.PI * 4) % (Math.PI * 2); return d < a1 - a0; };
      const reach = c.r * (nSec === 1 ? 1.1 : 0.6 + crnd() * 0.5);
      const Ka = Math.ceil(c.r * 1.3 / sA), Kb = Math.ceil(c.r * 1.3 / sB);
      const ok = (x: number, z: number) => { const d = Math.hypot(x - c.x, z - c.z); return d > core * 0.85 && d < reach * (bnd(x, z) / c.r) * 1.2 && inSec(x, z) && inside(x, z) && hAt(x, z) > 0.6 && dens(x, z) > -0.3; };
      const P = (a: number, b: number): [number, number] => [c.x + a * sA * ct - b * sB * st, c.z + a * sA * st + b * sB * ct];
      for (let a = -Ka; a <= Ka; a++) for (let b = -Kb; b <= Kb; b++) {
        const [x, z] = P(a, b); if (!ok(x, z)) continue;
        for (const [da, db] of [[1, 0], [0, 1]]) {
          const [x2, z2] = P(a + da, b + db); if (!ok(x2, z2)) continue;
          const main = false; const t = crnd() < 0.18 ? 3 : 0;
          if (okSeg(x, z, x2, z2, main ? 140 : 0)) net.addRoad(x, z, x2, z2, t, 14, c.id);
        }
      }
    }
    // 4. sprawling suburbs / villages on the outskirts
    const sub = F === 'resort' || F === 'hilly' ? 4 + Math.floor(crnd() * 3) : F === 'grid' ? 1 : 2 + Math.floor(crnd() * 4);
    for (let k = 0; k < sub; k++) { const a = crnd() * Math.PI * 2; const d = c.r * (0.65 + crnd() * 0.4); const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; if (hAt(x, z) < 1) continue; const rr = c.r * (0.12 + crnd() * 0.15); organic(x, z, rr, 60, 50, Math.PI * rr * rr / (90 * 90) * 1.5, 0, 0.3); }
    c.pattern = 'mixed';
  }
  // remove tiny isolated nodes
  progress?.('Шоссе между городами...');
  const G = 64, GN = Math.floor(M / G);
  const gcost = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
    const x = (i + 0.5) * G, z = (j + 0.5) * G; const h = hAt(x, z);
    const sl = Math.abs(hAt(x + G / 2, z) - hAt(x - G / 2, z)) / G + Math.abs(hAt(x, z + G / 2) - hAt(x, z - G / 2)) / G;
    gcost[j * GN + i] = 1 + sl * 40 + (h < 0.5 ? 14 : 0) + (h > 100 ? 4 : 0);
  }
  const gpath = (sx: number, sz: number, tx: number, tz: number): [number, number][] => {
    const si = clamp(Math.floor(sx / G), 0, GN - 1), sj = clamp(Math.floor(sz / G), 0, GN - 1), ti = clamp(Math.floor(tx / G), 0, GN - 1), tj = clamp(Math.floor(tz / G), 0, GN - 1);
    const gs = new Float32Array(GN * GN).fill(Infinity), from = new Int32Array(GN * GN).fill(-1); const hp = new MinHeap(4096);
    const s = sj * GN + si, t = tj * GN + ti; gs[s] = 0; hp.push(s, 0);
    while (hp.size) {
      const u = hp.pop(); if (u === t) break; const ui = u % GN, uj = (u / GN) | 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        if (!a && !b) continue; const vi = ui + a, vj = uj + b; if (vi < 0 || vj < 0 || vi >= GN || vj >= GN) continue;
        const v = vj * GN + vi; const c = gs[u] + (a && b ? 1.414 : 1) * (gcost[u] + gcost[v]) / 2;
        if (c < gs[v]) { gs[v] = c; from[v] = u; hp.push(v, c + Math.hypot(vi - ti, vj - tj)); }
      }
    }
    const out: [number, number][] = []; let u = t; if (from[t] < 0 && t !== s) return [];
    while (u >= 0) { out.push([(u % GN + 0.5) * G, (((u / GN) | 0) + 0.5) * G]); u = from[u]; }
    out.reverse(); return out;
  };
  /* Запрос Степана: шоссе шло ломаной по клеткам A* (каждая 3-я клетка, snap 14 — липло к улицам) и пересекало улицы где попало.
   * Теперь: (1) клетки с существующими дорогами дороже (roadCellPenalty) — трасса обходит ткань улиц; (2) упрощение Дугласа–Пекера
   * и скругление road-curves filletPolyline('highway') — дуги R ≥ rMin класса; (3) пересечения с наземными дорогами собираются
   * по длине трассы в кластеры: одиночное пересечение не ближе junctionStep к предыдущей развязке → наземная развязка (узел);
   * остальное → эстакада (lv 1) на интервале с рампами LEVEL_DECK/LEVEL_GRADE + rampMargin, а у концов трассы, где рампе
   * не уместиться, — обрыв улицы (ребро удаляется, связность чинит repairNetwork). Промежуточные точки без прилипания (snap 2). */
  const HWC = BALANCE.netgen.highway; const RAMP = LEVEL_DECK / LEVEL_GRADE + HWC.rampMargin;
  for (const E of net.edges) { if (!E.alive) continue; const A = net.nodes[E.a], B = net.nodes[E.b]; const n = Math.ceil(E.len / (G / 2)); const seen = new Set<number>();
    for (let q = 0; q <= n; q++) { const i = clamp(Math.floor((A.x + (B.x - A.x) * q / n) / G), 0, GN - 1), j = clamp(Math.floor((A.z + (B.z - A.z) * q / n) / G), 0, GN - 1); const k = j * GN + i; if (!seen.has(k)) { seen.add(k); gcost[k] += HWC.roadCellPenalty; } } }
  const dp = (P: [number, number][], tol: number): [number, number][] => { if (P.length < 3) return P; const [a, b] = [P[0], P[P.length - 1]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let mi = -1, md = 0;
    for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - P[i][1]) - (a[0] - P[i][0]) * (b[1] - a[1])) / L; if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [a, b]; const l = dp(P.slice(0, mi + 1), tol), r = dp(P.slice(mi), tol); return [...l.slice(0, -1), ...r]; };
  const segX = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) => { const den = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx); if (Math.abs(den) < 1e-9) return -1; const t = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / den, u = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / den; return t >= 0 && t <= 1 && u > 0 && u < 1 ? t : -1; };
  const hwLog = { atGrade: 0, elevated: 0, cut: 0 };
  const addHighway = (pts: [number, number][], startNode: number, endNode: number) => {
    if (pts.length < 2) return;
    const raw = pts.slice(); if (startNode >= 0) raw[0] = [net.nodes[startNode].x, net.nodes[startNode].z]; if (endNode >= 0) raw.push([net.nodes[endNode].x, net.nodes[endNode].z]);
    const ctrl = dp(raw, G * 1.2).map(p => ({ x: p[0], z: p[1] }));
    // скругление: filletPolyline даёт дуги R ≥ rMin, но при коротких плечах радиус падал (изломы 20–45° на новых сидах) —
    // поэтому сначала срезание углов Чайкина (×5, концы закреплены), затем fillet по сглаженной ломаной
    let ch = ctrl; for (let it = 0; it < 5 && ch.length > 2; it++) { const o = [ch[0]]; for (let i = 0; i + 1 < ch.length; i++) { const a = ch[i], b = ch[i + 1]; if (i > 0) o.push({ x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 }); if (i + 2 < ch.length) o.push({ x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }); } o.push(ch[ch.length - 1]); ch = o; }
    const sm = ch.length > 2 ? filletPolyline(ch, 'highway').pts : ch;
    // ресэмпл ~segLen
    const P: { x: number; z: number; s: number }[] = [{ ...sm[0], s: 0 }]; let acc = 0;
    for (let i = 1; i < sm.length; i++) { const d = Math.hypot(sm[i].x - sm[i - 1].x, sm[i].z - sm[i - 1].z); if (d < 1e-3) continue; acc += d; if (acc >= HWC.segLen || i === sm.length - 1) { const L0 = P[P.length - 1]; P.push({ ...sm[i], s: L0.s + Math.hypot(sm[i].x - L0.x, sm[i].z - L0.z) }); acc = 0; } }
    // добивка радиуса: где поворот на узле > segLen/rMin (R < rMin шоссе 450 м) (рельеф заставил A* сделать «шпильку») — лапласово сглаживание точки
    { const maxT = HWC.segLen / 450 * 1.15; for (let it = 0; it < 300; it++) { let moved = false; for (let i = 1; i + 1 < P.length; i++) { const a = P[i - 1], b = P[i], c = P[i + 1];
        const u1 = Math.atan2(b.z - a.z, b.x - a.x), u2 = Math.atan2(c.z - b.z, c.x - b.x); let d = Math.abs(u2 - u1); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > maxT) { b.x += ((a.x + c.x) / 2 - b.x) * 0.5; b.z += ((a.z + c.z) / 2 - b.z) * 0.5; moved = true; } } if (!moved) break; }
      for (let i = 1; i < P.length; i++) P[i].s = P[i - 1].s + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z); }
    const Ltot = P[P.length - 1].s;
    // трасса легла вдоль существующей улицы (коллинеарно, segX их не видит, а snap сливал узлы → «развязки» каждые 50 м): такие участки улиц убираем, шоссе их заменяет
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z) || 1, ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
      const dl = (x: number, z: number) => { const t = Math.max(0, Math.min(L, (x - a.x) * ux + (z - a.z) * uz)); return Math.hypot(a.x + ux * t - x, a.z + uz * t - z); };
      for (const e of net.edgesNear((a.x + b.x) / 2, (a.z + b.z) / 2, L / 2 + 20)) { const E = net.edges[e]; if (!E.alive || E.type === 2 || (E.lv || 0) !== 0) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
        const el = Math.hypot(B.x - A.x, B.z - A.z) || 1; if (Math.abs(((B.x - A.x) * ux + (B.z - A.z) * uz) / el) < 0.94) continue;
        if (dl(A.x, A.z) < 10 && dl(B.x, B.z) < 10) { net.removeEdge(e); hwLog.cut++; } } }
    // пересечения с существующими дорогами
    const X: { s: number; e: number }[] = [];
    for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1]; for (const e of net.edgesNear((a.x + b.x) / 2, (a.z + b.z) / 2, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 40)) { const E = net.edges[e]; if (!E.alive || (E.lv || 0) !== 0) continue; const A = net.nodes[E.a], B = net.nodes[E.b];
      const t = segX(a.x, a.z, b.x, b.z, A.x, A.z, B.x, B.z); if (t >= 0) { const s = a.s + (b.s - a.s) * t; if (s > 25 && s < Ltot - 25 && !X.some(q => q.e === e && Math.abs(q.s - s) < 1)) X.push({ s, e }); } } }
    X.sort((a, b) => a.s - b.s);
    const cl: { s: number; e: number }[][] = []; for (const x of X) { const c = cl[cl.length - 1]; if (c && x.s - c[c.length - 1].s < 2 * RAMP) c.push(x); else cl.push([x]); }
    const elev: [number, number][] = []; let lastJ = startNode >= 0 ? 0 : -1e9;
    for (const c of cl) { const s0 = c[0].s, s1 = c[c.length - 1].s;
      if (c.length === 1 && s0 - lastJ >= HWC.junctionStep && Ltot - s0 >= HWC.junctionStep * 0.5) { lastJ = s0; hwLog.atGrade++; continue; }
      if (s0 - RAMP > 0 && s1 + RAMP < Ltot) { elev.push([s0 - RAMP, s1 + RAMP]); hwLog.elevated += c.length; continue; }
      for (const x of c) if (net.edges[x.e].alive && net.edges[x.e].type !== 2) { net.removeEdge(x.e); hwLog.cut++; } }
    // слить интервалы и вставить их границы в полилинию
    elev.sort((a, b) => a[0] - b[0]); const EV: [number, number][] = []; for (const v of elev) { const l = EV[EV.length - 1]; if (l && v[0] <= l[1] + 1) l[1] = Math.max(l[1], v[1]); else EV.push([...v] as [number, number]); }
    const at = (s: number) => { for (let i = 0; i + 1 < P.length; i++) if (s <= P[i + 1].s) { const t = (s - P[i].s) / Math.max(1e-6, P[i + 1].s - P[i].s); return { x: P[i].x + (P[i + 1].x - P[i].x) * t, z: P[i].z + (P[i + 1].z - P[i].z) * t, s }; } return P[P.length - 1]; };
    for (const [a, b] of EV) for (const s of [a, b]) { if (P.some(p => Math.abs(p.s - s) < 8)) continue; P.push(at(s)); P.sort((p, q) => p.s - q.s); }
    for (let k = 0; k + 1 < P.length; k++) { const m = (P[k].s + P[k + 1].s) / 2; const lv = EV.some(([a, b]) => m > a && m < b) ? 1 : 0;
      const snap = k === 0 || k + 2 === P.length ? 14 : 2; net.addRoad(P[k].x, P[k].z, P[k + 1].x, P[k + 1].z, 2, snap, -1, lv); }
  };
  const centerNode = (c: CityInfo) => net.findNode(c.x, c.z, c.r);
  // «ворота» города: шоссе подходит к узлу на полпути от центра в сторону цели, а не в центр
  const gateNode = (c: CityInfo, tx: number, tz: number) => { const d = Math.hypot(tx - c.x, tz - c.z) || 1; const g = net.findNode(c.x + (tx - c.x) / d * c.r * 0.55, c.z + (tz - c.z) / d * c.r * 0.55, c.r * 0.35); return g >= 0 ? g : centerNode(c); };
  // MST + extra
  const inTree = [0]; const rest = cities.slice(1).map(c => c.id); const links: [number, number][] = [];
  while (rest.length) {
    let best: any = null;
    for (const a of inTree) for (const b of rest) { const d = Math.hypot(cities[a].x - cities[b].x, cities[a].z - cities[b].z); if (!best || d < best.d) best = { a, b, d }; }
    links.push([best.a, best.b]); inTree.push(best.b); rest.splice(rest.indexOf(best.b), 1);
  }
  if (cities.length > 3) links.push([cities.length - 1, 1]);
  for (const [a, b] of links) {
    const A = cities[a], B = cities[b]; const na = gateNode(A, B.x, B.z), nb = gateNode(B, A.x, A.z);
    if (na < 0 || nb < 0) continue;
    addHighway(gpath(net.nodes[na].x, net.nodes[na].z, net.nodes[nb].x, net.nodes[nb].z), na, nb);
  }
  // outside connections (2)
  const outs: number[] = []; const nbrs: { name: string; node: number; x: number; z: number; side: number }[] = [];
  const NB_NAMES = ['Северный', 'Восточный', 'Южный', 'Западный', 'Приозёрный', 'Горный', 'Степной', 'Лесной'];
  const sideUsed = new Set<number>();
  for (let k = 0; k < neighbors; k++) {
    const c = cities[k === 0 ? 0 : Math.min(cities.length - 1, 1 + Math.floor(rnd() * (cities.length - 1)))];
    let best: any = null;
    for (let t = 0; t < 64; t++) {
      const side = t % 4; if (sideUsed.has(side) && sideUsed.size < 4) continue; const u = (t >> 2) / 16; const x = side === 0 ? 40 : side === 1 ? M - 40 : u * M, z = side === 2 ? 40 : side === 3 ? M - 40 : u * M;
      if (side < 2 && (z < 40 || z > M - 40)) continue;
      if (hAt(x, z) < 1) continue; const d = Math.hypot(x - c.x, z - c.z); if (!best || d < best.d) best = { x, z, d, side };
    }
    if (!best) continue; const cn = gateNode(c, best.x, best.z); if (cn < 0) continue;
    const p = gpath(net.nodes[cn].x, net.nodes[cn].z, best.x, best.z); if (p.length < 2) continue;
    addHighway(p, cn, -1);
    const en = net.nearestNode(best.x, best.z, 200); if (en >= 0) { net.nodes[en].outside = true; outs.push(en); sideUsed.add(best.side); nbrs.push({ name: (NB_NAMES[(best.side + k * 4 + (seed % 3)) % 8]) + ' регион', node: en, x: best.x, z: best.z, side: best.side }); }
  }
  progress?.('Связность сети...');
  { const genLog: string[] = []; const c0 = cities[0]; const mn = net.findNode(c0.x, c0.z, c0.r);
    // запрос Степана: починочные связи не должны идти вдоль шоссе и резать его многократно — ≤1 пересечение шоссе, ≤25% длины ближе 60 м к шоссе
    const hwConflict = (ax: number, az: number, bx: number, bz: number) => { const L = Math.hypot(bx - ax, bz - az); let cross = 0, near = 0; const n = Math.max(1, Math.ceil(L / 40));
      for (const e of net.edgesNear((ax + bx) / 2, (az + bz) / 2, L / 2 + 80)) { const E = net.edges[e]; if (!E.alive || E.type !== 2) continue; const A = net.nodes[E.a], B = net.nodes[E.b]; const t = segX(ax, az, bx, bz, A.x, A.z, B.x, B.z); if (t > 0.01 && t < 0.99) cross++; }
      for (let q = 0; q <= n; q++) { const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n; for (const e of net.edgesNear(x, z, 60)) { const E = net.edges[e]; if (!E.alive || E.type !== 2) continue; const A = net.nodes[E.a], B = net.nodes[E.b]; const vx = B.x - A.x, vz = B.z - A.z; const t = clamp(((x - A.x) * vx + (z - A.z) * vz) / (vx * vx + vz * vz || 1), 0, 1); if (Math.hypot(A.x + vx * t - x, A.z + vz * t - z) < 60) { near++; break; } } }
      return cross > 1 || near / (n + 1) > 0.25; };
    if (mn >= 0) repairNetwork(net, mn, (ax, az, bx, bz) => okSeg(ax, az, bx, bz, 400) && !hwConflict(ax, az, bx, bz), genLog,
      (a, b) => { const A = net.nodes[a], B = net.nodes[b]; addHighway(gpath(A.x, A.z, B.x, B.z), a, b); });
    genLog.push('классы выровнены в узлах: ' + unifyClasses(net)); genLog.push(`шоссе: развязок ${hwLog.atGrade}, под эстакадой ${hwLog.elevated}, обрывов улиц ${hwLog.cut}`); (globalThis as any).__netgenLog = genLog; }
  progress?.('Зонирование...');
  const road = new Uint8Array(N * N);
  for (const e of net.edges) { if (!e.alive) continue; const A = net.nodes[e.a], B = net.nodes[e.b]; markRoadTiles(N, road, A.x, A.z, B.x, B.z, e.type, ROAD_TYPES[e.type].w); }
  const zone = new Uint8Array(N * N), bld = new Uint16Array(N * N), kind = new Uint8Array(N * N), cityOf = new Uint8Array(N * N), style = new Uint8Array(N * N);
  const isWaterNear = (i: number, j: number, r: number) => { for (let a = -r; a <= r; a += 2) for (let b = -r; b <= r; b += 2) if (tileH(i + a, j + b) < 0) return true; return false; };
  for (const c of cities) {
    const crnd = mulberry32(seed * 31 + c.id);
    const maxL = Math.max(2, S.maxL * Math.pow(c.r / S.r, 1.2));
    const R = c.r * 1.5; const i0 = Math.max(3, Math.floor((c.x - R) / TILE)), i1 = Math.min(N - 4, Math.ceil((c.x + R) / TILE)), j0 = Math.max(3, Math.floor((c.z - R) / TILE)), j1 = Math.min(N - 4, Math.ceil((c.z + R) / TILE));
    const F = c.form!; const indW = F === 'resort' ? 0.15 : c.kind === 'industrial' ? 0.8 : 0.45; const core = F === 'grid' ? 0.16 : F === 'hilly' || F === 'river' ? 0.3 : 0.24;
    const parkT = F === 'resort' ? 0.25 : F === 'hilly' ? 0.35 : 0.45, panelT = F === 'grid' || F === 'radial' ? 0.15 : F === 'resort' ? 0.7 : 0.3, slumT = F === 'port' || F === 'industrial' ? 0.25 : F === 'resort' ? 0.6 : 0.35;
    const bh = (i: number, j: number, s2: number) => { const q = Math.sin((Math.floor(i / 4) * 127.1 + Math.floor(j / 4) * 311.7 + s2 + c.id * 17) ) * 43758.5453; return q - Math.floor(q); };
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * N + i; if (road[k] || cityOf[k]) continue;
      const x = (i + 0.5) * TILE, z = (j + 0.5) * TILE; const d = Math.hypot(x - c.x, z - c.z) / c.r; if (d > 1.45) continue;
      if (tileH(i, j) < 0.6 || tileSlope(i, j) > 0.22) continue;
      let near = 0, ave = false;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const r = road[(j + b) * N + i + a]; if (!r) continue; if (Math.abs(a) <= 1 && Math.abs(b) <= 1) { near = 1; if (r === 2) ave = true; } else if (!near) near = 2; }
      if (!near) continue;
      cityOf[k] = c.id + 1;
      const dn = nz2.fbm(x * 0.0022 + c.id * 50, z * 0.0022, 3);           // district density
      const slum = nz.fbm(x * 0.003 + 900, z * 0.003 - c.id * 40, 2);      // informal housing clusters
      const panel = nz2.fbm(x * 0.0025 - 500, z * 0.0025 + c.id * 70, 2);  // sleeping districts
      const park = nz.fbm(x * 0.004 + 1300, z * 0.004, 2);
      const ang = Math.atan2(z - c.z, x - c.x); const da = Math.abs(((ang - c.indDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const res = resource[k];
      if (park > parkT && d < 0.9) { kind[k] = K.PARK; bld[k] = 1; continue; }
      if (dn < -0.25 && d > 0.3) continue;   // wasteland / vacant lots
      let zt = Z.R, st = 0;
      const coreR = core * (0.75 + 0.6 * (nz.fbm(x * 0.004 + c.id, z * 0.004, 2) + 0.5));
      if (d < coreR) { st = 3; zt = crnd() < 0.3 + (coreR - d) * 2 ? Z.C : Z.R; }
      else if (d > 0.35 && da >= indW && da < indW + 0.14 && !ave) { kind[k] = K.PARK; bld[k] = 1; continue; } // зелёный буфер между промзоной и жильём
      else if (d > 0.35 && (da < indW || (isWaterNear(i, j, 4) && crnd() < 0.7) || (res === RES.ORE || res === RES.OIL))) zt = Z.I;
      else if (ave && bh(i, j, 5) < 0.6) zt = Z.C;
      else if (d > 0.55 && slum > slumT) st = 1;
      else if (d > 0.3 && d < 0.9 && panel > panelT) st = 2;
      if (d > 1.05 && zt === Z.R && st === 0 && F !== 'resort' && tileSlope(i, j) < 0.08 && bh(i, j, 9) < 0.55) { zone[k] = Z.I; kind[k] = K.EXTRACT; bld[k] = 1; resource[k] = resource[k] || RES.FERTILE; continue; } // поля-полосы вокруг
      zone[k] = zt; style[k] = st;
      const fill = st === 3 ? 0.95 : st === 2 ? 0.9 : st === 1 ? 0.85 : 0.15 + 0.75 * Math.pow(Math.max(0, 1.1 - d), 1.2) * (0.6 + dn * 0.8);
      if (bh(i, j, 3) * 0.6 + crnd() * 0.4 > fill) continue;
      const v = 0.75 + dn * 0.35; const fall = Math.pow(Math.max(0.03, 1 - d), 2.6) * (sizeIdx <= 2 ? 0.6 : 1);
      if (zt === Z.I) {
        if (res && res !== RES.FERTILE) { kind[k] = K.EXTRACT; bld[k] = 1 + Math.floor(crnd() * 2); }
        else if (crnd() < 0.04) { kind[k] = K.WAREHOUSE; bld[k] = 1; }
        else { kind[k] = K.IND; bld[k] = 1 + Math.floor(crnd() * 4); }
      } else if (zt === Z.C) { kind[k] = K.COM; bld[k] = Math.max(1, Math.round((st === 3 ? 2 + crnd() * 3 : 1) + maxL * 1.3 * fall * v)); }
      else {
        if (d > 0.75 && res === RES.FERTILE && c.kind === 'agri') { zone[k] = Z.I; kind[k] = K.EXTRACT; bld[k] = 1; }
        else { kind[k] = K.RES; bld[k] = st === 1 ? 1 : st === 2 ? Math.max(4, Math.round(5 + crnd() * 3 + maxL * 0.35 * fall)) : st === 3 ? 2 + Math.floor(crnd() * 4) : Math.max(1, Math.round(maxL * fall * v * (F === 'resort' ? 0.6 : 1))); }
      }
    }
    // именованные районы
    const dr = mulberry32(seed * 977 + c.id); const pk = (a: string[]) => a[Math.floor(dr() * a.length)];
    const ds: { name: string; type: string; x: number; z: number }[] = [];
    ds.push({ name: pk(['Старый город', 'Кремль', 'Посад', 'Центр', 'Торговая сторона']), type: 'core', x: c.x, z: c.z });
    ds.push({ name: pk(['Промзона', 'Заводской', 'Фабричный', 'Индустриальный']) + (c.kind === 'industrial' ? ' «' + pk(['Сталь', 'Руда', 'Нефть', 'Прогресс']) + '»' : ''), type: 'ind', x: c.x + Math.cos(c.indDir) * c.r * 0.7, z: c.z + Math.sin(c.indDir) * c.r * 0.7 });
    if (F === 'port' || F === 'river') ds.push({ name: pk(['Доки', 'Портовый', 'Набережная', 'Заречье']), type: 'docks', x: c.x + Math.cos(c.axis! - Math.PI / 2) * c.r * 0.4, z: c.z + Math.sin(c.axis! - Math.PI / 2) * c.r * 0.4 });
    const others = ['Слободка', 'Нахаловка', 'Черёмушки', 'Микрорайон ' + (1 + Math.floor(dr() * 9)), 'Сосновка', 'Рыночный', 'Вокзальный', 'Подгорный', 'Заречный', 'Новостройки', 'Лесопарк', 'Солнечный', 'Северный', 'Южный'];
    const nd = 3 + Math.floor(c.r / 900);
    for (let q = 0; q < nd; q++) { const a = dr() * Math.PI * 2, d = c.r * (0.35 + dr() * 0.6); const nm = others.splice(Math.floor(dr() * others.length), 1)[0]; ds.push({ name: nm, type: 'res', x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }); }
    c.districts = ds;
    if (c.kind === 'port') {
      let best = -1, bd = 1e18;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const k = j * N + i; if (!cityOf[k] || road[k]) continue;
        if (tileH(i + 2, j) < 0 || tileH(i - 2, j) < 0 || tileH(i, j + 2) < 0 || tileH(i, j - 2) < 0) { const d = Math.hypot((i + 0.5) * TILE - c.x, (j + 0.5) * TILE - c.z); if (d < bd) { bd = d; best = k; } }
      }
      if (best >= 0) { kind[best] = K.PORT; bld[best] = 1; zone[best] = Z.NONE; }
    }
  }
  return { seed, sizeIdx, N, heights, resource, zone, bld, kind, cityOf, road, style, cities, roads: net.serialize(), outs, nbrs };
}
export type WorldData = ReturnType<typeof genWorld>;
