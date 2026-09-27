// Void Dragon: circles the island, spits void orbs, and dives at the player
// (telegraphed by a ring on the ground). While its void crystals stand it
// heals and shrugs off half the damage. After a dive it perches, open to
// melee.
import * as THREE from 'three';
import { Boss } from './base.js';

export class VoidDragon extends Boss {
  constructor(game, arena) {
    super(game, 'voidDragon', arena, 200);
    this.state = 'circle';
    this.stateT = 0;
    this.angle = 0;
    this.orbT = 3;
    this.diveT = 10;
    this.box = { hw: 2, h: 2.2 };
    this.defaultHint = 'boss.hint.crystals';
    this.hint = this.defaultHint;
    this.build();
    this.crystals = [];
    const A = arena;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const h = 8 + (i % 3) * 4;
      this.crystals.push(new VoidCrystal(game, Math.round(A.x + Math.cos(a) * 17) + 0.5, A.y + h + 3.2, Math.round(A.z + Math.sin(a) * 17) + 0.5, this));
    }
    this.pos.set(A.x + 20, A.y + 14, A.z);
  }

  build() {
    const body = this.mat(0x2a1f4a, 0x120a26);
    const dark = this.mat(0x17123a, 0x05030f);
    const glow = this.mat(0xb98bff, 0x9a6bff);
    const g = this.object;
    const torso = this.cube(1.6, 1.2, 3.2, body); torso.position.y = 1.1; g.add(torso);
    const neck = this.cube(0.8, 0.8, 1.6, body); neck.position.set(0, 1.5, 2.2); g.add(neck);
    const head = this.cube(1.2, 1, 1.6, dark); head.position.set(0, 1.7, 3.5); g.add(head);
    for (const s of [-1, 1]) {
      const eye = this.cube(0.2, 0.2, 0.2, glow); eye.position.set(s * 0.45, 1.9, 4.25); g.add(eye);
      const horn = this.cube(0.15, 0.6, 0.15, glow); horn.position.set(s * 0.4, 2.4, 3.1); horn.rotation.x = -0.5; g.add(horn);
    }
    this.tail = [];
    let prev = g;
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 1.1 : 0, i === 0 ? -1.6 : -0.9);
      const m = this.cube(0.8 - i * 0.15, 0.6 - i * 0.1, 0.9, i % 2 ? dark : body);
      m.position.z = -0.45;
      seg.add(m);
      prev.add(seg);
      prev = seg;
      this.tail.push(seg);
    }
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.8, 1.5, 0.3);
      const w = this.cube(3.4, 0.12, 2.2, dark);
      w.position.x = s * 1.7;
      const edge = this.cube(3.4, 0.14, 0.2, glow);
      edge.position.set(s * 1.7, 0.02, 1.05);
      pivot.add(w, edge);
      g.add(pivot);
      this.wings.push({ pivot, s });
    }
  }

  crystalsLeft() { return this.crystals.filter((c) => !c.dead).length; }

  hurt(dmg, via) {
    if (this.crystalsLeft() > 0) { dmg = Math.ceil(dmg * 0.5); this.setHint('boss.hint.crystals'); }
    if (this.state === 'perch') dmg = Math.ceil(dmg * 1.5);
    super.hurt(dmg, via);
  }

  hitboxes() {
    // body plus the head in front of it
    const fx = Math.sin(this.yaw || 0), fz = Math.cos(this.yaw || 0);
    return [
      { x: this.pos.x, y: this.pos.y, z: this.pos.z, hw: 1.6, h: 2.4 },
      { x: this.pos.x + fx * 3, y: this.pos.y + 0.8, z: this.pos.z + fz * 3, hw: 1, h: 1.6 },
    ];
  }

  update(dt) {
    this.baseUpdate(dt);
    const A = this.arena;
    const p = this.player.pos;
    this.stateT += dt;
    const left = this.crystalsLeft();
    if (left > 0 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + left * 0.35 * dt);
    if (left === 0 && this.defaultHint) { this.defaultHint = null; if (this.hint === 'boss.hint.crystals') this.hint = null; }
    let target;
    if (this.state === 'circle') {
      this.angle += dt * 0.35;
      const r = 21;
      target = new THREE.Vector3(A.x + Math.cos(this.angle) * r, A.y + 13 + Math.sin(this.t * 0.8) * 2, A.z + Math.sin(this.angle) * r);
      this.orbT -= dt;
      if (this.orbT <= 0) {
        this.orbT = 3.2 - (this.hp < this.maxHp / 2 ? 0.8 : 0);
        const from = this.center().add(new THREE.Vector3(Math.sin(this.yaw) * 3, 0.5, Math.cos(this.yaw) * 3));
        const to = new THREE.Vector3(p.x, p.y + 1, p.z);
        this.shoot('void_orb', from, to.sub(from), 11, 4, { homing: 0.6, life: 7 });
        this.game.audio.sfx('shoot');
      }
      this.diveT -= dt;
      if (this.diveT <= 0 && this.player.onGround) {
        this.state = 'windup'; this.stateT = 0;
        this.diveTarget = new THREE.Vector3(p.x, Math.floor(p.y), p.z);
        this.setHint('boss.hint.dive', 2.5);
        this.game.audio.sfx('roar');
        this.warn(this.diveTarget.x, this.diveTarget.y, this.diveTarget.z, 3.2, 1.6, null, 0xb98bff);
      }
    }
    if (this.state === 'windup') {
      target = this.pos.clone().add(new THREE.Vector3(0, dt * 4, 0));
      if (this.stateT > 1.6) { this.state = 'dive'; this.stateT = 0; }
    }
    if (this.state === 'dive') {
      target = this.diveTarget.clone().add(new THREE.Vector3(0, 0.2, 0));
      const d = this.pos.distanceTo(target);
      if (d < 1.2 || this.stateT > 2.5) {
        this.blast(this.diveTarget.x, this.diveTarget.y, this.diveTarget.z, 3.2, 7);
        this.state = 'perch'; this.stateT = 0;
        this.pos.copy(target);
      }
    }
    if (this.state === 'perch') {
      target = this.pos.clone();
      if (this.stateT > 3.5) { this.state = 'circle'; this.stateT = 0; this.diveT = 9 + Math.random() * 4; this.angle = Math.atan2(this.pos.z - A.z, this.pos.x - A.x); }
    }
    // move
    const speed = this.state === 'dive' ? 22 : this.state === 'circle' ? 9 : 4;
    const to = target.clone().sub(this.pos);
    const dist = to.length();
    if (dist > 0.01) {
      const step = Math.min(dist, speed * dt);
      this.pos.addScaledVector(to.normalize(), step);
      if (this.state !== 'perch' && this.state !== 'windup') {
        const yaw = Math.atan2(to.x, to.z);
        this.yaw = lerpAngle(this.yaw || 0, yaw, Math.min(1, dt * 4));
      }
    }
    if (this.state === 'perch' || this.state === 'windup') this.yaw = lerpAngle(this.yaw || 0, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), Math.min(1, dt * 3));
    // animate
    const flap = this.state === 'perch' ? 0.1 : Math.sin(this.t * (this.state === 'dive' ? 2 : 6)) * 0.6;
    for (const w of this.wings) w.pivot.rotation.z = w.s * flap;
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.t * 2 + i) * 0.25; });
    this.object.rotation.y = this.yaw || 0;
    this.object.rotation.x = this.state === 'dive' ? 0.5 : 0;
  }

  dispose() { super.dispose(); for (const c of this.crystals) c.dispose(); }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// A floating crystal above each pillar. One hit (arrow, spear or melee)
// shatters it.
class VoidCrystal {
  constructor(game, x, y, z, boss) {
    this.game = game;
    this.boss = boss;
    this.pos = new THREE.Vector3(x, y, z);
    this.w = 1.2; this.h = 1.4;
    this.hittable = true;
    this.dead = false;
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshLambertMaterial({ color: 0xd7b8ff, emissive: 0x8c5cf0 }));
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    // beam to the dragon
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 1), new THREE.MeshBasicMaterial({ color: 0xb98bff, transparent: true, opacity: 0.5 }));
    game.scene.add(this.beam);
    this.t = Math.random() * 6;
    game.entities.add(this);
  }
  get isCrystal() { return true; }
  damage() { this.shatter(); return true; }
  shatter() {
    if (this.dead) return;
    this.dead = true;
    this.game.audio.sfx('break');
    this.game.entities.particles.emit(this.pos.x, this.pos.y, this.pos.z, 0.8, 0.6, 1, 30, 6, 0.9);
  }
  update(dt) {
    this.t += dt;
    this.mesh.rotation.y += dt * 1.5;
    this.mesh.position.y = this.pos.y + 0.7 + Math.sin(this.t * 2) * 0.2;
    const b = this.boss.center();
    const mid = b.clone().add(this.mesh.position).multiplyScalar(0.5);
    this.beam.position.copy(mid);
    this.beam.lookAt(b);
    this.beam.scale.z = b.distanceTo(this.mesh.position);
  }
  sync() {}
  remove() { this.dispose(); }
  dispose() { this.dead = true; this.game.scene.remove(this.mesh); this.game.scene.remove(this.beam); }
}
