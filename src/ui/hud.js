// In-game HUD: health, hunger, crystals, hotbar, boss bar, touch controls.
import { Minimap } from './minimap.js';
import { MAX_LIVES } from '../player/lives.js';
import { t } from '../i18n/index.js';
import { iconInto, statSprite, SVG } from './icons.js';
import { settings } from '../save/settings.js';
import { ITEMS } from '../player/items.js';
import { wallet } from '../save/account.js';
import { missionName } from '../quest/missions.js';

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
      <div class="click-to-play desktop-only hidden" data-i18n="hud.clickToPlay"></div>
      <div class="hurt-flash"></div>
      <div class="underwater hidden"></div>
      <div class="inmagma hidden"></div>
      <div class="hud-top-left">
        <div class="bar-row armor hidden"></div>
        <div class="bar-row hearts"></div>
        <div class="bar-row foods"></div>
        <div class="row"><span class="stat-chip crystal-chip" data-i18n-title="hud.crystals"><span class="crystal-ico"></span><span class="crystals">0</span></span><span class="stat-chip day-chip"></span><span class="stat-chip room-chip hidden" data-i18n-title="mp.roomChip"></span><span class="stat-chip coin-chip hidden" data-i18n-title="econ.cash"><span class="coin-ico"></span><span class="coins"></span></span><span class="stat-chip lives-chip hidden" data-i18n-title="wmap.lives"><i class="life on"></i><span class="lives-n"></span></span></div>
      </div>
      <div class="hud-top-right">
        <span class="fps hidden"></span>
        <button class="hud-btn pe hidden" data-b="chat" data-i18n-aria="chat.title">${SVG.chat}<span class="dot hidden"></span></button>
        <button class="hud-btn pe" data-b="emote" data-i18n-aria="av.emotes">${SVG.emote}</button>
        <button class="hud-btn pe" data-b="view" data-i18n-aria="av.view">${SVG.view}</button>
        <button class="hud-btn pe" data-b="help" data-i18n-aria="help.title">${SVG.help}</button>
        <button class="hud-btn pe" data-b="map" data-i18n-aria="hud.map">${SVG.map}</button>
        <button class="hud-btn pe" data-b="fullscreen" data-i18n-aria="hud.fullscreen">${SVG.fullscreen}</button>
        <button class="hud-btn pe" data-b="pause" data-i18n-aria="hud.pause">${SVG.pause}</button>
      </div>
      <button class="minimap pe hidden" data-b="map" data-i18n-aria="hud.map"><canvas></canvas><i class="mm-n">N</i></button>
      <div class="bus-ride pe hidden"><div class="br-head"><b class="br-line"></b><span class="br-next"></span></div><span class="br-ticket"></span>
        <div class="br-acts"><button class="btn small primary" data-a="busact"><span></span><kbd class="desktop-only">F</kbd></button><button class="btn small br-stop" data-a="busstop">STOP<kbd class="desktop-only">X</kbd></button></div>
        <p class="br-hint"></p></div>
      <div class="bus-board pe hidden"><b class="bb-line"></b><span class="bb-text"></span><span class="bb-tickets"></span><span class="bb-keys desktop-only"></span>
        <button class="btn small primary" data-a="busboard"><span></span><kbd class="desktop-only">F</kbd></button></div>
      <div class="fab-panel hidden"><b class="fp-title"></b><div class="fp-row"><span class="fp-printed"></span></div><div class="fp-bar"><i></i></div><span class="fp-pat small"></span><span class="fp-water small hidden"></span><div class="fp-bar fp-bar2 hidden"><i></i></div><div class="fp-alerts"></div></div>
      <div class="quest-obj hidden"><b></b><span></span><i class="mis-arrow hidden">&#9650;</i></div>
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
        <button class="act flyspeed creative-only" data-a="flyspeed" data-i18n-aria="hud.flySpeed"><b class="gear">1x</b></button>
      </div>
      <div class="tut-slot"></div>
      <div class="guide-slot"></div>
      <div class="card-slot"></div>`;
    const q = (s) => this.el.querySelector(s);
    this.hearts = q('.hearts'); this.foods = q('.foods'); this.armorBar = q('.armor');
    this.crystalsEl = q('.crystals'); this.dayEl = q('.day-chip');
    this.hotbar = q('.hotbar'); this.heldName = q('.held-name');
    this.fpsEl = q('.fps'); this.bossBar = q('.boss-bar');
    this.hurt = q('.hurt-flash'); this.water = q('.underwater'); this.magma = q('.inmagma');
    this.tutSlot = q('.tut-slot'); this.cardSlot = q('.card-slot'); this.guideSlot = q('.guide-slot');
    this.questObj = q('.quest-obj');
    this.misArrow = q('.mis-arrow');
    this.busRide = q('.bus-ride');
    this.busBoard = q('.bus-board');
    this.fabPanel = q('.fab-panel');
    this.roomChip = q('.room-chip');
    this.chatBtn = q('[data-b="chat"]');
    this.livesChip = q('.lives-chip'); this.livesN = q('.lives-n');
    this.coinChip = q('.coin-chip'); this.coinsN = q('.coins');
    iconInto(q('.coin-ico'), 'coin', 14);
    this.minimap = new Minimap(q('.minimap'));
    this.clickToPlay = q('.click-to-play');
    const buttons = {};
    this.el.querySelectorAll('[data-a]').forEach((b) => { buttons[b.dataset.a] = b; });
    input.attachTouch({ lookZone: q('.look-zone'), joyZone: q('.joy-zone'), joyBase: q('.joy-base'), joyKnob: q('.joy-knob'), buttons });
    this.el.querySelectorAll('[data-b]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.b;
        if (k === 'pause') ui.openPause();
        else if (k === 'help') ui.open('help');
        else if (k === 'chat') ui.open('chat');
        else if (k === 'map') ui.openMap();
        else if (k === 'fullscreen') ui.toggleFullscreen();
        else if (k === 'view') ui.game.cycleView();
        else if (k === 'emote') ui.open('emotes');
      });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    this.bindHotbar();
    this.last = {};
    this.applyControlSettings();
    this.el.classList.add('hidden');
  }

  // the chat button shows for signed-in players, with the unread count
  setChatBadge(n) {
    const d = this.chatBtn.querySelector('.dot');
    d.textContent = n; d.classList.toggle('hidden', !n);
  }
  showChat(on) { this.chatBtn.classList.toggle('hidden', !on); }

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
  hide() { this.el.classList.add('hidden'); this.bossBar.classList.add('hidden'); this.tutSlot.innerHTML = ''; this.cardSlot.innerHTML = ''; this.guideSlot.innerHTML = ''; this.guideAction = null; }

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
    // mouse and keyboard: say how to capture the pointer when it is free
    const free = !this.input.touchMode && !this.input.pointerLocked && !p.dead;
    if (free !== this._free) { this._free = free; this.clickToPlay.classList.toggle('hidden', !free); }
    const L = this.last;
    this.minimap.update(g, dt);
    this.fabUpdate(g);
    const lv = g.mapTravelOk && !g.creative ? `${g.lives}/${MAX_LIVES}` : '';
    const cn = wallet.cash === null ? '' : String(wallet.cash);
    if (L.cn !== cn) { L.cn = cn; this.coinChip.classList.toggle('hidden', !cn); this.coinsN.textContent = cn; }
    if (L.lv !== lv) { L.lv = lv; this.livesChip.classList.toggle('hidden', !lv); this.livesN.textContent = lv; }
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
    // armor: ten chestplates, each two points, shown while armor is worn
    const ap = g.inventory.armorPoints;
    if (L.ap !== ap) {
      L.ap = ap;
      this.armorBar.classList.toggle('hidden', !ap);
      let html = '';
      for (let i = 0; i < 10; i++) { const v = ap - i * 2; html += `<i class="ap ${v >= 2 ? 'full' : v === 1 ? 'half' : 'empty'}"></i>`; }
      this.armorBar.innerHTML = html;
      this.armorBar.title = t('hud.armor', { n: ap });
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
    const dayTxt = g.outdoors ? t('hud.day', { n: g.meta.day }) : t('realm.' + g.meta.dim);
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
      this.misArrow.classList.add('hidden');
    } else if (g.missions && g.missions.active && g.missions.tracked && !g.bosses.active) {
      // a city mission: its next step, and an arrow and distance to its place
      const m = g.missions.tracked, tg = g.missions.target(m);
      const head = missionName(m);
      let detail = g.missions.stepText(m);
      if (tg) {
        const dx = tg.x - p.pos.x, dz = tg.z - p.pos.z;
        detail += ` - ${Math.round(Math.hypot(dx, dz))} m`;
        const deg = Math.round(((p.yaw - Math.atan2(-dx, -dz)) * 180) / Math.PI);
        if (L.ma !== deg) { L.ma = deg; this.misArrow.style.transform = `rotate(${deg}deg)`; }
      }
      this.misArrow.classList.toggle('hidden', !tg);
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

  // La Fábrica's sieges: what is printed (season 1) or melted (season 2), the police's patience, the water, what needs doing now
  fabUpdate(g) {
    const act = g.missions && g.missions.active;
    // season 4: the guards, the panel, then the run to the jet
    const A = g.aero, ae = act && A && A.open ? A.state() : null;
    if (ae && ae.act >= 4 && ae.act <= 6) { this.aeroPanel(ae); return; }
    if (this.fabPanel.classList.contains('four')) { this.fabPanel.classList.remove('four'); this.last.fab = null; }
    // season 3: the cameras, the fuse box, the alarms, then the run to the boat
    const U = g.puerto, u = act && U && U.open ? U.state() : null;
    if (u && u.act >= 4 && u.act <= 7) { this.puertoPanel(u); return; }
    if (this.fabPanel.classList.contains('three')) { this.fabPanel.classList.remove('three'); this.last.fab = null; }
    const F = g.fabrica, O = g.oro, f = act && F ? F.state() : null, o = act && O && O.open ? O.state() : null;
    const s = f && f.act === 4 ? f : o && o.act === 6 ? o : null, two = !!s && s === o, on = !!s;
    if (this.last.fabOn !== on) { this.last.fabOn = on; this.fabPanel.classList.toggle('hidden', !on); }
    if (!on) return;
    const alerts = [];
    if (s.phone) alerts.push(t('fab.hud.phone', { s: Math.ceil(s.phone.t) }));
    if (two) {
      if (!s.power) alerts.push(t('oro.hud.power'));
      if (s.flood > 0) alerts.push(t('oro.hud.flood', { s: Math.ceil(s.flood) }));
      (s.pumps || []).forEach((p, i) => { if (!p) alerts.push(t('oro.hud.pump', { n: i + 1 })); });
      if (s.drill) alerts.push(t('oro.hud.drill.' + s.drill.side, { s: Math.ceil(s.drill.t) }));
    } else {
      if (s.raid && !s.raid.held) alerts.push(t('fab.hud.raid.' + s.raid.door, { s: Math.ceil(s.raid.t) }));
      if (s.esc) alerts.push(t('fab.hud.escape'));
      for (const [k, pr] of Object.entries(s.presses || {})) if (pr.jam) alerts.push(t('fab.hud.jam', { n: +k + 1 }));
    }
    const key = [two, two ? s.melted : s.printed, Math.round(s.patience), two ? Math.round(s.water) : 0, alerts.join('|')].join(';');
    if (this.last.fab === key) return;
    this.last.fab = key;
    this.fabPanel.classList.toggle('two', two);
    this.fabPanel.querySelector('.fp-title').textContent = t(two ? 'oro.hud.title' : 'fab.hud.title');
    this.fabPanel.querySelector('.fp-printed').textContent = two ? t('oro.hud.melted', { n: s.melted, total: 12 }) : t('fab.hud.printed', { n: s.printed, total: 10 });
    const bar = this.fabPanel.querySelector('.fp-bar i');
    bar.style.width = Math.max(0, Math.min(100, s.patience)) + '%';
    bar.classList.toggle('low', s.patience < 30);
    this.fabPanel.querySelector('.fp-pat').textContent = t('fab.hud.patience', { n: Math.round(s.patience) });
    const wt = this.fabPanel.querySelector('.fp-water'), wb = this.fabPanel.querySelector('.fp-bar2');
    wt.classList.toggle('hidden', !two); wb.classList.toggle('hidden', !two);
    if (two) { wt.textContent = t('oro.hud.water', { n: Math.round(s.water) }); const i2 = wb.querySelector('i'); i2.style.width = Math.max(0, Math.min(100, s.water)) + '%'; i2.classList.toggle('low', s.water > 70); }
    this.fabPanel.querySelector('.fp-alerts').innerHTML = alerts.map((a) => `<p>${a.replace(/[&<>]/g, '')}</p>`).join('');
  }

  puertoPanel(s) {
    if (this.last.fabOn !== true) { this.last.fabOn = true; this.fabPanel.classList.remove('hidden'); }
    const run = s.act === 7, off = s.camsOff > 0;
    const key = ['three', s.act, Math.ceil(s.camsOff), Math.ceil(s.fuseCd), Math.ceil(s.escape), s.alarms].join(';');
    if (this.last.fab === key) return;
    this.last.fab = key;
    this.fabPanel.classList.remove('two'); this.fabPanel.classList.add('three');
    this.fabPanel.querySelector('.fp-title').textContent = t('puerto.hud.title');
    this.fabPanel.querySelector('.fp-printed').textContent = run ? t('puerto.hud.run', { s: Math.ceil(s.escape) }) : off ? t('puerto.hud.camsOff', { s: Math.ceil(s.camsOff) }) : t('puerto.hud.camsOn');
    const bar = this.fabPanel.querySelector('.fp-bar i');
    bar.style.width = (run ? Math.max(0, Math.min(100, (s.escape / 150) * 100)) : off ? (s.camsOff / 25) * 100 : 0) + '%';
    bar.classList.toggle('low', run && s.escape < 40);
    this.fabPanel.querySelector('.fp-pat').textContent = run ? t('puerto.hud.boat') : s.fuseCd > 0 ? t('puerto.hud.fuseWait', { s: Math.ceil(s.fuseCd) }) : t('puerto.hud.fuseReady');
    const wt = this.fabPanel.querySelector('.fp-water'), wb = this.fabPanel.querySelector('.fp-bar2');
    wb.classList.add('hidden'); wt.classList.toggle('hidden', run);
    wt.textContent = t('puerto.hud.alarms', { n: s.alarms });
    this.fabPanel.querySelector('.fp-alerts').innerHTML = `<p>${t('puerto.hud.step.' + s.act).replace(/[&<>]/g, '')}</p>`;
  }

  aeroPanel(s) {
    if (this.last.fabOn !== true) { this.last.fabOn = true; this.fabPanel.classList.remove('hidden'); }
    const run = s.act === 6;
    const key = ['four', s.act, Math.ceil(s.escape), s.alarms].join(';');
    if (this.last.fab === key) return;
    this.last.fab = key;
    this.fabPanel.classList.remove('two', 'three'); this.fabPanel.classList.add('four');
    this.fabPanel.querySelector('.fp-title').textContent = t('aero.hud.title');
    this.fabPanel.querySelector('.fp-printed').textContent = run ? t('aero.hud.run', { s: Math.ceil(s.escape) }) : s.act === 5 ? t('aero.hud.panel') : t('aero.hud.guards');
    const bar = this.fabPanel.querySelector('.fp-bar i');
    bar.style.width = (run ? Math.max(0, Math.min(100, (s.escape / 150) * 100)) : 0) + '%';
    bar.classList.toggle('low', run && s.escape < 40);
    this.fabPanel.querySelector('.fp-pat').textContent = run ? t('aero.hud.jet') : t('aero.hud.belt');
    const wt = this.fabPanel.querySelector('.fp-water'), wb = this.fabPanel.querySelector('.fp-bar2');
    wb.classList.add('hidden'); wt.classList.toggle('hidden', run);
    wt.textContent = t('aero.hud.alarms', { n: s.alarms });
    this.fabPanel.querySelector('.fp-alerts').innerHTML = `<p>${t('aero.hud.step.' + s.act).replace(/[&<>]/g, '')}</p>`;
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

  // a card that leads to a guide (the city's, a mission's): open it, or close the card
  showGuideCard(text, label, onOpen, onClose) {
    clearTimeout(this.guideT);
    this.guideSlot.innerHTML = `<div class="guide-card pe"><p></p><button class="btn small primary" data-g="open"><span></span><kbd class="desktop-only">J</kbd></button><button class="btn small ghost" data-g="x" aria-label="x">&#10005;</button></div>`;
    this.guideSlot.querySelector('p').textContent = text;
    const ob = this.guideSlot.querySelector('[data-g="open"]');
    ob.querySelector('span').textContent = label;
    const clear = () => { this.guideSlot.innerHTML = ''; this.guideAction = null; clearTimeout(this.guideT); };
    // the card's button, or J on a keyboard (the mouse stays captured in the game)
    this.guideAction = () => { clear(); onOpen && onOpen(); };
    for (const b of this.guideSlot.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    ob.addEventListener('click', (e) => { e.stopPropagation(); this.guideAction(); });
    this.guideSlot.querySelector('[data-g="x"]').addEventListener('click', (e) => { e.stopPropagation(); clear(); onClose && onClose(); });
    // it goes by itself after a while
    this.guideT = setTimeout(clear, 45000);
  }
}
