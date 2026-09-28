// Pure, deterministic world layout: terrain height, villages, the Trial
// Chamber and the boss arenas. Both the generator (in the worker) and the
// main thread (villager spawns, travel targets) call these, so they must stay
// side-effect free.
import { Noise, hash3, hashString } from './noise.js';
import { SEA } from './blocks.js';

export const DIMS = ['overworld', 'emberdeep', 'void', 'soul'];

// Trial Chamber: a large buried hall with a stair down from the surface.
export const CHAMBER = { x: 176, z: -176, x0: -22, x1: 22, z0: -22, z1: 22, floor: 18, ceil: 38 };
export const ARENAS = {
  voidDragon: { dim: 'void', x: 0, z: 0, y: 60, r: 26 },
  shellKing: { dim: 'soul', x: 0, z: 0, y: 50, r: 24 },
  whirlwindKing: { dim: 'overworld', x: CHAMBER.x, z: CHAMBER.z, y: CHAMBER.floor, r: 20 },
  emberWarden: { dim: 'emberdeep', x: 0, z: 0, y: 40, r: 22 },
  soulStorm: { dim: 'soul', x: 160, z: 0, y: 56, r: 28 },
};

const REGION = 256;
const cache = new Map();

export class Layout {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.n = new Noise(this.seed);
    this.n2 = new Noise((this.seed ^ 0x9e3779b9) >>> 0);
    this.villageCache = new Map();
  }

  static get(seed) {
    let l = cache.get(seed);
    if (!l) { l = new Layout(seed); cache.set(seed, l); }
    return l;
  }

  rawHeight(x, z) {
    const n = this.n;
    const cont = n.fbm2(x / 420, z / 420, 3);
    const hills = n.fbm2(x / 110 + 50, z / 110 - 20, 4);
    const detail = n.noise2(x / 28, z / 28);
    const mount = Math.max(0, n.fbm2(x / 260 - 90, z / 260 + 40, 3) - 0.25) * 60;
    return 44 + cont * 12 + hills * 11 * (0.6 + 0.4 * cont) + detail * 2.5 + mount;
  }

  // Biome of a column: 'plains', 'desert' or 'snow'. A temperature field
  // decides it; the land around spawn is always plains.
  biome(x, z) {
    const fade = Math.min(1, Math.max(0, (Math.hypot(x, z) - 170) / 110));
    if (fade <= 0) return 'plains';
    const t = this.n2.fbm2(x / 520 + 13.7, z / 520 - 7.3, 2) * fade;
    return t > 0.2 ? 'desert' : t < -0.2 ? 'snow' : 'plains';
  }

  // Village for a region, or null. Region 0,0 always has one near spawn.
  villageInRegion(rx, rz) {
    const key = rx + ',' + rz;
    if (this.villageCache.has(key)) return this.villageCache.get(key);
    let v = null;
    const h = hash3(this.seed, rx, 7, rz);
    if ((rx === 0 && rz === 0) || h < 0.55) {
      const ox = rx === 0 && rz === 0 ? 40 : 48 + Math.floor(hash3(this.seed, rx, 11, rz) * 160);
      const oz = rx === 0 && rz === 0 ? 40 : 48 + Math.floor(hash3(this.seed, rx, 13, rz) * 160);
      const x = rx * REGION + ox, z = rz * REGION + oz;
      const inChamber = Math.abs(x - CHAMBER.x) < 80 && Math.abs(z - CHAMBER.z) < 80;
      const y = Math.round(Math.max(SEA + 3, Math.min(62, this.rawHeight(x, z))));
      if (!inChamber) v = this.buildVillage(x, z, y, rx, rz);
    }
    this.villageCache.set(key, v);
    return v;
  }

  buildVillage(x, z, y, rx, rz) {
    const houses = [];
    const count = 5 + Math.floor(hash3(this.seed, rx, 17, rz) * 2);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash3(this.seed, rx + i, 19, rz) * 0.5;
      const d = 13 + hash3(this.seed, rx, 23 + i, rz) * 4;
      const cx = Math.round(x + Math.cos(a) * d), cz = Math.round(z + Math.sin(a) * d);
      const w = 2 + Math.floor(hash3(this.seed, i, 29, rz) * 2); // half extents
      const dd = 2 + Math.floor(hash3(this.seed, rx, 31, i) * 2);
      // door on the side facing the center
      const dx = x - cx, dz = z - cz;
      let door;
      if (Math.abs(dx) > Math.abs(dz)) door = dx > 0 ? { x: cx + w, z: cz } : { x: cx - w, z: cz };
      else door = dz > 0 ? { x: cx, z: cz + dd } : { x: cx, z: cz - dd };
      houses.push({ cx, cz, x0: cx - w, x1: cx + w, z0: cz - dd, z1: cz + dd, door, bench: i === 0 });
    }
    return { x, z, y, r: 30, houses, id: rx + ':' + rz };
  }

  villageNear(x, z) {
    const rx = Math.floor(x / REGION), rz = Math.floor(z / REGION);
    const v = this.villageInRegion(rx, rz);
    if (v && Math.abs(x - v.x) < 34 && Math.abs(z - v.z) < 34) return v;
    return null;
  }

  // Final overworld surface height (top solid block y).
  height(x, z) {
    let h = this.rawHeight(x, z);
    const v = this.villageNear(x, z);
    if (v) {
      const d = Math.hypot(x - v.x, z - v.z);
      const t = Math.min(1, Math.max(0, (d - 20) / 12));
      const s = t * t * (3 - 2 * t);
      h = v.y * (1 - s) + h * s;
    }
    const cdx = Math.max(0, Math.abs(x - CHAMBER.x) - 26), cdz = Math.max(0, Math.abs(z - CHAMBER.z) - 26);
    const cd = Math.hypot(cdx, cdz);
    if (cd < 16) {
      const base = Math.max(SEA + 4, Math.round(this.rawHeight(CHAMBER.x, CHAMBER.z)));
      const s = cd / 16;
      h = base * (1 - s) + h * s;
    }
    return Math.max(2, Math.min(118, Math.floor(h)));
  }

  villagesAround(x, z, radius) {
    const out = [];
    const r0x = Math.floor((x - radius) / REGION), r1x = Math.floor((x + radius) / REGION);
    const r0z = Math.floor((z - radius) / REGION), r1z = Math.floor((z + radius) / REGION);
    for (let rx = r0x; rx <= r1x; rx++) for (let rz = r0z; rz <= r1z; rz++) {
      const v = this.villageInRegion(rx, rz);
      if (v && Math.abs(v.x - x) <= radius && Math.abs(v.z - z) <= radius) out.push(v);
    }
    return out;
  }

  spawnPoint() {
    const v = this.villageInRegion(0, 0);
    return { x: v.x + 0.5, y: v.y + 2, z: v.z + 6.5 };
  }
}

// Where travel and respawn put the player in each realm (y is found by
// scanning down for ground from scanY). Arrival points sit just outside the
// arenas so a fight starts only when the player walks in.
export const DIM_SPAWNS = {
  emberdeep: { x: 0.5, z: 29.5, scanY: 70 },
  void: { x: 0.5, z: 20.5, scanY: 100 },
  soul: { x: 0.5, z: 34.5, scanY: 120 },
};
export const BOSS_SPAWNS = {
  voidDragon: DIM_SPAWNS.void,
  shellKing: DIM_SPAWNS.soul,
  emberWarden: DIM_SPAWNS.emberdeep,
  soulStorm: { x: 160.5, z: 38.5, scanY: 120 },
};

export function seedFromString(s) {
  const t = String(s || '').trim();
  if (!t) return (Math.random() * 0xffffffff) >>> 0;
  if (/^-?\d+$/.test(t)) return (Number(t) >>> 0);
  return hashString(t);
}
