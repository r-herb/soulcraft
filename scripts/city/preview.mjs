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

// the game's map colours (surfaces, walls, roofs)
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const COL = ['#bdb393', '#55555a', '#aaa59b', '#e9e3d5', '#80b06a', '#e9d8a6', '#2f6db3', '#9a9486', '#6b5d53',
  '#d2c9b6', '#4d7b3e', '#9aa0a6', '#bdb5a4', '#9daa6c', '#88b872', '#707074', '#c9a66b', '#62a254', '#4fc3e8'].map(hex);
const WALL = ['#eeede8', '#eadfc4', '#dcb670', '#c97d5c', '#dad1ba', '#a6583f', '#86abc8', '#b3b3b0', '#d6b685'].map(hex);
const ROOF_TILES = hex('#c2663e'), ROOF_STONE = hex('#d9c8a2'), TREE = hex('#3f7033');

export function writePreview(file, W, D, ground, surf, bid, table, scale = 2) {
  const w = Math.floor(W / scale), h = Math.floor(D / scale);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * scale * W + x * scale;
    let c;
    if (bid[i]) { const b = table[bid[i]]; c = b[3] === 1 ? ROOF_TILES : b[3] === 2 ? ROOF_STONE : WALL[b[2]] || WALL[0]; }
    else c = (surf[i] & 0x80) ? TREE : COL[surf[i] & 0x7f] || COL[0];
    // hill shading from the ground height
    const gx = ground[Math.min(W * D - 1, i + scale)] - ground[i], gz = ground[Math.min(W * D - 1, i + scale * W)] - ground[i];
    const shade = Math.max(0.6, Math.min(1.25, 1 - (gx + gz) * 0.08));
    rgb[(y * w + x) * 3] = Math.min(255, c[0] * shade); rgb[(y * w + x) * 3 + 1] = Math.min(255, c[1] * shade); rgb[(y * w + x) * 3 + 2] = Math.min(255, c[2] * shade);
  }
  writeFileSync(file, encodePng(w, h, rgb));
  console.log('preview', file, w, 'x', h);
}
