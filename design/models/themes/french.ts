/** Тема «Париж (Осман)»: 5–7 эт., кремовый известняк, кованые балконы на 2 и 5 эт., цинковая мансарда с люкарнами, блоки дымоходов, лавки/кафе с маркизами. */
import { shade, RGB } from '../builder';
import { THEMES } from '../../palette';
import { Ctx, H, Limits, ThemeKind, downpipes, acUnits, canopy, sign, lightWell, RULES } from './common';

const T = THEMES.french;
export const FRENCH_LIMITS: Partial<Record<ThemeKind, Limits>> = {
  resSmall: { w: [7.5, 18], d: [9, 14], floors: [3, 4], module: 2.5, dModule: 1, floorH: 3.1, groundH: 4.2, setback: 0 },   // maison de ville
  resMid: { w: [12.5, 45], d: [12, 24], floors: [5, 7], module: 2.5, dModule: 1, floorH: 3.0, groundH: 4.5, setback: 0 },   // immeuble haussmannien
  commercial: { w: [12.5, 45], d: [12, 24], floors: [5, 6], module: 2.5, dModule: 1, floorH: 3.0, groundH: 4.8, setback: 0 }, // то же + кафе/лавки по всему фронту
  office: { w: [15, 50], d: [14, 24], floors: [5, 7], module: 2.5, dModule: 1, floorH: 3.3, groundH: 4.8, setback: 0 },
};

export function buildFrench(c: Ctx, kind: ThemeKind) {
  const { b, r, D } = c; const { w, d, floors, floorH, groundH, eave } = D;
  const stone = c.wall(H(r.pick(T.stone))), zinc = H(T.zinc), iron = H(T.iron), glass = H(T.glass), cream = shade(stone, 1.06);
  const stoneTop = eave + floorH - (floors >= 6 ? floorH : 0); // верхний этаж при 6–7 эт. уходит в мансарду
  const stoneFloors = floors >= 6 ? floors - 1 : floors;
  const bay = w / D.bays;
  b.box(0, 0, 0, w, stoneTop, d, stone);
  // руст первого этажа — горизонтальные швы
  for (const s of [0, 1]) for (let k = 1; k < 6; k++) c.fquad(s, -w / 2, k * groundH / 6 - 0.03, w / 2, k * groundH / 6 + 0.03, 0.015, shade(stone, 0.88));
  b.band(0, groundH - 0.1, 0, w, d, 0.35, 0.12, cream);
  // лавки: каждый 2-й пролёт (commercial — все), маркизы
  const shops = c.bays(0, bay); let door = Math.floor(shops.length / 2);
  shops.forEach((u, i) => { if (i === door) { c.fquad(0, u - 0.8, 0, u + 0.8, groundH - 0.6, 0.03, H(0x2b3f4a)); arch(c, 0, u, groundH - 0.6, 0.8, H(0x2b3f4a), 0.03); c.count('entrance'); return; }
    const isShop = kind === 'commercial' || kind === 'office' ? true : i % 2 === 0 || r.chance(0.3);
    if (!isShop) { c.win(0, u, 1.0, 1.1, groundH - 1.8, glass, cream); return; }
    const sc = H(r.pick(T.shop)); c.fquad(0, u - bay * 0.45, 0, u + bay * 0.45, groundH - 0.4, 0.04, sc); const g = b.glow; b.glow = r.chance(0.7) ? 0.08 : 0; c.fquad(0, u - bay * 0.38, 0.5, u + bay * 0.38, groundH - 1.1, 0.06, glass); b.glow = g;
    if (r.chance(0.7)) { const aw = H(r.pick(T.awnings)); const [ax, az] = c.P(0, u - bay * 0.45, 0.05), [bx, bz] = c.P(0, u + bay * 0.45, 0.05), [cx2, cz2] = c.P(0, u + bay * 0.45, 1.6), [dx, dz] = c.P(0, u - bay * 0.45, 1.6);
      b.quad([ax, groundH - 0.7, az], [bx, groundH - 0.7, bz], [cx2, groundH - 1.5, cz2], [dx, groundH - 1.5, dz], aw); b.quad([dx, groundH - 1.5, dz], [cx2, groundH - 1.5, cz2], [cx2, groundH - 1.8, cz2], [dx, groundH - 1.8, dz], shade(aw, 0.85)); c.count('awning'); }
    c.count('shop'); });
  if (kind === 'commercial' || w >= RULES.sign.minWidth) sign(c, 0, shops[door > 0 ? door - 1 : 0], groundH - 0.55, bay * 0.8, H(0xfff8ee), iron);
  void door; door = 0;
  // этажи: французские окна в пол, балконетки; сплошные балконы на 2‑м и 5‑м этажах
  for (let f = 1; f < stoneFloors; f++) { const y = groundH + (f - 1) * floorH; const full = f === 1 || f === 4; const wh = floorH * (f === 1 ? 0.72 : 0.66);
    for (const s of [0, 1]) for (const u of c.bays(s, bay)) { c.win(s, u, y + 0.15, 1.1, wh, glass, cream); if (s === 0) { c.fbox(0, u, y + 0.15 + wh + 0.12, 1.5, 0.22, 0.12, cream); if (!full) { c.fbox(0, u, y + 0.15, 1.3, 0.9, 0.04, iron, undefined, 0.25); c.count('balconette'); } } }
    if (full) { c.fbox(0, 0, y - 0.05, w, 0.18, 1.0, cream); c.fbox(0, 0, y + 0.13, w, 0.07, 0.05, iron, undefined, 0.95); c.fbox(0, 0, y + 0.95, w, 0.06, 0.06, iron, undefined, 0.94);
      for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) c.fbox(0, x, y + 0.13, 0.03, 0.82, 0.03, iron, undefined, 0.96); c.count('balconyContinuous'); }
    for (const s of [2, 3]) if (r.chance(0.3)) c.win(s, 0, y + 0.15, 1.0, wh, glass, cream, 0.3);
  }
  // карниз
  b.band(0, stoneTop - 0.2, 0, w, d, 0.25, 0.2, cream); b.band(0, stoneTop + 0.05, 0, w, d, 0.15, 0.45, cream);
  // мансарда: крутой нижний скат 72° до +3.2 м, пологий верх; люкарны в каждом пролёте
  const mh = 3.2, ins = mh / Math.tan(72 * Math.PI / 180), y0 = stoneTop + 0.2, y1 = y0 + mh, top = y1 + 1.4;
  const x0 = w / 2, z0 = d / 2, x1 = w / 2 - ins, z1 = d / 2 - ins, x2 = 0.4 * w / 2, z2 = Math.max(0.5, d / 2 - ins - 3);
  const Q = (a: number[], b2: number[], c2: number[], d2: number[], col: RGB) => b.quad(a as any, b2 as any, c2 as any, d2 as any, col);
  Q([-x0, y0, z0], [x0, y0, z0], [x1, y1, z1], [-x1, y1, z1], zinc); Q([x0, y0, -z0], [-x0, y0, -z0], [-x1, y1, -z1], [x1, y1, -z1], zinc);
  Q([x0, y0, z0], [x0, y0, -z0], [x1, y1, -z1], [x1, y1, z1], shade(zinc, 0.92)); Q([-x0, y0, -z0], [-x0, y0, z0], [-x1, y1, z1], [-x1, y1, -z1], shade(zinc, 0.92));
  Q([-x1, y1, z1], [x1, y1, z1], [x2, top, z2], [-x2, top, z2], H(T.zincDark)); Q([x1, y1, -z1], [-x1, y1, -z1], [-x2, top, -z2], [x2, top, -z2], H(T.zincDark));
  Q([x1, y1, z1], [x1, y1, -z1], [x2, top, -z2], [x2, top, z2], H(T.zincDark)); Q([-x1, y1, -z1], [-x1, y1, z1], [-x2, top, z2], [-x2, top, -z2], H(T.zincDark));
  Q([-x2, top, z2], [x2, top, z2], [x2, top, -z2], [-x2, top, -z2], H(T.zincDark));
  for (const s of [0, 1]) for (const u of c.bays(s, bay)) { const [x, z] = c.P(s, u, -ins * 0.6); const zz = s === 0 ? z : z; // люкарна
    b.box(x, y0 + 0.4, zz, 1.3, 2.0, 0.9, cream, zinc); b.gable(x, y0 + 2.4, zz, 1.3, 0.9, 0.5, zinc, cream, 0.08, 0.06);
    const [wx, wz] = c.P(s, u, -ins * 0.6 + 0.45); b.windowAt(wx, y0 + 0.6, wz, 0.8, 1.4, s, glass, cream, c.o.lit ?? 0.5, r); c.count('dormer'); }
  // блоки дымоходов на брандмауэрах (торцы); число растёт с глубиной и шириной
  const nStacks = 2 + Math.floor(w / 15); for (let i = 0; i < nStacks; i++) { const x = i < 2 ? (i ? 1 : -1) * (w / 2 - 0.6) : -w / 2 + w * (i - 1) / (nStacks - 1); const L = Math.min(d * 0.5, 4.5);
    b.box(x, top - 0.6, 0, 1.0, 1.8, L, H(T.chimney), shade(H(T.chimney), 1.1)); for (let k = 0; k < Math.round(L / 0.6); k++) b.cyl(x, top + 1.2, -L / 2 + 0.3 + k * 0.6, 0.12, 0.1, 0.45, 5, H(T.pot)); c.count('chimneyStack'); }
  if (d >= RULES.lightWell.minDepth && w >= 20) lightWell(c, top + 0.02, w * 0.25, 2.4, stone);
  downpipes(c, stoneTop, [0, 1], zinc, 15);
  acUnits(c, [1], 1.0, groundH, floorH, stoneFloors, bay); // на улицу во Франции — запрещены, только двор
  if (kind === 'office') canopy(c, 0, shops[Math.floor(shops.length / 2)], groundH - 0.5, 3, 1.2, iron);
}
function arch(c: Ctx, side: number, u: number, y: number, rad: number, col: RGB, o: number) {
  const N = 6; for (let i = 0; i < N; i++) { const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
    const p = (a: number): [number, number, number] => { const [x, z] = c.P(side, u + Math.cos(a) * rad, o); return [x, y + Math.sin(a) * rad, z]; }; const [cx, cz] = c.P(side, u, o);
    c.b.tri([cx, y, cz], p(a0), p(a1), col); }
}
