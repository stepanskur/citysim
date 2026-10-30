/** Тема «Позднее СНГ»: панельные дома (хрущёвка 5 эт., брежневка 9, панельки 12–16), универсам, НИИ. */
import { shade, mix } from '../builder';
import { THEMES } from '../../palette';
import { Ctx, H, Limits, ThemeKind, downpipes, acUnits, roofKit, parapet, elevatorOverrun, canopy, sign, dish } from './common';

const T = THEMES.lateSng;
export const SNG_LIMITS: Partial<Record<ThemeKind, Limits>> = {
  resSmall: { w: [24, 84], d: [10.8, 12.6], floors: [4, 5], module: 3.0, dModule: 0.6, floorH: 2.8, groundH: 3.4, setback: 6 },   // хрущёвка
  resMid: { w: [24, 120], d: [12, 13.2], floors: [9, 9], module: 3.0, dModule: 0.6, floorH: 2.8, groundH: 3.6, setback: 8 },       // брежневка
  resHigh: { w: [18, 72], d: [12, 15], floors: [12, 16], module: 3.0, dModule: 0.6, floorH: 2.8, groundH: 3.8, setback: 10 },      // 12–16 эт.
  commercial: { w: [18, 48], d: [15, 30], floors: [1, 2], module: 6.0, dModule: 3, floorH: 4.2, groundH: 4.8, setback: 4 },        // универсам
  office: { w: [24, 72], d: [12, 18], floors: [5, 9], module: 3.0, dModule: 1.5, floorH: 3.3, groundH: 4.0, setback: 6 },          // НИИ / контора
};

export function buildSng(c: Ctx, kind: ThemeKind) {
  const { b, r, D } = c; const { w, d, floors, floorH, groundH, eave } = D;
  const panel = c.wall(H(r.pick(T.panels))), seamPalette = r.pick([0, 1, 2]) === 0 ? T.seams : [T.seams[5]];
  const glass = H(T.glass), frame = H(T.frame), plinthH = 0.9;
  if (kind === 'commercial') { // универсам: ленточное остекление, бетонный козырёк по периметру фасада, вывеска
    const top = floors === 1 ? groundH : groundH + floorH; b.box(0, 0, 0, w, top, d, panel, H(T.roof)); void eave;
    c.fquad(0, -w / 2 + 0.6, 0.4, w / 2 - 0.6, groundH - 1.0, 0.03, H(T.shopGlass)); for (const u of c.bays(0, D.w / D.bays)) c.fquad(0, u - 0.06, 0.4, u + 0.06, groundH - 1.0, 0.05, frame);
    if (floors > 1) c.fquad(0, -w / 2 + 0.6, groundH + 0.6, w / 2 - 0.6, top - 0.8, 0.03, H(T.shopGlass));
    canopy(c, 0, 0, groundH - 0.8, w + 1, 2.2, H(T.canopy)); sign(c, 0, 0, top - 0.2, Math.min(w * 0.7, 18), H(0xfff8ee), H(r.pick(T.sign)));
    parapet(c, top, 0.6, 0.3, H(T.parapet)); roofKit(c, top, 1, 2); downpipes(c, top, [0, 1]); acUnits(c, [1, 2], 2, 1, 2.5, 2, 6);
    return;
  }
  // ---- коробка: цоколь + панели
  b.box(0, 0, 0, w + 0.1, plinthH, d + 0.1, H(T.plinth));
  b.box(0, plinthH, 0, w, eave + floorH - plinthH, d, panel, H(T.roof));
  const top = eave + floorH; const bay = D.w / D.bays;
  // швы панелей: горизонтальные по этажам на всех фасадах, вертикальные по модулю; цвет заделки — из seams (разноцветные)
  for (const s of [0, 1, 2, 3]) { const L = c.len(s);
    for (let f = 1; f <= floors; f++) c.fquad(s, -L / 2, plinthH + f * floorH - 0.04, L / 2, plinthH + f * floorH + 0.04, 0.012, shade(panel, 0.86));
    const step = s < 2 ? bay : 3.0; const n = Math.round(L / step); for (let i = 1; i < n; i++) { const u = -L / 2 + i * L / n; c.fquad(s, u - 0.035, plinthH, u + 0.035, top - 0.1, 0.014, H(r.pick(seamPalette))); }
    c.count('panelSeams');
  }
  // ---- подъезды со стороны двора (side 1): по одному на секцию 4 модуля
  const secBays = kind === 'resSmall' ? 4 : 4; const nSec = Math.max(1, Math.round(D.bays / secBays)); const secW = w / nSec;
  const entrU: number[] = []; for (let i = 0; i < nSec; i++) entrU.push(-w / 2 + secW * (i + 0.5));
  // ---- окна: улица и двор; на оси подъезда во дворе — окна лестничной клетки на полуэтажах
  for (const s of [0, 1]) for (const u of c.bays(s, bay)) {
    const stair = s === 1 && entrU.some(e => Math.abs(e - u) < bay * 0.5);
    for (let f = 0; f < floors; f++) {
      const y = plinthH + f * floorH;
      if (stair) { if (f > 0) c.win(s, u, y - floorH * 0.5 + 0.9, 1.0, 0.9, glass, frame, 0.15); continue; }
      c.win(s, u, y + 0.85, 1.45, 1.35, glass, frame);
    }
  }
  for (const e of entrU) { // дверь, козырёк, крыльцо
    c.fbox(1, e, 0, 2.2, 0.45, 1.6, H(T.canopy)); c.fquad(1, e - 0.7, 0.45, e + 0.7, 2.6, 0.02, H(T.door)); canopy(c, 1, e, 2.85, 2.6, 1.4, H(T.canopy));
    const g = b.glow; b.glow = 1e-3; c.fquad(1, e - 0.12, 3.05, e + 0.12, 3.3, 0.03, H(0xfff2c8)); b.glow = g; c.count('entrance');
  }
  // ---- лоджии/балконы на улицу: через пролёт, начиная со 2 этажа; часть остеклена в разные цвета
  const balStep = kind === 'resSmall' ? 3 : 2;
  c.bays(0, bay).forEach((u, i) => { if (i % balStep !== 1) return; for (let f = 1; f < floors; f++) {
    const y = plinthH + f * floorH; c.fbox(0, u, y - 0.1, bay - 0.3, 0.12, 1.1, H(T.canopy));
    if (r.chance(kind === 'resSmall' ? 0.35 : 0.55)) { c.fbox(0, u, y + 0.02, bay - 0.3, floorH - 0.25, 1.1, H(r.pick(T.loggiaGlaze)), H(T.canopy)); c.count('loggiaGlazed'); }
    else { c.fbox(0, u, y + 0.02, bay - 0.3, 1.0, 0.08, mix(panel, H(0xffffff), 0.3), undefined, 1.02); c.count('balcony'); }
    if (r.chance(0.12)) { const [px, pz] = c.P(0, u + bay * 0.3, 1.2); dish(c, px, y + 1.0, pz); }
  } });
  // ---- крыша: рубероид + парапет, лифтовые надстройки (≥7 эт.), вентшахты, антенны
  parapet(c, top, 0.5, 0.25, H(T.parapet));
  if (floors >= 7) for (const e of entrU) elevatorOverrun(c, e, -d / 2 + 2.6, top, panel);
  for (const e of entrU) { c.b.box(e + 2.4, top, 0, 1.4, 1.2, 0.9, shade(panel, 0.9)); c.count('ventShaft'); }
  roofKit(c, top, 1, 0.8);
  downpipes(c, top, [0, 1], H(T.parapet), 24);
  acUnits(c, [0, 1], kind === 'office' ? 1.6 : 1, plinthH, floorH, floors, bay);
  if (kind === 'office') sign(c, 0, 0, top - 1.4, Math.min(w * 0.5, 16), H(0xfff8ee), H(r.pick(T.sign)));
  // торцы глухие с «торцевыми» швами: усиленный шов-пояс
  for (const s of [2, 3]) c.fquad(s, -d / 2, top - 0.6, d / 2, top - 0.45, 0.015, shade(panel, 0.8));
}
