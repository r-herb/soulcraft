// Screen manager: title, loading, new world, settings, pause, death, plus
// toasts, tutorial hints and fullscreen. Panels (inventory, trading, shop,
// map, victory) live in panels.js.
import { t, getLang, setLang, onLangChange, applyI18n } from '../i18n/index.js';
import { settings, setSetting } from '../save/settings.js';
import { SVG } from './icons.js';
import { Hud } from './hud.js';
import * as panels from './panels.js';

export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor({ app, input, audio }) {
    this.app = app; // callbacks from main.js
    this.input = input;
    this.audio = audio;
    this.root = document.getElementById('screens');
    this.toasts = document.getElementById('toasts');
    this.stack = [];
    this.hud = new Hud(this, input);
    onLangChange(() => this.rerender());
    document.body.classList.toggle('touch', input.touchMode);
  }

  get game() { return this.app.game; }

  // ---------- stack ----------
  open(name, args = {}, replace = false) {
    if (replace) this.stack.pop();
    this.stack.push({ name, args });
    this.render();
    this.onOverlayChange();
  }
  back() {
    this.stack.pop();
    this.render();
    this.onOverlayChange();
  }
  closeAll() {
    this.stack = [];
    this.render();
    this.onOverlayChange();
  }
  get top() { return this.stack[this.stack.length - 1]; }
  rerender() { this.render(); if (this.game && this.game.running) { this.hud.last = {}; this.hud.refreshHotbar(); } }

  render() {
    this.root.innerHTML = '';
    const top = this.top;
    if (!top) return;
    const fn = this['screen_' + top.name] || panels[top.name];
    if (!fn) return;
    const node = fn.call(this, top.args, this);
    if (node) { this.root.appendChild(node); applyI18n(node); }
  }

  onOverlayChange() {
    const g = this.game;
    if (!g || !g.running) return;
    const inGameOverlay = this.stack.length > 0;
    g.paused = inGameOverlay || g.player.dead;
    this.input.enabled = !inGameOverlay;
    this.input.reset();
    if (inGameOverlay) { this.input.exitLock(); this.hud.el.classList.add('overlay-open'); }
    else { this.hud.el.classList.remove('overlay-open'); this.input.requestLock(); }
    if (g.inventory && !this.stack.some((s) => s.name === 'inventory')) {
      if (g.inventory.grid.some(Boolean)) g.inventory.returnGrid();
    }
  }

  // ---------- helpers ----------
  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 2700);
  }

  click() { this.audio.unlock(); this.audio.sfx('click'); }

  toggleFullscreen() {
    try {
      const d = document;
      if (!d.fullscreenElement && !d.webkitFullscreenElement) {
        const e = d.documentElement;
        const r = (e.requestFullscreen || e.webkitRequestFullscreen)?.call(e, { navigationUI: 'hide' });
        if (r && r.then) r.then(() => { try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch { /* ignore */ } }).catch(() => {});
      } else {
        (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
      }
    } catch { /* unsupported (iOS Safari) */ }
  }

  toggleFps() { setSetting('fps', !settings().fps); this.hud.applyControlSettings(); }

  // tutorial hints for first-time players: shown once each
  tutorial(key) {
    const g = this.game;
    if (!g || !g.meta) return;
    const done = settings().tutorialDone || {};
    if (done[key] || this._tutShown === key) return;
    if (g.bosses && g.bosses.active) { setTimeout(() => this.tutorial(key), 8000); return; }
    const touch = this.input.touchMode;
    const textKey = { move: touch ? 'tut.move' : 'tut.moveDesktop', break: touch ? 'tut.break' : 'tut.breakDesktop', place: touch ? 'tut.place' : 'tut.placeDesktop', look: 'tut.look' }[key] || 'tut.' + key;
    this._tutShown = key;
    this.hud.showTutorial(t(textKey), () => this.tutorialDone(key, true));
  }
  tutorialDone(key, dismissed = false) {
    const done = { ...(settings().tutorialDone || {}) };
    if (done[key]) return;
    if (this._tutShown !== key && !dismissed) { done[key] = true; setSetting('tutorialDone', done); return; }
    done[key] = true;
    setSetting('tutorialDone', done);
    this.hud.clearTutorial();
    this._tutShown = null;
    const order = ['move', 'break', 'place', 'craft', 'map'];
    const next = order.find((k) => !done[k]);
    if (next) setTimeout(() => this.tutorial(next), 1500);
  }

  // ---------- loading ----------
  showLoading(status) {
    this.stack = [{ name: 'loading', args: { status } }];
    this.render();
  }
  setLoading(frac, status) {
    const bar = this.root.querySelector('.progress > i');
    if (bar) bar.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
    if (status) { const s = this.root.querySelector('.status'); if (s) s.textContent = status; }
  }
  hideLoading() { this.stack = this.stack.filter((s) => s.name !== 'loading'); this.render(); this.onOverlayChange(); }

  screen_loading(args) {
    const tips = ['loading.tip1', 'loading.tip2', 'loading.tip3', 'loading.tip4'];
    const tip = tips[Math.floor(Math.random() * tips.length)];
    return el(`<div class="screen loading" data-screen="loading">
      <h1 class="logo" data-i18n="app.title"></h1>
      <div class="progress"><i></i></div>
      <div class="status">${esc(args.status || t('loading.title'))}</div>
      <div class="tip" data-i18n="${tip}"></div>
    </div>`);
  }

  // ---------- title ----------
  screen_title() {
    const save = this.app.saveInfo;
    const lang = getLang();
    const node = el(`<div class="screen title-screen" data-screen="title">
      <div class="souls"></div>
      <div class="title-layout">
        <div class="logo-wrap">
          <canvas class="logo-mark" width="16" height="16"></canvas>
          <h1 class="logo" data-i18n="app.title"></h1>
          <p class="tagline" data-i18n="app.tagline"></p>
        </div>
        <div class="title-menu">
          <button class="btn primary" data-act="continue" ${save ? '' : 'disabled'}>
            <span><span data-i18n="title.continue"></span><span class="continue-meta">${save ? esc(save.name) + ' - ' + esc(t('hud.day', { n: save.day })) : esc(t('title.nosave'))}</span></span>
          </button>
          <button class="btn violet" data-act="new" data-i18n="title.new"></button>
          <button class="btn" data-act="skins" data-i18n="title.skins"></button>
          <button class="btn" data-act="settings" data-i18n="title.settings"></button>
        </div>
      </div>
      <div class="title-foot">
        <div class="lang-switch" role="group" aria-label="Language">
          <button data-lang="en" class="${lang === 'en' ? 'on' : ''}">EN</button>
          <button data-lang="ru" class="${lang === 'ru' ? 'on' : ''}">RU</button>
        </div>
        <span class="faint">${esc(t('title.version', { v: VERSION }))}</span>
      </div>
    </div>`);
    drawLogoMark(node.querySelector('.logo-mark'));
    const souls = node.querySelector('.souls');
    for (let i = 0; i < 18; i++) {
      const o = document.createElement('i');
      o.className = 'soul-orb' + (i % 3 === 0 ? ' v' : '');
      o.style.left = (Math.random() * 100) + '%';
      o.style.animationDuration = (9 + Math.random() * 12) + 's';
      o.style.animationDelay = (-Math.random() * 20) + 's';
      const s = 6 + Math.random() * 8;
      o.style.width = o.style.height = s + 'px';
      souls.appendChild(o);
    }
    node.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { this.click(); setLang(b.dataset.lang); setSetting('lang', b.dataset.lang); }));
    node.querySelector('[data-act="continue"]').addEventListener('click', () => { this.click(); this.app.continueGame(); });
    node.querySelector('[data-act="new"]').addEventListener('click', () => { this.click(); this.open('newWorld'); });
    node.querySelector('[data-act="skins"]').addEventListener('click', () => { this.click(); this.open('shop'); });
    node.querySelector('[data-act="settings"]').addEventListener('click', () => { this.click(); this.open('settings'); });
    return node;
  }

  showTitle() { this.stack = [{ name: 'title', args: {} }]; this.render(); }

  screen_newWorld() {
    const node = el(`<div class="screen solid" data-screen="newWorld">
      <div class="panel" style="width:min(520px,100%)">
        <div class="panel-head"><h2 class="panel-title" data-i18n="newworld.title"></h2>
          <button class="btn icon-btn ghost close-x" data-act="back" data-i18n-aria="common.back">${SVG.close}</button></div>
        <div class="panel-body col" style="gap:var(--sp-3)">
          <div class="field"><label for="nw-name" data-i18n="newworld.name"></label><input id="nw-name" class="input" maxlength="32" data-i18n-placeholder="newworld.namePlaceholder" autocomplete="off"></div>
          <div class="field"><label for="nw-seed" data-i18n="newworld.seed"></label><input id="nw-seed" class="input" maxlength="24" data-i18n-placeholder="newworld.seedPlaceholder" autocomplete="off"></div>
          <div class="field"><span class="setting-label" data-i18n="newworld.difficulty"></span>
            <div class="seg" data-seg="diff"><button data-v="peaceful" data-i18n="diff.peaceful"></button><button data-v="normal" class="on" data-i18n="diff.normal"></button><button data-v="hard" data-i18n="diff.hard"></button></div></div>
          ${this.app.saveInfo ? '<p class="faint" data-i18n="newworld.overwrite"></p>' : ''}
          <button class="btn primary wide" data-act="create" data-i18n="newworld.create"></button>
        </div>
      </div></div>`);
    let diff = 'normal';
    node.querySelectorAll('[data-seg="diff"] button').forEach((b) => b.addEventListener('click', () => {
      this.click(); diff = b.dataset.v;
      node.querySelectorAll('[data-seg="diff"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    node.querySelector('[data-act="back"]').addEventListener('click', () => { this.click(); this.back(); });
    node.querySelector('[data-act="create"]').addEventListener('click', () => {
      this.click();
      const name = node.querySelector('#nw-name').value.trim() || t('newworld.defaultName');
      const seed = node.querySelector('#nw-seed').value.trim();
      this.app.newGame({ name, seed, difficulty: diff });
    });
    return node;
  }

  // ---------- settings ----------
  screen_settings() {
    const s = settings();
    const toggle = (k) => `<div class="seg toggle" data-toggle="${k}"><button data-v="1" class="${s[k] ? 'on' : ''}" data-i18n="common.on"></button><button data-v="0" class="${!s[k] ? 'on' : ''}" data-i18n="common.off"></button></div>`;
    const range = (k, min, max, step, fmt) => `<div class="row"><input class="range" type="range" data-range="${k}" min="${min}" max="${max}" step="${step}" value="${s[k]}"><span class="value-tag" data-val="${k}">${fmt(s[k])}</span></div>`;
    const pct = (v) => Math.round(v * 100) + '%';
    const node = el(`<div class="screen ${this.game && this.game.running ? 'scrim' : 'solid'}" data-screen="settings">
      <div class="panel" style="width:min(760px,100%)">
        <div class="panel-head"><h2 class="panel-title" data-i18n="settings.title"></h2>
          <button class="btn icon-btn ghost close-x" data-act="back" data-i18n-aria="common.back">${SVG.close}</button></div>
        <div class="panel-body"><div class="settings-grid">
          <div class="setting-section" data-i18n="settings.section.general"></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.language"></span>
            <div class="seg" data-seg="lang"><button data-v="en" class="${getLang() === 'en' ? 'on' : ''}">English</button><button data-v="ru" class="${getLang() === 'ru' ? 'on' : ''}">Русский</button></div></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.fps"></span>${toggle('fps')}</div>
          <div class="setting-section" data-i18n="settings.section.graphics"></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.textures"></span>
            <div class="seg" data-seg="textures"><button data-v="classic" class="${s.textures === 'classic' ? 'on' : ''}" data-i18n="settings.tex.classic"></button><button data-v="glow" class="${s.textures === 'glow' ? 'on' : ''}" data-i18n="settings.tex.glow"></button></div></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.renderDistance"></span>${range('renderDistance', 2, 8, 1, (v) => t('settings.chunks', { n: v }))}</div>
          <div class="setting-section" data-i18n="settings.section.audio"></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.music"></span>${toggle('music')}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.funMusic"></span>${toggle('funMusic')}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.volume"></span>${range('volume', 0, 1, 0.05, pct)}</div>
          <div class="setting-section" data-i18n="settings.section.controls"></div>
          <div class="setting"><span class="setting-label" data-i18n="settings.controlSize"></span>${range('controlSize', 0.7, 1.5, 0.05, pct)}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.controlOpacity"></span>${range('controlOpacity', 0.2, 1, 0.05, pct)}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.sensitivity"></span>${range('sensitivity', 0.3, 2.5, 0.05, pct)}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.vibration"></span>${toggle('vibration')}</div>
          <div class="setting"><span class="setting-label" data-i18n="settings.autoJump"></span>${toggle('autoJump')}</div>
        </div></div>
      </div></div>`);
    node.querySelector('[data-act="back"]').addEventListener('click', () => { this.click(); this.back(); });
    node.querySelectorAll('[data-seg="lang"] button').forEach((b) => b.addEventListener('click', () => { this.click(); setSetting('lang', b.dataset.v); setLang(b.dataset.v); }));
    node.querySelectorAll('[data-seg="textures"] button').forEach((b) => b.addEventListener('click', () => {
      this.click(); setSetting('textures', b.dataset.v);
      node.querySelectorAll('[data-seg="textures"] button').forEach((x) => x.classList.toggle('on', x === b));
    }));
    node.querySelectorAll('[data-toggle]').forEach((seg) => seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      this.click();
      setSetting(seg.dataset.toggle, b.dataset.v === '1');
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    })));
    const fmts = { renderDistance: (v) => t('settings.chunks', { n: v }) };
    node.querySelectorAll('[data-range]').forEach((r) => {
      r.addEventListener('input', () => {
        const k = r.dataset.range;
        const v = Number(r.value);
        setSetting(k, v);
        node.querySelector(`[data-val="${k}"]`).textContent = (fmts[k] || ((x) => Math.round(x * 100) + '%'))(v);
      });
      r.addEventListener('pointerdown', (e) => e.stopPropagation());
    });
    return node;
  }

  // ---------- in-game overlays ----------
  openPause() { if (!this.game || this.game.player.dead) return; this.open('pause'); }
  openInventory() { this.open('inventory'); this.tutorialDone('craft'); }
  openMap() { this.open('map'); }
  openTrade(v) { this.open('trade', { villager: v }); this.tutorialDone('village'); }
  openDeath(cause, source) { this.stack = [{ name: 'death', args: { cause, source } }]; this.render(); this.onOverlayChange(); }

  screen_pause() {
    const node = el(`<div class="screen scrim" data-screen="pause">
      <div class="panel" style="width:min(340px,100%)">
        <h2 class="panel-title" style="text-align:center" data-i18n="pause.title"></h2>
        <div class="col">
          <button class="btn primary" data-act="resume" data-i18n="pause.resume"></button>
          <div class="row"><button class="btn" style="flex:1" data-act="map" data-i18n="pause.map"></button><button class="btn" style="flex:1" data-act="shop" data-i18n="pause.shop"></button></div>
          <div class="row"><button class="btn" style="flex:1" data-act="settings" data-i18n="pause.settings"></button><button class="btn" style="flex:1" data-act="save" data-i18n="pause.save"></button></div>
          <button class="btn ember" data-act="quit" data-i18n="pause.quit"></button>
        </div>
      </div></div>`);
    const on = (a, fn) => node.querySelector(`[data-act="${a}"]`).addEventListener('click', () => { this.click(); fn(); });
    on('resume', () => this.closeAll());
    on('map', () => this.open('map'));
    on('shop', () => this.open('shop'));
    on('settings', () => this.open('settings'));
    on('save', () => this.game.save());
    on('quit', () => this.app.quitToTitle());
    return node;
  }

  screen_death(args) {
    const g = this.game;
    const src = args.source || '';
    const causeKey = { fall: 'death.cause.fall', mob: 'death.cause.mob', magma: 'death.cause.magma', void: 'death.cause.void', boss: 'death.cause.boss' }[args.cause] || 'death.cause.generic';
    const node = el(`<div class="screen death" data-screen="death">
      <h1 data-i18n="death.title"></h1>
      <p class="dim">${esc(t(causeKey, { name: src }))}</p>
      <p class="faint" data-i18n="death.keep"></p>
      <div class="row"><button class="btn primary" data-act="respawn" data-i18n="death.respawn"></button><button class="btn" data-act="title" data-i18n="death.title_screen"></button></div>
    </div>`);
    node.querySelector('[data-act="respawn"]').addEventListener('click', async () => {
      this.click();
      this.stack = []; this.render();
      await g.respawn();
      this.onOverlayChange();
    });
    node.querySelector('[data-act="title"]').addEventListener('click', async () => {
      this.click();
      g.player.dead = false; g.player.health = g.player.maxHealth;
      const s = g.layout.spawnPoint();
      if (g.meta.dim === 'overworld') g.player.pos.set(s.x, s.y, s.z);
      this.app.quitToTitle();
    });
    return node;
  }

  showError(titleKey, bodyKey, retry) {
    this.stack = [{ name: 'error', args: { titleKey, bodyKey, retry } }];
    this.render();
  }
  screen_error(args) {
    const node = el(`<div class="screen error-screen" data-screen="error">
      <h1 class="logo" data-i18n="app.title"></h1>
      <h2 class="panel-title" data-i18n="${args.titleKey}"></h2>
      <p data-i18n="${args.bodyKey}"></p>
      <div class="row"><button class="btn primary" data-act="retry" data-i18n="${args.retry ? 'nogl.retry' : 'error.reload'}"></button>
      <div class="lang-switch"><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">EN</button><button data-lang="ru" class="${getLang() === 'ru' ? 'on' : ''}">RU</button></div></div>
    </div>`);
    node.querySelector('[data-act="retry"]').addEventListener('click', () => location.reload());
    node.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); setSetting('lang', b.dataset.lang); }));
    return node;
  }
}

export function drawLogoMark(c) {
  const x = c.getContext('2d');
  const rows = [
    '......XX........',
    '.....XXX........',
    '....XXXX..X.....',
    '....XXXXX.XX....',
    '...XXXXXXXXX....',
    '...XXXOOXXXXX...',
    '..XXXOOOOXXXX...',
    '..XXOOWWOOXXXX..',
    '..XXOOWWOOOXXX..',
    '..XXOOOOOOOXXX..',
    '...XXOOOOOOXX...',
    '...XXXOOOOXXX...',
    '....XXXXXXXX....',
    '.....XXXXXX.....',
    '......XXXX......',
  ];
  const col = { X: '#44d6e8', O: '#b6fbff', W: '#ffffff' };
  rows.forEach((r, y) => r.split('').forEach((ch, i) => { if (col[ch]) { x.fillStyle = col[ch]; x.fillRect(i, y + 1, 1, 1); } }));
}
