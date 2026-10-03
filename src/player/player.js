// Player state and AABB physics against the voxel world.
import * as THREE from 'three';
import { B, IS_SOLID } from '../world/blocks.js';

export const PLAYER_W = 0.6;
export const PLAYER_H = 1.8;
export const EYE = 1.62;

// Shared AABB-vs-voxel mover, also used by mobs.
export function moveBody(world, pos, vel, w, h, dt, out = {}) {
  const half = w / 2;
  out.onGround = false; out.hitX = false; out.hitZ = false; out.hitCeil = false;
  const solid = (x, y, z) => world.isSolidAt(x, y, z);
  const collides = (px, py, pz) => {
    const x0 = Math.floor(px - half), x1 = Math.floor(px + half - 1e-6);
    const y0 = Math.floor(py), y1 = Math.floor(py + h - 1e-6);
    const z0 = Math.floor(pz - half), z1 = Math.floor(pz + half - 1e-6);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
    return false;
  };
  // sub-step to avoid tunnelling
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z)) * dt / 0.4));
  const sdt = dt / steps;
  for (let s = 0; s < steps; s++) {
    let ny = pos.y + vel.y * sdt;
    if (collides(pos.x, ny, pos.z)) {
      if (vel.y < 0) { out.onGround = true; ny = Math.floor(ny) + 1; if (collides(pos.x, ny, pos.z)) ny = pos.y; }
      else { out.hitCeil = true; ny = pos.y; }
      vel.y = 0;
    }
    pos.y = ny;
    const nx = pos.x + vel.x * sdt;
    if (collides(nx, pos.y, pos.z)) { out.hitX = true; vel.x = 0; } else pos.x = nx;
    const nz = pos.z + vel.z * sdt;
    if (collides(pos.x, pos.y, nz)) { out.hitZ = true; vel.z = 0; } else pos.z = nz;
  }
  if (!out.onGround && vel.y <= 0 && collides(pos.x, pos.y - 0.05, pos.z)) out.onGround = true;
  return out;
}

export const FLY_GEARS = [1, 2.5, 5, 10];

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(0, 80, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.inMagma = false;
    this.maxHealth = 20;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.hurtTime = 0;
    this.invuln = 0;
    this.fallStart = null;
    this.dead = false;
    this.god = false;
    this.autoJump = true;
    this.walkPhase = 0;
    this.moving = false;
    this.fly = false;
    this.flyGear = 0; // creative flight speed: 1x, 2.5x, 5x, 10x
    this.coyote = 0;
    this.knock = new THREE.Vector3();
    this._out = {};
  }

  get eye() { return new THREE.Vector3(this.pos.x, this.pos.y + EYE, this.pos.z); }

  lookDir(v = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return v.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  update(dt, inp, world, game) {
    this.yaw -= inp.lookDX;
    this.pitch -= inp.lookDY;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    if (this.dead) return;

    const feet = world.getBlock(this.pos.x, this.pos.y + 0.2, this.pos.z);
    const body = world.getBlock(this.pos.x, this.pos.y + 1.0, this.pos.z);
    this.inWater = feet === B.water || body === B.water;
    this.inMagma = feet === B.magma || body === B.magma;

    const sprint = inp.sprint && inp.move.z > 0.5;
    let speed = this.fly ? (sprint ? 12 : 8.5) * FLY_GEARS[this.flyGear || 0] : sprint ? 5.9 : 4.4;
    if (this.inWater) speed *= 0.55;
    if (game && game.blocking) speed *= 0.4; // behind a raised shield
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wx = (fx * inp.move.z + rx * inp.move.x) * speed;
    const wz = (fz * inp.move.z + rz * inp.move.x) * speed;
    const steering = Math.abs(inp.move.x) + Math.abs(inp.move.z) > 0.05;
    if (this.airLock > 0) {
      // launched (jump pads): keep the flight, ignore steering
      this.airLock -= dt;
    } else {
      // ice: little grip, so the player slides and keeps momentum
      const icy = this.onGround && world.getBlock(this.pos.x, this.pos.y - 0.05, this.pos.z) === B.ice;
      const accel = this.onGround ? (icy ? 1.8 : 14) : this.inWater ? 6 : steering ? 4 : 0.6;
      const k = Math.min(1, accel * dt);
      this.vel.x += (wx - this.vel.x) * k;
      this.vel.z += (wz - this.vel.z) * k;
    }
    // knockback impulse decays separately
    this.vel.x += this.knock.x; this.vel.z += this.knock.z;
    if (this.knock.y) { this.vel.y = Math.max(this.vel.y, this.knock.y); }
    this.knock.set(0, 0, 0);

    if (this.fly) {
      const up = 8 * Math.max(1, FLY_GEARS[this.flyGear || 0] / 2);
      this.vel.y = inp.jump ? up : inp.down ? -up : 0;
      this.fallStart = null;
    } else if (this.inWater || this.inMagma) {
      this.vel.y -= 10 * dt;
      this.vel.y = Math.max(this.vel.y, -3);
      if (inp.jump) this.vel.y = Math.min(this.vel.y + 30 * dt, 4);
    } else {
      this.vel.y -= 28 * dt;
      this.vel.y = Math.max(this.vel.y, -50);
      // coyote time: a jump still counts just after running off an edge
      if (inp.jump && (this.onGround || this.coyote > 0)) { this.vel.y = 8.6; this.onGround = false; this.coyote = 0; game && game.audio && game.audio.sfx('jump'); }
    }

    const prevY = this.pos.y;
    const hx = this.vel.x, hz = this.vel.z;
    const o = moveBody(world, this.pos, this.vel, PLAYER_W, PLAYER_H, dt, this._out);
    // Auto-jump up single blocks (mobile-friendly)
    if (this.autoJump && this.onGround && (o.hitX || o.hitZ) && (Math.abs(inp.move.x) + Math.abs(inp.move.z) > 0.3) && !this.inWater) {
      const ax = this.pos.x + Math.sign(hx) * (o.hitX ? 0.6 : 0), az = this.pos.z + Math.sign(hz) * (o.hitZ ? 0.6 : 0);
      const by = Math.floor(this.pos.y);
      if (world.isSolidAt(ax, by, az) && !world.isSolidAt(ax, by + 1, az) && !world.isSolidAt(ax, by + 2, az) && !world.isSolidAt(this.pos.x, by + 2, this.pos.z)) {
        this.vel.y = 8.2;
      }
    }
    // Fall damage
    if (!o.onGround && this.vel.y < 0 && this.fallStart === null) this.fallStart = prevY;
    if (this.vel.y >= 0 && !o.onGround) this.fallStart = null;
    if (o.onGround) {
      if (this.fallStart !== null && !this.inWater) {
        const d = this.fallStart - this.pos.y;
        if (d > 3.5 && game) game.damagePlayer(Math.floor(d - 3), 'fall');
      }
      this.fallStart = null;
    }
    if (this.inWater) this.fallStart = null;
    this.onGround = o.onGround;
    // flying down onto the ground lands
    if (this.fly && o.onGround && inp.down) this.fly = false;
    if (o.onGround) this.coyote = 0.12;
    else if (this.coyote > 0) this.coyote -= dt;
    if (o.onGround && this.airLock > 0 && this.vel.y <= 0) this.airLock = 0;
    this.moving = Math.hypot(this.vel.x, this.vel.z) > 0.5 && this.onGround;
    if (this.moving) this.walkPhase += dt * Math.hypot(this.vel.x, this.vel.z) * 1.6;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.invuln > 0) this.invuln -= dt;
  }

  // Is the block cell occupied by the player's body?
  intersectsBlock(x, y, z) {
    const h = PLAYER_W / 2;
    return x + 1 > this.pos.x - h && x < this.pos.x + h && z + 1 > this.pos.z - h && z < this.pos.z + h && y + 1 > this.pos.y && y < this.pos.y + PLAYER_H;
  }
}

export { IS_SOLID };
