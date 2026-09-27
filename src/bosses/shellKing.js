// Shell King (300 HP): hovers in the middle of his arena throwing shells.
// Dark shells must be dodged; glowing shells can be hit back (tap attack
// when they are close) and stun him. While stunned he takes full melee damage;
// otherwise his shell turns most of it away. Summons soul minions.
import * as THREE from 'three';
import { Boss } from './base.js';
import { t } from '../i18n/index.js';

export class ShellKing extends Boss {
  constructor(game, arena) {
    super(game, 'shellKing', arena, 300);
    this.phaseCount = 2;
    this.volleyT = 3;
    this.minionT = 12;
    this.stunT = 0;
    this.box = { hw: 1.5, h: 3 };
    this.defaultHint = 'boss.hint.hitBack';
    this.hint = this.defaultHint;
    this.hover = 3;
    this.build();
  }

  build() {
    const shell = this.mat(0x2e2a68, 0x0e0c2b);
    const rim = this.mat(0x7ff3ff, 0x1f9fb8);
    const skin = this.mat(0xcfe6f0, 0x1a2a33);
    const crown = this.mat(0xf6c667, 0x5a3a0a);
    const g = this.object;
    // stacked shell dome
    const layers = [[3.2, 0.8], [2.6, 0.7], [1.9, 0.6], [1.1, 0.5]];
    let y = 0.6;
    for (const [w, h] of layers) { const m = this.cube(w, h, w, shell); m.position.y = y + h / 2; g.add(m); y += h; }
    const band = this.cube(3.35, 0.25, 3.35, rim); band.position.y = 0.9; g.add(band);
    // face peeking out at the front
    const face = this.cube(1.4, 0.9, 0.6, skin); face.position.set(0, 1.2, 1.5); g.add(face);
    const eyeM = this.mat(0x05040f, 0x000000);
    for (const s of [-1, 1]) { const e = this.cube(0.22, 0.22, 0.1, eyeM); e.position.set(s * 0.35, 1.35, 1.82); g.add(e); }
    // crown
    for (let i = 0; i < 5; i++) {
      const sp = this.cube(0.22, 0.6, 0.22, crown);
      const a = (i / 5) * Math.PI * 2;
      sp.position.set(Math.cos(a) * 0.45, y + 0.3, Math.sin(a) * 0.45);
      g.add(sp);
    }
    // little legs
    this.legs = [];
    for (let i = 0; i < 4; i++) {
      const l = this.cube(0.35, 0.8, 0.35, skin);
      l.position.set(i < 2 ? -1 : 1, 0.2, i % 2 ? -1 : 1);
      g.add(l);
      this.legs.push(l);
    }
    this.rimMat = rim;
  }

  onPlayerHit(dmg, via) {
    if (this.stunT > 0) this.hurt(dmg, via);
    else { this.hurt(Math.max(1, Math.floor(dmg * 0.15)), via); this.setHint('boss.hint.hitBack', 2); }
  }

  onProjectile(proj) {
    if (proj.owner !== 'player') return;
    if (proj.deflected) {
      this.hurt(28, 'deflect');
      this.stunT = 2.5;
      this.game.audio.sfx('roar');
    } else this.hurt(Math.max(1, Math.floor(proj.damageAmt * (this.stunT > 0 ? 1 : 0.35))), proj.kind);
  }

  onDamaged() {
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.game.ui.hud.titleCard(this.name, t('boss.phase', { n: 2 }));
      this.game.audio.sfx('roar');
    }
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena;
    const p = this.player.pos;
    const angry = this.phase === 2;
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.hover += (0.1 - this.hover) * Math.min(1, dt * 4);
      this.object.rotation.z = Math.sin(this.t * 10) * 0.08;
    } else {
      this.hover += (3 - this.hover) * Math.min(1, dt * 2);
      this.object.rotation.z = 0;
      // slow drift around the centre
      const a = this.t * 0.25;
      const tx = A.x + 0.5 + Math.cos(a) * 5, tz = A.z + 0.5 + Math.sin(a) * 5;
      this.pos.x += (tx - this.pos.x) * Math.min(1, dt);
      this.pos.z += (tz - this.pos.z) * Math.min(1, dt);
      this.volleyT -= dt;
      if (this.volleyT <= 0) {
        this.volleyT = angry ? 2.2 : 3;
        this.volley(angry);
      }
      this.minionT -= dt;
      if (this.minionT <= 0) {
        this.minionT = angry ? 14 : 20;
        if (this.aliveMinions() < 4) {
          for (let i = 0; i < (angry ? 3 : 2); i++) {
            const a2 = Math.random() * Math.PI * 2;
            this.spawnMinion('soulMinion', this.pos.x + Math.cos(a2) * 3, this.pos.y + 2, this.pos.z + Math.sin(a2) * 3);
          }
        }
      }
    }
    this.pos.y = A.y + 1 + this.hover;
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.object.rotation.y = this.yaw;
    const glow = 0.3 + Math.max(0, Math.sin(this.t * 3)) * 0.5;
    this.rimMat.emissive.setRGB(0.12 * glow, 0.62 * glow, 0.72 * glow);
    this.rimMat.userData.baseEmissive.copy(this.rimMat.emissive);
    this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 5 + i) * 0.4; });
  }

  // Fan of shells toward the player: most are dark, some glowing.
  volley(angry) {
    const n = angry ? 5 : 3;
    const from = this.center();
    const to = this.toPlayer().normalize();
    const base = Math.atan2(to.x, to.z);
    const glowIdx = Math.floor(Math.random() * n);
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * 0.28;
      const dir = new THREE.Vector3(Math.sin(a), to.y, Math.cos(a));
      const glowing = i === glowIdx || (angry && Math.random() < 0.15);
      this.shoot(glowing ? 'shell_glow' : 'shell_dark', from, dir, glowing ? 9 : 12, glowing ? 3 : 4, { deflectable: glowing, life: 6, radius: 0.5 });
    }
    this.game.audio.sfx('shoot');
  }
}
