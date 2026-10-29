import { deflateSync } from 'zlib';
const T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b: Uint8Array) => { let c = -1; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length); const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length); out.set(Buffer.from(type, 'ascii'), 4); out.set(data, 8);
  dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length))); return out;
}
/** RGB-буфер (w*h*3) → PNG */
export function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ih = new Uint8Array(13); const dv = new DataView(ih.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]);
}
