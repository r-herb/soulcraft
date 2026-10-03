// Invites to play: a friend opened their world and invites me. A card with
// Join floats over the game and the menus (with a sound, and a system
// notification when the game is out of sight); Join leaves what I am
// playing (saved) and goes into the friend's world.
import { t } from '../i18n/index.js';
import { pushApi } from '../save/account.js';
import { localNotify } from '../net/notify.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class Invites {
  constructor(app, ui) {
    this.app = app; this.ui = ui;
    this.root = document.createElement('div');
    this.root.className = 'invite-root';
    document.body.appendChild(this.root);
    this.seen = new Set();
  }

  show(ev) {
    if (!ev || !ev.room || this.seen.has(ev.room)) return;
    const g = this.app.game;
    if (g && g.net && g.net.code === ev.room) return; // already there
    this.seen.add(ev.room);
    const card = document.createElement('div');
    card.className = 'invite-card';
    card.dataset.room = ev.room;
    card.innerHTML = `<b>${esc(t('inv2.title', { name: ev.name }))}</b><span class="faint">${esc(t(ev.city ? 'inv2.city' : 'inv2.world', { world: ev.world || '?' }))}</span>
      <div class="row"><button class="btn primary" data-a="join">${esc(t('inv2.join'))}</button><button class="btn ghost" data-a="later">${esc(t('inv2.later'))}</button></div>`;
    const close = () => { card.remove(); pushApi.clear('game').catch(() => {}); };
    card.querySelector('[data-a="later"]').onclick = () => { this.ui.click(); close(); };
    card.querySelector('[data-a="join"]').onclick = async () => {
      this.ui.click();
      close();
      if (this.app.game && this.app.game.running) await this.app.quitToTitle();
      this.app.joinRoom(ev.room);
    };
    this.root.appendChild(card);
    try { this.ui.audio.sfx('trade'); navigator.vibrate && navigator.vibrate(200); } catch { /* no sound */ }
    localNotify(t('inv2.title', { name: ev.name }), t(ev.city ? 'inv2.city' : 'inv2.world', { world: ev.world || '?' }), 'game');
    setTimeout(() => card.remove(), 120_000);
  }
}
