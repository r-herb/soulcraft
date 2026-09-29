// Soulcraft multiplayer rooms: a small Cloudflare Worker with one Durable
// Object per room code. The Pages API (functions/api) signs players in and
// forwards their WebSocket here with X-User-Id / X-User-Name headers, so this
// Worker is never reached directly from the internet by the game.
//
// The host (the owner of the shared world) is the authority for the world,
// the monsters and the time of day; the room only keeps the member list and
// relays messages: to one player when a message names "to", else to
// everyone else. Up to MAX_PLAYERS players, the host included.
import { DurableObject } from 'cloudflare:workers';

const MAX_PLAYERS = 4;
const ROOM_TTL = 12 * 3600e3; // a room left open for half a day is closed
// only the host may send these (world data, monsters, damage, time)
const HOST_ONLY = new Set(['welcome', 'edits', 'ready', 'm', 'kill', 'hurt', 'proj', 'time', 'kick']);

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.gone = new WeakSet(); // sockets whose close was handled
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/hub/')) return this.hub(req, url);
    if (url.pathname === '/create' && req.method === 'POST') {
      const { host, name } = await req.json();
      const old = await this.ctx.storage.get('room');
      if (old && old.host !== host && this.members().some((m) => m.host)) return Response.json({ error: 'code_taken' }, { status: 409 });
      await this.ctx.storage.put('room', { host: String(host), name: String(name || '').slice(0, 40), created: Date.now() });
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL);
      return Response.json({ ok: true });
    }
    if (url.pathname === '/info') {
      const room = await this.ctx.storage.get('room');
      return Response.json(room ? { open: this.members().some((m) => m.host), players: this.members().length } : { open: false, players: 0 });
    }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });

    const uid = String(req.headers.get('X-User-Id') || '');
    const name = String(req.headers.get('X-User-Name') || 'Player').slice(0, 40);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const fail = (code) => {
      server.accept();
      server.send(JSON.stringify({ t: 'error', code }));
      server.close(4000, code);
      return new Response(null, { status: 101, webSocket: client });
    };
    const room = await this.ctx.storage.get('room');
    if (!room || !uid) return fail('no_room');
    const host = uid === room.host;
    // one connection per player: a reconnect replaces the old one
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.uid === uid) { ws.serializeAttachment({ ...a, replaced: true }); try { ws.close(4001, 'replaced'); } catch { /* gone */ } }
    }
    const members = this.members();
    if (!host && !members.some((m) => m.host)) return fail('host_offline');
    if (!host && members.length >= MAX_PLAYERS) return fail('room_full');

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ uid, name, host });
    server.send(JSON.stringify({ t: 'hello', you: uid, host: room.host, world: room.name, players: members.map((m) => ({ id: m.uid, name: m.name, host: m.host })) }));
    this.broadcast({ t: 'join', id: uid, name, host }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // current members (open sockets that were not replaced)
  members() {
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (this.gone.has(ws)) continue;
      const a = ws.deserializeAttachment();
      if (a && !a.replaced) out.push(a);
    }
    return out;
  }

  send(ws, text) { try { ws.send(text); } catch { /* closed */ } }

  broadcast(msg, except = null) {
    const text = typeof msg === 'string' ? msg : JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || this.gone.has(ws)) continue;
      const a = ws.deserializeAttachment();
      if (a && !a.replaced) this.send(ws, text);
    }
  }

  async webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (a && a.hub) { if (data === 'ping') this.send(ws, 'pong'); return; }
    if (!a || a.replaced || typeof data !== 'string' || data.length > 1_000_000) return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    if (HOST_ONLY.has(msg.t) && !a.host) return;
    msg.from = a.uid;
    if (msg.t === 'kick' && msg.to) {
      for (const s of this.ctx.getWebSockets()) {
        const b = s.deserializeAttachment();
        if (b && b.uid === String(msg.to) && !b.host) { this.send(s, JSON.stringify({ t: 'error', code: 'kicked' })); try { s.close(4002, 'kicked'); } catch { /* gone */ } }
      }
      return;
    }
    const text = JSON.stringify(msg);
    if (msg.to !== undefined) {
      for (const s of this.ctx.getWebSockets()) {
        const b = s.deserializeAttachment();
        if (b && !b.replaced && b.uid === String(msg.to)) this.send(s, text);
      }
    } else this.broadcast(text, ws);
  }

  async webSocketClose(ws) { await this.left(ws); }
  async webSocketError(ws) { await this.left(ws); }

  async left(ws) {
    if (this.gone.has(ws)) return;
    const h = ws.deserializeAttachment();
    if (h && h.hub) { this.gone.add(ws); return; }
    this.gone.add(ws);
    const a = ws.deserializeAttachment();
    if (!a) return;
    try { ws.serializeAttachment({ ...a, replaced: true }); } catch { /* already closed */ }
    if (a.replaced) return; // a reconnect took its place
    if (a.host) {
      // the host left: the room closes for everyone
      this.broadcast({ t: 'closed' });
      for (const s of this.ctx.getWebSockets()) if (s !== ws) { try { s.close(4003, 'closed'); } catch { /* gone */ } }
      await this.ctx.storage.deleteAll();
    } else this.broadcast({ t: 'leave', id: a.uid });
  }

  // The chat hub: one instance (named "~hub") that every signed-in player
  // connects to; the Pages API pushes new chat messages and other events
  // to the players they are for, and asks who is connected.
  async hub(req, url) {
    if (url.pathname === '/hub/push' && req.method === 'POST') {
      const { to, event } = await req.json();
      const want = new Set((to || []).map(String));
      const text = JSON.stringify(event);
      let n = 0;
      for (const ws of this.ctx.getWebSockets('hub')) {
        if (this.gone.has(ws)) continue;
        const a = ws.deserializeAttachment();
        if (a && want.has(a.uid)) { this.send(ws, text); n++; }
      }
      return Response.json({ delivered: n });
    }
    if (url.pathname === '/hub/online' && req.method === 'POST') {
      const { ids } = await req.json();
      const on = new Set();
      for (const ws of this.ctx.getWebSockets('hub')) { const a = ws.deserializeAttachment(); if (a && !this.gone.has(ws)) on.add(a.uid); }
      return Response.json({ online: (ids || []).map(String).filter((i) => on.has(i)) });
    }
    if (url.pathname === '/hub/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      const uid = String(req.headers.get('X-User-Id') || '');
      if (!uid) return new Response('no user', { status: 400 });
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server, ['hub']);
      server.serializeAttachment({ hub: true, uid });
      server.send(JSON.stringify({ t: 'hello' }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('not found', { status: 404 });
  }

  async alarm() {
    this.broadcast({ t: 'closed' });
    for (const s of this.ctx.getWebSockets()) { try { s.close(4003, 'closed'); } catch { /* gone */ } }
    await this.ctx.storage.deleteAll();
  }
}

export default {
  fetch() { return new Response('Soulcraft rooms: reached through the game only.'); },
};
