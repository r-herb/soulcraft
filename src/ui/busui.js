// A bus stop's timetable panel: the lines that stop here, where they go,
// and when the next buses come (Malaga time), with a button that shows the
// lines on the map - and the ticket machine: a single ride or a bonobús
// card of ten rides (coins for signed-in players; guests ride free).
import { t } from '../i18n/index.js';
import { SVG } from './icons.js';
import { clock } from '../world/bus.js';
import { TICKETS } from '../../server/goods.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function busStop(args, ui) {
  const g = ui.game;
  const net = g.buses && g.buses.net;
  if (!net) return null;
  // the stop nearest to the sign
  let best = -1, bd = 1e9;
  net.stops.forEach((s, i) => { const d = Math.hypot(s.x - args.x, s.z - args.z); if (d < bd) { bd = d; best = i; } });
  const stop = net.stops[best];
  const now = net.now();
  const rows = net.arrivals(best, now).map(({ line, times }) => `
    <div class="bus-row">
      <span class="bus-ref" style="background:${esc(line.colour)}">${esc(line.ref)}</span>
      <span class="bus-to">${esc(line.to || line.name)}</span>
      <span class="bus-times">${times.length ? times.map((x, k) => `<b class="${k ? 'faint' : ''}">${x.in <= 0 ? esc(t('bus.now')) : x.in > 90 ? esc(x.at) : `${esc(t('bus.inMin', { n: x.in }))} <small>${esc(x.at)}</small>`}</b>`).join('') : `<span class="faint">${esc(t('bus.noMore'))}</span>`}</span>
    </div>`).join('');
  const node = el(`<div class="screen scrim" data-screen="busStop">
    <div class="panel bus-panel">
      <div class="panel-head"><h2 class="panel-title">${esc(stop.name || t('bus.stop'))}</h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <p class="faint" style="margin:0">${esc(t('bus.stopInfo', { ref: stop.ref || '-', time: clock(now) }))}</p>
      <div class="bus-list">${rows || `<p class="faint">${esc(t('bus.noLines'))}</p>`}</div>
      <div class="bus-tickets"><div><b>${esc(t('bus.machine'))}</b> <span class="faint small" data-v="tickets"></span></div><div class="row" data-v="buy"></div></div>
      <p class="faint" style="margin:0">${esc(t('bus.howTo'))}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn" data-act="map" data-i18n="bus.showMap"></button></div>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  node.querySelector('[data-act="map"]').addEventListener('click', () => { ui.click(); ui.open('worldMap', { busStop: best }); });
  // the ticket machine
  const bm = g.buses;
  const have = node.querySelector('[data-v="tickets"]'), buy = node.querySelector('[data-v="buy"]');
  let busy = false;
  const draw = () => {
    if (!bm.pays) { have.textContent = t('bus.freeShort'); buy.innerHTML = ''; return; }
    have.textContent = t('bus.ticketsLeft', { n: bm.tickets });
    buy.innerHTML = Object.entries(TICKETS).map(([k, v]) => `<button class="btn small ${k === 'bonobus' ? 'primary' : ''}" data-kind="${k}">${esc(t('bus.ticket.' + k, { p: v.price, n: v.rides }))}</button>`).join('');
    buy.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', async () => {
      ui.click();
      if (busy) return;
      busy = true;
      try { await bm.buyTickets(b.dataset.kind); g.audio.sfx('trade'); ui.toast(t('bus.ticketBought', { n: bm.tickets }), 'ok'); }
      catch (e) { ui.toast(e && (e.code === 'no_money' || e.code === 'frozen') ? t('econ.noMoney') : t('econ.err'), 'warn'); }
      busy = false;
      draw();
    }));
  };
  draw();
  return node;
}
