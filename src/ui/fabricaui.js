// La Fábrica's screens: El Maestro's class (five lessons on a blackboard, a
// quiz, then the player's alias), the red phone (the negotiator, four ways
// to answer) and the end of the season (what was carried out, what it paid).
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { ALIASES, TARGET } from '../quest/fabrica.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LESSONS = 5;
// the right answer of each question (0, 1 or 2)
const ANSWERS = [1, 0, 2, 1, 2];

export function fabLesson(args, ui) {
  const g = ui.game, F = g.fabrica;
  let step = 0, picks = [];
  const node = el(`<div class="screen scrim" data-screen="fabLesson">
    <div class="panel fab-panel-ui">
      <div class="panel-head"><h2 class="panel-title" data-i18n="fab.class.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body fab-body"></div>
    </div></div>`);
  const body = node.querySelector('.fab-body');
  const draw = () => {
    if (step < LESSONS) {
      body.innerHTML = `<div class="blackboard"><span class="bb-n">${esc(t('fab.class.lesson', { n: step + 1, total: LESSONS }))}</span><h3>${esc(t('fab.lesson.' + (step + 1) + '.title'))}</h3><p>${esc(t('fab.lesson.' + (step + 1)))}</p></div>
        <div class="row" style="justify-content:space-between"><span class="faint small">${esc(t('fab.maestroSays'))}</span><button class="btn primary" data-a="next">${esc(t(step === LESSONS - 1 ? 'fab.class.toQuiz' : 'fab.class.next'))}</button></div>`;
      body.querySelector('[data-a="next"]').onclick = () => { ui.click(); step++; draw(); };
    } else if (step === LESSONS) {
      const qi = picks.length;
      body.innerHTML = `<div class="quiz"><span class="bb-n">${esc(t('fab.class.question', { n: qi + 1, total: ANSWERS.length }))}</span><h3>${esc(t('fab.q.' + (qi + 1)))}</h3>
        <div class="col">${[0, 1, 2].map((i) => `<button class="btn quiz-a" data-i="${i}">${esc(t('fab.q.' + (qi + 1) + '.a' + i))}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { ui.click(); picks.push(+b.dataset.i); if (picks.length >= ANSWERS.length) step++; draw(); }; });
    } else if (step === LESSONS + 1) {
      const right = picks.filter((p, i) => p === ANSWERS[i]).length, pass = right >= 4;
      body.innerHTML = `<div class="blackboard"><h3>${esc(t(pass ? 'fab.class.passed' : 'fab.class.failed', { n: right, total: ANSWERS.length }))}</h3>${pass ? `<p>${esc(t('fab.class.alias'))}</p><div class="alias-grid">${ALIASES.map((a) => `<button class="btn" data-alias="${a}">${esc(t('fab.alias.' + a))}</button>`).join('')}</div>` : ''}</div>
        ${pass ? '' : `<div class="row" style="justify-content:flex-end"><button class="btn primary" data-a="again">${esc(t('fab.class.again'))}</button></div>`}`;
      if (!pass) body.querySelector('[data-a="again"]').onclick = () => { ui.click(); step = 0; picks = []; draw(); };
      body.querySelectorAll('[data-alias]').forEach((b) => { b.onclick = () => { ui.click(); F.passClass(b.dataset.alias); ui.toast(t('fab.welcome', { alias: t('fab.alias.' + b.dataset.alias) }), 'soul'); ui.back(); }; });
    }
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// the red phone: the police negotiator on the line
export function fabPhone(args, ui) {
  const g = ui.game, F = g.fabrica, s = F.state();
  const line = s.phone ? s.phone.line : 0;
  const node = el(`<div class="screen scrim" data-screen="fabPhone">
    <div class="panel fab-panel-ui phone">
      <div class="panel-head"><h2 class="panel-title" data-i18n="fab.neg.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col" style="gap:var(--sp-2)">
        <p class="neg-line">&laquo;${esc(t('fab.neg.line' + line))}&raquo;</p>
        ${[0, 1, 2, 3].map((i) => `<button class="btn" data-c="${i}">${esc(t('fab.neg.c' + i))}</button>`).join('')}
        <p class="faint small">${esc(t('fab.neg.hint'))}</p>
      </div>
    </div></div>`);
  node.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { ui.click(); F.action('phone', { choice: +b.dataset.c }); ui.back(); }));
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  return node;
}

// the end of the season: the bags, the money, the crew's farewell
export function fabFinale(args, ui) {
  const g = ui.game, s = g.fabrica.state();
  const node = el(`<div class="screen scrim" data-screen="fabFinale">
    <div class="panel fab-panel-ui finale">
      <div class="mayor-crown" aria-hidden="true">&#127917;</div>
      <h2 class="panel-title" data-i18n="fab.end.title"></h2>
      <p>${esc(t('fab.end.text', { alias: s.alias ? t('fab.alias.' + s.alias) : t('heist.you') }))}</p>
      <p class="mayor-paid">${esc(t('fab.end.bags', { n: args.bags || 0, total: TARGET }))}</p>
      ${args.paid ? `<p class="mayor-paid">${esc(t('fab.end.paid', { n: Number(args.paid).toLocaleString() }))}</p>` : `<p class="faint small">${esc(t('fab.end.guest'))}</p>`}
      <p class="faint small">${esc(t('fab.end.items'))}</p>
      <p class="faint small">${esc(t('fab.end.next'))}</p>
      <button class="btn primary" data-act="close" data-i18n="heist.mayorOk"></button>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  g.audio.sfx('victory');
  return node;
}
