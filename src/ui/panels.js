// Panels: inventory + crafting + recipe book, villager trading, soul shop
// with skins, the boss progression map, and the victory screen.
import { t } from '../i18n/index.js';
import { SVG, iconInto } from './icons.js';
import { slotEl, fillSlot, itemName } from './hud.js';
import { RECIPES, matchRecipe, canAfford, recipeNeeds } from '../player/crafting.js';
import { ITEMS, maxStack } from '../player/items.js';
import { Inventory } from '../player/inventory.js';
import { SKINS, drawSkinPortrait } from '../entities/models.js';
import { PETS, drawPetPortrait } from '../entities/pets.js';
import { daily, taskLabel, rewardFor, ALL_BONUS, currentEvent, dayKey } from '../quest/daily.js';
import { storeProfile } from '../save/account.js';
import { avatarUnlocked } from '../entities/avatar.js';
import { BOSS_ORDER } from '../bosses/bosses.js';
import { ARENAS } from '../world/structures.js';
import { FRIEND_XP } from '../entities/villager.js';
import { LEVELS, LEVEL_COUNT } from '../world/quest.js';

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
  if (d.armor) parts.push(t('desc.armor', { n: d.points, d: d.dura }));
  if (d.shield) parts.push(t('desc.shield', { d: d.dura }));
  const extra = t('desc.' + key);
  if (extra !== 'desc.' + key) parts.push(extra);
  return parts.join(' ');
}

// ---------------- Inventory & crafting ----------------
export function inventory(args, ui) {
  const g = ui.game;
  const inv = g.inventory;
  let picked = null; // { from: 'slots'|'grid', i }
  // creative worlds open on a catalog of every block and item
  let filter = g.creative ? 'catalog' : 'all';
  const node = el(`<div class="screen scrim" data-screen="inventory">
    <div class="panel inv-panel">
      ${head(esc(t('inv.title')))}
      <div class="inv-layout">
        <div class="craft-area inv-craft">
          <div class="craft-grid"></div>
          <span class="arrow-right">&#9654;</span>
          <div class="col" style="align-items:center"><div class="slot result" data-result></div><span class="faint crystal-cost"></span></div>
          <button class="btn small ghost" data-act="clear" data-i18n="inv.clear"></button>
          <div class="inv-armor" aria-label="${esc(t('inv.armor'))}"></div>
        </div>
        <div class="col inv-bag">
          <div class="inv-grid main"></div>
          <div class="inv-grid hot"></div>
          <div class="item-info"></div>
        </div>
        <div class="col inv-recipes" style="min-height:0">
          <div class="row"><span class="section-label" style="flex:1" data-i18n="inv.recipes"></span>
            <div class="seg" style="min-width:150px">${g.creative ? '<button data-f="catalog" class="on" data-i18n="inv.catalog"></button>' : ''}<button data-f="all" class="${g.creative ? '' : 'on'}" data-i18n="inv.all"></button><button data-f="can" data-i18n="inv.craftable"></button></div></div>
          <div class="recipe-list"></div>
        </div>
      </div>
    </div></div>`);
  const gridEl = node.querySelector('.craft-grid');
  const armorEl = node.querySelector('.inv-armor');
  const mainEl = node.querySelector('.inv-grid.main');
  const hotEl = node.querySelector('.inv-grid.hot');
  const resultEl = node.querySelector('[data-result]');
  const info = node.querySelector('.item-info');
  const listEl = node.querySelector('.recipe-list');
  const costEl = node.querySelector('.crystal-cost');

  const setInfo = (key, extra = '') => {
    info.innerHTML = key ? `<b>${esc(itemName(key))}</b> <span>${esc(describe(key))}</span> ${extra}` : `<span class="faint">${esc(t('inv.hint'))}</span>`;
  };

  const getArr = (from) => (from === 'grid' ? inv.grid : from === 'armor' ? inv.armor : inv.slots);
  const tapSlot = (from, i) => {
    ui.click();
    const arr = getArr(from);
    if (!picked) {
      if (arr[i]) { picked = { from, i }; setInfo(arr[i].item); }
    } else {
      const src = getArr(picked.from);
      const a = src[picked.i], b = arr[i];
      if (picked.from === from && picked.i === i) { picked = null; draw(); return; }
      // an armor slot takes only its own kind of piece (and a piece taken off goes where it fits)
      if ((from === 'armor' && Inventory.armorSlot(a.item) !== i) || (picked.from === 'armor' && b && Inventory.armorSlot(b.item) !== picked.i)) { ui.toast(t('inv.armorNo'), 'warn'); picked = null; draw(); return; }
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
    armorEl.innerHTML = '';
    inv.armor.forEach((s, i) => { const e = slotEl(s); if (!s) { e.classList.add('empty-armor'); e.title = t('inv.armor.' + ['head', 'chest', 'legs', 'feet'][i]); } if (picked && picked.from === 'armor' && picked.i === i) e.classList.add('picked'); e.dataset.armor = i; e.addEventListener('click', () => tapSlot('armor', i)); armorEl.appendChild(e); });
    armorEl.insertAdjacentHTML('beforeend', `<span class="armor-pts">${esc(t('hud.armor', { n: inv.armorPoints }))}</span>`);
    const rec = matchRecipe(inv.grid);
    fillSlot(resultEl, rec ? { item: rec.out, count: rec.count } : null);
    costEl.innerHTML = rec && rec.crystals ? `<span class="crystal-ico"></span>${rec.crystals}` : '';
    resultEl.classList.toggle('disabled', !!(rec && rec.crystals && g.profile.crystals < rec.crystals));
    drawRecipes();
  };

  const drawRecipes = () => {
    listEl.innerHTML = '';
    if (filter === 'catalog') {
      for (const it of Object.values(ITEMS)) {
        if (it.currency || it.special === 'treasureMap') continue;
        const s = slotEl({ item: it.key, count: 1 });
        s.dataset.catalog = it.key;
        s.addEventListener('click', () => { ui.click(); g.giveItem(it.key, maxStack(it.key)); setInfo(it.key); draw(); });
        listEl.appendChild(s);
      }
      return;
    }
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
    g.missions.event('craft', { item: rec.out });
    if (rec.out === 'void_lantern') { g.meta.hasLantern = true; ui.tutorialDone('map'); }
    g.audio.sfx('craft');
    g.daily.note('craft');
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
        if (v.trade(o)) { g.daily.note('trade'); ui.toast(t('toast.traded', { name: v.name }), 'ok'); draw(); }
        else ui.toast(t('trade.cant'), 'warn');
      });
      list.appendChild(row);
    });
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.closeAll(); });
  draw();
  // Frostfall: each day the first villager you talk to has a gift
  if (g.event && g.event.id === 'frost' && !g.creative && g.profile.giftDay !== dayKey()) {
    g.profile.giftDay = dayKey();
    g.giveItem(Math.random() < 0.5 ? 'roast' : 'glow_stew', 2);
    g.addCrystals(5);
    setTimeout(() => ui.toast(t('event.frost.gift', { name: v.name }), 'soul'), 300);
  }
  return node;
}

// ---------------- Daily tasks ----------------
export function dailyPanel(args, ui) {
  const g = ui.game;
  const ev = currentEvent();
  const node = el(`<div class="screen scrim" data-screen="daily">
    <div class="panel" style="width:min(560px,100%)">
      ${head(esc(t('daily.title')))}
      ${ev ? `<div class="event-banner ev-${ev.id}"><b>${esc(t('event.' + ev.id))}</b><span>${esc(t('event.' + ev.id + '.desc'))}</span></div>` : ''}
      <p class="faint" style="margin:0">${esc(t('daily.hint', { n: ALL_BONUS }))}</p>
      <div class="panel-body daily-list"></div>
    </div></div>`);
  const list = node.querySelector('.daily-list');
  const draw = () => {
    const d = daily(g.profile);
    list.innerHTML = '';
    d.tasks.forEach((task, i) => {
      const done = task.n >= task.goal;
      const row = el(`<div class="daily-row ${task.claimed ? 'claimed' : done ? 'done' : ''}" data-task="${task.id}">
        <div class="dr-main"><b></b><div class="dr-bar"><i style="width:${Math.round(100 * task.n / task.goal)}%"></i></div><span class="faint">${task.n} / ${task.goal}</span></div>
        <button class="btn small ${done && !task.claimed ? 'primary' : ''}" ${done && !task.claimed ? '' : 'disabled'}>${task.claimed ? '&#10003;' : `<span class="crystal-ico"></span>${rewardFor(task, ev)}`}</button>
      </div>`);
      row.querySelector('b').textContent = taskLabel(task);
      row.querySelector('button').addEventListener('click', async () => {
        const n = g.daily.claim(i);
        if (n) { ui.toast(t('daily.claimed', { n }), 'soul'); await storeProfile(g.profile); draw(); }
      });
      list.appendChild(row);
    });
  };
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.back(); });
  draw();
  return node;
}

// ---------------- Shop & skins ----------------
export function shop(args, ui) {
  const profile = ui.app.profile;
  const node = el(`<div class="screen ${ui.game && ui.game.running ? 'scrim' : 'solid'}" data-screen="shop">
    <div class="panel" style="width:min(780px,100%);height:100%">
      ${head(esc(t('shop.title')))}
      <div class="row"><span class="stat-chip crystal-chip"><span class="crystal-ico"></span><span class="bal"></span></span>
        <div class="seg shop-tabs"><button data-tab="skins" data-i18n="shop.tabSkins"></button><button data-tab="pets" data-i18n="shop.tabPets"></button><button data-tab="avatar" class="tab-new" data-i18n="av.tabShort"></button></div>
        <span class="faint shop-hint" style="flex:1;text-align:right"></span></div>
      <div class="shop-layout">
        <div class="col" style="align-items:center"><canvas class="skin-preview" width="200" height="220"></canvas><b class="pv-name"></b><button class="btn primary wide pv-act"></button></div>
        <div class="skin-grid"></div>
      </div>
    </div></div>`);
  let tab = args.tab || 'skins';
  let sel = profile.skin;
  const avatarOn = () => !!(profile.avatar && profile.avatar.on && avatarUnlocked(profile));
  let selPet = profile.pet || PETS[0].id;
  profile.pets = profile.pets || [];
  const preview = node.querySelector('.skin-preview');
  let angle = 0;
  let raf;
  const drawPreview = () => {
    const x = preview.getContext('2d');
    const tmp = document.createElement('canvas');
    if (tab === 'pets') drawPetPortrait(tmp, selPet); else drawSkinPortrait(tmp, sel);
    x.clearRect(0, 0, preview.width, preview.height);
    x.imageSmoothingEnabled = false;
    angle += 0.03;
    const sq = Math.abs(Math.cos(angle)) * 0.35 + 0.65;
    const w = 128 * sq;
    if (tab === 'pets') x.drawImage(tmp, (preview.width - w * 1.1) / 2, 40 + Math.sin(angle * 2) * 4, w * 1.1, 140);
    else x.drawImage(tmp, (preview.width - w) / 2, 30 + Math.sin(angle * 2) * 3, w, 128 * 1.1);
    raf = requestAnimationFrame(drawPreview);
  };
  const obs = new MutationObserver(() => { if (!node.isConnected) { cancelAnimationFrame(raf); obs.disconnect(); } });
  setTimeout(() => obs.observe(document.getElementById('screens'), { childList: true }), 0);
  const drawPets = () => {
    const grid = node.querySelector('.skin-grid');
    for (const p of PETS) {
      const owned = profile.pets.includes(p.id);
      const card = el(`<button class="skin-card ${p.id === selPet ? 'sel' : ''}" data-pet="${p.id}"><canvas></canvas><span class="nm"></span><span class="pr"></span></button>`);
      drawPetPortrait(card.querySelector('canvas'), p.id);
      card.querySelector('.nm').textContent = t('pet.' + p.id);
      card.querySelector('.pr').innerHTML = profile.pet === p.id ? esc(t('shop.withYou')) : owned ? '&#10003;' : `<span class="crystal-ico"></span>${p.price}`;
      card.addEventListener('click', () => { ui.click(); selPet = p.id; draw(); });
      grid.appendChild(card);
    }
    const p = PETS.find((k) => k.id === selPet);
    const owned = profile.pets.includes(selPet);
    node.querySelector('.pv-name').textContent = t('pet.' + selPet);
    node.querySelector('.shop-hint').textContent = t('pet.' + selPet + '.desc');
    const b = node.querySelector('.pv-act');
    b.disabled = false;
    b.innerHTML = profile.pet === selPet ? esc(t('shop.sendHome')) : owned ? esc(t('shop.takeAlong')) : `${esc(t('shop.buy'))} <span class="crystal-ico"></span>${p.price}`;
    b.onclick = async () => {
      if (!owned) {
        if (profile.crystals < p.price) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
        profile.crystals -= p.price;
        profile.pets.push(p.id);
        ui.toast(t('toast.petBought', { name: t('pet.' + p.id) }), 'soul');
        ui.audio.sfx('levelup');
        profile.pet = p.id;
      } else profile.pet = profile.pet === p.id ? null : p.id;
      ui.click();
      await storeProfile(profile);
      draw();
    };
  };
  const draw = () => {
    node.querySelector('.bal').textContent = profile.crystals;
    node.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    const grid = node.querySelector('.skin-grid');
    grid.innerHTML = '';
    if (tab === 'pets') { drawPets(); return; }
    node.querySelector('.shop-hint').textContent = t('shop.hint');
    for (const s of SKINS) {
      const owned = profile.skins.includes(s.id);
      const card = el(`<button class="skin-card ${s.id === sel ? 'sel' : ''}" data-skin="${s.id}"><canvas></canvas><span class="nm"></span><span class="pr"></span></button>`);
      drawSkinPortrait(card.querySelector('canvas'), s.id);
      card.querySelector('.nm').textContent = t('skin.' + s.id);
      card.querySelector('.pr').innerHTML = profile.skin === s.id && !avatarOn() ? esc(t('shop.equipped')) : owned ? '&#10003;' : s.quest ? esc(t('shop.questOnly')) : s.price ? `<span class="crystal-ico"></span>${s.price}` : esc(t('shop.free'));
      card.addEventListener('click', () => { ui.click(); sel = s.id; draw(); });
      grid.appendChild(card);
    }
    const s = SKINS.find((k) => k.id === sel);
    const owned = profile.skins.includes(sel);
    node.querySelector('.pv-name').textContent = t('skin.' + sel);
    const b = node.querySelector('.pv-act');
    b.disabled = (profile.skin === sel && !avatarOn()) || (s.quest && !owned);
    b.innerHTML = profile.skin === sel && !avatarOn() ? esc(t('shop.equipped')) : owned ? esc(t('shop.equip')) : s.quest ? esc(t('shop.questOnly')) : `${esc(t('shop.buy'))} <span class="crystal-ico"></span>${s.price}`;
    b.onclick = async () => {
      if (!owned) {
        if (s.quest) return;
        if (profile.crystals < s.price) { ui.toast(t('toast.noCrystals'), 'warn'); return; }
        profile.crystals -= s.price;
        profile.skins.push(s.id);
        ui.toast(t('toast.bought'), 'soul');
        ui.audio.sfx('levelup');
      }
      profile.skin = s.id;
      // a classic skin takes the place of the avatar
      if (profile.avatar) profile.avatar.on = false;
      ui.click();
      if (ui.game && ui.game.held) ui.game.applySkin();
      await storeProfile(profile);
      draw();
    };
  };
  node.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    ui.click();
    // the avatar has its own screen: the wardrobe
    if (b.dataset.tab === 'avatar') { ui.open('wardrobe'); return; }
    tab = b.dataset.tab; draw();
  }));
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

// ---------------- Treasure Quest: the map ----------------
export function treasureMap(args, ui) {
  const g = ui.game;
  const q = g.quest;
  const node = el(`<div class="screen scrim" data-screen="treasureMap">
    <div class="panel" style="width:min(820px,100%)">
      ${head(esc(t('quest.mapTitle')))}
      <canvas class="parchment" width="380" height="120"></canvas>
      <div class="row" style="justify-content:space-between"><span class="faint cur"></span><span class="value-tag prog"></span></div>
    </div></div>`);
  const cv = node.querySelector('canvas');
  const x = cv.getContext('2d');
  const hasMap = q && q.state.hasMap;
  // parchment
  x.fillStyle = '#e8d5a0'; x.fillRect(0, 0, cv.width, cv.height);
  x.fillStyle = 'rgba(138,90,42,0.12)';
  for (let i = 0; i < 90; i++) x.fillRect((i * 97) % cv.width, (i * 53) % cv.height, 3, 2);
  const pts = [];
  for (let i = 0; i <= 13; i++) pts.push([18 + i * 26, 60 + Math.sin(i * 1.3) * 32]);
  const cur = q ? q.current() : 0;
  const solved = (i) => q && q.solved(i);
  // dotted route
  x.fillStyle = '#8a5a2a';
  for (let i = 0; i < 13; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    for (let k = 0; k < 8; k++) { const f = k / 8; x.fillRect(Math.round(ax + (bx - ax) * f), Math.round(ay + (by - ay) * f), 2, 2); }
  }
  x.font = '8px monospace';
  pts.forEach(([px, py], i) => {
    const hidden = !hasMap && i > 1;
    if (i === 13) {
      // the X
      x.strokeStyle = hidden ? '#b89f66' : '#d24a24'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(px - 6, py - 6); x.lineTo(px + 6, py + 6); x.moveTo(px + 6, py - 6); x.lineTo(px - 6, py + 6); x.stroke();
      return;
    }
    x.fillStyle = hidden ? '#c9b27a' : solved(i) ? '#3a8a3a' : i === 12 ? '#a1523e' : '#5a3a1a';
    x.fillRect(px - 5, py - 5, 10, 10);
    if (i === cur) { x.strokeStyle = '#1f9fb8'; x.lineWidth = 2; x.strokeRect(px - 8, py - 8, 16, 16); }
    x.fillStyle = '#3a2410';
    if (!hidden) x.fillText(i === 0 ? '*' : i === 12 ? '!' : String(i), px - 3, py + 16);
  });
  if (!hasMap) { x.fillStyle = 'rgba(58,36,16,0.7)'; x.font = '10px monospace'; x.fillText('?', 200, 30); }
  node.querySelector('.cur').textContent = t('map.here') + ': ' + (cur === 0 ? t('quest.lvl.0') : cur > LEVEL_COUNT ? t('quest.lvl.13') : t('quest.levelOf', { n: cur, total: LEVEL_COUNT }) + ' - ' + t('quest.lvl.' + cur));
  node.querySelector('.prog').textContent = t('quest.progress', { n: q ? q.progress() : 0, total: LEVEL_COUNT });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); ui.closeAll(); });
  void LEVELS;
  return node;
}

// ---------------- Treasure Quest: complete ----------------
export function questComplete(args, ui) {
  const g = ui.game;
  const st = g.meta.quest;
  const ch2 = args.chapter === 2;
  const skin = ch2 ? 'frost_monarch' : 'treasure', sword = ch2 ? 'frostbrand' : 'starfall_blade';
  const mins = Math.floor(g.meta.playTime / 60), secs = Math.floor(g.meta.playTime % 60);
  const node = el(`<div class="screen victory" data-screen="questComplete">
    <div class="panel" style="width:min(560px,100%);text-align:center">
      <h1 class="logo" style="font-size:clamp(16px,3.6vw,28px)" data-i18n="${ch2 ? 'quest.complete2' : 'quest.complete'}"></h1>
      <p class="dim" data-i18n="${ch2 ? 'quest.completeBody2' : 'quest.completeBody'}"></p>
      <div class="reward-row"><div class="rw rw-skin"><canvas></canvas><span data-i18n="skin.${skin}"></span></div><div class="rw rw-blade"></div><div class="rw"><span class="crystal-ico" style="width:28px;height:28px"></span><span>+${ch2 ? 300 : 250}</span></div></div>
      <div class="stats-grid">
        <div><span data-i18n="victory.time"></span><b>${mins}:${String(secs).padStart(2, '0')}</b></div>
        <div><span data-i18n="quest.falls"></span><b>${st.falls}</b></div>
        <div><span data-i18n="victory.deaths"></span><b>${g.meta.stats.deaths}</b></div>
        <div><span data-i18n="victory.enemies"></span><b>${g.meta.stats.kills}</b></div>
      </div>
      <div class="row" style="justify-content:center"><button class="btn primary" data-act="continue" data-i18n="victory.continue"></button><button class="btn" data-act="title" data-i18n="victory.title_screen"></button></div>
    </div></div>`);
  drawSkinPortrait(node.querySelector('.rw-skin canvas'), skin);
  const blade = node.querySelector('.rw-blade');
  iconInto(blade, sword, 64);
  const nm = document.createElement('span'); nm.textContent = t('item.' + sword); blade.appendChild(nm);
  node.querySelector('[data-act="continue"]').addEventListener('click', () => { ui.click(); ui.closeAll(); });
  node.querySelector('[data-act="title"]').addEventListener('click', () => { ui.click(); ui.app.quitToTitle(); });
  return node;
}
