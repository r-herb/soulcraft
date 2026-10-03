// The city missions list: what each asks, how far along the player is, the
// reward, and which one the HUD follows. Above it, the big mission (El Gran
// Golpe): the pieces of the bank's plan found so far and the puzzle.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { missionName } from '../quest/missions.js';
import { PIECES } from '../quest/heist.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function missions(args, ui) {
  const g = ui.game, M = g.missions;
  const node = el(`<div class="screen scrim" data-screen="missions">
    <div class="panel bank-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="mis.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <p class="faint small" style="margin:0" data-i18n="mis.info"></p>
      <div class="panel-body"><div class="heist-box"></div><div class="mis-list"></div></div>
    </div></div>`);
  const list = node.querySelector('.mis-list'), hbox = node.querySelector('.heist-box');
  const draw = () => {
    const tracked = M.tracked;
    if (g.heist) {
      const h = g.heist.state();
      hbox.innerHTML = `<div class="mis-card heist-card ${h.mayor ? 'done' : ''}">
        <div class="row"><b>${esc(t('heist.title'))}</b><span class="stat-chip">${esc(t('heist.pieces', { n: h.got.length, total: PIECES }))}</span></div>
        <span class="faint small">${esc(t(h.mayor ? 'heist.mayorInfo' : h.map ? 'heist.finalInfo' : 'heist.info'))}</span>
        <div class="bank-meter"><i style="width:${(h.got.length / PIECES) * 100}%"></i></div>
        <div class="row" style="justify-content:flex-end"><button class="btn small primary" data-a="plan">${esc(t('heist.openPlan'))}</button></div>
      </div>`;
      hbox.querySelector('[data-a="plan"]').addEventListener('click', () => { ui.click(); ui.open('heistMap'); });
    }
    list.innerHTML = M.all().map((m) => {
      const done = M.isDone(m.id), on = tracked && tracked.id === m.id;
      const reward = m.heist ? t('heist.rewardPiece', { crystals: m.reward.crystals }) : m.final ? t('heist.rewardFinal') : t('mis.reward', { coins: m.reward.coins, crystals: m.reward.crystals });
      const desc = m.final ? t('heist.final.desc') : m.heist ? t('heist.task.' + m.key + '.desc') : t('mis.' + m.id + '.desc');
      return `<div class="mis-card ${done ? 'done' : ''} ${on ? 'on' : ''} ${m.heist || m.final ? 'heist' : ''}" data-id="${m.id}">
        <div class="row"><b>${done ? '&#10003; ' : ''}${esc(missionName(m))}</b><span class="stat-chip coin-chip">${esc(reward)}</span></div>
        <span class="faint small">${esc(desc)}</span>
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
