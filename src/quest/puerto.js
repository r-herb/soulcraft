// La Fábrica, season 3: El Maestro. At the end of season 2 Inspector Vega
// caught El Maestro on the beach; he is held in the old port warehouse until
// his transfer. Siroco calls the crew to the farmhouse: a plan on the
// blackboard and a quiz, then three contacts (a hacker who knows the fuse
// box, a locksmith with a stethoscope, a boatman), and the rescue - not a
// siege this time but a quiet way in: two cameras sweep the hall of crates
// (out of their cones, or behind a crate; the fuse box blinds them for a
// while), two laser beams cross the corridor on and off, the safe in the
// office opens to three clicks of its dial, and its key opens El Maestro's
// cell. Then the alarm: two and a half minutes to reach the boat at the
// Muelle de Heredia. Nobody is hurt: seen, the crew slips out and tries again.
//
// It opens when season 2 is done. The cameras and the lasers run on the
// clock, so every player in a room sees them the same; the host keeps the
// rest (profile.puerto), as in the other seasons.
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { seasonOpenFor } from './seasons.js';
import { humanoid, box } from '../entities/models.js';
import { account, econ } from '../save/account.js';
import { bankCoords, bankPoint, bankWidth, puertoLayout } from '../world/city.js';
import { B, BLOCKS } from '../world/blocks.js';

const ESC_S = 150, CAMS_OFF_S = 25, FUSE_CD = 60, CAM_RANGE = 15, CAM_HALF = 0.38, SWEEP = 0.95, SWEEP_S = 8;
// a laser is on for 2.6 s of every 4, the second one 2 s later
const LASER_ON = 2.6, LASER_CYCLE = 4;
export const PUERTO_ACTS = ['aviso', 'plan', 'prep', 'entry', 'stealth', 'safe', 'cell', 'escape', 'done'];

const MISSIONS = [
  { key: 'aviso', act: 0, steps: [{ ev: 'reach', near: 'Finca El Maestro', r: 22 }] },
  { key: 'plan3', act: 1, steps: [{ ev: 'puerto_quiz' }] },
  { key: 'hacker', act: 2, steps: [{ ev: 'reach', near: 'La Rosaleda', r: 35 }] },
  { key: 'cerrajero', act: 2, steps: [{ ev: 'reach', near: 'Huelin', r: 35 }], items: [['stethoscope', 1]] },
  { key: 'barquero', act: 2, steps: [{ ev: 'reach', near: 'Muelle Uno', r: 30 }] },
  { key: 'entrada3', act: 3, steps: [{ ev: 'reach', near: 'Almacén del Puerto', r: 60 }, { ev: 'puerto_enter' }] },
  { key: 'sigilo', act: 4, steps: [{ ev: 'puerto_through' }] },
  { key: 'caja', act: 5, steps: [{ ev: 'puerto_safe' }], items: [['cell_key', 1]] },
  { key: 'celda', act: 6, steps: [{ ev: 'puerto_cell' }] },
  { key: 'fuga', act: 7, steps: [{ ev: 'reach', near: 'Muelle de Heredia', r: 30 }] },
];
export const puertoId = (key) => 'f3_' + key;
const PREP = ['hacker', 'cerrajero', 'barquero'];

const RED = { skin: '#d9a57a', hair: '#2b1d12', shirt: '#c81e1e', shirt2: '#c81e1e', pants: '#b01818', eye: '#1b1b22', accent: '#111111' };
const POLICE = { skin: '#c68a5e', hair: '#1a1a1a', shirt: '#1f3a8a', shirt2: '#1f3a8a', pants: '#14244f', eye: '#1b1b22', accent: '#ffd65c' };
const MAESTRO = { skin: '#e0b08a', hair: '#3a2a1a', shirt: '#6b5a4a', shirt2: '#6b5a4a', pants: '#3a3a44', eye: '#1b1b22', accent: '#8a6238' };
const CONTACT = { skin: '#e0ac86', hair: '#4d3421', shirt: '#3a3a44', shirt2: '#2b2b33', pants: '#22222a', eye: '#1f2a6b', accent: '#9aa0a8' };
const fresh = () => ({ act: 0, combo: null, camsOff: 0, fuseCd: 0, escape: 0, alarms: 0, done: false, paid: 0 });
const clockS = () => Date.now() / 1000;

export class Puerto {
  constructor(game) { this.game = game; this.npcs = new Map(); this.cams = []; this.t = 0; this.alarmT = 0; this.lasersOn = []; this.through = false; }

  // ---------- state ----------
  get guest() { const n = this.game.net; return !!(n && !n.isHost); }
  get open() { return seasonOpenFor(this.game, 3); }
  state() {
    const g = this.game;
    if (this.guest) return (g.team && g.team.puerto) || fresh();
    const pr = g.profile;
    if (!pr.puerto) pr.puerto = fresh();
    return pr.puerto;
  }
  get act() { return this.state().act; }

  missions() {
    if (!this.open) return [];
    const s = this.state();
    return MISSIONS.filter((m) => m.act <= Math.min(s.act, 7)).map((m) => ({ id: puertoId(m.key), fab: true, season: 3, key: m.key, act: m.act, reward: { coins: 0, crystals: m.act >= 4 ? 30 : 10 }, steps: m.steps, items: m.items || null }));
  }

  onMission(m) {
    const g = this.game, s = this.state(), M = g.missions;
    if (m.key === 'aviso' && s.act === 0) { s.act = 1; setTimeout(() => g.running && g.ui.open('puertoLesson'), 600); }
    else if (m.key === 'plan3' && s.act === 1) s.act = 2;
    else if (s.act === 2 && PREP.every((k) => M.isDone(puertoId(k)))) { s.act = 3; g.ui.toast(t('puerto.ready'), 'soul'); }
    else if (m.key === 'entrada3' && s.act === 3) s.act = 4;
    else if (m.key === 'sigilo' && s.act === 4) { s.act = 5; this.say('office'); }
    else if (m.key === 'caja' && s.act === 5) s.act = 6;
    else if (m.key === 'celda' && s.act === 6) { s.act = 7; s.escape = ESC_S; this.say('run'); }
    else if (m.key === 'fuga' && s.act === 7) this.finish();
    if (s.act >= 2 && s.act <= 7) { const next = M.all().find((x) => x.season === 3 && !M.isDone(x.id)); if (next) M.track(next.id, false); }
    if (M.host) M.dirty = true;
  }

  say(key, vars) { this.game.ui.toast(t('puerto.say.' + key, vars), 'soul'); }
  passClass() { this.game.missions.event('puerto_quiz'); }

  // ---------- the warehouse ----------
  plan() {
    const c = this.game.city, P = c && c.puertoPlan && c.puertoPlan();
    if (!P) return null;
    const { mid, depth } = bankCoords(P, P.door.x, P.door.z), width = bankWidth(P);
    return { P, mid, depth, width, ...puertoLayout(depth, width) };
  }
  pt(pl, d, a) { return bankPoint(pl.P, d, a); }
  inside(pl, p = this.game.player.pos) { const P = pl.P; return p.x >= P.x0 && p.x <= P.x1 + 1 && p.z >= P.z0 && p.z <= P.z1 + 1 && p.y > P.base - 2 && p.y < P.base + 8; }
  where(pl, p = this.game.player.pos) { return bankCoords(pl.P, Math.floor(p.x), Math.floor(p.z)); }

  async enter() {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl || s.act !== 3) return false;
    if (this.guest) { this.send('enter'); return true; }
    s.combo = [0, 0, 0].map(() => Math.floor(Math.random() * 40));
    s.camsOff = 0; s.fuseCd = 0; s.alarms = 0;
    this.toLobby(pl);
    g.missions.event('puerto_enter');
    if (g.net) g.net.send({ t: 'puerto', a: 'in' });
    this.say('inside');
    return true;
  }
  async enterTest() {
    this.state().act = 3;
    this.game.missions.prog(puertoId('entrada3')).step = 1;
    for (let i = 0; i < 60 && !this.plan(); i++) await new Promise((r) => setTimeout(r, 100));
    await this.enter();
  }
  toLobby(pl) {
    const g = this.game, q = this.pt(pl, 2, pl.mid);
    g.player.pos.set(q.x + 0.5, pl.P.base + 1.05, q.z + 0.5); g.player.vel.set(0, 0, 0); g.player.fallStart = null;
    g.player.yaw = Math.atan2(-(this.pt(pl, 5, pl.mid).x - q.x), -(this.pt(pl, 5, pl.mid).z - q.z));
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
    if (id === B.factory_door) {
      if (s.act === 3 && !this.inside(pl)) { this.enter(); return true; }
      if (s.act >= 4 && s.act <= 6 && !this.inside(pl)) { this.toLobby(pl); return true; }
      g.ui.toast(t(s.act < 3 ? 'puerto.doorShut' : s.act === 7 ? 'puerto.toBoat' : 'puerto.doorLocked')); return true;
    }
    const busy = s.act >= 4 && s.act <= 6;
    if (id === B.fuse_box) {
      if (!busy) { g.ui.toast(t('puerto.notNow')); return true; }
      if (s.camsOff > 0) { g.ui.toast(t('puerto.camsAlreadyOff', { s: Math.ceil(s.camsOff) })); return true; }
      if (s.fuseCd > 0) { g.ui.toast(t('puerto.fuseWait', { s: Math.ceil(s.fuseCd) }), 'warn'); return true; }
      this.action('fuse'); return true;
    }
    if (id === B.safe) {
      if (s.act < 5) { g.ui.toast(t('puerto.safeLater')); return true; }
      if (s.act > 5) { g.ui.toast(t('puerto.safeOpen')); return true; }
      if (!g.inventory.count('stethoscope')) { g.ui.toast(t('puerto.needStethoscope'), 'warn'); return true; }
      g.ui.open('puertoSafe'); return true;
    }
    if (id === B.cell_door) {
      if (s.act !== 6) { g.ui.toast(t(s.act > 6 ? 'puerto.cellOpen' : 'puerto.cellLocked')); return true; }
      if (!g.inventory.count('cell_key')) { g.ui.toast(t('puerto.needKey'), 'warn'); return true; }
      g.inventory.remove('cell_key', 1);
      g.audio.sfx('levelup');
      this.say('freed');
      g.missions.event('puerto_cell');
      return true;
    }
    if (id === B.cell_bars || id === B.crate || id === B.laser) return true;
    return false;
  }

  // the safe's dial gave three clicks: the key to the cell
  safeOpened() { this.game.audio.sfx('levelup'); this.game.missions.event('puerto_safe'); }

  // ---------- actions (a guest's go to the host) ----------
  action(a, data = {}) {
    if (this.guest) { this.send(a, data); return; }
    this.apply(a, data);
  }
  send(a, data = {}) { const n = this.game.net; if (n) n.send({ t: 'puerto', a, ...data }); }
  onNet(msg) {
    if (this.guest) {
      const pl = this.plan();
      if (!pl) return;
      if (msg.a === 'in') { this.toLobby(pl); this.say('inside'); }
      else if (msg.a === 'out') { if (this.inside(pl) || msg.all) this.outside(pl); this.game.ui.toast(t(msg.why === 'escape' ? 'puerto.blocked' : 'puerto.spotted'), 'warn'); }
      return;
    }
    if (msg.a === 'enter') { this.enter(); return; }
    this.apply(msg.a, msg);
  }
  apply(a) {
    const g = this.game, s = this.state(), pl = this.plan();
    if (!pl) return;
    if (a === 'fuse' && s.act >= 4 && s.act <= 6 && s.fuseCd <= 0) { s.camsOff = CAMS_OFF_S; s.fuseCd = FUSE_CD; g.audio.sfx('warn'); g.ui.toast(t('puerto.camsOff', { s: CAMS_OFF_S }), 'soul'); }
    else if (a === 'alarm' && s.act >= 4 && s.act <= 6) {
      s.alarms++; s.camsOff = 0;
      g.audio.sfx('warn');
      if (this.inside(pl)) this.outside(pl);
      g.ui.toast(t('puerto.spotted'), 'warn');
      if (g.net) g.net.send({ t: 'puerto', a: 'out', why: 'alarm' });
    }
    if (g.missions.host) g.missions.dirty = true;
  }

  // ---------- the cameras and the lasers (on the clock, the same for everyone) ----------
  camYaw(pl, i, now = clockS()) {
    const c = pl.cams[i], q = this.pt(pl, c.d, c.a), h = this.pt(pl, pl.hallMid[0], pl.hallMid[1]);
    const base = Math.atan2(h.x - q.x, h.z - q.z);
    return base + SWEEP * Math.sin((now / SWEEP_S) * Math.PI * 2 + i * 1.7);
  }
  camPos(pl, i) { const c = pl.cams[i], q = this.pt(pl, c.d, c.a); return new THREE.Vector3(q.x + 0.5, pl.P.base + 5.3, q.z + 0.5); }
  laserOn(i, now = clockS()) { return ((now + i * 2) % LASER_CYCLE) < LASER_ON; }
  // the cameras look while they have power, during the way in
  watching(s) { return s.act >= 4 && s.act <= 6 && !(s.camsOff > 0); }

  // does camera i see the point (the player's head)?
  sees(pl, i, p) {
    const o = this.camPos(pl, i), dx = p.x - o.x, dz = p.z - o.z, dist = Math.hypot(dx, dz);
    if (dist > CAM_RANGE || dist < 0.5) return false;
    let da = Math.atan2(dx, dz) - this.camYaw(pl, i);
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > CAM_HALF) return false;
    // nothing solid in between (a crate hides)
    const w = this.game.world, n = Math.ceil(Math.hypot(dist, p.y - o.y) / 0.35);
    for (let k = 1; k < n; k++) {
      const f = k / n, id = w.getBlock(Math.floor(o.x + (p.x - o.x) * f), Math.floor(o.y + (p.y - o.y) * f), Math.floor(o.z + (p.z - o.z) * f));
      if (id > 0 && BLOCKS[id] && BLOCKS[id].opaque) return false;
    }
    return true;
  }

  // the laser blocks follow the clock (and the cell's door the story)
  syncBlocks(pl, s) {
    const w = this.game.world, active = s.act >= 3 && s.act <= 6, now = clockS();
    pl.lasers.forEach((d, i) => {
      const on = active && this.laserOn(i, now);
      if (this.lasersOn[i] === on) return;
      this.lasersOn[i] = on;
      for (let a = pl.corridor[0]; a <= pl.corridor[1]; a++) for (const r of [1, 2]) { const q = this.pt(pl, d, a); w.setBlockAnywhere(q.x, pl.P.base + r, q.z, on ? B.laser : B.air); }
    });
    const open = s.act >= 7;
    if (this.cellOpen !== open) {
      this.cellOpen = open;
      const [d, a] = pl.cell.door, q = this.pt(pl, d, a);
      for (const r of [1, 2]) w.setBlockAnywhere(q.x, pl.P.base + r, q.z, open ? B.air : B.cell_door);
    }
  }

  // the player seen by a camera or crossing a laser: the alarm
  watch(dt, pl, s) {
    const g = this.game, p = g.player.pos;
    if (this.alarmT > 0) { this.alarmT -= dt; return; }
    if (!this.inside(pl) || g.player.dead || s.act < 4 || s.act > 6) return;
    const { d, a } = this.where(pl), r = Math.floor(p.y) - pl.P.base;
    // the lasers
    const li = pl.lasers.indexOf(d);
    if (li >= 0 && this.laserOn(li) && a >= pl.corridor[0] && a <= pl.corridor[1] && r >= 0 && r <= 2) { this.alarm('laser'); return; }
    // the cameras watch the hall (not the lobby, where the fuse box is)
    if (this.watching(s) && d >= 4 && d < pl.c0) {
      const head = new THREE.Vector3(p.x, p.y + 1.5, p.z);
      for (let i = 0; i < pl.cams.length; i++) if (this.sees(pl, i, head)) { this.alarm('camera'); return; }
    }
    // past the cameras and the lasers
    if (s.act === 4 && d >= pl.c0 + 4 && !this.through) { this.through = true; g.missions.event('puerto_through'); }
  }
  alarm(why) {
    this.alarmT = 3;
    this.game.ui.toast(t('puerto.alarm.' + why), 'warn');
    this.action('alarm');
  }

  // ---------- the end ----------
  async finish() {
    const g = this.game, s = this.state();
    if (s.done) return;
    let paid = 0;
    if (account.user && account.available && econ.puerto) { try { paid = (await econ.puerto()).paid || 0; } catch { /* once per account */ } }
    s.act = 8; s.done = true; s.paid = paid;
    if (!g.creative && !s.cleared) g.addCrystals(250);
    g.save(true);
    g.ui.open('puertoFinale', { paid, again: !!s.cleared });
  }

  // ---------- every frame ----------
  update(dt) {
    const g = this.game;
    if (!g.missions || !g.missions.active || !this.open) { this.clearNpcs(); this.clearCams(); return; }
    const s = this.state(), pl = this.plan();
    if (!this.guest) {
      if (s.camsOff > 0) s.camsOff = Math.max(0, s.camsOff - dt);
      if (s.fuseCd > 0) s.fuseCd = Math.max(0, s.fuseCd - dt);
      if (s.act === 7 && pl) {
        s.escape -= dt;
        if (s.escape <= 0) {
          s.escape = ESC_S;
          this.outside(pl);
          g.ui.toast(t('puerto.blocked'), 'warn');
          if (g.net) g.net.send({ t: 'puerto', a: 'out', why: 'escape', all: true });
          if (g.missions.host) g.missions.dirty = true;
        }
      }
    }
    if (s.act !== 4) this.through = false;
    if (pl) {
      const near = Math.hypot(pl.P.door.x - g.player.pos.x, pl.P.door.z - g.player.pos.z) < 90;
      if (near) { this.syncBlocks(pl, s); this.watch(dt, pl, s); this.drawCams(pl, s); } else this.clearCams();
    }
    this.t += dt;
    if (this.t >= 0.5) { this.t = 0; this.people(pl, s); }
    this.animate(dt);
  }

  // the two cameras on the walls, with their cones of sight
  drawCams(pl, s) {
    const g = this.game;
    if (!this.cams.length) {
      for (let i = 0; i < pl.cams.length; i++) {
        const grp = new THREE.Group();
        const body = box(0.35, 0.3, 0.6, '#2b2d33'); grp.add(body);
        const lens = box(0.2, 0.2, 0.1, '#111114'); lens.position.z = 0.33; grp.add(lens);
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xff3030 })); led.position.set(0.1, 0.1, 0.32); grp.add(led);
        // the cone of sight, tilted to the floor
        const len = CAM_RANGE * 0.75, cone = new THREE.Mesh(new THREE.ConeGeometry(Math.tan(CAM_HALF) * len, len, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
        cone.rotation.x = -Math.PI / 2; cone.position.z = len / 2;
        const tilt = new THREE.Group(); tilt.rotation.x = 0.42; tilt.add(cone); grp.add(tilt);
        grp.position.copy(this.camPos(pl, i));
        g.scene.add(grp);
        this.cams.push({ grp, led, cone });
      }
    }
    const on = this.watching(s);
    this.cams.forEach((c, i) => {
      c.grp.rotation.y = this.camYaw(pl, i);
      c.cone.visible = on;
      c.led.material.color.set(on ? 0xff3030 : 0x303030);
    });
  }
  clearCams() { for (const c of this.cams) this.game.scene.remove(c.grp); this.cams = []; this.lasersOn = []; this.cellOpen = undefined; }

  // who stands where: Siroco at the farmhouse, the contacts, El Maestro in his cell (then following), the police, the boatman
  people(pl, s) {
    const g = this.game, M = g.missions, p = g.player.pos;
    const want = new Map();
    const at = (id, look, x, z, opts = {}) => want.set(id, { look, x, z, ...opts });
    const near = (name, r = 120) => { const q = M.placeXZ(name); return q && Math.hypot(q.x - p.x, q.z - p.z) < r ? q : null; };
    const cell = (q, r = 20) => g.city.openCellNear(q.x, q.z, r) || q;
    let q;
    if (s.act <= 1 && (q = near('Finca El Maestro'))) { const c = cell(q); at('siroco', 'crew', c.x + 0.5, c.z + 0.5, { bang: true }); }
    if (s.act === 2) for (const m of this.missions()) {
      if (m.act !== 2 || M.isDone(m.id) || !(q = near(m.steps[0].near))) continue;
      const c = cell(q, 30); at('c_' + m.key, 'contact', c.x + 0.5, c.z + 0.5, { bang: true });
    }
    if (pl && s.act >= 3 && s.act <= 6 && Math.hypot(pl.P.door.x - p.x, pl.P.door.z - p.z) < 100) {
      const [d, a] = pl.cell.maestro, m = this.pt(pl, d, a);
      at('maestro', 'maestro', m.x + 0.5, m.z + 0.5, { y: pl.P.base + 1, bang: s.act === 6 });
    }
    if (s.act === 7) {
      // El Maestro follows close behind
      const back = { x: p.x + Math.sin(g.player.yaw) * 1.6, z: p.z + Math.cos(g.player.yaw) * 1.6 };
      at('maestro', 'maestro', back.x, back.z, { y: p.y, follow: true });
      if (pl) for (let i = 0; i < 4; i++) { const r = this.pt(pl, -8 - (i % 2) * 2, pl.mid - 3 + i * 2); at('pol' + i, 'police', r.x + 0.5, r.z + 0.5); }
      if ((q = near('Muelle de Heredia', 150))) { const c = cell(q, 30); at('boat', 'contact', c.x + 0.5, c.z + 0.5, { bang: true }); }
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
      n.target = { x: w.x, y, z: w.z };
      if (!w.follow || !n.placed) { n.rig.group.position.set(w.x, y, w.z); n.placed = true; }
      n.follow = !!w.follow;
      if (n.rig.bang) n.rig.bang.visible = !!w.bang;
    }
    for (const [id, n] of this.npcs) if (!want.has(id)) { g.scene.remove(n.rig.group); this.npcs.delete(id); }
  }

  makeNpc(look) {
    const c = look === 'crew' ? RED : look === 'police' ? POLICE : look === 'maestro' ? MAESTRO : CONTACT;
    const rig = humanoid(c, 'player', 1);
    if (look === 'crew') {
      const m = box(0.52, 0.42, 0.06, '#f4efe6'); m.position.set(0, 0, 0.27); rig.head.add(m);
      const grin = box(0.3, 0.05, 0.02, '#c81e1e'); grin.position.set(0, -0.1, 0.31); rig.head.add(grin);
    } else if (look === 'police') {
      const cap = box(0.56, 0.12, 0.56, '#14244f'); cap.position.y = 0.3; rig.head.add(cap);
    } else if (look === 'maestro') {
      const gl = box(0.42, 0.08, 0.04, '#111111'); gl.position.set(0, 0.03, 0.27); rig.head.add(gl);
      const beard = box(0.4, 0.14, 0.06, '#3a2a1a'); beard.position.set(0, -0.2, 0.26); rig.head.add(beard);
    } else {
      const hat = box(0.6, 0.08, 0.6, '#1c1c22'); hat.position.y = 0.28; rig.head.add(hat);
    }
    const bar = box(0.16, 0.45, 0.16, '#ffd65c'); bar.position.y = 2.55;
    const dot = box(0.16, 0.16, 0.16, '#ffd65c'); dot.position.y = 2.15;
    const bangG = new THREE.Group(); bangG.add(bar, dot); bangG.visible = false; rig.group.add(bangG); rig.bang = bangG;
    return rig;
  }

  animate(dt) {
    const k = performance.now() / 1000;
    for (const [id, n] of this.npcs) {
      const grp = n.rig.group, tg = n.target;
      if (n.follow && tg) {
        grp.position.x += (tg.x - grp.position.x) * Math.min(1, dt * 5);
        grp.position.z += (tg.z - grp.position.z) * Math.min(1, dt * 5);
        grp.position.y = tg.y;
        const ph = k * 8;
        n.rig.legL.rotation.x = Math.sin(ph) * 0.6; n.rig.legR.rotation.x = -Math.sin(ph) * 0.6;
      } else if (n.look === 'police') n.rig.armR.rotation.x = -0.4 + Math.sin(k * 3 + id.length) * 0.05;
      if (n.rig.bang && n.rig.bang.visible) n.rig.bang.position.y = Math.sin(k * 3) * 0.08;
    }
  }

  clearNpcs() { for (const n of this.npcs.values()) this.game.scene.remove(n.rig.group); this.npcs.clear(); }
}
