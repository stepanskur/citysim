// Дизайн-токены CitySim v2 — фирменный стиль «Пастила».
// Источник истины; palette.json генерируется скриптом (см. README).

/** Фирменные акценты — появляются на КАЖДОМ классе объектов (крыши, маркизы, транспорт, UI). */
export const BRAND = {
  sugar: 0xfff8ee,     // «сахарный» белый: карнизы, рамы, фризы — объединяет все здания
  teal: 0x1fa39a,      // бирюза: медные крыши, вывески, трамвай-акцент, UI-акцент мира
  coral: 0xff7a59,     // коралл: маркизы, автобусы, предупреждения
  saffron: 0xffc145,   // шафран: окна ночью, такси, ворота промзоны
  ink: 0x2b2f45,       // чернильный: стекло днём, шины, тёмные детали (вместо чёрного)
  lavender: 0x8f86b8,  // цвет теней и земли полусферы
};

export const WORLD = {
  day:   { zenith: 0x7fbaf5, horizon: 0xffe2c8, fog: 0xf3dccb, sun: 0xffeccc, sunI: 3.1, hemiSky: 0xc4dcff, hemiGround: 0x8a7fb0, hemiI: 0.85, exposure: 1.0, shadowTint: 0x6f6aa0 },
  dawn:  { zenith: 0x9fb2e6, horizon: 0xffcfb8, fog: 0xf0c9c0, sun: 0xffb98a, sunI: 1.7, hemiSky: 0xd8d4f2, hemiGround: 0x8a7aa0, hemiI: 1.0, exposure: 1.02, shadowTint: 0x6a5a98 },
  dusk:  { zenith: 0x5f6fb8, horizon: 0xff9f70, fog: 0xf0a888, sun: 0xff8a4c, sunI: 1.9, hemiSky: 0xffb8a0, hemiGround: 0x5a4a78, hemiI: 0.9, exposure: 1.08, shadowTint: 0x4a3a80 },
  night: { zenith: 0x0b1030, horizon: 0x2a2f68, fog: 0x1c2250, sun: 0x9fb0ff, sunI: 0.35, hemiSky: 0x3c4a90, hemiGround: 0x1a1430, hemiI: 0.6, exposure: 1.2, shadowTint: 0x101040 },
};
export const TERRAIN = {
  grass: 0x8fbd5e, grassDry: 0xc8c47a, meadow: 0xb2d27a, forestFloor: 0x6f9a55, sand: 0xf2deae, rock: 0xa89f98, snow: 0xf6f4fa,
  waterShallow: 0x7fd6d0, waterDeep: 0x3a7fc0, waterFoam: 0xf4fbff, field1: 0xe6cd78, field2: 0xb0c860, field3: 0xd8a86a,
};
export const SEASONS = {
  summer: { grass: 0x9cc76a, leaf: [0x6fb25a, 0x8cc461, 0x5aa36a, 0xa6cf5e], needle: 0x3a7a62 },
  autumn: { grass: 0xc2b46c, leaf: [0xf0a23c, 0xe5703a, 0xf2c94c, 0xc95a4a], needle: 0x3e705c },
  winter: { grass: 0xf2f1f8, leaf: [0xb8a89a, 0xa89888, 0xc8b8a8, 0x9a8a80], needle: 0x335f55 },
  spring: { grass: 0xa8d870, leaf: [0xffc4d6, 0xa6dc78, 0xf7d6e6, 0x8ccf6a], needle: 0x3e8064 },
};
export const ROADS = { asphalt: 0x5e6273, asphaltOld: 0x737687, highway: 0x50546a, dirt: 0xc2a57a, marking: 0xfff8ee, markingYellow: 0xffc145, curb: 0xe6ddd0, sidewalk: 0xd6ccc0, rail: 0x7a6658, ballast: 0xa69a8e, tramTrack: 0x8a8a98 };
export const BUILD = {
  resWalls: [0xffe9d2, 0xffd7b8, 0xf6e6c8, 0xe8f0d8, 0xffdcd6, 0xdfeaf2, 0xf2e2f0, 0xfff1c9],
  resRoofs: [0xd2654a, 0xb5503f, 0x1fa39a, 0x5b6f8f, 0x8a5a6a, 0xe08a4a],
  midWalls: [0xf5dcc0, 0xe9e0cf, 0xd6e4e6, 0xf6cfb6, 0xe2d6ea, 0xcfe0cf],
  towerWalls: [0xf2ede6, 0xdde6ee, 0xe9e0f0, 0xd8ebe6, 0xf4e2d6],
  glass: 0x8dc3e8, glassDark: 0x2b2f45, windowWarm: 0xffc878, windowDay: 0x6f8fc0,
  comWalls: [0xfff8ee, 0xf6ead8, 0xe0ecf4, 0xffe6d0], comAccent: [0xff7a59, 0x1fa39a, 0xffc145, 0x7a6fd8, 0xe84e7a],
  indWalls: [0xd2cdc6, 0xc6c2be, 0xd8ccbc, 0xbfc6cc], indRoof: [0x8a90a0, 0x7a8090, 0x9a8f86], indAccent: 0xffc145, chimney: 0xc76a52,
  civicWalls: [0xfff8ee, 0xf6efe2], civicRoof: 0x1fa39a, civicAccent: 0xffc145,
  stationWalls: 0xf2d6b0, stationRoof: 0x1fa39a, depotWalls: 0xe0cdb4,
  trim: 0xfff8ee, door: 0x8a5a4a, concrete: 0xe0d8ce, rooftop: 0xb8b0b8, plinth: 0xb9a8a0,
};
export const VEHICLES = {
  car: [0xff7a59, 0x4f8fe8, 0xfff8ee, 0x2b2f45, 0xffc145, 0x1fa39a, 0xa8b0c0, 0x8a6fd8, 0xe84e7a],
  glass: 0x2b2f45, tire: 0x262838, light: 0xfff4d0, tail: 0xe8404a,
  truckCab: [0xff7a59, 0x4f8fe8, 0xfff8ee, 0xffc145, 0x1fa39a], truckCargo: [0xf2ede6, 0xc8d0dc, 0x8aa070, 0xe6a060],
  bus: 0xff7a59, busStripe: 0xfff8ee, tram: 0x1fa39a, tramStripe: 0xfff8ee,
  loco: 0x2f4f8a, locoStripe: 0xffc145, wagonPass: 0x2f7f7a, wagonFreight: [0xa8564a, 0x5f7088, 0x7a7a5f],
};
export const TREES = { trunk: 0x8a6248, trunkBirch: 0xf6f2ea, needle: 0x3a7a62, needle2: 0x4a8a6a, leaf: [0x6fb25a, 0x8cc461, 0x5aa36a, 0xa6cf5e] };

export const HEATMAPS = {
  landValue:  [0x2e1f5e, 0x5b4bb0, 0x2fa3b5, 0x9fe08a, 0xfff07a],
  traffic:    [0x3fc28a, 0xb6e05a, 0xffd24a, 0xff8a4c, 0xe8404a],
  pollution:  [0xfaf6ea, 0xe6d79a, 0xc0a060, 0x8a6a50, 0x4a3a3a],
  noise:      [0xf2f6ff, 0xc2d4f5, 0x8aa6ea, 0x5a6fd0, 0x2e2f8a],
  happiness:  [0xe8404a, 0xff8a4c, 0xfff0c8, 0x9fe08a, 0x2fb57a],
  coverage:   [0x2b2f45, 0x2f5f9a, 0x3fa8e0, 0x8ee0f5, 0xf0fcff],
  demandRCI:  { R: 0x3fc28a, C: 0x4f8fe8, I: 0xffc145 },
};

export const UI = {
  color: {
    bg0: '#0d1020', bg1: 'rgba(22,25,44,0.72)', bg2: 'rgba(36,40,66,0.78)', bg3: '#33385c',
    stroke: 'rgba(255,255,255,0.09)', strokeStrong: 'rgba(255,255,255,0.18)', highlight: 'rgba(255,255,255,0.14)',
    text: '#f6f3ff', textDim: '#b8b6d4', textMute: '#7c7ca0',
    accent: '#5fe0c8', accentHover: '#86ecd8', accentPress: '#36c4ab', accentInk: '#06201c',
    money: '#ffd36a', positive: '#5fe09a', negative: '#ff7a6a', warning: '#ffc145', info: '#8ab8ff',
    res: '#5fe09a', com: '#7aaaff', ind: '#ffc145', transit: '#c49aff',
    bus: '#ff7a59', tram: '#1fc7b8', rail: '#7aaaff', truck: '#b8b6d4',
  },
  radius: { xs: 6, sm: 8, md: 12, lg: 18, xl: 24, pill: 999 },
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  shadow: {
    panel: '0 1px 0 rgba(255,255,255,0.10) inset, 0 20px 50px -12px rgba(8,6,30,0.55), 0 2px 6px rgba(8,6,30,0.25)',
    pop: '0 24px 60px -10px rgba(8,6,30,0.65)',
    glow: '0 0 0 3px rgba(95,224,200,0.30)',
  },
  font: {
    family: "'Inter', 'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    display: "'Manrope', 'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Roboto Mono', ui-monospace, monospace",
    size: { xs: 11, sm: 12, md: 13, lg: 15, xl: 20, xxl: 28, hero: 64 },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700, black: 800 },
  },
  blur: 22,
  motion: { fast: '120ms', base: '200ms', slow: '360ms', ease: 'cubic-bezier(.2,.8,.2,1)', spring: 'cubic-bezier(.34,1.56,.64,1)' },
  z: { hud: 10, panel: 20, toolbar: 30, tooltip: 50, toast: 60, modal: 80 },
};


/** FIX_VISUALS §2 — покрытия земли (база для splat-смешивания, ground-material.ts). */
export const GROUND = {
  grass: 0x8fbd5e, grassDry: 0xa9c46a, meadow: 0x9cc76a, forest: 0x5f9a52, forestFloor: 0x6e8f4e,
  field: 0xd8cf8a, fieldPlowed: 0xb89a6e, sand: 0xe8d9a8, sandWet: 0xc9b98c, rock: 0x9a9088, snow: 0xf4f3f8,
  yard: 0xc9c2b4, yardGrass: 0xa6c47a, shoreSand: 0xd9cba0, foam: 0xfdfaf2, water: 0x5fb3c9, waterDeep: 0x3c86a8,
  /** Детальный шум: амплитуда яркости ±, масштабы в 1/м, дальность затухания (м). */
  detail: { amp: 0.07, scaleFine: 0.45, scaleCoarse: 0.045, ampCoarse: 0.06, fadeNear: 250, fadeFar: 1400 },
  /** Береговой переход (м по высоте относительно уровня воды). */
  shore: { wetTop: 0.9, foamLo: -0.05, foamHi: 0.35, foamSpeed: 0.6 },
  /** Сглаживание вершинных цветов (проходы 3×3 box-blur) по LOD-шагу 1/2/4. */
  blurPasses: [2, 1, 1],
  /** Ограничение яркости/насыщенности вдали (ground + здания). */
  far: { start: 900, end: 4500, desat: 0.55, maxLuma: 0.82, tintToFog: 0.35 },
};
/** FIX_VISUALS §3 — геометрия и цвет дорог. Ширины в метрах (полотно = asphalt, без тротуаров). */
export const ROAD_SPEC = {
  // индексы = ROAD_TYPES в src/world/RoadNet.ts: 0 улица, 1 проспект, 2 шоссе, 3 переулок
  asphalt: [7.0, 12.0, 14.0, 4.5],
  median: [0, 2.0, 3.0, 0],
  sidewalk: [2.5, 3.5, 0, 1.5],
  shoulder: [0, 0, 1.0, 0],
  curbW: 0.3, curbH: 0.15,
  cornerR: [5, 8, 12, 3],
  color: { asphalt: [0x5e6273, 0x575b6c, 0x50546a, 0x6c6f7e], pad: 0x5a5e70, curb: 0xece4d8, sidewalk: 0xd6ccc0, median: 0x8fbd5e, shoulder: 0x8a8d98 },
  marking: {
    color: 0xfff8ee, yellow: 0xffc145, alpha: 0.92,
    centerW: 0.15, dash: 3, gap: 6, doubleGap: 0.15, edgeW: 0.15, edgeInset: 0.4,
    zebraW: 0.5, zebraGap: 0.5, zebraDepth: 3.0, zebraFromPad: 0.5,
    stopW: 0.4, stopFromZebra: 1.0,
    zebraOn: [true, true, false, false], centerline: ['dash', 'double', 'dash', 'none'] as const,
  },
  rail: { gauge: 1.52, railW: 0.08, ballastW: 3.2, ballastH: 0.25, sleeperL: 2.6, sleeperW: 0.22, sleeperStep: 0.6 },
  /** Подъёмы над рельефом (м) + polygonOffset; renderOrder. */
  y: { sidewalk: 0.06, asphalt: 0.10, pad: 0.11, marking: 0.13, rail: 0.10 },
  polygonOffset: { terrain: [1, 1], sidewalk: [-1, -2], asphalt: [-2, -4], marking: [-3, -8] },
  renderOrder: { terrain: 0, water: 1, sidewalk: 2, asphalt: 3, marking: 4, props: 5 },
};
/** FIX_VISUALS §1 — светофор. */
export const SIGNAL = {
  red: 0xff3b2f, yellow: 0xffc145, green: 0x35e07a, off: 0x262a33, housing: 0x2b2f45, pole: 0x4a4f57, visor: 0x1c1f2a, backplate: 0xfff8ee,
  poleH: 3.0, poleR: 0.07, headW: 0.34, headH: 0.95, headD: 0.26, lampR: 0.1, lampStep: 0.3,
  /** Смещение от края площадки перекрёстка назад по подходу (м) и вбок за бордюр. */
  back: 1.5, side: 0.6,
  lodDist: 420, lodFadeFrom: 340, maxPerFrame: 1200,
  phase: { green: 18, yellow: 3, allRed: 1 },
};


/** v4: темы зданий. Цвета — только отсюда (models/themes/*). */
export const THEMES = {
  base: { label: 'Базовая «Пастила»' },
  lateSng: {
    label: 'Позднее СНГ',
    panels: [0xe9dcc4, 0xc9d3dc, 0xe8cf8e, 0xd9d5cc, 0xf0e6d6, 0xbfd0d8],   // бежевая, серо-голубая, охра, серая, молочная, голубая
    seams: [0xd25b4a, 0x3f7fbf, 0x4f9a6a, 0xe0a030, 0x8f86b8, 0xc8c2b6],  // заделанные швы (разноцветные)
    roof: 0x55586a, parapet: 0xb8b2a8, plinth: 0x8a8580, glass: 0x7e9ab8, frame: 0xf4f1ea,
    loggiaGlaze: [0xbfd8e4, 0xd6e6d0, 0xe8e0c8, 0xf4f1ea], door: 0x6a5040, canopy: 0xcfc8bc, shopGlass: 0x6fa8c8, sign: [0xd8402f, 0x1f7fbf, 0x2f9a5a],
  },
  russianClassic: {
    label: 'Российская классика',
    walls: [0xe8b85a, 0xc8684a, 0xf2e2a0, 0xd8e8cc, 0xecc8a2, 0xb5503f, 0xf0d2b0], // охра, терракот, бледно-жёлтый, бело-зелёный, персик, кирпич, беж
    trim: 0xfff8ee, roofs: [0x5f8f6a, 0x8a929c, 0x4f7a5a, 0xa04a3a, 0x7a8590], plinth: 0xa89a8a,
    glass: 0x5f7a96, door: 0x5a3a2e, gate: 0x2b2f45, dome: 0x5f8f6a,
  },
  french: {
    label: 'Париж (Осман)',
    stone: [0xf1e6cf, 0xeadcc0, 0xf5ecda, 0xe6d6b8], zinc: 0x7f8a96, zincDark: 0x5f6a76, iron: 0x2b2f45,
    awnings: [0xb5303a, 0x1f5f4a, 0x2b3f6a, 0xe6c14a, 0x8a2f4a], chimney: 0xc98a6a, pot: 0xb5603f, glass: 0x6d8aa8, shop: [0x1f3f4a, 0x5a2a2a, 0x2b2f45, 0x3f5a3a],
  },
  /** Детали, общие для всех тем. */
  details: { downpipe: 0x8a929c, ac: 0xeef0f2, acGrille: 0x9aa2ae, vent: 0xb8b0b8, antenna: 0x6a7080, dish: 0xf4f4f0, fireEscape: 0x3a3f5a },
};


/** v5: ночной стиль (NIGHT_SPEC.md). Свет — только отсюда (design/night.ts). */
export const NIGHT = {
  /** Сцена: небо/туман/свет. Земля НЕ чёрная: «лунный» хеми + подъём экспозиции, чтобы строить было видно. */
  scene: { zenith: 0x070b24, horizon: 0x1f2a5c, fog: 0x141a40, hemiSky: 0x5a6ab8, hemiGround: 0x2a2448, hemiI: 0.75, moon: 0xaab8ff, moonI: 0.4, exposure: 1.05, groundLift: 0.1, farHemi: 0.3, farFrom: 350, farTo: 1600 },
  /** Цвета источников (HDR-множитель ≥1 → попадают в bloom). */
  lamp: { sodium: 0xffb45a, led: 0xfff1d6, cold: 0xcfe0ff, pool: 0xffc27a, head: 0xfff6dc, tail: 0xff2a3a, brake: 0xff1020, window: 0xffc878, windowCold: 0xbfd8ff, neon: [0x5fe0c8, 0xff5fa2, 0x8f7bff, 0xffc145] },
  /** Интенсивности (умножаются на цвет в шейдере, toneMapped). */
  intensity: { lampHead: 6.0, pool: 0.3, cone: 0.1, carHead: 5.0, carTail: 3.2, window: 1.5, highwayNeon: 2.4, spaceDot: 1.1 },
  /** Bloom (UnrealBloomPass). */
  bloom: { strength: 0.85, radius: 0.55, threshold: 0.82, farStrength: 0.95 },
  /** «Ночное видение» слоёв: тёмная монохромная база + неон данных. */
  vision: { base: 0x0c1428, baseHi: 0x2a3a5c, buildings: 0x1a2440, buildingsEdge: 0x3a5a8a, water: 0x06223a, grid: 0x2a4a6a,
    traffic: [0x2fe6a0, 0x9ff05a, 0xffe14a, 0xff8a3c, 0xff2f5a], zones: { R: 0x3fe08a, C: 0x4fa8ff, I: 0xffc145, O: 0xc07bff }, heat: [0x10204a, 0x2f5fd0, 0x2fd0e0, 0xb0ff6a, 0xfff07a] },
  /** Строительство ночью: курсор, сетка, призрак. */
  build: { cursor: 0x7ff0d8, cursorBad: 0xff5a6a, grid: 0x7ff0d8, gridAlpha: 0.22, ghost: 0x9ff8e8, ghostAlpha: 0.45 },
};


/** v5 E5: приглушение. HSL: s' = min(s·0.55, 0.30); l' = clamp(l, 0.30, 0.90); оттенок тянется на 15 % к тёплому серому 35°. Нет «полностью красных/жёлтых» домов. */
export const MUTE = { satK: 0.55, satMax: 0.30, lMin: 0.30, lMax: 0.90, warmHue: 35, warmPull: 0.15 };
export function mute(hex: number, k = MUTE): number {
  const r = (hex >> 16 & 255) / 255, g = (hex >> 8 & 255) / 255, b = (hex & 255) / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0; const l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = 60 * (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  let dh = ((k.warmHue - h + 540) % 360) - 180; h = (h + dh * k.warmPull + 360) % 360;
  const s2 = Math.min(s * k.satK, k.satMax), l2 = Math.min(k.lMax, Math.max(k.lMin, l));
  const c = (1 - Math.abs(2 * l2 - 1)) * s2, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l2 - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.round((R + m) * 255) << 16) | (Math.round((G + m) * 255) << 8) | Math.round((B + m) * 255);
}
const deepMute = <T>(o: T): T => (typeof o === 'number' ? mute(o) : Array.isArray(o) ? o.map(deepMute) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([a, v]) => [a, deepMute(v)])) : o) as T;
/** Новые значения (заменяют BUILD/THEMES в рендере). Генерируются формулой — правка палитры только в исходниках выше. */
export const BUILD_MUTED = deepMute(BUILD);
export const THEMES_MUTED = deepMute(THEMES);
/** Земля v5: трава приглушена, но остаётся зелёной (s ≤ 0.38). */
export const GROUND_V5 = { grass: 0x8ea56a, grassDry: 0xa3ad78, meadow: 0x95ac6e, forestFloor: 0x6f8458, yardGrass: 0x9cae7c, bladeBase: 0x6d8a4e, bladeTip: 0xb4c48a, bush: [0x5f7d4c, 0x6e8a55, 0x7c8f5a] };

export const PALETTE = { BRAND, WORLD, TERRAIN, SEASONS, ROADS, BUILD, VEHICLES, TREES, HEATMAPS, UI, GROUND, ROAD_SPEC, SIGNAL, THEMES, NIGHT, MUTE, BUILD_MUTED, THEMES_MUTED, GROUND_V5 };
export default PALETTE;
