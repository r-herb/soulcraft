// La Fábrica, season 4: El Vuelo. After the rescue Inspector Vega seized the
// crew's gold from La Térmica as evidence; tonight a police cargo flight takes
// it from Málaga airport to Madrid. El Maestro, free again, calls the crew to
// the farmhouse: the plan and a quiz, then three contacts (a forger with the
// passports, a pilot with a small jet, a baggage handler with a staff badge),
// and the night at the airport's cargo terminal: in through the staff door,
// across the cargo hall where two guards walk their lanes with torches (hide
// behind the containers; the baggage belt along the side carries you), then in
// the control room the belts' routing panel - turn the belt pieces so the
// evidence container rolls to Hangar 7, where the jet waits. Then the tower
// notices: two and a half minutes to board the jet by the runway. Nobody is
// hurt: seen, the crew slips out and tries again.
//
// It opens when season 3 is done. The guards and the belt run on the clock, so
// every player in a room sees them the same; the host keeps the rest
// (profile.aero), as in the other seasons.
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { seasonOpenFor } from './seasons.js';
import { humanoid, box } from '../entities/models.js';
import { account, econ } from '../save/account.js';
import { bankCoords, bankPoint, bankWidth, aeroLayout } from '../world/city.js';
import { B, BLOCKS } from '../world/blocks.js';

const ESC_S = 150, GUARD_SPEED = 1.6, SIGHT = 9, SIGHT_HALF = 0.5, BELT_SPEED = 3.2;
// the runway's heading (Málaga's runway 13: 130 degrees from north), the way the jet takes off
const RUNWAY = (130 * Math.PI) / 180;
export const AERO_ACTS = ['vuelo', 'plan', 'prep', 'entry', 'patrol', 'route', 'run', 'done'];

const MISSIONS = [
  { key: 'vuelo', act: 0, steps: [{ ev: 'reach', near: 'Finca El Maestro', r: 22 }] },
  { key: 'plan4', act: 1, steps: [{ ev: 'aero_quiz' }] },
  { key: 'falsificador', act: 2, steps: [{ ev: 'reach', near: 'Mercado de Atarazanas', r: 35 }], items: [['fake_passport', 1]] },
  { key: 'piloto', act: 2, steps: [{ ev: 'reach', near: 'Aeropuerto', r: 40 }] },
  { key: 'mozo', act: 2, steps: [{ ev: 'reach', near: 'Estación María Zambrano', r: 35 }], items: [['cargo_badge', 1]] },
  { key: 'entrada4', act: 3, steps: [{ ev: 'reach', near: 'Terminal de Carga', r: 60 }, { ev: 'aero_enter' }] },
  { key: 'patrulla', act: 4, steps: [{ ev: 'aero_through' }] },
  { key: 'desvio', act: 5, steps: [{ ev: 'aero_route' }] },
  { key: 'pista', act: 6, steps: [{ ev: 'reach', near: 'Hangar del Aeropuerto', r: 30 }, { ev: 'aero_board' }] },
];
export const aeroId = (key) => 'f4_' + key;
const PREP = ['falsificador', 'piloto', 'mozo'];

const POLICE = { skin: '#c68a5e', hair: '#1a1a1a', shirt: '#1f3a8a', shirt2: '#1f3a8a', pants: '#14244f', eye: '#1b1b22', accent: '#ffd65c' };
const GUARD = { skin: '#d9a57a', hair: '#2b1d12', shirt: '#2b2d33', shirt2: '#2b2d33', pants: '#1b1b22', eye: '#1b1b22', accent: '#ffd65c' };
const MAESTRO = { skin: '#e0b08a', hair: '#3a2a1a', shirt: '#6b5a4a', shirt2: '#6b5a4a', pants: '#3a3a44', eye: '#1b1b22', accent: '#8a6238' };
const PILOT = { skin: '#e0ac86', hair: '#4d3421', shirt: '#f4f4f4', shirt2: '#f4f4f4', pants: '#14244f', eye: '#1f2a6b', accent: '#f6c667' };
const CONTACT = { skin: '#e0ac86', hair: '#4d3421', shirt: '#3a3a44', shirt2: '#2b2b33', pants: '#22222a', eye: '#1f2a6b', accent: '#9aa0a8' };
const fresh = () => ({ act: 0, route: null, escape: 0, alarms: 0, done: false, paid: 0 });
const clockS = () => Date.now() / 1000;

// ---------- the belts' routing panel ----------
// A grid of belt pieces, straight or a corner, each turned a quarter at a
// time. The evidence container comes in on the left of the start row; the
// belts lead it out on the right of some row (or nowhere), and only the exit
// row goes to Hangar 7. Openings: N 1, E 2, S 4, W 8.
const N = 1, E = 2, S = 4, W = 8;
const turn = (m) => ((m << 1) | (m >> 3)) & 15;
export function openings(k, r) { let m = k ? N | E : N | S; for (let i = 0; i < r; i++) m = turn(m); return m; }
const STEP = { [N]: [-1, 0, S], [E]: [0, 1, W], [S]: [1, 0, N], [W]: [0, -1, E] }; // rows, columns, and the side the next piece is entered on
export function makeRoute(rnd = Math.random) {
  const R = 4, C = 5, start = Math.floor(rnd() * R), exit = Math.floor(rnd() * R);
  const cells = Array.from({ length: R * C }, () => ({ k: rnd() < 0.5 ? 0 : 1, r: 0 }));
  const sol = new Array(R * C).fill(-1);
  // the way through: down or up each column, then on to the next one
  let r = start;
  for (let c = 0; c < C; c++) {
    const to = c === C - 1 ? exit : Math.floor(rnd() * R), dir = to > r ? S : N;
    let inSide = W;
    for (;;) {
      const out = r === to ? E : dir, m = inSide | out, k = m === (N | S) || m === (E | W) ? 0 : 1;
      let rot = 0;
      while (openings(k, rot) !== m) rot++;
      cells[r * C + c].k = k; sol[r * C + c] = rot;
      if (out === E) break;
      r += dir === S ? 1 : -1; inSide = dir === S ? N : S;
    }
  }
  for (const cl of cells) cl.r = Math.floor(rnd() * 4);
  const route = { R, C, start, exit, cells, sol, dests: [] };
  // never solved to begin with
  if (traceRoute(route).to === exit) { const i = sol.findIndex((v) => v >= 0); cells[i].r = (sol[i] + 1) % 4; }
  const others = ['customs', 'police', 'lost'].sort(() => rnd() - 0.5);
  for (let i = 0; i < R; i++) route.dests.push(i === exit ? 'hangar' : others.pop());
  return route;
}
// where the belts lead now: the row it leaves on the right (or -1), and the pieces it crosses
export function traceRoute(rt, rots = rt.cells.map((c) => c.r)) {
  let r = rt.start, c = 0, inSide = W;
  const path = [];
  for (let n = 0; n <= rt.R * rt.C; n++) {
    const i = r * rt.C + c, m = openings(rt.cells[i].k, rots[i]);
    if (!(m & inSide)) return { to: -1, path };
    path.push(i);
    const [dr, dc, next] = STEP[m & ~inSide];
    r += dr; c += dc;
    if (c >= rt.C) return { to: r, path };
    if (r < 0 || r >= rt.R || c < 0) return { to: -1, path };
    inSide = next;
  }
  return { to: -1, path };
}

export class Aero {
  constructor(game) { this.game = game; this.npcs = new Map(); this.guards = []; this.bags = []; this.jet = null; this.t = 0; this.alarmT = 0; this.through = false; this.askT = 0; }

  // ---------- state ----------
  get guest() { const n = this.game.net; return !!(n && !n.isHost); }
  get open() { return seasonOpenFor(this.game, 4); }
  state() {
    const g = this.game;
    if (this.guest) return (g.team && g.team.aero) || fresh();
    const pr = g.profile;
    if (!pr.aero) pr.aero = fresh();
    return pr.aero;
  }
  get act() { return this.state().act; }

  missions() {
    if (!this.open) return [];
    const s = this.state();
    return MISSIONS.filter((m) => m.act <= Math.min(s.act, 6)).map((m) => ({ id: aeroId(m.key), fab: true, season: 4, key: m.key, act: m.act, reward: { coins: 0, crystals: m.act >= 4 ? 35 : 10 }, steps: m.steps, items: m.items || null }));
  }

  onMission(m) {
    const g = this.game, s = this.state(), M = g.missions;
    if (m.key === 'vuelo' && s.act === 0) { s.act = 1; setTimeout(() => g.running && g.ui.open('aeroLesson'), 600); }
    else if (m.key === 'plan4' && s.act === 1) s.act = 2;
    else if (s.act === 2 && PREP.every((k) => M.isDone(aeroId(k)))) { s.act = 3; g.ui.toast(t('aero.ready'), 'soul'); }
    else if (m.key === 'entrada4' && s.act === 3) s.act = 4;
    else if (m.key === 'patrulla' && s.act === 4) { s.act = 5; this.say('control'); }
    else if (m.key === 'desvio' && s.act === 5) { s.act = 6; s.escape = ESC_S; this.say('run'); }
    else if (m.key === 'pista' && s.act === 6) this.finish();
    if (s.act >= 2 && s.act <= 6) { const next = M.all().find((x) => x.season === 4 && !M.isDone(x.id)); if (next) M.track(next.id, false); }
    if (M.host) M.dirty = true;
  }

  say(key, vars) { this.game.ui.toast(t('aero.say.' + key, vars), 'soul'); }
  passClass() { this.game.missions.event('aero_quiz'); }

  // ---------- the cargo terminal ----------
  plan() {
    const c = this.game.city, P = c && c.aeroPlan && c.aeroPlan();
    if (!P) return null;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z), width = bankWidth(P);
    // the building's axes in the world: a step deeper, a step across
    const o = bankPoint(P, 0, 0), dd = bankPoint(P, 1, 0), da = bankPoint(P, 0, 1);
    return { P, mid, depth, width, o, dv: { x: dd.x - o.x, z: dd.z - o.z }, av: { x: da.x - o.x, z: da.z - o.z }, ...aeroLayout(depth, width) };
  }
  pt(pl, d, a) { return bankPoint(pl.P, d, a); }
  // a point in the world from (fractional) depth and across, at the middle of its cell
  at(pl, d, a) { return { x: pl.o.x + pl.dv.x * d + pl.av.x * a + 0.5, z: pl.o.z + pl.dv.z * d + pl.av.z * a + 0.5 }; }
  inside(pl, p = this.game.player.pos) { const P = pl.P; return p.x >= P.x0 && p.x <= P.x1 + 1 && p.z >= P.z0 && p.z <= P.z1 + 1 && p.y > P.base - 2 && p.y < P.base + 8; }
  where(pl, p = this.game.player.pos) { return bankCoords(pl.P, Math.floor(p.x), Math.floor(p.z)); }

  async enter() {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 3) return false;
    if (this.guest) { this.send('enter'); return true; }
    s.route = makeRoute(); s.alarms = 0;
    this.toLobby(pl);
    g.missions.event('aero_enter');
    if (g.net) g.net.send({ t: 'aero', a: 'in' });
    this.say('inside');
    return true;
  }
  async enterTest() {
    this.state().act = 3;
    this.game.missions.prog(aeroId('entrada4')).step = 1;
    for (let i = 0; i < 60 && !this.plan(); i++) await new Promise((r) => setTimeout(r, 100));
    await this.enter();
  }
  toLobby(pl) {
    const g = this.game, q = this.pt(pl, 2, pl.mid), f = this.pt(pl, 5, pl.mid);
    g.player.pos.set(q.x + 0.5, pl.P.base + 1.05, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
    g.player.yaw = Math.atan2(-(f.x - q.x), -(f.z - q.z));
  }
  outside(pl) {
    const g = this.game, q = this.pt(pl, -6, pl.mid), c = g.city.openCellNear(q.x, q.z, 20) || q;
    g.player.pos.set(c.x + 0.5, g.city.groundAt(c.x, c.z) + 1.05, c.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
  }

  use(hit) {
    const g = this.game, pl = this.plan();
    if (!pl || !hit) return false;
    const P = pl.P;
    if (hit.x < P.x0 - 1 || hit.x > P.x1 + 1 || hit.z < P.z0 - 1 || hit.z > P.z1 + 1) return false;
    const s = this.state(), id = hit.id;
    if (id === B.staff_door) {
      if (s.act === 3 && !this.inside(pl)) {
        if (!g.inventory.count('cargo_badge')) { g.ui.toast(t('aero.needBadge'), 'warn'); return true; }
        this.enter(); return true;
      }
      if ((s.act === 4 || s.act === 5) && !this.inside(pl)) { this.toLobby(pl); return true; }
      g.ui.toast(t(s.act < 3 ? 'aero.doorShut' : s.act === 6 ? 'aero.toJet' : 'aero.doorLocked')); return true;
    }
    if (id === B.route_panel) {
      if (s.act < 5) { g.ui.toast(t('aero.panelLater')); return true; }
      if (s.act > 5) { g.ui.toast(t('aero.panelDone')); return true; }
      g.ui.open('aeroRoute'); return true;
    }
    if (id === B.monitor_desk) { g.ui.toast(t('aero.monitors')); return true; }
    if (id === B.cargo_container || id === B.cargo_container_red || id === B.conveyor) return true;
    return false;
  }

  // the belts lead to Hangar 7: the container is on its way
  routeDone() { this.game.audio.sfx('levelup'); this.game.missions.event('aero_route'); }

  // ---------- actions (a guest's go to the host) ----------
  action(a, data = {}) {
    if (this.guest) { this.send(a, data); return; }
    this.apply(a, data);
  }
  send(a, data = {}) { const n = this.game.net; if (n) n.send({ t: 'aero', a, ...data }); }
  onNet(msg) {
    if (this.guest) {
      const pl = this.plan();
      if (!pl) return;
      if (msg.a === 'in') { this.toLobby(pl); this.say('inside'); }
      else if (msg.a === 'out') { if (this.inside(pl) || msg.all) this.outside(pl); this.game.ui.toast(t(msg.why === 'escape' ? 'aero.blocked' : 'aero.spotted'), 'warn'); }
      return;
    }
    if (msg.a === 'enter') { this.enter(); return; }
    this.apply(msg.a, msg);
  }
  apply(a) {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl) return;
    if (a === 'alarm' && (s.act === 4 || s.act === 5)) {
      s.alarms++;
      g.audio.sfx('warn');
      if (this.inside(pl)) this.outside(pl);
      g.ui.toast(t('aero.spotted'), 'warn');
      if (g.net) g.net.send({ t: 'aero', a: 'out', why: 'alarm' });
    }
    if (g.missions.host) g.missions.dirty = true;
  }

  // ---------- the guards (on the clock, the same for everyone) ----------
  // guard i walks its lane across the hall and back: where it is, which way it faces
  guardAt(pl, i, now = clockS()) {
    const a0 = 2, a1 = pl.width - 2, span = a1 - a0, period = (2 * span) / GUARD_SPEED;
    const ph = (now / period + i * 0.37) % 1, f = ph < 0.5 ? ph * 2 : 2 - ph * 2, dir = ph < 0.5 ? 1 : -1;
    const a = a0 + span * f, p = this.at(pl, pl.lanes[i], a);
    return { d: pl.lanes[i], a, dir, x: p.x, z: p.z, yaw: Math.atan2(pl.av.x * dir, pl.av.z * dir) };
  }
  // the guards look while the crew is inside, on the way in and at the panel
  watching(s) { return s.act === 4 || s.act === 5; }

  // does guard i's torch light the point (the player's head)?
  sees(pl, i, p, now = clockS()) {
    const gd = this.guardAt(pl, i, now), o = { x: gd.x, y: pl.P.base + 1.6, z: gd.z };
    const dx = p.x - o.x, dz = p.z - o.z, dist = Math.hypot(dx, dz);
    if (dist > SIGHT || dist < 0.3) return false;
    let da = Math.atan2(dx, dz) - gd.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > SIGHT_HALF) return false;
    // nothing solid in between (a container hides)
    const w = this.game.world, n = Math.ceil(Math.hypot(dist, p.y - o.y) / 0.35);
    for (let k = 1; k < n; k++) {
      const f = k / n, id = w.getBlock(Math.floor(o.x + (p.x - o.x) * f), Math.floor(o.y + (p.y - o.y) * f), Math.floor(o.z + (p.z - o.z) * f));
      if (id > 0 && BLOCKS[id] && BLOCKS[id].opaque) return false;
    }
    return true;
  }

  // the player seen by a guard: the alarm; past the hall: the control room
  watch(dt, pl, s) {
    const g = this.game, p = g.player.pos;
    if (this.alarmT > 0) { this.alarmT -= dt; return; }
    if (!this.inside(pl) || g.player.dead || !this.watching(s)) return;
    const { d } = this.where(pl);
    if (d < pl.c0) {
      const head = new THREE.Vector3(p.x, p.y + 1.5, p.z);
      for (let i = 0; i < pl.lanes.length; i++) if (this.sees(pl, i, head)) { this.alarm(); return; }
    }
    if (s.act === 4 && d > pl.c0 && !this.through) { this.through = true; g.missions.event('aero_through'); }
  }
  alarm() {
    this.alarmT = 3;
    this.game.ui.toast(t('aero.alarm'), 'warn');
    this.action('alarm');
  }

  // the baggage belt carries whoever stands on it, deeper into the hall
  belt(dt, pl) {
    const g = this.game, pl_ = g.player, p = pl_.pos, w = g.world;
    if (!pl_.onGround || w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.05), Math.floor(p.z)) !== B.conveyor) return;
    const nx = p.x + pl.dv.x * BELT_SPEED * dt, nz = p.z + pl.dv.z * BELT_SPEED * dt;
    const free = (y) => { const id = w.getBlock(Math.floor(nx + pl.dv.x * 0.3), Math.floor(y), Math.floor(nz + pl.dv.z * 0.3)); return !(BLOCKS[id] && BLOCKS[id].solid); };
    if (free(p.y + 0.1) && free(p.y + 1.2)) { p.x = nx; p.z = nz; }
  }

  // ---------- the jet by the runway ----------
  jetSpot() {
    const g = this.game, q = g.missions.placeXZ('Hangar del Aeropuerto');
    if (!q) return null;
    const c = g.city.openCellNear(q.x, q.z, 20) || q;
    return { x: c.x + 0.5, z: c.z + 0.5, y: g.city.groundAt(c.x, c.z) + 1 };
  }
  // the foot of the airstair (on the jet's left, near the nose)
  stairs(spot) { const fx = Math.sin(RUNWAY), fz = -Math.cos(RUNWAY); return { x: spot.x + fx * 3 - fz * 2.6, z: spot.z + fz * 3 + fx * 2.6 }; }

  // ---------- the end ----------
  async finish() {
    const g = this.game, s = this.state();
    if (s.done) return;
    let paid = 0;
    if (account.user && account.available && econ.aero) { try { paid = (await econ.aero()).paid || 0; } catch { /* once per account */ } }
    s.act = 7; s.done = true; s.paid = paid;
    if (!g.creative && !s.cleared) g.addCrystals(300);
    g.inventory.remove('fake_passport', g.inventory.count('fake_passport'));
    if (this.jet) this.jet.takeoff = 0;
    g.save(true);
    g.ui.open('aeroFinale', { paid, again: !!s.cleared });
  }

  // ---------- every frame ----------
  update(dt) {
    const g = this.game;
    if (!g.missions || !g.missions.active || !this.open) { this.clearAll(); return; }
    const s = this.state(), pl = this.plan(), M = g.missions, p = g.player.pos;
    if (!this.guest && s.act === 6 && pl) {
      s.escape -= dt;
      if (s.escape <= 0) {
        s.escape = ESC_S;
        this.outside(pl);
        g.ui.toast(t('aero.blocked'), 'warn');
        if (g.net) g.net.send({ t: 'aero', a: 'out', why: 'escape', all: true });
        if (M.host) M.dirty = true;
      }
    }
    if (s.act !== 4) this.through = false;
    if (pl) {
      const near = Math.hypot(pl.P.door.x - p.x, pl.P.door.z - p.z) < 90;
      if (near) { this.watch(dt, pl, s); if (this.inside(pl)) this.belt(dt, pl); this.drawGuards(pl, s); this.drawBags(pl); } else this.clearHall();
    }
    // at the jet: up the airstair with the passport
    const spot = this.jetSpot();
    this.askT -= dt;
    if (spot && s.act === 6 && M.prog(aeroId('pista')).step === 1) {
      const st = this.stairs(spot);
      if (Math.hypot(st.x - p.x, st.z - p.z) < 5 && this.askT <= 0) {
        this.askT = 3;
        if (g.inventory.count('fake_passport')) M.event('aero_board');
        else g.ui.toast(t('aero.needPassport'), 'warn');
      }
    }
    this.t += dt;
    if (this.t >= 0.5) { this.t = 0; this.people(pl, s, spot); }
    this.drawJet(spot, s, dt);
    this.animate(dt);
  }

  // the guards with their torches, walking their lanes
  drawGuards(pl, s) {
    const g = this.game, show = s.act >= 3 && s.act <= 6;
    if (!show) { this.clearGuards(); return; }
    if (!this.guards.length) {
      for (let i = 0; i < pl.lanes.length; i++) {
        const rig = this.makeNpc('guard');
        const len = SIGHT * 0.8, beam = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(SIGHT_HALF) * len, len, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
        beam.rotation.x = -Math.PI / 2; beam.position.set(0, 1.4, len / 2);
        const tilt = new THREE.Group(); tilt.rotation.x = 0.12; tilt.add(beam); rig.group.add(tilt);
        const torch = box(0.1, 0.1, 0.3, '#2b2d33'); torch.position.set(0.3, 1.35, 0.3); rig.group.add(torch);
        g.scene.add(rig.group);
        this.guards.push({ rig, beam });
      }
    }
    const now = clockS(), on = this.watching(s);
    this.guards.forEach((gd, i) => {
      const q = this.guardAt(pl, i, now);
      gd.rig.group.position.set(q.x, pl.P.base + 1, q.z);
      gd.rig.group.rotation.y = q.yaw;
      gd.beam.visible = on;
      const ph = now * 6;
      gd.rig.legL.rotation.x = Math.sin(ph) * 0.5; gd.rig.legR.rotation.x = -Math.sin(ph) * 0.5;
    });
  }
  clearGuards() { for (const gd of this.guards) this.game.scene.remove(gd.rig.group); this.guards = []; }

  // suitcases riding the belt
  drawBags(pl) {
    const g = this.game, len = pl.c0 - pl.beltFrom, now = clockS();
    if (!this.bags.length) {
      const cols = ['#c81e1e', '#2563a8', '#3a3d45', '#e8b830', '#2d6a4f', '#7a1d2a'];
      for (let k = 0; k < 6; k++) { const b = box(0.7, 0.45, 0.5, cols[k]); g.scene.add(b); this.bags.push(b); }
    }
    this.bags.forEach((b, k) => {
      const d = pl.beltFrom + ((now * BELT_SPEED + (k * len) / 6) % len), q = this.at(pl, d - 0.5, pl.belt);
      b.position.set(q.x, pl.P.base + 1.23, q.z);
      b.rotation.y = Math.atan2(pl.dv.x, pl.dv.z);
    });
  }
  clearHall() { this.clearGuards(); for (const b of this.bags) this.game.scene.remove(b); this.bags = []; }

  // a small white jet with a red stripe and a red tail, its airstair down
  makeJet() {
    const grp = new THREE.Group(), body = new THREE.Group();
    const fus = box(1.7, 1.7, 11, '#f4f4f4'); fus.position.set(0, 1.9, 0); body.add(fus);
    const nose = box(1.3, 1.3, 1.4, '#f4f4f4'); nose.position.set(0, 1.85, 6.1); body.add(nose);
    const tip = box(0.8, 0.8, 0.6, '#e8e8e8'); tip.position.set(0, 1.8, 7); body.add(tip);
    const glass = box(1.32, 0.35, 0.5, '#1c2a3a'); glass.position.set(0, 2.25, 6.2); body.add(glass);
    const stripe = box(1.72, 0.18, 11, '#c81e1e'); stripe.position.set(0, 1.75, 0); body.add(stripe);
    for (let z = -3.5; z <= 3.5; z += 1) for (const s of [-1, 1]) { const w = box(0.04, 0.28, 0.4, '#1c2a3a'); w.position.set(s * 0.86, 2.2, z); body.add(w); }
    const wing = box(11, 0.22, 2.4, '#e8e8e8'); wing.position.set(0, 1.3, -0.4); body.add(wing);
    for (const s of [-1, 1]) { const eng = box(0.7, 0.7, 2, '#c9ccd2'); eng.position.set(s * 1.5, 2.3, -4); body.add(eng); const tipL = box(0.2, 0.6, 0.6, '#c81e1e'); tipL.position.set(s * 5.5, 1.5, -0.6); body.add(tipL); }
    const fin = box(0.24, 2.4, 1.8, '#c81e1e'); fin.position.set(0, 3.6, -4.8); body.add(fin);
    const stab = box(4, 0.18, 1.1, '#e8e8e8'); stab.position.set(0, 4.7, -5.2); body.add(stab);
    for (const [x, z] of [[0, 5], [-1.4, -1], [1.4, -1]]) { const leg = box(0.15, 0.9, 0.15, '#3a3d45'); leg.position.set(x, 0.55, z); body.add(leg); const wh = box(0.3, 0.4, 0.4, '#1b1b22'); wh.position.set(x, 0.2, z); body.add(wh); }
    // the airstair on the left, by the door
    const door = box(0.05, 1.2, 0.8, '#1b1d22'); door.position.set(-0.87, 2, 3); body.add(door);
    const stair = new THREE.Group();
    for (let k = 0; k < 5; k++) { const st = box(0.9, 0.12, 0.45, '#9aa0a8'); st.position.set(-1.3 - k * 0.32, 1.4 - k * 0.3, 3); stair.add(st); }
    body.add(stair);
    grp.add(body);
    grp.userData.stair = stair;
    return grp;
  }
  drawJet(spot, s, dt) {
    const g = this.game, p = g.player.pos, flying = !!(this.jet && this.jet.takeoff !== undefined);
    // it waits from the plan on; once gone it does not come back
    const show = spot && ((s.act >= 3 && s.act <= 6) || flying) && Math.hypot(spot.x - p.x, spot.z - p.z) < 260;
    if (!show) { if (this.jet) { g.scene.remove(this.jet.grp); this.jet = null; } return; }
    if (!this.jet) {
      const grp = this.makeJet();
      grp.position.set(spot.x, spot.y - 1, spot.z);
      grp.rotation.order = 'YXZ'; // turned to the runway, then the nose up
      grp.rotation.y = Math.atan2(Math.sin(RUNWAY), -Math.cos(RUNWAY));
      g.scene.add(grp);
      this.jet = { grp, takeoff: undefined };
    }
    const j = this.jet;
    if (j.takeoff === undefined) return;
    // the takeoff: down the runway, the airstair up, then the climb into the night
    j.takeoff += dt;
    const tt = j.takeoff, run = Math.min(tt, 9), dist = 1.6 * run * run + Math.max(0, tt - 9) * 28;
    const fx = Math.sin(RUNWAY), fz = -Math.cos(RUNWAY), climb = Math.max(0, tt - 7) ** 2 * 0.9;
    j.grp.userData.stair.visible = tt < 1;
    j.grp.position.set(spot.x + fx * dist, spot.y - 1 + climb, spot.z + fz * dist);
    j.grp.rotation.x = -Math.min(0.25, Math.max(0, tt - 7) * 0.08);
    if (tt > 24) { g.scene.remove(j.grp); this.jet = null; }
  }

  // who stands where: El Maestro at the farmhouse, the contacts, the pilot by the jet, the police at the terminal
  people(pl, s, spot) {
    const g = this.game, M = g.missions, p = g.player.pos;
    const want = new Map();
    const at = (id, look, x, z, opts = {}) => want.set(id, { look, x, z, ...opts });
    const near = (name, r = 120) => { const q = M.placeXZ(name); return q && Math.hypot(q.x - p.x, q.z - p.z) < r ? q : null; };
    const cell = (q, r = 20) => g.city.openCellNear(q.x, q.z, r) || q;
    let q;
    if (s.act <= 1 && (q = near('Finca El Maestro'))) { const c = cell(q); at('maestro', 'maestro', c.x + 0.5, c.z + 0.5, { bang: true }); }
    if (s.act === 2) for (const m of this.missions()) {
      if (m.act !== 2 || M.isDone(m.id) || !(q = near(m.steps[0].near))) continue;
      const c = cell(q, 30); at('c_' + m.key, m.key === 'piloto' ? 'pilot' : 'contact', c.x + 0.5, c.z + 0.5, { bang: true });
    }
    if (spot && s.act >= 3 && s.act <= 6 && Math.hypot(spot.x - p.x, spot.z - p.z) < 200) {
      const st = this.stairs(spot), fx = Math.sin(RUNWAY), fz = -Math.cos(RUNWAY);
      at('pilot', 'pilot', st.x - fz * 1.2, st.z + fx * 1.2, { bang: s.act === 6 });
    }
    if (s.act === 6 && pl) for (let i = 0; i < 4; i++) { const r = this.pt(pl, -8 - (i % 2) * 2, pl.mid - 3 + i * 2); at('pol' + i, 'police', r.x + 0.5, r.z + 0.5); }
    for (const [id, w] of want) {
      let n = this.npcs.get(id);
      if (!n || n.look !== w.look) {
        if (n) g.scene.remove(n.rig.group);
        n = { look: w.look, rig: this.makeNpc(w.look) };
        g.scene.add(n.rig.group);
        this.npcs.set(id, n);
      }
      const y = g.city.groundAt(Math.floor(w.x), Math.floor(w.z)) + 1;
      n.rig.group.position.set(w.x, y, w.z);
      if (n.rig.bang) n.rig.bang.visible = !!w.bang;
    }
    for (const [id, n] of this.npcs) if (!want.has(id)) { g.scene.remove(n.rig.group); this.npcs.delete(id); }
  }

  makeNpc(look) {
    const c = look === 'police' ? POLICE : look === 'guard' ? GUARD : look === 'maestro' ? MAESTRO : look === 'pilot' ? PILOT : CONTACT;
    const rig = humanoid(c, 'player', 1);
    if (look === 'police') { const cap = box(0.56, 0.12, 0.56, '#14244f'); cap.position.y = 0.3; rig.head.add(cap); }
    else if (look === 'guard') { const cap = box(0.56, 0.12, 0.56, '#1b1b22'); cap.position.y = 0.3; rig.head.add(cap); const vest = box(0.54, 0.4, 0.32, '#e8f040'); vest.position.y = 0.08; rig.body.add(vest); }
    else if (look === 'maestro') {
      const gl = box(0.42, 0.08, 0.04, '#111111'); gl.position.set(0, 0.03, 0.27); rig.head.add(gl);
      const beard = box(0.4, 0.14, 0.06, '#3a2a1a'); beard.position.set(0, -0.2, 0.26); rig.head.add(beard);
    } else if (look === 'pilot') {
      const cap = box(0.58, 0.14, 0.58, '#14244f'); cap.position.y = 0.3; rig.head.add(cap);
      const band = box(0.6, 0.05, 0.6, '#f6c667'); band.position.y = 0.25; rig.head.add(band);
    } else { const hat = box(0.6, 0.08, 0.6, '#1c1c22'); hat.position.y = 0.28; rig.head.add(hat); }
    if (look !== 'guard') {
      const bar = box(0.16, 0.45, 0.16, '#ffd65c'); bar.position.y = 2.55;
      const dot = box(0.16, 0.16, 0.16, '#ffd65c'); dot.position.y = 2.15;
      const bangG = new THREE.Group(); bangG.add(bar, dot); bangG.visible = false; rig.group.add(bangG); rig.bang = bangG;
    }
    return rig;
  }

  animate() {
    const k = performance.now() / 1000;
    for (const [id, n] of this.npcs) {
      if (n.look === 'police') n.rig.armR.rotation.x = -0.4 + Math.sin(k * 3 + id.length) * 0.05;
      if (n.rig.bang && n.rig.bang.visible) n.rig.bang.position.y = Math.sin(k * 3) * 0.08;
    }
  }

  clearAll() {
    for (const n of this.npcs.values()) this.game.scene.remove(n.rig.group);
    this.npcs.clear();
    this.clearHall();
    if (this.jet) { this.game.scene.remove(this.jet.grp); this.jet = null; }
  }
}
