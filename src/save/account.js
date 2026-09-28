// Player accounts (created by the admin): sign-in, profile and cloud saves.
// Local saves are namespaced per account, so a guest's or a sibling's
// progress on the same device never mixes with someone else's account.
import { loadWorld, saveWorld, deleteWorld, listWorlds, loadProfile, saveProfile } from './db.js';

export const MAX_WORLDS = 6;
export function newWorldId() { return Math.random().toString(36).slice(2, 10).padEnd(8, '0'); }
// what the world list shows, stored next to each cloud save
export function worldInfo(rec) { return { name: rec.name, day: rec.day, mode: rec.mode === 'quest' ? 'quest' : rec.creative ? 'creative' : 'survival' }; }

export const account = {
  user: null,
  available: false, // false when the API is not deployed (e.g. local preview)
  mp: false, // multiplayer rooms are set up on the server
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
    account.mp = !!r.mp;
  } catch (e) {
    // 401 = API up, just not signed in (older API); anything else = no API here
    account.available = e.status === 401;
    account.user = null;
  }
  await migrateLocal('');
  if (account.user) {
    await migrateLocal(`u${account.user.id}:`);
    await syncDown().catch((e) => console.warn('sync failed', e));
  }
  return account.user;
}

// Older versions kept a single world in the "current" slot: give it an id
// and move it into the world list.
async function migrateLocal(prefix) {
  const old = await loadWorld(prefix + 'current');
  if (!old) return;
  old.worldId = old.worldId || newWorldId();
  await saveWorld(old, prefix + 'w-' + old.worldId, true);
  await deleteWorld(prefix + 'current');
}

// This account's (or the guest's) worlds, newest first.
export function localWorlds() { return listWorlds(slot('w-')); }

export async function signIn(login, password, remember) {
  const r = await api('auth/login', { method: 'POST', body: { login, password, remember } });
  if (r.role !== 'user') { await api('auth/logout', { method: 'POST', body: {} }).catch(() => {}); const e = new Error('admin_use_panel'); e.code = 'admin_use_panel'; throw e; }
  account.user = r.user;
  await migrateLocal(`u${r.user.id}:`);
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

// Forgotten password: the server emails a one-time link (?reset=token).
// an idea or a problem report from the pause menu (guests may send too)
export async function sendFeedback(kind, text, ctx) { await api('feedback', { method: 'POST', body: { kind, text, ctx } }); }
export async function forgotPassword(email, lang) { await api('auth/forgot', { method: 'POST', body: { email, lang } }); }
export async function resetPassword(token, password) { await api('auth/reset', { method: 'POST', body: { token, password } }); }

export async function changePassword(current, next) { await api('me/password', { method: 'POST', body: { current, next } }); }

// ---------- cloud saves ----------
const pending = new Map();
// Debounced upload of one slot.
export function pushSave(base, data) {
  if (!account.user) return;
  clearTimeout(pending.get(base));
  pending.set(base, setTimeout(() => {
    const info = base === 'profile' ? null : worldInfo(data);
    api('saves/' + base, { method: 'PUT', body: { data, savedAt: data.savedAt || Date.now(), info } }).catch((e) => console.warn('cloud save failed', e));
  }, 800));
}

// Delete a world here and in the cloud.
export async function removeWorld(base) {
  clearTimeout(pending.get(base));
  await deleteWorld(slot(base));
  if (account.user) await api('saves/' + base, { method: 'DELETE' }).catch((e) => console.warn('cloud delete failed', e));
}

// On sign-in / start-up: for each slot keep whichever copy is newer.
async function syncDown() {
  const { saves } = await api('saves');
  const cloud = Object.fromEntries(saves.map((s) => [s.slot, s.savedAt]));
  const firstTime = !saves.length;
  // the single cloud world of older versions becomes a listed world
  if (cloud.current) {
    const r = await api('saves/current');
    const rec = { ...r.data, savedAt: r.savedAt };
    rec.worldId = rec.worldId || newWorldId();
    await saveWorld(rec, slot('w-' + rec.worldId), true);
    await api('saves/w-' + rec.worldId, { method: 'PUT', body: { data: rec, savedAt: rec.savedAt, info: worldInfo(rec) } });
    await api('saves/current', { method: 'DELETE' });
    delete cloud.current;
    cloud['w-' + rec.worldId] = rec.savedAt;
  }
  // a brand-new account takes over the guest's progress on this device
  if (firstTime) {
    for (const w of await listWorlds('w-')) {
      const rec = await loadWorld(w.slot);
      if (rec && !(await loadWorld(slot(w.base)))) await saveWorld(rec, slot(w.base), true);
    }
  }
  const bases = new Set(['quest', ...Object.keys(cloud).filter((k) => k.startsWith('w-')), ...(await localWorlds()).map((w) => w.base)]);
  for (const base of bases) {
    const local = await loadWorld(slot(base));
    let src = local;
    if (!local && firstTime && base === 'quest') src = await loadWorld(base);
    const localAt = src ? src.savedAt || 0 : 0;
    if (cloud[base] && cloud[base] > localAt) {
      const r = await api('saves/' + base);
      const rec = { ...r.data, savedAt: r.savedAt };
      await saveWorld(rec, slot(base), true);
    } else if (src) {
      if (src !== local) await saveWorld(src, slot(base), true);
      if (!cloud[base] || localAt > cloud[base]) {
        await api('saves/' + base, { method: 'PUT', body: { data: src, savedAt: localAt || Date.now(), info: worldInfo(src) } })
          .catch((e) => { if (e.code !== 'too_many_worlds') throw e; });
      }
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
