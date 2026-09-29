// Friends: add a friend by username, answer requests, see who is online and
// in which world, and join a friend's open world with one tap.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { friends as api, account } from '../save/account.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const av = (p) => (p.avatar ? `<img class="avatar-sm" alt="" src="${esc(p.avatar)}">` : '<span class="avatar-sm ph"></span>');

// the number of friend requests waiting (for the badges), refreshed now and then
export const social = { incoming: 0, listeners: new Set() };
export async function refreshSocial() {
  if (!account.user) { social.incoming = 0; return; }
  try { const r = await api.list(); social.incoming = r.incoming.length; social.last = r; } catch { /* offline */ }
  social.listeners.forEach((fn) => fn());
}

export function friends(args, ui) {
  const node = el(`<div class="screen scrim" data-screen="friends">
    <div class="panel friends-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="fr.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <form class="row fr-add" novalidate>
        <input class="input" id="fr-name" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" data-i18n-placeholder="fr.addPlaceholder">
        <button class="btn primary" type="submit" data-i18n="fr.add"></button>
      </form>
      <p class="form-error" role="alert"></p>
      <div class="fr-list"><p class="faint" data-i18n="common.loading"></p></div>
    </div></div>`);
  const list = node.querySelector('.fr-list'), errEl = node.querySelector('.form-error');
  const g = ui.game;

  async function load() {
    let r;
    try { r = await api.list(); } catch { list.innerHTML = `<p class="faint">${esc(t('fr.offline'))}</p>`; return; }
    social.incoming = r.incoming.length; social.listeners.forEach((fn) => fn());
    const row = (p, acts, sub = '') => `<div class="fr-row" data-id="${p.id}">${av(p)}<span class="fr-name"><b>${esc(p.name)}</b>${p.username ? ` <span class="faint">@${esc(p.username)}</span>` : ''}<br><span class="fr-sub">${sub}</span></span><span class="fr-acts">${acts}</span></div>`;
    const where = (p) => {
      if (!p.online) return `<span class="faint">${esc(t('fr.offlineNow'))}</span>`;
      const w = p.world ? t(p.city ? 'fr.inCity' : 'fr.inWorld', { name: p.world }) : t('fr.inMenu');
      return `<span class="fr-dot on"></span>${esc(w)}${p.room ? ` <span class="badge-ok">${esc(t('fr.open'))}</span>` : ''}`;
    };
    let html = '';
    if (r.incoming.length) html += `<div class="section-label">${esc(t('fr.incoming'))}</div>` + r.incoming.map((p) => row(p, `<button class="btn small primary" data-a="accept" data-i18n="fr.accept"></button><button class="btn small ghost" data-a="remove" data-i18n="fr.decline"></button>`, esc(t('fr.wantsToBe')))).join('');
    html += `<div class="section-label">${esc(t('fr.list', { n: r.friends.length }))}</div>`;
    html += r.friends.length ? r.friends.map((p) => row(p, `${p.room ? '<button class="btn small primary" data-a="join" data-i18n="fr.join"></button>' : ''}<button class="btn small ghost" data-a="remove" data-i18n="fr.remove"></button>`, where(p))).join('') : `<p class="faint">${esc(t('fr.none'))}</p>`;
    if (r.outgoing.length) html += `<div class="section-label">${esc(t('fr.outgoing'))}</div>` + r.outgoing.map((p) => row(p, `<button class="btn small ghost" data-a="remove" data-i18n="fr.cancel"></button>`, esc(t('fr.waiting')))).join('');
    list.innerHTML = html;
    const all = [...r.incoming, ...r.friends, ...r.outgoing];
    list.querySelectorAll('.fr-row').forEach((rowEl) => {
      const p = all.find((x) => x.id === Number(rowEl.dataset.id));
      rowEl.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        ui.click();
        const a = b.dataset.a;
        try {
          if (a === 'accept') { await api.accept(p.id); ui.toast(t('fr.nowFriends', { name: p.name }), 'ok'); }
          else if (a === 'remove') await api.remove(p.id);
          else if (a === 'join') {
            if (g && g.running) await ui.app.quitToTitle();
            ui.app.joinRoom(p.room);
            return;
          }
        } catch (e) { errEl.textContent = t('fr.err'); console.warn(e); }
        load();
      }));
    });
    applyI18n(list);
  }

  node.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inp = node.querySelector('#fr-name');
    errEl.textContent = '';
    try {
      const r = await api.add(inp.value.trim().replace(/^@/, ''));
      inp.value = '';
      ui.toast(t(r.status === 'accepted' ? 'fr.nowFriends' : 'fr.sent', { name: r.name }), 'ok');
      load();
    } catch (e) {
      const k = 'fr.err.' + (e.code || '');
      const s = t(k);
      errEl.textContent = s === k ? t('fr.err') : s;
    }
  });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  load();
  const timer = setInterval(() => { if (!node.isConnected) { clearInterval(timer); return; } load(); }, 15000);
  return node;
}
