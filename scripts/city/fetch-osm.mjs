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
const [s, w, n, e] = city.bbox;
const bb = `(${s},${w},${n},${e})`;
const query = `[out:json][timeout:300][maxsize:1073741824];
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

const servers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
let text = null;
for (const url of servers) {
  for (let attempt = 1; attempt <= 3 && !text; attempt++) {
    try {
      console.log(`asking ${url} (try ${attempt})`);
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'soulcraft-city-builder (github.com/r-herb/soulcraft)' }, body: 'data=' + encodeURIComponent(query) });
      if (!res.ok) { console.log('  HTTP', res.status); await new Promise((r) => setTimeout(r, 10000 * attempt)); continue; }
      text = await res.text();
      JSON.parse(text); // must be complete JSON
    } catch (err) { console.log('  failed:', err.message); text = null; await new Promise((r) => setTimeout(r, 10000 * attempt)); }
  }
  if (text) break;
}
if (!text) throw new Error('no Overpass server answered');
const data = JSON.parse(text);
console.log(`${data.elements.length} elements, ${(text.length / 1e6).toFixed(1)} MB`);
mkdirSync('data/city', { recursive: true });
writeFileSync(`data/city/${id}-osm.json.gz`, gzipSync(text, { level: 9 }));
console.log(`wrote data/city/${id}-osm.json.gz`);
