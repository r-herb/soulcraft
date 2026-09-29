// Downloads the OpenStreetMap data of a city area (Overpass API) for the
// real-city worlds. Map data (c) OpenStreetMap contributors, ODbL 1.0.
//
//   node scripts/city/fetch-osm.mjs malaga
//
// Writes data/city/<city>-osm/part-NNN.json.gz. Runs in GitHub Actions (the
// "City data" workflow); the output is committed to the city-data branch.
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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
  node["addr:housenumber"]${bb};
  node["highway"="bus_stop"]${bb}; node["public_transport"]${bb};
  relation["route"="bus"]${bb};
  node["amenity"~"^(bank|atm|restaurant|cafe|fast_food|bar|ice_cream|marketplace|bureau_de_change)$"]${bb};
  node["shop"~"^(supermarket|convenience|greengrocer|bakery|butcher|seafood|deli|confectionery|pastry|wine|kiosk)$"]${bb};
  way["shop"]${bb};
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

// Each tile's new elements go to a part file of their own (one big file
// would be too large to read back as a single JSON text).
const [TX, TY] = process.env.OSM_TILES ? process.env.OSM_TILES.split('x').map(Number) : (city.osmTiles || [TILES, TILES]);
const seen = new Set();
const dir = `data/city/${id}-osm`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
let total = 0, part = 0;
for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
  const s = S + (N - S) * ty / TY, n = S + (N - S) * (ty + 1) / TY;
  const w = W + (E - W) * tx / TX, e = W + (E - W) * (tx + 1) / TX;
  const data = await ask(query(s.toFixed(5), w.toFixed(5), n.toFixed(5), e.toFixed(5)), `tile ${ty * TX + tx + 1}/${TX * TY}`);
  const fresh = data.elements.filter((el) => { const k = `${el.type}/${el.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const text = JSON.stringify({ version: data.version, generator: data.generator, osm3s: data.osm3s, bbox: [s, w, n, e], elements: fresh });
  writeFileSync(`${dir}/part-${String(part++).padStart(3, '0')}.json.gz`, gzipSync(text, { level: 9 }));
  total += fresh.length;
  console.log(`  part ${part}: ${fresh.length} new elements, ${(text.length / 1e6).toFixed(1)} MB`);
}
console.log(`${total} elements in ${part} parts under ${dir}`);
