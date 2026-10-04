// City buses: drawn where the bus network (src/world/bus.js) says they are,
// on Malaga's real clock. They are open-top double-deckers: at a stop the
// doors on the right open (Spain drives on the right), and a player walks
// in through an open door, or uses the bus (F, or the button that shows up
// next to one).
// Inside the driver and an inspector wait by the validator: a ticket (bought
// at the stop, or from the driver) is validated with a beep, and only then
// may the bus be ridden - on the lower deck or up on the open top deck, with
// the view over the city. Without a ticket the inspector puts the rider out
// when the doors close. STOP gets off at the next stop; from the top deck one
// can also just jump off.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { humanoid } from './models.js';
import { t } from '../i18n/index.js';
import { account, econ } from '../save/account.js';
import { TICKETS } from '../../server/goods.js';

const L = 11.5, W = 2.6; // length, width (blocks)
export const FLOOR = 0.6, UPPER = 2.85, RAIL = 3.8; // lower floor, top deck floor, top rail
const DOORS = [L / 2 - 1.5, -0.6]; // front and middle door (right side), along the bus
const DOOR_W = 1.3;
const INSPECTOR = [-0.25, L / 2 - 3.5];
const VALIDATOR = [W / 2 - 0.35, L / 2 - 2.3];
const SHOW = 160; // draw buses this close to the player

function signTexture(ref, to, colour) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 48);
  x.fillStyle = colour; x.fillRect(4, 4, 64, 40);
  x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ref, 36, 25);
  x.fillStyle = '#ffb300'; x.font = 'bold 18px sans-serif'; x.textAlign = 'left';
  x.fillText(String(to).toUpperCase().slice(0, 16), 76, 25);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the fixed body of a bus, merged into one mesh (one more for the glass) per line colour
const bodyCache = new Map();
function bodyGeometry(stripe) {
  if (bodyCache.has(stripe)) return bodyCache.get(stripe);
  const solid = [], glass = [];
  const col = new THREE.Color();
  const add = (list, w, h, d, x, y, z, colour) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    col.set(colour);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    list.push(g);
  };
  const box = (w, h, d, x, y, z, colour) => add(solid, w, h, d, x, y, z, colour);
  const RED = '#c8102e', WHITE = '#f2f2f2', GREY = '#5b6168', SEAT = '#1f4e9c', DARK = '#151515', GLASS_C = '#1d2b3a';
  // a side wall along the bus from z0 to z1, between heights y0 and y1
  const wall = (x, z0, z1, y0, y1, colour, list = solid) => { if (z1 - z0 > 0.01) add(list, 0.08, y1 - y0, z1 - z0, x, (y0 + y1) / 2, (z0 + z1) / 2, colour); };
  const xr = W / 2 - 0.04, xl = -xr, BAND = UPPER - 0.28;
  // floors: the lower deck, and the top deck (the lower deck's ceiling); the chassis under them
  box(W - 0.1, 0.1, L - 0.1, 0, FLOOR - 0.05, 0, GREY);
  box(W, 0.28, L, 0, UPPER - 0.14, 0, WHITE);
  box(W - 0.3, 0.3, L - 0.3, 0, 0.35, 0, DARK);
  // left side: red below the windows, glass, a red band under the top deck
  wall(xl, -L / 2, L / 2, 0.25, 1.45, RED);
  wall(xl, -L / 2, L / 2, 1.45, 2.4, GLASS_C, glass);
  wall(xl, -L / 2, L / 2, 2.4, BAND, RED);
  // right side, with the two door openings
  const gaps = DOORS.map((d) => [d - DOOR_W / 2, d + DOOR_W / 2]).sort((a, b) => a[0] - b[0]);
  let z = -L / 2;
  for (const [a, b] of gaps) { wall(xr, z, a, 0.25, 1.45, RED); wall(xr, z, a, 1.45, 2.4, GLASS_C, glass); z = b; }
  wall(xr, z, L / 2, 0.25, 1.45, RED); wall(xr, z, L / 2, 1.45, 2.4, GLASS_C, glass);
  wall(xr, -L / 2, L / 2, 2.4, BAND, RED); // the band runs over the doors too
  // stripes in the line's colour along both sides
  for (const s of [1, -1]) add(solid, 0.02, 0.16, L - 0.4, s * (W / 2 + 0.01), 1.3, 0, stripe);
  // front: bumper, windscreen, the sign band; back: a closed panel
  box(W, 1.0, 0.08, 0, 0.75, L / 2 - 0.04, RED);
  add(glass, W - 0.1, 1.15, 0.06, 0, 1.85, L / 2 - 0.03, GLASS_C);
  box(W, 0.45, 0.08, 0, 2.62, L / 2 - 0.04, DARK);
  box(W, UPPER - 0.25, 0.08, 0, (0.25 + UPPER) / 2, -L / 2 + 0.04, RED);
  // the open top deck: low red sides and ends, a white rail on top
  for (const s of [1, -1]) { wall(s * xr, -L / 2, L / 2, UPPER, RAIL - 0.05, RED); box(0.14, 0.08, L, s * (W / 2 - 0.04), RAIL, 0, WHITE); }
  for (const s of [1, -1]) { box(W, RAIL - 0.05 - UPPER, 0.08, 0, (UPPER + RAIL - 0.05) / 2, s * (L / 2 - 0.04), RED); box(W, 0.08, 0.14, 0, RAIL, s * (L / 2 - 0.04), WHITE); }
  // wheels
  for (const zz of [-L / 2 + 1.8, L / 2 - 2.3]) for (const xx of [-W / 2 + 0.1, W / 2 - 0.1]) box(0.32, 0.9, 0.9, xx, 0.45, zz, DARK);
  // lower deck: the driver's cab (front left), seats on the left, the stairs at the back
  box(0.06, 1.1, 1.3, -0.1, FLOOR + 0.55, L / 2 - 1.0, GREY);
  box(0.9, 0.5, 0.7, -0.65, FLOOR + 0.25, L / 2 - 1.3, DARK);
  box(0.5, 0.06, 0.5, -0.65, FLOOR + 1.05, L / 2 - 0.6, DARK);
  box(W - 0.2, 0.5, 0.4, 0, FLOOR + 0.6, L / 2 - 0.3, GREY);
  for (let k = 0; k < 5; k++) {
    const zz = -L / 2 + 3.2 + k * 1.15;
    box(0.95, 0.12, 0.7, -W / 2 + 0.6, FLOOR + 0.45, zz, SEAT);
    box(0.95, 0.6, 0.1, -W / 2 + 0.6, FLOOR + 0.8, zz - 0.35, SEAT);
  }
  for (let k = 0; k < 6; k++) box(1.0, 0.18, 0.4, -W / 2 + 0.6, FLOOR + 0.2 + k * 0.38, -L / 2 + 0.4 + k * 0.38, GREY);
  // the validator by the front door, and a yellow grab pole by each door
  box(0.08, 1.0, 0.08, VALIDATOR[0], FLOOR + 0.5, VALIDATOR[1], '#f2c200');
  box(0.3, 0.36, 0.22, VALIDATOR[0], FLOOR + 1.15, VALIDATOR[1], '#f2c200');
  for (const d of DOORS) box(0.06, UPPER - FLOOR, 0.06, W / 2 - 0.5, (FLOOR + UPPER) / 2, d - DOOR_W / 2 - 0.1, '#f2c200');
  // top deck: two rows of seats with the aisle between
  for (let k = 0; k < 7; k++) for (const s of [1, -1]) {
    const zz = -L / 2 + 2.0 + k * 1.2;
    box(0.9, 0.12, 0.7, s * 0.72, UPPER + 0.45, zz, SEAT);
    box(0.9, 0.6, 0.1, s * 0.72, UPPER + 0.8, zz - 0.35, SEAT);
  }
  const out = { solid: mergeGeometries(solid), glass: mergeGeometries(glass) };
  for (const g of [...solid, ...glass]) g.dispose();
  bodyCache.set(stripe, out);
  return out;
}

const SOLID = new THREE.MeshLambertMaterial({ vertexColors: true });
const GLASS = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false });
const DOOR = new THREE.MeshLambertMaterial({ color: '#9fb4c2', transparent: true, opacity: 0.6, depthWrite: false });
const DOOR_H = UPPER - 0.28 - 0.3;
const DOOR_GEO = new THREE.BoxGeometry(0.06, DOOR_H, DOOR_W / 2);

function busModel(line) {
  const g = new THREE.Group();
  const body = bodyGeometry(line.colour || '#ffb300');
  g.add(new THREE.Mesh(body.solid, SOLID));
  const glass = new THREE.Mesh(body.glass, GLASS); glass.renderOrder = 1; g.add(glass);
  // sliding doors: two leaves for each opening
  const doors = [];
  for (const d of DOORS) for (const s of [-1, 1]) {
    const m = new THREE.Mesh(DOOR_GEO, DOOR);
    m.position.set(W / 2 - 0.02, 0.3 + DOOR_H / 2, d + s * DOOR_W / 4);
    m.renderOrder = 1;
    g.add(m); doors.push({ m, z: d + s * DOOR_W / 4, s });
  }
  // the driver, and the inspector in a dark blue uniform, facing the front door
  const driver = humanoid({ skin: '#d6a77a', hair: '#2b1d14', shirt: '#e8eef5', pants: '#2c3440', eye: '#3b2a1a' }, 'player', 0.92);
  driver.group.position.set(-0.65, FLOOR + 0.05, L / 2 - 1.35);
  driver.legL.rotation.x = driver.legR.rotation.x = -1.4;
  driver.armL.rotation.x = driver.armR.rotation.x = -1.0;
  g.add(driver.group);
  const insp = humanoid({ skin: '#c99872', hair: '#1a2340', shirt: '#22305a', shirt2: '#22305a', pants: '#1a2340', accent: '#f2c200', eye: '#2a1a10' }, 'player', 0.95);
  insp.group.position.set(INSPECTOR[0], FLOOR, INSPECTOR[1]);
  insp.group.rotation.y = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), new THREE.MeshLambertMaterial({ color: '#1a2340' }));
  cap.position.y = 0.3; insp.head.add(cap);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.18), new THREE.MeshLambertMaterial({ color: '#111111' }));
  visor.position.set(0, 0.25, 0.32); insp.head.add(visor);
  g.add(insp.group);
  // the validator's light: dark, green on a good ticket, red without one
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: '#203020' }));
  light.position.set(VALIDATOR[0] - 0.16, FLOOR + 1.2, VALIDATOR[1]);
  light.rotation.y = Math.PI / 2;
  g.add(light);
  // route signs front and back
  const tex = signTexture(line.ref, line.to, line.colour || '#c8102e');
  for (const s of [1, -1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.4), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 2.62, s * (L / 2 + 0.02));
    if (s < 0) sign.rotation.y = Math.PI;
    sign.scale.x = -1; // (the bus is mirrored, its signs read the right way)
    g.add(sign);
  }
  // the model is built with its doors at +x; mirrored, +x is the right side
  // of the bus going forward (the kerb side in Spain), the driver on the left
  g.scale.x = -1;
  g.userData = { doors, light, insp };
  return g;
}

export class BusManager {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.meshes = new Map(); // key -> { obj, bus, prev, door, light }
    this.riding = null; // { key, lx, lz, deck, valid, stop, offer }
    this.lastStop = -1;
    this.hudT = 0;
  }

  clear() { for (const m of this.meshes.values()) this.game.scene.remove(m.obj); this.meshes.clear(); this.riding = null; this.drawHud(); }

  groundY(x, z) {
    const c = this.game.city;
    return c ? c.groundAt(Math.floor(x), Math.floor(z)) + 1 : 0;
  }

  // world position of a point (lx to the right, lz forward) on a bus
  toWorld(b, lx, lz) { const s = Math.sin(b.heading), c = Math.cos(b.heading); return [b.x - lx * c + lz * s, b.z + lx * s + lz * c]; }
  toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, s = Math.sin(b.heading), c = Math.cos(b.heading); return [-(dx * c - dz * s), dx * s + dz * c]; }

  // who pays: signed-in players outside creative; guests and creative ride free
  get pays() { const g = this.game; return !g.creative && !!(account.user && account.available); }
  get tickets() { return this.game.profile.tickets || 0; }

  update(dt, inp) {
    const g = this.game, p = g.player.pos;
    const buses = this.net.active();
    const seen = new Set();
    for (const b of buses) {
      const near = Math.hypot(b.x - p.x, b.z - p.z) < SHOW || (this.riding && this.riding.key === b.key);
      if (!near) continue;
      seen.add(b.key);
      let m = this.meshes.get(b.key);
      if (!m) { m = { obj: busModel(b.line), bus: null, prev: null, door: 0, light: 0 }; g.scene.add(m.obj); this.meshes.set(b.key, m); }
      const [fx, fz] = this.toWorld(b, 0, L / 2 - 1), [bx, bz] = this.toWorld(b, 0, -L / 2 + 1);
      const gf = this.groundY(fx, fz), gb = this.groundY(bx, bz);
      b.y = Math.max(gf, gb);
      m.prev = m.bus; m.bus = b;
      m.obj.position.set(b.x, b.y, b.z);
      m.obj.rotation.set(0, b.heading, 0);
      // the doors slide open while the bus stands at a stop
      const want = b.stop >= 0 ? 1 : 0;
      if (want !== m.doorWant) { if (m.doorWant !== undefined && this.riding && this.riding.key === b.key) g.audio.sfx('doors'); m.doorWant = want; }
      m.door += Math.max(-dt * 2, Math.min(dt * 2, want - m.door));
      for (const d of m.obj.userData.doors) d.m.position.set(W / 2 + 0.02 + m.door * 0.08, d.m.position.y, d.z + d.s * m.door * (DOOR_W / 2 - 0.05));
      if (m.light > 0) { m.light -= dt; if (m.light <= 0) m.obj.userData.light.material.color.set('#203020'); }
    }
    for (const [k, m] of this.meshes) if (!seen.has(k)) { g.scene.remove(m.obj); this.meshes.delete(k); }
    if (this.riding) this.ride(inp);
    else if (inp && inp.pressed.has('busboard')) this.tryBoard();
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.25; this.drawHud(); this.drawBoard(); }
  }

  // the bus the player stands by (not riding), or null
  nextTo() {
    const p = this.game.player.pos;
    let best = null, bd = 1e9;
    for (const m of this.meshes.values()) {
      const b = m.bus;
      const [lx, lz] = this.toLocal(b, p.x, p.z);
      if (Math.abs(lx) > W / 2 + 3 || Math.abs(lz) > L / 2 + 2.5 || Math.abs(p.y - b.y) > 3) continue;
      const d = Math.hypot(lx, lz);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // by a bus: how to get on, and where the tickets are
  drawBoard() {
    const hud = this.game.ui && this.game.ui.hud, el = hud && hud.busBoard;
    if (!el) return;
    const b = this.riding ? null : this.nextTo();
    el.classList.toggle('hidden', !b);
    if (!b) { el.dataset.k = ''; return; }
    const open = b.stop >= 0 || this.game.creative;
    const tk = this.pays ? t('bus.boardTickets', { n: this.tickets }) : t('bus.freeShort');
    const key = `${b.key}|${open}|${tk}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.querySelector('.bb-line').textContent = `${b.line.ref} - ${b.line.to || ''}`;
    el.querySelector('.bb-text').textContent = open ? t('bus.boardOpen') : t('bus.boardWait');
    el.querySelector('.bb-tickets').textContent = tk;
    el.querySelector('.bb-keys').textContent = open ? t('bus.boardKeys') : '';
    const btn = el.querySelector('[data-a="busboard"]');
    btn.classList.toggle('hidden', !open);
    btn.querySelector('span').textContent = t('bus.boardBtn');
  }

  // on a bus: the player moves with it
  ride(inp) {
    const g = this.game, pl = g.player, r = this.riding;
    const m = this.meshes.get(r.key);
    if (!m) { this.getOff(null); return; }
    const b = m.bus;
    const [x, z] = this.toWorld(b, r.lx, r.lz);
    pl.pos.set(x, b.y + (r.deck ? UPPER : FLOOR), z);
    pl.vel.set(0, 0, 0);
    pl.fallStart = null;
    if (m.prev) pl.yaw += b.heading - m.prev.heading;
    if (b.stop >= 0 && b.stop !== this.lastStop) {
      this.lastStop = b.stop;
      const s = this.net.stops[b.line.stops[b.stop].s];
      g.ui.toast(t('bus.atStop', { name: s.name || '?' }));
      g.missions.event('stop');
      // STOP was pressed: get off here
      if (r.stop) { this.getOff(b); return; }
    } else if (b.stop < 0 && this.lastStop >= 0 && b.next < b.line.stops.length) {
      const s = this.net.stops[b.line.stops[b.next].s];
      if (this.announced !== b.next) { this.announced = b.next; g.ui.toast(t('bus.nextStop', { name: s.name || '?' })); }
    }
    // the doors closed and the ticket was never validated: the inspector puts the rider out
    if (b.stop < 0 && !r.valid) {
      g.audio.sfx('buzz');
      g.ui.toast(t('bus.putOut'), 'warn');
      this.getOff(b, true);
      return;
    }
    if (inp && inp.pressed.has('busstop')) this.requestStop();
    if (!this.riding) return;
    if (inp && inp.pressed.has('busact')) this.action();
    if (inp && inp.jump && !this.jumpHeld) {
      if (r.deck) { this.jumpOff(b); return; }
      if (b.stop >= 0) { this.getOff(b); return; }
      g.ui.toast(t('bus.doorsShut'));
    }
    this.jumpHeld = !!(inp && inp.jump);
  }

  // the one action button while riding: validate (or buy from the driver), then go up or down the stairs
  action() {
    const g = this.game, r = this.riding;
    if (!r) return;
    const m = this.meshes.get(r.key);
    if (!m) return;
    if (!r.valid) { this.validate(m); return; }
    r.deck = r.deck ? 0 : 1;
    if (r.deck) { r.lx = (Math.random() < 0.5 ? -1 : 1) * 0.72; r.lz = -L / 2 + 2.2 + Math.floor(Math.random() * 6) * 1.2; g.ui.toast(t('bus.topDeck')); }
    else { r.lx = -W / 2 + 0.6; r.lz = -L / 2 + 3.4 + Math.floor(Math.random() * 4) * 1.15; g.ui.toast(t('bus.lowerDeck')); }
    g.player.pitch = r.deck ? -0.1 : 0;
    g.audio.sfx('step');
    this.drawHud();
  }

  flash(m, ok) { m.light = 1.2; m.obj.userData.light.material.color.set(ok ? '#38e05a' : '#ff3b30'); }

  validate(m) {
    const g = this.game, r = this.riding;
    if (!this.pays) { r.valid = true; this.flash(m, true); g.audio.sfx('beep'); g.ui.toast(t('bus.freeRide'), 'ok'); this.drawHud(); return; }
    if (this.tickets > 0) {
      g.profile.tickets = this.tickets - 1;
      r.valid = true; this.flash(m, true); g.audio.sfx('beep');
      g.ui.toast(t('bus.validated', { n: g.profile.tickets }), 'ok');
      g.save(true);
      this.drawHud();
      return;
    }
    if (!r.offer) { r.offer = true; this.flash(m, false); g.audio.sfx('buzz'); g.ui.toast(t('bus.noTicket', { n: TICKETS.single.price }), 'warn'); this.drawHud(); return; }
    // the second press buys a single ticket from the driver
    if (this.paying) return;
    this.paying = true;
    econ.pay('ticket', { kind: 'single' }).then(() => {
      this.paying = false;
      if (this.riding !== r) return;
      g.audio.sfx('trade');
      g.profile.tickets = this.tickets + TICKETS.single.rides;
      g.ui.toast(t('bus.bought', { n: TICKETS.single.price }), 'ok');
      const now = this.meshes.get(r.key);
      if (now) this.validate(now);
    }).catch((e) => {
      this.paying = false;
      g.ui.toast(e.code === 'no_money' || e.code === 'frozen' ? t('bus.noFare', { n: TICKETS.single.price }) : t('econ.err'), 'warn');
    });
  }

  // tickets bought at a stop (the ticket machine): signed in, they cost coins
  async buyTickets(kind) {
    const g = this.game, k = TICKETS[kind];
    if (!k) return false;
    if (this.pays) await econ.pay('ticket', { kind });
    g.profile.tickets = this.tickets + k.rides;
    g.save(true);
    this.drawHud();
    return true;
  }

  requestStop() {
    const g = this.game, r = this.riding;
    if (!r || r.stop) return;
    const m = this.meshes.get(r.key);
    if (m && m.bus.stop >= 0) { this.getOff(m.bus); return; }
    r.stop = true;
    g.audio.sfx('bell');
    g.ui.toast(t('bus.stopping'));
    this.drawHud();
  }

  // from the top deck over the side, down to the street
  jumpOff(b) {
    const g = this.game, pl = g.player, r = this.riding;
    const side = r.lx >= 0 ? 1 : -1;
    const [x, z] = this.toWorld(b, side * (W / 2 + 0.8), r.lz);
    this.riding = null;
    pl.pos.set(x, b.y + RAIL + 0.1, z);
    pl.vel.set(0, 3, 0);
    pl.fallStart = null;
    g.ui.toast(t('bus.jumped'));
    g.missions.event('getoff');
    this.drawHud();
  }

  getOff(b, putOut = false) {
    const g = this.game, pl = g.player;
    this.riding = null;
    if (b) {
      // step out of a door on the right, onto the pavement
      const [x, z] = this.toWorld(b, W / 2 + 1.2, putOut ? DOORS[0] : DOORS[1]);
      pl.pos.set(x, this.groundY(x, z) + 0.05, z);
      g.placeOnGround(Math.min(126, b.y + 8));
    }
    if (!putOut) g.ui.toast(t('bus.off'));
    g.missions.event('getoff');
    this.drawHud();
  }

  // use near a bus: step in when its doors are open (or the riding action while on it)
  tryBoard() {
    const g = this.game, p = g.player.pos;
    if (this.riding) { this.action(); return true; }
    for (const m of this.meshes.values()) {
      const b = m.bus;
      const [lx, lz] = this.toLocal(b, p.x, p.z);
      if (Math.abs(lx) > W / 2 + 2.5 || Math.abs(lz) > L / 2 + 1 || Math.abs(p.y - b.y) > 3) continue;
      if (b.stop < 0 && !g.creative) { g.ui.toast(t('bus.wait'), 'warn'); return true; }
      this.board(b);
      return true;
    }
    return false;
  }

  board(b) {
    const g = this.game, pl = g.player;
    // inside the front door, facing the inspector and the validator
    this.riding = { key: b.key, lx: W / 2 - 0.75, lz: DOORS[0] - 0.2, deck: 0, valid: false, stop: false, offer: false };
    this.lastStop = b.stop; this.announced = -1; this.jumpHeld = true;
    const [px, pz] = this.toWorld(b, this.riding.lx, this.riding.lz), [ix, iz] = this.toWorld(b, INSPECTOR[0], INSPECTOR[1]);
    pl.yaw = Math.atan2(-(ix - px), -(iz - pz));
    pl.pitch = -0.12;
    const last = this.net.stops[b.line.stops[b.line.stops.length - 1].s];
    g.ui.toast(t('bus.boarded', { ref: b.line.ref, to: b.line.to || (last && last.name) || '' }));
    g.audio.sfx('doors');
    g.missions.event('board');
    this.drawHud();
  }

  // the riding panel on the HUD: the line, the ticket, the action and STOP
  drawHud() {
    const hud = this.game.ui && this.game.ui.hud;
    const el = hud && hud.busRide;
    if (!el) return;
    const r = this.riding, m = r && this.meshes.get(r.key);
    el.classList.toggle('hidden', !m);
    if (!m) { el.dataset.k = ''; return; }
    const b = m.bus, nx = b.next < b.line.stops.length ? this.net.stops[b.line.stops[b.next].s] : null;
    const act = !r.valid ? (r.offer && this.pays && this.tickets <= 0 ? t('bus.buyDriver', { n: TICKETS.single.price }) : t('bus.validate')) : r.deck ? t('bus.goDown') : t('bus.goUp');
    const tk = !r.valid ? (this.pays ? t('bus.ticketsLeft', { n: this.tickets }) : t('bus.freeShort')) : t('bus.ticketOk');
    const key = `${b.line.ref}|${nx && nx.name}|${act}|${tk}|${r.stop}|${r.deck}`;
    if (el.dataset.k === key) return;
    el.dataset.k = key;
    el.querySelector('.br-line').textContent = `${b.line.ref} - ${b.line.to || ''}`;
    el.querySelector('.br-next').textContent = nx ? t('bus.nextStop', { name: nx.name || '?' }) : '';
    el.querySelector('.br-ticket').textContent = tk;
    el.querySelector('.br-ticket').classList.toggle('ok', !!r.valid);
    el.querySelector('[data-a="busact"] span').textContent = act;
    el.querySelector('[data-a="busstop"]').classList.toggle('on', !!r.stop);
    el.querySelector('.br-hint').textContent = r.deck ? t('bus.hintTop') : t('bus.hintLow');
  }

  // after the player's own movement: stand on a top deck and be carried, and not walk through buses
  afterPlayer() {
    if (this.riding) return;
    const pl = this.game.player, p = pl.pos;
    for (const m of this.meshes.values()) {
      const b = m.bus, prev = m.prev;
      const [lx, lz] = this.toLocal(b, p.x, p.z);
      if (Math.abs(lx) > W / 2 + 1.5 || Math.abs(lz) > L / 2 + 1.5) continue;
      const deck = b.y + UPPER;
      const over = Math.abs(lx) < W / 2 + 0.25 && Math.abs(lz) < L / 2 + 0.25;
      if (over && p.y >= deck - 0.8 && p.y <= deck + 1.2 && pl.vel.y <= 0.01) {
        // carried by the top deck: follow the bus's move since the last frame
        if (prev) {
          const [plx, plz] = this.toLocal(prev, p.x, p.z);
          const [nx, nz] = this.toWorld(b, plx, plz);
          p.x = nx; p.z = nz;
          pl.yaw += b.heading - prev.heading;
        }
        p.y = deck; pl.vel.y = 0; pl.onGround = true; pl.fallStart = null;
      } else if (over && p.y < deck - 0.8 && p.y + 1.7 > b.y) {
        // walking in through an open door on the right
        if (b.stop >= 0 && m.door > 0.6 && lx > 0 && DOORS.some((d) => Math.abs(lz - d) < DOOR_W / 2)) { this.board(b); return; }
        // pushed out of the side (or the ends)
        const outX = W / 2 + 0.35 - Math.abs(lx), outZ = L / 2 + 0.35 - Math.abs(lz);
        const [x, z] = outX < outZ ? this.toWorld(b, Math.sign(lx || 1) * (W / 2 + 0.35), lz) : this.toWorld(b, lx, Math.sign(lz || 1) * (L / 2 + 0.35));
        p.x = x; p.z = z;
      }
    }
  }

  // for the maps: the buses near a point
  near(x, z, r) { return [...this.meshes.values()].map((m) => m.bus).filter((b) => Math.hypot(b.x - x, b.z - z) < r); }
}
