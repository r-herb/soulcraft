// Boot: settings, language, WebGL check, UI, game, service worker.
import './ui/tokens.css';
import './ui/styles.css';
import { loadSettings, settings, onSetting, setSetting } from './save/settings.js';
import { initLang, setLang, t } from './i18n/index.js';
import { UI } from './ui/ui.js';
import { Input } from './player/input.js';
import { Audio } from './audio/audio.js';
import { Game } from './game.js';
import { loadProfile, loadWorld, storageOk } from './save/db.js';
import { initAccount, slot, storeProfile, localWorlds, removeWorld, MAX_WORLDS } from './save/account.js';
import { seedFromString } from './world/structures.js';
import { initDevPanel } from './ui/dev.js';
import { LEVELS as QUEST_LEVELS } from './world/quest.js';

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
    game: null, profile: null, saveInfo: null, questInfo: null, worlds: [],
    async startQuest() {
      ui.showLoading(t('loading.world'));
      await startGame(app.game.newQuestMeta());
    },
    async continueQuest() {
      ui.showLoading(t('loading.world'));
      const data = await loadWorld(slot('quest'));
      if (!data) { await app.startQuest(); return; }
      await startGame(data);
    },
    async newGame(params) {
      if (app.worlds.length >= MAX_WORLDS) { ui.toast(t('worlds.full', { n: MAX_WORLDS }), 'warn'); return; }
      ui.showLoading(t('loading.world'));
      const meta = app.game.newMeta({ name: params.name, seed: seedFromString(params.seed), difficulty: params.difficulty, creative: params.creative });
      await startGame(meta);
    },
    // play a saved world (the most recent one when no slot is given)
    async continueGame(base) {
      ui.showLoading(t('loading.world'));
      const b = base || (app.worlds[0] && app.worlds[0].base);
      const data = b && await loadWorld(slot(b));
      if (!data) { ui.showTitle(); return; }
      await startGame(data);
    },
    async deleteWorld(base) {
      await removeWorld(base);
      await app.refreshInfo();
    },
    async refreshInfo() {
      app.worlds = await localWorlds();
      app.saveInfo = await readSaveInfo();
      app.questInfo = await readQuestInfo();
    },
    // after signing in or out: switch to that account's saves and profile
    async reloadAccount() {
      app.profile = await loadProfile(slot('profile'));
      app.game.profile = app.profile;
      app.game.held.setSkin(app.profile.skin);
      await app.refreshInfo();
    },
    async quitToTitle() {
      const g = app.game;
      if (g.running) { await g.save(true); g.stop(); }
      await app.refreshInfo();
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
  await initAccount();
  app.profile = await loadProfile(slot('profile'));
  app.game.profile = app.profile;
  app.game.held.setSkin(app.profile.skin);
  await app.refreshInfo();
  ui.setLoading(1, t('loading.ready'));
  if (!storageOk) ui.toast(t('error.save'), 'warn');

  async function startGame(meta) {
    try {
      await app.game.start(meta, (f) => ui.setLoading(0.1 + f * 0.9, t('loading.chunks')));
      ui.closeAll();
      if (!(settings().tutorialDone || {}).move) setTimeout(() => ui.tutorial('move'), 800);
      else if (meta.mode === 'quest' && !meta.player) setTimeout(() => ui.toast(t('quest.obj.0'), 'soul'), 800);
    } catch (e) {
      console.error(e);
      ui.showError('error.generic', 'error.generic', false);
    }
  }

  async function readQuestInfo() {
    const q = await loadWorld(slot('quest'));
    if (!q || !q.quest) return null;
    return { progress: q.quest.solved.filter((i) => i > 0 && i <= 12).length, done: q.quest.done };
  }

  async function readSaveInfo() {
    const w = app.worlds[0];
    return w ? { name: w.name, day: w.day, base: w.base, creative: w.creative } : null;
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
      if (g && g.running) { g.save(true); storeProfile(app.profile); }
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
    if (k === 'quality') { g.quality.scale = 0; g.quality.rdCap = 0; g.applyPixelRatio(); }
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
  window.__sc = { app, ui, input, audio, setSetting, questLevels: QUEST_LEVELS, get game() { return app.game; } };

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
