// The city missions list: what each asks, how far along the player is, the
// reward, and which one the HUD follows. Above it, the big mission (El Gran
// Golpe): the pieces of the bank's plan found so far and the puzzle.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { missionName } from '../quest/missions.js';
import { itemName } from './hud.js';
import { PIECES } from '../quest/heist.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// what a mission is about, and what it pays (a piece of the plan, a tool, the big prize, coins)
const descText = (m) => (m.fab ? t('fab.m.' + m.key + '.desc') : m.final ? t('heist.final.desc') : m.approach ? t('heist.ap.' + m.key + '.desc') : m.heist ? t('heist.task.' + m.key + '.desc') : t('mis.' + m.id + '.desc'));
const rewardText = (m) => (m.fab ? t('fab.reward', { crystals: m.reward.crystals }) : m.approach ? t('heist.rewardTool', { item: m.items.map(([k, n]) => (n > 1 ? n + ' x ' : '') + itemName(k)).join(', ') })
  : m.heist ? t('heist.rewardPiece', { crystals: m.reward.crystals }) : m.final ? t('heist.rewardFinal') : t('mis.reward', { coins: m.reward.coins, crystals: m.reward.crystals }));

export function missions(args, ui) {
  const g = ui.game, M = g.missions;
  const node = el(`<div class="screen scrim" data-screen="missions">
    <div class="panel bank-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="mis.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="row"><p class="faint small" style="margin:0;flex:1" data-i18n="mis.info"></p><button class="btn small city-btn" data-act="guide" data-i18n="guide.city.open"></button></div>
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
      const reward = rewardText(m);
      const desc = descText(m);
      return `<div class="mis-card ${done ? 'done' : ''} ${on ? 'on' : ''} ${m.heist || m.final || m.approach ? 'heist' : ''} ${m.fab ? 'fab' : ''}" data-id="${m.id}">
        <div class="row"><b>${done ? '&#10003; ' : ''}${m.approach ? '&#9881; ' : m.fab ? '&#127917; ' : ''}${esc(missionName(m))}</b><span class="stat-chip coin-chip">${esc(reward)}</span></div>
        <span class="faint small">${esc(desc)}</span>
        <div class="row"><span class="small" style="flex:1">${esc(M.stepText(m))}</span><button class="btn small ghost mis-help" data-a="help" aria-label="${esc(t('guide.how'))}">?</button>${done ? '' : `<button class="btn small ${on ? 'primary' : ''}" data-a="track">${esc(t(on ? 'mis.tracking' : 'mis.track'))}</button>`}</div>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-a="track"]').forEach((b) => b.addEventListener('click', () => { ui.click(); M.track(b.closest('[data-id]').dataset.id); draw(); }));
    list.querySelectorAll('[data-a="help"]').forEach((b) => b.addEventListener('click', () => { ui.click(); M.showGuide(b.closest('[data-id]').dataset.id, true); }));
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  node.querySelector('[data-act="guide"]').addEventListener('click', () => { ui.click(); ui.open('cityGuide'); });
  applyI18n(node);
  draw();
  return node;
}

// A mission's guide: what it asks, every step in order, tips on how to do
// them in the city, and the reward. Opens the first time a mission is
// followed, and from the ? button of each mission.
export function missionHelp(args, ui) {
  const g = ui.game, M = g.missions, m = M.byId(args.id);
  if (!m) return null;
  const pr = M.prog(m.id), done = M.isDone(m.id), at = m.tour ? pr.seen.length : pr.step;
  const desc = descText(m);
  const reward = rewardText(m);
  const steps = M.stepsOf(m);
  const tips = t('guide.m.' + M.guideKey(m)).split('\n').filter(Boolean);
  const tracked = M.tracked && M.tracked.id === m.id;
  const node = el(`<div class="screen scrim" data-screen="missionHelp">
    <div class="panel guide-panel">
      <div class="panel-head"><h2 class="panel-title">${esc(missionName(m))}</h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col" style="gap:var(--sp-3)">
        <p style="margin:0">${esc(desc)}</p>
        <div><b class="guide-h" data-i18n="guide.steps"></b>
          <ol class="guide-steps">${steps.map((x, i) => `<li class="${done || (m.tour ? pr.seen.includes(m.tour[i]) : i < at) ? 'done' : !done && i === at ? 'now' : ''}">${esc(x)}</li>`).join('')}</ol></div>
        <div><b class="guide-h" data-i18n="guide.tips"></b><ul class="guide-tips">${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <p class="small guide-reward">${esc(t('guide.reward', { r: reward }))}</p>
        <div class="row" style="justify-content:flex-end">${done || tracked ? '' : '<button class="btn" data-act="track" data-i18n="mis.track"></button>'}<button class="btn primary" data-act="ok" data-i18n="guide.ok"></button></div>
      </div>
    </div></div>`);
  const close = () => { ui.click(); ui.back(); };
  node.querySelector('[data-act="close"]').addEventListener('click', close);
  node.querySelector('[data-act="ok"]').addEventListener('click', close);
  const tb = node.querySelector('[data-act="track"]');
  if (tb) tb.addEventListener('click', () => { M.track(m.id, false); close(); });
  applyI18n(node);
  return node;
}

// What there is to do in Malaga: shown (as a card to open) on the first
// arrival, and from the missions screen.
const CITY_PARTS = ['move', 'money', 'food', 'missions', 'heist', 'fabrica', 'gems', 'farm', 'friends'];
export function cityGuide(args, ui) {
  const g = ui.game;
  const node = el(`<div class="screen scrim" data-screen="cityGuide">
    <div class="panel guide-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="guide.city.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col" style="gap:var(--sp-2)">
        <p style="margin:0" data-i18n="guide.city.intro"></p>
        ${CITY_PARTS.map((k) => `<div class="guide-part"><b>${esc(t('guide.city.' + k))}</b><p class="small">${esc(t('guide.city.' + k + '.text'))}</p></div>`).join('')}
        <div class="row" style="justify-content:flex-end"><button class="btn" data-act="missions" data-i18n="mis.title"></button><button class="btn primary" data-act="start" data-i18n="guide.city.start"></button></div>
      </div>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  node.querySelector('[data-act="missions"]').addEventListener('click', () => { ui.click(); ui.back(); if (!ui.stack.some((x) => x.name === 'missions')) ui.open('missions'); });
  // off you go: the first mission's guide (once)
  node.querySelector('[data-act="start"]').addEventListener('click', () => {
    ui.click(); ui.back();
    const m = g.missions && g.missions.tracked;
    if (m) g.missions.showGuide(m.id);
  });
  applyI18n(node);
  return node;
}
