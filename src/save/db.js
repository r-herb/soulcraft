// IndexedDB persistence: saved worlds (one record per slot) and a profile
// (soul crystals, unlocked skins). Every call is wrapped so a broken or
// blocked database never crashes the game.

const DB_NAME = 'soulcraft';
const DB_VERSION = 1;
let dbPromise = null;
let memory = { worlds: new Map(), profile: new Map() }; // fallback when IDB is unavailable
export let storageOk = true;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (!('indexedDB' in window)) { storageOk = false; resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('profile')) db.createObjectStore('profile', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { storageOk = false; resolve(null); };
      req.onblocked = () => { storageOk = false; resolve(null); };
    } catch {
      storageOk = false; resolve(null);
    }
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  if (!db) return fn(null);
  return new Promise((resolve, reject) => {
    try {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      const r = fn(s);
      if (r && 'onsuccess' in r) r.onsuccess = () => { result = r.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    } catch (e) { reject(e); }
  });
}

export async function saveWorld(data, slot = 'current', keepStamp = false) {
  try {
    const rec = JSON.parse(JSON.stringify(data));
    rec.id = slot;
    if (!keepStamp || !rec.savedAt) rec.savedAt = Date.now();
    const r = await tx('worlds', 'readwrite', (s) => (s ? s.put(rec) : memory.worlds.set(slot, rec)));
    void r;
    return true;
  } catch (e) {
    console.warn('saveWorld failed', e);
    return false;
  }
}

export async function loadWorld(slot = 'current') {
  try {
    const r = await tx('worlds', 'readonly', (s) => (s ? s.get(slot) : null));
    if (r === null || r === undefined) return memory.worlds.get(slot) || null;
    return r;
  } catch (e) {
    console.warn('loadWorld failed', e);
    return null;
  }
}

// Short summaries of every world saved under a slot prefix ("w-" for a
// guest, "u7:w-" for an account), newest first.
export async function listWorlds(prefix) {
  try {
    let all = await tx('worlds', 'readonly', (s) => (s ? s.getAll() : null));
    if (!all) all = [...memory.worlds.values()];
    return all.filter((r) => typeof r.id === 'string' && r.id.startsWith(prefix) && !r.id.slice(prefix.length).includes(':'))
      .map((r) => ({ slot: r.id, base: r.id.slice(prefix.length - 2), id: r.worldId, name: r.name, day: r.day, creative: !!r.creative, savedAt: r.savedAt || 0, bosses: Object.values(r.bosses || {}).filter(Boolean).length }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch (e) {
    console.warn('listWorlds failed', e);
    return [];
  }
}

export async function deleteWorld(slot = 'current') {
  try { await tx('worlds', 'readwrite', (s) => (s ? s.delete(slot) : memory.worlds.delete(slot))); } catch (e) { console.warn(e); }
}

const DEFAULT_PROFILE = { id: 'profile', crystals: 0, skins: ['wanderer'], skin: 'wanderer', totalCrystals: 0 };

export async function loadProfile(id = 'profile') {
  try {
    const r = await tx('profile', 'readonly', (s) => (s ? s.get(id) : null));
    const p = r || memory.profile.get(id);
    return { ...DEFAULT_PROFILE, ...(p || {}), id };
  } catch (e) {
    console.warn('loadProfile failed', e);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(p, id = 'profile', keepStamp = false) {
  try {
    const rec = JSON.parse(JSON.stringify({ ...p, id }));
    if (!keepStamp || !rec.savedAt) rec.savedAt = Date.now();
    p.savedAt = rec.savedAt;
    await tx('profile', 'readwrite', (s) => (s ? s.put(rec) : memory.profile.set(id, rec)));
    return true;
  } catch (e) {
    console.warn('saveProfile failed', e);
    return false;
  }
}
