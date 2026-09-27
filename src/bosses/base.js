// Shared boss behaviour: health, hit boxes, damage flashes, telegraphed
// ground warnings and helpers for aiming at the player.
import * as THREE from 'three';

const tmp = new THREE.Vector3();

export class Boss {
  constructor(game, id, arena, maxHp) {
    this.game = game;
    this.id = id;
    this.arena = arena;
    this.isBoss = true;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.phase = 1;
    this.phaseCount = 1;
    this.showBar = true;
    this.hint = null;
    this.hintT = 0;
    this.dead = false;
    this.pos = new THREE.Vector3(arena.x + 0.5, arena.y + 1, arena.z + 0.5);
    this.object = new THREE.Group();
    this.object.position.copy(this.pos);
    game.scene.add(this.object);
    this.flashT = 0;
    this.t = 0;
    this.effects = [];
    this.minions = [];
    this.box = { hw: 1, h: 2 }; // default hitbox around pos
    this.mats = [];
  }

  // materials that flash white when hit
  mat(color, emissive = 0x000000, opts = {}) {
    const m = new THREE.MeshLambertMaterial({ color, emissive, ...opts });
    m.userData.baseEmissive = new THREE.Color(emissive);
    this.mats.push(m);
    return m;
  }
  cube(w, h, d, m) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); }

  center() { return tmp.set(this.pos.x, this.pos.y + this.box.h / 2, this.pos.z).clone(); }
  hitboxes() { return [{ x: this.pos.x, y: this.pos.y, z: this.pos.z, hw: this.box.hw, h: this.box.h }]; }
  hitTest(p, r) {
    for (const b of this.hitboxes()) {
      if (Math.abs(p.x - b.x) < b.hw + r && Math.abs(p.z - b.z) < b.hw + r && p.y > b.y - r && p.y < b.y + b.h + r) return true;
    }
    return false;
  }

  get player() { return this.game.player; }
  toPlayer() {
    const p = this.player.pos;
    return new THREE.Vector3(p.x - this.pos.x, p.y + 1 - this.pos.y, p.z - this.pos.z);
  }
  flatDist() { const p = this.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  setHint(key, time = 3) { this.hint = key; this.hintT = time; }

  onPlayerHit(dmg, via) { this.hurt(dmg, via); }
  onProjectile(proj) { if (proj.owner === 'player') this.hurt(proj.damageAmt, proj.kind); }

  hurt(dmg, via) {
    if (this.dead || dmg <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = 0.15;
    this.game.audio.sfx('bosshit');
    this.game.vibrate(15);
    const c = this.center();
    this.game.entities.particles.emit(c.x, c.y, c.z, 1, 1, 1, 10, 4, 0.5);
    this.onDamaged(dmg, via);
    if (this.hp <= 0) { this.dead = true; this.game.bosses.onBossDefeated(this); }
  }
  onDamaged() {}

  // A red ring on the ground that fills up, then calls fn.
  warn(x, y, z, radius, time, fn, color = 0xff3355) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.25, radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    g.add(ring, fill);
    g.position.set(x, y + 0.06, z);
    this.game.scene.add(g);
    this.effects.push({ g, t: 0, time, fn, fill });
  }

  // Vertical flash column (lightning / impact) that fades.
  flashColumn(x, y, z, color = 0xb6fbff, h = 30, w = 0.6) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.set(x, y + h / 2, z);
    this.game.scene.add(m);
    this.effects.push({ g: m, t: 0, time: 0.35, fade: true });
  }

  // Damage + knockback to the player if within radius of a point.
  blast(x, y, z, radius, dmg) {
    const p = this.player.pos;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius && Math.abs(p.y - y) < 3.5) {
      const dir = new THREE.Vector3(p.x - x, 0, p.z - z).normalize();
      if (!isFinite(dir.x)) dir.set(1, 0, 0);
      this.game.damagePlayer(dmg, 'boss', this.name, dir);
    }
    this.game.entities.particles.emit(x, y + 0.5, z, 1, 0.6, 0.3, 24, 6, 0.6);
    this.game.audio.sfx('boom');
  }

  get name() { return this.game.bossName(this.id); }

  shoot(kind, from, dir, speed, dmg, extra = {}) {
    return this.game.entities.spawnProjectile({ kind, pos: from.clone(), vel: dir.clone().normalize().multiplyScalar(speed), damage: dmg, owner: 'boss', sourceName: this.name, ...extra });
  }

  spawnMinion(type, x, y, z) {
    const m = this.game.entities.spawnMob(type, x, y, z);
    m.bossMinion = true;
    m.noDrops = true;
    this.minions.push(m);
    return m;
  }
  aliveMinions() { this.minions = this.minions.filter((m) => !m.dead); return this.minions.length; }

  baseUpdate(dt) {
    this.t += dt;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hint = this.defaultHint || null; }
    // hit flash
    const f = Math.max(0, this.flashT);
    this.flashT -= dt;
    for (const m of this.mats) {
      if (f > 0) m.emissive.setRGB(0.9, 0.9, 0.9);
      else m.emissive.copy(m.userData.baseEmissive);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.fill) { const k = Math.min(1, e.t / e.time); e.fill.scale.setScalar(Math.max(0.01, k)); e.fill.material.opacity = 0.2 + k * 0.35; }
      if (e.fade) e.g.material.opacity = Math.max(0, 0.9 * (1 - e.t / e.time));
      if (e.t >= e.time) {
        this.game.scene.remove(e.g);
        e.g.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
        this.effects.splice(i, 1);
        if (e.fn && !this.dead) e.fn();
      }
    }
  }

  dispose() {
    this.game.scene.remove(this.object);
    this.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const e of this.effects) this.game.scene.remove(e.g);
    this.effects = [];
    for (const m of this.minions) if (!m.dead) { m.dead = true; }
  }

  sync() { this.object.position.copy(this.pos); }
}
