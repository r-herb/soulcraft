// Farming. Seeds planted on grass, dirt or farmland turn the soil into
// farmland and grow through four stages while the world is played (about
// seven and a half minutes to ripe). Breaking a ripe crop gives the harvest
// and seeds back; an unripe one gives its seed back. The world owner's game
// (not a guest's) keeps the list of crops and grows them, and the block
// changes reach guests like any other edit.
import { BLOCKS, B } from './blocks.js';

export const CROP_KINDS = ['wheat', 'tomato', 'carrot'];
export const STAGE_SECONDS = 150;
// ripe harvest: [item, min, max], and the seed that comes back
const HARVEST = {
  wheat: { item: 'wheat', min: 1, max: 2, seed: 'wheat_seeds', seeds: [1, 2] },
  tomato: { item: 'tomato', min: 2, max: 4, seed: 'tomato_seeds', seeds: [1, 1] },
  carrot: { item: 'carrot', min: 2, max: 4, seed: null, seeds: [0, 0] },
};
const SEED_OF = { wheat: 'wheat_seeds', tomato: 'tomato_seeds', carrot: 'carrot' };

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

  // every block change: start tracking new crops, forget broken ones
  onBlockChange(x, y, z, prev, id) {
    if (!this.game.meta || !this.owner) return;
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
  }
}
