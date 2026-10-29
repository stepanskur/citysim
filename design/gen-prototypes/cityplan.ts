/**
 * Прототип «реалистичного» плана города (см. GENERATION_PROPOSALS.md, П1–П6).
 * Запуск: npx tsx design/gen-prototypes/cityplan.ts [seed]  → design/gen-prototypes/out/cityplan.png
 * Полностью автономен (не импортирует src/). Слои: рельеф+река с меандрами, поле эпох,
 * радиально-кольцевая сеть с искажением, кварталы с плотностью по удалению/эпохе,
 * промзона у реки и ж/д, парки-клинья, набережная, пригороды-«грибница».
 */
import { writeFileSync } from 'fs';
import { encodePNG } from './png';

const N = 512, seed = Number(process.argv[2] ?? 48213);
let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
// value-noise
const P = Array.from({ length: 256 }, () => rnd());
const h2 = (x: number, y: number) => P[(x * 73 + y * 151 + (x ^ y) * 31 & 255 + 256) & 255];
function vn(x: number, y: number) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
const fbm = (x: number, y: number, o = 4) => { let t = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { t += a * vn(x * f, y * f); a *= .5; f *= 2; } return t; };

const C = { x: N * .48, y: N * .52 };
// --- река: синусоида с меандрами и затухающим шумом
const riverY = (x: number) => C.y + 38 + Math.sin(x * .018 + seed) * 34 + Math.sin(x * .047) * 12 + (fbm(x * .02, 3) - .5) * 30;
const riverW = (x: number) => 7 + x / N * 7;
// --- ж/д: прямая, касающаяся центра с юга-востока, с вокзалом на 2-м кольце
const railAng = -0.35, railOff = 70;
const railDist = (x: number, y: number) => Math.abs((x - C.x) * Math.sin(railAng) - (y - C.y) * Math.cos(railAng) - railOff);

const img = new Uint8Array(N * N * 3);
const put = (x: number, y: number, c: number[]) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= N || y >= N) return; const i = (y * N + x) * 3; img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; };
const hexc = (h: number) => [h >> 16 & 255, h >> 8 & 255, h & 255];
const PAL = { grass: hexc(0x8fbd5e), grass2: hexc(0x7fae54), forest: hexc(0x5d8f4a), water: hexc(0x5fb3c9), quay: hexc(0xd9cdb8), road: hexc(0xfff8ee), arterial: hexc(0xffe2b0), rail: hexc(0x4a4560),
  old: hexc(0xe08a64), mid: hexc(0xe9b77a), panel: hexc(0xb9b3cf), modern: hexc(0x8fc9d6), ind: hexc(0xa98e84), park: hexc(0x6fbf73), sub: hexc(0xf3d9b0), field: hexc(0xd8d08a) };

// поле эпох: 0 = исторический центр … 1 = новостройки; вдоль реки и ж/д росло быстрее
const epoch = (x: number, y: number) => { const d = Math.hypot(x - C.x, (y - C.y) * 1.15) / (N * .5); return Math.min(1, d * 1.25 + (fbm(x * .02, y * .02) - .5) * .35 - (railDist(x, y) < 30 ? .12 : 0)); };

// --- 1. фон
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const f = fbm(x * .012, y * .012); put(x, y, f > .62 ? PAL.forest : f > .48 ? PAL.grass2 : PAL.grass); }
// --- 2. сеть: радиусы и кольца с шумовым изгибом
const roads: { pts: [number, number][]; w: number; c: number[] }[] = [];
const rings = [34, 72, 120, 175];
rings.forEach((R, i) => { const pts: [number, number][] = []; for (let a = 0; a <= 6.30; a += .03) { const r = R * (1 + (fbm(Math.cos(a) * 2 + i, Math.sin(a) * 2) - .5) * .25); pts.push([C.x + Math.cos(a) * r, C.y + Math.sin(a) * r * .88]); } roads.push({ pts, w: i === 0 ? 2 : 3, c: i % 2 ? PAL.arterial : PAL.road }); });
const nRad = 7 + (seed % 3);
for (let k = 0; k < nRad; k++) { const a0 = k / nRad * 6.283 + rnd() * .3; const pts: [number, number][] = []; let a = a0;
  for (let r = 8; r < N * .62; r += 4) { a += (fbm(r * .02, k * 3) - .5) * .05; pts.push([C.x + Math.cos(a) * r, C.y + Math.sin(a) * r * .9]); } roads.push({ pts, w: 3, c: PAL.arterial }); }

// --- 3. кварталы: местная сетка, повёрнутая по ближайшему радиусу; шаг по эпохе
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dy = y - riverY(x); if (Math.abs(dy) < riverW(x)) { put(x, y, PAL.water); continue; }
  if (Math.abs(dy) < riverW(x) + 3) { const d = Math.hypot(x - C.x, y - C.y); if (d < 190) { put(x, y, PAL.quay); continue; } }
  const d = Math.hypot(x - C.x, (y - C.y) * 1.12), e = epoch(x, y);
  const edge = 170 + (fbm(x * .01 + 9, y * .01) - .5) * 120;
  if (d > edge + 40) { if (fbm(x * .03 + 5, y * .03) > .58 && d < edge + 110) put(x, y, PAL.field); continue; }
  const ang = Math.atan2(y - C.y, x - C.x), step = e < .25 ? 7 : e < .55 ? 11 : e < .8 ? 15 : 9;
  const rot = Math.round(ang / (6.283 / nRad)) * (6.283 / nRad);
  const u = (x - C.x) * Math.cos(rot) + (y - C.y) * Math.sin(rot), v = -(x - C.x) * Math.sin(rot) + (y - C.y) * Math.cos(rot);
  const jitter = e < .25 ? (fbm(x * .08, y * .08) - .5) * 4 : 0; // кривые улочки старого города
  const su = ((u + jitter) % step + step) % step, sv = ((v - jitter) % (step * (e > .55 && e < .8 ? 1.6 : 1.25)) + 99 * step) % (step * (e > .55 && e < .8 ? 1.6 : 1.25));
  if (d > edge) { // пригород — редкие улицы-«грибница»
    if (su < 1 && fbm(x * .05, y * .05) > .45) put(x, y, PAL.road); else if (fbm(x * .25, y * .25) > .6) put(x, y, PAL.sub); continue; }
  if (su < 1.2 || sv < 1.2) { put(x, y, PAL.road); continue; }
  // зонирование
  const nearWater = Math.abs(dy) < riverW(x) + 26, nearRail = railDist(x, y) < 18;
  const parkF = fbm(x * .018 + 40, y * .018), wedge = Math.abs(Math.sin((ang - .4) * nRad / 2)) < .10 && d > 60;
  let c = e < .25 ? PAL.old : e < .55 ? PAL.mid : e < .8 ? PAL.panel : PAL.modern;
  if (((nearWater && Math.sign(dy) > 0) || nearRail) && e > .35 && Math.cos(ang - .9) > 0) c = PAL.ind;
  else if (parkF > .66 || wedge || (nearWater && e > .2 && Math.abs(dy) < riverW(x) + 9)) c = PAL.park;
  // разрежение к краю: дворы
  if (c !== PAL.ind && c !== PAL.park && e > .55 && su > 3 && sv > 3 && su < step - 3) c = PAL.grass2;
  put(x, y, c);
}
// --- 4. дороги поверх, мосты
const line = (a: [number, number], b: [number, number], w: number, c: number[]) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])); for (let i = 0; i <= n; i++) { const t = i / (n || 1), x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; for (let ox = -w / 2; ox <= w / 2; ox++) for (let oy = -w / 2; oy <= w / 2; oy++) put(x + ox, y + oy, c); } };
for (const r of roads) for (let i = 1; i < r.pts.length; i++) line(r.pts[i - 1], r.pts[i], r.w, r.c);
// ж/д
for (let t = -400; t < 400; t++) { const x = C.x + Math.cos(railAng) * t - Math.sin(railAng) * -railOff, y = C.y + Math.sin(railAng) * t + Math.cos(railAng) * -railOff; line([x, y], [x + 1, y], 2, PAL.rail); }
// главная площадь
for (let y = -8; y <= 8; y++) for (let x = -10; x <= 10; x++) put(C.x + x, C.y + y, PAL.quay);
writeFileSync(new URL('./out/cityplan.png', import.meta.url), encodePNG(N, N, img));
console.log('cityplan.png', seed);
