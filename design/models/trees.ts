import * as THREE from 'three';
import { GeoBuilder, hex, rng, shade, mix, Rng } from './builder';
import { TREES, SEASONS } from '../palette';

export type TreeKind = 'conifer' | 'pine' | 'deciduous' | 'birch' | 'bush' | 'poplar' | 'oak';
export type Season = keyof typeof SEASONS;
export interface TreeOpts { seed?: number; height?: number; season?: Season; }

function conifer(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const needle = hex(SEASONS[s].needle); b.cyl(0, 0, 0, 0.25, 0.18, h * 0.25, 5, hex(TREES.trunk));
  const tiers = 3; let y = h * 0.18, rad = h * 0.26;
  for (let i = 0; i < tiers; i++) { const th = h * 0.42 - i * h * 0.06; b.cyl(0, y, 0, rad, 0, th, 6, shade(needle, 0.9 + i * 0.08 + r.range(-0.04, 0.04)), undefined, r.range(0, 1)); y += th * 0.48; rad *= 0.74; }
  if (s === 'winter') b.cyl(0, y + h * 0.05, 0, rad * 0.9, 0, h * 0.18, 6, hex(0xf4f6f8));
}
function pine(b: GeoBuilder, r: Rng, h: number, s: Season) {
  b.cyl(0, 0, 0, 0.22, 0.14, h * 0.7, 5, hex(0x9a6a4a));
  b.blob(r.range(-0.3, 0.3), h * 0.78, 0, h * 0.2, hex(SEASONS[s].needle), 0.55, r);
  b.blob(r.range(-0.8, 0.8), h * 0.66, r.range(-0.8, 0.8), h * 0.14, shade(hex(SEASONS[s].needle), 1.1), 0.55, r);
}
function deciduous(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const leaf = hex(r.pick(SEASONS[s].leaf)); b.cyl(0, 0, 0, 0.3, 0.2, h * 0.45, 5, hex(TREES.trunk));
  const n = r.int(2, 4); for (let i = 0; i < n; i++) { const a = r.range(0, 6.28), d = i === 0 ? 0 : h * 0.15;
    b.blob(Math.cos(a) * d, h * (0.62 + r.range(-0.05, 0.08)), Math.sin(a) * d, h * (i === 0 ? 0.3 : 0.2), shade(leaf, r.range(0.9, 1.1)), 0.85, r); }
}
function birch(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const leaf = mix(hex(r.pick(SEASONS[s].leaf)), hex(0xd8e870), 0.25); b.cyl(0, 0, 0, 0.18, 0.1, h * 0.85, 5, hex(TREES.trunkBirch));
  b.blob(0, h * 0.68, 0, h * 0.2, leaf, 1.5, r);
}
function bush(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const leaf = hex(r.pick(SEASONS[s].leaf)); b.blob(0, h * 0.45, 0, h * 0.6, shade(leaf, 0.85), 0.75, r); b.blob(h * 0.4, h * 0.35, h * 0.2, h * 0.4, leaf, 0.75, r);
}
function poplar(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const leaf = hex(r.pick(SEASONS[s].leaf)); b.cyl(0, 0, 0, 0.22, 0.15, h * 0.3, 5, hex(TREES.trunk));
  for (let i = 0; i < 3; i++) b.blob(0, h * (0.38 + i * 0.2), 0, h * (0.17 - i * 0.03), shade(leaf, 0.92 + i * 0.06), 1.5, r);
}
/** Многоярусный дуб: ствол с ветвями + 5–7 крон, ярусами. */
function oak(b: GeoBuilder, r: Rng, h: number, s: Season) {
  const leaf = hex(r.pick(SEASONS[s].leaf)); const t = hex(TREES.trunk); b.cyl(0, 0, 0, 0.45, 0.3, h * 0.42, 6, t);
  const n = r.int(5, 7); for (let i = 0; i < n; i++) { const a = (i / n) * 6.28 + r.range(-0.3, 0.3), d = h * r.range(0.18, 0.26), y = h * r.range(0.5, 0.66);
    b.cyl(Math.cos(a) * d * 0.4, h * 0.38, Math.sin(a) * d * 0.4, 0.14, 0.08, y - h * 0.38, 4, t);
    b.blob(Math.cos(a) * d, y, Math.sin(a) * d, h * r.range(0.16, 0.21), shade(leaf, r.range(0.88, 1.04)), 0.8, r); }
  b.blob(0, h * 0.78, 0, h * 0.24, shade(leaf, 1.08), 0.75, r);
}
const IMPL = { conifer, pine, deciduous, birch, bush, poplar, oak };
const H: Record<TreeKind, [number, number]> = { conifer: [8, 16], pine: [10, 18], deciduous: [7, 13], birch: [9, 15], bush: [1, 2], poplar: [12, 20], oak: [9, 14] };
export const TREE_KINDS = Object.keys(IMPL) as TreeKind[];

/** Дерево; лучше генерировать 3–4 варианта на тип и масштабировать instanceMatrix (±20%) + случайный поворот. */
export function createTree(kind: TreeKind, opts: TreeOpts = {}): THREE.BufferGeometry {
  const r = rng(opts.seed ?? 1); const h = opts.height ?? r.range(H[kind][0], H[kind][1]);
  const b = new GeoBuilder(); b.ao = 0.2; b.aoHeight = h * 0.4; IMPL[kind](b, r, h, opts.season ?? 'summer'); return b.build();
}
