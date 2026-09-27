// Whirlwind King (400 HP), the monument of the Trial Chamber. Only Wind
// Charges hurt him - they appear on the vaults along the walls. He summons
// whirlwinds that throw the player around and fires a telegraphed gust ring.
import * as THREE from 'three';
import { Boss } from './base.js';
import { t } from '../i18n/index.js';

export class WhirlwindKing extends Boss {
  constructor(game, arena) {
    super(game, 'whirlwindKing', arena, 400);
    this.phaseCount = 2;
    this.box = { hw: 1.3, h: 4.2 };
    this.defaultHint = 'boss.hint.windOnly';
    this.hint = this.defaultHint;
    this.summonT = 6;
    this.gustT = 9;
    this.dashT = 4;
    this.target = null;
    this.pos.set(arena.x + 0.5, arena.y + 3, arena.z + 0.5);
    this.build();
  }

  build() {
    const g = this.object;
    const wind = this.mat(0xbff7ec, 0x2a8a7a, { transparent: true, opacity: 0.8 });
    const stone = this.mat(0x6a7a73, 0x10201a);
    const gold = this.mat(0xf6c667, 0x5a3a0a);
    const eyeM = this.mat(0x7fe3d2, 0x7fe3d2);
    this.rings = [];
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5 + i * 0.22, 0.14, 4, 12), wind);
      r.rotation.x = Math.PI / 2;
      r.position.y = 0.3 + i * 0.55;
      g.add(r);
      this.rings.push(r);
    }
    const head = this.cube(1.3, 1.1, 1.3, stone); head.position.y = 3.4; g.add(head);
    for (const s of [-1, 1]) { const e = this.cube(0.25, 0.25, 0.1, eyeM); e.position.set(s * 0.3, 3.5, 0.66); g.add(e); }
    for (let i = 0; i < 4; i++) {
      const sp = this.cube(0.25, 0.5, 0.25, gold);
      sp.position.set(i < 2 ? -0.45 : 0.45, 4.15, i % 2 ? -0.45 : 0.45);
      g.add(sp);
    }
    for (const s of [-1, 1]) {
      const arm = this.cube(0.35, 1.4, 0.35, stone);
      arm.position.set(s * 1.1, 2.4, 0);
      arm.rotation.z = s * 0.5;
      g.add(arm);
    }
  }

  onPlayerHit() { this.setHint('boss.hint.windOnly', 2.5); this.game.audio.sfx('deflect'); }

  onProjectile(proj) {
    if (proj.owner === 'player' && proj.kind === 'wind') this.hurt(40, 'wind');
    else this.setHint('boss.hint.windOnly', 2.5);
  }

  onDamaged() {
    if (this.phase === 1 && this.hp <= this.maxHp / 2) {
      this.phase = 2;
      this.game.ui.hud.titleCard(this.name, t('boss.phase', { n: 2 }));
      this.game.audio.sfx('roar');
    }
    // knocked back a little by each gust hit
    this.dashT = Math.max(this.dashT, 1);
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena;
    const p = this.player.pos;
    const angry = this.phase === 2;
    // glide between points around the chamber
    this.dashT -= dt;
    if (this.dashT <= 0 || !this.target) {
      this.dashT = angry ? 3 : 4.5;
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 10;
      this.target = new THREE.Vector3(A.x + 0.5 + Math.cos(a) * r, A.y + 2 + Math.random() * 2, A.z + 0.5 + Math.sin(a) * r);
    }
    const to = this.target.clone().sub(this.pos);
    const d = to.length();
    if (d > 0.1) this.pos.addScaledVector(to.normalize(), Math.min(d, (angry ? 6 : 4.5) * dt));
    // whirlwinds
    this.summonT -= dt;
    if (this.summonT <= 0) {
      this.summonT = angry ? 7 : 10;
      if (this.aliveMinions() < (angry ? 4 : 3)) {
        const a = Math.random() * Math.PI * 2;
        const w = this.spawnMinion('whirlwind', A.x + 0.5 + Math.cos(a) * 12, A.y + 1.05, A.z + 0.5 + Math.sin(a) * 12);
        w.life = 16;
      }
    }
    // gust ring: telegraphed, then pushes the player away
    this.gustT -= dt;
    if (this.gustT <= 0) {
      this.gustT = angry ? 7 : 10;
      const cx = this.pos.x, cz = this.pos.z;
      this.game.audio.sfx('warn');
      this.warn(cx, A.y + 1, cz, 7, 1.4, () => {
        const pd = Math.hypot(p.x - cx, p.z - cz);
        if (pd < 7 && Math.abs(p.y - (A.y + 1)) < 3) {
          const dir = new THREE.Vector3(p.x - cx, 0, p.z - cz).normalize();
          this.player.knock.set(dir.x * 12, 9, dir.z * 12);
          this.game.damagePlayer(3, 'boss', this.name, null);
        }
        this.game.audio.sfx('wind');
        this.game.entities.particles.emit(cx, A.y + 1.5, cz, 0.75, 0.97, 0.93, 40, 12, 0.6, false);
      }, 0x7fe3d2);
    }
    this.yaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.object.rotation.y = this.yaw;
    this.rings.forEach((r, i) => { r.rotation.z += dt * (3 + i); r.position.x = Math.sin(this.t * 3 + i) * 0.12; });
    if (Math.random() < dt * 25) this.game.entities.particles.emit(this.pos.x, this.pos.y + Math.random() * 3, this.pos.z, 0.75, 0.97, 0.93, 1, 3, 0.4, false);
  }
}
