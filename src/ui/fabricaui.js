// La Fábrica's screens: El Maestro's class (five lessons on a blackboard, a
// quiz, then the player's alias), the red phone (the negotiator, four ways
// to answer) and the end of the season (what was carried out, what it paid).
// Season 2 has its own class, the officer's questions on the quay (Siroco's
// rescue), a new negotiator and its own end; season 3 the safe's dial;
// season 4 the belts' routing panel.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { ALIASES, TARGET } from '../quest/fabrica.js';
import { ORO_TARGET } from '../quest/oro.js';
import { openings, traceRoute } from '../quest/aero.js';

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

// ---------- season 2 ----------
const ANSWERS2 = [2, 0, 1, 2, 0];
// the officer on the quay: who signed the order, its number, where the prisoner goes
const RESCUE = [1, 0, 2];

export function oroLesson(args, ui) {
  const g = ui.game, O = g.oro;
  let step = 0, picks = [];
  const node = el(`<div class="screen scrim" data-screen="oroLesson">
    <div class="panel fab-panel-ui">
      <div class="panel-head"><h2 class="panel-title" data-i18n="oro.class.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body fab-body"></div>
    </div></div>`);
  const body = node.querySelector('.fab-body');
  const draw = () => {
    if (step < LESSONS) {
      body.innerHTML = `<div class="blackboard"><span class="bb-n">${esc(t('fab.class.lesson', { n: step + 1, total: LESSONS }))}</span><h3>${esc(t('oro.lesson.' + (step + 1) + '.title'))}</h3><p>${esc(t('oro.lesson.' + (step + 1)))}</p></div>
        <div class="row" style="justify-content:space-between"><span class="faint small">${esc(t('fab.maestroSays'))}</span><button class="btn primary" data-a="next">${esc(t(step === LESSONS - 1 ? 'fab.class.toQuiz' : 'fab.class.next'))}</button></div>`;
      body.querySelector('[data-a="next"]').onclick = () => { ui.click(); step++; draw(); };
    } else if (step === LESSONS) {
      const qi = picks.length;
      body.innerHTML = `<div class="quiz"><span class="bb-n">${esc(t('fab.class.question', { n: qi + 1, total: ANSWERS2.length }))}</span><h3>${esc(t('oro.q.' + (qi + 1)))}</h3>
        <div class="col">${[0, 1, 2].map((i) => `<button class="btn quiz-a" data-i="${i}">${esc(t('oro.q.' + (qi + 1) + '.a' + i))}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { ui.click(); picks.push(+b.dataset.i); if (picks.length >= ANSWERS2.length) step++; draw(); }; });
    } else {
      const right = picks.filter((p, i) => p === ANSWERS2[i]).length, pass = right >= 4;
      body.innerHTML = `<div class="blackboard"><h3>${esc(t(pass ? 'fab.class.passed' : 'fab.class.failed', { n: right, total: ANSWERS2.length }))}</h3>${pass ? `<p>${esc(t('oro.class.ready'))}</p>` : ''}</div>
        <div class="row" style="justify-content:flex-end">${pass ? `<button class="btn primary" data-a="go">${esc(t('oro.class.go'))}</button>` : `<button class="btn primary" data-a="again">${esc(t('fab.class.again'))}</button>`}</div>`;
      if (!pass) body.querySelector('[data-a="again"]').onclick = () => { ui.click(); step = 0; picks = []; draw(); };
      else body.querySelector('[data-a="go"]').onclick = () => { ui.click(); O.passClass(); ui.back(); };
    }
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// Muelle Uno: the officer guarding Siroco asks about the transfer order
export function oroRescue(args, ui) {
  const g = ui.game, O = g.oro;
  const ready = g.inventory.count('fake_order') > 0 && g.inventory.count('police_uniform') > 0;
  let picks = [];
  const node = el(`<div class="screen scrim" data-screen="oroRescue">
    <div class="panel fab-panel-ui phone">
      <div class="panel-head"><h2 class="panel-title" data-i18n="oro.rescue.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col fab-body" style="gap:var(--sp-2)"></div>
    </div></div>`);
  const body = node.querySelector('.fab-body');
  const draw = () => {
    if (!ready) {
      body.innerHTML = `<p class="neg-line">${esc(t('oro.rescue.need'))}</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-a="ok">${esc(t('guide.ok'))}</button></div>`;
      body.querySelector('[data-a="ok"]').onclick = () => { ui.click(); ui.back(); };
      return;
    }
    if (picks.length < RESCUE.length) {
      const qi = picks.length;
      body.innerHTML = `${qi === 0 ? `<p class="faint small">${esc(t('oro.rescue.intro'))}</p>` : ''}<p class="neg-line">&laquo;${esc(t('oro.rescue.q' + (qi + 1)))}&raquo;</p>
        ${[0, 1, 2].map((i) => `<button class="btn quiz-a" data-i="${i}">${esc(t('oro.rescue.q' + (qi + 1) + '.a' + i))}</button>`).join('')}`;
      body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { ui.click(); picks.push(+b.dataset.i); draw(); }; });
      return;
    }
    const right = picks.filter((p, i) => p === RESCUE[i]).length, pass = right >= 2;
    body.innerHTML = `<p class="neg-line">&laquo;${esc(t(pass ? 'oro.rescue.yes' : 'oro.rescue.no'))}&raquo;</p><div class="row" style="justify-content:flex-end"><button class="btn primary" data-a="ok">${esc(t('guide.ok'))}</button></div>`;
    body.querySelector('[data-a="ok"]').onclick = () => { ui.click(); ui.back(); if (pass) O.freed(); };
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// the red phone in La Térmica: a new negotiator
export function oroPhone(args, ui) {
  const g = ui.game, O = g.oro, s = O.state();
  const line = s.phone ? s.phone.line : 0;
  const node = el(`<div class="screen scrim" data-screen="oroPhone">
    <div class="panel fab-panel-ui phone">
      <div class="panel-head"><h2 class="panel-title" data-i18n="oro.neg.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col" style="gap:var(--sp-2)">
        <p class="neg-line">&laquo;${esc(t('oro.neg.line' + line))}&raquo;</p>
        ${[0, 1, 2, 3].map((i) => `<button class="btn" data-c="${i}">${esc(t('oro.neg.c' + i))}</button>`).join('')}
        <p class="faint small">${esc(t('oro.neg.hint'))}</p>
      </div>
    </div></div>`);
  node.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { ui.click(); O.action('phone', { choice: +b.dataset.c }); ui.back(); }));
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  return node;
}

// the end of season 2: the gold on El Maestro's boat
export function oroFinale(args, ui) {
  const g = ui.game, f = g.fabrica.state();
  const node = el(`<div class="screen scrim" data-screen="oroFinale">
    <div class="panel fab-panel-ui finale">
      <div class="mayor-crown" aria-hidden="true">&#129689;</div>
      <h2 class="panel-title" data-i18n="oro.end.title"></h2>
      <p>${esc(t('oro.end.text', { alias: f.alias ? t('fab.alias.' + f.alias) : t('heist.you') }))}</p>
      <p class="mayor-paid">${esc(t('oro.end.sacks', { n: args.sacks || 0, total: ORO_TARGET }))}</p>
      ${args.paid ? `<p class="mayor-paid">${esc(t('fab.end.paid', { n: Number(args.paid).toLocaleString() }))}</p>` : `<p class="faint small">${esc(t('oro.end.guest'))}</p>`}
      <p class="faint small">${esc(t('oro.end.items'))}</p>
      <p class="faint small">${esc(t('oro.end.next'))}</p>
      <button class="btn primary" data-act="close" data-i18n="oro.end.ok"></button>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  g.audio.sfx('victory');
  return node;
}

// ---------- season 3 ----------
const ANSWERS3 = [1, 2, 0, 1, 0];

// the plan on the blackboard (Siroco this time), a quiz
export function puertoLesson(args, ui) {
  const g = ui.game, U = g.puerto;
  let step = 0, picks = [];
  const node = el(`<div class="screen scrim" data-screen="puertoLesson">
    <div class="panel fab-panel-ui">
      <div class="panel-head"><h2 class="panel-title" data-i18n="puerto.class.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body fab-body"></div>
    </div></div>`);
  const body = node.querySelector('.fab-body');
  const draw = () => {
    if (step < LESSONS) {
      body.innerHTML = `<div class="blackboard"><span class="bb-n">${esc(t('fab.class.lesson', { n: step + 1, total: LESSONS }))}</span><h3>${esc(t('puerto.lesson.' + (step + 1) + '.title'))}</h3><p>${esc(t('puerto.lesson.' + (step + 1)))}</p></div>
        <div class="row" style="justify-content:space-between"><span class="faint small">${esc(t('puerto.sirocoSays'))}</span><button class="btn primary" data-a="next">${esc(t(step === LESSONS - 1 ? 'fab.class.toQuiz' : 'fab.class.next'))}</button></div>`;
      body.querySelector('[data-a="next"]').onclick = () => { ui.click(); step++; draw(); };
    } else if (step === LESSONS) {
      const qi = picks.length;
      body.innerHTML = `<div class="quiz"><span class="bb-n">${esc(t('fab.class.question', { n: qi + 1, total: ANSWERS3.length }))}</span><h3>${esc(t('puerto.q.' + (qi + 1)))}</h3>
        <div class="col">${[0, 1, 2].map((i) => `<button class="btn quiz-a" data-i="${i}">${esc(t('puerto.q.' + (qi + 1) + '.a' + i))}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { ui.click(); picks.push(+b.dataset.i); if (picks.length >= ANSWERS3.length) step++; draw(); }; });
    } else {
      const right = picks.filter((p, i) => p === ANSWERS3[i]).length, pass = right >= 4;
      body.innerHTML = `<div class="blackboard"><h3>${esc(t(pass ? 'fab.class.passed' : 'fab.class.failed', { n: right, total: ANSWERS3.length }))}</h3>${pass ? `<p>${esc(t('puerto.class.ready'))}</p>` : ''}</div>
        <div class="row" style="justify-content:flex-end">${pass ? `<button class="btn primary" data-a="go">${esc(t('oro.class.go'))}</button>` : `<button class="btn primary" data-a="again">${esc(t('fab.class.again'))}</button>`}</div>`;
      if (!pass) body.querySelector('[data-a="again"]').onclick = () => { ui.click(); step = 0; picks = []; draw(); };
      else body.querySelector('[data-a="go"]').onclick = () => { ui.click(); U.passClass(); ui.back(); };
    }
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// the safe: turn the dial, listen with the stethoscope, set three numbers
export function puertoSafe(args, ui) {
  const g = ui.game, U = g.puerto, s = U.state(), combo = s.combo || [0, 0, 0];
  let dial = 0, set = [];
  const node = el(`<div class="screen scrim" data-screen="puertoSafe">
    <div class="panel fab-panel-ui phone">
      <div class="panel-head"><h2 class="panel-title" data-i18n="puerto.safe.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col safe-dial">
        <p class="faint small" style="margin:0">${esc(t('puerto.safe.how'))}</p>
        <div class="sd-num">00</div>
        <div class="sd-ear"></div>
        <div class="row" style="gap:6px;justify-content:center">
          <button class="btn" data-d="-5">&laquo;</button><button class="btn" data-d="-1">&lsaquo;</button>
          <button class="btn" data-d="1">&rsaquo;</button><button class="btn" data-d="5">&raquo;</button>
        </div>
        <div class="sd-set"><span>-</span><span>-</span><span>-</span></div>
        <button class="btn primary" data-a="set">${esc(t('puerto.safe.set'))}</button>
        <p class="sd-msg small" style="margin:0"></p>
      </div>
    </div></div>`);
  const want = () => combo[set.length];
  const draw = () => {
    node.querySelector('.sd-num').textContent = String(dial).padStart(2, '0');
    const off = Math.abs(dial - want());
    node.querySelector('.sd-ear').textContent = set.length >= 3 ? '' : off === 0 ? t('puerto.safe.click') : off <= 3 ? t('puerto.safe.faint') : t('puerto.safe.quiet');
    node.querySelectorAll('.sd-set span').forEach((e, i) => { e.textContent = set[i] !== undefined ? String(set[i]).padStart(2, '0') : '-'; });
  };
  node.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { dial = (dial + Number(b.dataset.d) + 40) % 40; g.audio.sfx('click'); draw(); }));
  node.querySelector('[data-a="set"]').addEventListener('click', () => {
    ui.click();
    set.push(dial);
    if (set.length < 3) { draw(); return; }
    draw();
    const ok = set.every((v, i) => v === combo[i]), msg = node.querySelector('.sd-msg');
    if (ok) { msg.textContent = t('puerto.safe.open'); U.safeOpened(); setTimeout(() => ui.back(), 700); }
    else { msg.textContent = t('puerto.safe.wrong'); g.audio.sfx('buzz'); set = []; setTimeout(draw, 600); }
  });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// the end of season 3: El Maestro on the boat
export function puertoFinale(args, ui) {
  const g = ui.game, f = g.fabrica.state();
  const node = el(`<div class="screen scrim" data-screen="puertoFinale">
    <div class="panel fab-panel-ui finale">
      <div class="mayor-crown" aria-hidden="true">&#9875;</div>
      <h2 class="panel-title" data-i18n="puerto.end.title"></h2>
      <p>${esc(t('puerto.end.text', { alias: f.alias ? t('fab.alias.' + f.alias) : t('heist.you') }))}</p>
      ${args.paid ? `<p class="mayor-paid">${esc(t('fab.end.paid', { n: Number(args.paid).toLocaleString() }))}</p>` : `<p class="faint small">${esc(t('puerto.end.guest'))}</p>`}
      <p class="faint small">${esc(t('puerto.end.items'))}</p>
      <p class="faint small">${esc(t('puerto.end.next'))}</p>
      <button class="btn primary" data-act="close" data-i18n="puerto.end.ok"></button>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  g.audio.sfx('victory');
  return node;
}

// ---------- season 4 ----------
const ANSWERS4 = [2, 0, 1, 2, 1];

// the plan on the blackboard (El Maestro again), a quiz
export function aeroLesson(args, ui) {
  const g = ui.game, U = g.aero;
  let step = 0, picks = [];
  const node = el(`<div class="screen scrim" data-screen="aeroLesson">
    <div class="panel fab-panel-ui">
      <div class="panel-head"><h2 class="panel-title" data-i18n="aero.class.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body fab-body"></div>
    </div></div>`);
  const body = node.querySelector('.fab-body');
  const draw = () => {
    if (step < LESSONS) {
      body.innerHTML = `<div class="blackboard"><span class="bb-n">${esc(t('fab.class.lesson', { n: step + 1, total: LESSONS }))}</span><h3>${esc(t('aero.lesson.' + (step + 1) + '.title'))}</h3><p>${esc(t('aero.lesson.' + (step + 1)))}</p></div>
        <div class="row" style="justify-content:space-between"><span class="faint small">${esc(t('aero.maestroSays'))}</span><button class="btn primary" data-a="next">${esc(t(step === LESSONS - 1 ? 'fab.class.toQuiz' : 'fab.class.next'))}</button></div>`;
      body.querySelector('[data-a="next"]').onclick = () => { ui.click(); step++; draw(); };
    } else if (step === LESSONS) {
      const qi = picks.length;
      body.innerHTML = `<div class="quiz"><span class="bb-n">${esc(t('fab.class.question', { n: qi + 1, total: ANSWERS4.length }))}</span><h3>${esc(t('aero.q.' + (qi + 1)))}</h3>
        <div class="col">${[0, 1, 2].map((i) => `<button class="btn quiz-a" data-i="${i}">${esc(t('aero.q.' + (qi + 1) + '.a' + i))}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => { ui.click(); picks.push(+b.dataset.i); if (picks.length >= ANSWERS4.length) step++; draw(); }; });
    } else {
      const right = picks.filter((p, i) => p === ANSWERS4[i]).length, pass = right >= 4;
      body.innerHTML = `<div class="blackboard"><h3>${esc(t(pass ? 'fab.class.passed' : 'fab.class.failed', { n: right, total: ANSWERS4.length }))}</h3>${pass ? `<p>${esc(t('aero.class.ready'))}</p>` : ''}</div>
        <div class="row" style="justify-content:flex-end">${pass ? `<button class="btn primary" data-a="go">${esc(t('oro.class.go'))}</button>` : `<button class="btn primary" data-a="again">${esc(t('fab.class.again'))}</button>`}</div>`;
      if (!pass) body.querySelector('[data-a="again"]').onclick = () => { ui.click(); step = 0; picks = []; draw(); };
      else body.querySelector('[data-a="go"]').onclick = () => { ui.click(); U.passClass(); ui.back(); };
    }
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// a belt piece: straight (top to bottom) or a corner (top to right), turned a quarter at a time
const piece = (k) => `<svg viewBox="0 0 40 40" aria-hidden="true">${k ? '<path d="M20 0 V20 H40" />' : '<path d="M20 0 V40" />'}</svg>`;

// the belts' routing panel: turn the pieces so the container rolls out at Hangar 7
export function aeroRoute(args, ui) {
  const g = ui.game, U = g.aero, rt = U.state().route;
  const node = el(`<div class="screen scrim" data-screen="aeroRoute">
    <div class="panel fab-panel-ui route-ui">
      <div class="panel-head"><h2 class="panel-title" data-i18n="aero.route.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="panel-body col">
        <p class="faint small" style="margin:0">${esc(t('aero.route.how'))}</p>
        <div class="route-grid"></div>
        <p class="rt-to" data-to=""></p>
        <button class="btn primary" data-a="send">${esc(t('aero.route.send'))}</button>
        <p class="rt-msg small" style="margin:0"></p>
      </div>
    </div></div>`);
  if (!rt) { node.querySelector('.panel-body').innerHTML = `<p>${esc(t('aero.panelLater'))}</p>`; applyI18n(node); node.querySelector('[data-act="close"]').addEventListener('click', () => ui.back()); return node; }
  const rots = rt.cells.map((c) => c.r), grid = node.querySelector('.route-grid');
  grid.style.gridTemplateColumns = `auto repeat(${rt.C}, 44px) minmax(70px, auto)`;
  const draw = () => {
    const tr = traceRoute(rt, rots), on = new Set(tr.path);
    let html = '';
    for (let r = 0; r < rt.R; r++) {
      html += `<span class="rt-in">${r === rt.start ? '&#9654;' : ''}</span>`;
      for (let c = 0; c < rt.C; c++) {
        const i = r * rt.C + c;
        html += `<button class="rt-cell${on.has(i) ? ' on' : ''}" data-i="${i}" data-k="${rt.cells[i].k}" data-r="${rots[i]}" style="--rot:${rots[i] * 90}deg" aria-label="${esc(t('aero.route.piece', { n: i + 1 }))}">${piece(rt.cells[i].k)}</button>`;
      }
      html += `<span class="rt-out${tr.to === r ? ' on' : ''}${rt.dests[r] === 'hangar' ? ' goal' : ''}">${esc(t('aero.route.' + rt.dests[r]))}</span>`;
    }
    grid.innerHTML = html;
    const to = node.querySelector('.rt-to');
    to.dataset.to = tr.to >= 0 ? rt.dests[tr.to] : 'stop';
    to.textContent = tr.to >= 0 ? t('aero.route.goes', { to: t('aero.route.' + rt.dests[tr.to]) }) : t('aero.route.stops');
    grid.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.i; rots[i] = (rots[i] + 1) % 4; g.audio.sfx('click'); draw(); }));
  };
  node.querySelector('[data-a="send"]').addEventListener('click', () => {
    ui.click();
    const tr = traceRoute(rt, rots), msg = node.querySelector('.rt-msg');
    if (tr.to === rt.exit) { msg.textContent = t('aero.route.done'); U.routeDone(); setTimeout(() => ui.back(), 700); }
    else { msg.textContent = t(tr.to >= 0 ? 'aero.route.wrong' : 'aero.route.stuck', { to: tr.to >= 0 ? t('aero.route.' + rt.dests[tr.to]) : '' }); g.audio.sfx('buzz'); }
  });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  return node;
}

// the end of season 4: the jet takes off with the gold
export function aeroFinale(args, ui) {
  const g = ui.game, f = g.fabrica.state();
  const node = el(`<div class="screen scrim" data-screen="aeroFinale">
    <div class="panel fab-panel-ui finale">
      <div class="mayor-crown" aria-hidden="true">&#9992;</div>
      <h2 class="panel-title" data-i18n="aero.end.title"></h2>
      <p>${esc(t('aero.end.text', { alias: f.alias ? t('fab.alias.' + f.alias) : t('heist.you') }))}</p>
      ${args.paid ? `<p class="mayor-paid">${esc(t('fab.end.paid', { n: Number(args.paid).toLocaleString() }))}</p>` : `<p class="faint small">${esc(t('aero.end.guest'))}</p>`}
      <p class="faint small">${esc(t('aero.end.items'))}</p>
      <p class="faint small">${esc(t('aero.end.next'))}</p>
      <button class="btn primary" data-act="close" data-i18n="aero.end.ok"></button>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  g.audio.sfx('victory');
  return node;
}
