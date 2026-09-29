// The city bus network (public/city/<city>-bus.json, built by
// scripts/city/build-bus.mjs): lines with their path and stops, and where
// every bus is right now. Buses run on Malaga's real clock (Europe/Madrid),
// on the real timetable when the file has one, so every player sees the
// same bus at the same place, and a bus due at 14:32 comes at 14:32.
export const BUS_SPEED = 6; // metres per second between stops
export const DWELL = 18; // seconds at each stop
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
    return { x, z, heading: Math.atan2(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) };
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
    return out;
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
