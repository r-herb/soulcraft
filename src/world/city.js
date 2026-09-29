// Real-city worlds (Malaga): the world is read from a raster built from
// OpenStreetMap and open elevation data by scripts/city/build-city.mjs
// (1 block = 1 metre). The main thread loads the file and hands every chunk
// request a small padded slice of it; the worker turns the slice into
// blocks here. Map data (c) OpenStreetMap contributors, ODbL 1.0.
import { CHUNK, HEIGHT, B } from './blocks.js';
import { hash3 } from './noise.js';

const S = CHUNK;
const idx = (x, y, z) => x + z * S + y * S * S;
const M = 4; // slice margin: trees and wall edges reach into neighbours

// surface codes (same list as the build script)
const SURF = {
  ground: 0, road: 1, pavement: 2, marble: 3, park: 4, sand: 5, water: 6, riverbed: 7, rail: 8,
  plaza: 9, forest: 10, dock: 11, steps: 12, scrub: 13, garden: 14, parking: 15, wall: 16, pitch: 17, pool: 18,
};
const TREE_BIT = 0x80;
const SURFACE_BLOCK = [
  B.grass, B.asphalt, B.paving, B.marble, B.grass, B.sand, B.sand, B.concrete, B.rubble,
  B.paving, B.grass, B.concrete, B.paving, B.grass, B.grass, B.asphalt, B.ruin_stone, B.grass, B.water,
];
const NATURAL = new Set([SURF.ground, SURF.park, SURF.forest, SURF.scrub, SURF.garden, SURF.pitch, SURF.sand]);
const WALLS = [B.plaster_white, B.plaster_cream, B.plaster_ochre, B.plaster_terra, B.limestone, B.brick, B.window, B.concrete, B.sandstone];
const ROOFS = [B.paving, B.roof_tiles, B.limestone];

// Well-known places shown on the world map (latitude, longitude).
export const CITY_PLACES = {
  malaga: [
    { name: 'Plaza de la Constitución', lat: 36.72108, lon: -4.42195 },
    { name: 'Calle Larios', lat: 36.71900, lon: -4.42170 },
    { name: 'Catedral', lat: 36.72017, lon: -4.41961 },
    { name: 'Alcazaba', lat: 36.72112, lon: -4.41593 },
    { name: 'Gibralfaro', lat: 36.72344, lon: -4.41174 },
    { name: 'Muelle Uno', lat: 36.71800, lon: -4.41338 },
    { name: 'La Malagueta', lat: 36.71711, lon: -4.41085 },
    { name: 'Plaza de la Merced', lat: 36.72340, lon: -4.41810 },
    { name: 'Paseo del Parque', lat: 36.71910, lon: -4.41700 },
    { name: 'El Limonar', lat: 36.72700, lon: -4.40000 },
  ],
};

// ---------- main thread: loading and slicing ----------
export class CityData {
  static async load(id) {
    const res = await fetch(`/city/${id}.bin.gz`);
    if (!res.ok) throw new Error(`city ${id}: HTTP ${res.status}`);
    let buf;
    // the file is gzip; a server may already have undone that
    const raw = new Uint8Array(await res.arrayBuffer());
    if (raw[0] === 0x1f && raw[1] === 0x8b) buf = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    else buf = raw.buffer;
    return new CityData(buf);
  }

  constructor(buf) {
    const dv = new DataView(buf);
    const hlen = dv.getUint32(0, true);
    this.header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
    const h = this.header;
    this.w = h.width; this.d = h.depth; this.seaY = h.seaY;
    const n = this.w * this.d;
    let o = 4 + hlen; o += (4 - (o % 4)) % 4;
    this.ground = new Uint8Array(buf, o, n); o += n;
    this.surf = new Uint8Array(buf, o, n); o += n;
    this.wall = new Uint8Array(buf, o, n); o += n;
    this.bid = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
    this.table = new Uint8Array(buf, o, h.buildings * 4); o += h.buildings * 4;
    // v2: street names painted on the road and house numbers
    this.mark = h.v >= 2 ? new Uint8Array(buf, o, n) : new Uint8Array(n);
  }

  // A real place (latitude, longitude) in blocks, the same projection as the build script.
  toXZ(lat, lon) {
    const [S, W, N] = this.header.bbox;
    const lat0 = (S + N) / 2 * Math.PI / 180;
    const mlat = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
    const mlon = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
    return { x: Math.round((lon - W) * mlon), z: Math.round((N - lat) * mlat) };
  }

  inside(x, z) { return x >= 0 && z >= 0 && x < this.w && z < this.d; }
  groundAt(x, z) { return this.inside(x, z) ? this.ground[z * this.w + x] : this.seaY - 5; }

  // The chunk's cells plus a margin, for the worker.
  slice(cx, cz) {
    const W = S + 2 * M, n = W * W;
    const ground = new Uint8Array(n), surf = new Uint8Array(n), wall = new Uint8Array(n), bid = new Uint16Array(n), mark = new Uint8Array(n);
    const bl = {};
    const x0 = cx * S - M, z0 = cz * S - M;
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const k = z * W + x, gx = x0 + x, gz = z0 + z;
      if (!this.inside(gx, gz)) { ground[k] = this.seaY - 5; surf[k] = SURF.water; continue; }
      const i = gz * this.w + gx;
      ground[k] = this.ground[i]; surf[k] = this.surf[i]; wall[k] = this.wall[i]; mark[k] = this.mark[i];
      const b = this.bid[i];
      bid[k] = b;
      if (b && !bl[b]) bl[b] = Array.from(this.table.subarray(b * 4, b * 4 + 4));
    }
    return { city: true, seaY: this.seaY, ground, surf, wall, bid, bl, mark };
  }

  // An open cell (not a building, the sea or a wall) near (x, z), or null.
  openCellNear(x, z, radius = 40) {
    for (let r = 0; r <= radius; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const cx = x + dx, cz = z + dz;
      if (!this.inside(cx, cz)) continue;
      const i = cz * this.w + cx;
      if (!this.bid[i] && !this.wall[i] && (this.surf[i] & 0x7f) !== SURF.water) return { x: cx, z: cz };
    }
    return null;
  }

  // Where a new player starts: the spawn square, off any building.
  spawnPoint() {
    const [sx, sz] = this.header.spawn;
    for (let r = 0; r < 40; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = sx + dx, z = sz + dz;
      if (!this.inside(x, z)) continue;
      const i = z * this.w + x;
      if (!this.bid[i] && (this.surf[i] & 0x7f) !== SURF.water && !this.wall[i]) return { x: x + 0.5, y: this.ground[i] + 1.05, z: z + 0.5 };
    }
    return { x: sx + 0.5, y: this.ground[sz * this.w + sx] + 1.05, z: sz + 0.5 };
  }
}

// ---------- worker: blocks for one chunk ----------
export function genCity(cx, cz, data, e) {
  const W = S + 2 * M, seaY = e.seaY;
  const at = (lx, lz) => (lz + M) * W + (lx + M);
  const set = (x, y, z, id) => { if (x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < HEIGHT) data[idx(x, y, z)] = id; };
  for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
    const k = at(lx, lz), wx = cx * S + lx, wz = cz * S + lz;
    const g = Math.min(HEIGHT - 2, e.ground[k]), s = e.surf[k] & 0x7f, b = e.bid[k];
    data[idx(lx, 0, lz)] = B.coreite;
    const natural = NATURAL.has(s) && !b;
    for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = natural && y >= g - 3 ? (s === SURF.sand ? B.sand : B.dirt) : B.stone;
    // surface
    if (s === SURF.water && g < seaY) {
      data[idx(lx, g, lz)] = B.sand;
      for (let y = g + 1; y <= seaY; y++) data[idx(lx, y, lz)] = B.water;
      continue;
    }
    if (s === SURF.water) { data[idx(lx, g, lz)] = B.water; continue; } // fountains and ponds
    // swimming pools: two blocks of water over a marble floor, level with the ground
    if (s === SURF.pool && !b) { data[idx(lx, g - 2, lz)] = B.marble; data[idx(lx, g - 1, lz)] = B.water; data[idx(lx, g, lz)] = B.water; continue; }
    let top = SURFACE_BLOCK[s] ?? B.grass;
    if (s === SURF.scrub && hash3(wx, 1, wz, 7) < 0.3) top = B.dirt;
    if (s === SURF.steps && (wx + wz) % 2) top = B.stone;
    // street names painted on the road
    const mk = e.mark ? e.mark[k] : 0;
    if (mk === 1 && !b) top = B.road_paint;
    else if (mk === 2 && !b) top = B.paint_dark;
    data[idx(lx, g, lz)] = top;
    // plants on open ground
    if (!b && (s === SURF.park || s === SURF.garden || s === SURF.ground) && hash3(wx, 2, wz, 7) < 0.06 && g + 1 < HEIGHT) data[idx(lx, g + 1, lz)] = B.tallgrass;
    if (!b && s === SURF.scrub && hash3(wx, 3, wz, 7) < 0.08 && g + 1 < HEIGHT) data[idx(lx, g + 1, lz)] = B.dry_bush;
    // a bus stop sign (two blocks high)
    if (mk === 3 && !b && g + 2 < HEIGHT) { data[idx(lx, g + 1, lz)] = B.bus_stop; data[idx(lx, g + 2, lz)] = B.bus_stop; }
    // city walls (the Alcazaba, Gibralfaro)
    const wh = e.wall[k];
    if (wh) {
      for (let y = g + 1; y <= Math.min(HEIGHT - 1, g + wh); y++) data[idx(lx, y, lz)] = y === g + wh && (wx + wz) % 2 ? B.air : B.sandstone;
    }
    if (b) building(lx, lz, wx, wz, k, g, b);
  }

  // Buildings: plastered walls with windows, a floor every 4 blocks, doors
  // on the street, a flat terrace (with a parapet) or a tiled roof.
  function building(lx, lz, wx, wz, k, g, b) {
    const [base, height, wallMat, roof] = e.bl[b];
    const topY = Math.min(HEIGHT - 2, base + height);
    const wallId = WALLS[wallMat] ?? B.plaster_white;
    const glass = wallMat === 6;
    const stone = wallMat === 4 || wallMat === 8; // churches, castles: few, tall windows
    // an edge cell has a neighbour outside this building
    let edge = false, street = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(lx + dx, lz + dz);
      if (e.bid[n] !== b) { edge = true; const ns = e.surf[n] & 0x7f; if (!e.bid[n] && [SURF.road, SURF.pavement, SURF.marble, SURF.plaza, SURF.steps].includes(ns)) street = true; }
    }
    // foundations up to the floor; the hill inside is dug out
    for (let y = Math.min(g, base) + 1; y < base; y++) data[idx(lx, y, lz)] = B.stone;
    for (let y = base + 1; y <= g; y++) data[idx(lx, y, lz)] = B.air;
    data[idx(lx, base, lz)] = edge ? wallId : B.planks;
    const door = street && (hash3(wx, 5, wz, b) < 0.12 || (e.mark && e.mark[k] >= 10)); // a door under each house number
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      if (edge) {
        const win = glass || (stone
          ? r % 12 >= 4 && r % 12 <= 8 && (wx + wz) % 7 === 3
          : r % 4 >= 2 && r % 4 <= 3 && (wx + wz) % 3 !== 0 && r > 1);
        const plaque = r === 3 && e.mark && e.mark[k] >= 10 && e.mark[k] <= 19;
        data[idx(lx, y, lz)] = plaque ? B.num_0 + e.mark[k] - 10 : door && r <= 2 ? B.air : win ? B.window : wallId;
      } else data[idx(lx, y, lz)] = r % 4 === 0 ? B.planks : B.air;
    }
    data[idx(lx, topY, lz)] = edge && roof !== 1 ? wallId : ROOFS[roof] ?? B.paving;
    // a low parapet around flat terraces
    if (edge && roof === 0 && topY + 1 < HEIGHT) data[idx(lx, topY + 1, lz)] = wallId;
    if (roof === 1 && edge && topY + 1 < HEIGHT) data[idx(lx, topY, lz)] = B.roof_tiles;
  }

  // Trees (from OpenStreetMap, plus a scattering in parks): palms on the
  // streets and squares, round trees elsewhere. Neighbours' trees reach in.
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const k = z * W + x;
    if (!(e.surf[k] & TREE_BIT) || e.bid[k]) continue;
    const lx = x - M, lz = z - M, wx = cx * S + lx, wz = cz * S + lz;
    const s = e.surf[k] & 0x7f, g = e.ground[k];
    const palm = [SURF.road, SURF.pavement, SURF.marble, SURF.plaza, SURF.sand, SURF.dock].includes(s) || hash3(wx, 9, wz, 3) < 0.25;
    const h = palm ? 6 + Math.floor(hash3(wx, 4, wz, 3) * 3) : 4 + Math.floor(hash3(wx, 4, wz, 3) * 2);
    for (let y = g + 1; y <= g + h; y++) set(lx, y, lz, B.log);
    if (palm) {
      const t = g + h;
      set(lx, t + 1, lz, B.leaves);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { set(lx + dx, t, lz + dz, B.leaves); set(lx + 2 * dx, t, lz + 2 * dz, B.leaves); set(lx + 3 * dx, t - 1, lz + 3 * dz, B.leaves); }
      for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { set(lx + dx, t, lz + dz, B.leaves); set(lx + 2 * dx, t - 1, lz + 2 * dz, B.leaves); }
    } else {
      const cy = g + h;
      for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dz * dz + dy * dy * 1.5 > 5.5) continue;
        const X = lx + dx, Z = lz + dz, Y = cy + dy;
        if (X >= 0 && X < S && Z >= 0 && Z < S && Y > 0 && Y < HEIGHT && data[idx(X, Y, Z)] === B.air) data[idx(X, Y, Z)] = B.leaves;
      }
    }
  }
}
