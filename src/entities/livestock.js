// Livestock: chickens, sheep and cows. They wander the grass of the
// overworld in small groups by day, and can be bought in crates at a market
// stall (the only way to get them in a city). Fed their food (wheat, or
// seeds for chickens) two adults of a kind fall in love and a young one is
// born, which grows up in five minutes; hens lay eggs. Animals the player
// walks away from are kept in the save and come back when the player
// returns. The world owner's game runs them; guests see them like monsters.
import { B } from '../world/blocks.js';
import { isNight } from '../engine/sky.js';
import { t } from '../i18n/index.js';

export const ANIMALS = ['chicken', 'sheep', 'cow'];
const KEEP = 64; // farther than this an animal is parked in the save
const BACK = 48; // nearer than this a parked animal comes back

export class Livestock {
  constructor(game) { this.game = game; this.t = 0; }
  get owner() { const g = this.game; return !(g.net && !g.net.isHost) && !g.isGuest; }
  parked() {
    const m = this.game.meta;
    if (!m.animals) m.animals = {};
    return (m.animals[m.dim] = m.animals[m.dim] || []);
  }
  active() { return this.game.entities.list.filter((e) => e.passive && !e.dead && !e.netProxy); }
  spawn(type, x, y, z, baby = false) {
    const a = this.game.entities.spawnMob(type, x, y, z);
    if (baby) a.setBaby(true);
    return a;
  }
  record(e) { return { k: e.type, x: +e.pos.x.toFixed(2), y: +e.pos.y.toFixed(2), z: +e.pos.z.toFixed(2), b: e.baby ? Math.round(e.growT) + 1 : 0 }; }
  restore(r) { const a = this.spawn(r.k, r.x, r.y + 0.05, r.z, !!r.b); if (r.b) a.growT = r.b - 1; return a; }

  // the save: parked animals plus the ones around the player right now
  snapshot() {
    const m = this.game.meta;
    const out = JSON.parse(JSON.stringify(m.animals || {}));
    if (this.owner && m.dim) out[m.dim] = [...(out[m.dim] || []), ...this.active().map((e) => this.record(e))];
    return out;
  }
  // before leaving a realm (the entities are cleared): keep its animals
  parkAll() {
    if (!this.game.meta || !this.owner) return;
    const L = this.parked();
    for (const e of this.active()) { L.push(this.record(e)); e.dead = true; }
  }

  // "use" on an animal with its food in hand
  feed(ent) {
    const g = this.game;
    const held = g.inventory.held;
    if (!held || held.item !== ent.def.food) { g.ui.toast(t('farm.wants', { food: t('item.' + ent.def.food) })); return true; }
    if (!this.owner) return true;
    if (ent.baby) { ent.growT += 60; }
    else if (ent.breedCd > 0 || ent.loveT > 0) { g.ui.toast(t('farm.notYet')); return true; }
    else {
      ent.loveT = 30;
      const mate = this.active().find((e) => e !== ent && e.type === ent.type && !e.baby && e.loveT > 0 && e.pos.distanceTo(ent.pos) < 8);
      if (mate) {
        ent.mate = mate; mate.mate = ent;
        setTimeout(() => {
          if (ent.dead || mate.dead) return;
          this.spawn(ent.type, (ent.pos.x + mate.pos.x) / 2, Math.max(ent.pos.y, mate.pos.y) + 0.1, (ent.pos.z + mate.pos.z) / 2, true);
          ent.loveT = mate.loveT = 0; ent.breedCd = mate.breedCd = 300; ent.mate = mate.mate = null;
          g.entities.particles.emit(ent.pos.x, ent.pos.y + 1, ent.pos.z, 1, 0.45, 0.6, 14, 2, 0.8);
          g.ui.toast(t('farm.baby', { name: t('mob.' + ent.type) }), 'ok');
        }, 2500);
      }
    }
    if (!g.creative) g.inventory.consumeHeld(1);
    g.audio.sfx('eat');
    return true;
  }

  // a crate from the market stall: the animal steps out on the block
  release(kind, hit) {
    const g = this.game;
    if (!hit) return false;
    const x = hit.x + 0.5, y = hit.y + 1.05, z = hit.z + 0.5;
    if (g.world.getBlock(hit.x, hit.y + 1, hit.z) !== B.air) return false;
    this.spawn(kind, x, y, z);
    if (!g.creative) g.inventory.consumeHeld(1);
    g.audio.sfx('place');
    g.ui.toast(t('farm.released', { name: t('mob.' + kind) }), 'ok');
    return true;
  }

  update(dt) {
    this.t += dt;
    if (this.t < 3) return;
    this.t = 0;
    const g = this.game;
    if (!g.meta || !g.world || !this.owner || g.meta.dim === 'quest') return;
    const p = g.player.pos;
    const near = (o) => Math.hypot(o.x - p.x, o.z - p.z);
    // park the far ones, bring back the near ones
    const L = this.parked();
    const act = this.active();
    for (const e of act) if (near(e.pos) > KEEP) { L.push(this.record(e)); e.dead = true; }
    for (let i = L.length - 1; i >= 0; i--) {
      const r = L[i];
      if (near(r) > BACK || g.world.getBlock(r.x, r.y - 1, r.z) < 0) continue;
      this.restore(r);
      L.splice(i, 1);
    }
    // a few animals on the grass by day, away from the player's sight (in a city: chickens in the parks)
    const city = g.meta.dim === 'city';
    if ((g.meta.dim !== 'overworld' && !city) || isNight(g.meta.time) || Math.random() > (city ? 0.12 : 0.3)) return;
    const around = this.active().length + L.filter((r) => near(r) < KEEP).length;
    if (around >= 8) return;
    const a = Math.random() * Math.PI * 2, rr = 22 + Math.random() * 14;
    const x = Math.floor(p.x + Math.cos(a) * rr), z = Math.floor(p.z + Math.sin(a) * rr);
    const y = g.world.topSolid(x, z);
    if (y < 0 || g.world.getBlock(x, y, z) !== B.grass || g.world.getBlock(x, y + 1, z) !== B.air) return;
    const kind = city ? 'chicken' : ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.spawn(kind, x + 0.5 + (Math.random() - 0.5) * 2, y + 1.05, z + 0.5 + (Math.random() - 0.5) * 2);
  }
}
