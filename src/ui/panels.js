// Panels: inventory + crafting + recipe book, villager trading, soul shop
// with skins, the boss progression map, and the victory screen.
import { t } from '../i18n/index.js';
import { SVG, iconInto } from './icons.js';
import { slotEl, fillSlot, itemName } from './hud.js';
import { RECIPES, matchRecipe, canAfford, recipeNeeds } from '../player/crafting.js';
import { ITEMS, maxStack } from '../player/items.js';
import { SKINS, drawSkinPortrait } from '../entities/models.js';
import { saveProfile } from '../save/db.js';
import { BOSS_ORDER } from '../bosses/bosses.js';
import { ARENAS } from '../world/structures.js';
import { FRIEND_XP } from '../entities/villager.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function head(titleHtml) {
  return `<div class="panel-head"><h2 class="panel-title">${titleHtml}</h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>`;
}

function describe(key) {
  const d = ITEMS[key];
  if (!d) return '';
  const parts = [];
  if (d.food) parts.push(t('desc.food', { n: d.food }));
  if (d.damage && (d.weapon || d.tool)) parts.push(t('desc.damage', { n: d.damage / 2 }));
  const extra = t('desc.' + key);
  if (extra !== 'desc.' + key) parts.push(extra);
  return parts.join(' ');
}

// ---------------- Inventory & crafting ----------------
export function inventory(args, ui) {
  const g = ui.game;
  const inv = g.inventory;
  let picked = null; // { from: 'slots'|'grid', i }
  let filter = 'all';
  const node = el(`<div class="screen scrim" data-screen="inventory">
    <div class="panel inv-panel">
      ${head(esc(t('inv.title')))}
      <div class="inv-layout">
        <div class="col" style="min-height:0">
          <div class="craft-area">
            <div class="craft-grid"></div>
            <span class="arrow-right">&#9654;</span>
            <div class="col" style="align-items:center"><div class="slot result" data-result></div><span class="faint crystal-cost"></span></div>
            <button class="btn small ghost" data-act="clear" data-i18n="inv.clear"></button>
          </div>
          <div class="item-info"></div>
          <div class="inv-grid main"></div>
          <div class="inv-grid hot"></div>
        </div>
        <div class="col" style="min-height:0">
          <div class="row"><span class="section-label" style="flex:1" data-i18n="inv.recipes"></span>
            <div class="seg" style="min-width:150px"><button data-f="all" class="on" data-i18n="inv.all"></button><button data-f="can" data-i18n="inv.craftable"></button></div></div>
          <div class="recipe-list"></div>
        </div>
      </div>
    </div></div>`);
  const gridEl = node.querySelector('.craft-grid');
  const mainEl = node.querySelector('.inv-grid.main');
  const hotEl = node.querySelector('.inv-grid.hot');
  const resultEl = node.querySelector('[data-result]');
  const info = node.querySelector('.item-info');
  const listEl = node.querySelector('.recipe-list');
  const costEl = node.querySelector('.crystal-cost');

  const setInfo = (key, extra = '') => {
    info.innerHTML = key ? `<b>${esc(itemName(key))}</b> <span>${esc(describe(key))}</span> ${extra}` : `<span class="faint">${esc(t('inv.hint'))}</span>`;
  };

  const getArr = (from) => (from === 'grid' ? inv.grid : inv.slots);
  const tapSlot = (from, i) => {
    ui.click();
    const arr = getArr(from);
    if (!picked) {
      if (arr[i]) { picked = { from, i }; setInfo(arr[i].item); }
    } else {
      const src = getArr(picked.from);
      const a = src[picked.i], b = arr[i];
      if (picked.from === from && picked.i === i) { picked = null; draw(); return; }
      if (from === 'grid' && a && !b) {
        // place a single item into the crafting grid
        arr[i] = { item: a.item, count: 1 };
        a.count--; if (a.count <= 0) src[picked.i] = null;
        if (!src[picked.i]) picked = null;
      } else if (b && a && b.item === a.item && maxStack(a.item) > 1) {
        const k = Math.min(a.count, maxStack(b.item) - b.count);
        b.count += k; a.count -= k;
        if (a.count <= 0) src[picked.i] = null;
        picked = null;
      } else {
        src[picked.i] = b; arr[i] = a;
        picked = null;
      }
      inv.changed();
    }
    draw();
  };

  const draw = () => {
    gridEl.innerHTML = ''; mainEl.innerHTML = ''; hotEl.innerHTML = '';
    inv.grid.forEach((s, i) => { const e = slotEl(s); if (picked && picked.from === 'grid' && picked.i === i) e.classList.add('picked'); e.addEventListener('click', () => tapSlot('grid', i)); gridEl.appendChild(e); });
    for (let i = 9; i < 36; i++) { const e = slotEl(inv.slots[i]); if (picked && picked.from === 'slots' && picked.i === i) e.classList.add('picked'); e.addEventListener('click', () => tapSlot('slots', i)); mainEl.appendChild(e); }
    for (let i = 0; i < 9; i++) { const e = slotEl(inv.slots[i]); if (i === inv.selected) e.classList.add('selected'); if (picked && picked.from === 'slots' && picked.i === i) e.classList.add('picked'); e.addEventListener('click', () => tapSlot('slots', i)); hotEl.appendChild(e); }
    const rec = matchRecipe(inv.grid);
    fillSlot(resultEl, rec ? { item: rec.out, count: rec.count } : null);
    costEl.innerHTML = rec && rec.crystals ? `<span class="crystal-ico"></span>${rec.crystals}` : '';
    resultEl.classList.toggle('disabled', !!(rec && rec.crystals && g.profile.crystals < rec.crystals));
    drawRecipes();
  };

  const drawRecipes = () => {
    listEl.innerHTML = '';
    for (const rec of RECIPES) {
      const ok = canAfford(rec, { count: (k) => inv.count(k) + inv.grid.reduce((n, s) => n + (s && s.item === k ? s.count : 0), 0) }, g.profile.crystals);
      if (filter === 'can' && !ok) continue;
      const s = slotEl({ item: rec.out, count: rec.count });
      s.dataset.recipe = rec.id;
      if (!ok) s.classList.add('no');
      s.addEventListener('click', () => {
        ui.click();
        const need = recipeNeeds(rec);
        const needTxt = Object.entries(need).map(([k, n]) => `${n}x ${itemName(k)}`).join(', ') + (rec.crystals ? ', ' + t('inv.costCrystals', { n: rec.crystals }) : '');
        if (!ok) { setInfo(rec.out, `<br><span class="faint">${esc(t('inv.missing'))}: ${esc(needTxt)}</span>`); return; }
        picked = null;
        inv.autofill(rec);
        draw();
        setInfo(rec.out, `<br><span class="faint">${esc(needTxt)}</span>`);
      });
      listEl.appendChild(s);
    }
  };

  resultEl.addEventListener('click', () => {
    const rec = matchRecipe(inv.grid);
    if (!rec) return;
    if (rec.crystals && g.profile.crystals < rec.crystals) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
    if (rec.crystals) g.profile.crystals -= rec.crystals;
    for (let i = 0; i < 9; i++) if (inv.grid[i]) { inv.grid[i].count--; if (inv.grid[i].count <= 0) inv.grid[i] = null; }
    g.giveItem(rec.out, rec.count);
    if (rec.out === 'void_lantern') { g.meta.hasLantern = true; ui.tutorialDone('map'); }
    g.audio.sfx('craft');
    ui.toast(t('toast.crafted', { item: itemName(rec.out) }), 'ok');
    // keep crafting the same thing quickly: refill if possible
    if (!inv.grid.some(Boolean) && canAfford(rec, inv, g.profile.crystals)) inv.autofill(rec);
    draw();
  });
  node.querySelector('[data-act="clear"]').addEventListener('click', () => { ui.click(); inv.returnGrid(); picked = null; draw(); });
  node.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    ui.click(); filter = b.dataset.f;
    node.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b));
    drawRecipes();
  }));
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); inv.returnGrid(); ui.closeAll(); });
  setInfo(null);
  draw();
  return node;
}

// ---------------- Trading ----------------
export function trade(args, ui) {
  const g = ui.game;
  const v = args.villager;
  const node = el(`<div class="screen scrim" data-screen="trade">
    <div class="panel" style="width:min(640px,100%)">
      ${head(esc(t('trade.title', { name: v.name })))}
      <div class="row"><span class="faint">${esc(t('villager.greeting'))}</span><span style="flex:1"></span><span class="setting-label">${esc(t('trade.friendship'))}</span><div class="friend-bar"></div><span class="value-tag lvl"></span></div>
      <div class="panel-body"><div class="trade-list"></div></div>
      <div class="faint">${esc(t('trade.refresh'))}</div>
    </div></div>`);
  const list = node.querySelector('.trade-list');
  const draw = () => {
    const lvl = v.level;
    node.querySelector('.friend-bar').innerHTML = FRIEND_XP.slice(1).map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    node.querySelector('.lvl').textContent = t('trade.level', { n: lvl });
    list.innerHTML = '';
    v.offers.forEach((o) => {
      const cost = v.cost(o);
      const locked = o.tier > lvl;
      const can = !locked && g.inventory.count(o.give[0]) >= cost;
      const row = el(`<div class="trade-row ${locked ? 'locked' : ''}"><div class="give"></div><span class="arrow-right">&#9654;</span><div class="get"></div><span class="faint nm"></span><button class="btn small ${can ? 'primary' : ''}" ${can ? '' : 'disabled'}></button></div>`);
      row.querySelector('.give').appendChild(slotEl({ item: o.give[0], count: cost }));
      row.querySelector('.get').appendChild(slotEl({ item: o.get[0], count: o.get[1] }));
      row.querySelector('.nm').textContent = locked ? t('trade.locked', { n: o.tier }) : `${cost}x ${itemName(o.give[0])} - ${o.get[1]}x ${itemName(o.get[0])}`;
      const b = row.querySelector('button');
      b.textContent = t('trade.do');
      b.addEventListener('click', () => {
        if (v.trade(o)) { ui.toast(t('toast.traded', { name: v.name }), 'ok'); draw(); }
        else ui.toast(t('trade.cant'), 'warn');
      });
      list.appendChild(row);
    });
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.closeAll(); });
  draw();
  return node;
}

// ---------------- Shop & skins ----------------
export function shop(args, ui) {
  const profile = ui.app.profile;
  const node = el(`<div class="screen ${ui.game && ui.game.running ? 'scrim' : 'solid'}" data-screen="shop">
    <div class="panel" style="width:min(780px,100%);height:100%">
      ${head(esc(t('shop.title')))}
      <div class="row"><span class="stat-chip crystal-chip"><span class="crystal-ico"></span><span class="bal"></span></span><span class="faint" style="flex:1;text-align:right">${esc(t('shop.hint'))}</span></div>
      <div class="shop-layout">
        <div class="col" style="align-items:center"><canvas class="skin-preview" width="200" height="220"></canvas><b class="pv-name"></b><button class="btn primary wide pv-act"></button></div>
        <div class="skin-grid"></div>
      </div>
    </div></div>`);
  let sel = profile.skin;
  const preview = node.querySelector('.skin-preview');
  let angle = 0;
  let raf;
  const drawPreview = () => {
    const x = preview.getContext('2d');
    const tmp = document.createElement('canvas');
    drawSkinPortrait(tmp, sel);
    x.clearRect(0, 0, preview.width, preview.height);
    x.imageSmoothingEnabled = false;
    angle += 0.03;
    const sq = Math.abs(Math.cos(angle)) * 0.35 + 0.65;
    const w = 128 * sq;
    x.drawImage(tmp, (preview.width - w) / 2, 30 + Math.sin(angle * 2) * 3, w, 128 * 1.1);
    raf = requestAnimationFrame(drawPreview);
  };
  const obs = new MutationObserver(() => { if (!node.isConnected) { cancelAnimationFrame(raf); obs.disconnect(); } });
  setTimeout(() => obs.observe(document.getElementById('screens'), { childList: true }), 0);
  const draw = () => {
    node.querySelector('.bal').textContent = profile.crystals;
    const grid = node.querySelector('.skin-grid');
    grid.innerHTML = '';
    for (const s of SKINS) {
      const owned = profile.skins.includes(s.id);
      const card = el(`<button class="skin-card ${s.id === sel ? 'sel' : ''}" data-skin="${s.id}"><canvas></canvas><span class="nm"></span><span class="pr"></span></button>`);
      drawSkinPortrait(card.querySelector('canvas'), s.id);
      card.querySelector('.nm').textContent = t('skin.' + s.id);
      card.querySelector('.pr').innerHTML = profile.skin === s.id ? esc(t('shop.equipped')) : owned ? '&#10003;' : s.price ? `<span class="crystal-ico"></span>${s.price}` : esc(t('shop.free'));
      card.addEventListener('click', () => { ui.click(); sel = s.id; draw(); });
      grid.appendChild(card);
    }
    const s = SKINS.find((k) => k.id === sel);
    const owned = profile.skins.includes(sel);
    node.querySelector('.pv-name').textContent = t('skin.' + sel);
    const b = node.querySelector('.pv-act');
    b.disabled = profile.skin === sel;
    b.innerHTML = profile.skin === sel ? esc(t('shop.equipped')) : owned ? esc(t('shop.equip')) : `${esc(t('shop.buy'))} <span class="crystal-ico"></span>${s.price}`;
    b.onclick = async () => {
      if (!owned) {
        if (profile.crystals < s.price) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
        profile.crystals -= s.price;
        profile.skins.push(s.id);
        ui.toast(t('toast.bought'), 'soul');
        ui.audio.sfx('levelup');
      }
      profile.skin = s.id;
      ui.click();
      if (ui.game && ui.game.held) ui.game.held.setSkin(s.id);
      await saveProfile(profile);
      draw();
    };
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); cancelAnimationFrame(raf); ui.back(); });
  draw();
  drawPreview();
  return node;
}

// ---------------- Soul Map ----------------
const BOSS_ICON = { voidDragon: 'void_scale', shellKing: 'shell_fragment', whirlwindKing: 'whirl_core', emberWarden: 'ember_heart', soulStorm: 'storm_crown' };
export function map(args, ui) {
  const g = ui.game;
  const st = g.realmStatus();
  const node = el(`<div class="screen scrim" data-screen="map">
    <div class="panel map-panel">
      ${head(esc(t('map.title')))}
      <p class="faint" style="margin:0">${esc(t('map.hint'))}</p>
      <div class="map-track"></div>
      <div class="row" style="justify-content:space-between"><span class="faint here"></span><button class="btn" data-act="home" data-i18n="map.home"></button></div>
    </div></div>`);
  const track = node.querySelector('.map-track');
  BOSS_ORDER.forEach((id, i) => {
    if (i) track.appendChild(el('<i class="map-link"></i>'));
    const a = ARENAS[id];
    const s = st[id];
    const realm = id === 'whirlwindKing' ? 'chamber' : a.dim;
    const n = el(`<div class="map-node ${s === 'done' ? 'done' : s === 'ready' ? 'ready' : 'locked'}" data-boss="${id}">
      <div class="glyph"></div><div class="bn"></div><div class="realm"></div><div class="st"></div>
      <button class="btn small ${s === 'ready' ? 'primary' : ''}" ${s === 'locked' ? 'disabled' : ''}></button></div>`);
    iconInto(n.querySelector('.glyph'), BOSS_ICON[id], 56);
    n.querySelector('.bn').textContent = t('boss.' + id);
    n.querySelector('.realm').textContent = t('realm.' + realm);
    n.querySelector('.st').textContent = t(s === 'done' ? 'map.defeated' : s === 'ready' ? 'map.ready' : 'map.locked');
    const b = n.querySelector('button');
    b.textContent = t('map.travel');
    b.addEventListener('click', () => {
      ui.click();
      if (s === 'locked') {
        ui.toast(t(id === 'voidDragon' ? 'toast.needLantern' : 'toast.lockedRealm'), 'warn');
        return;
      }
      ui.closeAll();
      g.travel(a.dim, id === 'whirlwindKing' ? 'chamber' : id);
    });
    track.appendChild(n);
  });
  node.querySelector('.here').textContent = t('map.here') + ': ' + t('realm.' + g.meta.dim);
  const home = node.querySelector('[data-act="home"]');
  home.disabled = g.meta.dim === 'overworld';
  home.addEventListener('click', () => { ui.click(); ui.closeAll(); g.travel('overworld'); });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  return node;
}

// ---------------- Victory ----------------
export function victory(args, ui) {
  const g = ui.game;
  const s = g.meta.stats;
  const mins = Math.floor(g.meta.playTime / 60);
  const time = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  const node = el(`<div class="screen victory" data-screen="victory">
    <div class="panel" style="width:min(560px,100%);text-align:center">
      <h1 class="logo" style="font-size:clamp(18px,4vw,30px)" data-i18n="victory.title"></h1>
      <p class="dim" data-i18n="victory.body"></p>
      <div class="section-label" data-i18n="victory.stats"></div>
      <div class="stats-grid">
        <div><span data-i18n="victory.time"></span><b>${time}</b></div>
        <div><span data-i18n="victory.days"></span><b>${g.meta.day}</b></div>
        <div><span data-i18n="victory.blocksBroken"></span><b>${s.broken}</b></div>
        <div><span data-i18n="victory.blocksPlaced"></span><b>${s.placed}</b></div>
        <div><span data-i18n="victory.enemies"></span><b>${s.kills}</b></div>
        <div><span data-i18n="victory.deaths"></span><b>${s.deaths}</b></div>
        <div><span data-i18n="victory.crystals"></span><b>${s.crystals}</b></div>
      </div>
      <div class="row" style="justify-content:center"><button class="btn primary" data-act="continue" data-i18n="victory.continue"></button><button class="btn" data-act="title" data-i18n="victory.title_screen"></button></div>
    </div></div>`);
  node.querySelector('[data-act="continue"]').addEventListener('click', () => { ui.click(); ui.closeAll(); });
  node.querySelector('[data-act="title"]').addEventListener('click', () => { ui.click(); ui.app.quitToTitle(); });
  return node;
}
