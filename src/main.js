// Boot: settings, language, WebGL check, UI, game, service worker.
import { CallManager } from './net/call.js';
import { CallUI } from './ui/callui.js';
import { startHub, onHub } from './net/hub.js';
import { itemName } from './ui/hud.js';
import { startChatWatch, refreshChat } from './ui/chat.js';
import './ui/tokens.css';
import './ui/styles.css';
import { loadSettings, settings, onSetting, setSetting } from './save/settings.js';
import { initLang, setLang, t } from './i18n/index.js';
import { UI } from './ui/ui.js';
import { Input } from './player/input.js';
import { Audio } from './audio/audio.js';
import { Game, loadCityData } from './game.js';
import { loadProfile, loadWorld, storageOk } from './save/db.js';
import { initAccount, slot, storeProfile, localWorlds, removeWorld, MAX_WORLDS, sendPresence, onAccount, account, econ } from './save/account.js';
import { seedFromString } from './world/structures.js';
import { initDevPanel } from './ui/dev.js';
import { LEVELS as QUEST_LEVELS } from './world/quest.js';
import { B } from './world/blocks.js';
import { Net, createRoom } from './net/net.js';

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
  input.setControls(settings().controls);
  input.wheelSlots = settings().wheelSlots !== false;

  // the last few errors go along with a problem report
  const recentErrors = [];
  const noteError = (m) => { recentErrors.push(String(m).slice(0, 200)); if (recentErrors.length > 5) recentErrors.shift(); };
  window.addEventListener('error', (e) => noteError(e.message));
  window.addEventListener('unhandledrejection', (e) => noteError((e.reason && e.reason.message) || e.reason));
  const consoleError = console.error.bind(console);
  console.error = (...a) => { noteError(a.map((x) => (x && x.message) || String(x)).join(' ')); consoleError(...a); };

  const app = {
    recentErrors,
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
    // a world in a real city (Malaga)
    async newCity(params) {
      if (app.worlds.length >= MAX_WORLDS) { ui.toast(t('worlds.full', { n: MAX_WORLDS }), 'warn'); return; }
      ui.showLoading(t('city.loading'));
      try {
        await loadCityData(params.city);
      } catch (e) { console.warn('city', e); ui.showTitle(); ui.toast(t('city.loadFailed'), 'warn'); return; }
      await startGame(app.game.newCityMeta(params));
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
    // where this player is, for friends (every minute, and when it changes)
    presence() {
      const g = app.game;
      const on = g && g.running;
      sendPresence({ world: on ? g.meta.name : null, room: on && g.net && g.net.isHost ? g.net.code : null, city: on ? g.meta.city || null : null });
    },
    // ---------- multiplayer ----------
    // Open the running world to friends; resolves with the room code.
    async openRoom() {
      const g = app.game;
      if (g.net) return g.net.code;
      const code = await createRoom(g.meta.name);
      const net = new Net(app, code, 'host');
      await net.connect();
      net.attach(g);
      app.presence();
      return code;
    },
    closeRoom() { const g = app.game; if (g.net && g.net.isHost) g.net.leave(); },
    kick(id) { const g = app.game; if (g.net && g.net.isHost) g.net.send({ t: 'kick', to: id }); },
    // Join a friend's world by its room code.
    async joinRoom(code) {
      ui.showLoading(t('mp.joining'));
      const net = new Net(app, code, 'guest');
      try {
        const edits = {};
        net.collect = edits;
        await net.connect();
        const w = await net.waitFor('welcome');
        await net.waitFor('ready', 90_000);
        net.collect = null;
        const meta = w.world.city
          ? app.game.newCityMeta({ city: w.world.city, name: w.world.name, difficulty: w.world.difficulty, creative: w.world.creative })
          : app.game.newMeta({ name: w.world.name, seed: w.world.seed, difficulty: w.world.difficulty, creative: w.world.creative });
        Object.assign(meta, { worldId: 'mp-' + code, guest: true, time: w.world.time, day: w.world.day, edits: { [meta.dim]: edits }, starfallGiven: true, frostbrandGiven: true });
        if (w.you && w.you.player) { meta.player = w.you.player; meta.inventory = w.you.inventory || null; }
        net.game = app.game;
        app.game.net = net;
        await startGame(meta);
        if (!app.game.running) throw Object.assign(new Error('start'), { code: 'network' });
        net.attach(app.game);
        ui.toast(t('mp.welcome', { name: w.world.name }), 'ok');
      } catch (e) {
        console.warn('join failed', e && e.code);
        net.leave();
        if (app.game.running) app.game.stop();
        ui.showTitle();
        ui.open('join', { code, error: e.code || 'network' });
      }
    },
    // the host left or the connection dropped: back to the title
    async guestEnded(key) {
      const g = app.game;
      if (g.running) g.stop();
      await app.refreshInfo();
      ui.showTitle();
      ui.toast(t(key), 'warn');
    },
    async quitToTitle() {
      const g = app.game;
      if (g.running) { await g.save(true); g.stop(); }
      await app.refreshInfo();
      ui.showTitle();
      app.presence();
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
      app.presence();
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
    return { progress: q.quest.solved.filter((i) => i > 0 && i <= 12).length, done: q.quest.done, progress2: q.quest.solved.filter((i) => i >= 14 && i <= 21).length, done2: !!q.quest.done2 };
  }

  async function readSaveInfo() {
    const w = app.worlds[0];
    return w ? { name: w.name, day: w.day, base: w.base, creative: w.creative } : null;
  }

  ui.showTitle();
  // a password reset link from the email (?reset=token)
  const resetToken = new URLSearchParams(location.search).get('reset');
  if (resetToken) {
    history.replaceState(null, '', location.pathname);
    ui.open('reset', { token: resetToken });
  }

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
    if (k === 'controls') input.setControls(v);
    if (k === 'wheelSlots') input.wheelSlots = v;
    if (k === 'autoJump' && g.player) g.player.autoJump = v;
    if (k === 'quality') { g.quality.scale = 0; g.quality.rdCap = 0; g.applyPixelRatio(); }
    if (k === 'controlSize' || k === 'controlOpacity' || k === 'fps') ui.hud.applyControlSettings();
  });

  // block browser gestures that fight the game
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); });
  document.addEventListener('touchmove', (e) => {
    if (e.target.closest && e.target.closest('.panel-body, .recipe-list, .skin-grid, .map-track, input[type=range], .screen')) return;
    e.preventDefault();
  }, { passive: false });

  if (new URLSearchParams(location.search).get('dev') === '1') initDevPanel(app, ui);

  // test / debug handle
  setInterval(() => app.presence(), 60_000);
  app.presence();
  onAccount(() => app.presence());
  startHub();
  startChatWatch(ui);
  app.calls = new CallManager();
  new CallUI(app.calls, ui);
  const chatBtn = () => ui.hud && ui.hud.showChat && ui.hud.showChat(!!(account.user && account.mp));
  onAccount(() => { chatBtn(); refreshChat(); });
  chatBtn();
  // coins in hand and in the bank, for the HUD
  const loadWallet = () => { if (account.user && account.available) econ.state().catch(() => {}); };
  // someone bought what this player offered, or the lottery was won
  onHub((ev) => {
    if (ev.t === 'sold') { ui.toast(t('econ.soldOffer', { q: ev.qty, item: itemName(ev.item), buyer: ev.buyer, p: ev.price }), 'ok'); loadWallet(); }
    else if (ev.t === 'lottery') { ui.toast(t('econ.wonLottery', { pot: ev.pot }), 'soul'); loadWallet(); }
  });
  onAccount(loadWallet);
  loadWallet();
  window.__sc = { app, ui, input, audio, setSetting, questLevels: QUEST_LEVELS, B, get game() { return app.game; } };

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
