// La Fábrica, season 2: El Oro. After the factory, Siroco was caught. El
// Maestro calls the crew back to the farmhouse: a second class, then the
// rescue (a forged transfer order, a police uniform, a boat ready at La
// Malagueta, and a cool head with the officer on the quay at Muelle Uno),
// then the gold. Under the old Térmica building by the sea lies the state's
// hidden gold reserve. The crew takes it over and melts the bars into grains
// that run down a pipe, under siege: the vault floods (keep the pumps
// running), the police cut the power (start the generator again), drill
// through a wall (brace it) and call on the red phone. Nobody is hurt: the
// guards wait in the lobby. With twelve bars melted, the crew leaves through
// the outflow pipe and brings the gold to El Maestro's boat on La
// Misericordia beach.
//
// It opens when season 1 is done. The progress is the player's own
// (profile.oro); played together, the host's game keeps it, as in season 1
// ('oro' messages, the missions' events, the state sent with the team's).
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { humanoid, box } from '../entities/models.js';
import { account, econ } from '../save/account.js';
import { bankCoords, bankPoint, bankWidth, oroLayout } from '../world/city.js';
import { B } from '../world/blocks.js';
import { CREW } from './fabrica.js';

export const ORO_TARGET = 12; // bars to melt
const MELT_S = 22, PHONE_EVERY = [55, 80], PHONE_RING = 20, CUT_EVERY = [70, 100], DRILL_EVERY = [75, 105], DRILL_S = 25, PUMP_EVERY = [35, 60], CREW_EVERY = 45, FLOOD_S = 30;
// the water rises this much a second, and each running pump takes this much out
const SEEP = 0.9, PUMP_OUT = 0.5;
export const ORO_ACTS = ['llamada', 'clase2', 'prep', 'rescate', 'prep2', 'entry', 'siege', 'pipe', 'sea', 'done'];

// the missions of each act (the reach steps meet a contact; the others are events)
const MISSIONS = [
  { key: 'llamada', act: 0, steps: [{ ev: 'reach', near: 'Finca El Maestro', r: 22 }] },
  { key: 'clase2', act: 1, steps: [{ ev: 'oro_quiz' }] },
  { key: 'orden', act: 2, steps: [{ ev: 'reach', near: 'Mercado de Atarazanas', r: 25 }], items: [['fake_order', 1]] },
  { key: 'uniforme', act: 2, steps: [{ ev: 'reach', near: 'Calle Larios', r: 25 }], items: [['police_uniform', 1]] },
  { key: 'lancha', act: 2, steps: [{ ev: 'reach', near: 'La Malagueta', r: 30 }] },
  { key: 'rescate', act: 3, steps: [{ ev: 'reach', near: 'Muelle Uno', r: 30 }, { ev: 'oro_free' }] },
  { key: 'buzos', act: 4, steps: [{ ev: 'reach', near: 'Pedregalejo', r: 35 }] },
  { key: 'fundidor', act: 4, steps: [{ ev: 'reach', near: 'El Palo', r: 35 }] },
  { key: 'turnos', act: 4, steps: [{ ev: 'reach', near: 'Gibralfaro', r: 30 }] },
  { key: 'entrada2', act: 5, steps: [{ ev: 'reach', near: 'La Térmica', r: 70 }, { ev: 'oro_enter' }] },
  { key: 'oro', act: 6, steps: [{ ev: 'oro_melt', n: ORO_TARGET }] },
  { key: 'desague', act: 7, steps: [{ ev: 'oro_out' }] },
  { key: 'mar', act: 8, steps: [{ ev: 'reach', near: 'La Misericordia', r: 40 }] },
];
export const oroId = (key) => 'f2_' + key;
const PREP = ['orden', 'uniforme', 'lancha'], PREP2 = ['buzos', 'fundidor', 'turnos'];

const RED = { skin: '#d9a57a', hair: '#2b1d12', shirt: '#c81e1e', shirt2: '#c81e1e', pants: '#b01818', eye: '#1b1b22', accent: '#111111' };
const GUARD = { skin: '#e0ac86', hair: '#4d3421', shirt: '#3a4a5a', shirt2: '#3a4a5a', pants: '#22303e', eye: '#1f2a6b', accent: '#c9a227' };
const POLICE = { skin: '#c68a5e', hair: '#1a1a1a', shirt: '#1f3a8a', shirt2: '#1f3a8a', pants: '#14244f', eye: '#1b1b22', accent: '#ffd65c' };
const MAESTRO = { skin: '#e0b08a', hair: '#3a2a1a', shirt: '#6b5a4a', shirt2: '#6b5a4a', pants: '#3a3a44', eye: '#1b1b22', accent: '#8a6238' };
const fresh = () => ({ act: 0, rescued: false, melted: 0, patience: 60, water: 0, power: true, furnaces: {}, pumps: [true, true], phone: null, drill: null, flood: 0, nextPhone: 40, nextCut: 70, nextDrill: 60, nextPump: 35, nextCrew: CREW_EVERY, sacks: 0, fails: 0, done: false, paid: 0 });
const between = ([a, b]) => a + Math.random() * (b - a);

export class Oro {
  constructor(game) { this.game = game; this.npcs = new Map(); this.t = 0; this.rescueT = 0; }

  // ---------- state ----------
  get guest() { const n = this.game.net; return !!(n && !n.isHost); }
  // the season opens once season 1 is done
  get open() { const g = this.game, f = g.fabrica && g.fabrica.state(); return !!(f && f.done); }
  state() {
    const g = this.game;
    if (this.guest) return (g.team && g.team.oro) || fresh();
    const pr = g.profile;
    if (!pr.oro) pr.oro = fresh();
    return pr.oro;
  }
  get act() { return this.state().act; }

  // the missions so far (done ones stay listed), see src/quest/missions.js
  missions() {
    if (!this.open) return [];
    const s = this.state();
    return MISSIONS.filter((m) => m.act <= Math.min(s.act, 8)).map((m) => ({ id: oroId(m.key), fab: true, season: 2, key: m.key, act: m.act, reward: { coins: 0, crystals: m.act >= 5 ? 30 : 10 }, steps: m.steps, items: m.items || null }));
  }

  // a mission of the season done: the next act
  onMission(m) {
    const g = this.game, s = this.state(), M = g.missions;
    const all = (keys) => keys.every((k) => M.isDone(oroId(k)));
    if (m.key === 'llamada' && s.act === 0) { s.act = 1; setTimeout(() => g.running && g.ui.open('oroLesson'), 600); }
    else if (m.key === 'clase2' && s.act === 1) s.act = 2;
    else if (s.act === 2 && all(PREP)) { s.act = 3; g.ui.toast(t('oro.readyRescue'), 'soul'); }
    else if (m.key === 'rescate' && s.act === 3) { s.act = 4; s.rescued = true; }
    else if (s.act === 4 && all(PREP2)) { s.act = 5; g.ui.toast(t('oro.readyEntry'), 'soul'); }
    else if (m.key === 'entrada2' && s.act === 5) s.act = 6;
    else if (m.key === 'oro' && s.act === 6) { s.act = 7; this.say('pipeNow'); }
    else if (m.key === 'desague' && s.act === 7) s.act = 8;
    else if (m.key === 'mar' && s.act === 8) this.finish();
    if (s.act >= 2 && s.act <= 8) { const next = M.all().find((x) => x.season === 2 && !M.isDone(x.id)); if (next) M.track(next.id, false); }
    if (M.host) M.dirty = true;
  }

  say(key, vars) { this.game.ui.toast(t('oro.say.' + key, vars), 'soul'); }

  // ---------- the class and the rescue ----------
  passClass() { this.game.missions.event('oro_quiz'); }
  // the officer on the quay believed the story: Siroco walks free
  freed() {
    const g = this.game;
    g.inventory.remove('fake_order', 1); g.inventory.remove('police_uniform', 1);
    g.audio.sfx('levelup');
    this.say('freed');
    g.missions.event('oro_free');
  }
  // at Muelle Uno with the rescue's second step to do: the officer's questions
  rescueDue() {
    const g = this.game, M = g.missions, s = this.state();
    if (s.act !== 3 || M.isDone(oroId('rescate')) || M.prog(oroId('rescate')).step !== 1) return false;
    return M.near('Muelle Uno', 30);
  }

  // ---------- La Térmica ----------
  plan() {
    const c = this.game.city, P = c && c.oroPlan && c.oroPlan();
    if (!P) return null;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z), width = bankWidth(P);
    return { P, mid, depth, width, ...oroLayout(depth, width) };
  }
  pt(pl, d, a) { return bankPoint(pl.P, d, a); }
  inside(pl, p = this.game.player.pos) { const P = pl.P; return p.x >= P.x0 && p.x <= P.x1 + 1 && p.z >= P.z0 && p.z <= P.z1 + 1 && p.y > P.base - 4; }
  at(pl, list, x, z) { return list.findIndex(([d, a]) => { const q = this.pt(pl, d, a); return q.x === x && q.z === z; }); }

  // the crew goes in: everyone to the lobby
  async enter() {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 5) return false;
    if (this.guest) { this.send('enter'); return true; }
    Object.assign(s, { melted: 0, patience: 60, water: 0, power: true, furnaces: {}, pumps: [true, true], phone: null, drill: null, flood: 0, nextPhone: 35, nextCut: 60, nextDrill: 50, nextPump: 30, nextCrew: CREW_EVERY });
    this.resetBlocks(pl);
    this.toLobby(pl);
    g.missions.event('oro_enter');
    if (g.net) g.net.send({ t: 'oro', a: 'in' });
    this.say('inside');
    return true;
  }
  // the test panel: straight into the siege
  async enterTest() {
    const s = this.state();
    s.act = 5;
    this.game.missions.prog(oroId('entrada2')).step = 1;
    for (let i = 0; i < 60 && !this.plan(); i++) await new Promise((r) => setTimeout(r, 100));
    await this.enter();
  }
  toLobby(pl) {
    const g = this.game, q = this.pt(pl, 2, pl.mid + 1);
    g.player.pos.set(q.x + 0.5, pl.P.base + 1.05, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
  }
  outside(pl, back = false) {
    const g = this.game, q = this.pt(pl, back ? pl.depth + 6 : -8, pl.mid), c = g.city.openCellNear(q.x, q.z, 25) || q;
    g.player.pos.set(c.x + 0.5, g.city.groundAt(c.x, c.z) + 1.05, c.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
  }

  // a player uses a block of La Térmica; true when it was one
  use(hit) {
    const g = this.game, pl = this.plan();
    if (!pl || !hit) return false;
    const P = pl.P;
    if (hit.x < P.x0 - 1 || hit.x > P.x1 + 1 || hit.z < P.z0 - 1 || hit.z > P.z1 + 1) return false;
    const s = this.state(), id = hit.id, inSiege = s.act === 6;
    if (id === B.factory_door) {
      if (s.act === 5 && !this.inside(pl)) { this.enter(); return true; }
      if (inSiege && !this.inside(pl)) { this.toLobby(pl); return true; }
      g.ui.toast(t(s.act < 5 ? 'oro.doorShut' : 'oro.doorLocked')); return true;
    }
    const SIEGE = [B.gold_shelf, B.gold_furnace, B.gold_furnace_on, B.water_pump, B.water_pump_off, B.generator, B.generator_off, B.drill_wall, B.red_phone];
    if (!inSiege && SIEGE.includes(id)) { g.ui.toast(t('oro.notNow')); return true; }
    if (id === B.gold_shelf) {
      if (s.flood > 0) { g.ui.toast(t('oro.flooded'), 'warn'); return true; }
      if (g.inventory.count('gold_bar') >= 2) { g.ui.toast(t('oro.handsFull')); return true; }
      g.giveItem('gold_bar', 1); g.audio.sfx('pickup'); g.ui.toast(t('oro.gotBar')); return true;
    }
    if (id === B.gold_furnace || id === B.gold_furnace_on) {
      const i = this.at(pl, pl.furnaces, hit.x, hit.z);
      if (i < 0) return true;
      const f = s.furnaces[i];
      if (f && f.on) { g.ui.toast(t('oro.furnaceBusy', { s: Math.ceil(f.t) })); return true; }
      if (!g.creative && !g.inventory.count('gold_bar')) { g.ui.toast(t('oro.needBar'), 'warn'); return true; }
      if (!g.creative) g.inventory.remove('gold_bar', 1);
      this.action('start', { i });
      return true;
    }
    if (id === B.water_pump || id === B.water_pump_off) {
      const i = this.at(pl, pl.pumps, hit.x, hit.z);
      if (i >= 0 && !s.pumps[i]) this.action('pump', { i }); else g.ui.toast(t('oro.pumpOk'));
      return true;
    }
    if (id === B.generator || id === B.generator_off) { if (!s.power) this.action('power'); else g.ui.toast(t('oro.powerOk')); return true; }
    if (id === B.drill_wall) { this.action('brace'); return true; }
    if (id === B.red_phone) { if (s.phone) g.ui.open('oroPhone'); else g.ui.toast(t('fab.phoneSilent')); return true; }
    if (id === B.sewer_grate) { this.outflow(pl); return true; }
    return false;
  }

  // the outflow grate in the vault's floor: out through the pipe, with the gold
  outflow(pl) {
    const g = this.game, s = this.state();
    if (s.act !== 7) { g.ui.toast(t('oro.grateShut')); return; }
    this.outside(pl, true);
    const n = Math.max(1, s.melted);
    g.giveItem('gold_sack', n);
    g.audio.sfx('levelup');
    g.ui.toast(t('oro.out', { n }), 'soul');
    g.missions.event('oro_out');
  }

  // ---------- actions (a guest's go to the host) ----------
  action(a, data = {}) {
    if (this.guest) { this.send(a, data); this.game.audio.sfx('place'); return; }
    this.apply(a, data, true);
  }
  send(a, data = {}) { const n = this.game.net; if (n) n.send({ t: 'oro', a, ...data }); }
  onNet(msg) {
    if (this.guest) {
      const pl = this.plan();
      if (!pl) return;
      if (msg.a === 'in') { this.toLobby(pl); this.say('inside'); }
      else if (msg.a === 'out') this.outside(pl);
      return;
    }
    if (msg.a === 'enter') { this.enter(); return; }
    this.apply(msg.a, msg, false);
  }

  apply(a, data, mine) {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 6) return;
    if (a === 'start') {
      const i = data.i | 0;
      if (!pl.furnaces[i]) return;
      s.furnaces[i] = { on: true, t: MELT_S };
      this.setFurnace(pl, i, s.power);
      if (mine) g.audio.sfx('place');
    } else if (a === 'pump') {
      const i = data.i | 0;
      if (s.pumps[i] === false) { s.pumps[i] = true; this.setPump(pl, i, true); g.ui.toast(t('oro.pumpOn'), 'soul'); g.audio.sfx('levelup'); }
    } else if (a === 'power') {
      if (!s.power) { s.power = true; this.setGenerator(pl, true); this.furnaceLights(pl); g.ui.toast(t('oro.powerBack'), 'soul'); g.audio.sfx('levelup'); }
    } else if (a === 'brace') {
      if (s.drill && !s.drill.braced) { s.drill.braced = true; this.setDrill(pl, s.drill, false); s.drill = null; s.patience = Math.min(100, s.patience + 2); g.ui.toast(t('oro.braced'), 'soul'); g.audio.sfx('place'); }
    } else if (a === 'phone') {
      if (!s.phone) return;
      const c = data.choice | 0, d = [8, 3, -12, 5][c] ?? 0;
      s.patience = Math.max(0, Math.min(100, s.patience + d));
      if (c === 1) { s.nextDrill += 30; s.nextCut += 30; } // stalling buys time
      s.phone = null;
      g.ui.toast(t(d >= 0 ? 'fab.phoneGood' : 'fab.phoneBad', { n: Math.abs(d) }), d >= 0 ? 'soul' : 'warn');
    }
    if (g.missions.host) g.missions.dirty = true;
  }

  block(pl, [d, a], id, y = 1) { const q = this.pt(pl, d, a); this.game.world.setBlockAnywhere(q.x, pl.P.base + y, q.z, id); }
  setFurnace(pl, i, on) { this.block(pl, pl.furnaces[i], on ? B.gold_furnace_on : B.gold_furnace); }
  furnaceLights(pl) { const s = this.state(); pl.furnaces.forEach((_, i) => this.setFurnace(pl, i, !!(s.furnaces[i] && s.furnaces[i].on && s.power))); }
  setPump(pl, i, on) { this.block(pl, pl.pumps[i], on ? B.water_pump : B.water_pump_off); }
  setGenerator(pl, on) { this.block(pl, pl.generator, on ? B.generator : B.generator_off); }
  setDrill(pl, dr, on) { this.block(pl, [dr.d, dr.a], on ? B.drill_wall : B.plaster_white); }
  resetBlocks(pl) {
    pl.furnaces.forEach((_, i) => this.setFurnace(pl, i, false));
    pl.pumps.forEach((_, i) => this.setPump(pl, i, true));
    this.setGenerator(pl, true);
    // a drilled spot left from before is a wall again
    for (let d = pl.hall[0]; d <= pl.hall[1]; d++) for (const a of [0, pl.width]) { const q = this.pt(pl, d, a); if (this.game.world.getBlock(q.x, pl.P.base + 1, q.z) === B.drill_wall) this.game.world.setBlockAnywhere(q.x, pl.P.base + 1, q.z, B.plaster_white); }
  }

  // ---------- the siege (the host runs it) ----------
  siege(dt, pl) {
    const g = this.game, s = this.state();
    // the furnaces melt while there is power
    for (const [k, f] of Object.entries(s.furnaces)) {
      if (!f.on || !s.power) continue;
      f.t -= dt;
      if (f.t <= 0) {
        f.on = false; this.setFurnace(pl, +k, false);
        s.melted = Math.min(ORO_TARGET, s.melted + 1);
        g.audio.sfx('crystal');
        g.ui.toast(t('oro.melted', { n: s.melted, total: ORO_TARGET }), 'soul');
        g.missions.event('oro_melt');
      }
    }
    // the crew brings a bar to an idle furnace now and then
    s.nextCrew -= dt;
    if (s.nextCrew <= 0) {
      s.nextCrew = CREW_EVERY;
      const idle = pl.furnaces.findIndex((_, i) => !(s.furnaces[i] && s.furnaces[i].on));
      if (idle >= 0 && s.flood <= 0) { this.apply('start', { i: idle }, false); g.ui.toast(t('oro.crewStarts', { name: t('fab.crew.' + CREW[idle % CREW.length]), n: idle + 1 })); }
    }
    // the pumps: one stops now and then
    s.nextPump -= dt;
    if (s.nextPump <= 0) {
      s.nextPump = between(PUMP_EVERY);
      const on = s.pumps.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
      if (on.length) { const i = on[Math.floor(Math.random() * on.length)]; s.pumps[i] = false; this.setPump(pl, i, false); g.ui.toast(t('oro.pumpStopped', { n: i + 1 }), 'warn'); g.audio.sfx('warn'); }
    }
    // the water: it seeps in, the running pumps (with power) take it out
    if (s.flood > 0) { s.flood -= dt; if (s.flood <= 0) { s.flood = 0; s.water = 60; g.ui.toast(t('oro.drained'), 'soul'); } }
    else {
      const pumping = s.power ? s.pumps.filter(Boolean).length : 0;
      s.water = Math.max(0, Math.min(100, s.water + (SEEP - PUMP_OUT * pumping) * dt));
      if (s.water >= 100) { s.flood = FLOOD_S; g.ui.toast(t('oro.flood'), 'warn'); g.audio.sfx('warn'); }
    }
    // the police cut the power
    if (s.power) { s.nextCut -= dt; if (s.nextCut <= 0) { s.nextCut = between(CUT_EVERY); s.power = false; this.setGenerator(pl, false); this.furnaceLights(pl); g.ui.toast(t('oro.powerCut'), 'warn'); g.audio.sfx('warn'); } }
    // the police drill through a wall
    if (s.drill) {
      s.drill.t -= dt;
      if (s.drill.t <= 0) { this.setDrill(pl, s.drill, false); s.drill = null; s.patience = Math.max(0, s.patience - 15); g.ui.toast(t('oro.drillThrough'), 'warn'); }
    } else {
      s.nextDrill -= dt;
      if (s.nextDrill <= 0) {
        s.nextDrill = between(DRILL_EVERY);
        const d = pl.hall[0] + Math.floor(Math.random() * (pl.hall[1] - pl.hall[0] + 1)), a = Math.random() < 0.5 ? 0 : pl.width;
        s.drill = { d, a, t: DRILL_S, side: a === 0 ? 'left' : 'right' };
        this.setDrill(pl, s.drill, true);
        g.ui.toast(t('oro.drill.' + s.drill.side), 'warn'); g.audio.sfx('warn');
      }
    }
    // the red phone
    if (s.phone) { s.phone.t -= dt; if (s.phone.t <= 0) { s.phone = null; s.patience = Math.max(0, s.patience - 10); g.ui.toast(t('fab.phoneMissed'), 'warn'); } }
    else { s.nextPhone -= dt; if (s.nextPhone <= 0) { s.nextPhone = between(PHONE_EVERY); s.phone = { t: PHONE_RING, line: Math.floor(Math.random() * 5) }; g.ui.toast(t('fab.phoneRings'), 'warn'); g.audio.sfx('warn'); } }
    if (s.patience <= 0) this.stormed(pl);
  }

  stormed(pl) {
    const g = this.game, s = this.state();
    s.melted = 0; s.patience = 60; s.water = 0; s.power = true; s.furnaces = {}; s.pumps = [true, true]; s.phone = null; s.drill = null; s.flood = 0; s.fails++;
    this.resetBlocks(pl);
    s.act = 5;
    const M = g.missions, st = M.state();
    for (const k of ['entrada2', 'oro']) { delete st.done[oroId(k)]; delete st.prog[oroId(k)]; }
    M.prog(oroId('entrada2')).step = 1;
    this.outside(pl);
    if (g.net) g.net.send({ t: 'oro', a: 'out' });
    g.ui.toast(t('oro.stormed'), 'warn');
    g.audio.sfx('warn');
    if (M.host) M.dirty = true;
    g.save(true);
  }

  // ---------- the end ----------
  async finish() {
    const g = this.game, s = this.state();
    if (s.done) return;
    const sacks = g.inventory.count('gold_sack');
    let paid = 0;
    if (sacks && account.user && account.available && econ.oro) { try { paid = (await econ.oro(sacks)).paid || 0; } catch { /* once per account */ } }
    if (sacks) g.inventory.remove('gold_sack', sacks);
    s.act = 9; s.done = true; s.sacks = sacks; s.paid = paid;
    if (!g.creative) g.addCrystals(200 + 15 * sacks);
    g.save(true);
    g.ui.open('oroFinale', { sacks, paid });
  }

  // ---------- every frame ----------
  update(dt) {
    const g = this.game;
    if (!g.missions || !g.missions.active || !this.open) { this.clearNpcs(); return; }
    const s = this.state(), pl = this.plan();
    if (pl && s.act === 6 && !this.guest) this.siege(dt, pl);
    this.t += dt;
    if (this.t >= 0.5) {
      this.t = 0; this.people(pl, s);
      // at the quay: the officer's questions (again a while after a wrong story)
      this.rescueT -= 0.5;
      if (this.rescueT <= 0 && this.rescueDue() && !g.ui.stack.length) { this.rescueT = 20; g.ui.open('oroRescue'); }
    }
    this.animate(dt);
  }

  // who stands where: El Maestro, the contacts, the officer with Siroco, the crew and the guards, the police
  people(pl, s) {
    const g = this.game, M = g.missions, p = g.player.pos;
    const want = new Map();
    const at = (id, look, x, z, opts = {}) => want.set(id, { look, x, z, ...opts });
    const near = (name, r = 120) => { const q = M.placeXZ(name); return q && Math.hypot(q.x - p.x, q.z - p.z) < r ? q : null; };
    const cell = (q, r = 20) => g.city.openCellNear(q.x, q.z, r) || q;
    let q;
    if (s.act <= 1 && (q = near('Finca El Maestro'))) { const c = cell(q); at('maestro', 'maestro', c.x + 0.5, c.z + 0.5, { bang: true }); }
    if (s.act >= 7 && (q = near('La Misericordia'))) { const c = cell(q, 30); at('maestro', 'maestro', c.x + 0.5, c.z + 0.5, { bang: s.act === 8 }); }
    if (s.act === 2 || s.act === 4) for (const m of this.missions()) {
      if (m.act !== s.act || M.isDone(m.id) || !(q = near(m.steps[0].near))) continue;
      const c = cell(q, 30);
      at('c_' + m.key, 'contact', c.x + 0.5, c.z + 0.5, { bang: true });
    }
    if (s.act === 3 && (q = near('Muelle Uno'))) { const c = cell(q, 30); at('officer', 'police', c.x + 0.5, c.z + 0.5, { bang: true }); at('siroco', 'crew', c.x + 1.8, c.z + 0.5); }
    if (pl && Math.hypot(pl.P.door.x - p.x, pl.P.door.z - p.z) < 140) {
      const y = pl.P.base + 1;
      if (s.act === 6) {
        CREW.forEach((k, i) => { const f = pl.furnaces[i % pl.furnaces.length]; if (!f) return; const r = this.pt(pl, f[0] + 1, f[1] + 1); at('crew_' + k, 'crew', r.x + 0.5, r.z + 0.5, { y }); });
        for (let i = 0; i < 5; i++) { const r = this.pt(pl, 2 + (i % 2) * 2, 4 + i * 2); at('g' + i, 'guard', r.x + 0.5, r.z + 0.5, { y }); }
      }
      if (s.act >= 6 && s.act <= 7) for (let i = 0; i < 4; i++) { const r = this.pt(pl, -6 - (i % 2) * 2, pl.mid - 3 + i * 2); at('pol' + i, 'police', r.x + 0.5, r.z + 0.5, { ground: true }); }
    }
    for (const [id, w] of want) {
      let n = this.npcs.get(id);
      if (!n || n.look !== w.look) {
        if (n) g.scene.remove(n.rig.group);
        n = { look: w.look, rig: this.makeNpc(w.look) };
        g.scene.add(n.rig.group);
        this.npcs.set(id, n);
      }
      const y = w.y ?? g.city.groundAt(Math.floor(w.x), Math.floor(w.z)) + 1;
      n.rig.group.position.set(w.x, y, w.z);
      if (n.rig.bang) n.rig.bang.visible = !!w.bang;
    }
    for (const [id, n] of this.npcs) if (!want.has(id)) { g.scene.remove(n.rig.group); this.npcs.delete(id); }
  }

  makeNpc(look) {
    const c = look === 'crew' ? RED : look === 'guard' ? GUARD : look === 'police' ? POLICE : look === 'maestro' ? MAESTRO : { ...GUARD, shirt: '#3a3a44', shirt2: '#2b2b33', pants: '#22222a' };
    const rig = humanoid(c, 'player', 1);
    if (look === 'crew') {
      const m = box(0.52, 0.42, 0.06, '#f4efe6'); m.position.set(0, 0, 0.27); rig.head.add(m);
      const grin = box(0.3, 0.05, 0.02, '#c81e1e'); grin.position.set(0, -0.1, 0.31); rig.head.add(grin);
    } else if (look === 'police') {
      const cap = box(0.56, 0.12, 0.56, '#14244f'); cap.position.y = 0.3; rig.head.add(cap);
    } else if (look === 'maestro') {
      const gl = box(0.42, 0.08, 0.04, '#111111'); gl.position.set(0, 0.03, 0.27); rig.head.add(gl);
      const beard = box(0.4, 0.14, 0.06, '#3a2a1a'); beard.position.set(0, -0.2, 0.26); rig.head.add(beard);
    } else if (look === 'contact') {
      const hat = box(0.6, 0.08, 0.6, '#1c1c22'); hat.position.y = 0.28; rig.head.add(hat);
    }
    const bar = box(0.16, 0.45, 0.16, '#ffd65c'); bar.position.y = 2.55;
    const dot = box(0.16, 0.16, 0.16, '#ffd65c'); dot.position.y = 2.15;
    const bangG = new THREE.Group(); bangG.add(bar, dot); bangG.visible = false; rig.group.add(bangG); rig.bang = bangG;
    return rig;
  }

  animate() {
    const k = performance.now() / 1000;
    for (const [id, n] of this.npcs) {
      const ph = k * 3 + id.length;
      if (n.look === 'crew') { n.rig.armL.rotation.x = -0.9 + Math.sin(ph) * 0.3; n.rig.armR.rotation.x = -0.9 - Math.sin(ph) * 0.3; }
      else if (n.look === 'guard') n.rig.legL.rotation.x = n.rig.legR.rotation.x = -1.2; // sitting, waiting
      else if (n.look === 'police') n.rig.armR.rotation.x = -0.4 + Math.sin(ph) * 0.05;
      if (n.rig.bang && n.rig.bang.visible) n.rig.bang.position.y = Math.sin(k * 3) * 0.08;
    }
  }

  clearNpcs() { for (const n of this.npcs.values()) this.game.scene.remove(n.rig.group); this.npcs.clear(); }
}
