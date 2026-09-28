// Soulcraft accounts API (Cloudflare Pages Function, D1 bound as DB).
//
//   POST /api/auth/login        {login, password, remember}   email or phone
//   POST /api/auth/logout
//   GET  /api/me                                              current user
//   PATCH /api/me               {name, email, phone, avatar}
//   POST /api/me/password       {current, next}
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
//
// The superadmin is not stored in the database: SUPERADMIN_LOGIN and
// SUPERADMIN_PASSWORD come from Pages secrets (set from GitHub secrets).
import {
  json, err, hashPassword, verifyPassword, safeEqual, sha256, normEmail, normPhone, normName, checkPassword, checkAvatar,
  publicUser, createSession, currentSession, sessionCookie, clearCookie, tooManyAttempts, noteFailure, clearFailures,
} from '../../server/lib.js';

// save slots: the profile, the Treasure Quest run, and up to MAX_WORLDS
// worlds ("w-" + id); "current" is the single world from older versions
const SLOTS = new Set(['current', 'quest', 'profile']);
const validSlot = (s) => SLOTS.has(s) || /^w-[a-z0-9]{4,12}$/.test(s || '');
const MAX_WORLDS = 6;
const MAX_SAVE = 900000;
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
    const email = normEmail(ident), phone = normPhone(ident);
    let user = null;
    if (email) user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    else if (phone) user = await db.prepare('SELECT * FROM users WHERE phone = ?').bind(phone).first();
    if (!user || !(await verifyPassword(String(password), user))) { await noteFailure(db, rlKey); return err(401, 'bad_credentials'); }
    if (user.disabled) return err(403, 'disabled');
    await clearFailures(db, rlKey);
    await db.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(Date.now(), user.id).run();
    const token = await createSession(db, user.id, 'user', !!remember);
    return json({ role: 'user', user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token, !!remember, secure) });
  }

  const s = await currentSession(request, env);

  if (a === 'auth' && b === 'logout' && method === 'POST') {
    if (s) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.tokenHash).run();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure) });
  }

  // guests get a plain 200 here, so the game's start-up check logs no error
  if (!s && a === 'me' && !b && method === 'GET') return json({ role: null, user: null });
  if (!s) return err(401, 'not_signed_in');

  // ---------- me ----------
  if (a === 'me' && !b && method === 'GET') {
    if (s.role === 'superadmin') return json({ role: 'superadmin', user: { id: 0, name: 'Superadmin' } });
    return json({ role: 'user', user: publicUser(s.user) });
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
    if (s.role !== 'superadmin') return err(403, 'forbidden');
    if (b === 'users' && !c && method === 'GET') {
      const q = (new URL(request.url).searchParams.get('q') || '').trim().toLowerCase();
      const like = '%' + q.replace(/[%_]/g, '') + '%';
      const { results } = await db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM saves s WHERE s.user_id = u.id) AS saves
        FROM users u WHERE ? = '' OR lower(u.name) LIKE ? OR lower(ifnull(u.email, '')) LIKE ? OR ifnull(u.phone, '') LIKE ? ORDER BY u.created_at DESC LIMIT 500`)
        .bind(q, like, like, like).all();
      return json({ users: results.map((u) => ({ ...publicUser(u), saves: u.saves })) });
    }
    if (b === 'users' && !c && method === 'POST') {
      const inp = await body(request);
      const pw = checkPassword(inp.password);
      if (!pw) return err(400, 'weak_password', 'Password must be at least 6 characters.');
      const name = normName(inp.name);
      if (!name) return err(400, 'bad_name', 'Name is required (up to 40 characters).');
      const email = normEmail(inp.email), phone = normPhone(inp.phone);
      if (email === undefined) return err(400, 'bad_email', 'That email address does not look right.');
      if (phone === undefined) return err(400, 'bad_phone', 'Phone must be 6-16 digits, optionally starting with +.');
      if (!email && !phone) return err(400, 'need_login', 'Give the user an email or a phone number to sign in with.');
      const dup = await findDuplicate(db, email, phone, 0);
      if (dup) return dup;
      const now = Date.now();
      const h = await hashPassword(pw);
      const r = await db.prepare('INSERT INTO users (name, email, phone, pass_hash, pass_salt, pass_iter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(name, email, phone, h.hash, h.salt, h.iter, now, now).run();
      const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(r.meta.last_row_id).first();
      return json({ user: publicUser(u) }, 201);
    }
    const id = Number(c);
    if (b === 'users' && id > 0) {
      const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!u) return err(404, 'no_user');
      if (!d && method === 'PATCH') {
        const r = await applyProfile(db, u, await body(request), true);
        return r instanceof Response ? r : json({ user: publicUser(r) });
      }
      if (!d && method === 'DELETE') {
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

async function findDuplicate(db, email, phone, selfId) {
  if (email) { const x = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(email, selfId).first(); if (x) return err(409, 'email_taken', 'That email is already used by another user.'); }
  if (phone) { const x = await db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').bind(phone, selfId).first(); if (x) return err(409, 'phone_taken', 'That phone number is already used by another user.'); }
  return null;
}

async function setPassword(db, id, pw) {
  const h = await hashPassword(pw);
  await db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, pass_iter = ?, updated_at = ? WHERE id = ?').bind(h.hash, h.salt, h.iter, Date.now(), id).run();
}

// Shared by the user's own profile edit and the admin's edit.
async function applyProfile(db, u, inp, admin) {
  const next = { name: u.name, email: u.email, phone: u.phone, avatar: u.avatar, disabled: u.disabled };
  if ('name' in inp) { const v = normName(inp.name); if (!v) return err(400, 'bad_name', 'Name is required (up to 40 characters).'); next.name = v; }
  if ('email' in inp) { const v = normEmail(inp.email); if (v === undefined) return err(400, 'bad_email', 'That email address does not look right.'); next.email = v; }
  if ('phone' in inp) { const v = normPhone(inp.phone); if (v === undefined) return err(400, 'bad_phone', 'Phone must be 6-16 digits, optionally starting with +.'); next.phone = v; }
  if ('avatar' in inp) { const v = checkAvatar(inp.avatar); if (v === undefined) return err(400, 'bad_avatar', 'The picture must be a PNG, JPEG or WebP under 150 KB.'); next.avatar = v; }
  if (admin && 'disabled' in inp) next.disabled = inp.disabled ? 1 : 0;
  if (!next.email && !next.phone) return err(400, 'need_login', 'Keep an email or a phone number to sign in with.');
  const dup = await findDuplicate(db, next.email, next.phone, u.id);
  if (dup) return dup;
  await db.prepare('UPDATE users SET name = ?, email = ?, phone = ?, avatar = ?, disabled = ?, updated_at = ? WHERE id = ?')
    .bind(next.name, next.email, next.phone, next.avatar, next.disabled, Date.now(), u.id).run();
  if (admin && next.disabled) await db.prepare('DELETE FROM sessions WHERE user_id = ? AND role = ?').bind(u.id, 'user').run();
  return db.prepare('SELECT * FROM users WHERE id = ?').bind(u.id).first();
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
