// Ambient life: fish in the water everywhere; in cities also swimmers in the
// pools, sunbathers on the beach and walkers in the pedestrian streets. They
// are scenery (nobody fights them) and appear only near the player.
import * as THREE from 'three';
import { B } from '../world/blocks.js';
import { box, humanoid, animateWalk, lambert } from './models.js';
import { isNight } from '../engine/sky.js';

// the city surface codes these use (same list as the city builder)
const S_PAVEMENT = 2, S_MARBLE = 3, S_SAND = 5, S_PLAZA = 9, S_POOL = 18;
const NEAR = 44, FAR = 70;
const MAX = { fish: 14, swimmer: 6, sunbather: 12, walker: 10 };
const FISH_COLOURS = ['#f2a33a', '#d9d9d9', '#6fa8dc', '#e06666', '#ffd966', '#93c47d'];
const PEOPLE = [
  { skin: '#e0ac86', hair: '#3b2a1c', shirt: '#e06666', pants: '#3d85c6' },
  { skin: '#c68642', hair: '#1c1410', shirt: '#ffd966', pants: '#434343' },
  { skin: '#f1c27d', hair: '#a0522d', shirt: '#6fa8dc', pants: '#274e13' },
  { skin: '#8d5524', hair: '#0d0806', shirt: '#ffffff', pants: '#cc4125' },
  { skin: '#ffdbac', hair: '#e8c170', shirt: '#93c47d', pants: '#1f3a5a' },
  { skin: '#d9a066', hair: '#5a3825', shirt: '#b4a7d6', pants: '#5b5b5b' },
];
const SWIM = [{ ...PEOPLE[0], shirt: '#e06666', pants: '#e06666' }, { ...PEOPLE[2], shirt: '#3d85c6', pants: '#3d85c6' }, { ...PEOPLE[3], shirt: '#8d5524', pants: '#ffd966' }];
const TOWELS = ['#e06666', '#6fa8dc', '#ffd966', '#93c47d', '#ff9900', '#c27ba0'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

class Critter {
  constructor(kind, obj) { this.kind = kind; this.object = obj; this.pos = obj.position; this.t = Math.random() * 10; this.dir = Math.random() * Math.PI * 2; }
}

export class AmbientLife {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.spawnT = 0;
  }

  clear() { for (const c of this.list) this.game.scene.remove(c.object); this.list = []; }

  count(kind) { let n = 0; for (const c of this.list) if (c.kind === kind) n++; return n; }

  cityCell(x, z) {
    const c = this.game.city;
    if (!c || this.game.meta.dim !== 'city') return null;
    const a = c.at(x, z);
    return a && { s: a.s, g: a.g, b: a.b };
  }

  update(dt) {
    const g = this.game;
    if (!g.world || !g.outdoors) { if (this.list.length) this.clear(); return; }
    const p = g.player.pos;
    // spawn a few at a time near the player
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.5;
      for (let k = 0; k < 6; k++) this.trySpawn(p);
    }
    const night = isNight(g.meta.time);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const far = Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > FAR;
      // people go home at night
      if (far || (night && c.kind !== 'fish')) { g.scene.remove(c.object); this.list.splice(i, 1); continue; }
      c.t += dt;
      this[c.kind](c, dt);
    }
  }

  trySpawn(p) {
    const g = this.game, w = g.world;
    const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * (NEAR - 10);
    const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
    const cell = this.cityCell(x, z);
    const night = isNight(g.meta.time);
    // fish: any water two blocks deep
    if (this.count('fish') < MAX.fish) {
      let y = 126;
      while (y > 1 && w.getBlock(x, y, z) === B.air) y--;
      if (w.getBlock(x, y, z) === B.water && w.getBlock(x, y - 1, z) === B.water && (!cell || cell.s !== S_POOL)) { this.addFish(x + 0.5, y - 0.6 - Math.random() * 1.5, z + 0.5); return; }
    }
    if (!cell || night || cell.b) return;
    if (cell.s === S_POOL && this.count('swimmer') < MAX.swimmer) this.addSwimmer(x + 0.5, cell.g, z + 0.5);
    else if (cell.s === S_SAND && this.count('sunbather') < MAX.sunbather) this.addSunbather(x + 0.5, cell.g + 1, z + 0.5);
    else if ((cell.s === S_MARBLE || cell.s === S_PLAZA) && this.count('walker') < MAX.walker) this.addWalker(x + 0.5, cell.g + 1, z + 0.5);
  }

  add(kind, obj) { this.game.scene.add(obj); const c = new Critter(kind, obj); this.list.push(c); return c; }

  addFish(x, y, z) {
    const o = new THREE.Group();
    const col = pick(FISH_COLOURS);
    const body = box(0.42, 0.2, 0.14, col); o.add(body);
    const tail = box(0.14, 0.18, 0.05, col); tail.position.x = -0.26; o.add(tail);
    const eye = box(0.04, 0.04, 0.16, '#111'); eye.position.set(0.14, 0.04, 0); o.add(eye);
    o.position.set(x, y, z);
    const c = this.add('fish', o);
    c.y0 = y; c.tail = tail;
  }

  fish(c, dt) {
    const w = this.game.world;
    const sp = 1.2;
    const nx = c.pos.x + Math.cos(c.dir) * sp * dt, nz = c.pos.z + Math.sin(c.dir) * sp * dt;
    if (w.getBlock(Math.floor(nx), Math.floor(c.y0), Math.floor(nz)) !== B.water || Math.random() < dt * 0.3) c.dir += Math.PI * (0.5 + Math.random());
    else { c.pos.x = nx; c.pos.z = nz; }
    c.pos.y = c.y0 + Math.sin(c.t * 1.7) * 0.08;
    c.object.rotation.y = -c.dir;
    c.tail.rotation.y = Math.sin(c.t * 12) * 0.5;
  }

  addSwimmer(x, gy, z) {
    const rig = humanoid(pick(SWIM), 'player', 0.9);
    const o = new THREE.Group();
    // lying face down in the water, head up
    rig.group.rotation.x = Math.PI / 2 - 0.25;
    rig.group.position.y = 0.15;
    o.add(rig.group);
    o.position.set(x, gy + 0.55, z);
    const c = this.add('swimmer', o);
    c.rig = rig;
  }

  swimmer(c, dt) {
    const sp = 0.9;
    const nx = c.pos.x + Math.sin(c.dir) * sp * dt, nz = c.pos.z + Math.cos(c.dir) * sp * dt;
    const cell = this.cityCell(Math.floor(nx), Math.floor(nz));
    if (!cell || cell.s !== S_POOL) c.dir += Math.PI * (0.6 + Math.random() * 0.8);
    else { c.pos.x = nx; c.pos.z = nz; }
    c.object.rotation.y = c.dir;
    c.rig.armL.rotation.x = c.t * 5;
    c.rig.armR.rotation.x = c.t * 5 + Math.PI;
    c.rig.legL.rotation.x = Math.sin(c.t * 9) * 0.35;
    c.rig.legR.rotation.x = -Math.sin(c.t * 9) * 0.35;
  }

  addSunbather(x, y, z) {
    const o = new THREE.Group();
    const towel = box(0.9, 0.04, 2.0, pick(TOWELS)); towel.position.y = 0.02; o.add(towel);
    const rig = humanoid(pick(PEOPLE), 'player', 0.9);
    rig.group.rotation.x = -Math.PI / 2;
    rig.group.position.set(0, 0.2, 0.75);
    rig.armL.rotation.z = -0.3; rig.armR.rotation.z = 0.3;
    o.add(rig.group);
    // some bring a parasol
    if (Math.random() < 0.45) {
      const pole = box(0.06, 2.2, 0.06, '#dddddd'); pole.position.set(0.7, 1.1, -0.2); o.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.3, 0.5, 8), lambert(pick(TOWELS)));
      top.position.set(0.7, 2.3, -0.2); o.add(top);
    }
    o.position.set(x, y, z);
    o.rotation.y = Math.random() * Math.PI * 2;
    this.add('sunbather', o);
  }

  sunbather() {}

  addWalker(x, y, z) {
    const rig = humanoid(pick(PEOPLE), 'player', 0.95);
    const o = new THREE.Group();
    o.add(rig.group);
    o.position.set(x, y, z);
    const c = this.add('walker', o);
    c.rig = rig;
  }

  walker(c, dt) {
    const sp = 1.3;
    const nx = c.pos.x + Math.sin(c.dir) * sp * dt, nz = c.pos.z + Math.cos(c.dir) * sp * dt;
    const cell = this.cityCell(Math.floor(nx), Math.floor(nz));
    if (!cell || cell.b || (cell.s !== S_MARBLE && cell.s !== S_PLAZA && cell.s !== S_PAVEMENT) || Math.random() < dt * 0.1) c.dir += (Math.random() - 0.5) * Math.PI * 1.5;
    else { c.pos.x = nx; c.pos.z = nz; c.pos.y = cell.g + 1; }
    c.object.rotation.y = c.dir;
    animateWalk(c.rig, c.t * 7, 1);
  }
}

