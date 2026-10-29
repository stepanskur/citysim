import * as THREE from 'three';
import { GeoBuilder, hex, rng, mix } from './builder';
import { VEHICLES, BUILD, SIGNAL } from '../palette';

export type PropKind = 'streetLight' | 'busStop' | 'tramStop' | 'trafficLight' | 'bench' | 'signalLamp';
/** Центры трёх ламп светофора в координатах модели (лицо смотрит в +Z): 0 красный, 1 жёлтый, 2 зелёный. */
export const SIGNAL_LAMPS: [number, number, number][] = [0, 1, 2].map(k => [0, SIGNAL.poleH + SIGNAL.headH - 0.17 - k * SIGNAL.lampStep, SIGNAL.headD / 2 + 0.025] as [number, number, number]);
/** Мелкие объекты. Для фонаря отдельный emissive-«плафон» рисуется в lightMesh рендерера; здесь — опора. */
export function createProp(kind: PropKind, seed = 1): THREE.BufferGeometry {
  const b = new GeoBuilder(); b.ao = 0.1; b.aoHeight = 1; const r = rng(seed); const pole = hex(0x4a4f57);
  if (kind === 'streetLight') { b.cyl(0, 0, 0, 0.12, 0.08, 7, 6, pole); b.box(0, 6.9, 0.8, 0.12, 0.12, 1.6, pole); b.box(0, 6.7, 1.5, 0.5, 0.2, 0.7, hex(VEHICLES.light)); }
  if (kind === 'trafficLight') {
    // FIX_VISUALS §1: столб 3.0 м + голова 0.34×0.95×0.26 м, 3 секции с козырьками, светлая контурная пластина (читается с высоты).
    const S = SIGNAL, H = S.poleH, p = hex(S.pole);
    b.box(0, 0, 0, 0.26, 0.12, 0.26, hex(BUILD.concrete));                 // цоколь
    b.cyl(0, 0.12, 0, S.poleR * 1.15, S.poleR, H - 0.12, 8, p);              // столб
    b.box(0, H - 0.05, -0.02, S.headW + 0.16, S.headH + 0.16, 0.03, hex(S.backplate)); // контур-пластина
    b.box(0, H, 0, S.headW, S.headH, S.headD, hex(S.housing), undefined, 0.03);
    const off = hex(S.off);
    SIGNAL_LAMPS.forEach(([x, y, z], k) => {
      const lens = [S.red, S.yellow, S.green][k];
      b.box(x, y - 0.11, z - 0.01, 0.22, 0.22, 0.02, mix(off, hex(lens), 0.22)); // выключенная линза (включённую рисует signalLamp)
      b.box(x, y + 0.11, z + 0.06, 0.26, 0.03, 0.14, hex(S.visor));             // козырёк
    });
    void p;
  }
  if (kind === 'signalLamp') { // одна светящаяся линза 0.22×0.22; цвет — instanceColor, материал MeshBasic(toneMapped:false)
    b.ao = 0; b.glow = 1; b.box(0, -0.11, 0, 0.22, 0.22, 0.025, [1, 1, 1]); b.glow = 0;
  }
  if (kind === 'bench') { b.box(0, 0.4, 0, 1.8, 0.08, 0.5, hex(0x9a6a4a)); b.box(0, 0.5, -0.22, 1.8, 0.4, 0.06, hex(0x9a6a4a)); for (const x of [-0.8, 0.8]) b.box(x, 0, 0, 0.08, 0.4, 0.45, pole); }
  if (kind === 'busStop' || kind === 'tramStop') {
    const acc = hex(kind === 'busStop' ? VEHICLES.bus : VEHICLES.tram); const L = kind === 'busStop' ? 4 : 8;
    if (kind === 'tramStop') b.box(0, 0, 0, L + 2, 0.3, 2.6, hex(BUILD.concrete));
    const y0 = kind === 'tramStop' ? 0.3 : 0;
    for (const x of [-L / 2, L / 2]) b.box(x, y0, -0.6, 0.12, 2.6, 0.12, pole);
    b.box(0, y0, -0.7, L, 2.2, 0.05, hex(0x9fc8e0)); // стекло задней стенки
    b.quad([-L / 2 - 0.2, y0 + 2.7, -0.9], [L / 2 + 0.2, y0 + 2.7, -0.9], [L / 2 + 0.2, y0 + 2.55, 0.8], [-L / 2 - 0.2, y0 + 2.55, 0.8], acc);
    b.box(0, y0 + 0.45, -0.45, L * 0.6, 0.08, 0.4, hex(0x9a6a4a));
    b.cyl(L / 2 + 0.8, y0, 0.6, 0.06, 0.06, 2.6, 5, pole); b.box(L / 2 + 0.8, y0 + 2.4, 0.6, 0.6, 0.6, 0.06, acc);
    void r;
  }
  return b.build();
}
