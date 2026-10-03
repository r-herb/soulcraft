// The bank's plan as a puzzle: the pieces found so far wait in a tray; tap a
// piece, then the square it belongs in. A wrong square shakes. With all
// twelve in place the plan is whole: the weak spot in the vault's back wall
// (a red cross), where the guards walk (red dashes) and the Gran Diamante.
// Also the mayor's ceremony at the end of the big mission.
import { t, applyI18n } from '../i18n/index.js';
import { SVG } from './icons.js';
import { PIECES } from '../quest/heist.js';
import { bankPoint } from '../world/city.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLS = 4, ROWS = 3, PW = 120, PH = 120;

// the blueprint: the bank seen from above, the entrance at the bottom
export function drawPlan(pl) {
  const c = document.createElement('canvas');
  c.width = COLS * PW; c.height = ROWS * PH;
  const x = c.getContext('2d');
  x.fillStyle = '#163a75'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(214, 228, 255, 0.12)'; x.lineWidth = 1;
  for (let i = 0; i <= c.width; i += 12) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, c.height); x.stroke(); }
  for (let i = 0; i <= c.height; i += 12) { x.beginPath(); x.moveTo(0, i); x.lineTo(c.width, i); x.stroke(); }
  if (!pl) return c;
  // (d, a) on the plan: a across, d up from the entrance
  const pad = 30, sx = (c.width - 2 * pad) / Math.max(1, pl.width), sy = (c.height - 2 * pad - 14) / Math.max(1, pl.depth);
  const s = Math.min(sx, sy), w = pl.width * s, h = pl.depth * s, ox = (c.width - w) / 2, oy = pad + 14;
  const P = (d, a) => [ox + a * s, oy + h - d * s];
  x.strokeStyle = '#d6e4ff'; x.lineWidth = 3; x.strokeRect(ox, oy, w, h);
  // the entrance
  const [dx0] = P(0, pl.mid - 1.5), [dx1] = P(0, pl.mid + 1.5);
  x.strokeStyle = '#163a75'; x.lineWidth = 5; x.beginPath(); x.moveTo(dx0, oy + h); x.lineTo(dx1, oy + h); x.stroke();
  x.fillStyle = '#d6e4ff'; x.font = 'bold 11px sans-serif'; x.textAlign = 'center';
  x.fillText(t('heist.plan.door'), (dx0 + dx1) / 2, oy + h + 16);
  // the counter, the vault wall with its door
  x.strokeStyle = '#d6e4ff'; x.lineWidth = 2;
  let [a0, y0] = P(pl.counter, 0), [a1] = P(pl.counter, pl.width);
  x.beginPath(); x.moveTo(a0, y0); x.lineTo(a1, y0); x.stroke();
  x.fillText(t('heist.plan.counter'), ox + w / 2, y0 - 5);
  [a0, y0] = P(pl.vault, 0); [a1] = P(pl.vault, pl.width);
  x.lineWidth = 4; x.beginPath(); x.moveTo(a0, y0); x.lineTo(a1, y0); x.stroke();
  x.textAlign = 'left'; x.fillText(t('heist.plan.vault'), ox + 6, oy + 16); x.textAlign = 'center';
  // the guards' rounds
  x.strokeStyle = '#ff5a6e'; x.lineWidth = 2; x.setLineDash([6, 5]);
  for (const r of pl.routes) { const [fx, fy] = P(r.from[0], r.from[1]), [tx, ty] = P(r.to[0], r.to[1]); x.beginPath(); x.moveTo(fx, fy); x.lineTo(tx, ty); x.stroke(); }
  x.setLineDash([]);
  x.fillStyle = '#ff5a6e'; x.textAlign = 'left';
  const [gx, gy] = P(pl.routes[0].from[0], pl.routes[0].from[1]);
  x.fillText(t('heist.plan.guards'), gx + 4, gy - 4);
  // the diamond
  const [mx, my] = P(pl.diamond, pl.mid + 0.5);
  x.fillStyle = '#b6fbff'; x.beginPath(); x.moveTo(mx, my - 8); x.lineTo(mx + 7, my); x.lineTo(mx, my + 8); x.lineTo(mx - 7, my); x.closePath(); x.fill();
  // the weak spot: a red cross on the back wall
  const [wx, wy] = P(pl.depth, pl.mid + 0.5);
  x.strokeStyle = '#ff3b30'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(wx - 9, wy - 9); x.lineTo(wx + 9, wy + 9); x.moveTo(wx + 9, wy - 9); x.lineTo(wx - 9, wy + 9); x.stroke();
  x.fillStyle = '#ff9a90'; x.textAlign = 'center'; x.font = 'bold 12px sans-serif';
  x.fillText(t('heist.plan.weak'), wx, oy - 14);
  return c;
}

export function heistMap(args, ui) {
  const g = ui.game, H = g.heist;
  if (!H) return null;
  const s = H.state();
  let img = drawPlan(H.plan());
  const node = el(`<div class="screen scrim" data-screen="heistMap">
    <div class="panel heist-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="heist.planTitle"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <p class="faint small heist-hint" style="margin:0"></p>
      <div class="heist-board"></div>
      <div class="heist-tray"></div>
    </div></div>`);
  const board = node.querySelector('.heist-board'), tray = node.querySelector('.heist-tray'), hint = node.querySelector('.heist-hint');
  let pick = null;
  const piece = (k) => {
    const slot = s.slots[k], cv = document.createElement('canvas');
    cv.width = PW; cv.height = PH;
    cv.getContext('2d').drawImage(img, (slot % COLS) * PW, Math.floor(slot / COLS) * PH, PW, PH, 0, 0, PW, PH);
    return cv;
  };
  const draw = () => {
    hint.textContent = s.map ? t('heist.planWhole') : t('heist.planHint', { n: s.placed.length, got: s.got.length, total: PIECES });
    board.innerHTML = '';
    for (let i = 0; i < PIECES; i++) {
      const cell = el(`<button class="heist-slot" data-slot="${i}" aria-label="${esc(t('heist.slot', { n: i + 1 }))}"></button>`);
      const k = s.placed.find((key) => s.slots[key] === i);
      if (k) { cell.appendChild(piece(k)); cell.classList.add('full'); }
      cell.addEventListener('click', () => {
        if (!pick || cell.classList.contains('full')) return;
        if (H.place(pick, i)) { ui.click(); g.audio.sfx('place'); pick = null; draw(); }
        else { g.audio.sfx('warn'); cell.classList.remove('shake'); void cell.offsetWidth; cell.classList.add('shake'); }
      });
      board.appendChild(cell);
    }
    tray.innerHTML = '';
    for (const k of s.got.filter((key) => !s.placed.includes(key))) {
      const b = el(`<button class="heist-piece ${pick === k ? 'on' : ''}" data-key="${esc(k)}" aria-label="${esc(t('heist.pieceOf', { name: t('heist.task.' + k) }))}"></button>`);
      b.appendChild(piece(k));
      b.addEventListener('click', () => { ui.click(); pick = pick === k ? null : k; draw(); });
      tray.appendChild(b);
    }
    if (!tray.children.length && !s.map) tray.innerHTML = `<p class="faint small">${esc(t('heist.trayEmpty'))}</p>`;
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  draw();
  // far from the bank its part of the city may not be loaded yet: load it and draw the plan again
  if (!H.plan() && g.city) {
    const q = g.missions.placeXZ('Banco de España');
    if (q) g.city.ensure(q.x, q.z, 64).then(() => { const pl = H.plan(); if (pl && node.isConnected) { img = drawPlan(pl); draw(); } }).catch(() => {});
  }
  return node;
}

// the end of the big mission: the city's new mayor
export function mayor(args, ui) {
  const g = ui.game;
  const node = el(`<div class="screen scrim" data-screen="mayor">
    <div class="panel mayor-panel">
      <div class="mayor-crown" aria-hidden="true">&#9813;</div>
      <h2 class="panel-title" data-i18n="heist.mayorTitle"></h2>
      <p>${esc(t('heist.mayorText', { name: g.profile.name || t('heist.you') }))}</p>
      ${args.paid ? `<p class="mayor-paid">${esc(t('heist.mayorPaid', { n: Number(args.paid).toLocaleString() }))}</p>` : `<p class="faint small">${esc(t('heist.mayorGuest'))}</p>`}
      <button class="btn primary" data-act="close" data-i18n="heist.mayorOk"></button>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  g.audio.sfx('victory');
  // fireworks over the bank
  const pl = g.heist && g.heist.plan();
  if (pl) {
    const q = bankPoint(pl.P, pl.depth / 2, pl.mid);
    for (let i = 0; i < 6; i++) setTimeout(() => g.entities.particles.emit(q.x + (Math.random() - 0.5) * 20, pl.P.base + 22 + Math.random() * 8, q.z + (Math.random() - 0.5) * 20, Math.random(), 0.8, Math.random(), 40, 6, 1.4), i * 350);
  }
  return node;
}
