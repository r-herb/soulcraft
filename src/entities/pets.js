// Companions: bought in the Soul Shop, one follows the player at a time.
// A pet walks (or flies) after the player, attacks hostile mobs and the
// active boss nearby, and draws melee mobs onto itself. When knocked out it
// rests for a while and then comes back.
import * as THREE from 'three';
import { Entity, Mob } from './entities.js';
import { box } from './models.js';
import { t } from '../i18n/index.js';

export const PETS = [
  { id: 'fox', price: 60, hp: 24, speed: 6.6, dmg: 3, reach: 1.7, cool: 0.8, w: 0.6, h: 0.7 },
  { id: 'owl', price: 120, hp: 16, speed: 7.5, dmg: 3, range: 12, cool: 1.3, flying: true, w: 0.5, h: 0.6 },
  { id: 'golem', price: 200, hp: 44, speed: 3.8, dmg: 6, reach: 2, cool: 1.5, knock: 9, w: 0.9, h: 1.2 },
];
export const PET = Object.fromEntries(PETS.map((p) => [p.id, p]));
const REST = 30; // seconds out of action after being knocked out

const COLORS = {
  fox: { body: '#e8722e', dark: '#9c3f16', light: '#fff1dc', eye: '#1a1022' },
  owl: { body: '#bfe6f5', dark: '#6aa9c8', light: '#ffffff', eye: '#1f3a8a', beak: '#f6c667' },
  golem: { body: '#6f8f4a', dark: '#4a6232', light: '#a6c97a', eye: '#b6ff7a', stone: '#8a8c93' },
};

const tmp = new THREE.Vector3();

export class Pet extends Entity {
  constructor(game, kind, x, y, z) {
    super(game, x, y, z);
    const d = PET[kind];
    this.kind = kind; this.def = d;
    this.isPet = true;
    this.hittable = false; // the player's attacks pass through
    this.hp = this.maxHp = d.hp;
    this.w = d.w; this.h = d.h;
    this.attackT = 0;
    this.scanT = 0;
    this.restT = 0;
    this.phase = Math.random() * 6;
    this.target = null;
    if (d.flying) this.gravity = 0;
    this.build();
  }

  get resting() { return this.restT > 0; }
  get name() { return t('pet.' + this.kind); }

  build() {
    const c = COLORS[this.kind];
    const g = this.object;
    if (this.kind === 'fox') {
      const body = box(0.45, 0.4, 0.8, c.body); body.position.y = 0.45; g.add(body);
      const head = box(0.42, 0.38, 0.4, c.body); head.position.set(0, 0.75, 0.45); g.add(head);
      const snout = box(0.2, 0.16, 0.2, c.light); snout.position.set(0, 0.68, 0.72); g.add(snout);
      for (const s of [-1, 1]) {
        const ear = box(0.12, 0.16, 0.08, c.dark); ear.position.set(s * 0.13, 1.0, 0.42); g.add(ear);
        const eye = box(0.06, 0.06, 0.02, c.eye); eye.position.set(s * 0.11, 0.8, 0.66); g.add(eye);
      }
      const tail = box(0.22, 0.22, 0.55, c.body); tail.position.set(0, 0.55, -0.6); tail.rotation.x = 0.5; g.add(tail);
      const tip = box(0.18, 0.18, 0.18, c.light); tip.position.set(0, 0, -0.3); tail.add(tip);
      this.tail = tail;
      this.legs = [];
      for (const [lx, lz] of [[-0.14, 0.25], [0.14, 0.25], [-0.14, -0.25], [0.14, -0.25]]) {
        const leg = box(0.12, 0.3, 0.12, c.dark); leg.position.set(lx, 0.15, lz); g.add(leg); this.legs.push(leg);
      }
    } else if (this.kind === 'owl') {
      const body = box(0.42, 0.5, 0.38, c.body); body.position.y = 0.3; g.add(body);
      const belly = box(0.3, 0.34, 0.04, c.light); belly.position.set(0, 0.26, 0.2); g.add(belly);
      for (const s of [-1, 1]) {
        const eye = box(0.1, 0.1, 0.02, c.light); eye.position.set(s * 0.1, 0.46, 0.2); g.add(eye);
        const pupil = box(0.05, 0.05, 0.02, c.eye); pupil.position.set(0, 0, 0.01); eye.add(pupil);
        const tuft = box(0.08, 0.12, 0.06, c.dark); tuft.position.set(s * 0.15, 0.6, 0.05); g.add(tuft);
      }
      const beak = box(0.08, 0.08, 0.08, c.beak); beak.position.set(0, 0.38, 0.23); g.add(beak);
      this.wings = [];
      for (const s of [-1, 1]) {
        const wing = new THREE.Group(); wing.position.set(s * 0.22, 0.4, 0);
        const m = box(0.45, 0.06, 0.3, c.dark); m.position.x = s * 0.22; wing.add(m);
        g.add(wing); this.wings.push(wing);
      }
    } else {
      const body = box(0.8, 0.7, 0.55, c.stone); body.position.y = 0.75; g.add(body);
      const moss = box(0.84, 0.18, 0.6, c.body); moss.position.y = 1.08; g.add(moss);
      const head = box(0.5, 0.4, 0.45, c.stone); head.position.set(0, 1.3, 0.05); g.add(head);
      const cap = box(0.54, 0.12, 0.5, c.light); cap.position.set(0, 1.52, 0.05); g.add(cap);
      for (const s of [-1, 1]) {
        const eye = box(0.08, 0.06, 0.02, c.eye); eye.position.set(s * 0.12, 1.33, 0.29); g.add(eye);
      }
      this.arms = [];
      for (const s of [-1, 1]) {
        const arm = new THREE.Group(); arm.position.set(s * 0.52, 1.0, 0);
        const m = box(0.22, 0.7, 0.24, c.stone); m.position.y = -0.3; arm.add(m);
        g.add(arm); this.arms.push(arm);
      }
      this.legs = [];
      for (const s of [-1, 1]) { const leg = box(0.26, 0.4, 0.28, c.dark); leg.position.set(s * 0.2, 0.2, 0); g.add(leg); this.legs.push(leg); }
    }
  }

  // Nearest enemy worth fighting: hostile mobs close to the player, or the boss.
  findTarget() {
    const g = this.game, p = g.player.pos;
    let best = null, bestD = 13;
    for (const e of g.entities.list) {
      if (!(e instanceof Mob) || e.dead || !e.hittable || e.def.hazard) continue;
      const dp = e.pos.distanceTo(p), d = e.pos.distanceTo(this.pos);
      if (dp < 12 && d < bestD) { best = e; bestD = d; }
    }
    const boss = g.bosses.active;
    if (!best && boss && !boss.dead && boss.pos && boss.pos.distanceTo(p) < 22) best = boss;
    return best;
  }

  update(dt) {
    const g = this.game, pl = g.player, d = this.def;
    this.phase += dt * 8;
    this.attackT -= dt;
    this.hurtT -= dt;
    if (this.restT > 0) {
      this.restT -= dt;
      this.object.visible = false;
      if (this.restT <= 0) { this.hp = this.maxHp; this.teleportNear(); this.object.visible = true; g.ui.toast(t('pet.back', { name: this.name }), 'ok'); }
      return;
    }
    // far behind (or in another place): catch up
    if (this.pos.distanceTo(pl.pos) > 26) this.teleportNear();
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.4; this.target = this.findTarget(); }
    const tg = this.target && !this.target.dead ? this.target : null;
    const goal = tg ? (tg.isBoss ? tg.center() : tg.pos) : pl.pos;
    const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const stop = tg ? (d.range ? 6 : d.reach * 0.8) : 2.6;
    let mx = 0, mz = 0;
    if (dist > stop) { mx = dx / dist; mz = dz / dist; }
    else if (d.range && tg && dist < 3.5) { mx = -dx / dist; mz = -dz / dist; }
    if (dist > 0.1) this.yaw = Math.atan2(dx, dz);
    const sp = d.speed * (tg ? 1 : dist > 7 ? 1.2 : 0.8);
    const k = Math.min(1, (this.onGround || d.flying ? 10 : 2) * dt);
    this.vel.x += (mx * sp - this.vel.x) * k;
    this.vel.z += (mz * sp - this.vel.z) * k;
    if (d.flying) {
      const hy = (tg ? goal.y + 1.8 : pl.pos.y + 2.4) + Math.sin(this.phase * 0.3) * 0.3;
      this.vel.y += ((hy - this.pos.y) * 2.5 - this.vel.y) * Math.min(1, 5 * dt);
    }
    const o = this.physics(dt);
    if (!d.flying && this.onGround && (o.hitX || o.hitZ) && (mx || mz)) this.vel.y = 8.2;
    // attack
    if (tg && this.attackT <= 0) {
      const dy = Math.abs(goal.y - this.pos.y);
      if (d.range && dist < d.range) {
        this.attackT = d.cool;
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 0.4, this.pos.z);
        const to = (tg.isBoss ? tg.center() : tmp.set(tg.pos.x, tg.pos.y + tg.h * 0.6, tg.pos.z)).clone();
        const dir = to.sub(from).normalize();
        g.entities.shoot('frost', from, dir, 26, d.dmg, 'player');
        g.audio.sfx('throw');
      } else if (!d.range && dist < d.reach + (tg.isBoss ? 1.5 : 0) && dy < 2.5) {
        this.attackT = d.cool;
        tmp.set(dx, 0, dz).normalize();
        if (tg.isBoss) tg.hurt(d.dmg, 'pet');
        else {
          tg.damage(d.dmg, tmp);
          if (d.knock) { tg.vel.x += tmp.x * d.knock; tg.vel.z += tmp.z * d.knock; tg.vel.y = 6; }
          // the mob turns on the pet for a while
          tg.petAggro = this; tg.petAggroT = 4;
        }
        this.lunge = 0.25;
        g.audio.sfx('hit');
      }
    }
    this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
  }

  animate(dt, moving) {
    const s = Math.min(1, moving / 3);
    if (this.legs) this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i % 2 ? Math.PI : 0)) * 0.7 * s; });
    if (this.tail) this.tail.rotation.y = Math.sin(this.phase * 0.7) * 0.4;
    if (this.wings) this.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(this.phase * 1.6) * 0.7; });
    if (this.arms) {
      this.lunge = Math.max(0, (this.lunge || 0) - dt);
      this.arms.forEach((a, i) => { a.rotation.x = this.lunge > 0 ? -1.6 : Math.sin(this.phase + (i ? Math.PI : 0)) * 0.5 * s; });
    }
  }

  teleportNear() {
    const p = this.game.player.pos;
    const a = this.game.player.yaw + Math.PI + (Math.random() - 0.5);
    this.pos.set(p.x + Math.sin(a) * 1.8, p.y + (this.def.flying ? 2.4 : 0.6), p.z + Math.cos(a) * 1.8);
    this.vel.set(0, 0, 0);
  }

  damage(amount) {
    if (this.resting || this.dead) return false;
    this.hp -= amount;
    this.hurtT = 0.3;
    if (this.hp <= 0) {
      this.hp = 0;
      this.restT = REST;
      this.target = null;
      this.game.entities.particles.emit(this.pos.x, this.pos.y + 0.5, this.pos.z, 0.8, 0.8, 0.9, 16, 3, 0.7);
      this.game.ui.toast(t('pet.rest', { name: this.name, s: REST }), 'warn');
    }
    return true;
  }
}

// 2D portrait for the shop (pixel art on a canvas).
export function drawPetPortrait(canvas, kind) {
  const W = 24;
  canvas.width = W; canvas.height = W;
  const x = canvas.getContext('2d');
  const c = COLORS[kind];
  const r = (px, py, w, h, col) => { x.fillStyle = col; x.fillRect(px, py, w, h); };
  x.clearRect(0, 0, W, W);
  if (kind === 'fox') {
    r(5, 12, 12, 6, c.body); r(15, 7, 7, 6, c.body); r(20, 10, 3, 2, c.light);
    r(15, 5, 2, 2, c.dark); r(19, 5, 2, 2, c.dark); r(19, 8, 1, 1, c.eye);
    r(1, 10, 5, 4, c.body); r(0, 9, 2, 3, c.light);
    r(6, 18, 2, 4, c.dark); r(9, 18, 2, 4, c.dark); r(13, 18, 2, 4, c.dark); r(16, 18, 2, 4, c.dark);
  } else if (kind === 'owl') {
    r(6, 6, 12, 14, c.body); r(8, 12, 8, 7, c.light);
    r(7, 8, 4, 4, c.light); r(13, 8, 4, 4, c.light); r(8, 9, 2, 2, c.eye); r(14, 9, 2, 2, c.eye);
    r(11, 11, 2, 2, c.beak); r(6, 4, 2, 3, c.dark); r(16, 4, 2, 3, c.dark);
    r(2, 10, 4, 7, c.dark); r(18, 10, 4, 7, c.dark); r(9, 20, 2, 2, c.beak); r(13, 20, 2, 2, c.beak);
  } else {
    r(5, 9, 14, 9, c.stone); r(5, 8, 14, 3, c.body); r(8, 2, 8, 6, c.stone); r(8, 1, 8, 2, c.light);
    r(9, 4, 2, 1, c.eye); r(13, 4, 2, 1, c.eye);
    r(1, 9, 4, 9, c.stone); r(19, 9, 4, 9, c.stone); r(7, 18, 4, 5, c.dark); r(13, 18, 4, 5, c.dark);
  }
}
