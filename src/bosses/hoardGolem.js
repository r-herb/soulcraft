// Hoard Golem (380 HP): the Treasure Quest's final guardian, a walking pile
// of gold. Throws fans of coins, slams the ground (red ring), and charges
// across the arena after a clear wind-up - dodge the charge and it crashes,
// exposing its core to double damage. Summons coin mimics in phase 2.
import * as THREE from 'three';
import { Boss } from './base.js';
import { t } from '../i18n/index.js';

export class HoardGolem extends Boss {
  constructor(game, arena) {
    super(game, 'hoardGolem', arena, 380);
    this.questBoss = true;
    this.phaseCount = 2;
    this.box = { hw: 1.4, h: 3.8 };
    this.state = 'walk';
    this.stateT = 0;
    this.coinT = 3;
    this.slamT = 5;
    this.chargeT = 8;
    this.mimicT = 6;
    this.walk = 0;
    this.pos.set(arena.x + 8.5, arena.y + 1, arena.z + 0.5);
    this.build();
  }

  build() {
    const g = this.object;
    const gold = this.mat(0xf0c23a, 0x5a3a0a);
    const dark = this.mat(0xa8781c, 0x2a1a04);
    this.coreMat = this.mat(0x7ff3ff, 0x1f9fb8);
    const eye = this.mat(0xfff08a, 0xffd65c);
    this.body = new THREE.Group();
    g.add(this.body);
    const torso = this.cube(2.4, 2, 1.6, gold); torso.position.y = 2.2; this.body.add(torso);
    for (let i = 0; i < 6; i++) { const c = this.cube(0.5, 0.2, 0.5, dark); c.position.set(-0.8 + (i % 3) * 0.8, 3.25, -0.4 + Math.floor(i / 3) * 0.8); this.body.add(c); }
    this.core = this.cube(0.8, 0.8, 0.3, this.coreMat); this.core.position.set(0, 2.3, 0.82); this.body.add(this.core);
    const head = this.cube(1.2, 0.9, 1.1, gold); head.position.y = 3.75; this.body.add(head);
    for (const s of [-1, 1]) { const e = this.cube(0.28, 0.16, 0.1, eye); e.position.set(s * 0.28, 3.85, 0.57); this.body.add(e); }
    const crown = this.cube(1.3, 0.3, 1.2, dark); crown.position.y = 4.3; this.body.add(crown);
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 1.55, 3, 0);
      const a = this.cube(0.8, 2.2, 0.8, dark); a.position.y = -1.1; pivot.add(a);
      const fist = this.cube(1, 0.9, 1, gold); fist.position.y = -2.3; pivot.add(fist);
      this.body.add(pivot); this.arms.push(pivot);
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.65, 1.3, 0);
      const l = this.cube(0.9, 1.3, 0.9, dark); l.position.y = -0.65; pivot.add(l);
      g.add(pivot); this.legs.push(pivot);
    }
  }

  onPlayerHit(dmg, via) { this.hurt(this.state === 'stunned' ? dmg * 2 : dmg, via); }
  onProjectile(proj) { if (proj.owner === 'player') this.hurt(this.state === 'stunned' ? proj.damageAmt * 2 : proj.damageAmt, proj.kind); }

  onDamaged() {
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.game.ui.hud.titleCard(this.name, t('boss.phase', { n: 2 }));
      this.game.audio.sfx('roar');
    }
  }

  clampToArena() {
    const A = this.arena;
    const d = Math.hypot(this.pos.x - A.x, this.pos.z - A.z);
    const max = A.r - 2;
    if (d > max) { this.pos.x = A.x + (this.pos.x - A.x) * max / d; this.pos.z = A.z + (this.pos.z - A.z) * max / d; return true; }
    return false;
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena, p = this.player.pos;
    const angry = this.phase === 2;
    this.stateT += dt;
    const to = this.toPlayer();
    const dist = Math.hypot(to.x, to.z);
    if (this.state !== 'charge' && this.state !== 'stunned') this.yaw = Math.atan2(to.x, to.z);

    if (this.state === 'walk') {
      if (dist > 3) {
        const sp = angry ? 2.8 : 2.2;
        this.pos.x += (to.x / dist) * sp * dt; this.pos.z += (to.z / dist) * sp * dt;
        this.walk += dt * 4;
      }
      this.clampToArena();
      this.coinT -= dt; this.slamT -= dt; this.chargeT -= dt; this.mimicT -= dt;
      if (this.chargeT <= 0 && dist > 5) {
        this.state = 'windup'; this.stateT = 0;
        this.chargeTo = new THREE.Vector3(p.x, A.y + 1, p.z);
        this.warn(p.x, A.y + 1, p.z, 2.5, 1.3, null, 0xffd65c);
        this.setHint('boss.hint.charge', 2.5);
        this.game.audio.sfx('warn');
      } else if (this.slamT <= 0 && dist < 6) {
        this.state = 'slamup'; this.stateT = 0;
        this.slamAt = new THREE.Vector3(this.pos.x + (to.x / (dist || 1)) * 2, A.y + 1, this.pos.z + (to.z / (dist || 1)) * 2);
        this.warn(this.slamAt.x, this.slamAt.y, this.slamAt.z, 3.8, 1.1);
        this.game.audio.sfx('warn');
      } else if (this.coinT <= 0) {
        this.coinT = angry ? 2.6 : 3.6;
        const from = this.center().add(new THREE.Vector3(0, 0.8, 0));
        const n = angry ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = this.yaw + (i - (n - 1) / 2) * 0.22;
          this.shoot('coin', from, new THREE.Vector3(Math.sin(a), 0.25, Math.cos(a)), 11, 3, { gravity: 9, life: 4 });
        }
        this.game.audio.sfx('shoot');
      } else if (angry && this.mimicT <= 0) {
        this.mimicT = 15;
        if (this.aliveMinions() < 3) for (const s of [-1, 1]) this.spawnMinion('mimic', this.pos.x + s * 2.5, A.y + 1.05, this.pos.z);
      }
    } else if (this.state === 'windup') {
      for (const a of this.arms) a.rotation.x = -0.6;
      this.body.rotation.x = 0.25;
      if (this.stateT >= 1.3) { this.state = 'charge'; this.stateT = 0; this.game.audio.sfx('roar'); }
    } else if (this.state === 'charge') {
      const d = this.chargeTo.clone().sub(this.pos).setY(0);
      const len = d.length();
      this.yaw = Math.atan2(d.x, d.z);
      const step = Math.min(len, (angry ? 16 : 13) * dt);
      if (len > 0.01) this.pos.addScaledVector(d.normalize(), step);
      // run the player over
      if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < 1.9 && Math.abs(p.y - this.pos.y) < 2 && !this.hitThisCharge) {
        this.hitThisCharge = true;
        this.game.damagePlayer(angry ? 8 : 6, 'boss', this.name, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
      }
      const wall = this.clampToArena();
      if (len < 0.2 || wall || this.stateT > 2) {
        // overshoot into a crash: stunned, core exposed
        this.state = 'stunned'; this.stateT = 0; this.hitThisCharge = false;
        this.game.audio.sfx('boom');
        this.game.entities.particles.emit(this.pos.x, this.pos.y + 1, this.pos.z, 1, 0.85, 0.3, 30, 6, 0.8);
        this.setHint('boss.hint.core', 3);
      }
    } else if (this.state === 'stunned') {
      this.body.rotation.x = 0.5;
      this.core.scale.setScalar(1.3 + Math.sin(this.t * 12) * 0.15);
      if (this.stateT > (angry ? 2.5 : 3.2)) { this.state = 'walk'; this.stateT = 0; this.chargeT = angry ? 7 : 9; this.body.rotation.x = 0; this.core.scale.setScalar(1); }
    } else if (this.state === 'slamup') {
      for (const a of this.arms) a.rotation.x = -2.6 * Math.min(1, this.stateT / 1.1);
      if (this.stateT >= 1.1) {
        this.state = 'slam'; this.stateT = 0;
        this.blast(this.slamAt.x, this.slamAt.y, this.slamAt.z, 3.8, angry ? 8 : 6);
        this.game.vibrate(60);
      }
    } else if (this.state === 'slam') {
      for (const a of this.arms) a.rotation.x = -2.6 + Math.min(1, this.stateT / 0.15) * 2.6;
      if (this.stateT > 1) { this.state = 'walk'; this.stateT = 0; this.slamT = angry ? 4 : 5.5; }
    }
    if (this.state === 'walk') {
      const s = Math.sin(this.walk) * 0.5;
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
      this.arms[0].rotation.x = -s * 0.4; this.arms[1].rotation.x = s * 0.4;
      this.body.rotation.x = 0;
    }
    const glow = this.state === 'stunned' ? 1 : 0.35 + Math.sin(this.t * 3) * 0.15;
    this.coreMat.emissive.setRGB(0.25 * glow, 0.9 * glow, 1 * glow);
    this.coreMat.userData.baseEmissive.copy(this.coreMat.emissive);
    this.object.rotation.y = this.yaw;
  }
}
