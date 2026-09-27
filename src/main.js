// Boot: settings, language, WebGL check, UI, game, service worker.
import './ui/tokens.css';
import './ui/styles.css';
import { loadSettings, settings, onSetting } from './save/settings.js';
import { initLang, setLang, t } from './i18n/index.js';
import { UI } from './ui/ui.js';
import { Input } from './player/input.js';
import { Audio } from './audio/audio.js';
import { Game } from './game.js';
import { loadProfile, loadWorld, saveProfile, storageOk } from './save/db.js';
import { seedFromString } from './world/structures.js';
import { initDevPanel } from './ui/dev.js';

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

async function boot() {
  loadSettings();
  initLang(settings().lang);
  const canvas = document.getElementById('game');
  const audio = new Audio();
  audio.volume = settings().volume;
  audio.musicOn = settings().music;
  audio.fun = settings().funMusic;
  const input = new Input(document, canvas);
  input.sensitivity = settings().sensitivity;

  const app = {
    game: null, profile: null, saveInfo: null,
    async newGame(params) {
      ui.showLoading(t('loading.world'));
      const meta = app.game.newMeta({ name: params.name, seed: seedFromString(params.seed), difficulty: params.difficulty });
      await startGame(meta);
    },
    async continueGame() {
      ui.showLoading(t('loading.world'));
      const data = await loadWorld();
      if (!data) { ui.showTitle(); return; }
      await startGame(data);
    },
    async quitToTitle() {
      const g = app.game;
      if (g.running) { await g.save(true); g.stop(); }
      app.saveInfo = await readSaveInfo();
      ui.showTitle();
    },
  };
  const ui = new UI({ app, input, audio });

  if (!hasWebGL()) { ui.showError('nogl.title', 'nogl.body', true); return; }

  ui.showLoading(t('loading.textures'));
  ui.setLoading(0.1);
  try {
    app.game = new Game({ canvas, ui, audio, input, profile: null });
    app.game.initRenderer();
  } catch (e) {
    console.error(e);
    ui.showError('nogl.title', 'nogl.body', true);
    return;
  }
  ui.setLoading(0.5);
  app.profile = await loadProfile();
  app.game.profile = app.profile;
  app.game.held.setSkin(app.profile.skin);
  app.saveInfo = await readSaveInfo();
  ui.setLoading(1, t('loading.ready'));
  if (!storageOk) ui.toast(t('error.save'), 'warn');

  async function startGame(meta) {
    try {
      await app.game.start(meta, (f) => ui.setLoading(0.1 + f * 0.9, t('loading.chunks')));
      ui.closeAll();
      if (!(settings().tutorialDone || {}).move) setTimeout(() => ui.tutorial('move'), 800);
    } catch (e) {
      console.error(e);
      ui.showError('error.generic', 'error.generic', false);
    }
  }

  async function readSaveInfo() {
    const w = await loadWorld();
    return w ? { name: w.name, day: w.day } : null;
  }

  ui.showTitle();

  // audio needs a user gesture
  const unlock = () => { audio.unlock(); };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  document.addEventListener('visibilitychange', () => {
    const g = app.game;
    if (document.hidden) {
      audio.suspend();
      if (g && g.running) { g.save(true); saveProfile(app.profile); }
    } else audio.resume();
  });
  window.addEventListener('pagehide', () => { const g = app.game; if (g && g.running) g.save(true); });

  // portrait on phones: pause the game behind the rotate screen
  const mq = matchMedia('(orientation: portrait) and (pointer: coarse)');
  const onOrient = () => { const g = app.game; if (mq.matches && g && g.running && !g.paused) ui.openPause(); };
  mq.addEventListener ? mq.addEventListener('change', onOrient) : mq.addListener(onOrient);

  onSetting((k, v) => {
    const g = app.game;
    if (k === 'lang') setLang(v);
    if (k === 'textures') g.buildTextures(v);
    if (k === 'music') audio.setMusic(v);
    if (k === 'funMusic') audio.setFun(v);
    if (k === 'volume') audio.setVolume(v);
    if (k === 'sensitivity') input.sensitivity = v;
    if (k === 'autoJump' && g.player) g.player.autoJump = v;
    if (k === 'controlSize' || k === 'controlOpacity' || k === 'fps') ui.hud.applyControlSettings();
  });

  // block browser gestures that fight the game
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest && e.target.closest('.panel-body, .recipe-list, .skin-grid, .map-track, input[type=range]')) return;
    e.preventDefault();
  }, { passive: false });

  if (new URLSearchParams(location.search).get('dev') === '1') initDevPanel(app, ui);

  // test / debug handle
  window.__sc = { app, ui, input, audio, get game() { return app.game; } };

  registerSW();
}

function registerSW() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  if (new URLSearchParams(location.search).get('nosw') === '1') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // A new deploy installs a new worker which takes over at once (it never
    // serves stale HTML - see public/sw.js). Offer a reload so this tab runs
    // the new code too.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || document.querySelector('.update-banner')) return;
      const b = document.createElement('div');
      b.className = 'update-banner';
      b.innerHTML = `<span>${t('update.ready')}</span><button class="btn small primary">${t('update.reload')}</button>`;
      b.querySelector('button').addEventListener('click', () => location.reload());
      document.body.appendChild(b);
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch((e) => console.warn('SW registration failed', e));
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('screens').innerHTML = '<div class="screen error-screen"><p>Error / Ошибка. <button onclick="location.reload()">Reload</button></p></div>';
});
