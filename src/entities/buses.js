// City buses: drawn where the bus network (src/world/bus.js) says they are,
// on Malaga's real clock. A player can board a bus standing at a stop and
// ride inside (jump gets off), or climb the ladder at the back and ride on
// the roof, carried along as it drives.
import * as THREE from 'three';
import { box } from './models.js';
import { t } from '../i18n/index.js';
import { account, econ } from '../save/account.js';
import { BUS_FARE } from '../../server/goods.js';

const L = 11.5, W = 2.6, H = 3.1; // length, width, height (blocks)
const SHOW = 160; // draw buses this close to the player

function signTexture(ref, to, colour) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#111'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = colour; x.fillRect(4, 6, 64, 52);
  x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ref, 36, 33);
  x.fillStyle = '#ffb300'; x.font = 'bold 20px sans-serif'; x.textAlign = 'left';
  x.fillText(String(to).toUpperCase().slice(0, 16), 76, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function busModel(line) {
  const g = new THREE.Group();
  const red = '#c8102e';
  const lower = box(W, 1.2, L, red); lower.position.y = 0.95; g.add(lower);
  const glass = box(W + 0.02, 1.15, L - 0.6, '#1d2b3a'); glass.position.y = 2.1; g.add(glass);
  const pillars = [];
  for (let k = -4; k <= 4; k++) { const p = box(W + 0.06, 1.15, 0.18, '#f2f2f2'); p.position.set(0, 2.1, k * 1.3); pillars.push(p); g.add(p); }
  const roof = box(W, 0.35, L, '#f2f2f2'); roof.position.y = 2.85; g.add(roof);
  const stripe = box(W + 0.04, 0.18, L + 0.02, line.colour || '#ffb300'); stripe.position.y = 1.5; g.add(stripe);
  for (const zz of [-L / 2 + 1.8, L / 2 - 2.2]) for (const xx of [-W / 2 + 0.05, W / 2 - 0.05]) {
    const wheel = box(0.3, 0.9, 0.9, '#151515'); wheel.position.set(xx, 0.45, zz); g.add(wheel);
  }
  // route signs front and back
  const tex = signTexture(line.ref, line.to, line.colour || red);
  for (const s of [1, -1]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.5), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 2.55, s * (L / 2 + 0.02));
    if (s < 0) sign.rotation.y = Math.PI;
    g.add(sign);
  }
  // the ladder at the back
  for (let k = 0; k < 5; k++) { const r = box(0.8, 0.07, 0.07, '#9a9a9a'); r.position.set(0.6, 0.6 + k * 0.5, -L / 2 - 0.08); g.add(r); }
  return g;
}

export class BusManager {
  constructor(game, net) {
    this.game = game;
    this.net = net;
    this.meshes = new Map(); // key -> { obj, bus, prev }
    this.riding = null; // { key, lx, lz }
    this.lastStop = -1;
  }

  clear() { for (const m of this.meshes.values()) this.game.scene.remove(m.obj); this.meshes.clear(); this.riding = null; }

  groundY(x, z) {
    const c = this.game.city;
    return c ? c.groundAt(Math.floor(x), Math.floor(z)) + 1 : 0;
  }

  // world position of a point (lx right, lz forward) on a bus
  toWorld(b, lx, lz) { const s = Math.sin(b.heading), c = Math.cos(b.heading); return [b.x + lx * c + lz * s, b.z - lx * s + lz * c]; }
  toLocal(b, x, z) { const dx = x - b.x, dz = z - b.z, s = Math.sin(b.heading), c = Math.cos(b.heading); return [dx * c - dz * s, dx * s + dz * c]; }

  update(dt, inp) {
    const g = this.game, p = g.player.pos;
    const buses = this.net.active();
    const seen = new Set();
    for (const b of buses) {
      const near = Math.hypot(b.x - p.x, b.z - p.z) < SHOW || (this.riding && this.riding.key === b.key);
      if (!near) continue;
      seen.add(b.key);
      let m = this.meshes.get(b.key);
      if (!m) { m = { obj: busModel(b.line), bus: null, prev: null }; g.scene.add(m.obj); this.meshes.set(b.key, m); }
      const [fx, fz] = this.toWorld(b, 0, L / 2 - 1), [bx, bz] = this.toWorld(b, 0, -L / 2 + 1);
      const gf = this.groundY(fx, fz), gb = this.groundY(bx, bz);
      b.y = Math.max(gf, gb);
      m.prev = m.bus; m.bus = b;
      m.obj.position.set(b.x, b.y, b.z);
      m.obj.rotation.set(0, b.heading, 0);
    }
    for (const [k, m] of this.meshes) if (!seen.has(k)) { g.scene.remove(m.obj); this.meshes.delete(k); }
    if (this.riding) this.ride(inp);
  }

  // inside a bus: the player moves with it; jump gets off
  ride(inp) {
    const g = this.game, pl = g.player;
    const m = this.meshes.get(this.riding.key);
    if (!m) { this.getOff(null); return; }
    const b = m.bus;
    const [x, z] = this.toWorld(b, this.riding.lx, this.riding.lz);
    pl.pos.set(x, b.y + 0.5, z);
    pl.vel.set(0, 0, 0);
    pl.fallStart = null;
    if (b.stop >= 0 && b.stop !== this.lastStop) {
      this.lastStop = b.stop;
      const s = this.net.stops[b.line.stops[b.stop].s];
      g.ui.toast(t('bus.atStop', { name: s.name || '?' }));
      g.missions.event('stop');
    } else if (b.stop < 0 && this.lastStop >= 0 && b.next < b.line.stops.length) {
      const s = this.net.stops[b.line.stops[b.next].s];
      if (this.announced !== b.next) { this.announced = b.next; g.ui.toast(t('bus.nextStop', { name: s.name || '?' })); }
    }
    if (inp && inp.jump) this.getOff(b);
  }

  getOff(b) {
    const g = this.game, pl = g.player;
    this.riding = null;
    if (b) {
      // step out of the door on the right, onto the pavement
      const [x, z] = this.toWorld(b, W / 2 + 1.2, 2);
      pl.pos.set(x, this.groundY(x, z) + 0.05, z);
      g.placeOnGround(Math.min(126, b.y + 8));
    }
    g.ui.toast(t('bus.off'));
    g.missions.event('getoff');
  }

  // use near a bus: board it when it stands at a stop
  tryBoard() {
    const g = this.game, p = g.player.pos;
    for (const m of this.meshes.values()) {
      const b = m.bus;
      const [lx, lz] = this.toLocal(b, p.x, p.z);
      if (Math.abs(lx) > W / 2 + 2.5 || Math.abs(lz) > L / 2 + 1 || Math.abs(p.y - b.y) > 3) continue;
      if (b.stop < 0 && !g.creative) { g.ui.toast(t('bus.wait'), 'warn'); return true; }
      // signed-in players pay the fare in coins (the roof stays free)
      if (!g.creative && account.user && account.available) {
        if (this.paying) return true;
        this.paying = true;
        econ.pay('bus').then(() => {
          this.paying = false;
          const now = this.meshes.get(b.key);
          if (!now || this.riding) return;
          g.ui.toast(t('bus.paid', { n: BUS_FARE }), 'ok');
          this.board(now.bus);
        }).catch((e) => {
          this.paying = false;
          g.ui.toast(e.code === 'no_money' || e.code === 'frozen' ? t('bus.noFare', { n: BUS_FARE }) : t('econ.err'), 'warn');
        });
        return true;
      }
      this.board(b);
      return true;
    }
    return false;
  }

  board(b) {
    const g = this.game;
    this.riding = { key: b.key, lx: 0.6, lz: -1.5 + Math.random() * 3 };
    this.lastStop = b.stop; this.announced = -1;
    const last = this.net.stops[b.line.stops[b.line.stops.length - 1].s];
    g.ui.toast(t('bus.boarded', { ref: b.line.ref, to: b.line.to || (last && last.name) || '' }));
    g.audio.sfx('click');
    g.missions.event('board');
  }

  // after the player's own movement: stand on roofs, be carried, and not walk through buses
  afterPlayer(inp) {
    if (this.riding) return;
    const pl = this.game.player, p = pl.pos;
    for (const m of this.meshes.values()) {
      const b = m.bus, prev = m.prev;
      const [lx, lz] = this.toLocal(b, p.x, p.z);
      if (Math.abs(lx) > W / 2 + 1.5 || Math.abs(lz) > L / 2 + 1.5) continue;
      const roof = b.y + H;
      const over = Math.abs(lx) < W / 2 + 0.25 && Math.abs(lz) < L / 2 + 0.25;
      // climb the ladder at the back
      if (inp && inp.jump && Math.abs(lx) < 1.4 && lz < -L / 2 + 0.2 && lz > -L / 2 - 1.2 && p.y < roof) {
        const [x, z] = this.toWorld(b, 0, -L / 2 + 1);
        p.set(x, roof + 0.02, z); pl.vel.set(0, 0, 0);
        continue;
      }
      if (over && p.y >= roof - 0.8 && p.y <= roof + 0.6 && pl.vel.y <= 0.01) {
        // carried by the roof: follow the bus's move since the last frame
        if (prev) {
          const [plx, plz] = this.toLocal(prev, p.x, p.z);
          const [nx, nz] = this.toWorld(b, plx, plz);
          p.x = nx; p.z = nz;
          pl.yaw += b.heading - prev.heading;
        }
        p.y = roof; pl.vel.y = 0; pl.onGround = true; pl.fallStart = null;
      } else if (over && p.y < roof - 0.8 && p.y + 1.7 > b.y) {
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
