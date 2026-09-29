// Downloads the OpenStreetMap data of a city area (Overpass API) for the
// real-city worlds. Map data (c) OpenStreetMap contributors, ODbL 1.0.
//
//   node scripts/city/fetch-osm.mjs malaga
//
// Writes data/city/<city>-osm.json.gz. Runs in GitHub Actions (the
// "City data" workflow); the output is committed to the city-data branch.
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { CITIES } from './cities.mjs';

const id = process.argv[2] || 'malaga';
const city = CITIES[id];
if (!city) throw new Error('unknown city ' + id);
// The area is asked for in tiles (a smaller query is much less likely to
// time out on a busy server); elements on tile borders come twice and are
// merged by id.
const [S, W, N, E] = city.bbox;
const TILES = Number(process.env.OSM_TILES || 3);
const query = (s, w, n, e) => {
  const bb = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:180][maxsize:536870912];
(
  way["building"]${bb}; relation["building"]${bb};
  way["building:part"]${bb};
  way["highway"]${bb}; way["area:highway"]${bb};
  way["railway"]${bb};
  way["landuse"]${bb}; relation["landuse"]${bb};
  way["leisure"]${bb}; relation["leisure"]${bb};
  way["natural"]${bb}; relation["natural"]${bb};
  way["amenity"]${bb}; relation["amenity"]${bb};
  way["man_made"]${bb};
  way["waterway"]${bb}; relation["waterway"]${bb};
  way["barrier"]${bb};
  way["historic"]${bb}; relation["historic"]${bb};
  way["place"]${bb};
  node["natural"="tree"]${bb};
);
out body geom;`;
};

const servers = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(q, label) {
  for (let round = 1; round <= 3; round++) {
    for (const url of servers) {
      try {
        console.log(`${label}: ${url} (round ${round})`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'soulcraft-city-builder (github.com/r-herb/soulcraft)' },
          body: 'data=' + encodeURIComponent(q),
          signal: AbortSignal.timeout(240_000),
        });
        if (!res.ok) { console.log('  HTTP', res.status); await wait(5000); continue; }
        const data = JSON.parse(await res.text()); // must be complete JSON
        if (data.remark && /error|timed out|runtime/i.test(data.remark)) { console.log('  remark:', data.remark); continue; }
        console.log(`  ${data.elements.length} elements`);
        return data;
      } catch (err) { console.log('  failed:', err.message); await wait(5000); }
    }
    await wait(20000 * round);
  }
  throw new Error(`${label}: no Overpass server answered`);
}

const seen = new Map();
let base = null;
for (let ty = 0; ty < TILES; ty++) for (let tx = 0; tx < TILES; tx++) {
  const s = S + (N - S) * ty / TILES, n = S + (N - S) * (ty + 1) / TILES;
  const w = W + (E - W) * tx / TILES, e = W + (E - W) * (tx + 1) / TILES;
  const data = await ask(query(s.toFixed(5), w.toFixed(5), n.toFixed(5), e.toFixed(5)), `tile ${ty * TILES + tx + 1}/${TILES * TILES}`);
  base = base || data;
  for (const el of data.elements) seen.set(`${el.type}/${el.id}`, el);
}
const text = JSON.stringify({ ...base, elements: [...seen.values()] });
console.log(`${seen.size} elements, ${(text.length / 1e6).toFixed(1)} MB`);
mkdirSync('data/city', { recursive: true });
writeFileSync(`data/city/${id}-osm.json.gz`, gzipSync(text, { level: 9 }));
console.log(`wrote data/city/${id}-osm.json.gz`);
