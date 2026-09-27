// Ember Warden (500 HP): a walking furnace in the Emberdeep. Raises its arms
// before a ground slam (red ring), throws fireball fans, summons fire
// spirits. Emberite and gold blades bite deep (an Emberite hit is ~8
// hearts); other weapons only do half damage.
import * as THREE from 'three';
import { Boss } from './base.js';
import { ITEMS } from '../player/items.js';
import { t } from '../i18n/index.js';

export class EmberWarden extends Boss {
  constructor(game, arena) {
    super(game, 'emberWarden', arena, 500);
    this.emberWarden = true;
    this.phaseCount = 2;
    this.box = { hw: 1.3, h: 4 };
    this.state = 'walk';
    this.stateT = 0;
    this.slamT = 4;
    this.fireT = 5;
    this.spiritT = 14;
    this.walk = 0;
    this.pos.set(arena.x + 0.5, arena.y + 1, arena.z + 0.5);
    this.build();
  }

  build() {
    const g = this.object;
    const rock = this.mat(0x3a2a2a, 0x1a0500);
    const ember = this.mat(0xff7a2e, 0xc8411c);
    const hot = this.mat(0xffd08a, 0xff9a3c);
    this.body = new THREE.Group();
    g.add(this.body);
    const torso = this.cube(2.2, 1.8, 1.4, rock); torso.position.y = 2.3; this.body.add(torso);
    const core = this.cube(0.9, 0.9, 0.2, hot); core.position.set(0, 2.4, 0.72); this.body.add(core);
    const head = this.cube(1.1, 0.9, 1, rock); head.position.y = 3.65; this.body.add(head);
    for (const s of [-1, 1]) { const e = this.cube(0.25, 0.15, 0.1, hot); e.position.set(s * 0.25, 3.7, 0.52); this.body.add(e); }
    const flame = this.cube(0.8, 0.5, 0.8, ember); flame.position.y = 4.35; this.body.add(flame);
    this.flame = flame;
    this.arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 1.4, 3, 0);
      const a = this.cube(0.7, 2, 0.7, rock); a.position.y = -1; pivot.add(a);
      const fist = this.cube(0.9, 0.8, 0.9, ember); fist.position.y = -2.1; pivot.add(fist);
      this.body.add(pivot);
      this.arms.push(pivot);
    }
    this.legs = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.6, 1.4, 0);
      const l = this.cube(0.8, 1.4, 0.8, rock); l.position.y = -0.7; pivot.add(l);
      g.add(pivot);
      this.legs.push(pivot);
    }
  }

  // Blade bonus handled by game.meleeDamage (emberBonus); everything else
  // is halved.
  onPlayerHit(dmg, via) {
    const h = this.game.inventory.held;
    const def = h && ITEMS[h.item];
    if (!(def && def.emberBonus)) dmg = Math.max(1, Math.floor(dmg * 0.5));
    this.hurt(dmg, via);
  }
  onProjectile(proj) { if (proj.owner === 'player') this.hurt(Math.max(1, Math.floor(proj.damageAmt * 0.5)), proj.kind); }

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
    this.stateT += dt;
    const to = this.toPlayer();
    const dist = Math.hypot(to.x, to.z);
    this.yaw = Math.atan2(to.x, to.z);
    if (this.state === 'walk') {
      if (dist > 2.5) {
        const sp = angry ? 2.6 : 2;
        this.pos.x += (to.x / dist) * sp * dt;
        this.pos.z += (to.z / dist) * sp * dt;
        this.walk += dt * 4;
      }
      // stay on the platform
      const cd = Math.hypot(this.pos.x - A.x, this.pos.z - A.z);
      if (cd > A.r - 2) { this.pos.x = A.x + (this.pos.x - A.x) * (A.r - 2) / cd; this.pos.z = A.z + (this.pos.z - A.z) * (A.r - 2) / cd; }
      this.slamT -= dt; this.fireT -= dt; this.spiritT -= dt;
      if (this.slamT <= 0 && dist < 7) {
        this.state = 'windup'; this.stateT = 0;
        this.slamAt = new THREE.Vector3(this.pos.x + (to.x / (dist || 1)) * 2, A.y + 1, this.pos.z + (to.z / (dist || 1)) * 2);
        this.warn(this.slamAt.x, this.slamAt.y, this.slamAt.z, 3.8, 1.1);
        this.game.audio.sfx('warn');
      } else if (this.fireT <= 0) {
        this.fireT = angry ? 3.2 : 4.5;
        const from = this.center().add(new THREE.Vector3(0, 0.6, 0));
        const n = angry ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = this.yaw + (i - (n - 1) / 2) * 0.3;
          const dir = new THREE.Vector3(Math.sin(a), (p.y + 1 - from.y) / Math.max(4, dist), Math.cos(a));
          this.shoot('fireball', from, dir, 10, 4, { life: 5 });
        }
        this.game.audio.sfx('shoot');
      } else if (this.spiritT <= 0) {
        this.spiritT = angry ? 12 : 18;
        if (this.aliveMinions() < 4) for (let i = 0; i < 2; i++) this.spawnMinion('fireSpirit', this.pos.x + (i ? 2 : -2), this.pos.y + 3, this.pos.z);
      }
    } else if (this.state === 'windup') {
      const k = Math.min(1, this.stateT / 1.1);
      for (const a of this.arms) a.rotation.x = -2.6 * k;
      if (this.stateT >= 1.1) {
        this.state = 'slam'; this.stateT = 0;
        this.blast(this.slamAt.x, this.slamAt.y, this.slamAt.z, 3.8, angry ? 9 : 7);
        this.game.vibrate(60);
      }
    } else if (this.state === 'slam') {
      for (const a of this.arms) a.rotation.x = -2.6 + Math.min(1, this.stateT / 0.15) * 2.6;
      if (this.stateT > 1.2) { this.state = 'walk'; this.stateT = 0; this.slamT = angry ? 3 : 4.5; }
    }
    if (this.state === 'walk') {
      const s = Math.sin(this.walk) * 0.5;
      this.legs[0].rotation.x = s; this.legs[1].rotation.x = -s;
      this.arms[0].rotation.x = -s * 0.5; this.arms[1].rotation.x = s * 0.5;
    }
    this.flame.scale.y = 1 + Math.sin(this.t * 12) * 0.25;
    this.flame.position.y = 4.35 + Math.sin(this.t * 12) * 0.06;
    this.object.rotation.y = this.yaw;
    if (Math.random() < dt * 10) this.game.entities.particles.emit(this.pos.x, this.pos.y + 4.6, this.pos.z, 1, 0.6, 0.2, 1, 1.2, 0.6, false);
  }
}
