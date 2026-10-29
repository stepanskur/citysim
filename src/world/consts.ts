export const TILE = 16;
export const CHUNK = 32; // tiles per chunk
export const SIZES = [
  { id: 'village', name: 'Посёлок', map: 3072, r: 520, others: 2, maxL: 3, startPop: '≈2 тыс' },
  { id: 'town', name: 'Городок', map: 6144, r: 1000, others: 3, maxL: 6, startPop: '≈15 тыс' },
  { id: 'city', name: 'Город', map: 12288, r: 2000, others: 4, maxL: 14, startPop: '≈120 тыс' },
  { id: 'metro', name: 'Мегаполис', map: 20480, r: 3600, others: 5, maxL: 28, startPop: '≈700 тыс' },
  { id: 'huge', name: 'Гигаполис', map: 32768, r: 6000, others: 7, maxL: 48, startPop: '≈3 млн' },
];
export const Z = { NONE: 0, R: 1, C: 2, I: 3 };
export const K = { NONE: 0, RES: 1, COM: 2, IND: 3, EXTRACT: 4, WAREHOUSE: 5, PARK: 6, STATION: 7, PORT: 8 };
export const RES = { NONE: 0, FOREST: 1, ORE: 2, FERTILE: 3, OIL: 4 };
export const RES_NAMES = ['—', 'Лес', 'Руда', 'Плодородная земля', 'Нефть'];
export const KIND_NAMES = ['Пусто', 'Жилой дом', 'Коммерция', 'Промышленность', 'Добыча', 'Грузовой склад', 'Парк', 'Ж/Д станция', 'Порт'];
export const CITY_KINDS: Record<string, string> = { port: 'Портовый', industrial: 'Промышленный', agri: 'Аграрный', trade: 'Торговый', resort: 'Курортный' };
export const PATTERNS: Record<string, string> = { grid: 'сетка', radial: 'радиальная', organic: 'органическая' };

export function markRoadTiles(N: number, road: Uint8Array, ax: number, az: number, bx: number, bz: number, type: number, w: number) {
  const L = Math.hypot(bx - ax, bz - az); const steps = Math.max(1, Math.ceil(L / 4));
  const r = w / 2;
  for (let s = 0; s <= steps; s++) {
    const x = ax + (bx - ax) * s / steps, z = az + (bz - az) * s / steps;
    const tx0 = Math.floor((x - r) / TILE), tx1 = Math.floor((x + r) / TILE), tz0 = Math.floor((z - r) / TILE), tz1 = Math.floor((z + r) / TILE);
    for (let i = tx0; i <= tx1; i++) for (let j = tz0; j <= tz1; j++) {
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      // tile center within r+3 of point
      const cx = (i + 0.5) * TILE, cz = (j + 0.5) * TILE;
      if (Math.abs(cx - x) <= r + 2 && Math.abs(cz - z) <= r + 2) { const k = j * N + i; if (road[k] < type + 1) road[k] = type + 1; }
    }
  }
}
