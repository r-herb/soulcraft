// The call window: an incoming call (accept or decline), and during a call
// the video tiles (computer) or name chips (phone), with mute, camera,
// invite and hang up. It floats above the game and the menus.
import { t } from '../i18n/index.js';
import { friends as friendsApi } from '../save/account.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class CallUI {
  constructor(calls, ui) {
    this.calls = calls; this.ui = ui;
    this.root = document.createElement('div');
    this.root.className = 'call-root';
    document.body.appendChild(this.root);
    this.videos = new Map(); // uid -> <video>/<audio>
    calls.onChange((c, what) => {
      if (what === 'refused' && c.lastRefusal) ui.toast(t(c.lastRefusal.busy ? 'call.busy' : 'call.declined', { name: c.lastRefusal.name }), 'warn');
      this.render();
    });
    this.render();
  }

  media(uid, stream, muted) {
    let v = this.videos.get(uid);
    if (!v) {
      v = document.createElement('video');
      v.autoplay = true; v.playsInline = true; v.muted = !!muted;
      this.videos.set(uid, v);
    }
    if (v.srcObject !== stream) v.srcObject = stream;
    return v;
  }

  render() {
    const c = this.calls.call, inv = this.calls.invite;
    this.root.innerHTML = '';
    if (inv) {
      const ring = document.createElement('div');
      ring.className = 'call-ring';
      ring.innerHTML = `<b>${esc(t('call.incoming', { name: inv.name }))}</b><span class="faint">${esc(t(inv.video ? 'call.withVideo' : 'call.voice'))}</span>
        <div class="row"><button class="btn primary" data-a="yes">${esc(t('call.accept'))}</button><button class="btn ember" data-a="no">${esc(t('call.decline'))}</button></div>`;
      ring.querySelector('[data-a="yes"]').onclick = () => this.calls.accept().catch(() => this.ui.toast(t('call.noMic'), 'warn'));
      ring.querySelector('[data-a="no"]').onclick = () => this.calls.decline();
      this.root.appendChild(ring);
      try { this.ui.audio.sfx('levelup'); } catch { /* no sound */ }
    }
    if (!c) { this.videos.forEach((v) => { v.srcObject = null; }); this.videos.clear(); return; }
    const box = document.createElement('div');
    box.className = 'call-box' + (c.video ? ' video' : '');
    const tiles = document.createElement('div');
    tiles.className = 'call-tiles';
    // me
    const mine = document.createElement('div');
    mine.className = 'call-tile me';
    if (c.video) { const v = this.media('me', c.local, true); mine.appendChild(v); }
    mine.insertAdjacentHTML('beforeend', `<span class="call-name">${esc(t('call.you'))}</span>`);
    tiles.appendChild(mine);
    for (const [uid, p] of c.peers) {
      const tile = document.createElement('div');
      tile.className = 'call-tile';
      const hasVideo = p.stream.getVideoTracks().length > 0;
      const m = this.media(uid, p.stream, false);
      if (!hasVideo) m.classList.add('audio-only');
      tile.appendChild(m);
      tile.insertAdjacentHTML('beforeend', `<span class="call-name">${esc(p.name)}${['connecting', 'new'].includes(p.pc.connectionState) ? ' ...' : ''}</span>`);
      tiles.appendChild(tile);
    }
    for (const [, name] of c.ringing) tiles.insertAdjacentHTML('beforeend', `<div class="call-tile ringing"><span class="call-name">${esc(t('call.ringing', { name }))}</span></div>`);
    box.appendChild(tiles);
    const mic = c.local.getAudioTracks()[0], cam = c.local.getVideoTracks()[0];
    const bar = document.createElement('div');
    bar.className = 'call-bar';
    bar.innerHTML = `<button class="btn small" data-a="mic">${esc(t(mic && mic.enabled ? 'call.mute' : 'call.unmute'))}</button>
      ${cam ? `<button class="btn small" data-a="cam">${esc(t(cam.enabled ? 'call.camOff' : 'call.camOn'))}</button>` : ''}
      <button class="btn small" data-a="add">${esc(t('call.add'))}</button>
      <button class="btn small ember" data-a="end">${esc(t('call.end'))}</button>`;
    bar.querySelector('[data-a="mic"]').onclick = () => this.calls.toggle('audio');
    const camBtn = bar.querySelector('[data-a="cam"]');
    if (camBtn) camBtn.onclick = () => this.calls.toggle('video');
    bar.querySelector('[data-a="end"]').onclick = () => this.calls.hangup();
    bar.querySelector('[data-a="add"]').onclick = () => this.pickFriend(box);
    box.appendChild(bar);
    this.root.appendChild(box);
  }

  // invite one more online friend into the call
  async pickFriend(box) {
    const old = box.querySelector('.call-pick');
    if (old) { old.remove(); return; }
    const pick = document.createElement('div');
    pick.className = 'call-pick';
    box.appendChild(pick);
    let r;
    try { r = await friendsApi.list(); } catch { return; }
    const c = this.calls.call;
    const list = r.friends.filter((f) => f.online && c && !c.peers.has(f.id) && !c.ringing.has(f.id));
    pick.innerHTML = list.length ? list.map((f) => `<button class="btn small" data-id="${f.id}">${esc(f.name)}</button>`).join('') : `<span class="faint">${esc(t('call.noneOnline'))}</span>`;
    pick.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => { const f = list.find((x) => x.id === Number(b.dataset.id)); this.calls.start(f); pick.remove(); }; });
  }
}
