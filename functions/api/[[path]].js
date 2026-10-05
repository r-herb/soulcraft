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
//   GET  /api/push/key | POST /api/push/subscribe {endpoint, lang} | GET /api/push/pending
//   POST /api/mp/invite         {to, room, world}  invite a friend into my room
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
import { monthIndex, monthStart, scDate, PAY, SALARY_CAP, QUEST_MAX, TICKET, MAX_TICKETS } from '../../server/calendar.js';
import { HEIST_PAY, HEIST_NEEDS, HEIST_MIN_MS, TEST_CASH, FAB_PER_BAG, FAB_MAX_BAGS, ORO_PER_SACK, ORO_MAX_SACKS, PUERTO_PAY, AERO_PAY, MISSION_PAY, capFor, GOODS, SHOP, MENU, START_CASH, BUS_FARE, TICKETS, buyPrice, sellPrice, tradeTotal } from '../../server/goods.js';
import {
  json, err, hashPassword, verifyPassword, safeEqual, sha256, normEmail, normPhone, normName, normUsername, checkPassword, checkAvatar,
  publicUser, createSession, currentSession, sessionCookie, clearCookie, tooManyAttempts, noteFailure, clearFailures, randomToken,
} from '../../server/lib.js';
import { resetEmail, sendEmail } from '../../server/mail.js';
import { vapidKeys, wake, pushEndpointOk } from '../../server/push.js';
import { recordVisit, notePresence } from '../../server/analytics.js';

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
    const { login, password, remember, screen } = await body(request);
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
    await recordVisit(db, request, user.id, 'login', screen);
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
    // invite a friend into my room: a card with Join in their game, and a push if it is closed
    if (b === 'invite' && method === 'POST') {
      const { to, room: code, world, city } = await body(request);
      const other = Number(to);
      if (!(other > 0) || !/^[A-Z0-9]{6}$/.test(String(code || ''))) return err(400, 'bad_invite');
      const f = await db.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'accepted'").bind(Math.min(s.user.id, other), Math.max(s.user.id, other)).first();
      if (!f) return err(403, 'not_friends');
      const ev = { from: s.user.id, name: s.user.name, room: String(code), world: String(world || '').slice(0, 40), city: city ? String(city).slice(0, 20) : null };
      await push(env, [other], { t: 'invite', ...ev });
      await db.prepare('INSERT OR REPLACE INTO pending_events (user_id, kind, data, at) VALUES (?, ?, ?, ?)').bind(other, 'game', JSON.stringify(ev), Date.now()).run();
      await wake(env, db, [other]);
      return json({ ok: true });
    }
    return err(404, 'not_found');
  }

  // ---------- chat ----------
  // the live connection for new chat messages (the hub Durable Object)
  if (a === 'hub' && !b && method === 'GET') {
    if (s.role !== 'user') return err(403, 'forbidden');
    if (!env.ROOMS) return err(503, 'chat_unavailable');
    if ((request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') return err(426, 'websocket_required');
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return err(403, 'bad_origin');
    const h = new Headers(request.headers);
    h.set('X-User-Id', String(s.user.id));
    return hubStub(env).fetch(new Request('https://hub/hub/ws', { headers: h }));
  }
  if (a === 'chat') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const me = s.user, admin = me.role === 'admin';
    const dm = (x, y) => `d${Math.min(x, y)}:${Math.max(x, y)}`;
    const lastRead = async (conv) => ((await db.prepare('SELECT last_id FROM chat_reads WHERE user_id = ? AND conv = ?').bind(me.id, conv).first()) || { last_id: 0 }).last_id;
    const summary = async (conv) => {
      const last = await db.prepare('SELECT id, user_id, name, text, created_at, deleted_by FROM messages WHERE conv = ? ORDER BY id DESC LIMIT 1').bind(conv).first();
      const lr = await lastRead(conv);
      const unread = (await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conv = ? AND id > ? AND user_id != ? AND deleted_by IS NULL').bind(conv, lr, me.id).first()).n;
      return { last: last ? { name: last.name, text: last.deleted_by ? '' : last.text, at: last.created_at } : null, unread };
    };
    // the conversation a path names, if this player may use it
    const open = async (kind, id) => {
      if (kind === 'd') {
        const f = await db.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'accepted'").bind(Math.min(me.id, id), Math.max(me.id, id)).first();
        return f ? { conv: dm(me.id, id), to: [me.id, id] } : null;
      }
      const ch = await db.prepare('SELECT * FROM channels WHERE id = ? AND archived = 0').bind(id).first();
      if (!ch) return null;
      if (!admin && !(await db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').bind(id, me.id).first())) return null;
      return { conv: 'c' + id, channel: ch, to: null };
    };
    const recipients = async (o) => {
      if (o.to) return o.to;
      const { results } = await db.prepare("SELECT user_id AS id FROM channel_members WHERE channel_id = ? UNION SELECT id FROM users WHERE role = 'admin'").bind(o.channel.id).all();
      return results.map((r) => r.id);
    };
    const pub = (m) => ({ id: m.id, userId: m.user_id, name: m.name, text: m.deleted_by ? '' : m.text, at: m.created_at, deleted: !!m.deleted_by });
    if (!b && method === 'GET') {
      const { results: fr } = await db.prepare(`SELECT u.id, u.name, u.avatar FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
        WHERE (f.a = ? OR f.b = ?) AND f.status = 'accepted' ORDER BY u.name`).bind(me.id, me.id, me.id).all();
      const { results: ch } = admin
        ? await db.prepare('SELECT id, name FROM channels WHERE archived = 0 ORDER BY id').all()
        : await db.prepare('SELECT c.id, c.name FROM channels c JOIN channel_members m ON m.channel_id = c.id WHERE m.user_id = ? AND c.archived = 0 ORDER BY c.id').bind(me.id).all();
      const convs = [];
      for (const c of ch) convs.push({ kind: 'c', id: c.id, conv: 'c' + c.id, name: c.name, ...(await summary('c' + c.id)) });
      for (const f of fr) convs.push({ kind: 'd', id: f.id, conv: dm(me.id, f.id), name: f.name, avatar: f.avatar || null, ...(await summary(dm(me.id, f.id))) });
      const muted = me.muted_until && me.muted_until > Date.now() ? me.muted_until : null;
      return json({ convs, admin, muted });
    }
    if ((b === 'c' || b === 'd') && Number(c) > 0) {
      const o = await open(b, Number(c));
      if (!o) return err(403, 'no_access', 'You cannot use this chat.');
      if (method === 'GET') {
        const before = Number(new URL(request.url).searchParams.get('before')) || 2 ** 53;
        const { results } = await db.prepare('SELECT * FROM messages WHERE conv = ? AND id < ? ORDER BY id DESC LIMIT 60').bind(o.conv, before).all();
        return json({ conv: o.conv, messages: results.reverse().map(pub) });
      }
      if (method === 'POST') {
        if (me.muted_until && me.muted_until > Date.now()) return json({ error: 'muted', message: 'You are muted.', until: me.muted_until }, 403);
        const text = String((await body(request)).text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!text) return err(400, 'empty');
        const recent = await db.prepare('SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND created_at > ?').bind(me.id, Date.now() - 10e3).first();
        if (recent.n >= 5) return err(429, 'slow_down', 'Slow down a little.');
        const now = Date.now();
        const r = await db.prepare('INSERT INTO messages (conv, user_id, name, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(o.conv, me.id, me.name, text, now).run();
        const msg = { id: r.meta.last_row_id, userId: me.id, name: me.name, text, at: now, deleted: false };
        await db.prepare('INSERT INTO chat_reads (user_id, conv, last_id) VALUES (?, ?, ?) ON CONFLICT(user_id, conv) DO UPDATE SET last_id = excluded.last_id').bind(me.id, o.conv, msg.id).run();
        await push(env, await recipients(o), { t: 'msg', conv: o.conv, kind: b, id: Number(c), from: me.id, msg });
        return json({ message: msg }, 201);
      }
    }
    if (b === 'read' && method === 'POST') {
      const { conv, lastId } = await body(request);
      if (!/^(c\d+|d\d+:\d+)$/.test(String(conv))) return err(400, 'bad_conv');
      await db.prepare('INSERT INTO chat_reads (user_id, conv, last_id) VALUES (?, ?, ?) ON CONFLICT(user_id, conv) DO UPDATE SET last_id = MAX(last_id, excluded.last_id)').bind(me.id, conv, Number(lastId) || 0).run();
      return json({ ok: true });
    }
    if (b === 'report' && method === 'POST') {
      const { messageId, reason } = await body(request);
      const m = await db.prepare('SELECT * FROM messages WHERE id = ?').bind(Number(messageId)).first();
      if (!m) return err(404, 'no_message');
      await db.prepare('INSERT INTO reports (message_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?)').bind(m.id, me.id, String(reason || '').slice(0, 200) || null, Date.now()).run();
      return json({ ok: true });
    }
    return err(404, 'not_found');
  }

  // ---------- economy: wallet, bank, exchange, central bank ----------
  if (a === 'econ') {
    if (s.role !== 'user') return err(403, 'forbidden');
    // local tests may move the clock (to see a month end); never in production
    const testNow = env.TEST_CLOCK === '1' && Number(request.headers.get('x-test-now'));
    const uid = s.user.id, now = testNow || Date.now();
    await db.prepare('INSERT OR IGNORE INTO wallets (user_id, cash, bank, updated_at) VALUES (?, ?, 0, ?)').bind(uid, START_CASH, now).run();
    const wallet = async () => { const w = await db.prepare('SELECT cash, bank FROM wallets WHERE user_id = ?').bind(uid).first(); return { cash: w.cash, bank: w.bank }; };
    const supplyOf = async (item) => { const r = await db.prepare('SELECT supply FROM market WHERE item = ?').bind(item).first(); return r ? r.supply : 0; };
    // take coins from the hand only if there are enough (two requests at once cannot overdraw)
    const take = async (amount) => (await db.prepare('UPDATE wallets SET cash = cash - ?, updated_at = ? WHERE user_id = ? AND cash >= ?').bind(amount, now, uid, amount).run()).meta.changes > 0;
    const entry = (kind, item, qty, amount) => db.prepare('INSERT INTO ledger (user_id, kind, item, qty, amount, at) VALUES (?, ?, ?, ?, ?, ?)').bind(uid, kind, item, qty, amount, now);
    const month = monthIndex(now);
    const credit = (user, amount) => db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(amount, now, user);
    const ledger = (user, kind, item, qty, amount) => db.prepare('INSERT INTO ledger (user_id, kind, item, qty, amount, at) VALUES (?, ?, ?, ?, ?, ?)').bind(user, kind, item, qty, amount, now);
    // month-end business, done lazily by whoever asks first: this player's
    // salaries for past months, and past lottery draws
    const settle = async () => {
      const { results: due } = await db.prepare(`SELECT q.month, SUM(CASE q.kind WHEN 'daily' THEN ? WHEN 'boss' THEN ? ELSE ? END) AS pay FROM quest_log q
        LEFT JOIN salaries s ON s.user_id = q.user_id AND s.month = q.month WHERE q.user_id = ? AND q.month < ? AND s.month IS NULL GROUP BY q.month`).bind(PAY.daily, PAY.boss, PAY.treasure, uid, month).all();
      for (const d of due) {
        const amount = Math.min(SALARY_CAP, d.pay);
        const r = await db.prepare('INSERT OR IGNORE INTO salaries (user_id, month, amount, at) VALUES (?, ?, ?, ?)').bind(uid, d.month, amount, now).run();
        if (r.meta.changes) await db.batch([credit(uid, amount), ledger(uid, 'salary', null, d.month, amount)]);
      }
      const { results: draws } = await db.prepare('SELECT t.draw, COUNT(*) AS n FROM lottery_tickets t LEFT JOIN lottery_draws d ON d.draw = t.draw WHERE t.draw < ? AND d.draw IS NULL GROUP BY t.draw').bind(month).all();
      for (const d of draws) {
        const pick = await db.prepare('SELECT id, user_id FROM lottery_tickets WHERE draw = ? ORDER BY id LIMIT 1 OFFSET ?').bind(d.draw, Math.floor(Math.random() * d.n)).first();
        const pot = Math.floor(d.n * TICKET * 0.9); // a tenth stays with the city
        const r = await db.prepare('INSERT OR IGNORE INTO lottery_draws (draw, winner, ticket, pot, tickets, at) VALUES (?, ?, ?, ?, ?, ?)').bind(d.draw, pick.user_id, pick.id, pot, d.n, now).run();
        if (r.meta.changes) {
          await db.prepare('INSERT OR IGNORE INTO wallets (user_id, cash, bank, updated_at) VALUES (?, ?, 0, ?)').bind(pick.user_id, START_CASH, now).run();
          await db.batch([credit(pick.user_id, pot), ledger(pick.user_id, 'lottery', null, d.draw, pot)]);
          await push(env, [pick.user_id], { t: 'lottery', pot });
        }
      }
    };
    if (!b && method === 'GET') {
      await settle();
      const { results } = await db.prepare('SELECT item, supply FROM market').all();
      const sup = Object.fromEntries(results.map((r) => [r.item, r.supply]));
      const goods = Object.keys(GOODS).map((item) => ({ item, buy: buyPrice(item, sup[item] || 0), sell: sellPrice(item, sup[item] || 0), base: GOODS[item], supply: sup[item] || 0 }));
      const gold = (await db.prepare("SELECT value FROM econ_state WHERE key = 'gold_reserve'").first() || { value: 0 }).value;
      const money = (await db.prepare('SELECT SUM(cash + bank) AS m, COUNT(*) AS n FROM wallets').first()) || { m: 0, n: 0 };
      // this month's quests (the salary so far), the lottery, the calendar
      const { results: q } = await db.prepare('SELECT kind, COUNT(*) AS n FROM quest_log WHERE user_id = ? AND month = ? GROUP BY kind').bind(uid, month).all();
      const quests = { daily: 0, boss: 0, treasure: 0 };
      for (const r of q) quests[r.kind] = r.n;
      const earned = Math.min(SALARY_CAP, quests.daily * PAY.daily + quests.boss * PAY.boss + quests.treasure * PAY.treasure);
      const lastPay = await db.prepare('SELECT month, amount FROM salaries WHERE user_id = ? ORDER BY month DESC LIMIT 1').bind(uid).first();
      const pool = await db.prepare('SELECT COUNT(*) AS n, SUM(user_id = ?) AS mine FROM lottery_tickets WHERE draw = ?').bind(uid, month).first();
      const last = await db.prepare('SELECT d.draw, d.pot, d.tickets, d.winner, u.name FROM lottery_draws d LEFT JOIN users u ON u.id = d.winner ORDER BY d.draw DESC LIMIT 1').first();
      const fzi = await db.prepare('SELECT frozen_until, frozen_reason FROM wallets WHERE user_id = ?').bind(uid).first();
      // the mayors of Malaga: the players who did the big mission
      const { results: mayors } = await db.prepare("SELECT u.name, m.at FROM missions_done m JOIN users u ON u.id = m.user_id WHERE m.mission = 'heist' ORDER BY m.at LIMIT 20").all();
      return json({
        mayors,
        frozen: fzi && fzi.frozen_until > now ? { until: fzi.frozen_until, reason: fzi.frozen_reason || '' } : null,
        wallet: await wallet(), goods, central: { gold, money: money.m || 0, holders: money.n || 0, goldPrice: buyPrice('gold_ingot', sup.gold_ingot || 0) }, fare: BUS_FARE, tickets: TICKETS, shop: SHOP, menu: MENU,
        date: scDate(now), salary: { quests, earned, pay: PAY, cap: SALARY_CAP, last: lastPay || null },
        lottery: { ticket: TICKET, max: MAX_TICKETS, tickets: pool.n || 0, mine: pool.mine || 0, pot: Math.floor((pool.n || 0) * TICKET * 0.9), last: last ? { draw: last.draw, pot: last.pot, tickets: last.tickets, winner: last.name, you: last.winner === uid } : null },
      });
    }
    if (b === 'offers' && method === 'GET') {
      const { results } = await db.prepare(`SELECT o.id, o.seller, o.item, o.qty, o.price, o.created_at AS at, u.name FROM offers o JOIN users u ON u.id = o.seller
        WHERE o.status = 'open' ORDER BY o.id DESC LIMIT 100`).all();
      return json({ offers: results.map((o) => ({ ...o, mine: o.seller === uid })) });
    }
    if (b === 'history' && method === 'GET') {
      const { results } = await db.prepare('SELECT kind, item, qty, amount, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 30').bind(uid).all();
      return json({ history: results });
    }
    if (method !== 'POST') return err(404, 'not_found');
    const inp = await body(request);
    // a frozen wallet (an admin's decision) cannot trade until the date
    const fz = await db.prepare('SELECT frozen_until, frozen_reason FROM wallets WHERE user_id = ?').bind(uid).first();
    if (fz && fz.frozen_until && fz.frozen_until > now) return json({ error: 'frozen', message: 'This wallet is frozen by an admin.', until: fz.frozen_until, reason: fz.frozen_reason || '' }, 403);
    // how many units of a good this player may still sell today (exchange and market together)
    const sellLeft = async (item) => {
      const since = monthStart(month);
      const a = await db.prepare("SELECT IFNULL(SUM(qty), 0) AS n FROM ledger WHERE user_id = ? AND kind = 'sell' AND item = ? AND at >= ?").bind(uid, item, since).first();
      const b2 = await db.prepare('SELECT IFNULL(SUM(qty), 0) AS n FROM offers WHERE seller = ? AND item = ? AND created_at >= ?').bind(uid, item, since).first();
      return Math.max(0, capFor(item) - a.n - b2.n);
    };
    const capErr = (left) => json({ error: 'daily_cap', message: `You can sell ${left} more of this today.`, left }, 429);
    // a city mission finished: paid once per player
    if (b === 'mission') {
      const id = String(inp.id || '');
      if (!MISSION_PAY[id]) return err(400, 'bad_mission');
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, id, now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(MISSION_PAY[id], now, uid), entry('mission', id, null, MISSION_PAY[id])]);
      return json({ ok: true, paid: MISSION_PAY[id], wallet: await wallet() });
    }
    // El Gran Golpe: the Gran Diamante traded at the bank, once, after the
    // twelve tasks of the big mission; the player becomes the city's mayor
    if (b === 'heist') {
      const r0 = await db.prepare("SELECT COUNT(*) AS n, MIN(at) AS first FROM missions_done WHERE user_id = ? AND mission LIKE 'h\\_%' ESCAPE '\\'").bind(uid).first();
      // the superadmin's own player account tests the payout without the twelve tasks
      const tester = !!s.user.super_link;
      if (!tester && ((r0.n || 0) < HEIST_NEEDS || now - (r0.first || now) < HEIST_MIN_MS)) return err(409, 'not_yet', 'The big mission is not done yet.');
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, 'heist', now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(HEIST_PAY, now, uid), entry('heist', 'grand_diamond', 1, HEIST_PAY)]);
      return json({ ok: true, paid: HEIST_PAY, wallet: await wallet() });
    }
    // La Fábrica: the bags brought to El Maestro, paid once per account
    if (b === 'fabrica') {
      const bags = Math.max(0, Math.min(FAB_MAX_BAGS, Math.floor(Number(inp.bags) || 0)));
      if (!bags) return err(400, 'bad_qty');
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, 'fabrica', now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      const pay = bags * FAB_PER_BAG;
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(pay, now, uid), entry('fabrica', 'money_bag', bags, pay)]);
      return json({ ok: true, paid: pay, wallet: await wallet() });
    }
    // La Fábrica, season 2: the sacks of gold, paid once per account
    if (b === 'oro') {
      const sacks = Math.max(0, Math.min(ORO_MAX_SACKS, Math.floor(Number(inp.sacks) || 0)));
      if (!sacks) return err(400, 'bad_qty');
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, 'oro', now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      const pay = sacks * ORO_PER_SACK;
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(pay, now, uid), entry('oro', 'gold_sack', sacks, pay)]);
      return json({ ok: true, paid: pay, wallet: await wallet() });
    }
    // La Fábrica, season 3: El Maestro's thanks, once per account
    if (b === 'puerto') {
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, 'puerto', now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(PUERTO_PAY, now, uid), entry('puerto', null, null, PUERTO_PAY)]);
      return json({ ok: true, paid: PUERTO_PAY, wallet: await wallet() });
    }
    // La Fábrica, season 4: the gold flown away from the airport, once per account
    if (b === 'aero') {
      const r = await db.prepare('INSERT OR IGNORE INTO missions_done (user_id, mission, at) VALUES (?, ?, ?)').bind(uid, 'aero', now).run();
      if (!r.meta.changes) return json({ ok: true, paid: 0, wallet: await wallet() });
      await db.batch([db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(AERO_PAY, now, uid), entry('aero', null, null, AERO_PAY)]);
      return json({ ok: true, paid: AERO_PAY, wallet: await wallet() });
    }
    // test money for the superadmin's own player account (to try the shops, buses and bank)
    if (b === 'testcash') {
      if (!s.user.super_link) return err(403, 'forbidden');
      await db.batch([db.prepare('UPDATE wallets SET cash = MIN(cash + ?, 1000000000), updated_at = ? WHERE user_id = ?').bind(TEST_CASH, now, uid), entry('test', null, null, TEST_CASH)]);
      return json({ ok: true, paid: TEST_CASH, wallet: await wallet() });
    }
    // a quest done: counts toward this month's salary (once per quest per month)
    if (b === 'quest') {
      const kind = String(inp.kind || ''), ref = String(inp.ref || '').slice(0, 80);
      if (!PAY[kind] || !ref) return err(400, 'bad_quest');
      const done = (await db.prepare('SELECT COUNT(*) AS n FROM quest_log WHERE user_id = ? AND month = ? AND kind = ?').bind(uid, month, kind).first()).n;
      if (done >= QUEST_MAX[kind]) return json({ ok: true, counted: false });
      const r = await db.prepare('INSERT OR IGNORE INTO quest_log (user_id, month, kind, ref, at) VALUES (?, ?, ?, ?, ?)').bind(uid, month, kind, ref, now).run();
      return json({ ok: true, counted: r.meta.changes > 0 });
    }
    if (b === 'lottery') {
      const n = Math.floor(Number(inp.tickets) || 0);
      if (n < 1) return err(400, 'bad_qty');
      const have = (await db.prepare('SELECT COUNT(*) AS n FROM lottery_tickets WHERE draw = ? AND user_id = ?').bind(month, uid).first()).n;
      if (have + n > MAX_TICKETS) return err(409, 'too_many', `At most ${MAX_TICKETS} tickets a month.`);
      if (!(await take(n * TICKET))) return json({ error: 'no_money', message: 'Not enough coins.', need: n * TICKET }, 402);
      const ops = [entry('lottery_ticket', null, n, -n * TICKET)];
      for (let i = 0; i < n; i++) ops.push(db.prepare('INSERT INTO lottery_tickets (draw, user_id, at) VALUES (?, ?, ?)').bind(month, uid, now));
      await db.batch(ops);
      return json({ ok: true, wallet: await wallet() });
    }
    // the players' market: offer goods (they wait here), buy, or take back
    if (b === 'offers' && !c) {
      const item = String(inp.item || ''), qty = Math.floor(Number(inp.qty) || 0), price = Math.floor(Number(inp.price) || 0);
      if (!/^[a-z0-9_]{2,40}$/.test(item)) return err(400, 'bad_item');
      if (qty < 1 || qty > 640) return err(400, 'bad_qty');
      if (price < 1 || price > 100000) return err(400, 'bad_price');
      const open = (await db.prepare("SELECT COUNT(*) AS n FROM offers WHERE seller = ? AND status = 'open'").bind(uid).first()).n;
      if (open >= 20) return err(409, 'too_many', 'At most 20 offers at a time.');
      const left = await sellLeft(item);
      if (qty > left) return capErr(left);
      const r = await db.prepare('INSERT INTO offers (seller, item, qty, price, created_at) VALUES (?, ?, ?, ?, ?)').bind(uid, item, qty, price, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (b === 'offers' && c && (d === 'buy' || d === 'cancel')) {
      const o = await db.prepare("SELECT * FROM offers WHERE id = ? AND status = 'open'").bind(Number(c)).first();
      if (!o) return err(404, 'gone', 'This offer is no longer there.');
      if (d === 'cancel') {
        if (o.seller !== uid) return err(403, 'forbidden');
        const r = await db.prepare("UPDATE offers SET status = 'cancelled', closed_at = ? WHERE id = ? AND status = 'open'").bind(now, o.id).run();
        if (!r.meta.changes) return err(404, 'gone', 'This offer is no longer there.');
        return json({ ok: true, item: o.item, qty: o.qty });
      }
      if (o.seller === uid) return err(400, 'own_offer');
      const r = await db.prepare("UPDATE offers SET status = 'sold', buyer = ?, closed_at = ? WHERE id = ? AND status = 'open'").bind(uid, now, o.id).run();
      if (!r.meta.changes) return err(404, 'gone', 'This offer is no longer there.');
      if (!(await take(o.price))) {
        await db.prepare("UPDATE offers SET status = 'open', buyer = NULL, closed_at = NULL WHERE id = ?").bind(o.id).run();
        return json({ error: 'no_money', message: 'Not enough coins.', need: o.price }, 402);
      }
      await db.prepare('INSERT OR IGNORE INTO wallets (user_id, cash, bank, updated_at) VALUES (?, ?, 0, ?)').bind(o.seller, START_CASH, now).run();
      await db.batch([entry('market_buy', o.item, o.qty, -o.price), credit(o.seller, o.price), ledger(o.seller, 'market_sell', o.item, o.qty, o.price)]);
      await push(env, [o.seller], { t: 'sold', item: o.item, qty: o.qty, price: o.price, buyer: s.user.name });
      return json({ ok: true, item: o.item, qty: o.qty, wallet: await wallet() });
    }
    if (b === 'sell' || b === 'buy') {
      const item = String(inp.item || ''), qty = Math.floor(Number(inp.qty) || 0);
      if (!GOODS[item]) return err(400, 'bad_item');
      if (qty < 1 || qty > 640) return err(400, 'bad_qty');
      if (b === 'sell') { const left = await sellLeft(item); if (qty > left) return capErr(left); }
      const supply = await supplyOf(item);
      const total = tradeTotal(item, supply, qty, b);
      const gold = item === 'gold_ingot' ? (await db.prepare("SELECT value FROM econ_state WHERE key = 'gold_reserve'").first()).value : 0;
      if (b === 'buy' && item === 'gold_ingot' && gold < qty) return err(409, 'no_stock', 'The central bank does not have that much gold.');
      if (b === 'buy' && !(await take(total))) return json({ error: 'no_money', message: 'Not enough coins.', need: total }, 402);
      const d = b === 'sell' ? 1 : -1;
      const ops = [
        ...(b === 'sell' ? [db.prepare('UPDATE wallets SET cash = cash + ?, updated_at = ? WHERE user_id = ?').bind(total, now, uid)] : []),
        db.prepare('INSERT INTO market (item, base, supply, traded) VALUES (?, ?, ?, ?) ON CONFLICT(item) DO UPDATE SET supply = supply + ?, traded = traded + ?').bind(item, GOODS[item], d * qty, qty, d * qty, qty),
        entry(b, item, qty, d * total),
      ];
      if (item === 'gold_ingot') ops.push(db.prepare("UPDATE econ_state SET value = value + ? WHERE key = 'gold_reserve'").bind(d * qty));
      await db.batch(ops);
      return json({ ok: true, total, wallet: await wallet() });
    }
    if (b === 'deposit' || b === 'withdraw') {
      const amount = Math.floor(Number(inp.amount) || 0);
      if (amount < 1) return err(400, 'bad_amount');
      const d = b === 'deposit' ? 1 : -1;
      const moved = await db.prepare(`UPDATE wallets SET cash = cash - ?, bank = bank + ?, updated_at = ? WHERE user_id = ? AND ${b === 'deposit' ? 'cash' : 'bank'} >= ?`).bind(d * amount, d * amount, now, uid, amount).run();
      if (!moved.meta.changes) return err(402, 'no_money', b === 'deposit' ? 'Not enough coins in hand.' : 'Not enough coins in the bank.');
      await entry(b, null, null, amount).run();
      return json({ ok: true, wallet: await wallet() });
    }
    if (b === 'pay') {
      // a bus fare or tickets, groceries from a food shop, or a meal at a restaurant
      let price, item = null, qty = null;
      if (inp.what === 'bus') price = BUS_FARE;
      else if (inp.what === 'ticket') {
        const k = TICKETS[inp.kind];
        if (!k || !Object.hasOwn(TICKETS, inp.kind)) return err(400, 'bad_item');
        item = inp.kind; qty = k.rides; price = k.price;
      }
      else if (inp.what === 'shop') {
        item = String(inp.item || ''); qty = Math.floor(Number(inp.qty) || 0);
        if (!SHOP[item]) return err(400, 'bad_item');
        if (qty < 1 || qty > 64) return err(400, 'bad_qty');
        price = SHOP[item] * qty;
      } else if (inp.what === 'meal') {
        item = String(inp.item || ''); qty = 1;
        if (!MENU[item]) return err(400, 'bad_item');
        price = MENU[item].price;
      } else return err(400, 'bad_payment');
      if (!(await take(price))) return json({ error: 'no_money', message: 'Not enough coins.', need: price }, 402);
      await entry(inp.what, item, qty, -price).run();
      return json({ ok: true, total: price, wallet: await wallet() });
    }
    return err(404, 'not_found');
  }

  // ---------- push notifications: calls and game invites reach a closed game ----------
  if (a === 'push') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const me = s.user.id, now = Date.now();
    if (b === 'key' && method === 'GET') return json({ key: (await vapidKeys(db)).pub });
    if (b === 'subscribe' && method === 'POST') {
      const { endpoint, lang } = await body(request);
      if (!pushEndpointOk(endpoint)) return err(400, 'bad_endpoint');
      await db.prepare('INSERT INTO push_subs (endpoint, user_id, lang, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, lang = excluded.lang')
        .bind(endpoint, me, String(lang || '').slice(0, 5), now).run();
      return json({ ok: true });
    }
    if (b === 'unsubscribe' && method === 'POST') {
      const { endpoint } = await body(request);
      await db.prepare('DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?').bind(String(endpoint || ''), me).run();
      return json({ ok: true });
    }
    // what is waiting for me (the service worker shows it; the game rings or offers to join)
    if (b === 'pending' && method === 'GET') {
      // a call rings for a minute, an invite to play stands for ten
      const { results } = await db.prepare("SELECT kind, data, at FROM pending_events WHERE user_id = ? AND at > (CASE kind WHEN 'call' THEN ? ELSE ? END)").bind(me, now - 60_000, now - 600_000).all();
      const lang = (await db.prepare('SELECT lang FROM push_subs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(me).first() || {}).lang || null;
      return json({ lang, events: results.map((r) => ({ kind: r.kind, at: r.at, ...JSON.parse(r.data) })) });
    }
    if (b === 'clear' && method === 'POST') {
      const { kind } = await body(request);
      await db.prepare('DELETE FROM pending_events WHERE user_id = ? AND kind = ?').bind(me, String(kind || '')).run();
      return json({ ok: true });
    }
    return err(404, 'not_found');
  }

  // ---------- calls: the messages that set up a call, only between friends ----------
  if (a === 'call' && b === 'signal' && method === 'POST') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const { to, data } = await body(request);
    const other = Number(to);
    if (!(other > 0) || !data || typeof data !== 'object') return err(400, 'bad_signal');
    const text = JSON.stringify(data);
    if (text.length > 20000) return err(413, 'too_big');
    const f = await db.prepare("SELECT 1 FROM friends WHERE a = ? AND b = ? AND status = 'accepted'").bind(Math.min(s.user.id, other), Math.max(s.user.id, other)).first();
    if (!f) return err(403, 'not_friends');
    if (s.user.banned_until && s.user.banned_until > Date.now()) return err(403, 'banned');
    await push(env, [other], { t: 'call', from: s.user.id, name: s.user.name, data });
    // a ringing call also waits on the server (and wakes a closed game) until answered or a minute passes
    if (data.type === 'invite') {
      await db.prepare('INSERT OR REPLACE INTO pending_events (user_id, kind, data, at) VALUES (?, ?, ?, ?)')
        .bind(other, 'call', JSON.stringify({ from: s.user.id, name: s.user.name, call: String(data.call || '').slice(0, 20), video: !!data.video }), Date.now()).run();
      await wake(env, db, [other]);
    } else if (data.type === 'cancel') await db.prepare("DELETE FROM pending_events WHERE user_id = ? AND kind = 'call'").bind(other).run();
    else if (['accept', 'decline', 'busy'].includes(data.type)) await db.prepare("DELETE FROM pending_events WHERE user_id = ? AND kind = 'call'").bind(s.user.id).run();
    return json({ ok: true });
  }

  // ---------- friends and presence ----------
  if (a === 'presence' && method === 'POST') {
    if (s.role !== 'user') return err(403, 'forbidden');
    const p = await body(request);
    const MODES = ['survival', 'creative', 'malaga', 'quest', 'guest', 'other'];
    const presence = { world: p.world ? String(p.world).slice(0, 40) : null, room: /^[A-Z0-9]{6}$/.test(String(p.room || '')) ? String(p.room) : null, city: p.city ? String(p.city).slice(0, 20) : null, mode: MODES.includes(p.mode) ? p.mode : null };
    await notePresence(db, request, s.user, presence, p.screen);
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
  // which of these players are admins (a godmode badge over their heads)
  if (a === 'badges' && method === 'GET') {
    if (!s) return err(401, 'not_signed_in');
    const ids = (new URL(request.url).searchParams.get('ids') || '').split(',').map(Number).filter((n) => n > 0).slice(0, 20);
    if (!ids.length) return json({ admins: [] });
    const { results } = await db.prepare(`SELECT id FROM users WHERE role = 'admin' AND id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
    return json({ admins: results.map((r) => r.id) });
  }
  // the superadmin's player account goes back to the admin panel
  if (a === 'me' && b === 'admin' && method === 'POST') {
    if (!s || s.role !== 'user' || !s.user.super_link) return err(403, 'forbidden');
    const token = await createSession(db, 0, 'superadmin', true);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token, true, secure) });
  }

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
    // the superadmin plays: a player account of their own (made once), signed in at once
    if (b === 'play' && method === 'POST') {
      if (!sup) return err(403, 'forbidden');
      let u = await db.prepare('SELECT * FROM users WHERE super_link = 1').first();
      if (!u) {
        const now = Date.now(), h = await hashPassword(randomToken(24));
        const name = (await db.prepare("SELECT 1 FROM users WHERE username = 'superadmin'").first()) || reservedName(env, 'superadmin') ? null : 'superadmin';
        const r = await db.prepare("INSERT INTO users (name, username, pass_hash, pass_salt, pass_iter, created_at, updated_at, role, super_link) VALUES ('Superadmin', ?, ?, ?, ?, ?, ?, 'admin', 1)")
          .bind(name, h.hash, h.salt, h.iter, now, now).run();
        u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
        await log('superadmin_player', u);
      }
      await recordVisit(db, request, u.id, 'login', (await body(request)).screen);
      const token = await createSession(db, u.id, 'user', true);
      return json({ ok: true, user: publicUser(u) }, 200, { 'set-cookie': sessionCookie(token, true, secure) });
    }
    // analytics: every player's last sign-in and device, and what they played
    if (b === 'analytics' && method === 'GET') {
      if (!sup) return err(403, 'forbidden');
      const since = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
      if (!c) {
        const { results: users } = await db.prepare(`SELECT u.id, u.name, u.username, u.role, u.last_login, u.last_seen, u.presence,
          (SELECT v.at || '|' || ifnull(v.ip, '') || '|' || ifnull(v.country, '') || '|' || ifnull(v.city, '') || '|' || ifnull(v.device, '') || '|' || ifnull(v.screen, '') || '|' || v.kind FROM visits v WHERE v.user_id = u.id ORDER BY v.at DESC LIMIT 1) AS last,
          (SELECT COUNT(*) FROM visits v WHERE v.user_id = u.id AND v.kind = 'login') AS logins,
          (SELECT ifnull(SUM(seconds), 0) FROM play_time p WHERE p.user_id = u.id AND p.day >= ?) AS played30,
          (SELECT p.mode FROM play_time p WHERE p.user_id = u.id AND p.day >= ? GROUP BY p.mode ORDER BY SUM(p.seconds) DESC LIMIT 1) AS top_mode
          FROM users u ORDER BY ifnull(u.last_seen, 0) DESC LIMIT 500`).bind(since, since).all();
        const now = Date.now();
        return json({ users: users.map((u) => {
          const [at, ip, country, city, device, screen, kind] = String(u.last || '').split('|');
          let pr = null; try { pr = u.presence ? JSON.parse(u.presence) : null; } catch { pr = null; }
          return { id: u.id, name: u.name, username: u.username, role: u.role, lastLogin: u.last_login || null, lastSeen: u.last_seen || null, online: !!(u.last_seen && now - u.last_seen < 150e3), now: pr && u.last_seen && now - u.last_seen < 150e3 ? pr : null,
            last: u.last ? { at: Number(at), ip, country, city, device, screen, kind } : null, logins: u.logins, played30: u.played30, topMode: u.top_mode || null };
        }) });
      }
      const id = Number(c);
      const u = await db.prepare('SELECT id, name, username, role, created_at, last_login, last_seen FROM users WHERE id = ?').bind(id).first();
      if (!u) return err(404, 'no_user');
      const { results: visits } = await db.prepare('SELECT kind, at, ip, country, region, city, device, screen, ua FROM visits WHERE user_id = ? ORDER BY at DESC LIMIT 40').bind(id).all();
      const { results: play } = await db.prepare('SELECT day, mode, world, seconds FROM play_time WHERE user_id = ? AND day >= ? ORDER BY day DESC, seconds DESC').bind(id, since).all();
      const { results: missions } = await db.prepare('SELECT mission, at FROM missions_done WHERE user_id = ? ORDER BY at DESC').bind(id).all();
      const w = await db.prepare('SELECT cash, bank FROM wallets WHERE user_id = ?').bind(id).first();
      const { results: saves } = await db.prepare('SELECT slot, updated_at FROM saves WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20').bind(id).all();
      return json({ user: u, visits, play, missions, wallet: w || null, saves });
    }
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
    // ---- chat moderation ----
    if (b === 'channels' && !c && method === 'GET') {
      const { results } = await db.prepare('SELECT c.*, (SELECT COUNT(*) FROM channel_members m WHERE m.channel_id = c.id) AS members FROM channels c ORDER BY c.archived, c.id').all();
      return json({ channels: results.map((r) => ({ id: r.id, name: r.name, archived: !!r.archived, members: r.members, createdAt: r.created_at })) });
    }
    if (b === 'channels' && !c && method === 'POST') {
      const name = String((await body(request)).name || '').trim().slice(0, 40);
      if (!name) return err(400, 'bad_name', 'Give the channel a name.');
      const r = await db.prepare('INSERT INTO channels (name, created_by, created_at) VALUES (?, ?, ?)').bind(name, actor.id, Date.now()).run();
      await log('channel', null, `created "${name}"`);
      return json({ id: r.meta.last_row_id }, 201);
    }
    const chId = b === 'channels' ? Number(c) : 0;
    if (chId > 0) {
      const ch = await db.prepare('SELECT * FROM channels WHERE id = ?').bind(chId).first();
      if (!ch) return err(404, 'no_channel');
      if (!d && method === 'PATCH') {
        const inp = await body(request);
        const name = 'name' in inp ? String(inp.name || '').trim().slice(0, 40) || ch.name : ch.name;
        const archived = 'archived' in inp ? (inp.archived ? 1 : 0) : ch.archived;
        if (chId === 1 && archived) return err(400, 'lobby', 'The Lobby cannot be archived.');
        await db.prepare('UPDATE channels SET name = ?, archived = ? WHERE id = ?').bind(name, archived, chId).run();
        await log('channel', null, `"${ch.name}" ${archived ? 'archived' : 'saved'}${name !== ch.name ? ` as "${name}"` : ''}`);
        return json({ ok: true });
      }
      if (d === 'members' && method === 'GET') {
        const { results } = await db.prepare('SELECT u.id, u.name, u.username FROM channel_members m JOIN users u ON u.id = m.user_id WHERE m.channel_id = ? ORDER BY u.name').bind(chId).all();
        return json({ members: results });
      }
      if (d === 'members' && method === 'POST') {
        const inp = await body(request);
        const username = normUsername(inp.username);
        const u = inp.userId ? await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(Number(inp.userId)).first() : username ? await db.prepare('SELECT id, name FROM users WHERE username = ?').bind(username).first() : null;
        if (!u) return err(404, 'no_user', 'There is no player with that username.');
        await db.prepare('INSERT OR IGNORE INTO channel_members (channel_id, user_id, added_by, added_at) VALUES (?, ?, ?, ?)').bind(chId, u.id, actor.id, Date.now()).run();
        await log('channel', u, `let into "${ch.name}"`);
        await push(env, [u.id], { t: 'channels' });
        return json({ ok: true });
      }
      const memberId = Number(parts[4]);
      if (d === 'members' && memberId > 0 && method === 'DELETE') {
        await db.prepare('DELETE FROM channel_members WHERE channel_id = ? AND user_id = ?').bind(chId, memberId).run();
        const u = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(memberId).first();
        await log('channel', u, `removed from "${ch.name}"`);
        await push(env, [memberId], { t: 'channels' });
        return json({ ok: true });
      }
    }
    if (b === 'messages' && Number(c) > 0 && method === 'DELETE') {
      const m = await db.prepare('SELECT * FROM messages WHERE id = ?').bind(Number(c)).first();
      if (!m) return err(404, 'no_message');
      await db.prepare('UPDATE messages SET deleted_by = ? WHERE id = ?').bind(actor.id || -1, m.id).run();
      await db.prepare('UPDATE reports SET done = 1 WHERE message_id = ?').bind(m.id).run();
      await log('chat_delete', { id: m.user_id, name: m.name }, m.text.slice(0, 120));
      let to;
      if (m.conv[0] === 'd') to = m.conv.slice(1).split(':').map(Number);
      else { const { results } = await db.prepare("SELECT user_id AS id FROM channel_members WHERE channel_id = ? UNION SELECT id FROM users WHERE role = 'admin'").bind(Number(m.conv.slice(1))).all(); to = results.map((r) => r.id); }
      await push(env, to, { t: 'del', conv: m.conv, id: m.id });
      return json({ ok: true });
    }
    // ---------- the economy: who earned what today, freezing and correcting wallets ----------
    if (b === 'econ' && !c && method === 'GET') {
      const month = monthIndex(), since = monthStart(month);
      const { results } = await db.prepare(`SELECT l.user_id, u.name, u.username, w.cash, w.bank, w.frozen_until, w.frozen_reason,
          SUM(CASE WHEN l.amount > 0 THEN l.amount ELSE 0 END) AS earned, SUM(CASE WHEN l.amount < 0 THEN -l.amount ELSE 0 END) AS spent
        FROM ledger l JOIN users u ON u.id = l.user_id LEFT JOIN wallets w ON w.user_id = l.user_id
        WHERE l.at >= ? AND l.kind NOT IN ('deposit', 'withdraw') GROUP BY l.user_id ORDER BY earned DESC LIMIT 100`).bind(since).all();
      const { results: sold } = await db.prepare("SELECT user_id, item, SUM(qty) AS qty FROM ledger WHERE kind = 'sell' AND at >= ? GROUP BY user_id, item").bind(since).all();
      const { results: offered } = await db.prepare('SELECT seller AS user_id, item, SUM(qty) AS qty FROM offers WHERE created_at >= ? GROUP BY seller, item').bind(since).all();
      const perUser = new Map();
      for (const r of [...sold, ...offered]) { const m = perUser.get(r.user_id) || {}; m[r.item] = (m[r.item] || 0) + r.qty; perUser.set(r.user_id, m); }
      const { results: frozen } = await db.prepare('SELECT w.user_id, u.name, u.username, w.cash, w.bank, w.frozen_until, w.frozen_reason FROM wallets w JOIN users u ON u.id = w.user_id WHERE w.frozen_until > ?').bind(Date.now()).all();
      const row = (r) => {
        const items = perUser.get(r.user_id) || {};
        const flags = [];
        for (const [item, qty] of Object.entries(items)) if (qty >= capFor(item) * 0.8) flags.push(`${item} ${qty}/${capFor(item)}`);
        if ((r.earned || 0) >= 1000) flags.push('earned 1000+');
        return { userId: r.user_id, name: r.name, username: r.username, cash: r.cash || 0, bank: r.bank || 0, earned: r.earned || 0, spent: r.spent || 0, sold: items, flags, frozenUntil: r.frozen_until > Date.now() ? r.frozen_until : null, frozenReason: r.frozen_reason || '' };
      };
      const today = results.map(row);
      for (const f of frozen) if (!today.some((x) => x.userId === f.user_id)) today.push(row(f));
      return json({ month, since, users: today });
    }
    if (b === 'econ' && c === 'users' && Number(d) > 0) {
      const target = await db.prepare('SELECT id, name FROM users WHERE id = ?').bind(Number(d)).first();
      if (!target) return err(404, 'not_found');
      const tail = parts[4];
      const now2 = Date.now();
      await db.prepare('INSERT OR IGNORE INTO wallets (user_id, cash, bank, updated_at) VALUES (?, ?, 0, ?)').bind(target.id, START_CASH, now2).run();
      if (!tail && method === 'GET') {
        const { results } = await db.prepare('SELECT kind, item, qty, amount, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 100').bind(target.id).all();
        return json({ history: results });
      }
      if (tail === 'freeze' && method === 'POST') {
        const inp = await body(request);
        const hours = Math.min(24 * 365, Math.max(1, Math.floor(Number(inp.hours) || 24)));
        const reason = String(inp.reason || '').slice(0, 200);
        await db.prepare('UPDATE wallets SET frozen_until = ?, frozen_reason = ? WHERE user_id = ?').bind(now2 + hours * 3600e3, reason, target.id).run();
        await log('econ_freeze', target, `${hours} h${reason ? ': ' + reason : ''}`);
        return json({ ok: true });
      }
      if (tail === 'freeze' && method === 'DELETE') {
        await db.prepare('UPDATE wallets SET frozen_until = NULL, frozen_reason = NULL WHERE user_id = ?').bind(target.id).run();
        await log('econ_unfreeze', target);
        return json({ ok: true });
      }
      if (tail === 'adjust' && method === 'POST') {
        const inp = await body(request);
        const dc = Math.trunc(Number(inp.cash) || 0), db2 = Math.trunc(Number(inp.bank) || 0);
        const reason = String(inp.reason || '').trim().slice(0, 200);
        if (!reason) return err(400, 'reason_needed', 'Say why.');
        if (!dc && !db2) return err(400, 'nothing', 'Nothing to change.');
        await db.batch([
          db.prepare('UPDATE wallets SET cash = MAX(0, cash + ?), bank = MAX(0, bank + ?), updated_at = ? WHERE user_id = ?').bind(dc, db2, now2, target.id),
          db.prepare('INSERT INTO ledger (user_id, kind, item, qty, amount, at) VALUES (?, ?, NULL, NULL, ?, ?)').bind(target.id, 'admin', dc + db2, now2),
        ]);
        await log('econ_adjust', target, `cash ${dc >= 0 ? '+' : ''}${dc}, bank ${db2 >= 0 ? '+' : ''}${db2}: ${reason}`);
        const w = await db.prepare('SELECT cash, bank FROM wallets WHERE user_id = ?').bind(target.id).first();
        return json({ ok: true, wallet: w });
      }
      return err(404, 'not_found');
    }
    if (b === 'reports' && !c && method === 'GET') {
      const { results } = await db.prepare(`SELECT r.*, m.text, m.name AS author, m.user_id AS author_id, m.conv, m.deleted_by, u.name AS reporter FROM reports r
        JOIN messages m ON m.id = r.message_id LEFT JOIN users u ON u.id = r.reporter_id ORDER BY r.done, r.created_at DESC LIMIT 200`).all();
      return json({ reports: results.map((r) => ({ id: r.id, messageId: r.message_id, text: r.text, author: r.author, authorId: r.author_id, conv: r.conv, deleted: !!r.deleted_by, reporter: r.reporter, reason: r.reason, at: r.created_at, done: !!r.done })) });
    }
    if (b === 'reports' && Number(c) > 0 && method === 'PATCH') {
      await db.prepare('UPDATE reports SET done = ? WHERE id = ?').bind((await body(request)).done ? 1 : 0, Number(c)).run();
      await log('report', null, `report ${c}`);
      return json({ ok: true });
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
      if (d === 'mute' && method === 'POST') {
        const minutes = Math.max(1, Math.min(43200, Number((await body(request)).minutes) || 60));
        const until = Date.now() + minutes * 60e3;
        await db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').bind(until, id).run();
        await log('chat_mute', u, `${minutes} min`);
        return json({ ok: true, until });
      }
      if (d === 'mute' && method === 'DELETE') {
        await db.prepare('UPDATE users SET muted_until = NULL WHERE id = ?').bind(id).run();
        await log('chat_mute', u, 'lifted');
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

// the chat hub (one Durable Object) and a push of an event to some players
const hubStub = (env) => env.ROOMS.get(env.ROOMS.idFromName('~hub'));
async function push(env, to, event) {
  if (!env.ROOMS || !to || !to.length) return;
  try { await hubStub(env).fetch('https://hub/hub/push', { method: 'POST', body: JSON.stringify({ to: to.map(String), event }) }); } catch { /* the chat hub is optional */ }
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
