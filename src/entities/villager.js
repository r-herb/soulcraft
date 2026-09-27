// Villagers: wander their village, trade, and like you more the more you trade.
import * as THREE from 'three';
import { humanoid, animateWalk, box } from './models.js';
import { hash3, hashString } from '../world/noise.js';
import { t } from '../i18n/index.js';

const ROBES = [
  { shirt: '#6b4a8a', pants: '#3a2a4d', hair: '#e6e0d0', accent: '#f6c667' },
  { shirt: '#3d7a5a', pants: '#2a4d3a', hair: '#4d3421', accent: '#b08452' },
  { shirt: '#a1523e', pants: '#5a2f2c', hair: '#2b1d12', accent: '#ffd08a' },
  { shirt: '#3b5bd6', pants: '#1f2a6b', hair: '#c8411c', accent: '#dfe3e8' },
  { shirt: '#c9a24a', pants: '#6b4a2f', hair: '#8a8a8a', accent: '#6b4a8a' },
];
const SKIN = ['#d9a57a', '#b97a55', '#8a5a3c', '#f0d0b8', '#c99670'];

// Trade pools per friendship tier (0..4). give = what the player pays.
const POOL = [
  [
    { give: ['log', 6], get: ['bread', 2] },
    { give: ['dirt', 16], get: ['sunfruit', 2] },
    { give: ['rubble', 12], get: ['torch', 6] },
    { give: ['charcoal', 4], get: ['bread', 3] },
    { give: ['fiber', 4], get: ['arrow', 6] },
    { give: ['planks', 12], get: ['glass', 4] },
  ],
  [
    { give: ['bone_dust', 4], get: ['roast', 2] },
    { give: ['charcoal', 8], get: ['iron_ingot', 1] },
    { give: ['sand', 16], get: ['wool', 4] },
    { give: ['log', 10], get: ['stone_sword', 1] },
    { give: ['sunfruit', 4], get: ['glow_stew', 1] },
  ],
  [
    { give: ['iron_ingot', 3], get: ['bow', 1] },
    { give: ['iron_ingot', 2], get: ['arrow', 16] },
    { give: ['bone_dust', 8], get: ['gold_ingot', 1] },
    { give: ['wool', 4], get: ['iron_ingot', 2] },
  ],
  [
    { give: ['gold_ingot', 3], get: ['spear', 1] },
    { give: ['iron_ingot', 5], get: ['iron_sword', 1] },
    { give: ['gold_ingot', 2], get: ['glass', 16] },
    { give: ['emberite_shard', 2], get: ['gold_ingot', 3] },
  ],
  [
    { give: ['gold_ingot', 6], get: ['soul_heart', 1] },
    { give: ['iron_ingot', 8], get: ['soul_heart', 1] },
    { give: ['emberite_shard', 4], get: ['emberite_ingot', 1] },
  ],
];
export const FRIEND_XP = [0, 2, 5, 9, 14];

export function friendshipLevel(xp) {
  let l = 0;
  for (let i = 0; i < FRIEND_XP.length; i++) if (xp >= FRIEND_XP[i]) l = i;
  return l;
}

export class Villager {
  constructor(game, id, x, y, z, village) {
    this.game = game;
    this.id = id;
    this.village = village;
    this.villager = true;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.w = 0.6; this.h = 1.8;
    this.hp = 20; this.maxHp = 20;
    this.dead = false;
    this.hittable = true;
    this.yaw = Math.random() * 6;
    this.phase = 0;
    this.wanderT = 1;
    this.target = null;
    this.hurtT = 0;
    const h = hashString(id);
    const names = t('villager.names').split(',');
    this.nameIndex = h % names.length;
    const robe = ROBES[h % ROBES.length];
    this.rig = humanoid({ skin: SKIN[(h >>> 3) % SKIN.length], ...robe, eye: '#2b1d12' }, 'villager');
    // lantern hat
    const hat = box(0.62, 0.1, 0.62, robe.accent);
    hat.position.y = 0.32;
    const lamp = box(0.16, 0.16, 0.16, '#ffe08a', null, { emissive: 0xffc05a });
    lamp.position.y = 0.14;
    hat.add(lamp);
    this.rig.head.add(hat);
    this.object = new THREE.Group();
    this.object.add(this.rig.group);
    game.scene.add(this.object);
    this._out = {};
    if (!game.meta.villagers[id]) game.meta.villagers[id] = { xp: 0, used: {} };
    this.refreshTrades();
  }
  get name() { const names = t('villager.names').split(','); return names[this.nameIndex % names.length]; }
  get data() { return this.game.meta.villagers[this.id]; }
  get level() { return friendshipLevel(this.data.xp); }

  // Offers rotate each in-game day and improve with friendship.
  refreshTrades() {
    const day = this.game.meta.day;
    const seed = hashString(this.id);
    const offers = [];
    for (let tier = 0; tier < POOL.length; tier++) {
      const pool = POOL[tier];
      const n = tier === 0 ? 2 : 1;
      const used = new Set();
      for (let k = 0; k < n; k++) {
        let i = Math.floor(hash3(seed, day, tier, k) * pool.length);
        while (used.has(i)) i = (i + 1) % pool.length;
        used.add(i);
        offers.push({ ...pool[i], tier, key: tier + ':' + i });
      }
    }
    this.offers = offers;
    if (this.data.day !== day) { this.data.day = day; this.data.used = {}; }
  }

  // Better prices at higher friendship: cost drops by 1 per two levels (min 1).
  cost(offer) { return Math.max(1, offer.give[1] - Math.floor(this.level / 2)); }

  trade(offer) {
    const g = this.game;
    const inv = g.inventory;
    const c = this.cost(offer);
    if (offer.tier > this.level) return false;
    if (inv.count(offer.give[0]) < c) return false;
    inv.remove(offer.give[0], c);
    g.giveItem(offer.get[0], offer.get[1]);
    const before = this.level;
    this.data.xp += 1;
    g.audio.sfx('trade');
    if (this.level > before) { g.ui.toast(t('toast.friend', { name: this.name, n: this.level }), 'ok'); g.audio.sfx('levelup'); }
    return true;
  }

  flinch() { this.hurtT = 0.3; this.vel.y = 4; }

  update(dt) {
    const g = this.game;
    this.phase += dt * 6;
    this.hurtT -= dt;
    const p = g.player;
    const dp = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    let mx = 0, mz = 0;
    if (dp < 4 && !p.dead) {
      this.yaw = Math.atan2(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 3 + Math.random() * 5;
        const v = this.village;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 16;
        this.target = Math.random() < 0.6 ? new THREE.Vector3(v.x + Math.cos(a) * r, 0, v.z + Math.sin(a) * r) : null;
      }
      if (this.target) {
        const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.8) { mx = dx / d; mz = dz / d; this.yaw = Math.atan2(dx, dz); } else this.target = null;
      }
    }
    const sp = 1.6;
    this.vel.x += (mx * sp - this.vel.x) * Math.min(1, 8 * dt);
    this.vel.z += (mz * sp - this.vel.z) * Math.min(1, 8 * dt);
    this.vel.y -= 28 * dt;
    const o = movePhysics(g.world, this, dt);
    if (o.onGround && (o.hitX || o.hitZ) && (mx || mz)) this.vel.y = 8;
    animateWalk(this.rig, this.phase, Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 1.5));
    if (this.pos.y < -20 || dp > 110) this.dead = true; // respawns when the player comes back
  }

  sync() { this.object.position.copy(this.pos); this.object.rotation.y = this.yaw; }
  remove() { this.game.scene.remove(this.object); }
}

import { moveBody } from '../player/player.js';
function movePhysics(world, e, dt) { return moveBody(world, e.pos, e.vel, e.w, e.h, dt, e._out); }
