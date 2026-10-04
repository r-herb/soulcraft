// The city bus network (public/city/<city>-bus.json, built by
// scripts/city/build-bus.mjs): lines with their path and stops, and where
// every bus is right now. Buses run on Malaga's real clock (Europe/Madrid),
// on the real timetable when the file has one, so every player sees the
// same bus at the same place, and a bus due at 14:32 comes at 14:32.
export const BUS_SPEED = 12; // metres per second between stops (twice a real bus, so a ride is not a long wait)
export const DWELL = 12; // seconds at each stop
// Spain drives on the right: a bus keeps this far to the right of the
// route's line (the middle of the road), so the two directions pass
// (two buses 2.6 wide, their middles 3.6 apart)
export const LANE = 1.8;
const DEFAULT_HEADWAY = 15; // minutes, when there is no timetable

// minutes after midnight in Malaga (with seconds as a fraction)
export function malagaMinutes(now = Date.now()) {
  try {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date(now)).map((x) => [x.type, x.value]));
    return Number(p.hour) * 60 + Number(p.minute) + Number(p.second) / 60 + (now % 1000) / 60000;
  } catch { const d = new Date(now); return d.getUTCHours() * 60 + d.getUTCMinutes() + 60 + d.getUTCSeconds() / 60; }
}
export const clock = (m) => { const t = ((Math.floor(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export class BusNet {
  static async load(id) {
    try {
      const res = await fetch(`/city/${id}-bus.json`);
      if (!res.ok) return null;
      return new BusNet(await res.json());
    } catch { return null; }
  }

  constructor(data) {
    this.fixedMinutes = null; // tests can stop the clock
    this.lines = data.lines;
    this.stops = data.stops;
    for (const l of this.lines) {
      // cumulative distance along the path
      l.cum = [0];
      for (let i = 1; i < l.pts.length; i++) l.cum.push(l.cum[i - 1] + Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]));
      l.trip = l.len / BUS_SPEED + l.stops.length * DWELL; // seconds
      if (!l.deps || !l.deps.length) l.deps = defaultDeparts(l);
      l.deps = busier(l.deps);
    }
  }

  // where along the path a bus is `sec` seconds after leaving the start,
  // and the stop it is standing at (or -1)
  progress(l, sec) {
    let t = sec, d = 0;
    for (let k = 0; k < l.stops.length; k++) {
      const q = l.stops[k];
      const drive = (q.d - d) / BUS_SPEED;
      if (t < drive) return { d: d + t * BUS_SPEED, stop: -1, next: k };
      t -= drive; d = q.d;
      if (t < DWELL) return { d, stop: k, next: k, leaves: DWELL - t };
      t -= DWELL;
    }
    return { d: Math.min(l.len, d + t * BUS_SPEED), stop: -1, next: l.stops.length };
  }

  pointAt(l, d) {
    const c = l.cum, p = l.pts;
    let i = 1;
    while (i < c.length - 1 && c[i] < d) i++;
    const f = Math.max(0, Math.min(1, (d - c[i - 1]) / ((c[i] - c[i - 1]) || 1)));
    const x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * f, z = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * f;
    const heading = Math.atan2(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    // in its lane: to the right of the way it goes (right of (sin h, cos h) is (-cos h, sin h))
    return { x: x - Math.cos(heading) * LANE, z: z + Math.sin(heading) * LANE, heading };
  }

  now() { return this.fixedMinutes ?? malagaMinutes(); }

  // every bus on the road now: { key, line, d, x, z, heading, stop, next }
  active(nowMin = this.now()) {
    const out = [];
    for (let li = 0; li < this.lines.length; li++) {
      const l = this.lines[li];
      for (const dep of l.deps) {
        // a trip may have started yesterday evening
        for (const day of [0, -1440]) {
          const sec = (nowMin - dep - day) * 60;
          if (sec < 0 || sec > l.trip) continue;
          const pr = this.progress(l, sec), pt = this.pointAt(l, pr.d);
          out.push({ key: `${li}:${dep}:${day}`, li, line: l, ...pr, ...pt });
        }
      }
    }
    this.queue(out);
    return out.filter((b) => !b.waiting);
  }

  // Buses in the same lane do not drive through each other: one that
  // catches up with another (at a shared stop, or on a street many lines
  // share) waits a bus length behind it. Worked out from the clock alone, so
  // every player sees the same queue, and a bus moves on smoothly when the
  // one ahead leaves.
  queue(buses) {
    const GAP = 13.5, CELL = 16, grid = new Map();
    const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    for (const b of buses) { const k = key(b.x, b.z); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const a of buses) {
        if (a.waiting) continue;
        const cx = Math.floor(a.x / CELL), cz = Math.floor(a.z / CELL);
        for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) for (const b of grid.get((cx + ox) + ',' + (cz + oz)) || []) {
          if (b === a || b.waiting) continue;
          let dh = b.heading - a.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          if (Math.abs(dh) > 0.8) continue; // not the same way
          // b ahead of a, in the same lane, too close: a waits behind
          const fx = Math.sin(a.heading), fz = Math.cos(a.heading), dx = b.x - a.x, dz = b.z - a.z;
          const along = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
          // (two at the very same spot: the later key waits)
          const ahead = along > 0.5 || (along > -0.5 && b.key < a.key);
          if (!ahead || along >= GAP || side > 2.4) continue;
          const need = a.d - (GAP - along) - 0.01;
          // at the very start of its line it cannot wait further back: it leaves the depot later
          if (need < 0) { a.waiting = true; continue; }
          const d = need;
          if (d >= a.d) continue;
          Object.assign(a, this.pointAt(a.line, d), { d, queued: true });
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // the next buses at a stop: [{ line, in (minutes), at (clock) }]
  arrivals(stopIndex, nowMin = this.now(), n = 3) {
    const out = [];
    for (const l of this.lines) {
      const q = l.stops.findIndex((s) => s.s === stopIndex);
      if (q < 0) continue;
      // time from the start to this stop
      let t = 0, d = 0;
      for (let k = 0; k <= q; k++) { t += (l.stops[k].d - d) / BUS_SPEED; d = l.stops[k].d; if (k < q) t += DWELL; }
      const times = [];
      for (const day of [0, 1440]) for (const dep of l.deps) {
        const at = dep + day + t / 60;
        if (at + DWELL / 60 >= nowMin) times.push(at);
      }
      times.sort((a, b) => a - b);
      out.push({ line: l, times: times.slice(0, n).map((at) => ({ in: Math.max(0, Math.round(at - nowMin)), at: clock(at) })) });
    }
    return out.sort((a, b) => (a.times[0] ? a.times[0].in : 1e9) - (b.times[0] ? b.times[0].in : 1e9));
  }

  stopsNear(x, z, r) { return this.stops.map((s, i) => [s, i]).filter(([s]) => Math.hypot(s.x - x, s.z - z) <= r); }
}

// No timetable: from the line's opening hours (or 06:30-23:00; night lines
// 00:00-06:00) every 15 minutes (night lines every hour).
function defaultDeparts(l) {
  const m = /(\d\d):(\d\d)-(\d\d):(\d\d)/.exec(l.hours || '');
  let a = 390, b = 1380, every = DEFAULT_HEADWAY;
  if (l.night) { a = 0; b = 360; every = 60; }
  else if (m) { a = +m[1] * 60 + +m[2]; b = +m[3] * 60 + +m[4]; if (b <= a) b += 1440; }
  // the two directions of a line start at different minutes
  const offset = [...l.ref + l.to].reduce((s, c) => s + c.charCodeAt(0), 0) % every;
  const out = [];
  for (let t = a + offset; t <= b; t += every) out.push(t % 1440);
  return out.sort((x, y) => x - y);
}

// The game runs more buses than the timetable: between two departures more
// than 10 minutes apart one more leaves half way, so a wait at a stop is
// about half as long.
function busier(deps) {
  const d = [...deps].sort((a, b) => a - b), out = [];
  for (let i = 0; i < d.length; i++) {
    out.push(d[i]);
    if (i + 1 < d.length && d[i + 1] - d[i] > 10) out.push(Math.round((d[i] + d[i + 1]) / 2));
  }
  return out;
}
