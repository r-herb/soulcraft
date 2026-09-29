// The city missions list: what each asks, how far along the player is, the
// reward, and which one the HUD follows.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { MISSIONS } from '../quest/missions.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function missions(args, ui) {
  const g = ui.game, M = g.missions;
  const node = el(`<div class="screen scrim" data-screen="missions">
    <div class="panel bank-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="mis.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <p class="faint small" style="margin:0" data-i18n="mis.info"></p>
      <div class="panel-body"><div class="mis-list"></div></div>
    </div></div>`);
  const list = node.querySelector('.mis-list');
  const draw = () => {
    const tracked = M.tracked;
    list.innerHTML = MISSIONS.map((m) => {
      const done = M.isDone(m.id), on = tracked && tracked.id === m.id;
      return `<div class="mis-card ${done ? 'done' : ''} ${on ? 'on' : ''}" data-id="${m.id}">
        <div class="row"><b>${done ? '&#10003; ' : ''}${esc(t('mis.' + m.id))}</b><span class="stat-chip coin-chip">${esc(t('mis.reward', { coins: m.reward.coins, crystals: m.reward.crystals }))}</span></div>
        <span class="faint small">${esc(t('mis.' + m.id + '.desc'))}</span>
        <div class="row"><span class="small">${esc(M.stepText(m))}</span>${done ? '' : `<button class="btn small ${on ? 'primary' : ''}" data-a="track">${esc(t(on ? 'mis.tracking' : 'mis.track'))}</button>`}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-a="track"]').forEach((b) => b.addEventListener('click', () => { ui.click(); M.track(b.closest('[data-id]').dataset.id); draw(); }));
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}
