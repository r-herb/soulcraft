// Downloads the public transport timetable (GTFS) of a city for the real-city
// worlds: Malaga's city buses (EMT) from the city's open data portal.
//
//   node scripts/city/fetch-gtfs.mjs malaga
//
// Writes data/city/<city>-gtfs.zip. Runs in GitHub Actions (the "City data"
// workflow); the file is committed to the city-data branch.
import { writeFileSync, mkdirSync } from 'node:fs';
import { CITIES } from './cities.mjs';

const id = process.argv[2] || 'malaga';
const city = CITIES[id];
if (!city || !city.gtfs) { console.log(`no GTFS source for ${id}`); process.exit(0); }
const UA = { 'user-agent': 'soulcraft-city-builder (github.com/r-herb/soulcraft)' };

// candidate zip URLs: the known ones first, then whatever the portal's
// catalogue (CKAN) lists for the search words
async function candidates() {
  const urls = [...(city.gtfs.urls || [])];
  for (const q of city.gtfs.search || []) {
    try {
      const res = await fetch(`${city.gtfs.ckan}/api/3/action/package_search?rows=20&q=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (!res.ok) { console.log('catalogue HTTP', res.status); continue; }
      const data = await res.json();
      for (const p of data.result.results) for (const r of p.resources || []) {
        const u = String(r.url || '');
        if (/\.zip($|\?)/i.test(u) && /gtfs|google_transit|transit/i.test(u + ' ' + (r.name || '') + ' ' + (r.format || '') + ' ' + p.name)) urls.push(u);
      }
    } catch (e) { console.log('catalogue failed:', e.message); }
  }
  return [...new Set(urls)];
}

const list = await candidates();
console.log('candidates:\n  ' + list.join('\n  '));
for (const url of list) {
  try {
    console.log('downloading', url);
    const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180_000) });
    if (!res.ok) { console.log('  HTTP', res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    // a zip starts with PK and a GTFS feed names stop_times.txt inside
    if (buf[0] !== 0x50 || buf[1] !== 0x4b || !buf.includes(Buffer.from('stop_times.txt'))) { console.log('  not a GTFS zip'); continue; }
    mkdirSync('data/city', { recursive: true });
    writeFileSync(`data/city/${id}-gtfs.zip`, buf);
    console.log(`wrote data/city/${id}-gtfs.zip (${(buf.length / 1e6).toFixed(1)} MB) from ${url}`);
    process.exit(0);
  } catch (e) { console.log('  failed:', e.message); }
}
console.log('no GTFS feed could be downloaded');
process.exit(1);
