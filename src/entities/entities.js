// Entities: item drops, particles, projectiles, hostile mobs and villagers.
import { AmbientLife } from './ambient.js';
import * as THREE from 'three';
import { moveBody } from '../player/player.js';
import { humanoid, box, faceTexture, animateWalk, lambert } from './models.js';
import { iconCanvas } from '../ui/icons.js';
import { isNight } from '../engine/sky.js';
import { B, IS_SOLID, ATLAS_COLS } from '../world/blocks.js';
import { hash3 } from '../world/noise.js';
import { t } from '../i18n/index.js';
import { Villager } from './villager.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

export class Entity {
  constructor(game, x, y, z) {
    this.game = game;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.w = 0.6; this.h = 1.8;
    this.hp = 10; this.maxHp = 10;
    this.dead = false;
    this.hittable = true;
    this.onGround = false;
    this.hurtT = 0;
    this.yaw = 0;
    this.object = new THREE.Group();
    this.object.position.copy(this.pos);
    game.scene.add(this.object);
    this._out = {};
    this.gravity = 28;
  }
  get center() { return tmp.set(this.pos.x, this.pos.y + this.h / 2, this.pos.z); }
  physics(dt) {
    this.vel.y -= this.gravity * dt;
    this.vel.y = Math.max(this.vel.y, -40);
    const o = moveBody(this.game.world, this.pos, this.vel, this.w, this.h, dt, this._out);
    this.onGround = o.onGround;
    if (this.onGround) { this.vel.x *= Math.max(0, 1 - 10 * dt); this.vel.z *= Math.max(0, 1 - 10 * dt); }
    return o;
  }
  damage(amount, dir) {
    if (this.dead) return false;
    this.hp -= amount;
    this.hurtT = 0.3;
    if (dir) { this.vel.x += dir.x * 7; this.vel.z += dir.z * 7; this.vel.y = Math.max(this.vel.y, 5); }
    if (this.hp <= 0) { this.hp = 0; this.die(); }
    return true;
  }
  die() { this.dead = true; }
  sync() {
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    const red = this.hurtT > 0;
    if (red !== this._red) {
      this._red = red;
      this.object.traverse((o) => { if (o.material && !Array.isArray(o.material) && o.material.emissive) { if (!o.userData.ownMat) { o.material = o.material.clone(); o.userData.ownMat = true; } o.material.emissive.setHex(red ? 0x880000 : 0x000000); } });
    }
  }
  remove() { this.game.scene.remove(this.object); this.object.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}

// ---------------- Item drops ----------------
const dropGeo = new THREE.PlaneGeometry(0.4, 0.4);
class ItemDrop extends Entity {
  constructor(game, item, count, pos, vel) {
    super(game, pos.x, pos.y, pos.z);
    this.item = item; this.count = count;
    this.w = 0.3; this.h = 0.3;
    this.hittable = false;
    this.life = 300;
    this.pickDelay = 0.6;
    const tex = new THREE.CanvasTexture(iconCanvas(item, 32));
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    this.mesh = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    this.mesh.position.y = 0.2;
    this.object.add(this.mesh);
    if (vel) this.vel.copy(vel); else this.vel.set((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
    this.spin = Math.random() * 6;
  }
  update(dt) {
    this.life -= dt; this.pickDelay -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const p = this.game.player;
    const d = tmp2.set(p.pos.x - this.pos.x, p.pos.y + 0.8 - this.pos.y, p.pos.z - this.pos.z);
    const dist = d.length();
    if (this.pickDelay <= 0 && dist < 3.5 && !p.dead) {
      if (dist < 1.1) {
        const left = this.game.inventory.add(this.item, this.count);
        if (left < this.count) this.game.audio.sfx('pickup');
        this.count = left;
        if (left <= 0) { this.dead = true; return; }
        this.pickDelay = 1;
      } else { d.normalize().multiplyScalar(8); this.vel.x = d.x; this.vel.z = d.z; this.vel.y = d.y + 2; }
    }
    this.physics(dt);
    this.spin += dt * 2;
    this.mesh.rotation.y = this.spin;
    this.mesh.position.y = 0.25 + Math.sin(this.spin * 1.5) * 0.06;
  }
}

// ---------------- Particles ----------------
class Particles {
  constructor(scene) {
    this.max = 400;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.col = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
  }
  emit(x, y, z, r, g, b, n = 12, speed = 3, life = 0.8, gravity = true) {
    for (let k = 0; k < n; k++) {
      const i = this.i; this.i = (this.i + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.6; this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.6; this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.vel[i * 3] = (Math.random() - 0.5) * speed; this.vel[i * 3 + 1] = Math.random() * speed * (gravity ? 1 : 0.5); this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      const v = 0.8 + Math.random() * 0.4;
      this.col[i * 3] = r * v; this.col[i * 3 + 1] = g * v; this.col[i * 3 + 2] = b * v;
      this.life[i] = life * (0.6 + Math.random() * 0.6) * (gravity ? 1 : -1);
    }
  }
  // One slow particle with its own velocity (snow, petals, embers).
  drift(x, y, z, r, g, b, vx, vy, vz, life = 4) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = -life;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      let l = this.life[i];
      if (l === 0) continue;
      const grav = l > 0;
      l = grav ? l - dt : l + dt;
      if ((grav && l <= 0) || (!grav && l >= 0)) { this.life[i] = 0; this.pos[i * 3 + 1] = -9999; continue; }
      this.life[i] = l;
      if (grav) this.vel[i * 3 + 1] -= 14 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.pos.fill(-9999); this.geo.attributes.position.needsUpdate = true; }
}

// ---------------- Projectiles ----------------
const PROJ_STYLE = {
  arrow: { color: 0xc9ccd2, size: [0.08, 0.08, 0.6], gravity: 14 },
  spear: { color: 0xdfe3e8, size: [0.1, 0.1, 1.1], gravity: 12 },
  wind: { color: 0xbff7ec, size: [0.35, 0.35, 0.35], gravity: 3, emissive: 0x2a8a7a },
  shell_dark: { color: 0x231d36, size: [0.6, 0.6, 0.6], gravity: 0, emissive: 0x1a0f33 },
  shell_glow: { color: 0x7ff3ff, size: [0.6, 0.6, 0.6], gravity: 0, emissive: 0x44d6e8 },
  fireball: { color: 0xff7a2e, size: [0.55, 0.55, 0.55], gravity: 0, emissive: 0xff5a1a },
  void_orb: { color: 0xb98bff, size: [0.7, 0.7, 0.7], gravity: 0, emissive: 0x6d45d6 },
  storm_bolt: { color: 0xb6fbff, size: [0.4, 0.4, 0.9], gravity: 0, emissive: 0x7ff3ff },
  frost: { color: 0xc9f2ff, size: [0.3, 0.3, 0.5], gravity: 0, emissive: 0x5fb8e0 },
  coin: { color: 0xffd65c, size: [0.45, 0.12, 0.45], gravity: 9, emissive: 0x8a5a0a },
};

class Projectile extends Entity {
  constructor(game, o) {
    super(game, o.pos.x, o.pos.y, o.pos.z);
    this.kind = o.kind;
    this.owner = o.owner;
    this.damageAmt = o.damage || 0;
    this.vel.copy(o.vel);
    this.hittable = !!o.deflectable;
    this.deflectable = !!o.deflectable;
    this.w = 0.3; this.h = 0.3;
    this.life = o.life || 8;
    this.homing = o.homing || 0;
    this.onImpact = o.onImpact || null;
    this.radius = o.radius || 0.6;
    const st = PROJ_STYLE[this.kind] || PROJ_STYLE.arrow;
    this.gravity = o.gravity !== undefined ? o.gravity : st.gravity;
    const mat = new THREE.MeshLambertMaterial({ color: st.color, emissive: st.emissive || 0x000000 });
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(...st.size), mat);
    this.mesh.position.y = 0.15;
    this.object.add(this.mesh);
    if (this.kind === 'shell_glow' || this.kind === 'void_orb' || this.kind === 'fireball') {
      const halo = new THREE.Mesh(new THREE.BoxGeometry(st.size[0] * 1.6, st.size[1] * 1.6, st.size[2] * 1.6), new THREE.MeshBasicMaterial({ color: st.emissive, transparent: true, opacity: 0.3, depthWrite: false }));
      this.mesh.add(halo);
    }
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    const g = this.game;
    if (this.homeTarget && !this.homeTarget.dead) {
      tmp2.copy(this.homeTarget.center()).sub(this.pos).normalize().multiplyScalar(20);
      this.vel.lerp(tmp2, Math.min(1, 6 * dt));
    }
    if (this.homing && this.owner !== 'player') {
      const p = g.player.pos;
      tmp2.set(p.x - this.pos.x, p.y + 1 - this.pos.y, p.z - this.pos.z).normalize().multiplyScalar(this.vel.length());
      this.vel.lerp(tmp2, Math.min(1, this.homing * dt));
    }
    this.vel.y -= this.gravity * dt;
    const steps = 3;
    for (let s = 0; s < steps && !this.dead; s++) {
      this.pos.addScaledVector(this.vel, dt / steps);
      // world collision
      const id = g.world.getBlock(this.pos.x, this.pos.y + 0.15, this.pos.z);
      if (id > 0 && IS_SOLID[id]) { this.impact(null); return; }
      // hit player
      if (this.owner !== 'player') {
        const p = g.player;
        if (!p.dead && Math.abs(p.pos.x - this.pos.x) < 0.3 + this.radius && Math.abs(p.pos.z - this.pos.z) < 0.3 + this.radius && this.pos.y > p.pos.y - this.radius && this.pos.y < p.pos.y + 1.8 + this.radius * 0.5) {
          tmp2.copy(this.vel).setY(0).normalize();
          g.damagePlayer(this.damageAmt, this.owner === 'boss' ? 'boss' : 'mob', this.sourceName, tmp2);
          this.impact(g.player);
          return;
        }
      } else {
        // hit mobs / bosses
        for (const e of g.entities.list) {
          if (e === this || !e.hittable || e.dead || e instanceof Projectile || e.villager) continue;
          if (hitsAABB(this.pos, e, 0.25)) {
            tmp2.copy(this.vel).setY(0).normalize();
            g.entities.playerHit(e, this.damageAmt, tmp2, this.kind);
            this.impact(e);
            return;
          }
        }
        const boss = g.bosses.active;
        if (boss && boss.hitTest && boss.hitTest(this.pos, 0.4)) {
          boss.onProjectile(this);
          this.impact(boss);
          return;
        }
      }
    }
    if (this.vel.lengthSq() > 0.01) {
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this.mesh.rotation.x = -Math.atan2(this.vel.y, Math.hypot(this.vel.x, this.vel.z));
    }
    if (this.kind === 'wind' || this.kind === 'shell_glow' || this.kind === 'void_orb') this.mesh.rotation.z += dt * 8;
  }
  // Hit back by the player: flies home to the boss that threw it.
  deflect(boss) {
    const g = this.game;
    this.owner = 'player';
    this.deflected = true;
    this.deflectable = false;
    this.hittable = false;
    this.life = 6;
    this.homeTarget = boss || null;
    const target = boss ? boss.center() : this.pos.clone().add(this.vel.clone().multiplyScalar(-1));
    this.vel.copy(target.sub(this.pos).normalize().multiplyScalar(20));
    g.audio.sfx('deflect');
    g.entities.particles.emit(this.pos.x, this.pos.y, this.pos.z, 0.7, 1, 1, 16, 5, 0.4, false);
  }

  impact(target) {
    if (this.dead) return;
    this.dead = true;
    const g = this.game;
    if (this.onImpact) this.onImpact(this, target);
    if (this.kind === 'spear' && this.owner === 'player') {
      g.entities.dropItem('spear', 1, this.pos.clone().setY(this.pos.y + 0.3), new THREE.Vector3(0, 2, 0));
    }
    if (this.kind === 'wind') {
      g.audio.sfx('wind');
      g.entities.particles.emit(this.pos.x, this.pos.y, this.pos.z, 0.75, 0.97, 0.93, 24, 7, 0.5, false);
      // knockback nearby mobs and the player
      for (const e of g.entities.list) if (e.hittable && !e.villager && e.pos.distanceTo(this.pos) < 3) { tmp2.subVectors(e.pos, this.pos).setY(0).normalize(); e.vel.addScaledVector(tmp2, 10); e.vel.y = 7; }
      const pd = g.player.pos.distanceTo(this.pos);
      if (pd < 2.5) { tmp2.subVectors(g.player.pos, this.pos).setY(0).normalize(); g.player.knock.set(tmp2.x * 6, 9, tmp2.z * 6); }
    }
    if (this.kind === 'fireball' || this.kind === 'void_orb') {
      g.entities.particles.emit(this.pos.x, this.pos.y, this.pos.z, this.kind === 'fireball' ? 1 : 0.7, this.kind === 'fireball' ? 0.5 : 0.5, this.kind === 'fireball' ? 0.2 : 1, 20, 5, 0.6);
    }
  }
}

function hitsAABB(p, e, r) {
  const hw = e.w / 2 + r;
  return p.x > e.pos.x - hw && p.x < e.pos.x + hw && p.z > e.pos.z - hw && p.z < e.pos.z + hw && p.y > e.pos.y - r && p.y < e.pos.y + e.h + r;
}

// ---------------- Mobs ----------------
const MOB_DEFS = {
  hollow: { hp: 20, speed: 3.2, dmg: 3, reach: 1.5, name: 'mob.hollow', burns: true, drops: [['bone_dust', 0.8], ['sunfruit', 0.15], ['roast', 0.2]] },
  skitter: { hp: 14, speed: 5.2, dmg: 2, reach: 1.4, name: 'mob.skitter', burns: false, drops: [['fiber', 0.8], ['roast', 0.3]], w: 1.1, h: 0.7 },
  gloomshot: { hp: 18, speed: 3, dmg: 3, reach: 14, name: 'mob.gloomshot', burns: true, ranged: true, drops: [['arrow', 0.9], ['bone_dust', 0.5]] },
  soulMinion: { hp: 8, speed: 4.2, dmg: 2, reach: 1.4, name: 'mob.soulMinion', flying: true, drops: [] , w: 0.7, h: 0.7 },
  fireSpirit: { hp: 10, speed: 4.4, dmg: 4, reach: 1.4, name: 'mob.fireSpirit', flying: true, drops: [['charcoal', 0.6]], w: 0.7, h: 0.8 },
  frostSpirit: { hp: 12, speed: 4.6, dmg: 3, reach: 1.4, name: 'mob.frostSpirit', flying: true, drops: [], w: 0.7, h: 0.8 },
  whirlwind: { hp: 999, speed: 2.6, dmg: 1, reach: 1.6, name: 'mob.whirlwind', hazard: true, drops: [], w: 1.4, h: 3 },
  mimic: { hp: 12, speed: 5, dmg: 2, reach: 1.4, name: 'mob.mimic', drops: [], w: 1.1, h: 0.7 },
  // livestock: never attack; follow the food they like, flee when hit
  chicken: { hp: 4, speed: 1.6, name: 'mob.chicken', passive: true, food: 'wheat_seeds', drops: [['raw_chicken', 1]], w: 0.5, h: 0.7 },
  sheep: { hp: 8, speed: 1.5, name: 'mob.sheep', passive: true, food: 'wheat', drops: [['wool', 1], ['wool', 0.5], ['raw_mutton', 1]], w: 0.9, h: 1.2 },
  cow: { hp: 10, speed: 1.4, name: 'mob.cow', passive: true, food: 'wheat', drops: [['raw_beef', 1], ['raw_beef', 0.5]], w: 0.9, h: 1.4 },
};

export class Mob extends Entity {
  constructor(game, type, x, y, z) {
    super(game, x, y, z);
    const d = MOB_DEFS[type];
    this.type = type; this.def = d;
    this.hp = this.maxHp = d.hp;
    this.w = d.w || 0.6; this.h = d.h || 1.8;
    this.attackT = 0.5 + Math.random();
    this.wanderT = 0;
    this.wanderDir = new THREE.Vector3();
    this.phase = Math.random() * 6;
    this.name = t(d.name);
    this.nameKey = d.name;
    this.hittable = type !== 'whirlwind';
    this.isMob = true;
    this.passive = !!d.passive;
    this.build();
    if (d.flying) this.gravity = 0;
  }
  build() {
    const tp = this.type;
    if (tp === 'hollow') {
      this.rig = humanoid({ skin: '#8f8aa8', hair: '#3a3450', shirt: '#4b4468', pants: '#2b2640', eye: '#b98bff' }, 'hollow');
      this.object.add(this.rig.group);
      this.rig.armL.rotation.x = this.rig.armR.rotation.x = -1.3;
    } else if (tp === 'gloomshot') {
      this.rig = humanoid({ skin: '#5a5470', hair: '#17143d', shirt: '#231f57', pants: '#17143d', eye: '#7ff3ff' }, 'hollow', 0.95);
      this.object.add(this.rig.group);
      const bow = box(0.06, 0.8, 0.06, '#8a6238'); bow.position.set(0, -0.5, 0.15); this.rig.armL.add(bow);
      this.rig.armL.rotation.x = -1.4;
    } else if (tp === 'skitter' || tp === 'mimic') {
      const mim = tp === 'mimic';
      const body = box(0.9, 0.45, 1.1, mim ? '#d8a22e' : '#3a2a2a', faceTexture('eyes', mim ? '#d8a22e' : '#3a2a2a', mim ? '#7ff3ff' : '#ff4d4d'));
      body.position.y = 0.45;
      this.object.add(body);
      this.legs = [];
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const leg = new THREE.Group();
        leg.position.set(side * 0.45, 0.45, -0.35 + (i % 3) * 0.35);
        const m = box(0.7, 0.08, 0.08, mim ? '#8a6a24' : '#231818'); m.position.x = side * 0.35; m.rotation.z = side * -0.6;
        leg.add(m);
        this.object.add(leg);
        this.legs.push(leg);
      }
    } else if (tp === 'soulMinion' || tp === 'fireSpirit' || tp === 'frostSpirit') {
      const fire = tp === 'fireSpirit', frost = tp === 'frostSpirit';
      const col = fire ? '#ff7a2e' : frost ? '#e6fbff' : '#7ff3ff';
      const glow = fire ? 0x8a2a00 : frost ? 0x3a7aa0 : 0x1f7c8c;
      const b = box(0.6, 0.6, 0.6, col, faceTexture('ghost', col, fire ? '#5a1a0a' : '#1f2a6b'), { emissive: glow });
      b.position.y = 0.35;
      this.object.add(b);
      const tail = box(0.35, 0.35, 0.35, col, null, { emissive: glow, transparent: true, opacity: 0.6 });
      tail.position.set(0, -0.2, -0.3);
      b.add(tail);
      this.bodyMesh = b;
    } else if (tp === 'chicken' || tp === 'sheep' || tp === 'cow') {
      this.buildAnimal(tp);
    } else if (tp === 'whirlwind') {
      this.rings = [];
      for (let i = 0; i < 5; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(0.35 + i * 0.18, 0.08, 4, 10), new THREE.MeshBasicMaterial({ color: 0xbff7ec, transparent: true, opacity: 0.55, depthWrite: false }));
        r.rotation.x = Math.PI / 2;
        r.position.y = 0.3 + i * 0.6;
        this.object.add(r);
        this.rings.push(r);
      }
    }
  }
  // four-legged (or two-legged) farm animals from boxes
  buildAnimal(tp) {
    const root = new THREE.Group();
    this.object.add(root);
    this.animalRoot = root;
    this.quadLegs = [];
    const leg = (x, z, h, col) => { const g = new THREE.Group(); g.position.set(x, h, z); const m = box(0.14, h, 0.14, col); m.position.y = -h / 2; g.add(m); root.add(g); this.quadLegs.push(g); };
    if (tp === 'chicken') {
      const body = box(0.42, 0.36, 0.52, '#f4f4f4'); body.position.y = 0.42; root.add(body);
      const head = box(0.26, 0.3, 0.24, '#f4f4f4', faceTexture('eyes', '#f4f4f4', '#1a1a1a')); head.position.set(0, 0.72, 0.26); root.add(head);
      const beak = box(0.12, 0.08, 0.1, '#f2b632'); beak.position.set(0, 0.68, 0.43); root.add(beak);
      const comb = box(0.06, 0.1, 0.14, '#e0342a'); comb.position.set(0, 0.9, 0.26); root.add(comb);
      leg(-0.1, 0, 0.24, '#f2b632'); leg(0.1, 0, 0.24, '#f2b632');
    } else {
      const sheep = tp === 'sheep';
      const bodyCol = sheep ? '#eeeeea' : '#f4f4f4';
      const body = box(0.8, sheep ? 0.62 : 0.68, 1.2, bodyCol); body.position.y = sheep ? 0.82 : 0.95; root.add(body);
      if (!sheep) for (const [x, y, z] of [[0.41, 1.0, 0.1], [-0.41, 0.9, -0.3], [0.2, 1.3, -0.2]]) { const s = box(0.02, 0.26, 0.3, '#3a2a1a'); s.position.set(x, y, z); if (Math.abs(x) < 0.3) { s.rotation.z = Math.PI / 2; } root.add(s); }
      const headCol = sheep ? '#3a3a3a' : '#5a3a24';
      const head = box(0.44, 0.44, 0.44, headCol, faceTexture('eyes', headCol, '#101010')); head.position.set(0, sheep ? 1.08 : 1.22, 0.74); root.add(head);
      if (!sheep) { for (const x of [-0.26, 0.26]) { const h = box(0.08, 0.16, 0.08, '#e8e0c8'); h.position.set(x, 1.5, 0.7); root.add(h); } const nose = box(0.3, 0.16, 0.06, '#e8a8a0'); nose.position.set(0, 1.1, 0.97); root.add(nose); }
      const lh = sheep ? 0.52 : 0.6, lc = sheep ? '#3a3a3a' : '#f4f4f4';
      leg(-0.26, 0.4, lh, lc); leg(0.26, 0.4, lh, lc); leg(-0.26, -0.4, lh, lc); leg(0.26, -0.4, lh, lc);
    }
  }
  setBaby(on) {
    this.baby = on;
    this.growT = 0;
    if (this.animalRoot) this.animalRoot.scale.setScalar(on ? 0.55 : 1);
    this.w = (this.def.w || 0.6) * (on ? 0.6 : 1); this.h = (this.def.h || 1.8) * (on ? 0.6 : 1);
  }
  // livestock: wander, come to the food they like, flee when hit, look for a mate
  passiveUpdate(dt) {
    const g = this.game, d = this.def, p = g.player;
    this.fleeT = Math.max(0, (this.fleeT || 0) - dt);
    this.loveT = Math.max(0, (this.loveT || 0) - dt);
    this.breedCd = Math.max(0, (this.breedCd || 0) - dt);
    if (this.baby) { this.growT += dt; if (this.growT > 300) this.setBaby(false); }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz) || 1;
    const held = g.inventory && g.inventory.held;
    let mx = 0, mz = 0, sp = d.speed;
    const mate = this.loveT > 0 && this.mate && !this.mate.dead ? this.mate : null;
    if (this.fleeT > 0) { mx = -dx / dist; mz = -dz / dist; sp *= 2.6; }
    else if (mate) { const ax = mate.pos.x - this.pos.x, az = mate.pos.z - this.pos.z, ad = Math.hypot(ax, az) || 1; if (ad > 1.2) { mx = ax / ad; mz = az / ad; } }
    else if (held && held.item === d.food && !p.dead && dist < 9 && dist > 2) { mx = dx / dist; mz = dz / dist; }
    else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 3 + Math.random() * 5; const a = Math.random() * Math.PI * 2; const go = Math.random() < 0.45; this.wanderDir.set(go ? Math.sin(a) : 0, 0, go ? Math.cos(a) : 0); }
      mx = this.wanderDir.x * 0.6; mz = this.wanderDir.z * 0.6;
    }
    if (mx || mz) this.yaw = Math.atan2(mx, mz);
    const k = Math.min(1, (this.onGround ? 10 : 2) * dt);
    this.vel.x += (mx * sp - this.vel.x) * k;
    this.vel.z += (mz * sp - this.vel.z) * k;
    const o = this.physics(dt);
    if (this.onGround && (o.hitX || o.hitZ) && (mx || mz)) this.vel.y = 7.6;
    // hens lay an egg now and then
    if (this.type === 'chicken' && !this.baby) {
      if (this.eggT === undefined) this.eggT = 90 + Math.random() * 150;
      this.eggT -= dt;
      if (this.eggT <= 0) { this.eggT = 150 + Math.random() * 150; g.entities.dropItem('egg', 1, this.pos.clone().setY(this.pos.y + 0.3)); }
    }
    if (this.loveT > 0 && Math.random() < dt * 3) g.entities.particles.emit(this.pos.x, this.pos.y + this.h + 0.2, this.pos.z, 1, 0.45, 0.6, 1, 0.8, 0.8, false);
  }
  update(dt) {
    const g = this.game, d = this.def;
    if (d.passive && !this.netProxy) { this.hurtT -= dt; this.phase += dt * 6; this.passiveUpdate(dt); this.animate(dt); return; }
    // multiplayer: monsters go for the nearest player (the host runs them)
    const p = g.net && g.net.isHost ? g.net.mobTarget(this.pos) : g.player;
    this.hurtT -= dt;
    this.attackT -= dt;
    this.phase += dt * 6;
    if (this.netProxy) { this.follow(dt); this.animate(dt); return; }
    if (this.life !== undefined) { this.life -= dt; if (this.life <= 0) { this.dead = true; this.poof(); return; } }
    // a pet that bit this mob draws its attention for a while (melee mobs)
    this.petAggroT = (this.petAggroT || 0) - dt;
    const pet = !d.ranged && this.petAggroT > 0 && this.petAggro && !this.petAggro.dead && !this.petAggro.resting ? this.petAggro : null;
    const foe = pet ? pet.pos : p.pos;
    const dx = foe.x - this.pos.x, dz = foe.z - this.pos.z, dy = foe.y - this.pos.y;
    const dist = Math.hypot(dx, dz);
    // burn in daylight
    if (d.burns && g.outdoors && !isNight(g.meta.time) && g.world.skyExposed(this.pos.x, this.pos.y + 1.6, this.pos.z)) {
      this.burnT = (this.burnT || 0) - dt;
      if (this.burnT <= 0) { this.burnT = 0.8; this.damage(3, null); g.entities.particles.emit(this.pos.x, this.pos.y + 1, this.pos.z, 1, 0.5, 0.1, 6, 1.5, 0.6); }
    }
    const aggro = !p.dead && dist < 24 && Math.abs(dy) < 12;
    let mx = 0, mz = 0;
    if (aggro) {
      if (d.ranged && dist < 7) { mx = -dx / dist; mz = -dz / dist; }
      else if (!d.ranged || dist > 11) { mx = dx / (dist || 1); mz = dz / (dist || 1); }
      this.yaw = Math.atan2(dx, dz);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 4; const a = Math.random() * Math.PI * 2; const go = Math.random() < 0.6; this.wanderDir.set(go ? Math.sin(a) : 0, 0, go ? Math.cos(a) : 0); }
      mx = this.wanderDir.x * 0.5; mz = this.wanderDir.z * 0.5;
      if (mx || mz) this.yaw = Math.atan2(mx, mz);
    }
    const sp = d.speed * (g.meta.difficulty === 'hard' ? 1.15 : 1);
    const k = Math.min(1, (this.onGround || d.flying ? 10 : 2) * dt);
    this.vel.x += (mx * sp - this.vel.x) * k;
    this.vel.z += (mz * sp - this.vel.z) * k;
    if (d.flying) {
      const targetY = aggro ? p.pos.y + 1.0 + Math.sin(this.phase * 0.5) * 0.5 : this.pos.y;
      this.vel.y += ((targetY - this.pos.y) * 2 - this.vel.y) * Math.min(1, 4 * dt);
    }
    const o = this.physics(dt);
    if (!d.flying && this.onGround && (o.hitX || o.hitZ) && (mx || mz)) this.vel.y = 8.2;
    if ((this.type === 'skitter' || this.type === 'mimic') && aggro && this.onGround && dist < 4 && dist > 2 && Math.random() < dt * 1.5) { this.vel.y = 7; this.vel.x = dx / dist * 8; this.vel.z = dz / dist * 8; }
    // attack
    if (aggro && this.attackT <= 0) {
      if (d.ranged && dist < d.reach) {
        this.attackT = 2.2;
        const from = new THREE.Vector3(this.pos.x, this.pos.y + 1.5, this.pos.z);
        const to = new THREE.Vector3(p.pos.x, p.pos.y + 1.3, p.pos.z);
        const dir = to.sub(from); const len = dir.length(); dir.normalize(); dir.y += len * 0.012;
        g.entities.shoot('arrow', from, dir.normalize(), 22, d.dmg, 'mob', this.name);
        if (g.net && g.net.isHost) g.net.sendProj('arrow', from, dir, 22, d.dmg, this.nameKey);
        g.audio.sfx('shoot');
      } else if (!d.ranged && dist < d.reach && Math.abs(dy + (d.flying ? 1 : 0)) < 2) {
        this.attackT = d.hazard ? 0.6 : 1.0;
        tmp2.set(dx, 0, dz).normalize();
        if (pet) pet.damage(d.dmg);
        else if (p.remote) g.net.hurt(p, d.dmg, this.nameKey, tmp2);
        else if (d.hazard) { p.knock.set(tmp2.x * 9, 10, tmp2.z * 9); g.damagePlayer(d.dmg, 'mob', this.name); }
        else g.damagePlayer(d.dmg, 'mob', this.name, tmp2);
        if (this.rig) this.rig.armR.rotation.x = -2;
      }
    }
    this.animate(dt);
    // despawn far away
    if (dist > 80) this.dead = true;
  }
  animate(dt) {
    const g = this.game;
    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (this.rig) { animateWalk(this.rig, this.phase, Math.min(1, moving / 3)); if (this.type === 'hollow') { this.rig.armL.rotation.x = -1.3 + Math.sin(this.phase) * 0.1; this.rig.armR.rotation.x += (-1.3 - this.rig.armR.rotation.x) * 0.2; } }
    if (this.legs) this.legs.forEach((l, i) => { l.rotation.y = Math.sin(this.phase * 2 + i) * 0.4 * Math.min(1, moving); });
    if (this.quadLegs) this.quadLegs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase * 1.6 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6 * Math.min(1, moving); });
    if (this.bodyMesh) this.bodyMesh.position.y = 0.35 + Math.sin(this.phase) * 0.1;
    if (this.rings) this.rings.forEach((r, i) => { r.rotation.z += dt * (4 + i); r.position.x = Math.sin(this.phase + i) * 0.1; });
    if (this.type === 'fireSpirit' && Math.random() < dt * 8) g.entities.particles.emit(this.pos.x, this.pos.y + 0.4, this.pos.z, 1, 0.55, 0.15, 1, 1, 0.5, false);
    if (this.type === 'whirlwind' && Math.random() < dt * 20) g.entities.particles.emit(this.pos.x, this.pos.y + Math.random() * 3, this.pos.z, 0.8, 0.97, 0.93, 1, 3, 0.4, false);
  }
  // A guest's copy of a host monster glides to the positions the host sends.
  follow(dt) {
    const to = this.netTarget;
    if (!to) return;
    const k = Math.min(1, dt * 10);
    const px = this.pos.x, pz = this.pos.z;
    if (Math.hypot(to.x - px, to.z - pz) > 8) this.pos.set(to.x, to.y, to.z);
    else { this.pos.x += (to.x - px) * k; this.pos.y += (to.y - this.pos.y) * k; this.pos.z += (to.z - pz) * k; }
    this.vel.set((this.pos.x - px) / Math.max(dt, 1e-3), 0, (this.pos.z - pz) / Math.max(dt, 1e-3));
    let dy = to.yaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    // the host stopped sending it
    if ((this.netAge || 0) > 3) this.dead = true;
  }
  damage(amount, dir) {
    if (this.def.hazard) return false;
    if (this.netProxy) {
      // a guest's hit goes to the host, which runs the monster
      if (this.dead || !this.game.net) return false;
      this.hurtT = 0.3;
      this.game.audio.sfx('hit');
      this.game.net.hitMob(this, amount, dir);
      return true;
    }
    const ok = super.damage(amount, dir);
    if (ok) this.game.audio.sfx('hit');
    if (ok && this.passive) this.fleeT = 5;
    return ok;
  }
  die() {
    super.die();
    const g = this.game;
    g.audio.sfx('mobdie');
    this.poof();
    if (g.net && g.net.isHost) g.net.mobDied(this, this.killedBy);
    // a guest's kill is rewarded on the guest's side
    if (this.noDrops || this.killedBy) return;
    this.reward();
  }
  reward() {
    const g = this.game;
    if (this.passive) {
      // livestock gives meat, wool...; babies give nothing
      if (!this.baby) for (const [item, chance] of this.def.drops) if (Math.random() < chance) g.entities.dropItem(item, 1, this.pos.clone().setY(this.pos.y + 0.5));
      return;
    }
    g.meta.stats.kills++;
    g.daily.note('kill');
    for (const [item, chance] of this.def.drops) if (Math.random() < chance) g.entities.dropItem(item, 1 + (Math.random() < 0.3 ? 1 : 0), this.pos.clone().setY(this.pos.y + 0.5));
    if (Math.random() < (g.event && g.event.id === 'harvest' ? 0.24 : 0.08)) g.addCrystals(1);
  }
  poof() { this.game.entities.particles.emit(this.pos.x, this.pos.y + this.h / 2, this.pos.z, 0.8, 0.8, 0.9, 16, 3, 0.7); }
}

// ---------------- Manager ----------------
export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.particles = new Particles(game.scene);
    this.spawnT = 0;
    this.villagesSpawned = new Set();
    this.tileColors = null;
    this.life = new AmbientLife(game);
  }
  clear() {
    for (const e of this.list) e.remove();
    this.list = [];
    this.villagesSpawned.clear();
    this.particles.clear();
    this.life.clear();
  }
  add(e) { this.list.push(e); return e; }
  onRealmLoaded() { this.spawnVillagers(true); }
  onNewDay() { for (const e of this.list) if (e.villager) e.refreshTrades(); }
  onBlockChange() {}

  dropItem(item, count, pos, vel) {
    if (!item || count <= 0) return null;
    return this.add(new ItemDrop(this.game, item, count, pos, vel));
  }

  shoot(kind, from, dir, speed, damage, owner, sourceName) {
    const pr = new Projectile(this.game, { kind, pos: from.clone().addScaledVector(dir, 0.6).setY(from.y - 0.15), vel: dir.clone().multiplyScalar(speed), damage, owner });
    pr.sourceName = sourceName;
    return this.add(pr);
  }

  spawnProjectile(o) { const p = new Projectile(this.game, o); p.sourceName = o.sourceName; return this.add(p); }

  spawnMob(type, x, y, z) { return this.add(new Mob(this.game, type, x, y, z)); }

  burst(x, y, z, tile) {
    const c = this.tileColor(tile);
    this.particles.emit(x, y, z, c[0], c[1], c[2], 14, 3.5, 0.7);
  }

  tileColor(tile) {
    if (!this.tileColors || this.tileColorsSrc !== this.game.atlasCanvas) {
      this.tileColorsSrc = this.game.atlasCanvas;
      const cv = this.game.atlasCanvas, ctx = cv.getContext('2d');
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      this.tileColors = [];
      const n = (cv.width / 16) * (cv.height / 16);
      for (let i = 0; i < n; i++) {
        let r = 0, g = 0, b = 0, c = 0;
        const ox = (i % ATLAS_COLS) * 16, oy = Math.floor(i / ATLAS_COLS) * 16;
        for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x += 2) {
          const j = ((oy + y) * cv.width + ox + x) * 4;
          if (d[j + 3] < 50) continue;
          r += d[j]; g += d[j + 1]; b += d[j + 2]; c++;
        }
        this.tileColors.push(c ? [r / c / 255, g / c / 255, b / c / 255] : [1, 1, 1]);
      }
    }
    return this.tileColors[tile] || [1, 1, 1];
  }

  occupies(x, y, z) {
    for (const e of this.list) {
      if (!e.hittable || e instanceof Projectile) continue;
      const hw = e.w / 2;
      if (x + 1 > e.pos.x - hw && x < e.pos.x + hw && z + 1 > e.pos.z - hw && z < e.pos.z + hw && y + 1 > e.pos.y && y < e.pos.y + e.h) return true;
    }
    return false;
  }

  // Ray vs entity AABBs (also the active boss).
  raycast(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    const test = (e, cx, cy, cz, hw, hh) => {
      const inv = [1 / dir.x, 1 / dir.y, 1 / dir.z];
      const mn = [cx - hw - origin.x, cy - origin.y, cz - hw - origin.z];
      const mx = [cx + hw - origin.x, cy + hh - origin.y, cz + hw - origin.z];
      let t0 = 0, t1 = bestT;
      for (let a = 0; a < 3; a++) {
        let ta = mn[a] * inv[a], tb = mx[a] * inv[a];
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if (t0 > t1) return;
      }
      if (t0 < bestT) { bestT = t0; best = e; }
    };
    for (const e of this.list) {
      if (!e.hittable || e.dead) continue;
      const pad = e.deflectable ? 0.5 : 0.1;
      test(e, e.pos.x, e.pos.y - (e.deflectable ? 0.3 : 0), e.pos.z, e.w / 2 + pad, e.h + pad * 2);
    }
    const boss = this.game.bosses.active;
    if (boss && boss.hitboxes) for (const hb of boss.hitboxes()) test(boss, hb.x, hb.y, hb.z, hb.hw, hb.h);
    return best;
  }

  // Pressing attack knocks back any glowing boss projectile close in front.
  autoParry(eye, dir) {
    let done = false;
    for (const e of this.list) {
      if (!e.deflectable || e.dead) continue;
      tmp2.subVectors(e.pos, eye);
      const d = tmp2.length();
      if (d < 4.2 && tmp2.normalize().dot(dir) > 0.25) { e.deflect(this.game.bosses.active); done = true; }
    }
    return done;
  }

  playerHit(e, dmg, dir, via = 'melee') {
    const g = this.game;
    if (e.deflectable) { e.deflect(g.bosses.active); return; }
    if (e.isBoss) { e.onPlayerHit(dmg, via); return; }
    if (e.villager) { e.flinch(); return; }
    e.damage(dmg, dir);
    g.vibrate(12);
  }

  spawnVillagers(force = false) {
    const g = this.game;
    if (g.meta.dim !== 'overworld') return;
    const p = g.player.pos;
    for (const v of g.layout.villagesAround(p.x, p.z, 72)) {
      if (this.villagesSpawned.has(v.id)) continue;
      // only once the village chunk is loaded
      const c = g.world.chunkAt(v.x, v.z);
      if (!c || !c.data) continue;
      this.villagesSpawned.add(v.id);
      v.houses.forEach((h, i) => {
        const vx = h.door.x + 0.5 + Math.sign(v.x - h.door.x) * 1.5, vz = h.door.z + 0.5 + Math.sign(v.z - h.door.z) * 1.5;
        const id = v.id + ':' + i;
        this.add(new Villager(g, id, vx, v.y + 1.05, vz, v));
      });
    }
    void force;
  }

  update(dt) {
    const g = this.game;
    this.particles.update(dt);
    this.life.update(dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.trySpawn(); this.spawnVillagers(); }
    for (const e of this.list) if (!e.dead) {
      // freeze entities in unloaded chunks
      const c = g.world.chunkAt(e.pos.x, e.pos.z);
      if (!c || !c.data) continue;
      e.update(dt);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (e.dead) { e.remove(); this.list.splice(i, 1); if (e.villager) this.villagesSpawned.delete(e.village.id); }
    }
  }

  render() { for (const e of this.list) e.sync(); }

  trySpawn() {
    const g = this.game;
    const diff = g.meta.difficulty;
    if (diff === 'peaceful') return;
    if (g.bosses.active || g.meta.dim === 'quest') return;
    if (g.net && !g.net.isHost) return; // the host's monsters come over the network
    const hostile = this.list.filter((e) => e instanceof Mob && !e.bossMinion && !e.passive).length;
    const cap = (diff === 'hard' ? 12 : 8) + (g.net ? g.net.players.size * 3 : 0);
    if (hostile >= cap) return;
    const dim = g.meta.dim;
    const night = g.outdoors && isNight(g.meta.time);
    const p = g.net ? g.net.spawnCentre() : g.player.pos;
    const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 18;
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    if (dim === 'city') {
      // night monsters in the streets and parks (not on roofs or in the sea)
      if (!night || !g.city) return;
      const a = g.city.at(x, z);
      if (!a || a.b || a.s === 6) return;
      const y = a.g;
      if (g.world.getBlock(x, y + 1, z) !== B.air || g.world.getBlock(x, y + 2, z) !== B.air) return;
      const roll = Math.random();
      this.spawnMob(roll < 0.6 ? 'hollow' : roll < 0.85 ? 'skitter' : 'gloomshot', x + 0.5, y + 1.05, z + 0.5);
    } else if (dim === 'overworld') {
      // no spawns inside villages or the Trial Chamber
      if (g.layout.villageNear(x, z)) return;
      if (night) {
        const y = g.world.topSolid(x, z);
        if (y < 0 || g.world.getBlock(x, y, z) === B.water || g.world.getBlock(x, y, z) === B.leaves) return;
        const roll = Math.random();
        this.spawnMob(roll < 0.55 ? 'hollow' : roll < 0.8 ? 'skitter' : 'gloomshot', x + 0.5, y + 1.05, z + 0.5);
      } else if (Math.random() < 0.25) {
        // caves: dark, enclosed spaces below the surface
        const y = Math.floor(p.y) + Math.floor((Math.random() - 0.5) * 12);
        if (y < 4 || y > 60) return;
        if (!IS_SOLID[g.world.getBlock(x, y - 1, z)] || g.world.getBlock(x, y, z) !== B.air || g.world.getBlock(x, y + 1, z) !== B.air) return;
        if (g.world.skyExposed(x, y, z)) return;
        if (hash3(1, x, y, z) < 0.5) this.spawnMob(Math.random() < 0.6 ? 'hollow' : 'skitter', x + 0.5, y + 0.05, z + 0.5);
      }
    } else if (dim === 'emberdeep' && Math.random() < 0.35) {
      const y = g.world.groundBelow(x, Math.floor(p.y) + 10, z);
      if (y > 30 && y < 100) this.spawnMob('fireSpirit', x + 0.5, y + 2, z + 0.5);
    }
  }
}

export { Projectile, ItemDrop, lambert };
