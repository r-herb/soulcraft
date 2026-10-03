// What the superadmin sees of the players: each sign-in and visit (time,
// IP and the place Cloudflare finds for it, the device and the screen), and
// play time per day, mode and world (counted from the game's presence pings).
const VISIT_EVERY = 30 * 60e3; // a new visit after half an hour away
const KEEP_DAYS = 120;

// "Android 14, Chrome, phone" from a user agent
export function parseDevice(ua = '') {
  const u = String(ua);
  const os = /Android ([\d.]+)/.exec(u) ? 'Android ' + /Android ([\d.]+)/.exec(u)[1].split('.')[0]
    : /iPhone|iPod/.test(u) ? 'iPhone iOS ' + ((/OS (\d+)_/.exec(u) || [])[1] || '')
      : /iPad/.test(u) || (/Macintosh/.test(u) && /Mobile/.test(u)) ? 'iPad iOS ' + ((/OS (\d+)_/.exec(u) || [])[1] || '')
        : /Windows NT 10/.test(u) ? 'Windows 10/11' : /Windows/.test(u) ? 'Windows'
          : /CrOS/.test(u) ? 'ChromeOS' : /Mac OS X/.test(u) ? 'macOS' : /Linux/.test(u) ? 'Linux' : 'Other';
  const br = /SamsungBrowser\/(\d+)/.test(u) ? 'Samsung Internet' : /Edg\/(\d+)/.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera'
    : /Firefox\/(\d+)/.test(u) ? 'Firefox' : /CriOS|Chrome\/(\d+)/.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Other';
  const kind = /iPad|Tablet/.test(u) || (/Android/.test(u) && !/Mobile/.test(u)) ? 'tablet' : /Mobi|iPhone|Android/.test(u) ? 'phone' : 'computer';
  return `${os.trim()}, ${br}, ${kind}`;
}

const cleanScreen = (s) => (/^\d{2,5}x\d{2,5}(@[\d.]{1,4})?$/.test(String(s || '')) ? String(s) : null);

export async function recordVisit(db, request, userId, kind, screen) {
  const cf = request.cf || {};
  const ua = (request.headers.get('user-agent') || '').slice(0, 300);
  const now = Date.now();
  await db.batch([
    db.prepare('INSERT INTO visits (user_id, kind, at, ip, country, region, city, device, ua, screen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(userId, kind, now, request.headers.get('cf-connecting-ip') || null, cf.country || null, cf.region || null, cf.city || null, parseDevice(ua), ua, cleanScreen(screen)),
    db.prepare('UPDATE users SET last_visit = ? WHERE id = ?').bind(now, userId),
  ]);
  if (Math.random() < 0.02) await db.prepare('DELETE FROM visits WHERE at < ?').bind(now - KEEP_DAYS * 86400e3).run();
}

// a presence ping: a new visit after a while away, and the time since the last ping counted as play
export async function notePresence(db, request, user, presence, screen) {
  const now = Date.now();
  if (!user.last_visit || now - user.last_visit > VISIT_EVERY) await recordVisit(db, request, user.id, 'visit', screen);
  let prev = null;
  try { prev = user.presence ? JSON.parse(user.presence) : null; } catch { prev = null; }
  const gap = now - (user.last_seen || 0);
  if (prev && prev.world && gap > 0 && gap < 150e3) {
    const day = new Date(user.last_seen).toISOString().slice(0, 10);
    await db.prepare('INSERT INTO play_time (user_id, day, mode, world, seconds) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, day, mode, world) DO UPDATE SET seconds = seconds + excluded.seconds')
      .bind(user.id, day, String(prev.mode || 'world').slice(0, 20), String(prev.world).slice(0, 40), Math.round(gap / 1000)).run();
  }
}
