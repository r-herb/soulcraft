// Frost Warden (420 HP): the guardian of the Frozen Spire, a hulking knight
// of ice. Fires fans of ice shards, freezes the ground in rings around the
// player, and leaps across the arena: dodge the landing ring and its feet
// stay frozen in place for a moment, taking double damage. Calls frost
// spirits in phase 2.
import * as THREE from 'three';
import { Boss } from './base.js';
import { t } from '../i18n/index.js';

export class FrostWarden extends Boss {
  constructor(game, arena) {
    super(game, 'frostWarden', arena, 420);
    this.questBoss = true;
    this.phaseCount = 2;
    this.box = { hw: 1.2, h: 3.6 };
    this.state = 'walk';
    this.stateT = 0;
    this.shardT = 2.5;
    this.ringT = 5;
    this.leapT = 7;
    this.spiritT = 4;
    this.walk = 0;
    this.pos.set(arena.x + 8.5, arena.y + 1, arena.z + 0.5);
    this.build();
  }

  build() {
    const g = this.object;
    const ice = this.mat(0xbfe6f5, 0x2a5a78);
    const deep = this.mat(0x5f89a6, 0x10263a);
    this.coreMat = this.mat(0xb98bff, 0x6d45d6);
    const eye = this.mat(0xe6fbff, 0x9af6ff);
    this.body = new THREE.Group();
    g.add(this.body);
    const torso = this.cube(2, 1.8, 1.3, ice); torso.position.y = 2.2; this.body.add(torso);
    this.core = this.cube(0.6, 0.6, 0.25, this.coreMat); this.core.position.set(0, 2.3, 0.68); this.body.add(this.core);
    for (const s of [-1, 1]) { const sp = this.cube(0.5, 0.9, 0.5, deep); sp.position.set(s * 1.1, 3.3, 0); sp.rotation.z = s * -0.4; this.body.add(sp); }
    const head = this.cube(1, 0.9, 1, ice); head.position.y = 3.55; this.body.add(head);
    for (const s of [-1, 1]) { const e = this.cube(0.24, 0.12, 0.1, eye); e.position.set(s * 0.24, 3.6, 0.52); this.body.add(e); }
    for (let i = 0; i < 3; i++) { const c = this.cube(0.22, 0.5 + (i === 1 ? 0.3 : 0), 0.22, eye); c.position.set(-0.35 + i * 0.35, 4.2 + (i === 1 ? 0.15 : 0), 0); this.body.add(c); }
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 1.3, 2.9, 0);
      const a = this.cube(0.6, 1.9, 0.6, deep); a.position.y = -0.95; pivot.add(a);
      const blade = this.cube(0.2, 1.4, 0.5, eye); blade.position.set(0, -2.3, 0.1); pivot.add(blade);
      this.body.add(pivot); this.arms.push(pivot);
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.55, 1.3, 0);
      const l = this.cube(0.75, 1.3, 0.75, deep); l.position.y = -0.65; pivot.add(l);
      g.add(pivot); this.legs.push(pivot);
    }
    // ice that holds its feet after a missed leap
    this.frozen = this.cube(2.6, 0.9, 2, this.mat(0xe6fbff, 0x5fb8e0));
    this.frozen.material.transparent = true; this.frozen.material.opacity = 0.7;
    this.frozen.position.y = 0.45; this.frozen.visible = false;
    g.add(this.frozen);
  }

  onPlayerHit(dmg, via) { this.hurt(this.state === 'stuck' ? dmg * 2 : dmg, via); }
  onProjectile(proj) { if (proj.owner === 'player') this.hurt(this.state === 'stuck' ? proj.damageAmt * 2 : proj.damageAmt, proj.kind); }

  onDamaged() {
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.game.ui.hud.titleCard(this.name, t('boss.phase', { n: 2 }));
      this.game.audio.sfx('roar');
    }
  }

  clampToArena(pos = this.pos) {
    const A = this.arena;
    const d = Math.hypot(pos.x - A.x, pos.z - A.z);
    const max = A.r - 2;
    if (d > max) { pos.x = A.x + (pos.x - A.x) * max / d; pos.z = A.z + (pos.z - A.z) * max / d; }
    return pos;
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena, p = this.player.pos;
    const angry = this.phase === 2;
    this.stateT += dt;
    const to = this.toPlayer();
    const dist = Math.hypot(to.x, to.z);
    if (this.state !== 'stuck') this.yaw = Math.atan2(to.x, to.z);

    if (this.state === 'walk') {
      if (dist > 5) {
        const sp = angry ? 2.6 : 2;
        this.pos.x += (to.x / dist) * sp * dt; this.pos.z += (to.z / dist) * sp * dt;
        this.walk += dt * 4;
      }
      this.clampToArena();
      this.shardT -= dt; this.ringT -= dt; this.leapT -= dt; this.spiritT -= dt;
      if (this.leapT <= 0) {
        this.state = 'crouch'; this.stateT = 0;
        this.leapTo = this.clampToArena(new THREE.Vector3(p.x, A.y + 1, p.z));
        this.leapFrom = this.pos.clone();
        this.warn(this.leapTo.x, this.leapTo.y, this.leapTo.z, 4, 1.8, null, 0x9af6ff);
        this.setHint('boss.hint.leap', 2.5);
        this.game.audio.sfx('warn');
      } else if (this.ringT <= 0) {
        this.ringT = angry ? 4.5 : 6;
        const n = angry ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.t;
          const rx = i === 0 ? p.x : p.x + Math.cos(a) * 4, rz = i === 0 ? p.z : p.z + Math.sin(a) * 4;
          const c = this.clampToArena(new THREE.Vector3(rx, A.y + 1, rz));
          this.warn(c.x, c.y, c.z, 2.2, 1.2, () => this.blast(c.x, c.y, c.z, 2.2, angry ? 6 : 5), 0x5fb8e0);
        }
        this.game.audio.sfx('warn');
      } else if (this.shardT <= 0) {
        this.shardT = angry ? 2.2 : 3.2;
        const from = this.center().add(new THREE.Vector3(0, 0.6, 0));
        const n = angry ? 7 : 5;
        for (let i = 0; i < n; i++) {
          const a = this.yaw + (i - (n - 1) / 2) * 0.2;
          this.shoot('frost', from, new THREE.Vector3(Math.sin(a), -0.05, Math.cos(a)), 14, 3, { gravity: 0, life: 3 });
        }
        this.game.audio.sfx('shoot');
      } else if (angry && this.spiritT <= 0) {
        this.spiritT = 15;
        if (this.aliveMinions() < 3) for (const s of [-1, 1]) this.spawnMinion('frostSpirit', this.pos.x + s * 2.5, A.y + 2.5, this.pos.z);
      }
    } else if (this.state === 'crouch') {
      this.body.position.y = -0.4 * Math.min(1, this.stateT / 0.6);
      for (const a of this.arms) a.rotation.x = 0.8;
      if (this.stateT >= 0.8) { this.state = 'leap'; this.stateT = 0; this.game.audio.sfx('wind'); }
    } else if (this.state === 'leap') {
      const k = Math.min(1, this.stateT / 1);
      this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
      this.pos.y = A.y + 1 + Math.sin(k * Math.PI) * 7;
      this.body.position.y = 0;
      if (k >= 1) {
        this.pos.y = A.y + 1;
        this.blast(this.leapTo.x, this.leapTo.y, this.leapTo.z, 4, angry ? 9 : 7);
        this.game.vibrate(60);
        this.game.entities.particles.emit(this.pos.x, this.pos.y + 0.5, this.pos.z, 0.9, 1, 1, 40, 7, 0.9);
        // it crashed down where the player no longer is: frozen in place
        this.state = 'stuck'; this.stateT = 0;
        this.frozen.visible = true;
        this.setHint('boss.hint.frozen', 3);
      }
    } else if (this.state === 'stuck') {
      this.core.scale.setScalar(1.3 + Math.sin(this.t * 12) * 0.15);
      for (const a of this.arms) a.rotation.x = 0.3;
      if (this.stateT > (angry ? 2.6 : 3.2)) {
        this.state = 'walk'; this.stateT = 0; this.leapT = angry ? 7 : 9;
        this.frozen.visible = false; this.core.scale.setScalar(1);
        this.game.entities.particles.emit(this.pos.x, this.pos.y + 0.5, this.pos.z, 0.9, 1, 1, 20, 4, 0.6);
      }
    }
    if (this.state === 'walk') {
      const s = Math.sin(this.walk) * 0.5;
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
      this.arms[0].rotation.x = -s * 0.4; this.arms[1].rotation.x = s * 0.4;
      this.body.position.y = 0;
    }
    const glow = this.state === 'stuck' ? 1 : 0.4 + Math.sin(this.t * 3) * 0.15;
    this.coreMat.emissive.setRGB(0.6 * glow, 0.4 * glow, 1 * glow);
    this.coreMat.userData.baseEmissive.copy(this.coreMat.emissive);
    this.object.rotation.y = this.yaw;
  }
}
