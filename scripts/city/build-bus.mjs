// Builds the city bus network of a real-city world: the EMT lines that run
// through the area (their path on the streets and their stops, from
// OpenStreetMap route relations) and, when the city data has a GTFS feed,
// their real departure times.
//
//   node scripts/city/build-bus.mjs malaga
//
// Writes public/city/<city>-bus.json. Map data (c) OpenStreetMap
// contributors, ODbL 1.0. Timetables: EMT Malaga open data.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CITIES } from './cities.mjs';
import { readGtfs } from './gtfs.mjs';

const id = process.argv[2] || 'malaga';
const city = CITIES[id];
const [S, W, N, E] = city.bbox;
const lat0 = (S + N) / 2 * Math.PI / 180;
const MLAT = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
const MLON = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
const px = (lon) => (lon - W) * MLON;
const pz = (lat) => (N - lat) * MLAT;
const WIDTH = Math.ceil(px(E)), DEPTH = Math.ceil(pz(S));
const inside = ([x, z], m = 0) => x >= -m && z >= -m && x < WIDTH + m && z < DEPTH + m;

const osm = JSON.parse(gunzipSync(readFileSync(`data/city/${id}-osm.json.gz`)).toString('utf8'));
const byId = new Map(osm.elements.map((e) => [e.type + e.id, e]));
const routes = osm.elements.filter((e) => e.type === 'relation' && e.tags && e.tags.route === 'bus' && /EMT/i.test(e.tags.operator || ''));
console.log(`${routes.length} EMT route relations`);

// ---------- geometry ----------
const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
function chain(rel) {
  const ways = rel.members.filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1 && !m.role).map((m) => m.geometry);
  if (!ways.length) return [];
  let pts = [...ways[0]];
  for (let i = 1; i < ways.length; i++) {
    const w = ways[i], end = pts[pts.length - 1], start = pts[0];
    if (same(end, w[0])) pts.push(...w.slice(1));
    else if (same(end, w[w.length - 1])) pts.push(...[...w].reverse().slice(1));
    else if (i === 1 && same(start, w[0])) { pts = [...pts].reverse(); pts.push(...w.slice(1)); }
    else if (i === 1 && same(start, w[w.length - 1])) { pts = [...pts].reverse(); pts.push(...[...w].reverse().slice(1)); }
    else pts.push(...w); // a gap in the data: jump
  }
  return pts.map((p) => [px(p.lon), pz(p.lat)]);
}
// the longest stretch of the line inside the map
function clip(pts) {
  let best = [], cur = [];
  for (const p of pts) {
    if (inside(p, 5)) cur.push(p);
    else { if (cur.length > best.length) best = cur; cur = []; }
  }
  if (cur.length > best.length) best = cur;
  return best;
}
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    const d = Math.abs(dz * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > max) { max = d; idx = i; }
  }
  if (max <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
const cum = (pts) => { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return c; };
// distance along the line of the point nearest to p, and how far p is from it
function project(pts, c, p) {
  let best = { d: 0, off: Infinity };
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L2));
    const qx = ax + dx * t, qz = az + dz * t, off = Math.hypot(p[0] - qx, p[1] - qz);
    if (off < best.off) best = { d: c[i - 1] + Math.sqrt(L2) * t, off };
  }
  return best;
}

// ---------- stops ----------
const stops = []; // { name, ref, x, z, lines: [] }
const stopKey = new Map();
function stopFor(m) {
  const el = byId.get('node' + m.ref);
  const t = (el && el.tags) || {};
  const lat = m.lat ?? (el && el.lat), lon = m.lon ?? (el && el.lon);
  if (lat == null) return null;
  const x = px(lon), z = pz(lat);
  const name = t.name || null;
  // one stop per name (or per place, when it has no name)
  const key = name ? name + (t.ref ? '#' + t.ref : '') : `${Math.round(x / 25)},${Math.round(z / 25)}`;
  let s = stopKey.get(key);
  if (!s) { s = { name: name || '', ref: t.ref || '', x: Math.round(x), z: Math.round(z), lines: [] }; stopKey.set(key, s); stops.push(s); }
  else if (!s.name && name) s.name = name;
  return stops.indexOf(s);
}

// ---------- lines ----------
const PALETTE = ['#d7263d', '#1b998b', '#2e86ab', '#f46036', '#6a4c93', '#e2a400', '#3a86ff', '#8ac926', '#ff595e', '#1982c4', '#c1121f', '#588157'];
const hashRef = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const gtfs = existsSync(`data/city/${id}-gtfs.zip`) ? readGtfs(`data/city/${id}-gtfs.zip`) : null;
if (gtfs) console.log(`GTFS: ${gtfs.routes.size} routes`);
const lines = [];
for (const rel of routes) {
  const t = rel.tags;
  const full = chain(rel);
  const inMap = clip(full);
  if (inMap.length < 2) continue;
  const pts = simplify(inMap, 1.2).map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  const c = cum(pts);
  if (c[c.length - 1] < 150) continue;
  const lineStops = [];
  for (const m of rel.members) {
    if (m.type !== 'node' || !/platform|stop/.test(m.role || '')) continue;
    const p = [px(m.lon ?? byId.get('node' + m.ref)?.lon ?? 0), pz(m.lat ?? byId.get('node' + m.ref)?.lat ?? 0)];
    if (!inside(p)) continue;
    const pr = project(pts, c, p);
    if (pr.off > 30) continue;
    const si = stopFor(m);
    if (si == null) continue;
    if (lineStops.some((q) => q.s === si || Math.abs(q.d - pr.d) < 20)) continue;
    lineStops.push({ s: si, d: Math.round(pr.d) });
  }
  lineStops.sort((a, b) => a.d - b.d);
  if (lineStops.length < 2) continue;
  const ref = String(t.ref || '?');
  for (const q of lineStops) if (!stops[q.s].lines.includes(ref)) stops[q.s].lines.push(ref);
  const g = gtfs && gtfs.forLine(ref, t.to);
  lines.push({
    ref, name: t.name || `Línea ${ref}`, from: t.from || '', to: t.to || '', colour: t.colour || PALETTE[hashRef(ref) % PALETTE.length],
    hours: t.opening_hours || '', night: /^N/.test(ref),
    len: Math.round(c[c.length - 1]), pts, stops: lineStops,
    // departures (minutes after midnight, Malaga time) from where the line enters the map; from GTFS, else every 15 minutes
    ...(g ? { deps: g.deps, dur: g.dur } : {}),
  });
}
lines.sort((a, b) => a.ref.localeCompare(b.ref, 'es', { numeric: true }) || a.to.localeCompare(b.to));
const used = stops.map((s, i) => [s, i]).filter(([s]) => s.lines.length);
const remap = new Map(used.map(([, i], k) => [i, k]));
for (const l of lines) for (const q of l.stops) q.s = remap.get(q.s);
const out = { v: 1, id, attribution: 'Bus lines: OpenStreetMap contributors (ODbL); timetables: EMT Malaga open data', lines, stops: used.map(([s]) => s) };
writeFileSync(`public/city/${id}-bus.json`, JSON.stringify(out));
console.log(`${lines.length} line directions, ${out.stops.length} stops -> public/city/${id}-bus.json (${(JSON.stringify(out).length / 1024).toFixed(0)} KB)`);
