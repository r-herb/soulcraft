// Soul Storm: the final guardian, three phases.
//  1. Lightning: strikes fall on red rings around the player; storm bolts.
//  2. Shells: minions plus shell volleys - hit the glowing ones back.
//  3. Tempest: whirlwinds and fireball rings, everything faster.
// Its core takes damage from every weapon.
import * as THREE from 'three';
import { Boss } from './base.js';
import { t } from '../i18n/index.js';

export class SoulStorm extends Boss {
  constructor(game, arena) {
    super(game, 'soulStorm', arena, 600);
    this.phaseCount = 3;
    this.box = { hw: 1.6, h: 3.2 };
    this.strikeT = 3;
    this.boltT = 5;
    this.volleyT = 4;
    this.summonT = 8;
    this.ringT = 6;
    this.hover = 2.5;
    this.pos.set(arena.x + 0.5, arena.y + 1 + this.hover, arena.z + 0.5);
    this.build();
  }

  build() {
    const g = this.object;
    const coreM = this.mat(0xffffff, 0x7ff3ff);
    const cloud = this.mat(0x3a3d7a, 0x141638);
    const cloud2 = this.mat(0x5a4a9a, 0x1a1040);
    this.core = this.cube(1.2, 1.2, 1.2, coreM);
    this.core.position.y = 1.6;
    g.add(this.core);
    const eye = this.mat(0x05040f, 0x000000);
    for (const s of [-1, 1]) { const e = this.cube(0.2, 0.3, 0.1, eye); e.position.set(s * 0.25, 0.1, 0.61); this.core.add(e); }
    this.orbit = [];
    for (let i = 0; i < 18; i++) {
      const s = 0.6 + Math.random() * 0.8;
      const m = this.cube(s, s * 0.6, s, i % 3 ? cloud : cloud2);
      g.add(m);
      this.orbit.push({ m, r: 1.6 + Math.random() * 1.6, a: Math.random() * 6.28, y: Math.random() * 3.2, sp: 0.8 + Math.random() * 1.2 });
    }
    this.coreMat = coreM;
  }

  onDamaged() {
    const third = this.maxHp / 3;
    const want = this.hp > third * 2 ? 1 : this.hp > third ? 2 : 3;
    if (want > this.phase) {
      this.phase = want;
      this.game.ui.hud.titleCard(this.name, t('boss.phase', { n: want }));
      this.game.audio.sfx('roar');
      this.game.audio.sfx('boom');
      if (want === 2) this.setHint('boss.hint.hitBack', 4);
    }
  }

  onProjectile(proj) {
    if (proj.owner !== 'player') return;
    this.hurt(proj.deflected ? 30 : proj.kind === 'wind' ? 20 : proj.damageAmt, proj.kind);
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena;
    const p = this.player.pos;
    const ph = this.phase;
    const speed = ph === 3 ? 1.4 : 1;
    // drift around the arena
    const a = this.t * 0.2;
    const tx = A.x + 0.5 + Math.cos(a) * 8, tz = A.z + 0.5 + Math.sin(a * 1.3) * 8;
    this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 0.8);
    this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 0.8);
    this.pos.y = A.y + 1 + this.hover + Math.sin(this.t) * 0.6;
    // lightning strikes (all phases)
    this.strikeT -= dt * speed;
    if (this.strikeT <= 0) {
      this.strikeT = ph === 1 ? 2.4 : 3.4;
      const n = ph === 1 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ox = i === 0 ? 0 : (Math.random() - 0.5) * 8, oz = i === 0 ? 0 : (Math.random() - 0.5) * 8;
        const x = p.x + ox + (this.player.vel.x * 0.6), z = p.z + oz + (this.player.vel.z * 0.6);
        const y = A.y + 1;
        this.warn(x, y, z, 2.2, 1.2, () => { this.flashColumn(x, y, z); this.blast(x, y, z, 2.2, 6); }, 0xb6fbff);
      }
      this.game.audio.sfx('warn');
    }
    if (ph === 1) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 3.5;
        const from = this.center();
        this.shoot('storm_bolt', from, this.toPlayer(), 13, 4, { homing: 0.8, life: 5 });
      }
    }
    if (ph >= 2) {
      this.volleyT -= dt * speed;
      if (this.volleyT <= 0) {
        this.volleyT = 3.5;
        const from = this.center();
        const to = this.toPlayer().normalize();
        const base = Math.atan2(to.x, to.z);
        const gi = Math.floor(Math.random() * 4);
        for (let i = 0; i < 4; i++) {
          const ang = base + (i - 1.5) * 0.3;
          const glow = i === gi;
          this.shoot(glow ? 'shell_glow' : 'shell_dark', from, new THREE.Vector3(Math.sin(ang), to.y, Math.cos(ang)), glow ? 9 : 12, 4, { deflectable: glow, life: 6, radius: 0.5 });
        }
      }
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = ph === 3 ? 9 : 12;
        if (this.aliveMinions() < 5) {
          const type = ph === 3 ? 'whirlwind' : 'soulMinion';
          for (let i = 0; i < (ph === 3 ? 1 : 2); i++) {
            const ang = Math.random() * Math.PI * 2;
            const m = this.spawnMinion(type, A.x + Math.cos(ang) * 10, type === 'whirlwind' ? A.y + 1.05 : A.y + 4, A.z + Math.sin(ang) * 10);
            if (type === 'whirlwind') m.life = 14;
          }
        }
      }
    }
    if (ph === 3) {
      this.ringT -= dt;
      if (this.ringT <= 0) {
        this.ringT = 5;
        const from = this.center();
        for (let i = 0; i < 10; i++) {
          const ang = (i / 10) * Math.PI * 2 + this.t;
          this.shoot('fireball', from, new THREE.Vector3(Math.sin(ang), -0.25, Math.cos(ang)), 8, 4, { life: 5 });
        }
        this.game.audio.sfx('boom');
      }
    }
    // visuals
    for (const o of this.orbit) {
      o.a += dt * o.sp * (ph === 3 ? 2 : 1);
      o.m.position.set(Math.cos(o.a) * o.r, o.y, Math.sin(o.a) * o.r);
      o.m.rotation.y = o.a;
    }
    const pulse = 0.6 + Math.sin(this.t * 6) * 0.4;
    const col = ph === 1 ? [0.5, 0.95, 1] : ph === 2 ? [0.7, 0.55, 1] : [1, 0.6, 0.35];
    this.coreMat.emissive.setRGB(col[0] * pulse, col[1] * pulse, col[2] * pulse);
    this.coreMat.userData.baseEmissive.copy(this.coreMat.emissive);
    this.core.rotation.y += dt;
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.object.rotation.y = this.yaw;
  }
}
