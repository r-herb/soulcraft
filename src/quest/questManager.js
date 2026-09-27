// Treasure Quest runtime: checkpoints, level objectives, gates, traps,
// levers, memory tiles, crumbling bridges, jump pads, keys, monsters, the
// final boss and the treasure chest.
import * as THREE from 'three';
import { LEVELS, F, SPACING, levelAt, QUEST_SEED, LEVEL_COUNT } from '../world/quest.js';
import { B, BLOCKS } from '../world/blocks.js';
import { t } from '../i18n/index.js';
import { HoardGolem } from '../bosses/hoardGolem.js';
import { storeProfile } from '../save/account.js';

export function newQuestState() {
  return { checkpoint: 0, solved: [0], hasMap: false, keys: [false, false, false], falls: 0, done: false, rewarded: false, started: 0 };
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
  }

  genExtra() { return { solved: this.state.solved.slice() }; }

  solved(i) { return this.state.solved.includes(i); }

  // Current level = where the player stands on the course.
  current() { return levelAt(this.player.pos.x); }

  respawnPoint() { return LEVELS[this.state.checkpoint].spawn; }

  // ---------- helpers ----------
  setBlocks(x0, y0, z0, x1, y1, z1, id) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.world.setBlock(x, y, z, id, false);
  }
  openGate(i) { const o = LEVELS[i].ox; this.setBlocks(o + 52, F + 1, -2, o + 52, F + 4, 2, B.air); }
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
    // falling off the course or into magma: back to the checkpoint
    if (p.pos.y < F - 12 || p.inMagma) {
      st.falls++;
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
      default: break;
    }
    // crumbling blocks respawn wherever the player is
    this.tickCrumbles(dt);
  }

  enterLevel(i) {
    const L = LEVELS[i];
    if (!L) return;
    if (L.kind === 'boss' && !this.solved(i)) this.game.ui.tutorial('questBoss');
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
    if (this.den) { for (const m of this.den.mobs) m.dead = true; this.den = null; const g = LEVELS[4].entryGate; this.setBlocks(g[0], g[1], g[2], g[3], g[4], g[5], B.air); }
    if (this.memory) this.resetMemory();
    const bl = LEVELS[12];
    if (!this.solved(12)) this.setBlocks(bl.entryGate[0], bl.entryGate[1], bl.entryGate[2], bl.entryGate[3], bl.entryGate[4], bl.entryGate[5], B.air);
    this.patrolsSpawned = false;
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
    if (!this.solved(L.i) && p.pos.x >= L.reachX && p.onGround) this.solve(L.i);
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
      this.den = { mobs, total: mobs.length };
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
    if (id === B.treasure_chest) { this.openChest(); return true; }
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
      g.bosses.startCustom(new HoardGolem(g, a));
    }
  }

  onBossDefeated() {
    const L = LEVELS[12];
    const gt = L.entryGate;
    this.setBlocks(gt[0], gt[1], gt[2], gt[3], gt[4], gt[5], B.air);
    this.solve(12);
    this.game.ui.toast(t('quest.vaultOpen'), 'soul');
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
    await g.save(true);
    setTimeout(() => { if (g.running) g.ui.open('questComplete'); }, 1200);
  }

  // HUD objective: [title, detail]
  objective() {
    const st = this.state;
    const cur = this.current();
    if (st.done) return [t('quest.name'), t('quest.obj.done')];
    const L = LEVELS[cur];
    const head = cur === 0 ? t('quest.lvl.0') : cur <= LEVEL_COUNT ? t('quest.levelOf', { n: cur, total: LEVEL_COUNT }) + ' · ' + t('quest.lvl.' + cur) : t('quest.lvl.13');
    let detail = t('quest.obj.' + cur);
    if (this.solved(cur) && cur > 0 && cur < 13) detail = t('quest.obj.gateOpen');
    else if (L.kind === 'den' && this.den) detail += ` (${this.den.mobs.filter((m) => m.dead).length}/${this.den.total})`;
    else if (L.kind === 'keys') detail += ` (${st.keys.filter(Boolean).length}/3)`;
    else if (L.kind === 'memory' && this.memory && this.memory.phase === 'input') detail = t('quest.yourTurn') + ` (${this.memory.input}/${this.memory.seq.length})`;
    else if (L.kind === 'levers') detail += ` (${this.levers.filter(Boolean).length}/4)`;
    return [head, detail];
  }

  progress() { return Math.min(LEVEL_COUNT, this.state.solved.filter((i) => i > 0 && i <= LEVEL_COUNT).length); }

  // dev: solve the current level and jump to the next one
  devSkip() {
    const cur = this.current();
    if (cur === 1) { this.state.hasMap = true; }
    if (cur === 7) this.state.keys = [true, true, true];
    for (let i = 0; i <= Math.min(cur, 12); i++) if (!this.solved(i)) this.solve(i, true);
    const next = Math.min(13, cur + 1);
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
