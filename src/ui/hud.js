// In-game HUD: health, hunger, crystals, hotbar, boss bar, touch controls.
import { t } from '../i18n/index.js';
import { iconInto, statSprite, SVG } from './icons.js';
import { settings } from '../save/settings.js';
import { ITEMS } from '../player/items.js';

export function slotEl(stack, size = 32) {
  const s = document.createElement('div');
  s.className = 'slot';
  fillSlot(s, stack, size);
  return s;
}
export function fillSlot(s, stack, size = 32) {
  s.innerHTML = '';
  if (!stack) return;
  iconInto(s, stack.item, size);
  if (stack.count > 1) { const c = document.createElement('span'); c.className = 'count'; c.textContent = stack.count; s.appendChild(c); }
}
export function itemName(key) {
  const d = ITEMS[key];
  return t((d && d.block !== undefined ? 'block.' : 'item.') + key);
}

export class Hud {
  constructor(ui, input) {
    this.ui = ui;
    this.input = input;
    this.el = document.getElementById('hud');
    this.el.innerHTML = `
      <div class="look-zone touch-only" data-z="look"></div>
      <div class="joy-zone touch-only" data-z="joy"><div class="joy-base"><div class="joy-knob"></div></div></div>
      <div class="crosshair"></div>
      <div class="hurt-flash"></div>
      <div class="underwater hidden"></div>
      <div class="inmagma hidden"></div>
      <div class="hud-top-left">
        <div class="bar-row hearts"></div>
        <div class="bar-row foods"></div>
        <div class="row"><span class="stat-chip crystal-chip" data-i18n-title="hud.crystals"><span class="crystal-ico"></span><span class="crystals">0</span></span><span class="stat-chip day-chip"></span><span class="stat-chip room-chip hidden" data-i18n-title="mp.roomChip"></span></div>
      </div>
      <div class="hud-top-right">
        <span class="fps hidden"></span>
        <button class="hud-btn pe" data-b="map" data-i18n-aria="hud.map">${SVG.map}</button>
        <button class="hud-btn pe" data-b="fullscreen" data-i18n-aria="hud.fullscreen">${SVG.fullscreen}</button>
        <button class="hud-btn pe" data-b="pause" data-i18n-aria="hud.pause">${SVG.pause}</button>
      </div>
      <div class="quest-obj hidden"><b></b><span></span></div>
      <div class="boss-bar hidden"><div class="boss-name"></div><div class="boss-hp"><i></i></div><div class="boss-hint"></div></div>
      <div class="held-name"></div>
      <div class="hotbar pe"></div>
      <div class="action-pad touch-only">
        <button class="act inv" data-a="inventory" data-i18n-aria="hud.inventory">${SVG.inv}</button>
        <button class="act use" data-a="use" data-i18n-aria="hud.use">${SVG.use}</button>
        <button class="act attack" data-a="attack" data-i18n-aria="hud.attack">${SVG.attack}</button>
        <button class="act jump" data-a="jump" data-i18n-aria="hud.jump">${SVG.jump}</button>
        <button class="act fly creative-only" data-a="fly" data-i18n-aria="hud.fly">${SVG.fly}</button>
        <button class="act down creative-only" data-a="down" data-i18n-aria="hud.down">${SVG.down}</button>
      </div>
      <div class="tut-slot"></div>
      <div class="card-slot"></div>`;
    const q = (s) => this.el.querySelector(s);
    this.hearts = q('.hearts'); this.foods = q('.foods');
    this.crystalsEl = q('.crystals'); this.dayEl = q('.day-chip');
    this.hotbar = q('.hotbar'); this.heldName = q('.held-name');
    this.fpsEl = q('.fps'); this.bossBar = q('.boss-bar');
    this.hurt = q('.hurt-flash'); this.water = q('.underwater'); this.magma = q('.inmagma');
    this.tutSlot = q('.tut-slot'); this.cardSlot = q('.card-slot');
    this.questObj = q('.quest-obj');
    this.roomChip = q('.room-chip');
    const buttons = {};
    this.el.querySelectorAll('[data-a]').forEach((b) => { buttons[b.dataset.a] = b; });
    input.attachTouch({ lookZone: q('.look-zone'), joyZone: q('.joy-zone'), joyBase: q('.joy-base'), joyKnob: q('.joy-knob'), buttons });
    this.el.querySelectorAll('[data-b]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.b;
        if (k === 'pause') ui.openPause();
        else if (k === 'map') ui.openMap();
        else if (k === 'fullscreen') ui.toggleFullscreen();
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    this.bindHotbar();
    this.last = {};
    this.applyControlSettings();
    this.el.classList.add('hidden');
  }

  applyControlSettings() {
    const s = settings();
    document.documentElement.style.setProperty('--ctl-scale', s.controlSize);
    document.documentElement.style.setProperty('--ctl-opacity', s.controlOpacity);
    this.fpsEl.classList.toggle('hidden', !s.fps);
  }

  bindHotbar() {
    let startX = null, startSel = 0, moved = false;
    this.hotbar.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      startX = e.clientX; moved = false;
      startSel = this.game ? this.game.inventory.selected : 0;
      this.hotbar.setPointerCapture?.(e.pointerId);
    });
    this.hotbar.addEventListener('pointermove', (e) => {
      if (startX === null || !this.game) return;
      const dx = e.clientX - startX;
      const step = this.hotbar.firstChild ? this.hotbar.firstChild.offsetWidth : 44;
      if (Math.abs(dx) > 12) moved = true;
      if (moved) {
        const sel = ((startSel - Math.round(dx / step)) % 9 + 9) % 9;
        if (sel !== this.game.inventory.selected) this.game.selectSlot(sel);
      }
    });
    const end = (e) => {
      if (startX === null) return;
      if (!moved && this.game) {
        const slot = e.target.closest && e.target.closest('.slot');
        if (slot) this.game.selectSlot(Number(slot.dataset.i));
        else {
          const el = document.elementFromPoint(e.clientX, e.clientY);
          const s2 = el && el.closest && el.closest('.hotbar .slot');
          if (s2) this.game.selectSlot(Number(s2.dataset.i));
        }
      }
      startX = null;
    };
    this.hotbar.addEventListener('pointerup', end);
    this.hotbar.addEventListener('pointercancel', () => { startX = null; });
  }

  show(game) {
    this.game = game;
    this.el.classList.remove('hidden');
    this.last = {};
    this.refreshHotbar();
    this.update(game, 0);
  }
  hide() { this.el.classList.add('hidden'); this.bossBar.classList.add('hidden'); this.tutSlot.innerHTML = ''; this.cardSlot.innerHTML = ''; }

  refreshHotbar() {
    const g = this.game;
    if (!g || !g.inventory) return;
    this.hotbar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = slotEl(g.inventory.slots[i]);
      s.dataset.i = i;
      if (i === g.inventory.selected) s.classList.add('selected');
      this.hotbar.appendChild(s);
    }
    const h = g.inventory.held;
    const name = h ? itemName(h.item) : '';
    if (name !== this.heldName.textContent) {
      this.heldName.textContent = name;
      this.heldName.style.opacity = 1;
      clearTimeout(this.nameT);
      this.nameT = setTimeout(() => { this.heldName.style.opacity = 0; }, 2000);
    }
  }

  flashHurt() {
    this.hurt.classList.add('on');
    clearTimeout(this.hurtT);
    this.hurtT = setTimeout(() => this.hurt.classList.remove('on'), 120);
  }

  update(g, dt) {
    const p = g.player;
    const L = this.last;
    const hp = Math.ceil(p.health), mh = p.maxHealth;
    if (L.hp !== hp || L.mh !== mh) {
      L.hp = hp; L.mh = mh;
      let html = '';
      for (let i = 0; i < mh / 2; i++) {
        const v = hp - i * 2;
        const soul = i >= 10 ? 'soul' : '';
        const st = v >= 2 ? 'full' : v === 1 ? 'half' : 'empty';
        html += `<img class="heart" alt="" src="${statSprite('heart', st === 'empty' ? 'empty' : soul + st)}">`;
      }
      this.hearts.innerHTML = html;
    }
    const fd = Math.ceil(p.food);
    if (L.fd !== fd) {
      L.fd = fd;
      let html = '';
      for (let i = 0; i < 10; i++) {
        const v = fd - i * 2;
        html += `<img class="food" alt="" src="${statSprite('food', v >= 2 ? 'full' : v === 1 ? 'half' : 'empty')}">`;
      }
      this.foods.innerHTML = html;
    }
    const cr = g.profile.crystals;
    if (L.cr !== cr) { L.cr = cr; this.crystalsEl.textContent = cr; }
    const dayTxt = g.meta.dim === 'overworld' ? t('hud.day', { n: g.meta.day }) : t('realm.' + g.meta.dim);
    if (L.day !== dayTxt) { L.day = dayTxt; this.dayEl.textContent = dayTxt; }
    if (settings().fps) this.fpsEl.textContent = t('hud.fps', { n: g.fps }) + (g.quality ? ` · ${Math.round(g.quality.scale * 100)}%` : '');
    this.water.classList.toggle('hidden', !(p.inWater && g.world.getBlock(p.pos.x, p.pos.y + 1.62, p.pos.z) === 10));
    this.magma.classList.toggle('hidden', !p.inMagma);
    // quest objective
    if (g.quest && !g.bosses.active) {
      const [head, detail] = g.quest.objective();
      if (L.qh !== head || L.qd !== detail) {
        L.qh = head; L.qd = detail;
        this.questObj.querySelector('b').textContent = head;
        this.questObj.querySelector('span').textContent = detail;
      }
      this.questObj.classList.remove('hidden');
    } else this.questObj.classList.add('hidden');
    // boss
    const boss = g.bosses.active;
    if (boss && boss.showBar) {
      this.bossBar.classList.remove('hidden');
      const nm = t('boss.' + boss.id) + (boss.phaseCount > 1 ? ' - ' + t('boss.phase', { n: boss.phase }) : '');
      if (L.bn !== nm) { L.bn = nm; this.bossBar.querySelector('.boss-name').textContent = nm; }
      const pct = Math.max(0, boss.hp / boss.maxHp * 100).toFixed(1) + '%';
      if (L.bp !== pct) { L.bp = pct; this.bossBar.querySelector('i').style.width = pct; }
      const hint = boss.hint ? t(boss.hint) : '';
      if (L.bh !== hint) { L.bh = hint; this.bossBar.querySelector('.boss-hint').textContent = hint; }
    } else if (!this.bossBar.classList.contains('hidden')) this.bossBar.classList.add('hidden');
    void dt;
  }

  titleCard(name, sub) {
    this.lastCard = name;
    this.cardSlot.innerHTML = `<div class="title-card"><div class="tc-name"></div><div class="tc-sub"></div></div>`;
    this.cardSlot.querySelector('.tc-name').textContent = name;
    this.cardSlot.querySelector('.tc-sub').textContent = sub || '';
    clearTimeout(this.cardT);
    this.cardT = setTimeout(() => { this.cardSlot.innerHTML = ''; }, 3500);
  }

  // shared world: room code and player count
  refreshRoom(net) {
    const c = this.roomChip;
    if (!c) return;
    c.classList.toggle('hidden', !net);
    if (net) c.textContent = `${net.code} · ${net.count}/4`;
  }

  showTutorial(text, onDone) {
    this.tutSlot.innerHTML = `<div class="tutorial"><p></p><button class="btn small primary"></button></div>`;
    this.tutSlot.querySelector('p').textContent = text;
    const b = this.tutSlot.querySelector('button');
    b.textContent = t('tut.gotit');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', () => { this.tutSlot.innerHTML = ''; onDone && onDone(); });
  }
  clearTutorial() { this.tutSlot.innerHTML = ''; }
}
