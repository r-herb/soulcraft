// Boss progression: starts a fight when the player walks into an unlocked
// arena, runs the active boss, handles loot, defeat, death resets and the
// Trial Chamber's wind charges.
import * as THREE from 'three';
import { ARENAS, CHAMBER } from '../world/structures.js';
import { t } from '../i18n/index.js';
import { VoidDragon } from './voidDragon.js';
import { ShellKing } from './shellKing.js';
import { WhirlwindKing } from './whirlwindKing.js';
import { EmberWarden } from './emberWarden.js';
import { SoulStorm } from './soulStorm.js';

export const BOSS_ORDER = ['voidDragon', 'shellKing', 'whirlwindKing', 'emberWarden', 'soulStorm'];
const CLASSES = { voidDragon: VoidDragon, shellKing: ShellKing, whirlwindKing: WhirlwindKing, emberWarden: EmberWarden, soulStorm: SoulStorm };
// How close (horizontally) the player must come to an arena's centre.
const TRIGGER = { voidDragon: 40, shellKing: 18, whirlwindKing: 17, emberWarden: 17, soulStorm: 20 };
const LOOT = {
  voidDragon: [['void_scale', 3], ['soul_heart', 1], ['bow', 1], ['arrow', 16]],
  shellKing: [['shell_fragment', 3], ['soul_heart', 1], ['iron_ingot', 6]],
  whirlwindKing: [['whirl_core', 1], ['soul_heart', 1], ['gold_ingot', 6], ['emberite_shard', 4]],
  emberWarden: [['ember_heart', 1], ['soul_heart', 2], ['emberite_ingot', 2]],
  soulStorm: [['storm_crown', 1], ['soul_heart', 2]],
};
const CRYSTALS = { voidDragon: 25, shellKing: 35, whirlwindKing: 45, emberWarden: 60, soulStorm: 120 };

// Vault positions along the chamber walls where wind charges appear.
export const VAULTS = [];
for (const v of [-8, 8]) {
  VAULTS.push([18, v], [-18, v], [v, 18], [v, -18]);
}

export class BossManager {
  constructor(game) {
    this.game = game;
    this.active = null;
    this.cooldown = 0;
    this.windT = 0;
    this.windDrops = new Map();
  }

  get meta() { return this.game.meta; }

  unlocked(id) {
    const m = this.meta;
    if (m.devUnlock) return true;
    const i = BOSS_ORDER.indexOf(id);
    for (let k = 0; k < i; k++) if (!m.bosses[BOSS_ORDER[k]]) return false;
    return true;
  }

  restore() { this.cooldown = 2; }

  clearActive() {
    if (this.active) this.active.dispose();
    this.active = null;
  }

  onArrive(dim, where, respawn = false) {
    this.cooldown = respawn ? 4 : 2.5;
    // the Void Dragon hands a bow to anyone who arrives without one
    if (dim === 'void' && !this.meta.bosses.voidDragon && !respawn) {
      const g = this.game;
      if (g.inventory.count('bow') === 0) g.giveItem('bow', 1);
      if (g.inventory.count('arrow') < 24) g.giveItem('arrow', 24 - g.inventory.count('arrow'));
    }
    void where;
  }

  onPlayerDeath() {
    // The fight resets; the guardian returns to full strength.
    this.clearActive();
    for (const e of this.game.entities.list) if (e.bossMinion) e.dead = true;
  }


  update(dt) {
    const g = this.game;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.chamberWind(dt);
    if (this.active) {
      const b = this.active;
      b.update(dt);
      b.sync();
      // leaving the arena ends the fight (the boss resets)
      const d = Math.hypot(g.player.pos.x - b.arena.x, g.player.pos.z - b.arena.z);
      if (d > TRIGGER[b.id] + 40 || g.meta.dim !== b.arena.dim) this.clearActive();
      return;
    }
    if (this.cooldown > 0 || g.player.dead) return;
    const p = g.player.pos;
    for (const id of BOSS_ORDER) {
      const a = ARENAS[id];
      if (a.dim !== g.meta.dim || g.meta.bosses[id] || !this.unlocked(id)) continue;
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d > TRIGGER[id]) continue;
      if (id === 'whirlwindKing' && p.y > CHAMBER.ceil) continue;
      // guardians fight one player at a time: not in a shared world
      if (g.net) { if (!this.mpWarned) { this.mpWarned = true; g.ui.toast(t('mp.noBoss'), 'warn'); setTimeout(() => { this.mpWarned = false; }, 20000); } break; }
      this.start(id);
      break;
    }
  }

  // A fight started by other code (the Treasure Quest's final boss).
  startCustom(boss) {
    const g = this.game;
    this.active = boss;
    g.ui.hud.clearTutorial();
    g.ui._tutShown = null;
    g.ui.hud.titleCard(t('boss.' + boss.id), t('boss.' + boss.id + '.intro'));
    g.audio.sfx('roar');
    g.vibrate(80);
  }

  start(id) {
    const g = this.game;
    this.active = new CLASSES[id](g, ARENAS[id]);
    g.ui.hud.clearTutorial();
    g.ui._tutShown = null;
    g.ui.hud.titleCard(t('boss.' + id), t('boss.' + id + '.intro'));
    g.audio.sfx('roar');
    g.vibrate(80);
  }

  onBossDefeated(b) {
    const g = this.game;
    const id = b.id;
    if (b.questBoss) {
      g.audio.sfx('victory');
      g.ui.toast(t('toast.bossDefeated', { name: t('boss.' + id) }), 'ok');
      const c = b.center();
      g.entities.particles.emit(c.x, c.y, c.z, 1, 0.85, 0.3, 80, 9, 1.4);
      for (const m of b.minions) if (!m.dead) m.dead = true;
      g.addCrystals(80);
      setTimeout(() => { if (this.active === b) this.clearActive(); }, 50);
      if (g.quest) g.quest.onBossDefeated(b);
      return;
    }
    g.meta.bosses[id] = true;
    g.meta.stats.kills++;
    g.audio.sfx('victory');
    g.ui.toast(t('toast.bossDefeated', { name: t('boss.' + id) }), 'ok');
    const c = b.center();
    for (const [item, n] of LOOT[id]) g.entities.dropItem(item, n, new THREE.Vector3(c.x, Math.max(c.y, b.arena.y + 2), c.z), new THREE.Vector3((Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4));
    g.addCrystals(CRYSTALS[id]);
    g.entities.particles.emit(c.x, c.y, c.z, 0.7, 0.95, 1, 80, 9, 1.4);
    for (const m of b.minions) if (!m.dead) { m.dead = true; }
    // let the explosion play, then remove the body
    setTimeout(() => { if (this.active === b) this.clearActive(); }, 50);
    const next = BOSS_ORDER[BOSS_ORDER.indexOf(id) + 1];
    if (next) setTimeout(() => g.ui.toast(t('toast.unlocked', { name: t('boss.' + next) }), 'soul'), 1500);
    g.save(true);
    if (id === 'soulStorm') {
      g.meta.victory = true;
      setTimeout(() => { if (g.running) g.ui.open('victory'); }, 3500);
    }
  }

  // Keep wind charges on the chamber vaults while the player is inside.
  chamberWind(dt) {
    const g = this.game;
    if (g.meta.dim !== 'overworld') return;
    const p = g.player.pos;
    const inside = Math.abs(p.x - CHAMBER.x) < 24 && Math.abs(p.z - CHAMBER.z) < 24 && p.y < CHAMBER.ceil && p.y > CHAMBER.floor - 1;
    if (!inside) return;
    this.windT -= dt;
    if (this.windT > 0) return;
    this.windT = this.active ? 5 : 12;
    let first = false;
    for (const [vx, vz] of VAULTS) {
      const key = vx + ',' + vz;
      const d = this.windDrops.get(key);
      if (d && !d.dead) continue;
      const pos = new THREE.Vector3(CHAMBER.x + vx + 0.5, CHAMBER.floor + 2.3, CHAMBER.z + vz + 0.5);
      const drop = g.entities.dropItem('wind_charge', 2, pos, new THREE.Vector3(0, 0, 0));
      drop.life = 600;
      drop.pickDelay = 0;
      this.windDrops.set(key, drop);
      first = true;
    }
    if (first && !this.shownWind) { this.shownWind = true; g.ui.toast(t('toast.windCharge'), 'soul'); }
  }
}
