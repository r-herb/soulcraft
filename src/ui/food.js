// Food shops and restaurants. A shop sells ingredients at fixed prices (cook
// them at the workbench: the recipes are listed here); a restaurant serves a
// dish to eat on the spot, dearer than cooking it yourself.
import { t, applyI18n } from '../i18n/index.js';
import { SVG, iconInto } from './icons.js';
import { slotEl, itemName } from './hud.js';
import { account, econ, wallet } from '../save/account.js';
import { RECIPES } from '../player/crafting.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DISHES = ['espetos', 'gazpacho', 'paella', 'churros'];

function frame(name, title, ui) {
  const node = el(`<div class="screen scrim" data-screen="${name}">
    <div class="panel bank-panel">
      <div class="panel-head"><h2 class="panel-title">${esc(title)}</h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="bank-wallet row"></div>
      <div class="panel-body bank-body"><p class="faint" data-i18n="common.loading"></p></div>
      <p class="form-error" role="alert"></p>
    </div></div>`);
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  applyI18n(node);
  const walletEl = node.querySelector('.bank-wallet');
  const drawWallet = () => {
    walletEl.innerHTML = wallet.cash === null ? '' : `<span class="stat-chip coin-chip"><span class="coin-ico"></span>${esc(t('econ.cash'))}: <b data-v="cash">${wallet.cash}</b></span>`;
    const ico = walletEl.querySelector('.coin-ico');
    if (ico) iconInto(ico, 'coin', 14);
  };
  return { node, body: node.querySelector('.bank-body'), errEl: node.querySelector('.form-error'), drawWallet };
}

// load prices (and the wallet); null for guests, who cannot pay
async function prices(f) {
  if (!account.user || !account.available) { f.body.innerHTML = `<p class="faint">${esc(t('food.signIn'))}</p>`; return null; }
  try { return await econ.state(); } catch { f.body.innerHTML = `<p class="faint">${esc(t('econ.err'))}</p>`; return null; }
}
const failText = (e) => (e && e.code === 'no_money' ? t('econ.noMoney') : t('econ.err'));

export function foodShop(args, ui) {
  const g = ui.game;
  const f = frame('foodShop', t('food.shop'), ui);
  let state = null, busy = false;
  const recipeText = (id) => {
    const r = RECIPES.find((x) => x.id === id);
    if (!r) return '';
    const need = {};
    r.rows.flat().filter(Boolean).forEach((k) => { need[k] = (need[k] || 0) + 1; });
    return `<div class="food-recipe"><b>${esc(itemName(id))}${r.count > 1 ? ` x${r.count}` : ''}</b> <span class="faint">${esc(Object.entries(need).map(([k, n]) => `${n}x ${itemName(k)}`).join(', '))}</span></div>`;
  };
  const draw = () => {
    f.drawWallet();
    if (!state) return;
    f.body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('food.shopInfo'))}</p><div class="bank-goods"></div>
      <h3 class="section-label">${esc(t('food.recipes'))}</h3><div class="food-recipes">${DISHES.map(recipeText).join('')}</div>`;
    const list = f.body.querySelector('.bank-goods');
    for (const [item, price] of Object.entries(state.shop)) {
      const row = el(`<div class="bank-row" data-item="${esc(item)}"><div class="bank-slot"></div>
        <div class="bank-name"><b>${esc(itemName(item))}</b><span class="faint small">${esc(t('econ.have', { n: g.inventory.count(item) }))}</span></div>
        <div class="bank-acts"><button class="btn small primary" data-q="1" ${wallet.cash >= price ? '' : 'disabled'}>${esc(t('econ.buyFor', { p: price }))}</button>
        <button class="btn small" data-q="5" ${wallet.cash >= price * 5 ? '' : 'disabled'}>${esc(t('food.buyFive', { p: price * 5 }))}</button></div></div>`);
      row.querySelector('.bank-slot').appendChild(slotEl({ item, count: 1 }));
      row.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', async () => {
        ui.click();
        if (busy) return;
        busy = true; f.errEl.textContent = '';
        const qty = Number(b.dataset.q);
        try {
          const r = await econ.pay('shop', { item, qty });
          g.giveItem(item, qty);
          ui.toast(t('food.bought', { q: qty, item: itemName(item), n: r.total }), 'ok');
        } catch (e) { f.errEl.textContent = failText(e); }
        busy = false;
        draw();
      }));
      list.appendChild(row);
    }
  };
  prices(f).then((s) => { if (s) { state = s; draw(); } });
  f.drawWallet();
  return f.node;
}

export function restaurant(args, ui) {
  const g = ui.game;
  const f = frame('restaurant', t('food.restaurant'), ui);
  let state = null, busy = false;
  const draw = () => {
    f.drawWallet();
    if (!state) return;
    f.body.innerHTML = `<p class="faint small" style="margin:0 0 var(--sp-2)">${esc(t('food.restaurantInfo'))}</p><div class="bank-goods"></div>`;
    const list = f.body.querySelector('.bank-goods');
    for (const [item, m] of Object.entries(state.menu)) {
      const row = el(`<div class="bank-row" data-item="${esc(item)}"><div class="bank-slot"></div>
        <div class="bank-name"><b>${esc(itemName(item))}</b><span class="faint small">${esc(t('food.dish.' + item))}</span></div>
        <div class="bank-acts"><button class="btn small primary" data-a="eat" ${wallet.cash >= m.price ? '' : 'disabled'}>${esc(t('food.eatFor', { p: m.price }))}</button></div></div>`);
      row.querySelector('.bank-slot').appendChild(slotEl({ item, count: 1 }));
      row.querySelector('[data-a="eat"]').addEventListener('click', async () => {
        ui.click();
        if (busy) return;
        f.errEl.textContent = '';
        if (!g.hungry()) { f.errEl.textContent = t('food.full'); return; }
        busy = true;
        try {
          await econ.pay('meal', { item });
          g.feed(m.food);
          ui.toast(t('food.ate', { item: itemName(item) }), 'ok');
        } catch (e) { f.errEl.textContent = failText(e); }
        busy = false;
        draw();
      });
      list.appendChild(row);
    }
  };
  prices(f).then((s) => { if (s) { state = s; draw(); } });
  f.drawWallet();
  return f.node;
}
