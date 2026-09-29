// Soulcraft accounts API (Cloudflare Pages Function, D1 bound as DB).
//
//   POST /api/auth/login        {login, password, remember}   email or phone
//   POST /api/auth/logout
//   GET  /api/me                                              current user
//   PATCH /api/me               {name, email, phone, avatar}
//   POST /api/me/password       {current, next}
//   POST /api/mp/room           {world}  open a multiplayer room, returns {code}
//   GET  /api/mp/ws/:code       WebSocket into a room (forwarded to the ROOMS
//                               Durable Object of the soulcraft-mp Worker)
//   POST /api/feedback          {kind, text, ctx}  an idea or a problem report
//   GET  /api/saves             list of slots (no data)
//   GET  /api/saves/:slot       one save
//   PUT  /api/saves/:slot       {data, savedAt}
//   Superadmin only:
//   GET    /api/admin/users              ?q=
//   POST   /api/admin/users              {name, email, phone, password}
//   PATCH  /api/admin/users/:id          {name, email, phone, disabled, avatar}
//   POST   /api/admin/users/:id/password {password}
//   DELETE /api/admin/users/:id
//   GET    /api/admin/users/:id/saves
//   GET    /api/admin/stats                      accounts and activity
//   GET    /api/admin/insights                   how the game is played
//   GET    /api/admin/feedback                   ideas and problem reports
//   PATCH  /api/admin/feedback/:id               {done}
//   DELETE /api/admin/feedback/:id
//
// The superadmin is not stored in the database: SUPERADMIN_LOGIN and
// SUPERADMIN_PASSWORD come from Pages secrets (set from GitHub secrets).
import {
  json, err, hashPassword, verifyPassword, safeEqual, sha256, normEmail, normPhone, normName, normUsername, checkPassword, checkAvatar,
  publicUser, createSession, currentSession, sessionCookie, clearCookie, tooManyAttempts, noteFailure, clearFailures, randomToken,
} from '../../server/lib.js';
import { resetEmail, sendEmail } from '../../server/mail.js';

const RESET_TTL = 60 * 60e3; // reset links work for an hour
const today = () => new Date().toISOString().slice(0, 10);
// remember that a player was active today (for the statistics)
const noteActive = (db, uid) => db.prepare('INSERT OR IGNORE INTO activity (user_id, day) VALUES (?, ?)').bind(uid, today()).run();

// save slots: the profile, the Treasure Quest run, and up to MAX_WORLDS
// worlds ("w-" + id); "current" is the single world from older versions
const SLOTS = new Set(['current', 'quest', 'profile']);
const validSlot = (s) => SLOTS.has(s) || /^w-[a-z0-9]{4,12}$/.test(s || '');
const MAX_WORLDS = 6;
const MAX_SAVE = 900000;
// room codes: 6 characters without the easily confused 0/O and 1/I
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => CODE_CHARS[n % CODE_CHARS.length]).join('');
function cleanInfo(info) {
  if (!info || typeof info !== 'object') return null;
  const out = { name: String(info.name || '').slice(0, 40), day: Math.max(1, Math.min(1e6, Number(info.day) || 1)), mode: ['survival', 'creative', 'quest'].includes(info.mode) ? info.mode : 'survival' };
  return JSON.stringify(out);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return err(503, 'no_database', 'Accounts are not configured yet.');
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  // CSRF: state-changing calls must be same-origin JSON requests
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return err(403, 'bad_origin');
    // a JSON body can't be sent cross-site without a CORS preflight (which we never answer)
    if (method !== 'DELETE' && !(request.headers.get('content-type') || '').includes('application/json')) return err(415, 'json_required');
  }
  try {
    return await route(parts, method, request, env, secure);
  } catch (e) {
    console.error('api error', e && e.stack || e);
    return err(500, 'server_error', 'Something went wrong.');
  }
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

async function route(parts, method, request, env, secure) {
  const db = env.DB;
  const [a, b, c, d] = parts;

  // ---------- auth ----------
  if (a === 'auth' && b === 'login' && method === 'POST') {
    const { login, password, remember } = await body(request);
    const ident = String(login || '').trim();
    if (!ident || !password) return err(400, 'missing_fields');
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const rlKey = 'login:' + (await sha256(ident.toLowerCase() + '|' + ip));
    if (await tooManyAttempts(db, rlKey)) return err(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minutes.');
    // superadmin from secrets
    if (env.SUPERADMIN_LOGIN && env.SUPERADMIN_PASSWORD && safeEqual(ident.toLowerCase(), String(env.SUPERADMIN_LOGIN).toLowerCase())) {
      if (!safeEqual(String(password), String(env.SUPERADMIN_PASSWORD))) { await noteFailure(db, rlKey); return err(401, 'bad_credentials'); }
      await clearFailures(db, rlKey);
      const token = await createSession(db, 0, 'superadmin', !!remember);
      return json({ role: 'superadmin', user: { id: 0, name: 'Superadmin' } }, 200, { 'set-cookie': sessionCookie(token, !!remember, secure) });
    }
    const email = normEmail(ident), phone = normPhone(ident), username = normUsername(ident);
    let user = null;
    if (email) user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    else {
      if (phone) user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
      if (!user && username) user = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    }
    if (!user || !(await verifyPassword(String(password), user))) { await noteFailure(db, rlKey); return err(401, 'bad_credentials'); }
    if (user.disabled) return err(403, 'disabled');
    if (user.banned_until && user.banned_until > Date.now()) return json({ error: 'banned', message: 'This account is banned.', until: user.banned_until, reason: user.ban_reason || '' }, 403);
    await clearFailures(db, rlKey);
    await db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(Date.now(), user.id).run();
    await noteActive(db, user.id);
    const token = await createSession(db, user.id, 'user', !!remember);
    return json({ role: 'user', user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token, !!remember, secure) });
  }

  // forgotten password: email a one-time link (the answer never says
  // whether the address belongs to an account)
  if (a === 'auth' && b === 'forgot' && method === 'POST') {
    const { email: raw, lang } = await body(request);
    const email = normEmail(raw);
    if (!email) return err(400, 'bad_email');
    if (!env.RESEND_API_KEY && env.MAIL_TEST !== '1') return err(503, 'email_not_configured', 'Password reset by email is not set up yet.');
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const rlKey = 'forgot:' + (await sha256(email + '|' + ip));
    if (await tooManyAttempts(db, rlKey)) return err(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minutes.');
    await noteFailure(db, rlKey); // every request counts towards the limit
    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user || user.disabled) return json({ ok: true });
    const token = randomToken(32);
    const now = Date.now();
    await db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?').bind(user.id, now).run();
    await db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), user.id, now + RESET_TTL, now).run();
    const link = new URL(request.url).origin + '/?reset=' + encodeURIComponent(token);
    if (env.MAIL_TEST === '1') return json({ ok: true, testLink: link }); // local tests only
    const mail = resetEmail({ name: user.name, link, lang: lang === 'ru' ? 'ru' : 'en' });
    const sent = await sendEmail(env, { to: email, ...mail });
    if (!sent) return err(502, 'email_failed', 'The email could not be sent. Try again later.');
    return json({ ok: true });
  }
  if (a === 'auth' && b === 'reset' && method === 'POST') {
    const { token, password } = await body(request);
    const pw = checkPassword(password);
    if (!pw) return err(400, 'weak_password');
    if (!token || String(token).length > 100) return err(400, 'bad_token');
    const th = await sha256(String(token));
    const r = await db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').bind(th).first();
    if (!r || r.used_at || r.expires_at < Date.now()) return err(400, 'bad_token', 'This link has expired or was already used.');
    const h = await hashPassword(pw);
    await db.batch([
      db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iter, Date.now(), r.user_id),
      db.prepare('UPDATE password_resets SET used_at = ? WHERE token_hash = ?').bind(Date.now(), th),
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND role = 'user'").bind(r.user_id),
    ]);
    return json({ ok: true });
  }

  const s = await currentSession(request, env);

  // ---------- feedback (players and guests) ----------
  if (a === 'feedback' && !b && method === 'POST') {
    const { kind, text, ctx } = await body(request);
    const msg = String(text || '').trim().slice(0, 1000);
    if (!msg) return err(400, 'empty');
    const ip = request.headers.get('cf-connecting-ip') || 'local';
    const rlKey = 'feedback:' + (await sha256(ip + '|' + (s && s.user ? s.user.id : 'guest')));
    if (await tooManyAttempts(db, rlKey)) return err(429, 'too_many_attempts', 'Too many messages. Try again in 15 minutes.');
    await noteFailure(db, rlKey); // every message counts towards the limit
    let c = '';
    try { c = JSON.stringify(ctx && typeof ctx === 'object' ? ctx : {}).slice(0, 1500); } catch { c = ''; }
    const who = s && s.user ? s.user : null;
    await db.prepare('INSERT INTO feedback (user_id, name, kind, text, ctx, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(who ? who.id : null, who ? who.name : null, kind === 'bug' ? 'bug' : 'idea', msg, c, Date.now()).run();
    return json({ ok: true });
  }

  if (a === 'auth' && b === 'logout' && method === 'POST') {
    if (s) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.tokenHash).run();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
  }

  // guests get a plain 200 here, so the game's start-up check logs no error
  if (!s && a === 'me' && !b && method === 'GET') return json({ role: null, user: null, mp: !!env.ROOMS });
  if (!s) return err(401, 'not_signed_in');

  // ---------- me ----------
  if (a === 'me' && !b && method === 'GET') {
    if (s.role === 'superadmin') return json({ role: 'superadmin', user: { id: 0, name: 'Superadmin' } });
    await noteActive(db, s.user.id);
    return json({ role: 'user', user: publicUser(s.user), mp: !!env.ROOMS });
  }
  if (a === 'me' && !b && method === 'PATCH') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const r = await applyProfile(db, s.user, await body(request), false);
    return r instanceof Response ? r : json({ user: publicUser(r) });
  }
  if (a === 'me' && b === 'password' && method === 'POST') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const { current, next } = await body(request);
    if (!(await verifyPassword(String(current || ''), s.user))) return err(401, 'bad_current_password');
    const pw = checkPassword(next);
    if (!pw) return err(400, 'weak_password', 'The new password must be at least 6 characters.');
    await setPassword(db, s.user.id, pw);
    // sign out other devices, keep this one
    await db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ? AND token_hash != ?').bind(s.user.id, 'user', s.tokenHash).run();
    return json({ ok: true });
  }

  // ---------- multiplayer rooms ----------
  if (a === 'mp') {
    if (s.role !== 'user') return err(403, 'forbidden');
    if (!env.ROOMS) return err(503, 'mp_unavailable', 'Multiplayer is not set up yet.');
    const room = (code) => env.ROOMS.get(env.ROOMS.idFromName(code));
    if (b === 'room' && !c && method === 'POST') {
      const { world } = await body(request);
      for (let i = 0; i < 5; i++) {
        const code = roomCode();
        const r = await room(code).fetch('https://room/create', { method: 'POST', body: JSON.stringify({ host: s.user.id, name: String(world || '').slice(0, 40) }) });
        if (r.ok) return json({ code });
      }
      return err(503, 'no_code');
    }
    if (b === 'ws' && c && method === 'GET') {
      const code = String(c).toUpperCase();
      if (!/^[A-Z0-9]{6}$/.test(code)) return err(400, 'bad_code');
      if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return err(426, 'websocket_required');
      // no cross-site WebSocket hijacking: the page must be ours
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return err(403, 'bad_origin');
      const h = new Headers(request.headers);
      h.set('X-User-Id', String(s.user.id));
      h.set('X-User-Name', s.user.name);
      return room(code).fetch(new Request(request.url, { headers: h }));
    }
    return err(404, 'not_found');
  }

  // ---------- friends and presence ----------
  if (a === 'presence' && method === 'POST') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const p = await body(request);
    const presence = { world: p.world ? String(p.world).slice(0, 40) : null, room: /^[A-Z0-9]{6}$/.test(String(p.room || '')) ? String(p.room) : null, city: p.city ? String(p.city).slice(0, 20) : null };
    await db.prepare('UPDATE users SET last_seen = ?, presence = ? WHERE id = ?').bind(Date.now(), JSON.stringify(presence), s.user.id).run();
    return json({ ok: true });
  }
  if (a === 'friends') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const me = s.user.id;
    const pair = (x, y) => (x < y ? [x, y] : [y, x]);
    if (!b && method === 'GET') {
      const { results } = await db.prepare(`SELECT f.*, u.id AS uid, u.name, u.username, u.avatar, u.last_seen, u.presence FROM friends f
        JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END WHERE f.a = ? OR f.b = ?`).bind(me, me, me).all();
      const now = Date.now();
      const person = (r) => {
        const online = !!(r.last_seen && now - r.last_seen < 150e3);
        const pr = online && r.status === 'accepted' && r.presence ? JSON.parse(r.presence) : null;
        return { id: r.uid, name: r.name, username: r.username || null, avatar: r.avatar || null, online, world: pr ? pr.world : null, room: pr ? pr.room : null, city: pr ? pr.city : null };
      };
      return json({
        friends: results.filter((r) => r.status === 'accepted').map(person).sort((x, y) => (y.online - x.online) || x.name.localeCompare(y.name)),
        incoming: results.filter((r) => r.status === 'pending' && r.requested_by !== me).map(person),
        outgoing: results.filter((r) => r.status === 'pending' && r.requested_by === me).map(person),
      });
    }
    if (!b && method === 'POST') {
      const username = normUsername((await body(request)).username);
      if (!username) return err(400, 'bad_username', 'Type a username.');
      const other = await db.prepare('SELECT id, name FROM users WHERE username = ? AND disabled = 0').bind(username).first();
      if (!other) return err(404, 'no_user', 'There is no player with that username.');
      if (other.id === me) return err(400, 'self', 'That is you.');
      const [x, y] = pair(me, other.id);
      const f = await db.prepare('SELECT * FROM friends WHERE a = ? AND b = ?').bind(x, y).first();
      if (f && f.status === 'accepted') return err(409, 'already_friends', 'You are already friends.');
      if (f && f.requested_by === me) return err(409, 'already_asked', 'You have already asked.');
      if (f) { // they asked first: this accepts
        await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?").bind(x, y).run();
        return json({ ok: true, status: 'accepted', name: other.name });
      }
      const pending = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE requested_by = ? AND status = 'pending'").bind(me).first();
      if (pending.n >= 50) return err(429, 'too_many_requests', 'Too many open requests.');
      await db.prepare('INSERT INTO friends (a, b, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?)').bind(x, y, me, 'pending', Date.now()).run();
      return json({ ok: true, status: 'pending', name: other.name }, 201);
    }
    const other = Number(b);
    if (other > 0) {
      const [x, y] = pair(me, other);
      if (c === 'accept' && method === 'POST') {
        const r = await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending' AND requested_by != ?").bind(x, y, me).run();
        return r.meta.changes ? json({ ok: true }) : err(404, 'no_request');
      }
      if (!c && method === 'DELETE') {
        await db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').bind(x, y).run();
        return json({ ok: true });
      }
    }
    return err(404, 'not_found');
  }

  // ---------- saves ----------
  if (a === 'saves') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const uid = s.user.id;
    if (!b && method === 'GET') {
      const { results } = await db.prepare('SELECT slot, saved_at, updated_at, length(data) AS size, info FROM saves WHERE user_id = ?').bind(uid).all();
      return json({ saves: results.map((r) => ({ slot: r.slot, savedAt: r.saved_at, updatedAt: r.updated_at, size: r.size, info: r.info ? JSON.parse(r.info) : null })) });
    }
    if (!validSlot(b)) return err(400, 'bad_slot');
    if (method === 'DELETE') {
      await db.prepare('DELETE FROM saves WHERE user_id = ? AND slot = ?').bind(uid, b).run();
      return json({ ok: true });
    }
    if (method === 'GET') {
      const r = await db.prepare('SELECT data, saved_at FROM saves WHERE user_id = ? AND slot = ?').bind(uid, b).first();
      if (!r) return err(404, 'no_save');
      return json({ slot: b, savedAt: r.saved_at, data: JSON.parse(r.data) });
    }
    if (method === 'PUT') {
      const { data, savedAt, info } = await body(request);
      if (!data || typeof data !== 'object') return err(400, 'bad_data');
      const text = JSON.stringify(data);
      if (text.length > MAX_SAVE) return err(413, 'save_too_large');
      const at = Number(savedAt) || Date.now();
      if (b.startsWith('w-')) {
        const have = await db.prepare("SELECT slot FROM saves WHERE user_id = ? AND slot LIKE 'w-%'").bind(uid).all();
        const slots = have.results.map((r) => r.slot);
        if (!slots.includes(b) && slots.length >= MAX_WORLDS) return err(409, 'too_many_worlds');
      }
      await db.prepare('INSERT INTO saves (user_id, slot, data, saved_at, updated_at, info) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, slot) DO UPDATE SET data = excluded.data, saved_at = excluded.saved_at, updated_at = excluded.updated_at, info = excluded.info')
        .bind(uid, b, text, at, Date.now(), cleanInfo(info)).run();
      return json({ ok: true, savedAt: at });
    }
  }

  // ---------- admin ----------
  if (a === 'admin') {
    const sup = s.role === 'superadmin';
    if (!sup && !(s.role === 'user' && s.user.role === 'admin')) return err(403, 'forbidden');
    const actor = sup ? { id: 0, name: 'Superadmin' } : { id: s.user.id, name: s.user.name };
    const log = (action, target, detail = '') => db.prepare('INSERT INTO audit (at, actor_id, actor_name, action, target_id, target_name, detail) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(Date.now(), actor.id, actor.name, action, target ? target.id : null, target ? target.name : null, String(detail).slice(0, 300)).run();
    if (b === 'audit' && method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM audit ORDER BY at DESC LIMIT 300').all();
      return json({ entries: results.map((r) => ({ at: r.at, actorId: r.actor_id, actorName: r.actor_name, action: r.action, targetId: r.target_id, targetName: r.target_name, detail: r.detail })) });
    }
    if (b === 'stats' && method === 'GET') return json(await stats(db, env));
    if (b === 'insights' && method === 'GET') return json(await insights(db));
    if (b === 'feedback') {
      if (!c && method === 'GET') {
        const { results } = await db.prepare('SELECT * FROM feedback ORDER BY done ASC, created_at DESC LIMIT 300').all();
        return json({ feedback: results.map((f) => ({ id: f.id, userId: f.user_id, name: f.name, kind: f.kind, text: f.text, ctx: f.ctx ? JSON.parse(f.ctx) : null, createdAt: f.created_at, done: !!f.done })) });
      }
      const fid = Number(c);
      if (fid > 0 && method === 'PATCH') {
        await db.prepare('UPDATE feedback SET done = ? WHERE id = ?').bind((await body(request)).done ? 1 : 0, fid).run();
        return json({ ok: true });
      }
      if (fid > 0 && method === 'DELETE') {
        await db.prepare('DELETE FROM feedback WHERE id = ?').bind(fid).run();
        return json({ ok: true });
      }
    }
    if (b === 'users' && !c && method === 'GET') {
      const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      const { results } = await db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM saves s WHERE s.user_id = u.id) AS saves
        FROM users u WHERE ? = '' OR lower(u.name) LIKE ? OR lower(ifnull(u.email, '')) LIKE ? OR ifnull(u.phone, '') LIKE ? OR ifnull(u.username, '') LIKE ? ORDER BY u.created_at DESC LIMIT 500`)
        .bind(q, like, like, like, like).all();
      return json({ users: results.map((u) => ({ ...publicUser(u), saves: u.saves })) });
    }
    if (b === 'users' && !c && method === 'POST') {
      const inp = await body(request);
      const pw = checkPassword(inp.password);
      if (!pw) return err(400, 'weak_password', 'Password must be at least 6 characters.');
      const name = normName(inp.name);
      if (!name) return err(400, 'bad_name', 'Name is required (up to 40 characters).');
      const email = normEmail(inp.email), phone = normPhone(inp.phone), username = normUsername(inp.username);
      if (email === undefined) return err(400, 'bad_email', 'That email address does not look right.');
      if (phone === undefined) return err(400, 'bad_phone', 'Phone must be 6-16 digits, optionally starting with +.');
      if (username === undefined) return err(400, 'bad_username', USERNAME_RULE);
      if (!email && !phone && !username) return err(400, 'need_login', 'Give the user a username, an email or a phone number to sign in with.');
      if (username && reservedName(env, username)) return err(409, 'username_taken', 'That username is already taken.');
      const dup = await findDuplicate(db, email, phone, 0, username);
      if (dup) return dup;
      const now = Date.now();
      const h = await hashPassword(pw);
      const r = await db.prepare('INSERT INTO users (name, email, phone, username, pass_hash, pass_salt, pass_iter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(name, email, phone, username, h.hash, h.salt, h.iter, now, now).run();
      const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
      await log('user_add', u);
      return json({ user: publicUser(u) }, 201);
    }
    const id = Number(c);
    if (b === 'users' && id > 0) {
      const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!u) return err(404, 'no_user');
      const readOnly = d === 'saves' && method === 'GET';
      if (!sup && u.role === 'admin' && !readOnly) return err(403, 'forbidden', 'Only the superadmin can change an admin.');
      if (!d && method === 'PATCH') {
        const inp = await body(request);
        const r = await applyProfile(db, u, inp, true, env);
        if (!(r instanceof Response)) await log('disabled' in inp && Object.keys(inp).length === 1 ? (inp.disabled ? 'disable' : 'enable') : 'user_edit', u);
        return r instanceof Response ? r : json({ user: publicUser(r) });
      }
      if (d === 'ban' && method === 'POST') {
        const inp = await body(request);
        const minutes = Math.max(0, Math.min(525600, Number(inp.minutes) || 0));
        const until = minutes ? Date.now() + minutes * 60e3 : 4102444800000; // "until lifted": the year 2100
        const reason = String(inp.reason || '').trim().slice(0, 200);
        await db.batch([
          db.prepare('UPDATE users SET banned_until = ?, ban_reason = ?, updated_at = ? WHERE id = ?').bind(until, reason || null, Date.now(), id),
          db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ?').bind(id, 'user'),
        ]);
        await log('ban', u, (minutes ? `${minutes} min` : 'until lifted') + (reason ? ': ' + reason : ''));
        return json({ ok: true, until });
      }
      if (d === 'ban' && method === 'DELETE') {
        await db.prepare('UPDATE users SET banned_until = NULL, ban_reason = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
        await log('unban', u);
        return json({ ok: true });
      }
      if (d === 'role' && method === 'POST') {
        if (!sup) return err(403, 'forbidden', 'Only the superadmin can give or take admin rights.');
        const role = (await body(request)).role === 'admin' ? 'admin' : 'player';
        await db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').bind(role, Date.now(), id).run();
        await log('role', u, role);
        return json({ ok: true, role });
      }
      if (!d && method === 'DELETE') {
        if (!sup) return err(403, 'forbidden', 'Only the superadmin can delete accounts.');
        await log('user_delete', u);
        await db.batch([
          db.prepare('DELETE FROM saves WHERE user_id = ?').bind(id),
          db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ?').bind(id, 'user'),
          db.prepare('DELETE FROM users WHERE id = ?').bind(id),
        ]);
        return json({ ok: true });
      }
      if (d === 'password' && method === 'POST') {
        const pw = checkPassword((await body(request)).password);
        if (!pw) return err(400, 'weak_password', 'Password must be at least 6 characters.');
        await setPassword(db, id, pw);
        await db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ?').bind(id, 'user').run();
        await log('password', u);
        return json({ ok: true });
      }
      if (d === 'saves' && method === 'GET') {
        const { results } = await db.prepare('SELECT slot, data, saved_at FROM saves WHERE user_id = ?').bind(id).all();
        return json({ saves: results.map((r) => ({ slot: r.slot, savedAt: r.saved_at, summary: summarize(r.slot, r.data) })) });
      }
    }
  }
  return err(404, 'not_found');
}

const USERNAME_RULE = 'A username is 2-24 letters or digits (also _ . -) with at least one letter.';
// the superadmin's login cannot be a player's username
const reservedName = (env, username) => !!env.SUPERADMIN_LOGIN && String(env.SUPERADMIN_LOGIN).toLowerCase() === username;

async function findDuplicate(db, email, phone, selfId, username = null) {
  if (username) { const x = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').bind(username, selfId).first(); if (x) return err(409, 'username_taken', 'That username is already taken.'); }
  if (email) { const x = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, selfId).first(); if (x) return err(409, 'email_taken', 'That email is already used by another user.'); }
  if (phone) { const x = await db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').bind(phone, selfId).first(); if (x) return err(409, 'phone_taken', 'That phone number is already used by another user.'); }
  return null;
}

async function setPassword(db, id, pw) {
  const h = await hashPassword(pw);
  await db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iter, Date.now(), id).run();
}

// Shared by the user's own profile edit and the admin's edit.
async function applyProfile(db, u, inp, admin, env = {}) {
  const next = { name: u.name, email: u.email, phone: u.phone, username: u.username || null, avatar: u.avatar, disabled: u.disabled };
  if ('name' in inp) { const v = normName(inp.name); if (!v) return err(400, 'bad_name', 'Name is required (up to 40 characters).'); next.name = v; }
  if ('email' in inp) { const v = normEmail(inp.email); if (v === undefined) return err(400, 'bad_email', 'That email address does not look right.'); next.email = v; }
  if ('phone' in inp) { const v = normPhone(inp.phone); if (v === undefined) return err(400, 'bad_phone', 'Phone must be 6-16 digits, optionally starting with +.'); next.phone = v; }
  if ('avatar' in inp) { const v = checkAvatar(inp.avatar); if (v === undefined) return err(400, 'bad_avatar', 'The picture must be a PNG, JPEG or WebP under 150 KB.'); next.avatar = v; }
  if (admin && 'disabled' in inp) next.disabled = inp.disabled ? 1 : 0;
  // only the admin gives out usernames
  if (admin && 'username' in inp) {
    const v = normUsername(inp.username);
    if (v === undefined) return err(400, 'bad_username', USERNAME_RULE);
    if (v && reservedName(env, v)) return err(409, 'username_taken', 'That username is already taken.');
    next.username = v;
  }
  if (!next.email && !next.phone && !next.username) return err(400, 'need_login', 'Keep a username, an email or a phone number to sign in with.');
  const dup = await findDuplicate(db, next.email, next.phone, u.id, next.username !== (u.username || null) ? next.username : null);
  if (dup) return dup;
  await db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, username = ?, avatar = ?, disabled = ?, updated_at = ? WHERE id = ?')
    .bind(next.name, next.email, next.phone, next.username, next.avatar, next.disabled, Date.now(), u.id).run();
  if (admin && next.disabled) await db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ?').bind(u.id, 'user').run();
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
}

// Numbers for the admin panel's statistics page.
async function stats(db, env) {
  const now = Date.now();
  const dayAgo = (n) => new Date(now - n * 86400e3).toISOString().slice(0, 10);
  const one = async (sql, ...args) => (await db.prepare(sql).bind(...args).first()) || {};
  const users = await one('SELECT COUNT(*) AS n, SUM(disabled) AS off, SUM(created_at > ?) AS new30 FROM users', now - 30 * 86400e3);
  const active7 = await one('SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?', dayAgo(6));
  const active30 = await one('SELECT COUNT(DISTINCT user_id) AS n FROM activity WHERE day >= ?', dayAgo(29));
  const { results: days } = await db.prepare('SELECT day, COUNT(*) AS n FROM activity WHERE day >= ? GROUP BY day').bind(dayAgo(13)).all();
  const perDay = Object.fromEntries(days.map((d) => [d.day, d.n]));
  const daily = Array.from({ length: 14 }, (_, i) => { const d = dayAgo(13 - i); return { day: d, n: perDay[d] || 0 }; });
  const worlds = await one("SELECT COUNT(*) AS n, SUM(info LIKE '%\"creative\"%') AS creative FROM saves WHERE slot LIKE 'w-%'");
  const quest = await one("SELECT COUNT(*) AS n, SUM(json_extract(data, '$.quest.done') = 1) AS done FROM saves WHERE slot = 'quest'");
  const online = await one("SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE role = 'user' AND expires_at > ?", now);
  const fb = await one('SELECT COUNT(*) AS n FROM feedback WHERE done = 0');
  const { results: top } = await db.prepare(`SELECT u.id, u.name, u.avatar, json_extract(s.data, '$.totalCrystals') AS crystals, json_extract(s.data, '$.pet') AS pet
    FROM saves s JOIN users u ON u.id = s.user_id WHERE s.slot = 'profile' ORDER BY crystals DESC LIMIT 5`).all();
  return {
    users: users.n || 0, disabled: users.off || 0, newUsers30: users.new30 || 0,
    active7: active7.n || 0, active30: active30.n || 0, signedIn: online.n || 0,
    worlds: worlds.n || 0, creativeWorlds: worlds.creative || 0,
    questStarted: quest.n || 0, questDone: quest.done || 0,
    daily, top: top.map((t) => ({ id: t.id, name: t.name, avatar: t.avatar || null, crystals: t.crystals || 0, pet: t.pet || null })),
    email: !!env.RESEND_API_KEY,
    feedbackNew: fb.n || 0,
  };
}

// How the game is played, read from the cloud saves. SQLite does the JSON
// work (json_extract / json_each), so the Function itself stays light.
async function insights(db) {
  const all = async (sql) => (await db.prepare(sql).all()).results;
  const PLAYED = "(s.slot LIKE 'w-%' OR s.slot IN ('current', 'quest'))";
  const WORLD = "(s.slot LIKE 'w-%' OR s.slot = 'current')";
  const num = (path) => `ifnull(json_extract(s.data, '${path}'), 0)`;
  const [totals] = await all(`SELECT SUM(${num('$.playTime')}) AS play, SUM(${num('$.stats.placed')}) AS placed, SUM(${num('$.stats.broken')}) AS broken,
    SUM(${num('$.stats.kills')}) AS kills, SUM(${num('$.stats.deaths')}) AS deaths FROM saves s WHERE ${PLAYED}`);
  const causes = await all(`SELECT j.key AS cause, SUM(j.value) AS n FROM saves s, json_each(s.data, '$.stats.causes') j WHERE ${PLAYED} GROUP BY j.key ORDER BY n DESC`);
  const cleared = await all("SELECT j.value AS level, COUNT(DISTINCT s.user_id) AS n FROM saves s, json_each(s.data, '$.quest.solved') j WHERE s.slot = 'quest' GROUP BY j.value");
  const fails = await all("SELECT CAST(j.key AS INTEGER) AS level, SUM(j.value) AS n FROM saves s, json_each(s.data, '$.quest.fails') j WHERE s.slot = 'quest' GROUP BY j.key");
  const [quest] = await all("SELECT COUNT(DISTINCT s.user_id) AS started FROM saves s WHERE s.slot = 'quest'");
  const players = await all(`SELECT u.id, u.name, u.username,
      (SELECT MAX(day) FROM activity a WHERE a.user_id = u.id) AS lastDay,
      SUM(CASE WHEN ${PLAYED} THEN ${num('$.playTime')} ELSE 0 END) AS play,
      SUM(CASE WHEN ${WORLD} THEN 1 ELSE 0 END) AS worlds,
      SUM(CASE WHEN ${PLAYED} THEN ${num('$.stats.placed')} ELSE 0 END) AS placed,
      SUM(CASE WHEN ${PLAYED} THEN ${num('$.stats.kills')} ELSE 0 END) AS kills,
      SUM(CASE WHEN ${PLAYED} THEN ${num('$.stats.deaths')} ELSE 0 END) AS deaths,
      MAX(CASE WHEN s.slot = 'quest' THEN (SELECT COUNT(*) FROM json_each(s.data, '$.quest.solved') q WHERE q.value BETWEEN 1 AND 12) END) AS ch1,
      MAX(CASE WHEN s.slot = 'quest' THEN (SELECT COUNT(*) FROM json_each(s.data, '$.quest.solved') q WHERE q.value BETWEEN 14 AND 21) END) AS ch2,
      MAX(CASE WHEN ${WORLD} THEN (SELECT COUNT(*) FROM json_each(s.data, '$.bosses') g WHERE g.value = 1) END) AS guardians,
      MAX(CASE WHEN s.slot = 'profile' THEN json_extract(s.data, '$.pet') END) AS pet
    FROM users u LEFT JOIN saves s ON s.user_id = u.id GROUP BY u.id ORDER BY play DESC LIMIT 200`);
  return {
    totals: { playSeconds: Math.round(totals.play || 0), placed: totals.placed || 0, broken: totals.broken || 0, kills: totals.kills || 0, deaths: totals.deaths || 0 },
    causes: causes.map((c) => ({ cause: c.cause, n: c.n })),
    questStarted: quest.started || 0,
    quest: cleared.filter((c) => c.level > 0).map((c) => ({ level: c.level, n: c.n })),
    fails: fails.map((f) => ({ level: f.level, n: f.n })),
    players: players.map((p) => ({ ...p, play: Math.round(p.play || 0) })), // ch1/ch2/guardians stay null without a quest or world save
  };
}

// A readable one-liner about a save, for the admin panel.
function summarize(slot, text) {
  try {
    const d = JSON.parse(text);
    if (slot === 'profile') return `${d.crystals || 0} crystals, skins: ${(d.skins || []).join(', ')}`;
    if (slot === 'quest') { const q = d.quest || {}; return `Treasure Quest: ${(q.solved || []).filter((i) => i > 0 && i <= 12).length}/12 levels${q.done ? ', complete' : ''}`; }
    const bosses = Object.values(d.bosses || {}).filter(Boolean).length;
    return `"${d.name || 'World'}"${d.creative ? ' (creative)' : ''}, day ${d.day || 1}, ${bosses}/5 guardians, ${Math.round((d.playTime || 0) / 60)} min played`;
  } catch { return 'unreadable'; }
}
