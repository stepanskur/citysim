// GeoBuilder v2 — конструктор low-poly геометрии стиля «Пастила».
// Выход: ОДНА non-indexed BufferGeometry: position, normal, color (с запечённым AO), glow (float: 0 — не светится,
// (0..1] — «порог включения» окна ночью; шейдер из scene-preset.ts зажигает окна, у которых glow < uNight).
// Единицы: метры. Origin — центр основания, Y вверх, фасад/нос на +Z.
import * as THREE from 'three';

export type RGB = [number, number, number];
export const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (a: RGB, k: number): RGB => [Math.min(1, a[0] * k), Math.min(1, a[1] * k), Math.min(1, a[2] * k)];

/** Детерминированный ГПСЧ (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  const f = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next: f, range: (a: number, b: number) => a + (b - a) * f(), int: (a: number, b: number) => Math.floor(a + (b - a + 1) * f()), pick: <T>(arr: readonly T[]) => arr[Math.floor(f() * arr.length)], chance: (p: number) => f() < p };
}
export type Rng = ReturnType<typeof rng>;
type V3 = number[];

export class GeoBuilder {
  pos: number[] = []; col: number[] = []; glw: number[] = [];
  /** Текущее значение glow для добавляемых вершин. */
  glow = 0;
  /** AO у земли: низ темнее на ao в пределах aoHeight метров. */
  ao = 0.14; aoHeight = 3;
  /** Тёплый «отражённый» свет снизу и холодная тень сверху (фирменный тон «Пастилы»). */
  bakeTint = true;

  tri(a: V3, b: V3, c: V3, col: RGB) {
    for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.col.push(col[0], col[1], col[2]); this.glw.push(this.glow); }
  }
  quad(a: V3, b: V3, c: V3, d: V3, col: RGB) { this.tri(a, b, c, col); this.tri(a, c, d, col); }

  /** Ящик с опциональной фаской верхних рёбер (bevel, м) — фирменная «мягкая» кромка. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, c: RGB, topCol?: RGB, bevel = 0, bottom = false) {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const t = topCol ?? shade(c, 1.06); const b = Math.min(bevel, w / 3, d / 3, h / 2); const yb = y1 - b;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yb, z1], [x0, yb, z1], c);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, yb, z0], [x1, yb, z0], c);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, yb, z0], [x1, yb, z1], c);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, yb, z1], [x0, yb, z0], c);
    if (b > 0) {
      const ix0 = x0 + b, ix1 = x1 - b, iz0 = z0 + b, iz1 = z1 - b; const bc = mix(c, t, 0.5);
      this.quad([x0, yb, z1], [x1, yb, z1], [ix1, y1, iz1], [ix0, y1, iz1], bc);
      this.quad([x1, yb, z0], [x0, yb, z0], [ix0, y1, iz0], [ix1, y1, iz0], bc);
      this.quad([x1, yb, z1], [x1, yb, z0], [ix1, y1, iz0], [ix1, y1, iz1], bc);
      this.quad([x0, yb, z0], [x0, yb, z1], [ix0, y1, iz1], [ix0, y1, iz0], bc);
      this.quad([ix0, y1, iz1], [ix1, y1, iz1], [ix1, y1, iz0], [ix0, y1, iz0], t);
    } else this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], t);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], c);
  }
  /** Карниз/фриз — тонкий выступающий пояс вокруг объёма. */
  band(cx: number, y: number, cz: number, w: number, d: number, h: number, out: number, c: RGB) { this.box(cx, y, cz, w + out * 2, h, d + out * 2, c, c, Math.min(out, h * 0.5)); }

  /** Двускатная крыша вдоль X с фронтонами. */
  gable(cx: number, y0: number, cz: number, w: number, d: number, h: number, roof: RGB, wall: RGB, overhang = 0.35, thick = 0.18) {
    const x0 = cx - w / 2 - overhang, x1 = cx + w / 2 + overhang, z0 = cz - d / 2 - overhang, z1 = cz + d / 2 + overhang, y1 = y0 + h;
    const xw0 = cx - w / 2, xw1 = cx + w / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, cz], [x0, y1, cz], roof);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, cz], [x1, y1, cz], shade(roof, 0.82));
    // торцы ската (толщина кровли) — светлая кромка
    const e = shade(roof, 1.25);
    this.quad([x0, y0 - thick, z1], [x1, y0 - thick, z1], [x1, y0, z1], [x0, y0, z1], e);
    this.quad([x1, y0 - thick, z0], [x0, y0 - thick, z0], [x0, y0, z0], [x1, y0, z0], e);
    this.tri([xw1, y0, cz + d / 2], [xw1, y0, cz - d / 2], [xw1, y1, cz], wall);
    this.tri([xw0, y0, cz - d / 2], [xw0, y0, cz + d / 2], [xw0, y1, cz], wall);
  }
  /** Вальмовая крыша. */
  hip(cx: number, y0: number, cz: number, w: number, d: number, h: number, roof: RGB, overhang = 0.35) {
    const x0 = cx - w / 2 - overhang, x1 = cx + w / 2 + overhang, z0 = cz - d / 2 - overhang, z1 = cz + d / 2 + overhang, y1 = y0 + h;
    const r = Math.max(0, (w - d) / 2); const a = [cx - r, y1, cz], b = [cx + r, y1, cz];
    this.quad([x0, y0, z1], [x1, y0, z1], b, a, roof);
    this.quad([x1, y0, z0], [x0, y0, z0], a, b, shade(roof, 0.82));
    this.tri([x1, y0, z1], [x1, y0, z0], b, shade(roof, 0.92));
    this.tri([x0, y0, z0], [x0, y0, z1], a, shade(roof, 0.92));
  }
  /** Мансардное окно (люкарна) на южном скате двускатной крыши. */
  dormer(x: number, y: number, z: number, wall: RGB, roof: RGB, glass: RGB) {
    this.box(x, y, z, 1.4, 1.3, 1.2, wall, wall);
    this.gable(x, y + 1.3, z, 1.4, 1.2, 0.6, roof, wall, 0.12, 0.08);
    this.windowAt(x, y + 0.35, z + 0.61, 0.8, 0.8, 0, glass, shade(wall, 1.1));
  }
  /** Солнечная панель (наклонная) на плоской крыше. */
  solar(x: number, y: number, z: number, w: number, d: number) {
    const c = hex(0x2c3e6b), f = hex(0xc9d2e0); const y1 = y + d * 0.45;
    this.quad([x - w / 2, y + 0.3, z + d / 2], [x + w / 2, y + 0.3, z + d / 2], [x + w / 2, y1, z - d / 2], [x - w / 2, y1, z - d / 2], c);
    this.box(x, y, z - d / 2 + 0.1, w, y1 - y, 0.1, f, f);
  }
  /** Призма/цилиндр (n граней), конус при rTop=0. */
  cyl(cx: number, y0: number, cz: number, rBot: number, rTop: number, h: number, n: number, c: RGB, topCol?: RGB, rot = 0) {
    const y1 = y0 + h; const t = topCol ?? shade(c, 1.1);
    for (let i = 0; i < n; i++) {
      const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * rBot, y0, cz + Math.sin(a0) * rBot], p1 = [cx + Math.cos(a1) * rBot, y0, cz + Math.sin(a1) * rBot];
      const q0 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop], q1 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
      if (rTop > 0) { this.quad(p1, p0, q0, q1, c); this.tri([cx, y1, cz], q1, q0, t); } else this.tri(p1, p0, [cx, y1, cz], c);
    }
  }
  /** Low-poly крона (икосаэдр) с градиентом «свет сверху / тень снизу». */
  blob(cx: number, cy: number, cz: number, r: number, c: RGB, sy = 1, jitter?: Rng, detail = 0) {
    const g = new THREE.IcosahedronGeometry(r, detail); const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const tri: V3[] = []; for (let k = 0; k < 3; k++) tri.push([cx + p.getX(i + k), cy + p.getY(i + k) * sy, cz + p.getZ(i + k)]);
      const ny = ((tri[0][1] + tri[1][1] + tri[2][1]) / 3 - cy) / (r * sy);
      const lit = mix(shade(c, 0.78), mix(c, hex(0xfff1b8), 0.18), (ny + 1) / 2);
      this.tri(tri[0], tri[1], tri[2], jitter ? shade(lit, jitter.range(0.95, 1.05)) : lit);
    }
    g.dispose();
  }
  /** Окно с рамой и подоконником на плоскости, нормаль которой — сторона side (0:+Z 1:-Z 2:+X 3:-X). */
  windowAt(x: number, y: number, z: number, w: number, h: number, side: number, glass: RGB, frame: RGB, litChance = 0, r?: Rng) {
    const put = (u: number, v: number, o: number): V3 => side === 0 ? [x + u, y + v, z + o] : side === 1 ? [x - u, y + v, z - o] : side === 2 ? [x + o, y + v, z - u] : [x - o, y + v, z + u];
    const q = (u0: number, v0: number, u1: number, v1: number, o: number, c: RGB) => this.quad(put(u0, v0, o), put(u1, v0, o), put(u1, v1, o), put(u0, v1, o), c);
    const f = 0.12;
    q(-w / 2 - f, -f, w / 2 + f, h + f, 0.04, frame);         // рама
    const g0 = this.glow; this.glow = r && r.chance(litChance) ? Math.max(0.02, r.next()) : 0; // 0 = окно не горит никогда
    q(-w / 2, 0, w / 2, h, 0.06, glass); this.glow = g0;        // стекло (светится ночью)
    q(-0.03, 0, 0.03, h, 0.075, frame);                         // импост
    q(-w / 2 - f * 1.5, -f - 0.1, w / 2 + f * 1.5, -f, 0.16, shade(frame, 1.05)); // подоконник
  }
  /** Сетка окон по фасадам. */
  windowGrid(cx: number, cz: number, w: number, d: number, y0: number, floors: number, floorH: number, glass: RGB, frame: RGB, opts: { winW?: number; winH?: number; gap?: number; sides?: number[]; lit?: number; r?: Rng; skipGround?: boolean } = {}) {
    const winW = opts.winW ?? 1.2, winH = opts.winH ?? floorH * 0.48, gap = opts.gap ?? 1.6;
    for (let fl = opts.skipGround ? 1 : 0; fl < floors; fl++) {
      const yy = y0 + fl * floorH + floorH * 0.3;
      for (const side of opts.sides ?? [0, 1, 2, 3]) {
        const len = side < 2 ? w : d; const n = Math.max(1, Math.floor((len - 1) / (winW + gap))); const step = len / n;
        for (let i = 0; i < n; i++) {
          const u = -len / 2 + step * (i + 0.5);
          const [px, pz] = side === 0 ? [cx + u, cz + d / 2] : side === 1 ? [cx - u, cz - d / 2] : side === 2 ? [cx + w / 2, cz - u] : [cx - w / 2, cz + u];
          this.windowAt(px, yy, pz, winW, winH, side, glass, frame, opts.lit ?? 0.5, opts.r);
        }
      }
    }
  }
  /** v1-совместимый API: ряды окон на 4 фасадах (c — цвет стекла). Внутри — windowGrid с рамами. */
  windows(cx: number, cz: number, w: number, d: number, y0: number, floors: number, floorH: number, c: RGB, winW = 1.2, gap = 1.6) {
    this.windowGrid(cx, cz, w, d, y0, floors, floorH, c, hex(0xfff8ee), { winW, gap, lit: 0 });
  }
  /** Колесо с диском (8 граней + ступица) по оси X. */
  wheel(x: number, y: number, z: number, r: number, wdt: number, c: RGB, rim: RGB = hex(0xd9dde3)) {
    const n = 10; const xa = x - wdt / 2, xb = x + wdt / 2;
    const p = (a: number, xx: number, rr: number): V3 => [xx, y + Math.sin(a) * rr, z + Math.cos(a) * rr];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      this.quad(p(a0, xa, r), p(a1, xa, r), p(a1, xb, r), p(a0, xb, r), c);
      for (const [xx, s] of [[xb, 1], [xa, -1]] as const) {
        const ri = r * 0.6, xo = xx + s * 0.01;
        const tri = (A: V3, B: V3, C: V3, cc: RGB) => s > 0 ? this.tri(A, B, C, cc) : this.tri(A, C, B, cc);
        tri(p(a0, xx, r), p(a0, xo, ri), p(a1, xo, ri), c); tri(p(a0, xx, r), p(a1, xo, ri), p(a1, xx, r), c);
        tri([xo, y, z], p(a0, xo, ri), p(a1, xo, ri), i % 2 ? rim : shade(rim, 0.82));
      }
    }
  }
  rotateY(a: number) { const c = Math.cos(a), s = Math.sin(a); for (let i = 0; i < this.pos.length; i += 3) { const x = this.pos[i], z = this.pos[i + 2]; this.pos[i] = x * c + z * s; this.pos[i + 2] = -x * s + z * c; } }

  /** Запекание AO и тонировки в vertex colors: затемнение у земли, у нижних граней, холодный оттенок на гранях, смотрящих вниз. */
  private bake(normals: ArrayLike<number>) {
    let ymax = 0.001; for (let i = 1; i < this.pos.length; i += 3) ymax = Math.max(ymax, this.pos[i]);
    for (let i = 0; i < this.pos.length; i += 3) {
      const y = this.pos[i + 1], ny = normals[i + 1];
      let k = 1 - this.ao * Math.max(0, 1 - y / this.aoHeight);           // контактная тень у земли
      k *= 1 - 0.18 * Math.max(0, -ny);                                     // грани вниз (под карнизами/балконами)
      k *= 0.97 + 0.06 * Math.min(1, y / ymax);                             // лёгкий градиент высоты
      let [r, g, b] = [this.col[i] * k, this.col[i + 1] * k, this.col[i + 2] * k];
      if (this.bakeTint && ny < -0.2) { r *= 0.94; b *= 1.04; }              // холодная (лавандовая) тень
      if (this.bakeTint && ny > 0.7) { r = Math.min(1, r * 1.02); }          // тёплый «солнечный» верх
      this.col[i] = r; this.col[i + 1] = g; this.col[i + 2] = Math.min(1, b);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.computeVertexNormals();
    this.bake(g.attributes.normal.array as Float32Array);
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glw, 1));
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  }
  get triangles() { return this.pos.length / 9; }
}
