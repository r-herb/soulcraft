// Reads a GTFS timetable (zip) for the bus builder: for each line and
// direction, the weekday departure times from its first stop.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

// a small zip reader (stored and deflated entries)
function unzip(buf) {
  const files = new Map();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen).replace(/^.*\//, '');
    const lnlen = buf.readUInt16LE(local + 26), lelen = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnlen + lelen, local + 30 + lnlen + lelen + csize);
    files.set(name, () => (method === 0 ? data : inflateRawSync(data)));
    p += 46 + nlen + elen + clen;
  }
  return files;
}

function csv(text) {
  const rows = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]).map((h) => h.trim());
  for (let i = 1; i < lines.length; i++) { const v = split(lines[i]); const o = {}; head.forEach((h, k) => { o[h] = (v[k] || '').trim(); }); rows.push(o); }
  return rows;
}
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function readGtfs(path) {
  const files = unzip(readFileSync(path));
  const read = (n) => (files.has(n) ? csv(files.get(n)().toString('utf8')) : []);
  const routes = new Map(read('routes.txt').map((r) => [r.route_id, r]));
  const trips = read('trips.txt');
  // the weekday service with the most trips stands for "a normal day"
  const perService = new Map();
  for (const t of trips) perService.set(t.service_id, (perService.get(t.service_id) || 0) + 1);
  const cal = read('calendar.txt');
  const weekday = new Set(cal.filter((c) => c.wednesday === '1').map((c) => c.service_id));
  const firstStop = new Map(); // trip -> first departure (minutes), duration
  const st = files.has('stop_times.txt') ? files.get('stop_times.txt')().toString('utf8') : '';
  {
    const lines = st.split(/\r?\n/);
    const head = lines[0].replace(/^﻿/, '').split(',').map((h) => h.trim());
    const iT = head.indexOf('trip_id'), iD = head.indexOf('departure_time'), iA = head.indexOf('arrival_time'), iS = head.indexOf('stop_sequence');
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i]) continue;
      const v = lines[i].split(',');
      const trip = v[iT], seq = Number(v[iS]), dep = v[iD] || v[iA];
      if (!dep) continue;
      const m = mins(dep);
      const f = firstStop.get(trip);
      if (!f) firstStop.set(trip, { seq, dep: m, last: m });
      else { if (seq < f.seq) { f.seq = seq; f.dep = m; } f.last = Math.max(f.last, m); }
    }
  }
  return {
    routes,
    forLine(ref, to) {
      const ids = [...routes.values()].filter((r) => r.route_short_name === ref).map((r) => r.route_id);
      if (!ids.length) return null;
      let list = trips.filter((t) => ids.includes(t.route_id) && firstStop.has(t.trip_id));
      const wd = list.filter((t) => weekday.has(t.service_id));
      if (wd.length) list = wd;
      // the direction whose headsign looks like the line's destination
      const want = norm(to);
      const byDir = new Map();
      for (const t of list) { const k = t.direction_id || norm(t.trip_headsign); if (!byDir.has(k)) byDir.set(k, []); byDir.get(k).push(t); }
      let best = null, score = -1;
      for (const [, ts] of byDir) {
        const h = norm(ts[0].trip_headsign);
        const s = want && h ? want.split(' ').filter((w) => w.length > 2 && h.includes(w)).length : 0;
        if (s > score || (s === score && best && ts.length > best.length)) { score = s; best = ts; }
      }
      if (!best) return null;
      const deps = [...new Set(best.map((t) => firstStop.get(t.trip_id).dep))].sort((a, b) => a - b);
      const durs = best.map((t) => { const f = firstStop.get(t.trip_id); return f.last - f.dep; }).sort((a, b) => a - b);
      return { deps, dur: durs[durs.length >> 1] || 30 };
    },
  };
}
