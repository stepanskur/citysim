/** Тема «Российская классика»: особняки, доходные дома 2–5 эт., торговые дома; кирпич/штукатурка, наличники, эркеры, арки, башенки. */
import { shade, RGB } from '../builder';
import { THEMES } from '../../palette';
import { Ctx, H, Limits, ThemeKind, downpipes, acUnits, roofKit, canopy, sign, fireEscape, lightWell, RULES } from './common';

const T = THEMES.russianClassic;
export const CLASSIC_LIMITS: Partial<Record<ThemeKind, Limits>> = {
  resSmall: { w: [9.6, 22.4], d: [9, 14], floors: [2, 3], module: 3.2, dModule: 1, floorH: 3.6, groundH: 4.0, setback: 0 },     // особняк
  resMid: { w: [16, 64], d: [12, 24], floors: [4, 5], module: 3.2, dModule: 1, floorH: 3.5, groundH: 4.2, setback: 0 },        // доходный дом
  commercial: { w: [12.8, 48], d: [12, 24], floors: [2, 4], module: 3.2, dModule: 1, floorH: 3.8, groundH: 4.8, setback: 0 }, // торговый дом с витринами
  office: { w: [16, 48], d: [12, 20], floors: [3, 5], module: 3.2, dModule: 1, floorH: 3.8, groundH: 4.4, setback: 0 },       // контора/банк
};

export function buildClassic(c: Ctx, kind: ThemeKind) {
  const { b, r, D } = c; const { w, d, floors, floorH, groundH, eave } = D;
  const wall = c.wall(H(r.pick(T.walls))), trim = H(T.trim), roofC = H(r.pick(T.roofs)), glass = H(T.glass), plinth = H(T.plinth);
  const top = eave + floorH; const bay = w / D.bays; const shop = kind === 'commercial';
  b.box(0, 0, 0, w + 0.12, 1.0, d + 0.12, plinth);                     // цоколь (руст)
  b.box(0, 1.0, 0, w, top - 1.0, d, wall);
  for (const s of [0, 1, 2, 3]) c.fquad(s, -c.len(s) / 2, 0.45, c.len(s) / 2, 0.5, 0.065, shade(plinth, 0.8));
  b.band(0, groundH - 0.15, 0, w, d, 0.3, 0.12, trim);                  // межэтажный пояс
  b.band(0, top - 0.25, 0, w, d, 0.25, 0.18, trim); b.band(0, top, 0, w, d, 0.25, 0.42, trim); // карниз в 2 ступени
  for (const s of [0, 2, 3]) for (const u of [-c.len(s) / 2 + 0.35, c.len(s) / 2 - 0.35]) c.fbox(s, u, 1.0, 0.7, top - 1.0, 0.08, trim); // лопатки по углам
  // ---- арка во двор (w ≥ 19.2) — ворота; положение на 1/3 фасада по seed
  const archU = w >= 19.2 ? (r.chance(0.5) ? -1 : 1) * Math.round(w / 3 / bay) * bay * 0.5 : null;
  if (archU !== null) { c.fquad(0, archU - 1.7, 0, archU + 1.7, 3.6, 0.03, shade(wall, 0.35)); arch(c, 0, archU, 3.6, 1.7, shade(wall, 0.35), 0.03);
    for (let i = -3; i <= 3; i++) c.fbox(0, archU + i * 0.5, 0, 0.05, 3.2, 0.05, H(T.gate), undefined, 0.05); c.fbox(0, archU, 3.0, 3.4, 0.08, 0.06, H(T.gate), undefined, 0.05); c.count('archGate'); }
  // ---- эркер по центру (w ≥ 16): со 2‑го этажа до предпоследнего
  const bayWin = w >= 16 && floors >= 3 && r.chance(0.75);
  if (bayWin) { c.fbox(0, 0, groundH, bay * 1.6, (floors - 2) * floorH, 1.0, wall, trim); c.fbox(0, 0, groundH - 0.3, bay * 1.6 + 0.3, 0.3, 1.2, trim); c.count('oriel'); }
  // ---- окна: наличники с сандриками; первый этаж — арочные или витрины
  for (const s of [0, 1, 2, 3]) { const front = s === 0, L = c.len(s); if (!front && s !== 1 && L < 10) continue;
    for (const u of c.bays(s, bay)) { if (front && archU !== null && Math.abs(u - archU) < bay * 0.9) continue;
      for (let f = 0; f < floors; f++) { const y = f === 0 ? 1.1 : groundH + (f - 1) * floorH; const wh = f === 0 ? groundH - 2.0 : floorH * 0.58; const ww = 1.25;
        const o = front && bayWin && Math.abs(u) < bay * 0.9 && f > 0 && f < floors - 1 ? 1.0 : 0;
        if (f === 0 && shop && front) { c.fquad(s, u - bay * 0.4, 0.9, u + bay * 0.4, groundH - 0.5, 0.03 + o, H(0x3a4a5a)); const g = b.glow; b.glow = r.chance(0.6) ? 0.05 : 0; c.fquad(s, u - bay * 0.36, 1.0, u + bay * 0.36, groundH - 0.6, 0.05 + o, glass); b.glow = g; continue; }
        if (o) { const [x, z] = c.P(s, u, o); b.windowAt(x, y + 0.3, z, ww, wh, s, glass, trim, c.o.lit ?? 0.5, r); continue; }
        c.win(s, u, y + 0.3, ww, wh, glass, trim);
        if (front || s === 1) { c.fbox(s, u, y + 0.3 + wh + 0.18, ww + 0.6, 0.18, 0.16, trim); // сандрик
          if (f === 1 && front) c.fbox(s, u, y + 0.3 + wh + 0.36, ww + 0.2, 0.25, 0.1, trim); // фронтончик над бельэтажем
          if (f === 0 && !shop) arch(c, s, u, y + 0.3 + wh, ww / 2, glass, 0.06); }
      } } }
  // ---- вход(ы): число растёт с длиной; козырёк на кронштейнах
  const nEnt = Math.max(1, Math.round(w / 16)); for (let i = 0; i < nEnt; i++) { let u = -w / 2 + (w / nEnt) * (i + 0.5); if (archU !== null && Math.abs(u - archU) < 2.5) u += bay; if (bayWin && Math.abs(u) < bay) u += bay * 1.2;
    c.fquad(0, u - 0.75, 0.3, u + 0.75, 3.0, 0.04, H(T.door)); c.fbox(0, u, 0, 2.2, 0.3, 0.8, plinth); canopy(c, 0, u, 3.2, 2.4, 1.1, H(T.gate)); c.count('entrance'); }
  if (shop) { const n = w >= RULES.sign.minWidth ? 2 : 1; for (let i = 0; i < n; i++) sign(c, 0, (i - (n - 1) / 2) * w / 2, groundH - 0.4, Math.min(8, w / n - 2), H(T.trim), H(0x2b4a3a)); }
  // ---- кровля: малые — вальма с дормерами; большие (d ≥ 18) — плоская фальцевая с наклонной полосой и световым колодцем
  if (d >= RULES.lightWell.minDepth && w >= RULES.lightWell.minWidth) {
    b.box(0, top + 0.25, 0, w + 0.2, 0.3, d + 0.2, roofC, roofC); lightWell(c, top + 0.56, w * 0.35, d * 0.3, wall); roofKit(c, top + 0.55, 1.5, 0.6);
    for (let i = 0; i < Math.max(2, Math.round(w / 12)); i++) { const x = -w / 2 + (w / Math.max(2, Math.round(w / 12))) * (i + 0.5); b.box(x, top + 0.55, -d / 2 + 2, 0.9, 1.6, 0.9, shade(wall, 0.85), trim); c.count('chimney'); }
  } else {
    const rh = Math.min(4, d * 0.32); b.hip(0, top + 0.25, 0, w + 0.3, d + 0.3, rh, roofC, 0.25);
    if (floors <= 4) for (const u of c.bays(0, bay * 2)) { if (Math.abs(u) > w / 2 - 2) continue; b.dormer(u, top + 0.3, d / 2 - 1.4, wall, roofC, glass); c.count('dormer'); }
    for (let i = 0; i < Math.max(1, Math.round(w / 10)); i++) { b.box(-w / 2 + 2 + i * 10, top + rh * 0.4, 0, 0.8, rh * 0.6 + 1.2, 0.8, shade(wall, 0.85), trim); c.count('chimney'); }
    if (floors >= 3 && r.chance(0.4)) { const [x, z] = [r.range(-w / 3, w / 3), r.range(-d / 4, 0)]; b.box(x, top + rh * 0.5, z, 0.05, 2.5, 0.05, H(0x6a7080)); c.count('antenna'); }
  }
  // ---- угловая башенка (w ≥ 16, seed): цилиндр с куполом над правым углом
  if (w >= 16 && r.chance(0.45)) { const x = w / 2 - 1.8, z = d / 2 - 1.8; b.cyl(x, top, z, 2.0, 2.0, floorH * 0.9, 12, wall); b.band(x, top + floorH * 0.9 - 0.2, z, 4, 4, 0.2, 0.15, trim);
    b.cyl(x, top + floorH * 0.9, z, 2.2, 0, 3.2, 12, H(T.dome)); b.cyl(x, top + floorH * 0.9 + 3.2, z, 0.06, 0.06, 1.2, 4, H(0xd4a84a)); c.count('cornerTurret'); }
  downpipes(c, top, [0, 1], shade(roofC, 1.1), 10);
  acUnits(c, [1], 1.2, groundH, floorH, floors, bay); acUnits(c, [0], 0.25, groundH, floorH, floors, bay);
  if (floors >= RULES.fireEscape.minFloors && d >= RULES.fireEscape.minDepth) fireEscape(c, 2, 0, groundH, floorH, floors);
}
/** Полукруглая «арка» над окном/проёмом: веер из 6 треугольников на фасаде. */
function arch(c: Ctx, side: number, u: number, y: number, rad: number, col: RGB, o: number) {
  const N = 6; for (let i = 0; i < N; i++) { const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
    const p = (a: number): [number, number, number] => { const [x, z] = c.P(side, u + Math.cos(a) * rad, o); return [x, y + Math.sin(a) * rad, z]; }; const [cx, cz] = c.P(side, u, o);
    c.b.tri([cx, y, cz], p(a0), p(a1), col); }
}
