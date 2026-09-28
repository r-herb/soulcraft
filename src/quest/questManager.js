// Treasure Quest runtime: checkpoints, level objectives, gates, traps,
// levers, memory tiles, crumbling bridges, jump pads, keys, monsters, the
// final boss and the treasure chest.
import * as THREE from 'three';
import { LEVELS, F, SPACING, levelAt, QUEST_SEED, LEVEL_COUNT, CH2_FIRST, CH2_LAST, CH2_VAULT, CH2_COUNT } from '../world/quest.js';
import { B, BLOCKS } from '../world/blocks.js';
import { t } from '../i18n/index.js';
import { HoardGolem } from '../bosses/hoardGolem.js';
import { FrostWarden } from '../bosses/frostWarden.js';
import { storeProfile } from '../save/account.js';

export function newQuestState() {
  return { checkpoint: 0, solved: [0], hasMap: false, keys: [false, false, false], falls: 0, done: false, rewarded: false, started: 0, done2: false, rewarded2: false };
}

export class QuestManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  get state() { return this.game.meta.quest; }
  get world() { return this.game.world; }
  get player() { return this.game.player; }

  reset() {
    this.trapT = 0;
    this.crumbles = new Map();
    this.den = null;
    this.memory = null;
    this.levers = [false, false, false, false];
    this.keyDrops = [];
    this.mapDrop = null;
    this.patrolsSpawned = false;
    this.plankGiven = false;
    this.last = -1;
    // chapter 2
    this.blinkT = 0; this.blinkOn = [];
    this.jetT = 0; this.jetState = [];
    this.plates = null;
    this.race = null; this.orbDrops = [];
    this.bossLevel = 12;
  }

  genExtra() { return { solved: this.state.solved.slice() }; }

  solved(i) { return this.state.solved.includes(i); }

  // Current level = where the player stands on the course.
  current() { return levelAt(this.player.pos.x); }

  // falls and deaths per level (the admin's statistics show where players struggle)
  noteFail(level = this.current()) {
    const f = this.state.fails || (this.state.fails = {});
    f[level] = (f[level] || 0) + 1;
  }

  respawnPoint() { return LEVELS[this.state.checkpoint].spawn; }

  // ---------- helpers ----------
  setBlocks(x0, y0, z0, x1, y1, z1, id) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.world.setBlock(x, y, z, id, false);
  }
  openGate(i) {
    const o = LEVELS[i].ox;
    if (i === 13) { this.setBlocks(o + 19, F + 1, -2, o + 19, F + 4, 2, B.air); return; } // the vault's back door
    this.setBlocks(o + 52, F + 1, -2, o + 52, F + 4, 2, B.air);
  }
  underFeet() { const p = this.player.pos; return { x: Math.floor(p.x), y: Math.floor(p.y - 0.05), z: Math.floor(p.z) }; }

  solve(i, silent = false) {
    if (this.solved(i)) return;
    this.state.solved.push(i);
    this.openGate(i);
    if (!silent) {
      this.game.audio.sfx('levelup');
      this.game.ui.toast(t('quest.levelDone', { n: i }), 'ok');
      this.game.vibrate(60);
    }
    this.game.save(true);
  }

  // ---------- main loop ----------
  update(dt) {
    const g = this.game, p = this.player, st = this.state;
    if (p.dead) return;
    const cur = this.current();
    const L = LEVELS[cur];
    // checkpoints: stepping onto a new level's entry platform
    if (cur > st.checkpoint && p.pos.x >= L.ox && p.pos.x < L.ox + 6 && p.onGround && this.solved(cur - 1)) {
      st.checkpoint = cur;
      g.ui.toast(t('quest.checkpoint'), 'soul');
      g.audio.sfx('pickup');
      g.save(true);
    }
    if (cur !== this.last) { this.enterLevel(cur); this.last = cur; }
    // players who finished chapter 1 before chapter 2 existed: open the door
    if (st.rewarded && !this.solved(13)) this.solve(13, true);
    // falling off the course or into magma: back to the checkpoint
    if (p.pos.y < F - 12 || p.inMagma) {
      st.falls++;
      this.noteFail(cur);
      if (p.inMagma) g.damagePlayer(4, 'magma');
      if (!p.dead) this.toCheckpoint(t(p.inMagma ? 'quest.burned' : 'quest.fell'));
      return;
    }
    switch (L.kind) {
      case 'map': this.updateMap(L); break;
      case 'reach': this.updateReach(L, dt); break;
      case 'den': this.updateDen(L); break;
      case 'keys': this.updateKeys(L); break;
      case 'memory': this.updateMemory(L, dt); break;
      case 'build': this.updateBuild(L); break;
      case 'boss': this.updateBoss(L); break;
      case 'plates': this.updatePlates(L, dt); break;
      case 'orbs': this.updateOrbs(L, dt); break;
      default: break;
    }
    // crumbling blocks respawn wherever the player is
    this.tickCrumbles(dt);
  }

  enterLevel(i) {
    const L = LEVELS[i];
    if (!L) return;
    if (L.kind === 'boss' && !this.solved(i)) this.game.ui.tutorial(i === CH2_LAST ? 'questBoss2' : 'questBoss');
  }

  toCheckpoint(msg) {
    const p = this.player;
    const s = this.respawnPoint();
    p.pos.set(s.x, s.y, s.z);
    p.vel.set(0, 0, 0);
    p.fallStart = null;
    p.yaw = -Math.PI / 2; // face +x, down the course
    p.pitch = 0;
    if (msg) this.game.ui.toast(msg, 'warn');
    this.onRespawn();
  }

  // Called after death or a fall: undo half-finished level state.
  onRespawn() {
    for (const e of this.game.entities.list) if (e.questMob) e.dead = true;
    if (this.den) { for (const m of this.den.mobs) m.dead = true; const g = LEVELS[this.den.level].entryGate; this.setBlocks(g[0], g[1], g[2], g[3], g[4], g[5], B.air); this.den = null; }
    if (this.memory) this.resetMemory();
    for (const i of [12, CH2_LAST]) {
      const bl = LEVELS[i];
      if (!this.solved(i)) this.setBlocks(bl.entryGate[0], bl.entryGate[1], bl.entryGate[2], bl.entryGate[3], bl.entryGate[4], bl.entryGate[5], B.air);
    }
    this.patrolsSpawned = false;
    if (this.race) this.resetRace(false);
    if (this.plates) this.resetPlates();
  }

  // ---------- level kinds ----------
  updateMap(L) {
    const st = this.state;
    if (st.hasMap) { if (!this.solved(1)) this.solve(1); return; }
    if (this.game.inventory.count('treasure_map') > 0) {
      st.hasMap = true;
      this.solve(1, true);
      this.game.audio.sfx('victory');
      this.game.ui.toast(t('quest.mapFound'), 'soul');
      setTimeout(() => { if (this.game.running) this.game.ui.open('treasureMap'); }, 900);
      return;
    }
    if (!this.mapDrop || this.mapDrop.dead) {
      const c = this.world.chunkAt(L.mapAt.x, L.mapAt.z);
      if (!c || !c.data) return;
      this.mapDrop = this.game.entities.dropItem('treasure_map', 1, new THREE.Vector3(L.mapAt.x, L.mapAt.y, L.mapAt.z), new THREE.Vector3());
      this.mapDrop.life = 1e9;
      this.mapDrop.pickDelay = 0;
    }
  }

  updateReach(L, dt) {
    const p = this.player;
    if (L.traps) this.updateTraps(L, dt);
    if (L.pads) this.updatePads(L);
    if (L.patrols && !this.patrolsSpawned && !this.solved(L.i) && p.pos.x > L.ox + 6) {
      this.patrolsSpawned = true;
      for (const m of L.patrols) { const mob = this.game.entities.spawnMob(m.type, m.x, F + 1.05, m.z); mob.noDrops = true; mob.questMob = true; }
    }
    if (L.crumbles) {
      const f = this.underFeet();
      if (p.onGround && this.world.getBlock(f.x, f.y, f.z) === B.crumble) {
        const k = f.x + ',' + f.z;
        if (!this.crumbles.has(k)) this.crumbles.set(k, { x: f.x, y: f.y, z: f.z, t: 0.45, state: 'shaking' });
      }
    }
    if (L.blinks) this.updateBlinks(L, dt);
    if (L.vents) this.updateVents(L, dt);
    if (L.jets) this.updateJets(L, dt);
    if (!this.solved(L.i) && p.pos.x >= L.reachX && p.onGround) this.solve(L.i);
  }

  // ---------- chapter 2 mechanics ----------
  // Blink bridges: each pad is solid for a while, then fades out.
  blinkIsOn(L, b, t = this.blinkT) { return ((t + b.phase) % L.blinkPeriod) < L.blinkOn; }
  updateBlinks(L, dt) {
    this.blinkT += dt;
    L.blinks.forEach((b, k) => {
      const on = this.blinkIsOn(L, b);
      if (this.blinkOn[k] === on) return;
      this.blinkOn[k] = on;
      this.setBlocks(b.x0, F, b.z0, b.x1, F, b.z1, on ? B.blink_on : B.blink_off);
      if (Math.abs(this.player.pos.x - b.x0) < 12) this.game.audio.sfx(on ? 'pickup' : 'click');
    });
  }

  // Updrafts: standing in a vent's column lifts the player up to its top.
  inVent(L, x, y, z) { return L.vents.find((v) => x >= v.x0 && x < v.x1 + 1 && z >= v.z0 && z < v.z1 + 1 && y >= F + 0.5 && y < v.top + 1.5); }
  updateVents(L, dt) {
    const p = this.player;
    const v = this.inVent(L, p.pos.x, p.pos.y, p.pos.z);
    if (v) {
      const want = p.pos.y < v.top ? 9 : 0.5;
      p.vel.y += (want - p.vel.y) * Math.min(1, 8 * dt);
      p.fallStart = null;
      p.onGround = false;
    }
    if (Math.random() < dt * 30) {
      const w = L.vents[Math.floor(Math.random() * L.vents.length)];
      this.game.entities.particles.drift(w.x0 + Math.random() * 2, F + 1 + Math.random() * 3, w.z0 + Math.random() * 3, 0.75, 0.97, 0.93, 0, 6 + Math.random() * 3, 0, 2.2);
    }
  }

  // Frost jets: rows of floor vents glow, then blast upward for a moment.
  jetPhase(L, r, t = this.jetT) { return (t + r.phase) % L.jetPeriod; }
  updateJets(L, dt) {
    this.jetT += dt;
    const p = this.player;
    L.jets.forEach((r, k) => {
      const ph = this.jetPhase(L, r);
      const state = ph < 1.4 ? 'off' : ph < 2 ? 'warn' : 'fire';
      if (this.jetState[k] !== state) {
        this.jetState[k] = state;
        this.setBlocks(r.x, F, L.z0, r.x, F, L.z1, state === 'off' ? B.jet : B.jet_lit);
        if (state === 'fire' && Math.abs(p.pos.x - r.x) < 14) this.game.audio.sfx('wind');
      }
      if (state === 'fire') {
        if (Math.random() < dt * 40) this.game.entities.particles.drift(r.x + Math.random(), F + 1, L.z0 + Math.random() * (L.z1 - L.z0 + 1), 0.9, 1, 1, 0, 9, 0, 0.5);
        if (Math.abs(p.pos.x - (r.x + 0.5)) < 0.8 && p.pos.y < F + 4 && !p.dead && !(p.invuln > 0)) {
          this.game.damagePlayer(3, 'mob', t('quest.jet'), new THREE.Vector3(-1, 0, 0));
        }
      }
    });
  }

  // Frost plates: stepping on one lights it for a while; light all four at once.
  resetPlates() {
    const L = LEVELS[17];
    for (const pl of L.plates) this.world.setBlock(pl.x, F, pl.z, B.plate_off, false);
    this.plates = null;
  }
  updatePlates(L, dt) {
    if (this.solved(L.i)) return;
    if (!this.plates) this.plates = L.plates.map(() => 0);
    const p = this.player, fx = Math.floor(p.pos.x), fz = Math.floor(p.pos.z);
    L.plates.forEach((pl, k) => {
      if (p.onGround && fx === pl.x && fz === pl.z && Math.floor(p.pos.y - 0.05) === F) {
        if (this.plates[k] <= 0) { this.world.setBlock(pl.x, F, pl.z, B.plate_on, false); this.game.audio.sfx('pickup'); }
        this.plates[k] = L.plateTime;
      } else if (this.plates[k] > 0) {
        this.plates[k] -= dt;
        if (this.plates[k] <= 0) { this.world.setBlock(pl.x, F, pl.z, B.plate_off, false); this.game.audio.sfx('warn'); }
      }
    });
    if (this.plates.every((v) => v > 0)) { this.plates = null; this.solve(L.i); }
  }

  // Orb race: collect every frost orb before the time runs out.
  resetRace(toast = true) {
    const g = this.game;
    g.inventory.remove('frost_orb', g.inventory.count('frost_orb'));
    for (const d of this.orbDrops) if (d) d.dead = true;
    this.orbDrops = [];
    this.race = null;
    if (toast) { g.ui.toast(t('quest.raceLost'), 'warn'); g.audio.sfx('warn'); }
  }
  updateOrbs(L, dt) {
    const g = this.game, p = this.player;
    if (this.solved(L.i)) return;
    if (!this.race) {
      if (p.pos.x < L.startX) return;
      this.race = { t: L.raceTime, got: L.orbs.map(() => false) };
      g.ui.toast(t('quest.raceGo', { s: L.raceTime }), 'soul');
    }
    const r = this.race;
    r.t -= dt;
    L.orbs.forEach((o, i) => {
      if (r.got[i]) return;
      const d = this.orbDrops[i];
      if (d && d.dead) { if (d.count <= 0) { r.got[i] = true; g.audio.sfx('crystal'); } this.orbDrops[i] = null; return; }
      if (!d) {
        const c = this.world.chunkAt(o.x, o.z);
        if (!c || !c.data) return;
        const drop = g.entities.dropItem('frost_orb', 1, new THREE.Vector3(o.x, o.y, o.z), new THREE.Vector3());
        drop.life = 1e9; drop.pickDelay = 0; drop.gravity = 0;
        this.orbDrops[i] = drop;
      }
    });
    if (r.got.every(Boolean)) {
      g.inventory.remove('frost_orb', g.inventory.count('frost_orb'));
      this.race = null;
      this.solve(L.i);
    } else if (r.t <= 0) this.resetRace(true);
  }

  updateTraps(L, dt) {
    this.trapT += dt;
    const period = 2.2;
    for (const tr of L.traps) {
      const ph = (this.trapT + tr.phase) % period;
      const lit = ph > period - 0.7;
      const want = lit ? B.trap_lit : B.trap;
      if (this.world.getBlock(tr.x, tr.y, tr.z) !== want) this.world.setBlock(tr.x, tr.y, tr.z, want, false);
      if (tr.last !== undefined && ph < tr.last) {
        // fire across the corridor
        const from = new THREE.Vector3(tr.x + 0.5, tr.y + 0.5, tr.z + 0.5 + tr.dir * 0.8);
        this.game.entities.spawnProjectile({ kind: 'arrow', pos: from, vel: new THREE.Vector3(0, 0.6, tr.dir * 16), damage: 3, owner: 'mob', sourceName: t('quest.trap'), gravity: 2, life: 1.5 });
        if (Math.abs(this.player.pos.x - tr.x) < 10) this.game.audio.sfx('shoot');
      }
      tr.last = ph;
    }
  }

  updatePads(L) {
    const p = this.player;
    const f = this.underFeet();
    if (p.onGround && this.world.getBlock(f.x, f.y, f.z) === B.jump_pad) {
      p.vel.set(L.launch.x, L.launch.y, L.launch.z);
      p.airLock = 1.2;
      p.onGround = false;
      p.fallStart = null;
      this.game.audio.sfx('wind');
      this.game.entities.particles.emit(p.pos.x, p.pos.y, p.pos.z, 0.7, 1, 0.5, 20, 5, 0.5, false);
    }
    // no fall damage from pad flights
    if (p.vel.y > 0) p.fallStart = null;
  }

  tickCrumbles(dt) {
    for (const [k, c] of this.crumbles) {
      c.t -= dt;
      if (c.state === 'shaking' && c.t <= 0) {
        this.world.setBlock(c.x, c.y, c.z, B.air, false);
        this.game.entities.burst(c.x + 0.5, c.y + 0.5, c.z + 0.5, BLOCKS[B.crumble].tex.side);
        this.game.audio.sfx('break');
        c.state = 'gone'; c.t = 3;
      } else if (c.state === 'gone' && c.t <= 0) {
        if (this.player.intersectsBlock(c.x, c.y, c.z)) { c.t = 0.5; continue; }
        this.world.setBlock(c.x, c.y, c.z, B.crumble, false);
        this.crumbles.delete(k);
      }
    }
  }

  updateDen(L) {
    const p = this.player;
    if (this.solved(L.i)) return;
    if (!this.den && p.pos.x > L.enterX && p.pos.x < L.ox + 49) {
      const gt = L.entryGate;
      this.setBlocks(gt[0], gt[1], gt[2], gt[3], gt[4], gt[5], B.quest_gate);
      const mobs = L.spawns.map(([type, x, z]) => { const m = this.game.entities.spawnMob(type, x + 0.5, F + 1.05, z + 0.5); m.noDrops = true; m.questMob = true; return m; });
      this.den = { mobs, total: mobs.length, level: L.i };
      this.game.audio.sfx('roar');
      this.game.ui.toast(t('quest.denClosed'), 'warn');
    }
    if (this.den && this.den.mobs.every((m) => m.dead)) {
      const gt = L.entryGate;
      this.setBlocks(gt[0], gt[1], gt[2], gt[3], gt[4], gt[5], B.air);
      this.den = null;
      this.solve(L.i);
    }
  }

  // Levers: each flips its own lamp and its neighbours; light all four.
  interact(hit) {
    const L = LEVELS[this.current()];
    const id = hit.id;
    if ((id === B.lever_off || id === B.lever_on) && L.kind === 'levers' && !this.solved(L.i)) {
      const i = L.levers.findIndex((l) => l.x === hit.x && l.y === hit.y && l.z === hit.z);
      if (i < 0) return true;
      for (const k of [i - 1, i, i + 1]) if (k >= 0 && k < 4) this.levers[k] = !this.levers[k];
      this.world.setBlock(hit.x, hit.y, hit.z, id === B.lever_off ? B.lever_on : B.lever_off, false);
      L.lamps.forEach((lp, k) => this.world.setBlock(lp.x, lp.y, lp.z, this.levers[k] ? B.lamp_on : B.lamp_off, false));
      this.game.audio.sfx('click');
      if (this.levers.every(Boolean)) this.solve(L.i);
      return true;
    }
    if (id === B.treasure_chest) { if (this.current() === CH2_VAULT) this.openChest2(); else this.openChest(); return true; }
    return id === B.lever_off || id === B.lever_on;
  }

  updateKeys(L) {
    const st = this.state, g = this.game;
    if (this.solved(L.i)) return;
    L.keys.forEach((k, i) => {
      if (st.keys[i]) return;
      const d = this.keyDrops[i];
      if (d && d.dead) {
        if (d.count <= 0) { st.keys[i] = true; g.audio.sfx('crystal'); g.ui.toast(t('quest.keyFound', { n: st.keys.filter(Boolean).length }), 'soul'); }
        this.keyDrops[i] = null;
        return;
      }
      if (!d) {
        const c = this.world.chunkAt(k.x, k.z);
        if (!c || !c.data) return;
        const drop = g.entities.dropItem('golden_key', 1, new THREE.Vector3(k.x, k.y, k.z), new THREE.Vector3());
        drop.life = 1e9; drop.pickDelay = 0; drop.gravity = 0;
        this.keyDrops[i] = drop;
      }
    });
    if (st.keys.every(Boolean)) {
      g.inventory.remove('golden_key', g.inventory.count('golden_key'));
      this.solve(L.i);
    }
  }

  // Memory tiles: watch the sequence, then step on the tiles in order.
  resetMemory() {
    const L = LEVELS[8];
    for (const tl of L.tiles) this.setBlocks(tl.x0, F, tl.z0, tl.x0 + 1, F, tl.z0 + 1, B.tile_off);
    this.memory = null;
  }
  updateMemory(L, dt) {
    const p = this.player;
    if (this.solved(L.i)) return;
    if (!this.memory) {
      if (p.pos.x < L.startX) return;
      const rnd = mulberry(Date.now() & 0xffff);
      const seq = [];
      while (seq.length < 5) { const n = Math.floor(rnd() * 9); if (seq[seq.length - 1] !== n) seq.push(n); }
      this.memory = { seq, phase: 'show', i: 0, t: 1.2, on: false, input: 0, lastTile: -1 };
      this.game.ui.toast(t('quest.watch'), 'soul');
    }
    const m = this.memory;
    const paint = (n, id) => { const tl = L.tiles[n]; this.setBlocks(tl.x0, F, tl.z0, tl.x0 + 1, F, tl.z0 + 1, id); };
    m.t -= dt;
    if (m.phase === 'show') {
      if (m.t > 0) return;
      if (m.on) { paint(m.seq[m.i], B.tile_off); m.on = false; m.i++; m.t = 0.25; if (m.i >= m.seq.length) { m.phase = 'input'; m.input = 0; this.game.ui.toast(t('quest.yourTurn'), 'ok'); } }
      else { paint(m.seq[m.i], B.tile_lit); this.game.audio.sfx('pickup'); m.on = true; m.t = 0.75; }
      return;
    }
    if (m.phase === 'wrong') { if (m.t <= 0) { for (let n = 0; n < 9; n++) paint(n, B.tile_off); m.phase = 'show'; m.i = 0; m.on = false; m.t = 0.6; } return; }
    if (m.phase === 'done') return;
    // input: which tile is the player standing on?
    if (!p.onGround) return;
    const fx = Math.floor(p.pos.x), fz = Math.floor(p.pos.z);
    const n = L.tiles.findIndex((tl) => fx >= tl.x0 && fx <= tl.x0 + 1 && fz >= tl.z0 && fz <= tl.z0 + 1);
    if (n === m.lastTile) return;
    m.lastTile = n;
    if (n < 0) return;
    if (n === m.seq[m.input]) {
      paint(n, B.tile_ok);
      this.game.audio.sfx('trade');
      m.input++;
      if (m.input >= m.seq.length) { m.phase = 'done'; this.solve(L.i); }
    } else {
      this.game.audio.sfx('warn');
      this.game.ui.toast(t('quest.wrongTile'), 'warn');
      for (let k = 0; k < 9; k++) paint(k, B.tile_lit);
      m.phase = 'wrong'; m.t = 1.2; m.lastTile = -1;
    }
  }

  updateBuild(L) {
    const p = this.player, g = this.game;
    if (!this.plankGiven && p.pos.x > L.ox + 6 && !this.solved(L.i)) {
      this.plankGiven = true;
      const have = g.inventory.count('planks');
      if (have < L.planks) g.giveItem('planks', L.planks - have);
      g.ui.toast(t('quest.planks'), 'soul');
    }
    if (!this.solved(L.i) && p.pos.x >= L.reachX && p.onGround) this.solve(L.i);
  }

  canPlace(x, y, z) {
    const z11 = LEVELS[11].buildZone;
    return x >= z11.x0 && x <= z11.x1 && y >= z11.y0 && y <= z11.y1 && z >= z11.z0 && z <= z11.z1;
  }
  // First empty cell along the view ray (within reach) inside the build zone
  // that touches the bridge horizontally - used for easy bridging.
  bridgeCell(eye, dir, hit) {
    const Z = LEVELS[11].buildZone;
    const w = this.world;
    const maxT = hit ? Math.min(hit.dist, 5) : 5;
    for (let s = 0.5; s <= maxT; s += 0.1) {
      const x = Math.floor(eye.x + dir.x * s), y = Math.floor(eye.y + dir.y * s), z = Math.floor(eye.z + dir.z * s);
      if (y !== F) continue;
      if (!this.canPlace(x, y, z) || w.getBlock(x, y, z) !== B.air) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const id = w.getBlock(x + dx, y, z + dz); return id > 0 && BLOCKS[id].solid; })) return { x, y, z };
    }
    void Z;
    return null;
  }

  canBreak(hit) { return hit.id === B.planks && this.canPlace(hit.x, hit.y, hit.z); }

  updateBoss(L) {
    const g = this.game, p = this.player;
    if (this.solved(L.i) || g.bosses.active) return;
    const a = L.arena;
    if (Math.hypot(p.pos.x - a.x, p.pos.z - a.z) < a.r - 3 && p.onGround) {
      const gt = L.entryGate;
      this.setBlocks(gt[0], gt[1], gt[2], gt[3], gt[4], gt[5], B.quest_gate);
      this.bossLevel = L.i;
      g.bosses.startCustom(L.boss === 'frostWarden' ? new FrostWarden(g, a) : new HoardGolem(g, a));
    }
  }

  onBossDefeated() {
    const L = LEVELS[this.bossLevel];
    const gt = L.entryGate;
    this.setBlocks(gt[0], gt[1], gt[2], gt[3], gt[4], gt[5], B.air);
    this.solve(L.i);
    this.game.ui.toast(t(L.i === CH2_LAST ? 'quest.vault2Open' : 'quest.vaultOpen'), 'soul');
  }

  async openChest() {
    const g = this.game, st = this.state;
    if (st.done && st.rewarded) { g.ui.open('questComplete'); return; }
    st.done = true;
    const prof = g.profile;
    if (!st.rewarded) {
      st.rewarded = true;
      if (!prof.skins.includes('treasure')) prof.skins.push('treasure');
      prof.skin = 'treasure';
      prof.rewards = { ...(prof.rewards || {}), starfall: true };
      g.held.setSkin('treasure');
      g.giveItem('starfall_blade', 1);
      g.addCrystals(250);
      await storeProfile(prof);
    }
    g.audio.sfx('victory');
    const c = LEVELS[13].chest;
    g.entities.particles.emit(c.x + 0.5, c.y + 1, c.z + 0.5, 1, 0.85, 0.3, 90, 7, 1.6);
    this.solve(13, true); // the back door to chapter 2
    await g.save(true);
    setTimeout(() => { if (g.running) g.ui.open('questComplete'); }, 1200);
  }

  async openChest2() {
    const g = this.game, st = this.state;
    if (st.done2 && st.rewarded2) { g.ui.open('questComplete', { chapter: 2 }); return; }
    st.done2 = true;
    const prof = g.profile;
    if (!st.rewarded2) {
      st.rewarded2 = true;
      if (!prof.skins.includes('frost_monarch')) prof.skins.push('frost_monarch');
      prof.skin = 'frost_monarch';
      prof.rewards = { ...(prof.rewards || {}), frostbrand: true };
      g.held.setSkin('frost_monarch');
      g.giveItem('frostbrand', 1);
      g.addCrystals(300);
      await storeProfile(prof);
    }
    g.audio.sfx('victory');
    const c = LEVELS[CH2_VAULT].chest;
    g.entities.particles.emit(c.x + 0.5, c.y + 1, c.z + 0.5, 0.7, 0.95, 1, 90, 7, 1.6);
    await g.save(true);
    setTimeout(() => { if (g.running) g.ui.open('questComplete', { chapter: 2 }); }, 1200);
  }

  // HUD objective: [title, detail]
  objective() {
    const st = this.state;
    const cur = this.current();
    if (st.done2 && cur >= CH2_FIRST) return [t('quest.ch2'), t('quest.obj.done2')];
    if (st.done && cur <= 13) return [t('quest.name'), t('quest.obj.toCh2')];
    const L = LEVELS[cur];
    let head;
    if (cur === 0) head = t('quest.lvl.0');
    else if (cur <= LEVEL_COUNT) head = t('quest.levelOf', { n: cur, total: LEVEL_COUNT }) + ' · ' + t('quest.lvl.' + cur);
    else if (cur >= CH2_FIRST && cur <= CH2_LAST) head = t('quest.ch2Short') + ' · ' + t('quest.levelOf', { n: cur - CH2_FIRST + 1, total: CH2_COUNT }) + ' · ' + t('quest.lvl.' + cur);
    else head = t('quest.lvl.' + cur);
    let detail = t('quest.obj.' + cur);
    if (this.solved(cur) && cur > 0 && cur !== 13 && cur < CH2_VAULT) detail = t('quest.obj.gateOpen');
    else if (L.kind === 'plates' && this.plates) detail += ` (${this.plates.filter((v) => v > 0).length}/4)`;
    else if (L.kind === 'orbs' && this.race) detail += ` (${this.race.got.filter(Boolean).length}/${this.race.got.length} · ${Math.max(0, Math.ceil(this.race.t))} s)`;
    else if (L.kind === 'den' && this.den) detail += ` (${this.den.mobs.filter((m) => m.dead).length}/${this.den.total})`;
    else if (L.kind === 'keys') detail += ` (${st.keys.filter(Boolean).length}/3)`;
    else if (L.kind === 'memory' && this.memory && this.memory.phase === 'input') detail = t('quest.yourTurn') + ` (${this.memory.input}/${this.memory.seq.length})`;
    else if (L.kind === 'levers') detail += ` (${this.levers.filter(Boolean).length}/4)`;
    return [head, detail];
  }

  progress() { return Math.min(LEVEL_COUNT, this.state.solved.filter((i) => i > 0 && i <= LEVEL_COUNT).length); }
  progress2() { return this.state.solved.filter((i) => i >= CH2_FIRST && i <= CH2_LAST).length; }

  // dev: solve the current level and jump to the next one
  devSkip() {
    const cur = this.current();
    if (cur === 1) { this.state.hasMap = true; }
    if (cur === 7) this.state.keys = [true, true, true];
    if (cur === 13) { this.state.done = true; this.state.rewarded = true; }
    for (let i = 0; i <= Math.min(cur, CH2_LAST); i++) if (!this.solved(i)) this.solve(i, true);
    if (this.race) this.resetRace(false);
    const next = Math.min(CH2_VAULT, cur + 1);
    this.state.checkpoint = next;
    if (this.game.bosses.active) this.game.bosses.clearActive();
    this.toCheckpoint();
  }
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t2 = Math.imul(a ^ (a >>> 15), 1 | a);
    t2 = (t2 + Math.imul(t2 ^ (t2 >>> 7), 61 | t2)) ^ t2;
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296;
  };
}

export { QUEST_SEED, SPACING };
