// Player accounts (created by the admin): sign-in, profile and cloud saves.
// Local saves are namespaced per account, so a guest's or a sibling's
// progress on the same device never mixes with someone else's account.
import { loadWorld, saveWorld, loadProfile, saveProfile } from './db.js';

export const account = {
  user: null,
  available: false, // false when the API is not deployed (e.g. local preview)
  listeners: new Set(),
};

export function slot(base) { return account.user ? `u${account.user.id}:${base}` : base; }
export function onAccount(fn) { account.listeners.add(fn); return () => account.listeners.delete(fn); }
function changed() { account.listeners.forEach((fn) => { try { fn(account.user); } catch (e) { console.warn(e); } }); }

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON: API missing */ }
  if (!res.ok) { const e = new Error(data.error || 'http_' + res.status); e.status = res.status; e.code = data.error; throw e; }
  return data;
}

export async function initAccount() {
  try {
    const r = await api('me');
    account.available = 'role' in r; // an HTML fallback page means no API here
    account.user = r.role === 'user' ? r.user : null;
  } catch (e) {
    // 401 = API up, just not signed in (older API); anything else = no API here
    account.available = e.status === 401;
    account.user = null;
  }
  if (account.user) await syncDown().catch((e) => console.warn('sync failed', e));
  return account.user;
}

export async function signIn(login, password, remember) {
  const r = await api('auth/login', { method: 'POST', body: { login, password, remember } });
  if (r.role !== 'user') { await api('auth/logout', { method: 'POST', body: {} }).catch(() => {}); const e = new Error('admin_use_panel'); e.code = 'admin_use_panel'; throw e; }
  account.user = r.user;
  await syncDown().catch((e) => console.warn('sync failed', e));
  changed();
  return r.user;
}

export async function signOut() {
  await api('auth/logout', { method: 'POST', body: {} }).catch(() => {});
  account.user = null;
  changed();
}

export async function updateProfile(fields) {
  const r = await api('me', { method: 'PATCH', body: fields });
  account.user = r.user;
  changed();
  return r.user;
}

export async function changePassword(current, next) { await api('me/password', { method: 'POST', body: { current, next } }); }

// ---------- cloud saves ----------
const pending = new Map();
// Debounced upload of one slot.
export function pushSave(base, data) {
  if (!account.user) return;
  clearTimeout(pending.get(base));
  pending.set(base, setTimeout(() => {
    api('saves/' + base, { method: 'PUT', body: { data, savedAt: data.savedAt || Date.now() } }).catch((e) => console.warn('cloud save failed', e));
  }, 800));
}

// On sign-in / start-up: for each slot keep whichever copy is newer.
async function syncDown() {
  const { saves } = await api('saves');
  const cloud = Object.fromEntries(saves.map((s) => [s.slot, s.savedAt]));
  const firstTime = !saves.length;
  for (const base of ['current', 'quest']) {
    const local = await loadWorld(slot(base));
    let src = local;
    if (!local && firstTime) src = await loadWorld(base); // bring guest progress into a brand-new account
    const localAt = src ? src.savedAt || 0 : 0;
    if (cloud[base] && cloud[base] > localAt) {
      const r = await api('saves/' + base);
      const rec = { ...r.data, savedAt: r.savedAt };
      await saveWorld(rec, slot(base), true);
    } else if (src) {
      if (src !== local) await saveWorld(src, slot(base), true);
      if (!cloud[base] || localAt > cloud[base]) await api('saves/' + base, { method: 'PUT', body: { data: src, savedAt: localAt || Date.now() } });
    }
  }
  const lp = await loadProfile(slot('profile'));
  let prof = lp.savedAt ? lp : (firstTime ? await loadProfile('profile') : lp);
  if (cloud.profile && cloud.profile > (prof.savedAt || 0)) {
    const r = await api('saves/profile');
    prof = { ...r.data, savedAt: r.savedAt };
  } else if (!cloud.profile || (prof.savedAt || 0) > cloud.profile) {
    await api('saves/profile', { method: 'PUT', body: { data: prof, savedAt: prof.savedAt || Date.now() } });
  }
  await saveProfile(prof, slot('profile'), true);
}

// Shrink a picked image to a 128px square WebP/PNG data URL for the profile.
export function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d');
      const s = Math.min(img.width, img.height);
      x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
      URL.revokeObjectURL(url);
      let out = c.toDataURL('image/webp', 0.85);
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/png');
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
    img.src = url;
  });
}

// Save the profile locally (this account's slot) and to the cloud.
export async function storeProfile(p) {
  const ok = await saveProfile(p, slot('profile'));
  pushSave('profile', p);
  return ok;
}
