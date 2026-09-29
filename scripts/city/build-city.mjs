// Builds a real-city world file from OpenStreetMap data and open elevation
// data: a 1 block = 1 metre raster of the ground height, the kind of
// surface (road, pavement, park, beach, sea...) and which building stands
// on each cell, plus a table of buildings (base, height, wall and roof).
//
//   node scripts/city/build-city.mjs malaga
//
// Reads data/city/<city>-osm.json.gz (from the city-data branch, see the
// "City data" workflow) and the Terrain Tiles on AWS; writes
// public/city/<city>.bin.gz, which the game loads for a city world.
// Map data (c) OpenStreetMap contributors, ODbL 1.0.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CITIES } from './cities.mjs';
import { loadElevation } from './elevation.mjs';

const id = process.argv[2] || 'malaga';
const city = CITIES[id];
const [S, W, N, E] = city.bbox;

// ---------- projection: metres east (x) and south (z) of the north-west corner ----------
const lat0 = (S + N) / 2 * Math.PI / 180;
const MLAT = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
const MLON = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
const px = (lon) => (lon - W) * MLON;
const pz = (lat) => (N - lat) * MLAT;
const WIDTH = Math.ceil(px(E)), DEPTH = Math.ceil(pz(S));
const CELLS = WIDTH * DEPTH;
console.log(`${city.name}: ${WIDTH} x ${DEPTH} m (${(CELLS / 1e6).toFixed(1)} M cells)`);

// ---------- world heights ----------
export const SEA_Y = 6; // water surface; land starts one above
const VSCALE = 0.82; // hills a little flatter so Gibralfaro fits under the sky limit
const MAX_Y = 118;

// surface codes (the game's generator knows the same list)
export const SURF = {
  ground: 0, road: 1, pavement: 2, marble: 3, park: 4, sand: 5, water: 6, riverbed: 7, rail: 8,
  plaza: 9, forest: 10, dock: 11, steps: 12, scrub: 13, garden: 14, parking: 15, wall: 16, pitch: 17,
};
const TREE_BIT = 0x80;

// building materials (walls / roofs)
export const MAT = { white: 0, cream: 1, ochre: 2, terracotta: 3, limestone: 4, brick: 5, glass: 6, concrete: 7, sandstone: 8 };
export const ROOF = { flat: 0, tiles: 1, stone: 2 };

// ---------- data ----------
const osm = JSON.parse(gunzipSync(readFileSync(`data/city/${id}-osm.json.gz`)).toString('utf8'));
console.log(`${osm.elements.length} OSM elements`);
const elevAt = await loadElevation(city.bbox, `data/city/elev-${id}`);

const elev = new Float32Array(CELLS);
for (let z = 0; z < DEPTH; z++) {
  const lat = N - (z + 0.5) / MLAT;
  for (let x = 0; x < WIDTH; x++) elev[z * WIDTH + x] = elevAt(lat, W + (x + 0.5) / MLON);
}

const surf = new Uint8Array(CELLS);
const bid = new Uint16Array(CELLS);
const wallH = new Uint8Array(CELLS); // city walls: height above ground
let sea = new Uint8Array(CELLS); // 1 = sea or harbour water

// ---------- geometry helpers ----------
const ringXY = (geom) => geom.map((p) => [px(p.lon), pz(p.lat)]);

// even-odd scanline fill of one or more rings (outer + holes)
function fillPolygon(rings, fn) {
  let minZ = Infinity, maxZ = -Infinity;
  for (const r of rings) for (const [, z] of r) { if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
  const z0 = Math.max(0, Math.floor(minZ)), z1 = Math.min(DEPTH - 1, Math.ceil(maxZ));
  for (let z = z0; z <= z1; z++) {
    const zc = z + 0.5, xs = [];
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xa, za] = r[i], [xb, zb] = r[j];
      if ((za > zc) !== (zb > zc)) xs.push(xa + ((zc - za) / (zb - za)) * (xb - xa));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(WIDTH - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) fn(z * WIDTH + x, x, z);
    }
  }
}

// a thick line (roads, walls): every cell within width/2 of the segment
function strokeLine(pts, width, fn) {
  const r = width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(WIDTH - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - r - 1)), z1 = Math.min(DEPTH - 1, Math.ceil(Math.max(az, bz) + r + 1));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      const t = Math.max(0, Math.min(1, ((cx - ax) * dx + (cz - az) * dz) / L2));
      const ex = ax + t * dx - cx, ez = az + t * dz - cz;
      if (ex * ex + ez * ez <= r * r) fn(z * WIDTH + x, x, z);
    }
  }
}

// rings of a way or multipolygon relation (outer and inner members joined)
function rings(el) {
  if (el.type === 'way') return el.geometry && el.geometry.length > 2 ? [ringXY(el.geometry)] : [];
  if (el.type !== 'relation' || !el.members) return [];
  const parts = el.members.filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1).map((m) => ringXY(m.geometry));
  // join open member ways end to end into closed rings
  const out = [];
  const open = [];
  for (const p of parts) {
    const a = p[0], b = p[p.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) out.push(p); else open.push(p.slice());
  }
  while (open.length) {
    let cur = open.shift();
    for (let guard = 0; guard < 500 && open.length; guard++) {
      const end = cur[cur.length - 1];
      const i = open.findIndex((q) => Math.hypot(q[0][0] - end[0], q[0][1] - end[1]) < 0.01 || Math.hypot(q[q.length - 1][0] - end[0], q[q.length - 1][1] - end[1]) < 0.01);
      if (i < 0) break;
      let q = open.splice(i, 1)[0];
      if (Math.hypot(q[0][0] - end[0], q[0][1] - end[1]) >= 0.01) q = q.reverse();
      cur = cur.concat(q.slice(1));
    }
    out.push(cur);
  }
  return out;
}

const tags = (el) => el.tags || {};
const num = (v) => { const m = /^\s*([\d.]+)/.exec(String(v || '')); return m ? parseFloat(m[1]) : NaN; };

// ---------- areas: land use, nature, leisure (lowest priority first) ----------
const AREA_RULES = [
  [(t) => ['residential', 'retail', 'commercial'].includes(t.landuse), SURF.ground],
  [(t) => t.landuse === 'grass' || t.landuse === 'meadow' || t.landuse === 'village_green', SURF.park],
  [(t) => t.landuse === 'forest' || t.natural === 'wood', SURF.forest],
  [(t) => t.natural === 'scrub' || t.natural === 'heath' || t.natural === 'grassland', SURF.scrub],
  [(t) => t.landuse === 'industrial' || t.landuse === 'port' || t.landuse === 'railway', SURF.dock],
  [(t) => t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'recreation_ground', SURF.park],
  [(t) => t.leisure === 'pitch' || t.leisure === 'playground', SURF.pitch],
  [(t) => t.amenity === 'parking' && !t.building, SURF.parking],
  [(t) => t.natural === 'beach' || t.natural === 'sand', SURF.sand],
  [(t) => t.place === 'square' || t.highway === 'pedestrian' || t['area:highway'] === 'pedestrian' || t.amenity === 'marketplace', SURF.plaza],
  [(t) => t.man_made === 'pier' || t.man_made === 'breakwater' || t.man_made === 'quay', SURF.dock],
  [(t) => t.natural === 'water' || t.water || t.leisure === 'swimming_pool' || t.amenity === 'fountain', SURF.water],
];
const areaEls = osm.elements.filter((el) => (el.type === 'way' || el.type === 'relation') && !tags(el).building);
for (const [test, code] of AREA_RULES) {
  for (const el of areaEls) {
    const t = tags(el);
    if (!test(t)) continue;
    const isArea = el.type === 'relation' || (el.geometry && el.geometry.length > 3 && el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat && el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon);
    if (!isArea) continue;
    if (t.highway === 'pedestrian' && el.type === 'way' && t.area !== 'yes') continue; // pedestrian streets are lines
    fillPolygon(rings(el), (i) => { surf[i] = code; });
  }
}

// ---------- sea: coastline barrier + flood fill from the sea side ----------
{
  const barrier = new Uint8Array(CELLS);
  for (const el of osm.elements) {
    const t = tags(el);
    if (el.type === 'way' && t.natural === 'coastline' && el.geometry) strokeLine(ringXY(el.geometry), 2.5, (i) => { barrier[i] = 1; });
  }
  // seeds: border cells at sea level that are not land-covered
  const q = [];
  const isLow = (i) => elev[i] < 0.6 && !barrier[i];
  const seed = (i) => { if (!sea[i] && isLow(i)) { sea[i] = 1; q.push(i); } };
  for (let x = 0; x < WIDTH; x++) seed((DEPTH - 1) * WIDTH + x);
  for (let z = DEPTH - 200; z < DEPTH; z++) { seed(z * WIDTH); seed(z * WIDTH + WIDTH - 1); }
  // spread over low ground only, and never across the coastline
  while (q.length) {
    const i = q.pop(), x = i % WIDTH, z = (i / WIDTH) | 0;
    if (x > 0) seed(i - 1);
    if (x < WIDTH - 1) seed(i + 1);
    if (z > 0) seed(i - WIDTH);
    if (z < DEPTH - 1) seed(i + WIDTH);
  }
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (sea[i]) { surf[i] = SURF.water; n++; }
  console.log(`sea: ${(100 * n / CELLS).toFixed(1)}% of the area`);
}

// ---------- the Guadalmedina and other waterways ----------
for (const el of osm.elements) {
  const t = tags(el);
  if (el.type === 'way' && t.waterway === 'river' && el.geometry) strokeLine(ringXY(el.geometry), 30, (i) => { if (!sea[i]) surf[i] = SURF.riverbed; });
  if (el.type === 'way' && (t.waterway === 'riverbank' || (t.natural === 'water' && t.water === 'river')) && el.geometry) fillPolygon(rings(el), (i) => { if (!sea[i]) surf[i] = SURF.riverbed; });
}

// ---------- streets ----------
const ROAD_W = {
  motorway: 14, trunk: 14, primary: 12, secondary: 10, tertiary: 9, unclassified: 7, residential: 7, living_street: 6,
  service: 5, pedestrian: 6, footway: 3, path: 2, cycleway: 2, steps: 3, track: 4, corridor: 0, platform: 3,
};
const roadEls = osm.elements.filter((el) => el.type === 'way' && tags(el).highway && el.geometry && tags(el).area !== 'yes');
// wide roads first so the narrow ones (and pavements) draw on top
roadEls.sort((a, b) => (ROAD_W[tags(b).highway] || 5) - (ROAD_W[tags(a).highway] || 5));
for (const el of roadEls) {
  const t = tags(el), hw = t.highway;
  let w = ROAD_W[hw] ?? 5;
  if (!w || t.tunnel === 'yes' || t.layer < 0) continue;
  const lanes = num(t.lanes);
  if (!Number.isNaN(lanes) && ['primary', 'secondary', 'tertiary', 'trunk', 'motorway'].includes(hw)) w = Math.max(w, lanes * 3.3 + 2);
  const pts = ringXY(el.geometry);
  const walk = ['footway', 'path', 'cycleway', 'steps', 'platform'].includes(hw);
  const car = !walk && hw !== 'pedestrian';
  if (car) strokeLine(pts, w + 4, (i) => { if (!sea[i] && surf[i] !== SURF.road) surf[i] = SURF.pavement; }); // pavements both sides
  strokeLine(pts, w, (i) => {
    if (sea[i] && t.bridge !== 'yes') return;
    surf[i] = hw === 'pedestrian' ? SURF.marble : hw === 'steps' ? SURF.steps : walk ? SURF.pavement : SURF.road;
  });
}
for (const el of osm.elements) {
  const t = tags(el);
  if (el.type === 'way' && t.railway && ['rail', 'light_rail', 'tram'].includes(t.railway) && t.tunnel !== 'yes' && el.geometry) strokeLine(ringXY(el.geometry), 3, (i) => { if (!sea[i]) surf[i] = SURF.rail; });
}

// ---------- walls (the Alcazaba, Gibralfaro and old city walls) ----------
for (const el of osm.elements) {
  const t = tags(el);
  if (el.type !== 'way' || !el.geometry) continue;
  const castle = t.barrier === 'city_wall' || t.historic === 'city_wall' || (t.barrier === 'wall' && t.historic);
  const garden = t.barrier === 'wall' && !t.historic;
  if (!castle && !garden) continue;
  const h = castle ? 7 : 2;
  strokeLine(ringXY(el.geometry), castle ? 2.5 : 1, (i) => { if (!sea[i]) { wallH[i] = Math.max(wallH[i], h); } });
}

// ---------- trees ----------
let trees = 0;
for (const el of osm.elements) {
  if (el.type !== 'node' || tags(el).natural !== 'tree') continue;
  const x = Math.floor(px(el.lon)), z = Math.floor(pz(el.lat));
  if (x < 0 || z < 0 || x >= WIDTH || z >= DEPTH) continue;
  const i = z * WIDTH + x;
  if (!sea[i]) { surf[i] |= TREE_BIT; trees++; }
}
// woods and parks get a scattering of trees too
{
  let seedN = 12345;
  const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < CELLS; i++) {
    const s = surf[i];
    if ((s === SURF.forest && rnd() < 0.02) || (s === SURF.park && rnd() < 0.006) || (s === SURF.scrub && rnd() < 0.004)) { surf[i] |= TREE_BIT; trees++; }
  }
}
console.log(`${trees} trees`);

// ---------- buildings ----------
const DEFAULT_H = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 9, villa: 8, bungalow: 4,
  apartments: 16, residential: 14, commercial: 14, retail: 8, office: 18, hotel: 22,
  church: 18, chapel: 9, cathedral: 40, mosque: 14, public: 14, civic: 12, government: 14, school: 11, university: 14,
  hospital: 20, train_station: 12, transportation: 8, warehouse: 8, industrial: 8, garage: 3, garages: 3, shed: 3, roof: 5,
  kiosk: 3, service: 4, castle: 10, fort: 10, tower: 16, ruins: 4, yes: 12,
};
const table = [[0, 0, 0, 0]]; // [base, height, wall, roof]; id 0 = none
function styleOf(t) {
  const b = t['building:part'] || t.building;
  const hist = t.historic || ['castle', 'fort', 'ruins', 'cathedral', 'church', 'chapel', 'mosque'].includes(b);
  let wall = MAT.white, roof = ROOF.flat;
  const colour = String(t['building:colour'] || '').toLowerCase();
  if (['cathedral', 'church', 'chapel', 'mosque'].includes(b)) { wall = MAT.limestone; roof = ROOF.stone; }
  else if (['castle', 'fort', 'ruins'].includes(b) || t.historic === 'castle') { wall = MAT.sandstone; roof = ROOF.stone; }
  else if (['house', 'detached', 'villa', 'semidetached_house', 'bungalow', 'terrace'].includes(b)) { wall = [MAT.white, MAT.cream, MAT.ochre][Math.abs(t._id) % 3]; roof = ROOF.tiles; }
  else if (['office', 'hotel', 'hospital'].includes(b)) { wall = t._id % 2 ? MAT.glass : MAT.concrete; }
  else if (['warehouse', 'industrial', 'garage', 'garages', 'shed', 'service', 'train_station', 'transportation'].includes(b)) wall = MAT.concrete;
  else wall = [MAT.white, MAT.cream, MAT.ochre, MAT.white, MAT.terracotta][Math.abs(t._id) % 5];
  if (/white|#fff/.test(colour)) wall = MAT.white;
  else if (/yellow|ochre|orange/.test(colour)) wall = MAT.ochre;
  else if (/cream|beige/.test(colour)) wall = MAT.cream;
  else if (/red|terracotta|pink/.test(colour)) wall = MAT.terracotta;
  else if (/grey|gray/.test(colour)) wall = MAT.concrete;
  const rs = String(t['roof:shape'] || '');
  if (/gabled|hipped|pyramidal/.test(rs) && !hist) roof = ROOF.tiles;
  if (/flat/.test(rs)) roof = ROOF.flat;
  const rm = String(t['roof:material'] || '');
  if (/tile|roof_tiles/.test(rm)) roof = ROOF.tiles;
  return { wall, roof };
}
function heightOf(t) {
  const b = t['building:part'] || t.building;
  let h = num(t.height);
  if (Number.isNaN(h)) { const lv = num(t['building:levels']); if (!Number.isNaN(lv)) h = lv * 3.2 + (num(t['roof:levels']) || 0) * 2.5 + 1; }
  if (Number.isNaN(h)) h = DEFAULT_H[b] ?? DEFAULT_H.yes;
  return Math.max(3, Math.min(90, Math.round(h)));
}
const buildingEls = osm.elements.filter((el) => (el.type === 'way' || el.type === 'relation') && tags(el).building && tags(el).building !== 'no' && tags(el).location !== 'underground');
const partEls = osm.elements.filter((el) => el.type === 'way' && tags(el)['building:part'] && tags(el)['building:part'] !== 'no');
// larger footprints first, so parts and small buildings inside win
const area = (rs) => rs.reduce((a, r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return a + Math.abs(s) / 2; }, 0);
const shapes = [...buildingEls, ...partEls].map((el) => ({ el, rs: rings(el), part: !tags(el).building })).filter((s) => s.rs.length);
shapes.forEach((s) => { s.a = area(s.rs); });
shapes.sort((a, b) => (a.part - b.part) || (b.a - a.a));
const isPart = new Uint8Array(65536);
for (const { el, rs } of shapes) {
  const t = { ...tags(el), _id: el.id };
  if (table.length >= 65535) break;
  const cells = [];
  fillPolygon(rs, (i) => { if (!sea[i]) cells.push(i); });
  if (cells.length < 4) continue;
  // the floor sits at the average ground height; foundations fill below
  let sum = 0;
  for (const i of cells) sum += elev[i];
  const ground = SEA_Y + 1 + Math.round(Math.max(0, sum / cells.length) * VSCALE);
  let { wall, roof } = styleOf(t);
  let h = heightOf(t);
  const part = !t.building;
  if (part) {
    // an upper part over a passage or an arcade: the building below stays
    if (num(t['building:min_level']) > 0 || num(t.min_height) > 0) continue;
    // a part takes the look (and, when it has no height of its own, the
    // height) of the building it belongs to
    const count = new Map();
    for (const i of cells) if (bid[i] && !isPart[bid[i]]) count.set(bid[i], (count.get(bid[i]) || 0) + 1);
    let parent = 0, best = 0;
    for (const [k, n] of count) if (n > best) { best = n; parent = k; }
    if (parent) {
      const [, ph, pw, pr] = table[parent];
      if (!t['building:colour'] && !t['building:material']) wall = pw;
      if (!t['roof:shape'] && !t['roof:material']) roof = pr;
      if (Number.isNaN(num(t.height)) && Number.isNaN(num(t['building:levels']))) h = ph;
      else if (num(t['building:levels']) === 0 && Number.isNaN(num(t.height))) continue;
    }
  }
  table.push([Math.min(MAX_Y - 4, ground), Math.min(h, MAX_Y + 8 - ground), wall, roof]);
  const b = table.length - 1;
  isPart[b] = part ? 1 : 0;
  for (const i of cells) bid[i] = b;
}
console.log(`${table.length - 1} buildings`);

// ---------- distance over the sand from the sea (for gentle beaches) ----------
const beachD = new Uint16Array(CELLS).fill(65535);
{
  let q = [];
  for (let i = 0; i < CELLS; i++) if (sea[i]) { beachD[i] = 0; q.push(i); }
  while (q.length) {
    const next = [];
    for (const i of q) {
      const x = i % WIDTH;
      for (const j of [x > 0 ? i - 1 : -1, x < WIDTH - 1 ? i + 1 : -1, i - WIDTH, i + WIDTH]) {
        if (j < 0 || j >= CELLS || beachD[j] !== 65535 || (surf[j] & 0x7f) !== SURF.sand) continue;
        beachD[j] = beachD[i] + 1; next.push(j);
      }
    }
    q = next;
  }
}

// ---------- ground height per cell ----------
const ground = new Uint8Array(CELLS);
for (let i = 0; i < CELLS; i++) {
  if (sea[i]) { ground[i] = SEA_Y - 5; continue; }
  const s = surf[i] & 0x7f;
  let g = SEA_Y + 1 + Math.round(Math.max(0, elev[i]) * VSCALE);
  if (s === SURF.riverbed) g = Math.max(SEA_Y + 1, g - 3);
  if (s === SURF.sand && beachD[i] < 65535) g = Math.min(g, SEA_Y + 2 + Math.floor(beachD[i] / 14)); // beaches slope gently from the sea (the elevation data is smoothed)
  if (s === SURF.water) g = Math.max(SEA_Y, g - 1); // fountains, ponds
  ground[i] = Math.min(MAX_Y, g);
  if (wallH[i]) surf[i] = SURF.wall;
}
const wallTop = wallH;

// ---------- pack ----------
// header (JSON) + ground (u8) + surf (u8) + wall heights (u8) + building ids (u16) + building table (4 x u8 per building)
const [sLat, sLon] = city.spawn;
const header = {
  v: 1, id, name: city.name, width: WIDTH, depth: DEPTH, seaY: SEA_Y, buildings: table.length,
  spawn: [Math.round(px(sLon)), Math.round(pz(sLat))], bbox: city.bbox,
  attribution: 'Map data (c) OpenStreetMap contributors (ODbL). Elevation: Terrain Tiles on AWS (SRTM and others).',
};
const hb = Buffer.from(JSON.stringify(header));
const bt = new Uint8Array(table.length * 4);
table.forEach((r, k) => { bt[k * 4] = r[0]; bt[k * 4 + 1] = Math.min(255, r[1]); bt[k * 4 + 2] = r[2]; bt[k * 4 + 3] = r[3]; });
const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32LE(hb.length);
const pad = Buffer.alloc((4 - ((4 + hb.length) % 4)) % 4, 32);
const body = Buffer.concat([lenBuf, hb, pad, Buffer.from(ground.buffer), Buffer.from(surf.buffer), Buffer.from(wallTop.buffer), Buffer.from(bid.buffer), Buffer.from(bt.buffer)]);
mkdirSync('public/city', { recursive: true });
const gz = gzipSync(body, { level: 9 });
writeFileSync(`public/city/${id}.bin.gz`, gz);
console.log(`wrote public/city/${id}.bin.gz: ${(gz.length / 1e6).toFixed(2)} MB (raw ${(body.length / 1e6).toFixed(1)} MB)`);
// a quick top view for checking the result
if (process.argv.includes('--preview')) {
  const { writePreview } = await import('./preview.mjs');
  writePreview(`data/city/${id}-preview.png`, WIDTH, DEPTH, ground, surf, bid, table);
}
