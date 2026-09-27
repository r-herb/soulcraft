// IndexedDB persistence: one saved world (the "Continue" slot) and a global
// profile (soul crystals, unlocked skins). Every call is wrapped so a broken
// or blocked database never crashes the game.

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

export async function saveWorld(data, slot = 'current') {
  try {
    const rec = JSON.parse(JSON.stringify(data));
    rec.id = slot;
    rec.savedAt = Date.now();
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

export async function deleteWorld(slot = 'current') {
  try { await tx('worlds', 'readwrite', (s) => (s ? s.delete(slot) : memory.worlds.delete(slot))); } catch (e) { console.warn(e); }
}

const DEFAULT_PROFILE = { id: 'profile', crystals: 0, skins: ['wanderer'], skin: 'wanderer', totalCrystals: 0 };

export async function loadProfile() {
  try {
    const r = await tx('profile', 'readonly', (s) => (s ? s.get('profile') : null));
    const p = r || memory.profile.get('profile');
    return { ...DEFAULT_PROFILE, ...(p || {}) };
  } catch (e) {
    console.warn('loadProfile failed', e);
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(p) {
  try {
    const rec = JSON.parse(JSON.stringify({ ...p, id: 'profile' }));
    await tx('profile', 'readwrite', (s) => (s ? s.put(rec) : memory.profile.set('profile', rec)));
    return true;
  } catch (e) {
    console.warn('saveProfile failed', e);
    return false;
  }
}
