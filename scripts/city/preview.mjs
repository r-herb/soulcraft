// Top-down PNG of a built city raster (for checking a build by eye).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
export function encodePng(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const COL = [[196, 190, 170], [70, 70, 76], [190, 186, 178], [235, 228, 210], [110, 170, 80], [232, 214, 160], [40, 110, 170], [150, 140, 120], [120, 90, 70], [210, 200, 180], [60, 120, 60], [170, 170, 170], [200, 190, 175], [150, 160, 90], [110, 170, 80], [90, 90, 96], [150, 120, 80], [80, 150, 80], [80, 195, 232]];
const WALL = [[245, 245, 240], [238, 224, 190], [226, 180, 110], [205, 120, 90], [220, 210, 185], [170, 90, 70], [120, 170, 200], [180, 180, 180], [215, 185, 130]];

export function writePreview(file, W, D, ground, surf, bid, table, scale = 2) {
  const w = Math.floor(W / scale), h = Math.floor(D / scale);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * scale * W + x * scale;
    let c;
    if (bid[i]) { const b = table[bid[i]]; const k = Math.min(1, 0.55 + b[1] / 60); c = WALL[b[2]].map((v) => v * k); }
    else c = (surf[i] & 0x80) ? [40, 100, 40] : COL[surf[i] & 0x7f] || [255, 0, 255];
    // hill shading from the ground height
    const gx = ground[Math.min(W * D - 1, i + scale)] - ground[i], gz = ground[Math.min(W * D - 1, i + scale * W)] - ground[i];
    const shade = Math.max(0.6, Math.min(1.25, 1 - (gx + gz) * 0.08));
    rgb[(y * w + x) * 3] = Math.min(255, c[0] * shade); rgb[(y * w + x) * 3 + 1] = Math.min(255, c[1] * shade); rgb[(y * w + x) * 3 + 2] = Math.min(255, c[2] * shade);
  }
  writeFileSync(file, encodePng(w, h, rgb));
  console.log('preview', file, w, 'x', h);
}
