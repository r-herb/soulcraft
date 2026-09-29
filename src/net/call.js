// Calls between friends: WebRTC straight between the players' browsers
// (every player in the call connects to every other), with the messages
// that set a call up (invite, accept, offer, answer, network candidates,
// leave) carried by the chat hub. On a computer a call has video and
// sound; on a phone or tablet only sound.
import { onHub } from './hub.js';
import { account, callSignal } from '../save/account.js';

const ICE = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const RING_MS = 40_000;

export class CallManager {
  constructor() {
    this.call = null; // { id, peers: Map(uid -> { pc, stream, name }), local, video, since }
    this.invite = null; // an incoming invite: { from, name, id, video }
    this.listeners = new Set();
    onHub((ev) => { if (ev.t === 'call') this.onSignal(ev.from, ev.name, ev.data); });
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.listeners.forEach((fn) => { try { fn(this); } catch (e) { console.warn(e); } }); }

  // a computer (fine pointer, no touch-only screen) sends video; phones sound only
  get wantsVideo() { try { return matchMedia('(any-pointer: fine)').matches && !matchMedia('(pointer: coarse)').matches; } catch { return false; } }

  async media(video) {
    try { return await navigator.mediaDevices.getUserMedia({ audio: true, video: video ? { width: 320, height: 240 } : false }); }
    catch (e) {
      // no camera: try sound only
      if (video) try { return await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { /* none */ }
      throw e;
    }
  }

  send(to, data) { return callSignal(to, data).catch(() => {}); }

  // call a friend (or add them to the call already going)
  async start(friend) {
    if (!this.call) {
      const local = await this.media(this.wantsVideo);
      this.call = { id: Math.random().toString(36).slice(2, 10), peers: new Map(), local, video: local.getVideoTracks().length > 0, since: 0, ringing: new Map() };
    }
    const c = this.call;
    c.ringing.set(friend.id, friend.name);
    this.send(friend.id, { type: 'invite', call: c.id, video: c.video });
    setTimeout(() => { if (this.call === c && c.ringing.has(friend.id)) { c.ringing.delete(friend.id); this.changed(); this.endIfAlone(); } }, RING_MS);
    this.changed();
  }

  async accept() {
    const inv = this.invite;
    if (!inv) return;
    this.invite = null;
    const local = await this.media(this.wantsVideo);
    this.call = { id: inv.id, peers: new Map(), local, video: local.getVideoTracks().length > 0, since: Date.now(), ringing: new Map() };
    this.send(inv.from, { type: 'accept', call: inv.id });
    this.changed();
  }

  decline() {
    const inv = this.invite;
    if (!inv) return;
    this.invite = null;
    this.send(inv.from, { type: 'decline', call: inv.id });
    this.changed();
  }

  hangup() {
    const c = this.call;
    if (!c) return;
    for (const [uid, p] of c.peers) { this.send(uid, { type: 'leave', call: c.id }); try { p.pc.close(); } catch { /* closed */ } }
    for (const uid of c.ringing.keys()) this.send(uid, { type: 'cancel', call: c.id });
    c.local.getTracks().forEach((tr) => tr.stop());
    this.call = null;
    this.changed();
  }

  endIfAlone() { const c = this.call; if (c && !c.peers.size && !c.ringing.size) this.hangup(); }

  toggle(kind) {
    const c = this.call;
    if (!c) return false;
    const tracks = kind === 'video' ? c.local.getVideoTracks() : c.local.getAudioTracks();
    const on = !(tracks[0] && tracks[0].enabled);
    tracks.forEach((tr) => { tr.enabled = on; });
    this.changed();
    return on;
  }

  peer(uid, name) {
    const c = this.call;
    let p = c.peers.get(uid);
    if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    p = { pc, stream: new MediaStream(), name: name || '?' };
    c.peers.set(uid, p);
    c.local.getTracks().forEach((tr) => pc.addTrack(tr, c.local));
    pc.ontrack = (e) => { e.streams[0].getTracks().forEach((tr) => { if (!p.stream.getTracks().includes(tr)) p.stream.addTrack(tr); }); this.changed(); };
    pc.onicecandidate = (e) => { if (e.candidate) this.send(uid, { type: 'ice', call: c.id, candidate: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) { c.peers.delete(uid); this.changed(); this.endIfAlone(); }
      else this.changed();
    };
    if (!c.since) c.since = Date.now();
    return p;
  }

  async offerTo(uid, name) {
    const c = this.call;
    const p = this.peer(uid, name);
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.send(uid, { type: 'offer', call: c.id, sdp: offer.sdp });
  }

  async onSignal(from, name, d) {
    if (!d || !d.type) return;
    const c = this.call;
    if (d.type === 'invite') {
      if (c || this.invite) { this.send(from, { type: 'busy', call: d.call }); return; }
      this.invite = { from, name, id: d.call, video: !!d.video };
      this.changed();
      setTimeout(() => { if (this.invite && this.invite.id === d.call) { this.invite = null; this.changed(); } }, RING_MS);
      return;
    }
    if (d.type === 'cancel') { if (this.invite && this.invite.id === d.call) { this.invite = null; this.changed(); } return; }
    if (!c || d.call !== c.id) return;
    if (d.type === 'accept') {
      c.ringing.delete(from);
      // the newcomer also calls everyone already in the call
      const others = [...c.peers.entries()].map(([uid, p]) => ({ id: uid, name: p.name }));
      await this.offerTo(from, name);
      if (others.length) this.send(from, { type: 'peers', call: c.id, peers: others });
    } else if (d.type === 'peers') {
      for (const o of d.peers || []) if (o.id !== (account.user && account.user.id) && !c.peers.has(o.id)) await this.offerTo(o.id, o.name);
    } else if (d.type === 'offer') {
      const p = this.peer(from, name);
      await p.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      this.send(from, { type: 'answer', call: c.id, sdp: answer.sdp });
    } else if (d.type === 'answer') {
      const p = c.peers.get(from);
      if (p) await p.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
    } else if (d.type === 'ice') {
      const p = c.peers.get(from);
      if (p && d.candidate) try { await p.pc.addIceCandidate(d.candidate); } catch { /* late */ }
    } else if (d.type === 'decline' || d.type === 'busy') {
      c.ringing.delete(from);
      this.changed();
      this.lastRefusal = { name, busy: d.type === 'busy' };
      this.listeners.forEach((fn) => fn(this, 'refused'));
      this.endIfAlone();
    } else if (d.type === 'leave') {
      const p = c.peers.get(from);
      if (p) { try { p.pc.close(); } catch { /* closed */ } c.peers.delete(from); }
      this.changed();
      this.endIfAlone();
    }
  }
}
