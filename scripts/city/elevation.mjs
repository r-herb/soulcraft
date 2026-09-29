// Ground elevation from the open Terrain Tiles on AWS (Mapzen "terrarium"
// PNG encoding: metres = R * 256 + G + B / 256 - 32768). Sources: SRTM,
// GMTED, ETOPO1 and others; see
// https://github.com/tilezen/joerd/blob/master/docs/attribution.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const ZOOM = 15;
const URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

export const lon2x = (lon, z = ZOOM) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z = ZOOM) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z; };

// Minimal PNG decoder: 8-bit RGB / RGBA, non-interlaced (what the tiles use).
export function decodePng(buf) {
  let p = 8, w = 0, h = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); if (data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png'); ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0;
  if (!bpp) throw new Error('png colour type ' + ct);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp, out = new Uint8Array(w * h * bpp);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    prev = cur;
  }
  return { w, h, bpp, data: out };
}

// Downloads (and caches) the tiles over a bbox and returns a bilinear
// sampler: elevation(lat, lon) in metres.
export async function loadElevation([s, w, n, e], cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const x0 = Math.floor(lon2x(w)), x1 = Math.floor(lon2x(e)), y0 = Math.floor(lat2y(n)), y1 = Math.floor(lat2y(s));
  const tiles = new Map();
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const file = `${cacheDir}/${ZOOM}-${tx}-${ty}.png`;
    if (!existsSync(file)) {
      const res = await fetch(URL(ZOOM, tx, ty));
      if (!res.ok) throw new Error(`elevation tile ${tx},${ty}: HTTP ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
    const png = decodePng(readFileSync(file));
    const m = new Float32Array(256 * 256);
    for (let i = 0; i < 256 * 256; i++) { const o = i * png.bpp; m[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768; }
    tiles.set(`${tx},${ty}`, m);
  }
  const at = (px, py) => {
    const tx = Math.floor(px / 256), ty = Math.floor(py / 256);
    const t = tiles.get(`${tx},${ty}`);
    if (!t) return 0;
    return t[(py - ty * 256) * 256 + (px - tx * 256)];
  };
  return (lat, lon) => {
    const fx = lon2x(lon) * 256 - 0.5, fy = lat2y(lat) * 256 - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy), dx = fx - ix, dy = fy - iy;
    return at(ix, iy) * (1 - dx) * (1 - dy) + at(ix + 1, iy) * dx * (1 - dy) + at(ix, iy + 1) * (1 - dx) * dy + at(ix + 1, iy + 1) * dx * dy;
  };
}
