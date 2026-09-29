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
    { name: 'Banco de España', lat: 36.72016, lon: -4.41566 },
    { name: 'El Limonar', lat: 36.72700, lon: -4.40000 },
  ],
};

// ---------- main thread: loading and slicing ----------
// The city comes in tiles of 512 x 512 blocks (public/city/<id>/), listed in
// index.json with the projection and an overview image for the maps. Tiles
// are fetched around the player; a chunk is generated once the tiles under
// it (and its margin) are here.
const MAX_TILES = 40;
export class CityData {
  static async load(id) {
    const res = await fetch(`/city/${id}/index.json`);
    if (!res.ok) throw new Error(`city ${id}: HTTP ${res.status}`);
    const c = new CityData(await res.json(), id);
    await c.ensure(c.header.spawn[0], c.header.spawn[1], 64);
    return c;
  }

  constructor(header, id) {
    this.header = header;
    this.id = id;
    this.seaY = header.seaY;
    this.T = header.tile;
    this.exists = new Set(header.tiles.map(([x, z]) => `${x},${z}`));
    this.tiles = new Map(); // "tx,tz" -> tile
    this.loading = new Map(); // "tx,tz" -> promise
    this.buildings = new Map(); // building id -> [base, height, wall, roof]
    const [x0, z0, w, d] = header.area;
    this.area = { x0, z0, w, d };
  }

  // A real place (latitude, longitude) in blocks: the build script's projection.
  toXZ(lat, lon) {
    const pr = this.header.proj;
    const lat0 = pr.lat0 * Math.PI / 180;
    const mlat = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
    const mlon = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
    return { x: Math.round((lon - pr.west) * mlon), z: Math.round((pr.north - lat) * mlat) };
  }

  key(x, z) { return `${Math.floor(x / this.T)},${Math.floor(z / this.T)}`; }
  // inside the city's area (whether its tile is here yet or not)
  inArea(x, z) { const a = this.area; return x >= a.x0 && z >= a.z0 && x < a.x0 + a.w && z < a.z0 + a.d; }

  // fetch one tile (once)
  request(k) {
    if (this.tiles.has(k) || !this.exists.has(k)) return Promise.resolve();
    if (this.loading.has(k)) return this.loading.get(k);
    const [tx, tz] = k.split(',').map(Number);
    const p = (async () => {
      try {
        const res = await fetch(`/city/${this.id}/t_${tx}_${tz}.bin.gz`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const raw = new Uint8Array(await res.arrayBuffer());
        const buf = raw[0] === 0x1f && raw[1] === 0x8b ? await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : raw.buffer;
        this.tiles.set(k, this.parse(buf, tx, tz));
        this.trim();
      } catch (e) { console.warn(`city tile ${k}:`, e.message); }
      finally { this.loading.delete(k); }
    })();
    this.loading.set(k, p);
    return p;
  }

  parse(buf, tx, tz) {
    const dv = new DataView(buf);
    const hlen = dv.getUint32(0, true);
    const h = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
    const T = h.size, n = T * T;
    let o = 4 + hlen; o += (4 - (o % 4)) % 4;
    const t = { tx, tz, x0: tx * T, z0: tz * T, used: performance.now() };
    t.ground = new Uint8Array(buf, o, n); o += n;
    t.surf = new Uint8Array(buf, o, n); o += n;
    t.wall = new Uint8Array(buf, o, n); o += n;
    t.mark = new Uint8Array(buf, o, n); o += n;
    t.bid = new Uint16Array(buf.slice(o, o + n * 2)); o += n * 2;
    // local building number -> city-wide id (and the building's look)
    t.gid = new Uint32Array(h.buildings);
    for (let r = 1; r < h.buildings; r++) {
      const b = o + r * 8, id = dv.getUint32(b, true);
      t.gid[r] = id;
      if (!this.buildings.has(id)) this.buildings.set(id, [dv.getUint8(b + 4), dv.getUint8(b + 5), dv.getUint8(b + 6), dv.getUint8(b + 7)]);
    }
    return t;
  }

  // forget tiles far from the player when there are too many
  trim() {
    if (this.tiles.size <= MAX_TILES) return;
    const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used);
    for (const [k] of old.slice(0, this.tiles.size - MAX_TILES)) this.tiles.delete(k);
  }

  // load the tiles within r blocks of (x, z)
  ensure(x, z, r = 64) {
    const ps = [];
    for (let tz = Math.floor((z - r) / this.T); tz <= Math.floor((z + r) / this.T); tz++) {
      for (let tx = Math.floor((x - r) / this.T); tx <= Math.floor((x + r) / this.T); tx++) {
        const k = `${tx},${tz}`;
        const t = this.tiles.get(k);
        if (t) t.used = performance.now(); else ps.push(this.request(k));
      }
    }
    return Promise.all(ps);
  }

  // the tile and index of a cell, or null (outside the city or not loaded yet)
  cell(x, z) {
    const t = this.tiles.get(this.key(x, z));
    if (!t) return null;
    return { t, i: (z - t.z0) * this.T + (x - t.x0) };
  }
  loaded(x, z) { return !this.exists.has(this.key(x, z)) || this.tiles.has(this.key(x, z)); }
  groundAt(x, z) { const c = this.cell(x, z); return c ? c.t.ground[c.i] : this.seaY - 5; }
  surfAt(x, z) { const c = this.cell(x, z); return c ? c.t.surf[c.i] : SURF.water; }
  wallAt(x, z) { const c = this.cell(x, z); return c ? c.t.wall[c.i] : 0; }
  markAt(x, z) { const c = this.cell(x, z); return c ? c.t.mark[c.i] : 0; }
  bidAt(x, z) { const c = this.cell(x, z); return c ? c.t.gid[c.t.bid[c.i]] : 0; }
  // what a cell holds, or null when its tile is not here: { g, s, w, b }
  at(x, z) {
    const c = this.cell(x, z);
    if (!c) return null;
    const { t, i } = c;
    return { g: t.ground[i], s: t.surf[i] & 0x7f, tree: !!(t.surf[i] & TREE_BIT), w: t.wall[i], b: t.gid[t.bid[i]] };
  }

  // can the chunk (cx, cz) be generated now? (asks for its tiles if not)
  readyFor(cx, cz) {
    let ok = true;
    for (const [x, z] of [[cx * S - M, cz * S - M], [cx * S + S + M, cz * S - M], [cx * S - M, cz * S + S + M], [cx * S + S + M, cz * S + S + M]]) {
      const k = this.key(x, z);
      if (this.exists.has(k) && !this.tiles.has(k)) { this.request(k); ok = false; }
    }
    return ok;
  }

  // The chunk's cells plus a margin, for the worker.
  slice(cx, cz) {
    const W = S + 2 * M, n = W * W;
    const ground = new Uint8Array(n), surf = new Uint8Array(n), wall = new Uint8Array(n), bid = new Uint32Array(n), mark = new Uint8Array(n);
    const bl = {};
    const x0 = cx * S - M, z0 = cz * S - M;
    for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
      const k = z * W + x, c = this.cell(x0 + x, z0 + z);
      if (!c) { ground[k] = this.seaY - 5; surf[k] = SURF.water; continue; }
      const { t, i } = c;
      ground[k] = t.ground[i]; surf[k] = t.surf[i]; wall[k] = t.wall[i]; mark[k] = t.mark[i];
      const b = t.gid[t.bid[i]];
      bid[k] = b;
      if (b && !bl[b]) bl[b] = this.buildings.get(b);
    }
    return { city: true, seaY: this.seaY, ground, surf, wall, bid, bl, mark };
  }

  // An open cell (not a building, the sea or a wall) near (x, z), or null.
  openCellNear(x, z, radius = 40) {
    for (let r = 0; r <= radius; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const a = this.at(x + dx, z + dz);
      if (a && !a.b && !a.w && a.s !== SURF.water) return { x: x + dx, z: z + dz };
    }
    return null;
  }

  // Where a new player starts: the spawn square, off any building.
  spawnPoint() {
    const [sx, sz] = this.header.spawn;
    const c = this.openCellNear(sx, sz, 40) || { x: sx, z: sz };
    return { x: c.x + 0.5, y: this.groundAt(c.x, c.z) + 1.05, z: c.z + 0.5 };
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
    if (mk === 4 && !b && g + 2 < HEIGHT) { data[idx(lx, g + 1, lz)] = B.atm; data[idx(lx, g + 2, lz)] = B.atm; }
    if ((mk === 5 || mk === 6) && !b && g + 1 < HEIGHT) data[idx(lx, g + 1, lz)] = mk === 5 ? B.market_stall : B.restaurant;
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
