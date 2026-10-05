// Multiplayer: up to 4 signed-in players in one world, over a WebSocket to
// a room (a Durable Object, see mp/room.js) that relays messages.
//
// The host is the player whose world it is. The host's game stays the
// authority: it saves the world (every player's block edits), runs the
// monsters and the time of day, and keeps each guest's inventory and
// position in its save, so a guest who comes back finds their things.
// Guests build the same world from the seed plus the host's edits, show
// the host's monsters as puppets and send their hits to the host.
//
// Messages (JSON, "t" is the type):
//   everyone: p (my position), b (block changed), save (guest -> host)
//   host only: welcome + edits (to a new guest), m (monsters), kill, hurt,
//              proj (a monster's arrow), time, kick
//   room: hello (to me), join, leave, closed, error
import * as THREE from 'three';
import { Figure, playerSkin } from '../entities/avatar.js';
import { nameTag, TAG_FAR } from '../entities/nametag.js';
import { t } from '../i18n/index.js';

export const MAX_PLAYERS = 4;
const SEND_EVERY = 0.1; // player state, 10 times a second
const MOBS_EVERY = 0.1;
const TIME_EVERY = 5;
const GUEST_SAVE_EVERY = 20;
const EDIT_BATCH = 200_000; // characters per "edits" message (a room message may be up to 1 MB)

function socketUrl(code) {
  const u = new URL('/api/mp/ws/' + code, location.href);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  return u.href;
}

// Open a room for the running world; resolves with its code.
export async function createRoom(worldName) {
  const res = await fetch('/api/mp/room', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ world: worldName }) });
  let data = {};
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !data.code) { const e = new Error(data.error || 'http_' + res.status); e.code = data.error || (res.status === 404 ? 'mp_unavailable' : 'network'); throw e; }
  return data.code;
}

export class Net {
  constructor(app, code, role) {
    this.app = app;
    this.code = code;
    this.role = role; // 'host' | 'guest'
    this.game = null;
    this.ws = null;
    this.me = null;
    this.hostId = null;
    this.players = new Map(); // id -> RemotePlayer
    this.names = new Map(); // id -> name (everyone in the room)
    this.handlers = [];
    this.queue = []; // messages that arrived before the game was ready
    this.sendT = 0; this.mobsT = 0; this.timeT = 0; this.saveT = 0;
    this.mobSeq = 0;
    this.puppets = new Map(); // guest: netId -> Mob puppet
    this.applying = false;
    this.closed = false;
    this.lastState = '';
  }

  get isHost() { return this.role === 'host'; }
  get count() { return this.names.size; }

  // Connect; resolves on the room's hello, rejects with a code on errors.
  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(socketUrl(this.code));
      this.ws = ws;
      const fail = (code) => { if (!settled) { settled = true; reject(Object.assign(new Error(code), { code })); } };
      const timer = setTimeout(() => { fail('timeout'); try { ws.close(); } catch { /* closed */ } }, 12000);
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'error') { this.errorCode = msg.code; fail(msg.code); return; }
        if (msg.t === 'hello' && !settled) {
          settled = true; clearTimeout(timer);
          this.me = String(msg.you); this.hostId = String(msg.host);
          this.names.set(this.me, 'me');
          for (const p of msg.players) this.names.set(String(p.id), p.name);
          resolve(msg);
          return;
        }
        this.receive(msg);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        fail(this.errorCode || 'network');
        if (settled) this.onDisconnect();
      };
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  // Wait for one message type (the guest waits for the host's world).
  waitFor(type, ms = 20000) {
    return new Promise((resolve, reject) => {
      const h = { type, resolve };
      this.handlers.push(h);
      setTimeout(() => { const i = this.handlers.indexOf(h); if (i >= 0) { this.handlers.splice(i, 1); reject(Object.assign(new Error('timeout'), { code: 'timeout' })); } }, ms);
    });
  }

  // ---------- incoming ----------
  receive(msg) {
    // a joining guest gathers the world's edits before it starts
    if (msg.t === 'edits' && this.collect) {
      for (const [k, v] of Object.entries(msg.edits || {})) Object.assign(this.collect[k] || (this.collect[k] = {}), v);
      return;
    }
    const h = this.handlers.find((x) => x.type === msg.t);
    if (h) { this.handlers.splice(this.handlers.indexOf(h), 1); h.resolve(msg); return; }
    if (!this.game || !this.game.running) { this.queue.push(msg); return; }
    this.handle(msg);
  }

  handle(msg) {
    const g = this.game;
    const from = msg.from !== undefined ? String(msg.from) : null;
    switch (msg.t) {
      case 'join':
        this.names.set(String(msg.id), msg.name);
        // (their moves may have come before their name)
        if (this.players.has(String(msg.id))) this.players.get(String(msg.id)).setName(msg.name);
        g.ui.toast(t('mp.joined', { name: msg.name }), 'ok');
        if (this.isHost) { this.welcome(String(msg.id)); g.missions.sendTeam(String(msg.id)); }
        g.ui.hud.refreshRoom && g.ui.hud.refreshRoom(this);
        if (g.ui.top && g.ui.top.name === 'room') g.ui.render();
        break;
      case 'leave': {
        const name = this.names.get(String(msg.id));
        this.names.delete(String(msg.id));
        this.dropPlayer(String(msg.id));
        if (name) g.ui.toast(t('mp.left', { name }));
        g.ui.hud.refreshRoom && g.ui.hud.refreshRoom(this);
        if (g.ui.top && g.ui.top.name === 'room') g.ui.render();
        break;
      }
      case 'closed':
        this.closed = true;
        break; // the socket closes next; onDisconnect handles it
      case 'p': this.playerState(from, msg); break;
      case 'b': this.applyBlock(msg); break;
      case 'edits': this.applyEdits(msg.edits); break;
      case 'time': if (!this.isHost) { g.meta.time = msg.time; g.meta.day = msg.day; } break;
      case 'm': if (!this.isHost) this.syncPuppets(msg.list); break;
      case 'hit': if (this.isHost) this.hostHit(from, msg); break;
      case 'kill': this.onKill(msg); break;
      case 'hurt': if (!this.isHost) { const dir = new THREE.Vector3(msg.dx || 0, 0, msg.dz || 0); g.damagePlayer(msg.dmg, 'mob', t(msg.name || 'mob.hollow'), dir.lengthSq() ? dir : null); } break;
      case 'proj': if (!this.isHost) this.spawnProj(msg); break;
      // missions played together (see src/quest/missions.js)
      case 'mev': case 'team': case 'mdone': case 'hplace': g.missions.onNet(msg, from); break;
      // a teammate's firecrackers: the guards run to the bank's door in every game
      // La Fábrica: a guest's action for the host, or the host's "everyone in / out"
      case 'fab': if (g.fabrica) g.fabrica.onNet(msg, from); break;
      case 'oro': if (g.oro) g.oro.onNet(msg, from); break;
      case 'puerto': if (g.puerto) g.puerto.onNet(msg, from); break;
      case 'aero': if (g.aero) g.aero.onNet(msg, from); break;
      case 'hdistract': if (g.heist) g.heist.distract(Math.min(30, Number(msg.s) || 0)); break;
      case 'save': if (this.isHost && from) { g.meta.guests = g.meta.guests || {}; g.meta.guests[from] = { player: msg.player, inventory: msg.inventory, name: this.names.get(from) }; } break;
      default: break;
    }
  }

  // ---------- life cycle ----------
  attach(game) {
    this.game = game;
    game.net = this;
    const q = this.queue; this.queue = [];
    for (const m of q) this.handle(m);
    game.ui.hud.refreshRoom && game.ui.hud.refreshRoom(this);
  }

  // Leave (a guest) or close the room (the host).
  leave() {
    if (this.game && !this.isHost) this.sendGuestSave();
    this.closed = true;
    this.left = true;
    try { this.ws && this.ws.close(1000, 'bye'); } catch { /* closed */ }
    this.detach();
  }

  detach() {
    for (const id of [...this.players.keys()]) this.dropPlayer(id);
    for (const m of this.puppets.values()) m.dead = true;
    this.puppets.clear();
    if (this.game && this.game.net === this) {
      this.game.net = null;
      this.game.ui.hud.refreshRoom && this.game.ui.hud.refreshRoom(null);
    }
  }

  onDisconnect() {
    if (this.left) return;
    const g = this.game;
    this.detach();
    if (!g) return;
    if (this.isHost) g.ui.toast(t('mp.roomClosed'), 'warn');
    else if (g.running) this.app.guestEnded(this.errorCode === 'kicked' ? 'mp.err.kicked' : this.closed ? 'mp.hostLeft' : 'mp.lost');
  }

  // ---------- per frame ----------
  update(dt) {
    const g = this.game;
    if (!g || !g.running) return;
    this.sendT += dt;
    if (this.sendT >= SEND_EVERY) { this.sendT = 0; this.sendState(); }
    if (this.isHost) {
      this.mobsT += dt;
      if (this.mobsT >= MOBS_EVERY && this.players.size) { this.mobsT = 0; this.sendMobs(); }
      this.timeT += dt;
      if (this.timeT >= TIME_EVERY) { this.timeT = 0; this.send({ t: 'time', time: g.meta.time, day: g.meta.day }); }
    } else {
      this.saveT += dt;
      if (this.saveT >= GUEST_SAVE_EVERY) { this.saveT = 0; this.sendGuestSave(); }
      for (const m of this.puppets.values()) m.netAge = (m.netAge || 0) + dt;
    }
    for (const rp of this.players.values()) rp.update(dt);
  }

  sendState() {
    const g = this.game, p = g.player;
    const h = g.inventory.held;
    const msg = { t: 'p', x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), skin: playerSkin(g.profile), em: g.emote ? g.emote.id : 0, held: h ? h.item : null, dead: p.dead ? 1 : 0, sw: g.held.swings || 0 };
    const key = JSON.stringify(msg);
    // standing still: resend only now and then
    if (key === this.lastState && (this.idleT = (this.idleT || 0) + 1) < 10) return;
    this.idleT = 0;
    this.lastState = key;
    this.send(msg);
  }

  sendGuestSave() {
    const g = this.game;
    if (!g || this.isHost || !g.player) return;
    const p = g.player;
    this.send({ t: 'save', to: this.hostId, player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.dead ? p.maxHealth : p.health, maxHealth: p.maxHealth, food: p.food }, inventory: g.inventory.toJSON() });
  }

  // ---------- players ----------
  playerState(id, s) {
    if (!id || id === this.me) return;
    let rp = this.players.get(id);
    if (!rp) { rp = new RemotePlayer(this.game, id, this.names.get(id) || t('mp.player')); this.players.set(id, rp); this.checkAdmins(); }
    rp.setState(s);
  }

  // which players in the room are admins (their godmode badge)
  checkAdmins() {
    clearTimeout(this.adminT);
    this.adminT = setTimeout(async () => {
      const ids = [...this.players.keys()].filter((x) => /^\d+$/.test(x));
      if (!ids.length) return;
      try {
        const r = await fetch('/api/badges?ids=' + ids.join(','), { credentials: 'same-origin' });
        if (!r.ok) return;
        const { admins } = await r.json();
        for (const [id, rp] of this.players) rp.setAdmin(admins.includes(Number(id)));
      } catch { /* later */ }
    }, 300);
  }

  dropPlayer(id) {
    const rp = this.players.get(id);
    if (rp) { rp.dispose(); this.players.delete(id); }
  }

  // The player a monster at `pos` goes for: the nearest one alive (host).
  mobTarget(pos) {
    const g = this.game;
    let best = g.player, bd = g.player.dead ? Infinity : g.player.pos.distanceToSquared(pos);
    for (const rp of this.players.values()) {
      if (rp.dead || !rp.seen) continue;
      const d = rp.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = rp; }
    }
    return best;
  }

  // distance to the nearest player (host: despawning far monsters)
  nearestDist(pos) {
    let d = this.game.player.pos.distanceTo(pos);
    for (const rp of this.players.values()) if (rp.seen) d = Math.min(d, rp.pos.distanceTo(pos));
    return d;
  }

  // a spawn centre: the host or one of the guests, in turn
  spawnCentre() {
    const all = [this.game.player, ...[...this.players.values()].filter((r) => r.seen && !r.dead)];
    this.spawnTurn = ((this.spawnTurn || 0) + 1) % all.length;
    return all[this.spawnTurn].pos;
  }

  // a monster hits a guest (host)
  hurt(rp, dmg, nameKey, dir) {
    this.send({ t: 'hurt', to: rp.id, dmg, name: nameKey, dx: dir ? +dir.x.toFixed(2) : 0, dz: dir ? +dir.z.toFixed(2) : 0 });
  }

  // ---------- world ----------
  blockChanged(x, y, z, id) {
    if (this.applying) return;
    this.send({ t: 'b', x, y, z, id });
  }

  applyBlock(m) {
    const g = this.game;
    this.applying = true;
    try {
      const prev = g.world.getBlock(m.x, m.y, m.z);
      if (prev !== m.id) {
        g.world.setBlock(m.x, m.y, m.z, m.id);
        if (m.id === 0 && prev > 0 && g.player.pos.distanceTo(new THREE.Vector3(m.x, m.y, m.z)) < 24) g.entities.burst(m.x + 0.5, m.y + 0.5, m.z + 0.5, g.blockTile(prev));
      }
    } finally { this.applying = false; }
  }

  applyEdits(edits) {
    const g = this.game;
    if (!g || !edits) return;
    // before the world is built the edits simply join the save data
    const dst = g.meta.edits[g.meta.dim] || (g.meta.edits[g.meta.dim] = {});
    for (const [k, v] of Object.entries(edits)) Object.assign(dst[k] || (dst[k] = {}), v);
  }

  // Host: send a new guest everything needed to build the same world.
  welcome(id) {
    const g = this.game, m = g.meta;
    const guest = (m.guests && m.guests[id]) || null;
    this.send({
      t: 'welcome', to: id,
      world: { name: m.name, seed: m.seed, difficulty: m.difficulty, creative: !!m.creative, time: m.time, day: m.day, city: m.city || null },
      you: guest,
    });
    let batch = {}, size = 0;
    for (const [k, v] of Object.entries(m.edits[m.dim] || {})) {
      batch[k] = v;
      size += k.length + JSON.stringify(v).length;
      if (size > EDIT_BATCH) { this.send({ t: 'edits', to: id, edits: batch }); batch = {}; size = 0; }
    }
    if (size) this.send({ t: 'edits', to: id, edits: batch });
    this.send({ t: 'ready', to: id });
    this.send({ t: 'time', to: id, time: m.time, day: m.day });
  }

  // ---------- monsters ----------
  sendMobs() {
    const g = this.game;
    const list = [];
    for (const e of g.entities.list) {
      if (!e.isMob || e.dead || e.isPet) continue;
      if (!e.netId) e.netId = ++this.mobSeq;
      list.push([e.netId, e.type, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2), +e.yaw.toFixed(2), Math.ceil(e.hp), e.hurtT > 0 ? 1 : 0]);
    }
    // no monsters and nothing changed: stay quiet (every message counts
    // towards the room's Cloudflare request quota), but repeat an empty list
    // now and then so a missed one cannot leave a puppet behind
    const key = JSON.stringify(list);
    if (key === this.lastMobs && (this.mobIdle = (this.mobIdle || 0) + 1) < 20) return;
    this.mobIdle = 0;
    this.lastMobs = key;
    this.send({ t: 'm', list });
  }

  syncPuppets(list) {
    const g = this.game;
    const seen = new Set();
    for (const [id, type, x, y, z, yaw, hp, hurt] of list) {
      seen.add(id);
      let m = this.puppets.get(id);
      if (!m || m.dead) {
        m = g.entities.spawnMob(type, x, y, z);
        m.netProxy = true; m.netId = id;
        this.puppets.set(id, m);
      }
      m.netTarget = { x, y, z, yaw };
      m.hp = hp;
      if (hurt) m.hurtT = Math.max(m.hurtT, 0.1);
      m.netAge = 0;
    }
    for (const [id, m] of this.puppets) if (!seen.has(id)) { m.dead = true; this.puppets.delete(id); }
  }

  // guest: my hit on a monster puppet
  hitMob(m, dmg, dir) {
    this.send({ t: 'hit', to: this.hostId, id: m.netId, dmg, dx: dir ? +dir.x.toFixed(2) : 0, dz: dir ? +dir.z.toFixed(2) : 0 });
  }

  // host: a guest hit a monster
  hostHit(from, msg) {
    const m = this.game.entities.list.find((e) => e.isMob && e.netId === msg.id && !e.dead);
    if (!m) return;
    m.killedBy = from;
    const dir = new THREE.Vector3(msg.dx || 0, 0, msg.dz || 0);
    m.damage(Math.max(0, Math.min(60, Number(msg.dmg) || 0)), dir.lengthSq() ? dir : null);
    if (!m.dead) m.killedBy = null;
  }

  // host: a monster died (by = the guest who landed the last hit, if any)
  mobDied(m, by) { if (m.netId) this.send({ t: 'kill', id: m.netId, by: by || null, x: +m.pos.x.toFixed(2), y: +m.pos.y.toFixed(2), z: +m.pos.z.toFixed(2) }); }

  onKill(msg) {
    if (this.isHost) return;
    const m = this.puppets.get(msg.id);
    if (m) { this.puppets.delete(msg.id); m.dead = true; m.poof(); this.game.audio.sfx('mobdie'); }
    if (msg.by && String(msg.by) === this.me && m) m.reward();
  }

  // a monster's arrow, flown on every screen: each player takes their own hits
  sendProj(kind, from, dir, speed, dmg, name) {
    this.send({ t: 'proj', kind, x: +from.x.toFixed(2), y: +from.y.toFixed(2), z: +from.z.toFixed(2), dx: +dir.x.toFixed(3), dy: +dir.y.toFixed(3), dz: +dir.z.toFixed(3), speed, dmg, name });
  }

  spawnProj(m) {
    const g = this.game;
    const from = new THREE.Vector3(m.x, m.y, m.z), dir = new THREE.Vector3(m.dx, m.dy, m.dz);
    g.entities.shoot(m.kind, from, dir, m.speed, m.dmg, 'mob', t(m.name || 'mob.gloomshot'), true);
  }
}

// Another player: a skinned figure with a name tag, moved smoothly between
// the states they send.
class RemotePlayer {
  constructor(game, id, name) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.remote = true;
    this.pos = new THREE.Vector3();
    this.to = new THREE.Vector3();
    this.yaw = 0; this.toYaw = 0; this.pitch = 0;
    this.dead = false;
    this.seen = false;
    this.phase = 0;
    this.swing = 0; this.sw = 0;
    this.object = new THREE.Group();
    this.object.visible = false;
    game.scene.add(this.object);
    this.tag = nameTag(name);
    this.tag.position.y = 2.3;
    this.object.add(this.tag);
  }

  // the name over the head (a new tag when it changes)
  setName(name) {
    if (!name || name === this.name) return;
    this.name = name;
    this.object.remove(this.tag);
    if (this.tag.material.map) this.tag.material.map.dispose();
    this.tag = nameTag(name, !!this.badge);
    this.object.add(this.tag);
    this.placeTags();
  }

  // an admin: the godmode badge and a golden name
  setAdmin(on) {
    if (!!this.badge === !!on) return;
    if (on) {
      this.badge = godBadge(); this.badge.position.y = 2.0; this.object.add(this.badge);
      this.object.remove(this.tag); this.tag = nameTag(this.name, true); this.tag.position.y = 2.65; this.object.add(this.tag);
    } else { this.object.remove(this.badge); this.badge = null; }
    this.placeTags();
  }

  build(skin) {
    if (!this.fig) { this.fig = new Figure(); this.object.add(this.fig.object); }
    this.fig.build(skin);
    this.rig = this.fig.rig;
    this.skin = skin;
    this.placeTags();
  }

  // the name (and the badge) float higher over a 3D avatar and its hat
  placeTags() {
    const up = this.rig && this.rig.avatar ? 0.35 : 0;
    if (this.badge) { this.badge.position.y = 2.0 + up; this.tag.position.y = 2.7 + up; } else this.tag.position.y = 2.3 + up;
  }

  setHeld(item) { this.fig.setHeld(item); }

  setState(s) {
    if (this.skin !== s.skin) this.build(s.skin);
    this.to.set(s.x, s.y, s.z);
    this.toYaw = s.yaw; this.pitch = s.pitch;
    if (!this.seen) { this.pos.copy(this.to); this.yaw = s.yaw; this.seen = true; this.object.visible = true; }
    this.dead = !!s.dead;
    this.setHeld(s.held);
    this.fig.setEmote(s.em || null);
    if (s.sw !== this.sw) { this.sw = s.sw; this.swing = 0.25; }
  }

  update(dt) {
    if (this.badge) { const b = this.badge.userData, k = performance.now() / 1000; b.halo.rotation.z = k * 0.8; b.glow.material.opacity = 0.18 + Math.sin(k * 3) * 0.08; b.shield.position.y = 0.3 + Math.sin(k * 2) * 0.04; }
    if (!this.seen || !this.rig) return;
    const k = Math.min(1, dt * 12);
    const before = this.pos.clone();
    if (this.pos.distanceToSquared(this.to) > 64) this.pos.copy(this.to);
    else this.pos.lerp(this.to, k);
    let dy = this.toYaw - this.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.yaw += dy * k;
    const speed = Math.hypot(this.pos.x - before.x, this.pos.z - before.z) / Math.max(dt, 1e-3);
    // the vertical speed, smoothed: a jump or a fall
    this.vy = (this.vy || 0) * 0.8 + ((this.pos.y - before.y) / Math.max(dt, 1e-3)) * 0.2;
    if (this.swing > 0) this.swing -= dt;
    this.fig.animate(dt, { speed, vy: this.vy, pitch: this.pitch, swing: Math.max(0, this.swing) });
    this.object.position.copy(this.pos);
    // the player's yaw looks along -z; the model faces +z
    this.object.rotation.set(0, this.yaw + Math.PI, 0);
    this.object.rotation.z = this.dead ? Math.PI / 2 : 0;
    this.object.visible = true;
    // the name: seen through walls, but not from across the map
    this.tag.visible = this.pos.distanceTo(this.game.player.pos) < TAG_FAR;
  }

  dispose() {
    this.game.scene.remove(this.object);
    this.object.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    if (this.tag.material.map) this.tag.material.map.dispose();
  }
}

// The godmode badge over an admin's head: a glowing golden halo that turns
// slowly, and a small gold shield with a white star floating above it.
function godBadge() {
  const g = new THREE.Group();
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd65c });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.05, 8, 24), gold);
  halo.rotation.x = Math.PI / 2;
  g.add(halo);
  const glow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.12, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.25, depthWrite: false }));
  glow.rotation.x = Math.PI / 2;
  g.add(glow);
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#ffd65c'; x.beginPath(); x.moveTo(4, 4); x.lineTo(28, 4); x.lineTo(28, 16); x.quadraticCurveTo(28, 26, 16, 30); x.quadraticCurveTo(4, 26, 4, 16); x.closePath(); x.fill();
  x.strokeStyle = '#a8761a'; x.lineWidth = 2; x.stroke();
  x.fillStyle = '#ffffff'; x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.2 : 7.5, a = -Math.PI / 2 + (i * Math.PI) / 5; x.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r); }
  x.closePath(); x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  const shield = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  shield.scale.set(0.34, 0.34, 1);
  shield.position.y = 0.3;
  g.add(shield);
  g.userData = { halo, glow, shield };
  return g;
}

