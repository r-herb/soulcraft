// The bank. A cash machine (an ATM on the street) only pays out and takes in
// coins: the bank account. The counter in the central bank (the Banco de
// España building) has everything: the exchange (sell goods from the
// backpack for coins, buy them back), the players' market, the account, the
// lottery and the city (the gold reserve and the coins in circulation).
// Prices come from the server and move with what players sell and buy.
import { t, getLang, applyI18n } from '../i18n/index.js';
import { SVG, iconInto } from './icons.js';
import { slotEl, itemName } from './hud.js';
import { ITEMS } from '../player/items.js';
import { account, econ, wallet } from '../save/account.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n || 0).toLocaleString(getLang());
// "3 h 20 min" until the month ends
const untilText = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? t('econ.inHours', { h: Math.floor(m / 60), m: m % 60 }) : t('econ.inMinutes', { m }); };

export function bank(args, ui) {
  const g = ui.game;
  const node = el(`<div class="screen scrim" data-screen="bank">
    <div class="panel bank-panel">
      <div class="panel-head"><h2 class="panel-title" data-i18n="${args.atm ? 'econ.atm' : 'econ.title'}"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="bank-wallet row"></div>
      <div class="seg bank-tabs"><button data-tab="exchange" data-i18n="econ.tabExchange"></button><button data-tab="market" data-i18n="econ.tabMarket"></button><button data-tab="bank" data-i18n="econ.tabBank"></button><button data-tab="lottery" data-i18n="econ.tabLottery"></button><button data-tab="central" data-i18n="econ.tabCity"></button></div>
      <div class="panel-body bank-body"><p class="faint" data-i18n="common.loading"></p></div>
      <p class="form-error" role="alert"></p>
    </div></div>`);
  const body = node.querySelector('.bank-body'), errEl = node.querySelector('.form-error');
  const walletEl = node.querySelector('.bank-wallet');
  let tab = args.atm ? 'bank' : args.tab || 'exchange', state = null, history = null, busy = false;
  if (args.atm) node.querySelector('.bank-tabs').classList.add('hidden');
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);

  const fail = (e) => {
    const c = e && e.code;
    if (c === 'daily_cap') { errEl.textContent = t('econ.dailyCap', { n: e.data.left }); return; }
    if (c === 'frozen') { errEl.textContent = t('econ.frozen', { until: new Date(e.data.until).toLocaleString(getLang()) }); return; }
    errEl.textContent = c === 'no_money' ? t('econ.noMoney') : c === 'no_stock' ? t('econ.noStock') : c === 'too_many' || c === 'gone' || c === 'no_items' ? t('econ.' + c) : t('econ.err');
  };
  const drawWallet = () => {
    walletEl.innerHTML = wallet.cash === null ? '' : `<span class="stat-chip coin-chip"><span class="coin-ico"></span>${esc(t('econ.cash'))}: <b data-v="cash">${num(wallet.cash)}</b></span>
      <span class="stat-chip coin-chip bank-bal">${esc(t('econ.bankBal'))}: <b data-v="bank">${num(wallet.bank)}</b></span>`;
    const ico = walletEl.querySelector('.coin-ico');
    if (ico) iconInto(ico, 'coin', 14);
  };

  async function act(fn) {
    if (busy) return;
    busy = true; errEl.textContent = '';
    try { await fn(); } catch (e) { fail(e); }
    busy = false;
    try { state = await econ.state(); } catch { /* keep the old one */ }
    history = null;
    draw();
  }

  function drawExchange() {
    if (g.creative) { body.innerHTML = `<p class="faint">${esc(t('econ.creative'))}</p>`; return; }
    body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('econ.exchangeInfo'))}</p><div class="bank-goods"></div>`;
    const list = body.querySelector('.bank-goods');
    for (const gd of state.goods) {
      const have = g.inventory.count(gd.item);
      const trend = gd.supply < 0 ? 'up' : gd.supply > 0 ? 'down' : ''; // players sold it: cheaper
      const row = el(`<div class="bank-row" data-item="${esc(gd.item)}">
        <div class="bank-slot"></div>
        <div class="bank-name"><b>${esc(itemName(gd.item))}</b><span class="faint small">${esc(t('econ.have', { n: have }))}${trend ? ` <span class="trend ${trend}">${trend === 'up' ? '&#9650;' : '&#9660;'}</span>` : ''}</span></div>
        <div class="bank-acts">
          <button class="btn small" data-a="sell" ${have ? '' : 'disabled'}>${esc(t('econ.sellFor', { p: gd.sell }))}</button>
          ${have > 1 ? `<button class="btn small" data-a="sellAll">${esc(t('econ.sellAll', { n: have }))}</button>` : ''}
          <button class="btn small primary" data-a="buy" ${wallet.cash >= gd.buy ? '' : 'disabled'}>${esc(t('econ.buyFor', { p: gd.buy }))}</button>
        </div></div>`);
      row.querySelector('.bank-slot').appendChild(slotEl({ item: gd.item, count: 1 }));
      row.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
        ui.click();
        const a = b.dataset.a;
        act(async () => {
          if (a === 'buy') {
            const r = await econ.trade('buy', gd.item, 1);
            g.giveItem(gd.item, 1);
            ui.toast(t('econ.bought', { item: itemName(gd.item), n: r.total }), 'ok');
            return;
          }
          const qty = a === 'sellAll' ? g.inventory.count(gd.item) : 1;
          if (!qty || !g.inventory.remove(gd.item, qty)) throw Object.assign(new Error('no_items'), { code: 'no_items' });
          try {
            const r = await econ.trade('sell', gd.item, qty);
            ui.toast(t('econ.sold', { item: itemName(gd.item), q: qty, n: r.total }), 'ok');
            g.audio && g.audio.sfx && g.audio.sfx('pickup');
          } catch (e) { g.giveItem(gd.item, qty); throw e; }
        });
      }));
      list.appendChild(row);
    }
  }

  function drawBank() {
    body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t(args.atm ? 'econ.atmInfo' : 'econ.bankInfo'))}</p>
      ${args.atm ? `<div class="atm-quick" role="group" aria-label="${esc(t('econ.withdraw'))}">${[10, 20, 50, 100].map((n) => `<button class="btn" data-q="${n}" ${wallet.bank >= n ? '' : 'disabled'}>${esc(t('econ.cashOut', { n }))}</button>`).join('')}</div>` : ''}
      <div class="bank-move">
        <label class="setting-label" for="bank-amount">${esc(t('econ.amount'))}</label>
        <input id="bank-amount" class="input" type="number" min="1" step="1" inputmode="numeric" value="10">
        <div class="row"><button class="btn primary" data-a="deposit">${esc(t('econ.deposit'))}</button><button class="btn" data-a="withdraw">${esc(t('econ.withdraw'))}</button></div>
        <div class="row"><button class="btn small ghost" data-a="depositAll">${esc(t('econ.depositAll'))}</button><button class="btn small ghost" data-a="withdrawAll">${esc(t('econ.withdrawAll'))}</button></div>
      </div>
      <h3 class="section-label">${esc(t('econ.history'))}</h3><div class="bank-history faint small">${esc(t('common.loading'))}</div>`;
    const inp = body.querySelector('input');
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    // the cash machine's quick amounts: the coins come out of the slot
    body.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
      ui.click();
      const amount = Number(b.dataset.q);
      act(async () => { await econ.move('withdraw', amount); g.audio.sfx('pickup'); ui.toast(t('econ.atmPaid', { n: amount }), 'ok'); });
    }));
    body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      ui.click();
      const a = b.dataset.a;
      const side = a.startsWith('deposit') ? 'deposit' : 'withdraw';
      const amount = a === 'depositAll' ? wallet.cash : a === 'withdrawAll' ? wallet.bank : Math.floor(Number(inp.value) || 0);
      if (!(amount > 0)) { errEl.textContent = t('econ.noMoney'); return; }
      act(async () => { await econ.move(side, amount); if (side === 'deposit') g.missions.event('deposit'); ui.toast(t(side === 'deposit' ? 'econ.deposited' : 'econ.withdrawn', { n: amount }), 'ok'); });
    }));
    drawHistory();
  }

  async function drawHistory() {
    const box = body.querySelector('.bank-history');
    if (!box) return;
    if (!history) { try { history = (await econ.history()).history; } catch { history = []; } }
    if (!box.isConnected) return;
    box.innerHTML = history.length ? history.map((h) => `<div class="bank-h"><span>${esc(t('econ.h.' + h.kind, { q: h.qty || 0, item: h.item ? itemName(h.item) : '' }))}</span><b class="${h.amount < 0 || h.kind === 'deposit' ? '' : 'plus'}">${h.kind === 'deposit' || h.kind === 'withdraw' ? num(h.amount) : (h.amount > 0 ? '+' : '') + num(h.amount)}</b><span class="faint">${esc(new Date(h.at).toLocaleDateString(getLang()))}</span></div>`).join('') : esc(t('econ.noHistory'));
  }

  // the players' market: offers from everyone, and a form to offer from the backpack
  let offers = null;
  async function drawMarket() {
    if (g.creative) { body.innerHTML = `<p class="faint">${esc(t('econ.creative'))}</p>`; return; }
    const own = new Map();
    for (const s of g.inventory.slots) if (s && ITEMS[s.item] && !ITEMS[s.item].currency) own.set(s.item, (own.get(s.item) || 0) + s.count);
    body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('econ.marketInfo'))}</p>
      <form class="market-new row" novalidate>
        <select class="input" id="mk-item">${[...own].map(([k, n]) => `<option value="${esc(k)}">${esc(itemName(k))} (${n})</option>`).join('')}</select>
        <input class="input" id="mk-qty" type="number" min="1" value="1" inputmode="numeric" aria-label="${esc(t('econ.qty'))}" title="${esc(t('econ.qty'))}">
        <input class="input" id="mk-price" type="number" min="1" value="10" inputmode="numeric" aria-label="${esc(t('econ.price'))}" title="${esc(t('econ.price'))}">
        <button class="btn primary" type="submit" ${own.size ? '' : 'disabled'}>${esc(t('econ.offer'))}</button>
      </form>
      <div class="bank-goods market-list"><p class="faint">${esc(t('common.loading'))}</p></div>`;
    const form = body.querySelector('form');
    form.addEventListener('keydown', (e) => e.stopPropagation());
    form.addEventListener('submit', (ev) => {
      ev.preventDefault(); ui.click();
      const item = form.querySelector('#mk-item').value, qty = Math.floor(Number(form.querySelector('#mk-qty').value) || 0), price = Math.floor(Number(form.querySelector('#mk-price').value) || 0);
      if (!item || qty < 1 || price < 1) return;
      act(async () => {
        if (g.inventory.count(item) < qty || !g.inventory.remove(item, qty)) throw Object.assign(new Error('no_items'), { code: 'no_items' });
        try { await econ.offer(item, qty, price); } catch (e) { g.giveItem(item, qty); throw e; }
        offers = null;
        ui.toast(t('econ.offered', { q: qty, item: itemName(item), p: price }), 'ok');
      });
    });
    if (!offers) { try { offers = (await econ.offers()).offers; } catch { offers = []; } }
    const list = body.querySelector('.market-list');
    if (!list) return;
    const shown = offers.filter((o) => ITEMS[o.item]);
    list.innerHTML = shown.length ? '' : `<p class="faint">${esc(t('econ.noOffers'))}</p>`;
    for (const o of shown) {
      const row = el(`<div class="bank-row" data-offer="${o.id}"><div class="bank-slot"></div>
        <div class="bank-name"><b>${o.qty}x ${esc(itemName(o.item))}</b><span class="faint small">${esc(o.mine ? t('econ.yourOffer') : t('econ.from', { name: o.name }))}</span></div>
        <div class="bank-acts">${o.mine ? `<button class="btn small" data-a="cancel">${esc(t('econ.takeBack'))}</button>` : `<button class="btn small primary" data-a="buy" ${wallet.cash >= o.price ? '' : 'disabled'}>${esc(t('econ.buyFor', { p: o.price }))}</button>`}</div></div>`);
      row.querySelector('.bank-slot').appendChild(slotEl({ item: o.item, count: o.qty }));
      row.querySelector('[data-a]').addEventListener('click', (ev) => {
        ui.click();
        const a = ev.currentTarget.dataset.a;
        act(async () => {
          offers = null;
          const r = a === 'buy' ? await econ.buyOffer(o.id) : await econ.cancelOffer(o.id);
          g.giveItem(r.item, r.qty);
          ui.toast(t(a === 'buy' ? 'econ.boughtOffer' : 'econ.tookBack', { q: r.qty, item: itemName(r.item) }), 'ok');
        });
      });
      list.appendChild(row);
    }
  }

  function drawLottery() {
    const L = state.lottery;
    const left = Math.max(0, L.max - L.mine);
    body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('econ.lotteryInfo', { p: L.ticket, max: L.max }))}</p>
      <div class="bank-stats">
        <div class="bank-stat"><span class="faint">${esc(t('econ.pot'))}</span><b data-v="pot">${num(L.pot)}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.yourTickets'))}</span><b data-v="mine">${L.mine} / ${L.max}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.allTickets'))}</span><b>${num(L.tickets)}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.drawIn'))}</span><b>${esc(untilText(state.date.endsIn))}</b></div>
      </div>
      <div class="row" style="margin-top:var(--sp-2)"><button class="btn primary" data-n="1" ${left && wallet.cash >= L.ticket ? '' : 'disabled'}>${esc(t('econ.buyTicket', { p: L.ticket }))}</button>
        <button class="btn" data-n="5" ${left >= 5 && wallet.cash >= L.ticket * 5 ? '' : 'disabled'}>${esc(t('econ.buyTickets', { n: 5, p: L.ticket * 5 }))}</button></div>
      <p class="faint small">${L.last ? esc(L.last.you ? t('econ.lastYou', { pot: L.last.pot }) : t('econ.lastDraw', { name: L.last.winner || '?', pot: L.last.pot, n: L.last.tickets })) : esc(t('econ.noDraw'))}</p>`;
    body.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
      ui.click();
      const n = Number(b.dataset.n);
      act(async () => { await econ.lottery(n); ui.toast(t('econ.ticketsBought', { n }), 'ok'); });
    }));
  }

  function drawCentral() {
    const c = state.central;
    const backing = c.money > 0 ? Math.round((c.gold * c.goldPrice / c.money) * 100) : 100;
    const D = state.date, S = state.salary;
    body.innerHTML = `<div class="bank-date"><b>${esc(t('cal.date', { day: D.day, month: t('cal.m' + D.month), year: D.year }))}</b> <span class="faint">${String(D.hour).padStart(2, '0')}:${String(D.minute).padStart(2, '0')}</span></div>
      <p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('cal.info'))}</p>
      <h3 class="section-label">${esc(t('econ.salary'))}</h3>
      <div class="bank-stats">
        <div class="bank-stat wide"><span class="faint">${esc(t('econ.salarySoFar'))}</span><b data-v="salary">${num(S.earned)} / ${num(S.cap)}</b><div class="bank-meter"><i style="width:${Math.min(100, (S.earned / S.cap) * 100)}%"></i></div>
          <span class="faint small">${esc(t('econ.salaryParts', { d: S.quests.daily, b: S.quests.boss, q: S.quests.treasure }))}</span></div>
      </div>
      <p class="faint small">${esc(t('econ.salaryInfo', { d: S.pay.daily, b: S.pay.boss, q: S.pay.treasure, in: untilText(D.endsIn) }))}${S.last ? ' ' + esc(t('econ.lastSalary', { n: S.last.amount })) : ''}</p>
      <h3 class="section-label">${esc(t('econ.tabCentral'))}</h3>
      <p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('econ.centralInfo'))}</p>
      <div class="bank-stats">
        <div class="bank-stat"><span class="faint">${esc(t('econ.gold'))}</span><b data-v="gold">${esc(t('econ.goldBars', { n: num(c.gold) }))}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.goldPrice'))}</span><b>${num(c.goldPrice)}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.money'))}</span><b data-v="money">${num(c.money)}</b></div>
        <div class="bank-stat"><span class="faint">${esc(t('econ.holders'))}</span><b>${num(c.holders)}</b></div>
        <div class="bank-stat wide"><span class="faint">${esc(t('econ.backing'))}</span><b>${backing}%</b><div class="bank-meter"><i style="width:${Math.min(100, backing)}%"></i></div></div>
      </div>
      <p class="faint small">${esc(t('econ.fare', { n: state.fare }))}</p>`;
  }

  function draw() {
    node.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    drawWallet();
    if (!state) return;
    if (state.frozen && !errEl.textContent) errEl.textContent = t('econ.frozen', { until: new Date(state.frozen.until).toLocaleString(getLang()) }) + (state.frozen.reason ? ` (${state.frozen.reason})` : '');
    if (tab === 'exchange') drawExchange(); else if (tab === 'market') drawMarket(); else if (tab === 'bank') drawBank(); else if (tab === 'lottery') drawLottery(); else drawCentral();
  }
  node.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { ui.click(); tab = b.dataset.tab; errEl.textContent = ''; draw(); }));

  if (!account.user || !account.available) {
    body.innerHTML = `<p class="faint">${esc(t('econ.signIn'))}</p>`;
    node.querySelector('.bank-tabs').classList.add('hidden');
  } else {
    econ.state().then((r) => { state = r; draw(); }).catch(() => { body.innerHTML = `<p class="faint">${esc(t('econ.err'))}</p>`; });
  }
  draw();
  return node;
}
