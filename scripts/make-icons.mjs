// Generates the app icons (PNG) from the pixel soul-flame mark. No image
// libraries: a tiny PNG encoder on top of node's zlib.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const MARK = [
  '......XX........',
  '.....XXX........',
  '....XXXX..X.....',
  '....XXXXX.XX....',
  '...XXXXXXXXX....',
  '...XXXOOXXXXX...',
  '..XXXOOOOXXXX...',
  '..XXOOWWOOXXXX..',
  '..XXOOWWOOOXXX..',
  '..XXOOOOOOOXXX..',
  '...XXOOOOOOXX...',
  '...XXXOOOOXXX...',
  '....XXXXXXXX....',
  '.....XXXXXX.....',
  '......XXXX......',
];
const COL = { X: [0x44, 0xd6, 0xe8], O: [0xb6, 0xfb, 0xff], W: [0xff, 0xff, 0xff] };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function icon(size, pad) {
  // pad = fraction of the icon left as background around the mark
  const inner = size * (1 - pad * 2);
  const cell = inner / 16;
  return png(size, (x, y) => {
    // background: vertical night gradient
    const t = y / size;
    const bg = [Math.round(0x2a + (0x0e - 0x2a) * t), Math.round(0x24 + (0x0c - 0x24) * t), Math.round(0x70 + (0x2b - 0x70) * t), 255];
    const mx = Math.floor((x - size * pad) / cell), my = Math.floor((y - size * pad) / cell);
    if (mx >= 0 && my >= 1 && mx < 16 && my < 16) {
      const ch = MARK[my - 1][mx];
      if (COL[ch]) return [...COL[ch], 255];
    }
    // soft glow ring around the mark
    const dx = x - size / 2, dy = y - size * 0.55;
    const d = Math.sqrt(dx * dx + dy * dy) / (size * 0.42);
    if (d < 1) { const k = (1 - d) * 0.35; return [bg[0] + (0x44 - bg[0]) * k, bg[1] + (0xd6 - bg[1]) * k, bg[2] + (0xe8 - bg[2]) * k, 255].map(Math.round); }
    return bg;
  });
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 0.12));
writeFileSync('public/icons/icon-512.png', icon(512, 0.12));
writeFileSync('public/icons/maskable-512.png', icon(512, 0.22));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.14));
console.log('icons written');
