// Farming. Seeds planted on grass, dirt or farmland turn the soil into
// farmland and grow through four stages while the world is played (about
// seven and a half minutes to ripe). Breaking a ripe crop gives the harvest
// and seeds back; an unripe one gives its seed back. The world owner's game
// (not a guest's) keeps the list of crops and grows them, and the block
// changes reach guests like any other edit.
//
// Farm 2: an orange pip (from the leaves of trees) grows into an orange bush
// whose ripe fruit is picked with "use" and grows again; a nest box gathers
// the eggs of the hens around it; an incubator hatches eggs into chicks.
import { BLOCKS, B } from './blocks.js';
import { t } from '../i18n/index.js';

export const CROP_KINDS = ['wheat', 'tomato', 'carrot', 'orange'];
export const HATCH_SECONDS = 180; // an egg in the incubator
export const NEST_RANGE = 6; // hens this near a nest box lay into it
export const STAGE_SECONDS = 150;
// ripe harvest: [item, min, max], and the seed that comes back
const HARVEST = {
  wheat: { item: 'wheat', min: 1, max: 2, seed: 'wheat_seeds', seeds: [1, 2] },
  tomato: { item: 'tomato', min: 2, max: 4, seed: 'tomato_seeds', seeds: [1, 1] },
  carrot: { item: 'carrot', min: 2, max: 4, seed: null, seeds: [0, 0] },
  orange: { item: 'orange', min: 2, max: 4, seed: 'orange_seed', seeds: [1, 1] },
};
const SEED_OF = { wheat: 'wheat_seeds', tomato: 'tomato_seeds', carrot: 'carrot', orange: 'orange_seed' };

export const cropBlock = (kind, stage) => B[`${kind}_${stage}`];
export const isCrop = (id) => !!(BLOCKS[id] && BLOCKS[id].crop);
const SOIL = new Set([B.grass, B.dirt, B.farmland]);
export const canPlantOn = (id) => SOIL.has(id);

// what breaking a crop block gives: [[item, count], ...]
export function harvestOf(id, rand = Math.random) {
  const b = BLOCKS[id];
  if (!b || !b.crop) return [];
  if (b.stage < 3) return [[SEED_OF[b.crop], 1]];
  const h = HARVEST[b.crop];
  const out = [[h.item, h.min + Math.floor(rand() * (h.max - h.min + 1))]];
  if (h.seed) out.push([h.seed, h.seeds[0] + Math.floor(rand() * (h.seeds[1] - h.seeds[0] + 1))]);
  return out;
}

export class Farm {
  constructor(game) { this.game = game; this.t = 0; }
  // the world owner runs the crops (a guest's game only shows them)
  get owner() { const g = this.game; return !(g.net && !g.net.isHost) && !g.isGuest; }
  list() {
    const m = this.game.meta;
    if (!m.crops) m.crops = {};
    return (m.crops[m.dim] = m.crops[m.dim] || []);
  }

  // plant a seed on top of the soil block at (x, y, z)
  plant(x, y, z, kind) {
    const w = this.game.world;
    if (!canPlantOn(w.getBlock(x, y, z)) || w.getBlock(x, y + 1, z) !== B.air) return false;
    w.setBlock(x, y, z, B.farmland);
    w.setBlock(x, y + 1, z, cropBlock(kind, 0));
    return true;
  }

  // the fruit of a ripe orange bush, picked: it grows again
  pick(x, y, z, rand = Math.random) {
    const g = this.game, w = g.world, b = BLOCKS[w.getBlock(x, y, z)];
    if (!b || b.crop !== 'orange' || b.stage < 3) return null;
    const n = HARVEST.orange.min + Math.floor(rand() * (HARVEST.orange.max - HARVEST.orange.min + 1));
    w.setBlock(x, y, z, cropBlock('orange', 2));
    const r = this.list().find((q) => q.x === x && q.y === y && q.z === z);
    const now = g.meta.playTime || 0;
    if (r) r.t = now - 2 * STAGE_SECONDS; else this.list().push({ x, y, z, k: 'orange', t: now - 2 * STAGE_SECONDS });
    return n;
  }

  // nest boxes and incubators of this realm
  extra() {
    const m = this.game.meta;
    if (!m.coops) m.coops = {};
    return (m.coops[m.dim] = m.coops[m.dim] || { nests: {}, incubators: [] });
  }
  // a hen lays: into a nest box near her, if there is one (true), else on the ground
  layNear(x, y, z) {
    const w = this.game.world, X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    for (let dy = -2; dy <= 2; dy++) for (let dz = -NEST_RANGE; dz <= NEST_RANGE; dz++) for (let dx = -NEST_RANGE; dx <= NEST_RANGE; dx++) {
      if (w.getBlock(X + dx, Y + dy, Z + dz) !== B.nest_box) continue;
      const k = `${X + dx},${Y + dy},${Z + dz}`, N = this.extra().nests;
      N[k] = Math.min(16, (N[k] || 0) + 1);
      return true;
    }
    return false;
  }
  // the eggs in a nest box
  collect(x, y, z) {
    const N = this.extra().nests, k = `${x},${y},${z}`, n = N[k] || 0;
    delete N[k];
    return n;
  }
  // an egg into the incubator (up to four); false when full
  incubate(x, y, z) {
    const L = this.extra().incubators;
    let inc = L.find((r) => r.x === x && r.y === y && r.z === z);
    if (!inc) { inc = { x, y, z, eggs: [] }; L.push(inc); }
    if (inc.eggs.length >= 4) return false;
    inc.eggs.push(this.game.meta.playTime || 0);
    return true;
  }
  incubator(x, y, z) { return this.extra().incubators.find((r) => r.x === x && r.y === y && r.z === z) || null; }

  // every block change: start tracking new crops, forget broken ones
  onBlockChange(x, y, z, prev, id) {
    if (!this.game.meta || !this.owner) return;
    if (prev === B.nest_box || prev === B.incubator) {
      const E = this.extra();
      delete E.nests[`${x},${y},${z}`];
      E.incubators = E.incubators.filter((r) => !(r.x === x && r.y === y && r.z === z));
    }
    const b = BLOCKS[id];
    if (b && b.crop) {
      if (b.stage === 0 && !isCrop(prev)) {
        const L = this.list();
        if (!L.some((r) => r.x === x && r.y === y && r.z === z)) L.push({ x, y, z, k: b.crop, t: this.game.meta.playTime || 0 });
      }
    } else if (isCrop(prev)) {
      const L = this.list();
      const i = L.findIndex((r) => r.x === x && r.y === y && r.z === z);
      if (i >= 0) L.splice(i, 1);
    }
  }

  update(dt) {
    this.t += dt;
    if (this.t < 2) return;
    this.t = 0;
    const g = this.game;
    if (!g.meta || !g.world || !this.owner) return;
    const now = g.meta.playTime || 0;
    const L = this.list();
    for (let i = L.length - 1; i >= 0; i--) {
      const r = L[i];
      const cur = g.world.getBlock(r.x, r.y, r.z);
      if (cur < 0) continue; // not loaded: it grows on when the player comes back
      const cb = BLOCKS[cur];
      if (!cb || cb.crop !== r.k) { L.splice(i, 1); continue; }
      const want = Math.min(3, Math.floor((now - r.t) / STAGE_SECONDS));
      if (cb.stage < want) g.world.setBlock(r.x, r.y, r.z, cropBlock(r.k, want));
    }
    // incubators: an egg kept warm long enough hatches into a chick beside it
    for (const inc of this.extra().incubators) {
      if (!inc.eggs.length || g.world.getBlock(inc.x, inc.y, inc.z) !== B.incubator) continue;
      const ready = inc.eggs.filter((t0) => now - t0 >= HATCH_SECONDS).length;
      if (!ready) continue;
      inc.eggs = inc.eggs.filter((t0) => now - t0 < HATCH_SECONDS);
      for (let i = 0; i < ready; i++) g.livestock.spawn('chicken', inc.x + 0.5 + (i % 2 ? 1.2 : -1.2), inc.y + 0.05, inc.z + 0.5 + (i > 1 ? 1 : 0), true);
      g.audio.sfx('pickup');
      g.ui.toast(t('farm.hatched', { n: ready }), 'ok');
    }
  }
}
