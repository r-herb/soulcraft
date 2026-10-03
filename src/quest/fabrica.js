// La Fábrica, season 1: a heist in the style of the famous TV series, our
// own story. El Maestro, waiting in a farmhouse up the hill, teaches the plan;
// four contacts around Malaga bring the red jumpsuits, the masks, the truck
// and the blueprints; then the crew (Levante, Poniente, Terral and Siroco,
// Malaga's winds) take over the old tobacco factory, now the mint, and print
// money under siege: presses to keep running, the negotiator on the red
// phone, police raids at the doors, a worker slipping out. Nobody is hurt:
// the workers wait in the canteen. When enough is printed, the crew digs out
// through the tunnel under the floor and brings the bags to El Maestro.
//
// The progress is the player's own (profile.fabrica). Played together, the
// host's game keeps it: the guests' actions go to the host ('fab' messages,
// and the missions' events), and the host sends the state back with the
// team's missions.
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { humanoid, box } from '../entities/models.js';
import { account, econ } from '../save/account.js';
import { bankCoords, bankPoint, bankWidth, fabLayout } from '../world/city.js';
import { B } from '../world/blocks.js';

export const TARGET = 10; // pallets to print
export const CREW = ['levante', 'poniente', 'terral', 'siroco'];
export const ALIASES = ['biznaga', 'cenachero', 'boqueron', 'pimpi', 'espeto', 'moraga'];
const PRESS_S = 26, PHONE_EVERY = [55, 80], PHONE_RING = 20, RAID_EVERY = [80, 110], RAID_WARN = 25, ESCAPE_EVERY = 95, ESCAPE_S = 28, CREW_EVERY = 40;
export const FAB_ACTS = ['maestro', 'class', 'prep', 'entry', 'siege', 'tunnel', 'escape', 'done'];

// the missions of each act (the reach steps meet a contact; the others are the factory's events)
const MISSIONS = [
  { key: 'maestro', act: 0, steps: [{ ev: 'reach', near: 'Finca El Maestro', r: 22 }] },
  { key: 'class', act: 1, steps: [{ ev: 'fab_quiz' }] },
  { key: 'monos', act: 2, steps: [{ ev: 'reach', near: 'Plaza de la Merced', r: 25 }] },
  { key: 'mascaras', act: 2, steps: [{ ev: 'reach', near: 'Catedral', r: 25 }] },
  { key: 'camion', act: 2, steps: [{ ev: 'reach', near: 'Estación María Zambrano', r: 30 }] },
  { key: 'planos', act: 2, steps: [{ ev: 'reach', near: 'Teatinos (Universidad)', r: 35 }] },
  { key: 'entrada', act: 3, steps: [{ ev: 'reach', near: 'La Tabacalera', r: 70 }, { ev: 'fab_enter' }] },
  { key: 'asedio', act: 4, steps: [{ ev: 'fab_print', n: TARGET }] },
  { key: 'tunel', act: 5, steps: [{ ev: 'fab_out' }] },
  { key: 'huida', act: 6, steps: [{ ev: 'reach', near: 'Finca El Maestro', r: 25 }] },
];
export const fabId = (key) => 'f_' + key;

const RED = { skin: '#d9a57a', hair: '#2b1d12', shirt: '#c81e1e', shirt2: '#c81e1e', pants: '#b01818', eye: '#1b1b22', accent: '#111111' };
const WORKER = { skin: '#e0ac86', hair: '#4d3421', shirt: '#f2f2f2', shirt2: '#f2f2f2', pants: '#3a4a6a', eye: '#1f2a6b', accent: '#9aa0a8' };
const POLICE = { skin: '#c68a5e', hair: '#1a1a1a', shirt: '#1f3a8a', shirt2: '#1f3a8a', pants: '#14244f', eye: '#1b1b22', accent: '#ffd65c' };
const MAESTRO = { skin: '#e0b08a', hair: '#3a2a1a', shirt: '#6b5a4a', shirt2: '#6b5a4a', pants: '#3a3a44', eye: '#1b1b22', accent: '#8a6238' };
const fresh = () => ({ act: 0, alias: null, printed: 0, patience: 60, presses: {}, phone: null, raid: null, esc: null, nextPhone: 40, nextRaid: 70, nextEsc: 60, nextCrew: CREW_EVERY, bags: 0, fails: 0, done: false, paid: 0 });

export class Fabrica {
  constructor(game) { this.game = game; this.npcs = new Map(); this.t = 0; this.netT = 0; }

  // ---------- state ----------
  get guest() { const n = this.game.net; return !!(n && !n.isHost); }
  state() {
    const g = this.game;
    if (this.guest) return (g.team && g.team.fabrica) || fresh();
    const pr = g.profile;
    if (!pr.fabrica) pr.fabrica = fresh();
    return pr.fabrica;
  }
  get act() { return this.state().act; }

  // the missions so far (done ones stay listed), see src/quest/missions.js
  missions() {
    const s = this.state();
    return MISSIONS.filter((m) => m.act <= Math.min(s.act, 6)).map((m) => ({ id: fabId(m.key), fab: true, key: m.key, act: m.act, reward: { coins: 0, crystals: m.act >= 4 ? 25 : 8 }, steps: m.steps }));
  }

  // a mission of the season done: the next act
  onMission(m) {
    const g = this.game, s = this.state(), M = g.missions;
    if (m.key === 'maestro' && s.act === 0) { s.act = 1; setTimeout(() => g.running && g.ui.open('fabLesson'), 600); }
    else if (m.key === 'class' && s.act === 1) s.act = 2;
    else if (s.act === 2 && ['monos', 'mascaras', 'camion', 'planos'].every((k) => M.isDone(fabId(k)))) { s.act = 3; g.ui.toast(t('fab.readyEntry'), 'soul'); }
    else if (m.key === 'entrada' && s.act === 3) s.act = 4;
    else if (m.key === 'asedio' && s.act === 4) { s.act = 5; this.say('tunnelNow'); }
    else if (m.key === 'tunel' && s.act === 5) s.act = 6;
    else if (m.key === 'huida' && s.act === 6) this.finish();
    if (s.act >= 2 && s.act <= 6) { const next = M.all().find((x) => x.fab && !M.isDone(x.id)); if (next) M.track(next.id, false); }
    if (M.host) M.dirty = true;
  }

  // a line from El Maestro (or the crew) as a toast
  say(key, vars) { this.game.ui.toast(t('fab.say.' + key, vars), 'soul'); }

  // ---------- the class: lessons, a quiz, an alias ----------
  passClass(alias) {
    const s = this.state();
    if (alias) s.alias = alias;
    this.game.missions.event('fab_quiz');
  }

  // ---------- the factory ----------
  plan() {
    const c = this.game.city, P = c && c.fabricaPlan && c.fabricaPlan();
    if (!P) return null;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z), width = bankWidth(P);
    return { P, mid, depth, width, ...fabLayout(depth, width) };
  }
  pt(pl, d, a) { return bankPoint(pl.P, d, a); }
  inside(pl, p = this.game.player.pos) { const P = pl.P; return p.x >= P.x0 && p.x <= P.x1 + 1 && p.z >= P.z0 && p.z <= P.z1 + 1 && p.y > P.base - 4; }

  // the crew goes in: everyone teleported to the lobby, the doors shut behind
  async enter() {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 3) return false;
    if (this.guest) { this.send('enter'); return true; }
    Object.assign(s, { printed: 0, patience: 60, presses: {}, phone: null, raid: null, esc: null, nextPhone: 35, nextRaid: 60, nextEsc: 50, nextCrew: CREW_EVERY });
    this.clearPallets(pl);
    this.toLobby(pl);
    g.missions.event('fab_enter');
    if (g.net) g.net.send({ t: 'fab', a: 'in' });
    this.say('inside');
    return true;
  }
  // the test panel: straight into the siege
  async enterTest() {
    const s = this.state();
    s.act = 3;
    const M = this.game.missions; M.prog(fabId('entrada')).step = 1;
    for (let i = 0; i < 60 && !this.plan(); i++) await new Promise((r) => setTimeout(r, 100));
    await this.enter();
  }
  toLobby(pl) {
    const g = this.game, q = this.pt(pl, 2, pl.mid + 1);
    g.player.pos.set(q.x + 0.5, pl.P.base + 1.05, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
  }
  outside(pl) {
    const g = this.game, q = this.pt(pl, -8, pl.mid), c = g.city.openCellNear(q.x, q.z, 20) || q;
    g.player.pos.set(c.x + 0.5, g.city.groundAt(c.x, c.z) + 1.05, c.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
  }

  pressAt(pl, x, z) { return pl.presses.findIndex(([d, a]) => { const q = this.pt(pl, d, a); return q.x === x && q.z === z; }); }

  // a player uses a block of the factory; true when it was one
  use(hit) {
    const g = this.game, pl = this.plan();
    if (!pl || !hit) return false;
    const P = pl.P;
    if (hit.x < P.x0 - 1 || hit.x > P.x1 + 1 || hit.z < P.z0 - 1 || hit.z > P.z1 + 1) return false;
    const s = this.state(), id = hit.id;
    if (id === B.factory_door) {
      if (s.act === 3 && !this.inside(pl)) { this.enter(); return true; }
      // back in after a fall during the siege
      if (s.act === 4 && !this.inside(pl)) { this.toLobby(pl); return true; }
      if (s.act === 4) { this.action('door', { door: this.doorOf(pl, hit) }); return true; }
      g.ui.toast(t(s.act < 3 ? 'fab.doorShut' : 'fab.doorLocked')); return true;
    }
    if (s.act !== 4 && s.act !== 5) { if ([B.money_press, B.money_press_on, B.paper_stack, B.ink_barrel, B.red_phone].includes(id)) { g.ui.toast(t('fab.notNow')); return true; } }
    if (id === B.paper_stack) { g.giveItem('paper_roll', 4); g.audio.sfx('pickup'); g.ui.toast(t('fab.gotPaper')); return true; }
    if (id === B.ink_barrel) { g.giveItem('ink_can', 4); g.audio.sfx('pickup'); g.ui.toast(t('fab.gotInk')); return true; }
    if (id === B.money_press || id === B.money_press_on) {
      const i = this.pressAt(pl, hit.x, hit.z);
      if (i < 0) return true;
      const pr = s.presses[i];
      if (pr && pr.jam) { this.action('fix', { i }); return true; }
      if (pr && pr.on) { g.ui.toast(t('fab.pressBusy', { s: Math.ceil(pr.t) })); return true; }
      if (!g.creative && (!g.inventory.count('paper_roll') || !g.inventory.count('ink_can'))) { g.ui.toast(t('fab.needSupplies'), 'warn'); return true; }
      if (!g.creative) { g.inventory.remove('paper_roll', 1); g.inventory.remove('ink_can', 1); }
      this.action('start', { i });
      return true;
    }
    if (id === B.red_phone) { if (s.phone) g.ui.open('fabPhone'); else g.ui.toast(t('fab.phoneSilent')); return true; }
    if (id === B.sewer_grate) { this.hatch(pl, hit); return true; }
    return false;
  }
  doorOf(pl, hit) { const { d } = bankCoords(pl.P, hit.x, hit.z); return d <= 0 ? 'front' : 'back'; }

  // the tunnel's hatches: the pallet room's opens when the digging starts; the lobby's leads out
  hatch(pl, hit) {
    const g = this.game, s = this.state(), { d } = bankCoords(pl.P, hit.x, hit.z), tn = pl.tunnel, base = pl.P.base;
    const above = g.player.pos.y > base;
    const to = (dd, y) => { const q = this.pt(pl, dd, tn.a); g.player.pos.set(q.x + 0.5, y, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null; };
    if (s.act < 5) { g.ui.toast(t('fab.hatchShut')); return; }
    if (d === tn.from) { if (above) { to(tn.from - 0, base - 2); this.say('dig'); } else to(tn.from, base + 1); g.audio.sfx('step'); return; }
    if (d === tn.to) {
      if (above) { g.ui.toast(t('fab.hatchShut')); return; }
      // out through a manhole across the street, with the money
      this.outside(pl);
      const bags = Math.max(1, s.printed);
      g.giveItem('money_bag', bags);
      g.audio.sfx('levelup');
      g.ui.toast(t('fab.out', { n: bags }), 'soul');
      g.missions.event('fab_out');
    }
  }

  // ---------- actions (a guest's go to the host) ----------
  action(a, data = {}) {
    if (this.guest) { this.send(a, data); this.localEcho(a, data); return; }
    this.apply(a, data, true);
  }
  send(a, data = {}) { const n = this.game.net; if (n) n.send({ t: 'fab', a, ...data }); }
  localEcho(a) { const g = this.game; if (a === 'start') g.audio.sfx('place'); if (a === 'door') g.audio.sfx('place'); }
  onNet(msg) {
    const g = this.game;
    if (this.guest) {
      // from the host: everyone in (or out)
      const pl = this.plan();
      if (!pl) return;
      if (msg.a === 'in') { this.toLobby(pl); this.say('inside'); }
      else if (msg.a === 'out') this.outside(pl);
      return;
    }
    if (msg.a === 'enter') { this.enter(); return; }
    this.apply(msg.a, msg, false);
    void g;
  }

  apply(a, data, mine) {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 4) return;
    if (a === 'start') {
      const i = data.i | 0;
      if (!pl.presses[i]) return;
      s.presses[i] = { on: true, t: PRESS_S, jam: false, jamAt: Math.random() < 0.22 ? PRESS_S * (0.3 + Math.random() * 0.4) : -1 };
      this.setPress(pl, i, true);
      if (mine) g.audio.sfx('place');
    } else if (a === 'fix') {
      const pr = s.presses[data.i | 0];
      if (pr && pr.jam) { pr.jam = false; pr.on = true; this.setPress(pl, data.i | 0, true); g.ui.toast(t('fab.fixed')); g.audio.sfx('levelup'); }
    } else if (a === 'door') {
      if (s.raid && s.raid.door === data.door && !s.raid.held) { s.raid.held = true; g.ui.toast(t('fab.raidHeld'), 'soul'); g.audio.sfx('place'); s.patience = Math.min(100, s.patience + 2); }
      else if (mine) g.ui.toast(t('fab.doorLocked'));
    } else if (a === 'phone') {
      if (!s.phone) return;
      const d = [8, 3, -12, 5][data.choice | 0] ?? 0;
      s.patience = Math.max(0, Math.min(100, s.patience + d));
      if ((data.choice | 0) === 1) s.nextRaid += 30; // stalling buys time
      s.phone = null;
      g.ui.toast(t(d >= 0 ? 'fab.phoneGood' : 'fab.phoneBad', { n: Math.abs(d) }), d >= 0 ? 'soul' : 'warn');
    } else if (a === 'catch') {
      if (s.esc) { s.esc = null; g.ui.toast(t('fab.caught'), 'soul'); }
    }
    if (g.missions.host) g.missions.dirty = true;
  }

  setPress(pl, i, on) { const [d, a] = pl.presses[i], q = this.pt(pl, d, a); this.game.world.setBlock(q.x, pl.P.base + 1, q.z, on ? B.money_press_on : B.money_press); }
  placePallet(pl, n) { const p = pl.pallets[n - 1]; if (!p) return; const q = this.pt(pl, p[0], p[1]); this.game.world.setBlockAnywhere(q.x, pl.P.base + 1, q.z, B.cash_pallet); }
  clearPallets(pl) { for (const [d, a] of pl.pallets) { const q = this.pt(pl, d, a); this.game.world.setBlockAnywhere(q.x, pl.P.base + 1, q.z, B.air); } for (let i = 0; i < pl.presses.length; i++) { const [d, a] = pl.presses[i], q = this.pt(pl, d, a); this.game.world.setBlockAnywhere(q.x, pl.P.base + 1, q.z, B.money_press); } }

  // ---------- the siege (the host runs it) ----------
  siege(dt, pl) {
    const g = this.game, s = this.state();
    // presses
    for (const [k, pr] of Object.entries(s.presses)) {
      if (!pr.on || pr.jam) continue;
      pr.t -= dt;
      if (pr.jamAt > 0 && pr.t <= pr.jamAt) { pr.jamAt = -1; pr.jam = true; pr.on = false; this.setPress(pl, +k, false); g.ui.toast(t('fab.jam', { n: +k + 1 }), 'warn'); g.audio.sfx('warn'); continue; }
      if (pr.t <= 0) {
        pr.on = false; this.setPress(pl, +k, false);
        s.printed = Math.min(pl.pallets.length, s.printed + 1);
        this.placePallet(pl, s.printed);
        g.audio.sfx('crystal');
        g.ui.toast(t('fab.pallet', { n: s.printed, total: TARGET }), 'soul');
        g.missions.event('fab_print');
      }
    }
    // the crew keeps an idle press going now and then
    s.nextCrew -= dt;
    if (s.nextCrew <= 0) {
      s.nextCrew = CREW_EVERY;
      const idle = pl.presses.findIndex((_, i) => !(s.presses[i] && (s.presses[i].on || s.presses[i].jam)));
      if (idle >= 0) { this.apply('start', { i: idle }, false); g.ui.toast(t('fab.crewStarts', { name: t('fab.crew.' + CREW[idle % CREW.length]), n: idle + 1 })); }
    }
    // the red phone
    if (s.phone) { s.phone.t -= dt; if (s.phone.t <= 0) { s.phone = null; s.patience = Math.max(0, s.patience - 10); g.ui.toast(t('fab.phoneMissed'), 'warn'); } }
    else { s.nextPhone -= dt; if (s.nextPhone <= 0) { s.nextPhone = PHONE_EVERY[0] + Math.random() * (PHONE_EVERY[1] - PHONE_EVERY[0]); s.phone = { t: PHONE_RING, line: Math.floor(Math.random() * 5) }; g.ui.toast(t('fab.phoneRings'), 'warn'); g.audio.sfx('warn'); } }
    // police raids
    if (s.raid) {
      s.raid.t -= dt;
      if (s.raid.t <= 0) {
        if (!s.raid.held) { const lost = Math.min(2, s.printed); for (let i = 0; i < lost; i++) { const p = pl.pallets[s.printed - 1 - i]; if (p) { const q = this.pt(pl, p[0], p[1]); g.world.setBlock(q.x, pl.P.base + 1, q.z, B.air); } } s.printed -= lost; s.patience = Math.max(0, s.patience - 10); g.ui.toast(t('fab.raidLost', { n: lost }), 'warn'); }
        s.raid = null;
      }
    } else { s.nextRaid -= dt; if (s.nextRaid <= 0) { s.nextRaid = RAID_EVERY[0] + Math.random() * (RAID_EVERY[1] - RAID_EVERY[0]); s.raid = { door: Math.random() < 0.5 ? 'front' : 'back', t: RAID_WARN, held: false }; g.ui.toast(t('fab.raid.' + s.raid.door), 'warn'); g.audio.sfx('warn'); } }
    // a worker slipping out of the canteen towards the front door
    if (s.esc) {
      s.esc.t += dt;
      if (s.esc.t >= ESCAPE_S) { s.esc = null; s.patience = Math.max(0, s.patience - 15); g.ui.toast(t('fab.escaped'), 'warn'); }
      else { const w = this.escapee(pl, s.esc); if (this.nearAnyone(w, 2.6)) this.apply('catch', {}, true); }
    } else { s.nextEsc -= dt; if (s.nextEsc <= 0) { s.nextEsc = ESCAPE_EVERY * (0.8 + Math.random() * 0.5); s.esc = { t: 0 }; g.ui.toast(t('fab.escaping'), 'warn'); } }
    // out of patience: the police storm in
    if (s.patience <= 0) this.stormed(pl);
  }

  // where the slipping worker is: from the canteen's door to the front door
  escapee(pl, esc) {
    const k = Math.min(1, esc.t / ESCAPE_S), from = this.pt(pl, pl.back + 1, Math.floor(pl.half / 2)), to = this.pt(pl, 1, pl.mid);
    return { x: from.x + 0.5 + (to.x - from.x) * k, z: from.z + 0.5 + (to.z - from.z) * k };
  }
  nearAnyone(w, r) {
    const g = this.game, p = g.player.pos;
    if (Math.hypot(p.x - w.x, p.z - w.z) < r) return true;
    if (g.net) for (const rp of g.net.players.values()) if (rp.seen && Math.hypot(rp.pos.x - w.x, rp.pos.z - w.z) < r) return true;
    return false;
  }

  stormed(pl) {
    const g = this.game, s = this.state();
    this.clearPallets(pl);
    s.printed = 0; s.patience = 60; s.presses = {}; s.phone = null; s.raid = null; s.esc = null; s.fails++;
    s.act = 3;
    // the entry mission waits at the door again
    const M = g.missions, st = M.state();
    for (const k of ['entrada', 'asedio']) { delete st.done[fabId(k)]; delete st.prog[fabId(k)]; }
    M.prog(fabId('entrada')).step = 1;
    this.outside(pl);
    if (g.net) g.net.send({ t: 'fab', a: 'out' });
    g.ui.toast(t('fab.stormed'), 'warn');
    g.audio.sfx('warn');
    if (M.host) M.dirty = true;
    g.save(true);
  }

  // ---------- the end ----------
  async finish() {
    const g = this.game, s = this.state();
    if (s.done) return;
    const bags = g.inventory.count('money_bag');
    let paid = 0;
    if (bags && account.user && account.available && econ.fabrica) { try { paid = (await econ.fabrica(bags)).paid || 0; } catch { /* once per account */ } }
    if (bags) g.inventory.remove('money_bag', bags);
    s.act = 7; s.done = true; s.bags = bags; s.paid = paid;
    if (!g.creative) g.addCrystals(150 + 15 * bags);
    g.save(true);
    g.ui.open('fabFinale', { bags, paid });
  }

  // ---------- every frame ----------
  update(dt) {
    const g = this.game;
    if (!g.missions || !g.missions.active) { this.clearNpcs(); return; }
    const s = this.state(), pl = this.plan();
    if (pl && s.act === 4 && !this.guest) this.siege(dt, pl);
    this.t += dt;
    if (this.t >= 0.5) { this.t = 0; this.people(pl, s); }
    this.animate(dt, pl, s);
  }

  // who stands where: El Maestro at the farmhouse, the contacts, the crew and the workers in the factory, the police outside
  people(pl, s) {
    const g = this.game, M = g.missions, p = g.player.pos;
    const want = new Map();
    const at = (id, look, x, z, opts = {}) => want.set(id, { look, x, z, ...opts });
    const mq = M.placeXZ('Finca El Maestro');
    if (mq && Math.hypot(mq.x - p.x, mq.z - p.z) < 120 && (s.act <= 1 || s.act === 6 || s.act === 7)) {
      const c = g.city.openCellNear(mq.x, mq.z, 20) || mq;
      at('maestro', 'maestro', c.x + 0.5, c.z + 0.5, { bang: s.act <= 1 || s.act === 6, name: t('fab.maestro') });
    }
    if (s.act === 2) for (const m of this.missions()) {
      if (m.act !== 2 || M.isDone(m.id)) continue;
      const q = M.placeXZ(m.steps[0].near);
      if (!q || Math.hypot(q.x - p.x, q.z - p.z) > 120) continue;
      const c = g.city.openCellNear(q.x, q.z, 30) || q;
      at('c_' + m.key, 'contact', c.x + 0.5, c.z + 0.5, { bang: true });
    }
    if (pl && Math.hypot(pl.P.door.x - p.x, pl.P.door.z - p.z) < 140) {
      const y = pl.P.base + 1;
      if (s.act === 4) {
        CREW.forEach((k, i) => { const pr = pl.presses[i % pl.presses.length]; if (!pr) return; const q = this.pt(pl, pr[0] + 1, pr[1] + 1); at('crew_' + k, 'crew', q.x + 0.5, q.z + 0.5, { y, name: t('fab.crew.' + k) }); });
        for (let i = 0; i < 6; i++) { if (s.esc && i === 0) continue; const q = this.pt(pl, pl.back + 2 + (i % 3) * 1, 1 + Math.floor(i / 3) * 3 + 1); at('w' + i, 'worker', q.x + 0.5, q.z + 0.5, { y }); }
        if (s.esc) { const w = this.escapee(pl, s.esc); at('w0', 'worker', w.x, w.z, { y, walk: true, bang: true }); }
      }
      if (s.act >= 4 && s.act <= 5) for (let i = 0; i < 4; i++) { const q = this.pt(pl, -6 - (i % 2) * 2, pl.mid - 3 + i * 2); at('pol' + i, 'police', q.x + 0.5, q.z + 0.5, { ground: true }); }
    }
    for (const [id, w] of want) {
      let n = this.npcs.get(id);
      if (!n || n.look !== w.look) {
        if (n) g.scene.remove(n.rig.group);
        n = { look: w.look, rig: this.makeNpc(w.look, w.bang, w.name) };
        g.scene.add(n.rig.group);
        this.npcs.set(id, n);
      }
      const y = w.ground ? g.city.groundAt(Math.floor(w.x), Math.floor(w.z)) + 1 : w.y ?? g.city.groundAt(Math.floor(w.x), Math.floor(w.z)) + 1;
      n.target = { x: w.x, y, z: w.z, walk: !!w.walk };
      if (!n.placed) { n.rig.group.position.set(w.x, y, w.z); n.placed = true; }
      if (n.rig.bang) n.rig.bang.visible = !!w.bang;
    }
    for (const [id, n] of this.npcs) if (!want.has(id)) { g.scene.remove(n.rig.group); this.npcs.delete(id); }
  }

  makeNpc(look, bang, name) {
    const c = look === 'crew' ? RED : look === 'worker' ? WORKER : look === 'police' ? POLICE : look === 'maestro' ? MAESTRO : { ...WORKER, shirt: '#3a3a44', shirt2: '#2b2b33', pants: '#22222a' };
    const rig = humanoid(c, 'player', 1);
    if (look === 'crew') {
      // the white mask with a painted grin
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
    const bangG = new THREE.Group(); bangG.add(bar, dot); bangG.visible = !!bang; rig.group.add(bangG); rig.bang = bangG;
    void name;
    return rig;
  }

  animate(dt, pl, s) {
    const k = performance.now() / 1000;
    for (const [id, n] of this.npcs) {
      const g = n.rig.group, tg = n.target;
      if (tg) { g.position.x += (tg.x - g.position.x) * Math.min(1, dt * 4); g.position.z += (tg.z - g.position.z) * Math.min(1, dt * 4); g.position.y = tg.y; }
      const ph = k * (tg && tg.walk ? 8 : 3) + id.length;
      if (n.look === 'crew') { n.rig.armL.rotation.x = -0.9 + Math.sin(ph) * 0.3; n.rig.armR.rotation.x = -0.9 - Math.sin(ph) * 0.3; }
      else if (tg && tg.walk) { n.rig.legL.rotation.x = Math.sin(ph) * 0.6; n.rig.legR.rotation.x = -Math.sin(ph) * 0.6; }
      else if (n.look === 'police') { n.rig.armR.rotation.x = -0.4 + Math.sin(ph) * 0.05; }
      if (n.look === 'worker' && !(tg && tg.walk)) n.rig.legL.rotation.x = n.rig.legR.rotation.x = -1.2; // sitting
      if (n.rig.bang && n.rig.bang.visible) n.rig.bang.position.y = Math.sin(k * 3) * 0.08;
    }
    void pl; void s;
  }

  clearNpcs() { for (const n of this.npcs.values()) this.game.scene.remove(n.rig.group); this.npcs.clear(); }
}
