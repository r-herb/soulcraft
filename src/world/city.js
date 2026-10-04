// Real-city worlds (Malaga): the world is read from a raster built from
// OpenStreetMap and open elevation data by scripts/city/build-city.mjs
// (1 block = 1 metre). The main thread loads the file and hands every chunk
// request a small padded slice of it; the worker turns the slice into
// blocks here. Map data (c) OpenStreetMap contributors, ODbL 1.0.
import { CHUNK, HEIGHT, B } from './blocks.js';
import { hash3 } from './noise.js';
import { cityGemAt } from './gems.js';

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
const ROOF_LAMPS = [B.ceiling_lamp_paving, B.ceiling_lamp_tiles, B.ceiling_lamp_lime]; // the same roofs with a light in the ceiling under them

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
    { name: 'Mercado de Atarazanas', lat: 36.71790, lon: -4.42470 },
    { name: 'Estación María Zambrano', lat: 36.71180, lon: -4.43180 },
    { name: 'La Rosaleda', lat: 36.73400, lon: -4.42670 },
    { name: 'Huelin', lat: 36.69850, lon: -4.43900 },
    { name: 'La Misericordia', lat: 36.69180, lon: -4.45020 },
    { name: 'Teatinos (Universidad)', lat: 36.71600, lon: -4.47200 },
    { name: 'Aeropuerto', lat: 36.67490, lon: -4.49910 },
    { name: 'Pedregalejo', lat: 36.71900, lon: -4.38300 },
    { name: 'El Palo', lat: 36.71940, lon: -4.36140 },
    { name: 'Ciudad Jardín', lat: 36.74400, lon: -4.42500 },
    // La Fábrica: the old tobacco factory (season 1), El Maestro's farmhouse up the hill, the old Térmica building by the sea (season 2)
    { name: 'La Tabacalera', lat: 36.70910, lon: -4.44240 },
    { name: 'Finca El Maestro', lat: 36.74650, lon: -4.42080 },
    { name: 'La Térmica', lat: 36.68930, lon: -4.44570 },
    // season 3: the old port warehouse where El Maestro is held, and the quay where the boat waits
    { name: 'Almacén del Puerto', lat: 36.71720, lon: -4.42150 },
    { name: 'Muelle de Heredia', lat: 36.71450, lon: -4.42250 },
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
    const out = { city: true, seaY: this.seaY, ground, surf, wall, bid, bl, mark };
    const bank = this.bankPlan();
    if (bank && bank.old.x1 >= x0 && bank.old.x0 < x0 + W && bank.old.z1 >= z0 && bank.old.z0 < z0 + W) out.bank = bank;
    const fab = this.fabricaPlan();
    if (fab && fab.old.x1 >= x0 && fab.old.x0 < x0 + W && fab.old.z1 >= z0 && fab.old.z0 < z0 + W) out.fab = fab;
    const oro = this.oroPlan();
    if (oro && oro.old.x1 >= x0 && oro.old.x0 < x0 + W && oro.old.z1 >= z0 && oro.old.z0 < z0 + W) out.oro = oro;
    const pu = this.puertoPlan();
    if (pu && pu.old.x1 >= x0 && pu.old.x0 < x0 + W && pu.old.z1 >= z0 && pu.old.z0 < z0 + W) out.puerto = pu;
    return out;
  }

  // The central bank (the Banco de España building): its outline, the side
  // that faces the street (the entrance), and so where its hall, counter and
  // vault go. Null when the city has none; undefined until its tile is here.
  bankPlan() {
    if (this._bank !== undefined) return this._bank;
    const r = this.standalonePlan('Banco de España');
    if (r !== undefined) this._bank = r;
    return r;
  }
  // La Fábrica: the old tobacco factory, the same way (a building of its own where it stood)
  fabricaPlan() {
    if (this._fab !== undefined) return this._fab;
    const r = this.standalonePlan('La Tabacalera', 16);
    if (r !== undefined) this._fab = r;
    return r;
  }
  // La Fábrica, season 3: the port warehouse (no deeper than 34, no wider than 34)
  puertoPlan() {
    if (this._puerto !== undefined) return this._puerto;
    const r = this.standalonePlan('Almacén del Puerto', 18);
    if (r !== undefined) this._puerto = r && clampPlan(r, 34, 34);
    return this._puerto;
  }
  // La Fábrica, season 2: the gold vault in La Térmica (no deeper than 42, no wider than 34)
  oroPlan() {
    if (this._oro !== undefined) return this._oro;
    const r = this.standalonePlan('La Térmica', 18);
    if (r !== undefined) this._oro = r && clampPlan(r, 42, 34);
    return this._oro;
  }

  // A building of its own where a named place's biggest building stood: the
  // biggest rectangle inside that outline (at least min across), its entrance
  // facing the nearest street. Null when there is none, undefined until the
  // tile is here.
  standalonePlan(name, min = 12) {
    const pl = (CITY_PLACES[this.id] || []).find((p) => p.name === name);
    if (!pl) return null;
    const q = this.toXZ(pl.lat, pl.lon);
    if (!this.cell(q.x, q.z)) return undefined;
    // the biggest building by the place
    const near = new Set();
    for (let dz = -30; dz <= 30; dz++) for (let dx = -30; dx <= 30; dx++) { const b = this.bidAt(q.x + dx, q.z + dz); if (b) near.add(b); }
    const STREETS = [SURF.road, SURF.pavement, SURF.marble, SURF.plaza, SURF.steps];
    let best = null;
    for (const gid of near) {
      let sx = 0, sz = 0, found = false;
      for (let dz = -30; dz <= 30 && !found; dz++) for (let dx = -30; dx <= 30; dx++) if (this.bidAt(q.x + dx, q.z + dz) === gid) { sx = q.x + dx; sz = q.z + dz; found = true; break; }
      // its cells (flood fill), the outline, and the edge cells on a street, by side
      const seen = new Set([`${sx},${sz}`]), todo = [[sx, sz]];
      let x0 = sx, x1 = sx, z0 = sz, z1 = sz;
      const street = [[], [], [], []]; // edge cells on a street along the -z, +x, +z, -x sides
      while (todo.length && seen.size < 20000) {
        const [x, z] = todo.pop();
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dz], side) => {
          const nx = x + dx, nz = z + dz, k = `${nx},${nz}`;
          if (this.bidAt(nx, nz) === gid) { if (!seen.has(k)) { seen.add(k); todo.push([nx, nz]); } return; }
          const a = this.at(nx, nz);
          if (a && !a.b && STREETS.includes(a.s & 0x7f)) street[side].push([x, z]);
        });
      }
      if (!best || seen.size > best.n) best = { gid, n: seen.size, x0, z0, x1, z1, street };
    }
    if (!best) return null;
    // The bank stands free on a marble square where that building was: the
    // biggest rectangle inside its outline (with what stands in its yards).
    const { gid, x0, z0, x1, z1 } = best;
    const OPEN = [SURF.ground, SURF.park, SURF.garden, SURF.forest, SURF.scrub];
    const W = x1 - x0 + 1, D = z1 - z0 + 1, ok = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const a = this.at(x0 + x, z0 + z);
      ok[z * W + x] = a && (a.b ? true : OPEN.includes(a.s & 0x7f)) ? 1 : 0;
    }
    // largest rectangle of ok cells (histograms, row by row), at least 12 across
    const hgt = new Int32Array(W);
    let rect = null, area = 0;
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) hgt[x] = ok[z * W + x] ? hgt[x] + 1 : 0;
      for (let x = 0; x < W; x++) {
        let h = 1e9;
        for (let x2 = x; x2 < W && hgt[x2]; x2++) {
          h = Math.min(h, hgt[x2]);
          const w = x2 - x + 1, ar = w * Math.min(h, Math.round(w * 1.6));
          if (w >= min && h >= min && ar > area) { area = ar; rect = { x0: x0 + x, x1: x0 + x2, z1: z0 + z, z0: z0 + z - Math.min(h, Math.round(w * 1.6)) + 1 }; }
        }
      }
    }
    if (!rect) return null;
    // the entrance faces the nearest street
    const reach = (x, z, dx, dz) => { for (let k = 1; k < 40; k++) { const a = this.at(x + dx * k, z + dz * k); if (a && !a.b && STREETS.includes(a.s & 0x7f)) return k; } return 99; };
    const mx = Math.round((rect.x0 + rect.x1) / 2), mz = Math.round((rect.z0 + rect.z1) / 2);
    const sides = [reach(mx, rect.z0, 0, -1), reach(rect.x1, mz, 1, 0), reach(mx, rect.z1, 0, 1), reach(rect.x0, mz, -1, 0)];
    const side = sides.indexOf(Math.min(...sides));
    const door = side === 0 ? { x: mx, z: rect.z0 } : side === 1 ? { x: rect.x1, z: mz } : side === 2 ? { x: mx, z: rect.z1 } : { x: rect.x0, z: mz };
    const base = (this.buildings.get(gid) || [this.groundAt(mx, mz)])[0];
    return { gid, ...rect, side, door, base, old: { x0, z0, x1, z1 } };
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

// A cell of the bank: d its depth from the entrance's wall (into the
// building), a across, mid the entrance; depth how deep the building goes.
export function bankCoords(P, x, z) {
  const along = P.side === 0 || P.side === 2;
  const d = P.side === 0 ? z - P.door.z : P.side === 2 ? P.door.z - z : P.side === 1 ? P.door.x - x : x - P.door.x;
  const depth = P.side === 0 ? P.z1 - P.door.z : P.side === 2 ? P.door.z - P.z0 : P.side === 1 ? P.door.x - P.x0 : P.x1 - P.door.x;
  const a = along ? x - P.x0 : z - P.z0, mid = along ? P.door.x - P.x0 : P.door.z - P.z0;
  return { d, a, mid, depth };
}
// the inverse: the cell at depth d and across a
export function bankPoint(P, d, a) {
  const along = P.side === 0 || P.side === 2;
  const x = along ? P.x0 + a : P.side === 1 ? P.door.x - d : P.door.x + d;
  const z = along ? (P.side === 0 ? P.door.z + d : P.door.z - d) : P.z0 + a;
  return { x, z };
}

// Where the bank's counter and vault wall stand, by the building's depth
// (from the entrance).
export function bankLayout(depth) {
  const vault = Math.max(6, depth - Math.max(5, Math.min(10, Math.round(depth * 0.3))));
  const counter = Math.max(3, Math.min(vault - 3, Math.round(depth * 0.35)));
  const diamond = Math.round((vault + depth) / 2);
  // the sewer: a hatch in a corner of the hall, a tunnel under the counter, a hatch in the vault's floor
  return { counter, vault, diamond, sewer: { a: 2, from: 2, to: vault + 1 } };
}
export const bankWidth = (P) => (P.side === 0 || P.side === 2 ? P.x1 - P.x0 : P.z1 - P.z0);

// La Fábrica inside, by depth from the entrance and width across: the lobby
// with the red phone, the print hall with its presses in rows, paper and ink
// along the side wall, then at the back the canteen (where the workers wait)
// and the pallet room (where the printed money piles up), and under the floor
// the escape tunnel from a hatch in the pallet room to one under the lobby.
export function fabLayout(depth, width) {
  const back = Math.max(10, depth - 8), half = Math.floor(width / 2);
  const presses = [];
  for (let d = 7; d <= back - 3; d += 5) for (let a = 5; a <= width - 5; a += 6) presses.push([d, a]);
  const pallets = [];
  for (let d = back + 2; d < depth - 1 && pallets.length < 12; d += 2) for (let a = half + 2; a < width - 4 && pallets.length < 12; a += 2) pallets.push([d, a]);
  return { lobby: 4, back, half, presses: presses.slice(0, 8), pallets, phone: [2, 2], paper: [6, 1], ink: [11, 1], backDoor: [depth, width - 3], tunnel: { a: width - 3, from: back + 2, to: 3 } };
}

// A standalone plan cut down to at most maxD deep (from the entrance) and
// maxW across (around the entrance), so a big block does not make a huge hall.
export function clampPlan(P, maxD, maxW) {
  const R = { ...P }, along = P.side === 0 || P.side === 2;
  if (P.side === 0) R.z1 = Math.min(P.z1, P.z0 + maxD);
  else if (P.side === 2) R.z0 = Math.max(P.z0, P.z1 - maxD);
  else if (P.side === 1) R.x0 = Math.max(P.x0, P.x1 - maxD);
  else R.x1 = Math.min(P.x1, P.x0 + maxD);
  const cut = (lo, hi, c) => { if (hi - lo <= maxW) return [lo, hi]; let a = Math.max(lo, c - Math.floor(maxW / 2)); if (a + maxW > hi) a = hi - maxW; return [a, a + maxW]; };
  if (along) { [R.x0, R.x1] = cut(P.x0, P.x1, P.door.x); R.door = { x: Math.round((R.x0 + R.x1) / 2), z: P.door.z }; }
  else { [R.z0, R.z1] = cut(P.z0, P.z1, P.door.z); R.door = { x: P.door.x, z: Math.round((R.z0 + R.z1) / 2) }; }
  return R;
}

// La Térmica inside (season 2), by depth from the entrance and width across:
// the lobby with the red phone and the generator, the melting hall with its
// furnaces, the pumps by the vault's wall, then the vault with gold bars on
// its shelves and the outflow grate (the way out to the sea) in its floor.
export function oroLayout(depth, width) {
  const vault = Math.max(14, depth - 12), mid = Math.floor(width / 2);
  const furnaces = [];
  for (let d = 8; d <= vault - 4 && furnaces.length < 4; d += 6) for (const a of [mid - 6, mid + 6]) if (a >= 3 && a <= width - 3 && furnaces.length < 4) furnaces.push([d, a]);
  const shelves = [];
  for (let d = vault + 2; d <= depth - 2; d += 2) for (const a of [1, width - 1]) shelves.push([d, a]);
  for (let d = vault + 3; d <= depth - 3; d += 3) for (const a of [mid - 4, mid + 4]) shelves.push([d, a]);
  return { vault, mid, furnaces, shelves, phone: [2, 2], generator: [2, width - 2], pumps: [[vault - 2, 2], [vault - 2, width - 2]], outflow: [depth - 2, mid], hall: [5, vault - 2] };
}

// The port warehouse inside (season 3), by depth from the entrance and width
// across: the lobby with the fuse box, a hall of crates watched by two
// sweeping cameras, a narrow corridor crossed by two laser beams, then the
// office with the safe (left) and the barred cell where El Maestro is held
// (right, at the back).
export function puertoLayout(depth, width) {
  const mid = Math.floor(width / 2), c0 = Math.max(12, depth - 12);
  const crates = [[6, mid - 5], [6, mid + 5], [9, mid - 2], [9, mid + 3], [7, 3], [8, width - 3], [c0 - 2, 4], [c0 - 2, width - 5]].filter(([d, a]) => d > 4 && d < c0 && a > 0 && a < width);
  const hallMid = [Math.floor((4 + c0) / 2), mid];
  return {
    mid, c0, crates, hallMid,
    fuse: [2, width - 2], safe: [depth - 2, 2],
    lasers: [c0 + 1, c0 + 3], corridor: [mid - 1, mid + 1],
    cell: { a0: width - 7, d0: depth - 7, door: [depth - 7, width - 4], maestro: [depth - 3, width - 3] },
    cams: [{ d: 4, a: 1 }, { d: c0 - 1, a: width - 1 }],
  };
}

// ---------- worker: blocks for one chunk ----------
export function genCity(cx, cz, data, e) {
  const W = S + 2 * M, seaY = e.seaY;
  const at = (lx, lz) => (lz + M) * W + (lx + M);
  const set = (x, y, z, id) => { if (x >= 0 && x < S && z >= 0 && z < S && y > 0 && y < HEIGHT) data[idx(x, y, z)] = id; };
  for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
    const k = at(lx, lz), wx = cx * S + lx, wz = cz * S + lz;
    const g = Math.min(HEIGHT - 2, e.ground[k]);
    let s = e.surf[k] & 0x7f, b = e.bid[k];
    // the central bank: a building of its own on a marble square
    const bk = e.bank;
    if (bk && wx >= bk.x0 && wx <= bk.x1 && wz >= bk.z0 && wz <= bk.z1) { data[idx(lx, 0, lz)] = B.coreite; for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = B.stone; bankBuilding(lx, lz, wx, wz, g); continue; }
    if (bk && b === bk.gid) { b = 0; s = SURF.marble; }
    // La Fábrica: the old tobacco factory, on a square of its own
    const fb = e.fab;
    if (fb && wx >= fb.x0 && wx <= fb.x1 && wz >= fb.z0 && wz <= fb.z1) { data[idx(lx, 0, lz)] = B.coreite; for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = B.stone; fabricaBuilding(lx, lz, wx, wz, g); continue; }
    if (fb && b === fb.gid) { b = 0; s = SURF.paving; }
    // La Térmica (season 2): the gold vault, on a square of its own
    const ob = e.oro;
    if (ob && wx >= ob.x0 && wx <= ob.x1 && wz >= ob.z0 && wz <= ob.z1) { data[idx(lx, 0, lz)] = B.coreite; for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = B.stone; oroBuilding(lx, lz, wx, wz, g); continue; }
    if (ob && b === ob.gid) { b = 0; s = SURF.paving; }
    // the port warehouse (season 3)
    const pb = e.puerto;
    if (pb && wx >= pb.x0 && wx <= pb.x1 && wz >= pb.z0 && wz <= pb.z1) { data[idx(lx, 0, lz)] = B.coreite; for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = B.stone; puertoBuilding(lx, lz, wx, wz, g); continue; }
    if (pb && b === pb.gid) { b = 0; s = SURF.paving; }
    data[idx(lx, 0, lz)] = B.coreite;
    const natural = NATURAL.has(s) && !b;
    for (let y = 1; y < g; y++) data[idx(lx, y, lz)] = natural && y >= g - 3 ? (s === SURF.sand ? B.sand : B.dirt) : (y < g - 3 && cityGemAt(wx, y, wz)) || B.stone;
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
    // lights in the ceilings of the rooms (in every fourth cell each way), seen through the windows at night
    const light = !edge && ((wx % 4) + 4) % 4 === 2 && ((wz % 4) + 4) % 4 === 2;
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      if (edge) {
        const win = glass || (stone
          ? r % 12 >= 4 && r % 12 <= 8 && (wx + wz) % 7 === 3
          : r % 4 >= 2 && r % 4 <= 3 && (wx + wz) % 3 !== 0 && r > 1);
        const plaque = r === 3 && e.mark && e.mark[k] >= 10 && e.mark[k] <= 19;
        data[idx(lx, y, lz)] = plaque ? B.num_0 + e.mark[k] - 10 : door && r <= 2 ? B.air : win ? B.window : wallId;
      } else data[idx(lx, y, lz)] = r % 4 === 0 ? (light ? B.ceiling_lamp : B.planks) : B.air;
    }
    data[idx(lx, topY, lz)] = edge && roof !== 1 ? wallId : light ? ROOF_LAMPS[roof] ?? B.ceiling_lamp_paving : ROOFS[roof] ?? B.paving;
    // a low parapet around flat terraces
    if (edge && roof === 0 && topY + 1 < HEIGHT) data[idx(lx, topY + 1, lz)] = wallId;
    if (roof === 1 && edge && topY + 1 < HEIGHT) data[idx(lx, topY, lz)] = B.roof_tiles;
  }

  // The central bank: stone walls nothing can break, a tall marble hall
  // behind a wide door on the street, the counter across the hall, and the
  // vault at the back behind a steel door.
  function bankBuilding(lx, lz, wx, wz, g) {
    const P = e.bank, base = P.base;
    const topY = Math.min(HEIGHT - 2, base + 16);
    // d: depth from the entrance, a: across the front
    const { d, a, mid, depth } = bankCoords(P, wx, wz);
    const plan = bankLayout(depth);
    const edge = wx === P.x0 || wx === P.x1 || wz === P.z0 || wz === P.z1;
    for (let y = Math.min(g, base) + 1; y < base; y++) data[idx(lx, y, lz)] = B.stone;
    for (let y = base + 1; y <= g; y++) data[idx(lx, y, lz)] = B.air;
    data[idx(lx, base, lz)] = edge ? B.bank_stone : d >= plan.vault ? B.vault_floor : B.marble;
    // the old sewer under the bank: two hatches and a low tunnel between them
    const sw = plan.sewer;
    if (a === sw.a && d >= sw.from && d <= sw.to && !edge) {
      if (base - 3 > 0) data[idx(lx, base - 3, lz)] = (d - sw.from) % 5 === 2 ? B.bank_lamp : B.stone;
      for (const y of [base - 2, base - 1]) if (y > 0) data[idx(lx, y, lz)] = B.air;
      if (d === sw.from || d === sw.to) data[idx(lx, base, lz)] = B.sewer_grate;
    }
    const HALL = 8;
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      let id = B.air;
      if (edge) {
        const front = d === 0 && Math.abs(a - mid) <= 2;
        const door = front && Math.abs(a - mid) <= 1 && r <= 3;
        const sign = front && Math.abs(a - mid) <= 2 && r === 5;
        const corner = (wx === P.x0 || wx === P.x1) && (wz === P.z0 || wz === P.z1);
        const win = !corner && r % 4 >= 2 && r % 4 <= 3 && ((a % 3) + 3) % 3 === 1 && r > 1 && d < plan.vault;
        const weak = d === depth && Math.abs(a - mid) <= 1 && r <= 2; // the weak spot in the vault's back wall (the heist map shows it)
        id = door ? B.air : sign ? B.bank_sign : weak ? B.weak_wall : win ? B.window : B.bank_stone;
      } else if (r < HALL) {
        if (d === plan.counter && r === 1 && Math.abs(a - mid) > 1) id = B.bank_counter; // a gap in the middle to walk behind
        else if (d === plan.counter && r === 2 && Math.abs(a - mid) > 1 && a % 2 === 0) id = B.window; // the tellers' glass
        else if (d === plan.vault && r <= 4) id = Math.abs(a - mid) <= 0 && r <= 2 ? B.vault_door : B.bank_stone; // the vault's wall and door
        else if (d === plan.diamond && a === mid && r <= 2) id = r === 1 ? B.bank_stone : B.grand_diamond; // the Gran Diamante on its pedestal
        else if (d > plan.vault && r <= 2 && (a === 1 || a === bankWidth(P) - 1) && d % 2 === 0) id = B.vault_gold; // gold bars along the sides
        else if (d > plan.vault && r === 5) id = ((a % 5) + 5) % 5 === 2 && d % 4 === 1 ? B.bank_lamp : B.bank_stone; // the vault's ceiling, with lamps
        else if (d < plan.counter && a % 6 === 3 && d % 6 === 3 && d > 1) id = B.limestone; // pillars in the hall
      } else if (r === HALL) id = d < plan.vault && ((a % 4) + 4) % 4 === 2 && ((d % 4) + 4) % 4 === 2 ? B.bank_lamp : B.planks; // lamps in the hall's ceiling
      else id = r % 4 === 0 ? B.planks : B.air;
      data[idx(lx, y, lz)] = id;
    }
    data[idx(lx, topY, lz)] = B.bank_stone;
    if (edge && topY + 1 < HEIGHT) data[idx(lx, topY + 1, lz)] = B.bank_stone;
  }

  // La Fábrica: brick walls with tall windows, steel doors, a concrete hall
  // with the presses, the back rooms, and the tunnel under the floor
  function fabricaBuilding(lx, lz, wx, wz, g) {
    const P = e.fab, base = P.base;
    const topY = Math.min(HEIGHT - 2, base + 9);
    const { d, a, mid, depth } = bankCoords(P, wx, wz);
    const width = bankWidth(P), L = fabLayout(depth, width);
    const edge = wx === P.x0 || wx === P.x1 || wz === P.z0 || wz === P.z1;
    for (let y = Math.min(g, base) + 1; y < base; y++) data[idx(lx, y, lz)] = B.stone;
    for (let y = base + 1; y <= g; y++) data[idx(lx, y, lz)] = B.air;
    data[idx(lx, base, lz)] = edge ? B.brick : B.concrete;
    // the tunnel: two blocks of soft earth to dig through, from the pallet room's hatch to the lobby's
    const tn = L.tunnel;
    if (!edge && a === tn.a && d >= tn.to && d <= tn.from) {
      if (base - 3 > 0) data[idx(lx, base - 3, lz)] = (d - tn.to) % 6 === 3 ? B.bank_lamp : B.stone;
      for (const y of [base - 2, base - 1]) if (y > 0) data[idx(lx, y, lz)] = d === tn.from || d === tn.to ? B.air : B.soft_earth;
      if (d === tn.from || d === tn.to) data[idx(lx, base, lz)] = B.sewer_grate;
    }
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      let id = B.air;
      if (edge) {
        const front = d === 0 && Math.abs(a - mid) <= 1 && r <= 3;
        const backDoor = d === depth && a === L.backDoor[1] && r <= 2;
        const sign = d === 0 && Math.abs(a - mid) <= 3 && r === 5;
        const win = r >= 3 && r <= 5 && ((a % 4) + 4) % 4 === 2 && !(d === 0 && Math.abs(a - mid) <= 3);
        id = front || backDoor ? B.factory_door : sign ? B.fab_sign : win ? B.window : B.brick;
      } else if (r === 7) id = ((a % 5) + 5) % 5 === 2 && ((d % 5) + 5) % 5 === 2 ? B.bank_lamp : B.concrete; // the ceiling, with lamps
      else if (r < 7) {
        const inBack = d >= L.back;
        const door1 = Math.floor(L.half / 2), door2 = L.half + Math.floor((width - L.half) / 2);
        if (d === L.back && !(r <= 2 && (a === door1 || a === door2))) id = B.brick; // the back rooms' wall, a door to each
        else if (inBack && a === L.half && r < 7) id = B.brick; // between the canteen and the pallet room
        else if (inBack && a < L.half && r === 1 && (d - L.back) % 3 === 2 && a % 3 !== 0) id = B.planks; // the canteen's tables
        else if (r === 1 && L.presses.some(([pd, pa]) => pd === d && pa === a)) id = B.money_press;
        else if (a === 1 && r <= 2 && d >= L.paper[0] && d < L.paper[0] + 4 && d < L.back) id = B.paper_stack;
        else if (a === 1 && r === 1 && d >= L.ink[0] && d < L.ink[0] + 2 && d < L.back) id = B.ink_barrel;
        else if (d === L.phone[0] && a === L.phone[1] && r === 1) id = B.red_phone;
      }
      data[idx(lx, y, lz)] = id;
    }
    data[idx(lx, topY, lz)] = B.concrete;
  }
  // La Térmica (season 2): white walls, the melting hall, the vault with its gold
  function oroBuilding(lx, lz, wx, wz, g) {
    const P = e.oro, base = P.base;
    const topY = Math.min(HEIGHT - 2, base + 9);
    const { d, a, mid, depth } = bankCoords(P, wx, wz);
    const width = bankWidth(P), L = oroLayout(depth, width);
    const edge = wx === P.x0 || wx === P.x1 || wz === P.z0 || wz === P.z1;
    for (let y = Math.min(g, base) + 1; y < base; y++) data[idx(lx, y, lz)] = B.stone;
    for (let y = base + 1; y <= g; y++) data[idx(lx, y, lz)] = B.air;
    const inVault = d > L.vault && !edge;
    data[idx(lx, base, lz)] = edge ? B.plaster_white : d === L.outflow[0] && a === L.outflow[1] ? B.sewer_grate : inVault ? B.vault_floor : B.concrete;
    // under the outflow grate: the pipe's mouth
    if (d === L.outflow[0] && a === L.outflow[1]) for (const y of [base - 2, base - 1]) if (y > 0) data[idx(lx, y, lz)] = B.air;
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      let id = B.air;
      if (edge) {
        const front = d === 0 && Math.abs(a - mid) <= 1 && r <= 3;
        const sign = d === 0 && Math.abs(a - mid) <= 3 && r === 5;
        const win = r >= 3 && r <= 5 && ((a % 4) + 4) % 4 === 2 && !(d === 0 && Math.abs(a - mid) <= 3) && d < L.vault;
        id = front ? B.factory_door : sign ? B.oro_sign : win ? B.window : B.plaster_white;
      } else if (r === 7) id = ((a % 5) + 5) % 5 === 2 && ((d % 5) + 5) % 5 === 2 ? B.bank_lamp : B.concrete; // the ceiling, with lamps
      else if (r < 7) {
        if (d === L.vault) id = Math.abs(a - L.mid) <= 1 && r <= 3 ? B.air : Math.abs(a - L.mid) === 2 && r <= 4 ? B.vault_door : B.bank_stone; // the vault's wall, its doorway open
        else if (r <= 2 && L.shelves.some(([sd, sa]) => sd === d && sa === a)) id = B.gold_shelf;
        else if (r === 1 && L.furnaces.some(([fd, fa]) => fd === d && fa === a)) id = B.gold_furnace;
        else if (r === 1 && L.pumps.some(([pd, pa]) => pd === d && pa === a)) id = B.water_pump;
        else if (r === 1 && d === L.generator[0] && a === L.generator[1]) id = B.generator;
        else if (r === 1 && d === L.phone[0] && a === L.phone[1]) id = B.red_phone;
      }
      data[idx(lx, y, lz)] = id;
    }
    data[idx(lx, topY, lz)] = B.concrete;
  }
  // the port warehouse (season 3): cream walls, crates, a laser corridor, the office and the cell
  function puertoBuilding(lx, lz, wx, wz, g) {
    const P = e.puerto, base = P.base;
    const topY = Math.min(HEIGHT - 2, base + 8);
    const { d, a, mid, depth } = bankCoords(P, wx, wz);
    const width = bankWidth(P), L = puertoLayout(depth, width);
    const edge = wx === P.x0 || wx === P.x1 || wz === P.z0 || wz === P.z1;
    for (let y = Math.min(g, base) + 1; y < base; y++) data[idx(lx, y, lz)] = B.stone;
    for (let y = base + 1; y <= g; y++) data[idx(lx, y, lz)] = B.air;
    data[idx(lx, base, lz)] = edge ? B.plaster_cream : B.concrete;
    const C = L.cell, inCorridor = d >= L.c0 && d <= L.c0 + 3;
    for (let y = base + 1; y < topY; y++) {
      const r = y - base;
      let id = B.air;
      if (edge) {
        const front = d === 0 && Math.abs(a - mid) <= 1 && r <= 3;
        const sign = d === 0 && Math.abs(a - mid) <= 3 && r === 5;
        const win = r >= 3 && r <= 4 && ((a % 4) + 4) % 4 === 2 && !(d === 0 && Math.abs(a - mid) <= 3);
        id = front ? B.factory_door : sign ? B.puerto_sign : win ? B.window : B.plaster_cream;
      } else if (r === 6) id = ((a % 5) + 5) % 5 === 2 && ((d % 5) + 5) % 5 === 2 ? B.bank_lamp : B.concrete; // the ceiling, with lamps
      else if (r < 6) {
        if (inCorridor && (a < L.corridor[0] || a > L.corridor[1])) id = B.plaster_cream; // the corridor's walls
        else if (r <= 2 && L.crates.some(([cd, ca]) => cd === d && ca === a)) id = B.crate;
        else if (r === 1 && d === L.fuse[0] && a === L.fuse[1]) id = B.fuse_box;
        else if (r === 1 && d === L.safe[0] && a === L.safe[1]) id = B.safe;
        else if (r <= 3 && ((a === C.a0 && d >= C.d0) || (d === C.d0 && a >= C.a0))) id = d === C.door[0] && a === C.door[1] && r <= 2 ? B.cell_door : B.cell_bars;
      }
      data[idx(lx, y, lz)] = id;
    }
    data[idx(lx, topY, lz)] = B.concrete;
  }



  // A hidden gem cache in about one chunk in eight: a stone lid flush with
  // the ground of a park, a garden, a beach or a square.
  if (hash3(cx, 5, cz, 31) < 0.12) {
    const lx = Math.floor(hash3(cx, 6, cz, 31) * S), lz = Math.floor(hash3(cx, 7, cz, 31) * S), k = at(lx, lz);
    const s = e.surf[k] & 0x7f, g = Math.min(HEIGHT - 2, e.ground[k]), wx = cx * S + lx, wz = cz * S + lz;
    const inBank = (e.bank && wx >= e.bank.old.x0 && wx <= e.bank.old.x1 && wz >= e.bank.old.z0 && wz <= e.bank.old.z1) || (e.fab && wx >= e.fab.old.x0 && wx <= e.fab.old.x1 && wz >= e.fab.old.z0 && wz <= e.fab.old.z1) || (e.oro && wx >= e.oro.old.x0 && wx <= e.oro.old.x1 && wz >= e.oro.old.z0 && wz <= e.oro.old.z1) || (e.puerto && wx >= e.puerto.old.x0 && wx <= e.puerto.old.x1 && wz >= e.puerto.old.z0 && wz <= e.puerto.old.z1);
    if (!e.bid[k] && !e.mark[k] && !e.wall[k] && !inBank && [SURF.park, SURF.garden, SURF.sand, SURF.plaza, SURF.ground, SURF.scrub, SURF.forest].includes(s) && g > seaY) data[idx(lx, g, lz)] = B.gem_cache;
  }

  // Trees (from OpenStreetMap, plus a scattering in parks): palms on the
  // streets and squares, round trees elsewhere. Neighbours' trees reach in.
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const k = z * W + x;
    if (!(e.surf[k] & TREE_BIT) || e.bid[k]) continue;
    const lx = x - M, lz = z - M, wx = cx * S + lx, wz = cz * S + lz;
    if (e.bank && wx >= e.bank.x0 - 3 && wx <= e.bank.x1 + 3 && wz >= e.bank.z0 - 3 && wz <= e.bank.z1 + 3) continue; // none on the bank
    if (e.fab && wx >= e.fab.x0 - 3 && wx <= e.fab.x1 + 3 && wz >= e.fab.z0 - 3 && wz <= e.fab.z1 + 3) continue; // nor on the factory
    if (e.oro && wx >= e.oro.x0 - 3 && wx <= e.oro.x1 + 3 && wz >= e.oro.z0 - 3 && wz <= e.oro.z1 + 3) continue; // nor on La Térmica
    if (e.puerto && wx >= e.puerto.x0 - 3 && wx <= e.puerto.x1 + 3 && wz >= e.puerto.z0 - 3 && wz <= e.puerto.z1 + 3) continue; // nor on the port warehouse
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

  // Street lamps: in each 8x8 square of the map, one on a pavement beside a
  // road (or on a square or a promenade): a thin iron post three blocks high
  // with a lantern on top that lights the street at night. Not in front of a
  // door, not on a stop sign or a stall, and not into a tree.
  const surf = (k) => e.surf[k] & 0x7f;
  const nearBy = (lx, lz, r, f) => { for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (f(at(lx + dx, lz + dz))) return true; return false; };
  const onSquare = (wx, wz) => [e.bank, e.fab, e.oro, e.puerto].some((q) => q && ((wx >= q.x0 - 3 && wx <= q.x1 + 3 && wz >= q.z0 - 3 && wz <= q.z1 + 3) || (q.old && wx >= q.old.x0 - 3 && wx <= q.old.x1 + 3 && wz >= q.old.z0 - 3 && wz <= q.old.z1 + 3)));
  const doorNext = (lx, lz) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
    const n = at(lx + dx, lz + dz), b = e.bid[n];
    return b && (hash3(cx * S + lx + dx, 5, cz * S + lz + dz, b) < 0.12 || e.mark[n] >= 10);
  });
  const lamp = (q) => { for (let y = q.g + 1; y <= q.g + 3; y++) data[idx(q.lx, y, q.lz)] = B.lamp_post; data[idx(q.lx, q.g + 4, q.lz)] = B.street_lamp; };
  for (let gz = 0; gz < S; gz += 8) for (let gx = 0; gx < S; gx += 8) {
    const found = [];
    for (let lz = gz; lz < gz + 8; lz++) for (let lx = gx; lx < gx + 8; lx++) {
      const k = at(lx, lz), s = surf(k), wx = cx * S + lx, wz = cz * S + lz;
      if (e.bid[k] || e.mark[k] || e.wall[k] || (e.surf[k] & TREE_BIT)) continue;
      if (s !== SURF.pavement && s !== SURF.plaza && s !== SURF.marble && s !== SURF.dock) continue;
      if (s === SURF.pavement && !nearBy(lx, lz, 3, (n) => surf(n) === SURF.road && !e.bid[n])) continue;
      if (doorNext(lx, lz) || nearBy(lx, lz, 1, (n) => e.mark[n] >= 3 && e.mark[n] <= 6) || onSquare(wx, wz)) continue;
      const g = Math.min(HEIGHT - 2, e.ground[k]);
      if (g <= seaY || g + 4 >= HEIGHT) continue;
      let free = true;
      for (let y = g + 1; y <= g + 4; y++) if (data[idx(lx, y, lz)] !== B.air) free = false;
      if (!free) continue;
      found.push({ lx, lz, g, sc: hash3(wx, 11, wz, 5) });
    }
    if (!found.length) continue;
    found.sort((a, b) => a.sc - b.sc);
    lamp(found[0]);
  }
}
