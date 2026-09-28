// Accounts helpers for the Pages Functions API: password hashing, sessions,
// validation and JSON responses. Runs on Cloudflare (Web Crypto only).

export const SESSION_COOKIE = 'sc_session';
export const REMEMBER_DAYS = 90;
export const SHORT_HOURS = 12;
const PBKDF2_ITER = 100000; // the most Workers' Web Crypto allows
const enc = new TextEncoder();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
export const err = (status, code, message) => json({ error: code, message: message || code }, status);

export function b64u(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function randomToken(n = 32) { return b64u(crypto.getRandomValues(new Uint8Array(n))); }
export async function sha256(s) { return b64u(await crypto.subtle.digest('SHA-256', enc.encode(s))); }

export async function hashPassword(password, salt = randomToken(16), iter = PBKDF2_ITER) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: iter }, key, 256);
  return { hash: b64u(bits), salt, iter };
}

// Constant-time string comparison.
export function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function verifyPassword(password, user) {
  const { hash } = await hashPassword(password, user.pass_salt, user.pass_iter);
  return safeEqual(hash, user.pass_hash);
}

// ---------- validation ----------
export function normEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 120 ? s : undefined;
}
export function normPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/[\s\-().]/g, '');
  return /^\+?\d{6,16}$/.test(digits) ? digits : undefined;
}
export function normName(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  return s.length >= 1 && s.length <= 40 ? s : undefined;
}
export function checkPassword(v) {
  const s = String(v || '');
  return s.length >= 6 && s.length <= 200 ? s : undefined;
}
// a short sign-in name: letters (any language), digits, _ . -; stored in lower case
export function normUsername(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return null;
  return /^[\p{L}\p{N}_.-]{2,24}$/u.test(s) && /\p{L}/u.test(s) ? s : undefined;
}
export function checkAvatar(v) {
  if (v === null || v === '') return null;
  const s = String(v);
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= 200000 ? s : undefined;
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, username: u.username || null, email: u.email, phone: u.phone, avatar: u.avatar || null, disabled: !!u.disabled, createdAt: u.created_at, lastLogin: u.last_login || null };
}

// ---------- sessions ----------
export function readCookie(request, name) {
  const h = request.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function sessionCookie(token, remember, secure) {
  const attrs = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (secure) attrs.push('Secure');
  if (remember) attrs.push(`Max-Age=${REMEMBER_DAYS * 86400}`);
  return attrs.join('; ');
}
export function clearCookie(secure) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function createSession(db, userId, role, remember) {
  const token = randomToken(32);
  const now = Date.now();
  const expires = now + (remember ? REMEMBER_DAYS * 86400e3 : SHORT_HOURS * 3600e3);
  await db.prepare('INSERT INTO sessions (token_hash, user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, role, expires, now).run();
  return token;
}

// Resolves the caller: { role: 'superadmin' } or { role: 'user', user } or null.
export async function currentSession(request, env) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const th = await sha256(token);
  const s = await env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ?').bind(th).first();
  if (!s) return null;
  if (s.expires_at < Date.now()) { await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return null; }
  if (s.role === 'superadmin') return { role: 'superadmin', tokenHash: th };
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first();
  if (!user || user.disabled) return null;
  return { role: 'user', user, tokenHash: th };
}

// ---------- brute-force protection ----------
const WINDOW_MS = 15 * 60e3;
const MAX_TRIES = 8;
export async function tooManyAttempts(db, key) {
  const row = await db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(key).first();
  return !!(row && row.reset_at > Date.now() && row.count >= MAX_TRIES);
}
export async function noteFailure(db, key) {
  const now = Date.now();
  const row = await db.prepare('SELECT * FROM login_attempts WHERE key = ?').bind(key).first();
  if (!row || row.reset_at < now) await db.prepare('INSERT OR REPLACE INTO login_attempts (key, count, reset_at) VALUES (?, 1, ?)').bind(key, now + WINDOW_MS).run();
  else await db.prepare('UPDATE login_attempts SET count = count + 1 WHERE key = ?').bind(key).run();
}
export async function clearFailures(db, key) { await db.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key).run(); }
