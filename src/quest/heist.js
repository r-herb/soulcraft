// El Gran Golpe: Malaga's big mission. Twelve tasks, picked at random for
// each player from a longer list, send the player all over the city: each
// one done gives a piece of the bank's plan. The twelve pieces make a
// puzzle; put together, the plan shows the weak spot in the vault's back
// wall and where the guards walk. Then the final mission: get into the vault
// of the Banco de España unseen, take the Gran Diamante, get away, and
// trade it at the bank's counter for the biggest sum the game pays. The
// city then elects the player its mayor.
//
// The state is the player's own (in the profile, so it follows them between
// Malaga worlds): profile.heist = { tasks, slots, got, placed, map, robbed,
// escaped, traded, mayor }.
import { t } from '../i18n/index.js';
import { humanoid, box } from '../entities/models.js';
import { account, econ } from '../save/account.js';
import { bankCoords, bankLayout, bankPoint, bankWidth } from '../world/city.js';
import { isNight } from '../engine/sky.js';
import { B } from '../world/blocks.js';

export const PIECES = 12;
// each task: the place to meet the informant, and what is asked first
export const HEIST_POOL = [
  { key: 'airport', steps: [{ ev: 'reach', near: 'Aeropuerto', r: 40 }] },
  { key: 'stadium', steps: [{ ev: 'reach', near: 'La Rosaleda', r: 30 }] },
  { key: 'university', steps: [{ ev: 'reach', near: 'Teatinos (Universidad)', r: 40 }] },
  { key: 'station', steps: [{ ev: 'board' }, { ev: 'getoff', near: 'Estación María Zambrano', r: 200 }, { ev: 'reach', near: 'Estación María Zambrano', r: 30 }] },
  { key: 'market', steps: [{ ev: 'reach', near: 'Mercado de Atarazanas', r: 25 }, { ev: 'buy', item: 'sardine' }] },
  { key: 'elpalo', steps: [{ ev: 'reach', near: 'El Palo', r: 40 }, { ev: 'meal' }] },
  { key: 'pedregalejo', steps: [{ ev: 'reach', near: 'Pedregalejo', r: 40 }, { ev: 'pan', item: 'gold_nugget' }] },
  { key: 'huelin', steps: [{ ev: 'reach', near: 'Huelin', r: 40 }, { ev: 'cache' }] },
  { key: 'misericordia', steps: [{ ev: 'reach', near: 'La Misericordia', r: 40, give: 'quartz' }] },
  { key: 'gibralfaro', steps: [{ ev: 'reach', near: 'Gibralfaro', r: 25 }] },
  { key: 'alcazaba', steps: [{ ev: 'reach', near: 'Alcazaba', r: 25 }] },
  { key: 'cathedral', steps: [{ ev: 'reach', near: 'Catedral', r: 25 }] },
  { key: 'muelle', steps: [{ ev: 'reach', near: 'Muelle Uno', r: 30, give: 'amethyst' }] },
  { key: 'limonar', steps: [{ ev: 'reach', near: 'El Limonar', r: 40, give: 'egg' }] },
  { key: 'jardin', steps: [{ ev: 'reach', near: 'Ciudad Jardín', r: 40 }] },
  { key: 'merced', steps: [{ ev: 'reach', near: 'Plaza de la Merced', r: 25 }] },
  { key: 'larios', steps: [{ ev: 'reach', near: 'Calle Larios', r: 25, give: 'topaz' }] },
  { key: 'parque', steps: [{ ev: 'reach', near: 'Paseo del Parque', r: 30 }, { ev: 'bank' }] },
];
export const heistId = (key) => 'h_' + key;
export const FINAL = { id: 'heist', final: true, reward: { coins: 0, crystals: 100 }, steps: [{ ev: 'diamond', near: 'Banco de España', r: 90 }, { ev: 'escape' }, { ev: 'trade', near: 'Banco de España', r: 90 }] };

// The other ways in, once the plan is whole: an informant for each gives the
// tool. The uniform fools the guards for a while; the sewer key opens the
// hatches of the old tunnel from the hall to the vault's floor; firecrackers
// outside draw the guards to the door; the night watchman's code opens the
// vault door (and at night only one guard is on duty). With friends, one of
// them dancing or waving in the hall holds the guards' eyes.
export const APPROACHES = [
  { key: 'uniform', steps: [{ ev: 'reach', near: 'Calle Larios', r: 25 }], items: [['guard_uniform', 1]] },
  { key: 'sewer', steps: [{ ev: 'reach', near: 'Paseo del Parque', r: 30 }], items: [['sewer_key', 1]] },
  { key: 'fireworks', steps: [{ ev: 'reach', near: 'Muelle Uno', r: 30 }], items: [['firecracker', 3]] },
  { key: 'code', steps: [{ ev: 'reach', near: 'Mercado de Atarazanas', r: 25 }, { ev: 'meal' }], items: [['vault_code', 1]] },
];
export const approachId = (key) => 'x_' + key;
const UNIFORM_S = 45, DISTRACT_S = 25, DOOR_S = 40;

const INFORMANT = { skin: '#c99872', hair: '#2b2b2b', shirt: '#3a3a44', shirt2: '#2b2b33', pants: '#22222a', accent: '#c9a227', eye: '#2a1a10' };
const GUARD = { skin: '#d9a066', hair: '#1a1a1a', shirt: '#2f4f6f', shirt2: '#2f4f6f', pants: '#1f2f3f', accent: '#111111', eye: '#2a1a10' };

export class Heist {
  constructor(game) { this.game = game; this.npcs = new Map(); this.guards = []; this.t = 0; this.seenT = 0; this.shotT = 0; this.disguiseT = 0; this.distractT = 0; this.doorT = 0; }

  state() {
    const g = this.game;
    // a guest in a friend's world: the team's big mission (from the host)
    if (g.net && !g.net.isHost) return (g.team && g.team.heist) || { tasks: [], slots: {}, got: [], placed: [], map: false, robbed: false, escaped: false, traded: false, mayor: false };
    const pr = this.game.profile;
    if (!pr.heist) {
      // twelve tasks at random, and a random slot of the plan for each
      const pool = HEIST_POOL.map((x) => x.key).sort(() => Math.random() - 0.5).slice(0, PIECES);
      const slots = [...Array(PIECES).keys()].sort(() => Math.random() - 0.5);
      pr.heist = { tasks: pool, slots: Object.fromEntries(pool.map((k, i) => [k, slots[i]])), got: [], placed: [], map: false, robbed: false, escaped: false, traded: false, mayor: false };
    }
    return pr.heist;
  }

  // the twelve tasks as missions (see src/quest/missions.js), then the final one once the plan is whole
  missions() {
    const s = this.state();
    const list = s.tasks.map((k) => {
      const d = HEIST_POOL.find((x) => x.key === k);
      return d && { id: heistId(k), heist: true, key: k, reward: { coins: 25, crystals: 10 }, steps: d.steps };
    }).filter(Boolean);
    if (s.map) {
      for (const a of APPROACHES) list.push({ id: approachId(a.key), approach: true, key: a.key, reward: { coins: 0, crystals: 5 }, items: a.items, steps: a.steps });
      list.push(FINAL);
    }
    return list;
  }

  // a task done: its piece of the plan
  gotPiece(key) {
    const s = this.state(), g = this.game;
    if (!s.got.includes(key)) s.got.push(key);
    g.ui.toast(t('heist.piece', { n: s.got.length, total: PIECES }), 'soul');
    if (s.got.length >= PIECES) g.ui.toast(t('heist.allPieces'), 'soul');
  }

  // the puzzle: a piece put in its slot; true when it fits
  place(key, slot) {
    const s = this.state();
    if (!s.got.includes(key) || s.placed.includes(key) || s.slots[key] !== slot) return false;
    // a guest puts the piece in too and tells the host (who keeps the team's plan)
    if (this.game.net && !this.game.net.isHost) { s.placed.push(key); this.game.net.send({ t: 'hplace', key, slot }); if (s.placed.length >= PIECES) { s.map = true; this.game.giveItem('heist_map', 1); this.game.ui.toast(t('heist.mapDone'), 'soul'); } return true; }
    s.placed.push(key);
    if (s.placed.length >= PIECES && !s.map) {
      s.map = true;
      this.game.giveItem('heist_map', 1);
      this.game.ui.toast(t('heist.mapDone'), 'soul');
      this.game.missions.track(FINAL.id, false);
      this.game.missions.guideCard(FINAL.id);
      this.game.save(true);
    }
    return true;
  }

  // the plan of the bank, for the puzzle and the map item
  plan() {
    const c = this.game.city, P = c && c.bankPlan();
    if (!P) return null;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z), width = bankWidth(P);
    return { P, mid, depth, width, ...bankLayout(depth), routes: this.routes(P, mid, depth, width) };
  }

  // where the guards walk: [d, a] to [d, a], back and forth
  routes(P, mid, depth, width) {
    const L = bankLayout(depth);
    return [
      { from: [L.counter + 2, 2], to: [L.counter + 2, width - 2], speed: 1.6 }, // behind the counter
      { from: [L.vault - 2, 2], to: [L.vault - 2, width - 2], speed: 1.3 }, // before the vault door
      { from: [L.vault + 2, 2], to: [L.vault + 2, width - 2], speed: 1.1 }, // inside the vault
    ];
  }

  // the Gran Diamante taken from its pedestal
  takeDiamond(hit) {
    const g = this.game, s = this.state();
    if (!s.map) { g.ui.toast(t('heist.noPlan'), 'warn'); return; }
    g.world.setBlock(hit.x, hit.y, hit.z, B.air);
    g.giveItem('grand_diamond', 1);
    s.robbed = true; this.escapeSent = false;
    g.audio.sfx('crystal');
    g.ui.toast(t('heist.gotDiamond'), 'soul');
    g.missions.event('diamond');
    g.save(true);
  }

  // the team's heist is done (a friend traded the diamond): this player is a mayor too, paid on their own account
  async teamMayor() {
    const g = this.game;
    if (g.profile.mayorAt && Date.now() - g.profile.mayorAt < 120_000) return; // this player traded it just now
    let paid = 0;
    if (account.user && account.available) { try { paid = (await econ.heist()).paid || 0; } catch { /* not all twelve tasks recorded for this account */ } }
    g.profile.mayorAt = Date.now();
    if (!(g.net && !g.net.isHost)) { const s = this.state(); s.traded = true; s.mayor = g.profile.mayorAt; }
    g.save(true);
    g.ui.open('mayor', { paid });
  }

  // at the bank's counter: the diamond for the biggest sum
  async trade() {
    const g = this.game, s = this.state();
    if (!g.inventory.count('grand_diamond')) return null;
    let paid = 0;
    if (account.user && account.available) {
      const r = await econ.heist();
      paid = r.paid || 0;
    }
    g.inventory.remove('grand_diamond', 1);
    s.traded = true; s.mayor = Date.now();
    g.profile.mayorAt = s.mayor;
    g.missions.event('trade');
    g.save(true);
    g.ui.open('mayor', { paid });
    return paid;
  }

  // ---------- the other ways in ----------
  // the guard's uniform: the guards take the player for one of them, unless very close
  wearUniform() {
    const g = this.game;
    if (!g.missions || !g.missions.active) { g.ui.toast(t('heist.notHere'), 'warn'); return false; }
    g.inventory.remove('guard_uniform', 1);
    this.disguiseT = UNIFORM_S;
    g.audio.sfx('place');
    g.ui.toast(t('heist.uniformOn', { s: UNIFORM_S }), 'soul');
    return true;
  }

  // firecrackers outside the bank: the guards run to the door for a while
  firecracker() {
    const g = this.game, pl = this.plan();
    if (!pl) { g.ui.toast(t('heist.notHere'), 'warn'); return false; }
    const P = pl.P, p = g.player.pos;
    if (Math.hypot(p.x - (P.x0 + P.x1) / 2, p.z - (P.z0 + P.z1) / 2) > 80) { g.ui.toast(t('heist.tooFar'), 'warn'); return false; }
    g.inventory.remove('firecracker', 1);
    g.entities.particles.emit(p.x, p.y + 2, p.z, 1, 0.6, 0.2, 40, 6, 1.2);
    this.distract(DISTRACT_S, true);
    return true;
  }

  // the guards drawn to the door (a teammate's firecracker reaches everyone in the team)
  distract(sec, send = false) {
    const g = this.game;
    this.distractT = Math.max(this.distractT, sec);
    g.audio.sfx('shoot');
    g.ui.toast(t('heist.distracted', { s: Math.round(sec) }), 'soul');
    if (send && g.net) g.net.send({ t: 'hdistract', s: sec });
  }

  // the hatches of the old sewer: down from the hall, along the tunnel, up into the vault (and back)
  useGrate(hit) {
    const g = this.game, pl = this.plan();
    if (!pl) return;
    if (!g.inventory.count('sewer_key')) { g.ui.toast(t('heist.grateLocked'), 'warn'); return; }
    const sw = pl.sewer, base = pl.P.base, { d } = bankCoords(pl.P, hit.x, hit.z);
    const above = g.player.pos.y > base;
    const to = (dd, a, y) => { const q = bankPoint(pl.P, dd, a); g.player.pos.set(q.x + 0.5, y, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null; };
    if (d === sw.from) { if (above) to(sw.from + 1, sw.a, base - 2); else to(sw.from, sw.a + 1, base + 1); }
    else if (d === sw.to) { if (above) to(sw.to - 1, sw.a, base - 2); else to(sw.to, sw.a + 1, base + 1); }
    g.audio.sfx('step');
    g.ui.toast(t(above ? 'heist.grateDown' : 'heist.grateUp'));
  }

  // the vault door: the night watchman's code opens it for a while
  openVaultDoor(hit) {
    const g = this.game, pl = this.plan();
    if (!pl) return;
    if (!g.inventory.count('vault_code')) { g.ui.toast(t('heist.doorLocked'), 'warn'); return; }
    const q = bankPoint(pl.P, pl.vault, pl.mid);
    for (const r of [1, 2]) g.world.setBlock(q.x, pl.P.base + r, q.z, B.air);
    this.doorT = DOOR_S;
    g.audio.sfx('levelup');
    g.ui.toast(t('heist.doorOpen', { s: DOOR_S }), 'soul');
    void hit;
  }

  closeVaultDoor() {
    const pl = this.plan();
    if (!pl) return;
    const q = bankPoint(pl.P, pl.vault, pl.mid);
    for (const r of [1, 2]) this.game.world.setBlockAnywhere(q.x, pl.P.base + r, q.z, B.vault_door);
    this.game.ui.toast(t('heist.doorClosed'));
  }

  // a teammate in the bank's hall dancing, waving or cheering: the guards watch the show
  dancer(pl) {
    const n = this.game.net;
    if (!n) return null;
    for (const rp of n.players.values()) {
      if (!rp.seen || !rp.fig || !rp.fig.emote) continue;
      const P = pl.P, p = rp.pos;
      if (p.x < P.x0 || p.x > P.x1 || p.z < P.z0 || p.z > P.z1) continue;
      const { d } = bankCoords(P, Math.floor(p.x), Math.floor(p.z));
      if (d >= 0 && d < pl.counter) return p;
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    if (this.disguiseT > 0) { this.disguiseT -= dt; if (this.disguiseT <= 0) g.ui.toast(t('heist.uniformOff'), 'warn'); }
    if (this.distractT > 0) { this.distractT -= dt; if (this.distractT <= 0) g.ui.toast(t('heist.guardsBack'), 'warn'); }
    if (this.doorT > 0) { this.doorT -= dt; if (this.doorT <= 0) this.closeVaultDoor(); }
    if (!g.missions || !g.missions.active) { this.clear(); return; }
    this.t += dt;
    if (this.t >= 0.5) { this.t = 0; this.informants(); this.checkEscape(); }
    this.guardsUpdate(dt);
  }

  clear() {
    for (const o of this.npcs.values()) this.game.scene.remove(o);
    this.npcs.clear();
    for (const gd of this.guards) this.game.scene.remove(gd.rig.group);
    this.guards = [];
  }

  // an informant waits at the place of each task's meeting, near the player
  informants() {
    const g = this.game, M = g.missions, p = g.player.pos;
    const want = new Set();
    for (const m of this.missions()) {
      if (!(m.heist || m.approach) || M.isDone(m.id)) continue;
      const st = m.steps[M.prog(m.id).step];
      if (!st || st.ev !== 'reach') continue;
      const tg = M.placeXZ(st.near);
      if (!tg || Math.hypot(tg.x - p.x, tg.z - p.z) > 120) continue;
      want.add(m.id);
      if (this.npcs.has(m.id)) continue;
      const c = g.city.openCellNear(tg.x, tg.z, 30) || tg;
      const rig = humanoid(INFORMANT, 'player', 1);
      const brim = box(0.66, 0.08, 0.66, '#1c1c22'); brim.position.y = 0.28; rig.head.add(brim);
      const crown = box(0.42, 0.24, 0.42, '#1c1c22'); crown.position.y = 0.42; rig.head.add(crown);
      // a gold "!" over the head
      const bar = box(0.16, 0.45, 0.16, '#ffd65c'); bar.position.y = 2.55; rig.group.add(bar);
      const dot = box(0.16, 0.16, 0.16, '#ffd65c'); dot.position.y = 2.15; rig.group.add(dot);
      rig.group.position.set(c.x + 0.5, g.city.groundAt(c.x, c.z) + 1, c.z + 0.5);
      g.scene.add(rig.group);
      this.npcs.set(m.id, rig.group);
    }
    for (const [id, o] of this.npcs) if (!want.has(id)) { g.scene.remove(o); this.npcs.delete(id); }
  }

  // with the diamond, far enough from the bank: away
  checkEscape() {
    const g = this.game, s = this.state();
    if (!s.robbed || s.escaped || this.escapeSent || !g.inventory.count('grand_diamond')) return;
    const pl = this.plan();
    if (!pl) return;
    const P = pl.P, cx = (P.x0 + P.x1) / 2, cz = (P.z0 + P.z1) / 2, p = g.player.pos;
    if (Math.hypot(p.x - cx, p.z - cz) < 60) return;
    s.escaped = true; this.escapeSent = true;
    g.ui.toast(t('heist.escaped'), 'soul');
    g.missions.event('escape');
    g.save(true);
  }

  // the guards: they walk their rounds and look ahead; one who sees the
  // player behind the counter, in the vault or with the diamond raises the alarm and shoots
  guardsUpdate(dt) {
    const g = this.game, pl = this.plan();
    const p = g.player.pos;
    const near = pl && Math.hypot(p.x - (pl.P.x0 + pl.P.x1) / 2, p.z - (pl.P.z0 + pl.P.z1) / 2) < 110;
    if (!near) { if (this.guards.length) { for (const gd of this.guards) g.scene.remove(gd.rig.group); this.guards = []; } return; }
    const base = pl.P.base + 1;
    if (!this.guards.length) {
      for (const r of pl.routes) {
        const rig = humanoid(GUARD, 'player', 1);
        const cap = box(0.56, 0.14, 0.56, '#1f2f3f'); cap.position.y = 0.3; rig.head.add(cap);
        const visor = box(0.5, 0.04, 0.18, '#111111'); visor.position.set(0, 0.25, 0.32); rig.head.add(visor);
        g.scene.add(rig.group);
        this.guards.push({ rig, r, u: Math.random(), dir: 1, saw: false, at: null });
      }
    }
    // at night only the vault's guard is on duty, and sleepy
    const night = isNight(g.meta.time);
    // the firecrackers: everyone runs to the door; a teammate's show in the hall: everyone watches
    const lured = this.distractT > 0, show = lured ? null : this.dancer(pl);
    const zone = this.restricted(pl, p);
    let seen = false;
    this.guards.forEach((gd, i) => {
      const on = !night || i === 2;
      gd.rig.group.visible = on;
      if (!on) return;
      const { from, to, speed } = gd.r;
      const len = Math.max(1, Math.abs(to[1] - from[1]) + Math.abs(to[0] - from[0]));
      let goal;
      if (lured) goal = bankPoint(pl.P, 2, pl.mid + (i - 1) * 2);
      else {
        gd.u += (gd.dir * speed * dt) / len;
        if (gd.u > 1) { gd.u = 1; gd.dir = -1; } else if (gd.u < 0) { gd.u = 0; gd.dir = 1; }
        goal = bankPoint(pl.P, from[0] + (to[0] - from[0]) * gd.u, from[1] + (to[1] - from[1]) * gd.u);
      }
      // walk to the goal (back to the round after the alarm), or keep to the round
      const tx = goal.x + 0.5, tz = goal.z + 0.5;
      if (!gd.at) gd.at = { x: tx, z: tz };
      const dx = tx - gd.at.x, dz = tz - gd.at.z, dist = Math.hypot(dx, dz), step = Math.max(speed, 3.2) * dt;
      let fx, fz;
      if (dist > step) { gd.at.x += (dx / dist) * step; gd.at.z += (dz / dist) * step; fx = dx; fz = dz; gd.walking = true; }
      else {
        gd.at.x = tx; gd.at.z = tz; gd.walking = !lured;
        const q2 = bankPoint(pl.P, from[0] + (to[0] - from[0]) * gd.u + (to[0] - from[0]) * gd.dir, from[1] + (to[1] - from[1]) * gd.u + (to[1] - from[1]) * gd.dir);
        const q = bankPoint(pl.P, from[0] + (to[0] - from[0]) * gd.u, from[1] + (to[1] - from[1]) * gd.u);
        fx = q2.x - q.x; fz = q2.z - q.z;
        if (lured) { const out = bankPoint(pl.P, -3, pl.mid); fx = out.x + 0.5 - gd.at.x; fz = out.z + 0.5 - gd.at.z; }
      }
      if (show) { fx = show.x - gd.at.x; fz = show.z - gd.at.z; }
      gd.rig.group.position.set(gd.at.x, base, gd.at.z);
      gd.yaw = Math.atan2(fx, fz);
      gd.rig.group.rotation.y = gd.yaw;
      const ph = (g.meta.playTime || 0) * (lured ? 10 : 6);
      const sw = gd.walking ? Math.sin(ph) * 0.5 : 0;
      gd.rig.legL.rotation.x = sw; gd.rig.legR.rotation.x = -sw;
      // how far a guard sees: less at night, through the uniform only up close, nothing while lured or watching the show
      const range = lured ? 0 : this.disguiseT > 0 || show ? 2.2 : night ? 7 : 11;
      if (zone && range > 0 && this.sees(gd, p, range)) seen = true;
    });
    this.spotted(seen, dt, pl);
  }

  // behind the counter, in the vault, or carrying the diamond inside the bank
  restricted(pl, p) {
    const P = pl.P;
    if (p.x < P.x0 - 1 || p.x > P.x1 + 1 || p.z < P.z0 - 1 || p.z > P.z1 + 1) return false;
    const { d } = bankCoords(P, Math.floor(p.x), Math.floor(p.z));
    return d > pl.counter || this.game.inventory.count('grand_diamond') > 0;
  }

  // in sight: near, in front (a wide cone) and nothing solid between
  sees(gd, p, range = 11) {
    const g = this.game, o = gd.rig.group.position;
    const dx = p.x - o.x, dz = p.z - o.z, dist = Math.hypot(dx, dz);
    if (dist > range || Math.abs(p.y - o.y) > 4) return false;
    let ang = Math.atan2(dx, dz) - gd.yaw;
    ang = Math.atan2(Math.sin(ang), Math.cos(ang));
    if (Math.abs(ang) > 0.95 && dist > 1.5) return false;
    const eye = { x: o.x, y: o.y + 1.6, z: o.z };
    const to = { x: p.x - eye.x, y: p.y + 1.5 - eye.y, z: p.z - eye.z };
    const L = Math.hypot(to.x, to.y, to.z);
    const hit = g.world.raycast(eye, { x: to.x / L, y: to.y / L, z: to.z / L }, L);
    return !hit || hit.dist >= L - 0.6;
  }

  spotted(seen, dt, pl) {
    const g = this.game;
    if (!seen) { this.seenT = Math.max(0, this.seenT - dt); return; }
    if (this.seenT === 0) { g.audio.sfx('warn'); g.ui.toast(t('heist.spotted'), 'warn'); }
    this.seenT = 3;
    this.shotT -= dt;
    if (this.shotT > 0) return;
    this.shotT = 0.9;
    g.audio.sfx('shoot');
    if (g.creative) {
      // creative: caught and walked out of the bank, the diamond goes back
      this.caught(pl);
      return;
    }
    g.damagePlayer(5, 'guard');
  }

  // the Gran Diamante goes back on its pedestal, and the final mission back to its first step
  returnDiamond(pl = this.plan()) {
    const g = this.game, s = this.state();
    if (!g.inventory.count('grand_diamond')) return false;
    g.inventory.remove('grand_diamond', g.inventory.count('grand_diamond'));
    if (pl) { const q = bankPoint(pl.P, pl.diamond, pl.mid); g.world.setBlockAnywhere(q.x, pl.P.base + 2, q.z, B.grand_diamond); }
    s.robbed = false; s.escaped = false; this.escapeSent = false;
    if (g.missions && !g.missions.isDone(FINAL.id)) { const pr = g.missions.prog(FINAL.id); pr.step = 0; pr.n = 0; pr.seen = []; }
    return true;
  }

  // killed (by the guards or anything else) with the diamond: it is taken back
  onDeath() {
    if (!this.game.missions || !this.game.missions.active) return;
    if (this.returnDiamond()) this.game.ui.toast(t('heist.lostDiamond'), 'warn');
    this.seenT = 0;
  }

  caught(pl) {
    const g = this.game;
    this.returnDiamond(pl);
    const out = bankPoint(pl.P, -4, pl.mid);
    g.player.pos.set(out.x + 0.5, pl.P.base + 1.05, out.z + 0.5);
    g.placeOnGround();
    g.ui.toast(t('heist.caught'), 'warn');
    this.seenT = 0;
  }
}
