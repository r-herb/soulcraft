// The projection of a real-city world (1 block = 1 metre): metres east (x)
// and south (z) of a fixed north-west point. A city keeps the projection of
// its first area (city.proj), so a bigger area later does not move the
// places in worlds made before; the new parts simply get negative x or z.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

export function projection(city) {
  const [S, W, N, E] = city.bbox;
  const pr = city.proj || { west: W, north: N, lat0: (S + N) / 2 };
  const lat0 = pr.lat0 * Math.PI / 180;
  const MLAT = 111132.92 - 559.82 * Math.cos(2 * lat0) + 1.175 * Math.cos(4 * lat0);
  const MLON = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
  const px = (lon) => (lon - pr.west) * MLON;
  const pz = (lat) => (pr.north - lat) * MLAT;
  // the grid over the whole area, in world blocks
  const X0 = Math.floor(px(W)), Z0 = Math.floor(pz(N));
  const WIDTH = Math.ceil(px(E)) - X0, DEPTH = Math.ceil(pz(S)) - Z0;
  const lonOf = (x) => pr.west + x / MLON, latOf = (z) => pr.north - z / MLAT;
  return { proj: pr, MLAT, MLON, px, pz, X0, Z0, WIDTH, DEPTH, lonOf, latOf };
}

// The OpenStreetMap elements of a city: from the part files the data
// workflow writes (data/city/<id>-osm/part-NNN.json.gz), or the older
// single file. Elements on part borders appear once.
export function loadOsm(id) {
  const dir = `data/city/${id}-osm`;
  if (existsSync(dir)) {
    const seen = new Set(), elements = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json.gz')).sort()) {
      const part = JSON.parse(gunzipSync(readFileSync(`${dir}/${f}`)).toString('utf8'));
      for (const el of part.elements) { const k = el.type + '/' + el.id; if (!seen.has(k)) { seen.add(k); elements.push(el); } }
    }
    return { elements };
  }
  return JSON.parse(gunzipSync(readFileSync(`data/city/${id}-osm.json.gz`)).toString('utf8'));
}
