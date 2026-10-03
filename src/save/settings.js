// Settings live in localStorage (small, synchronous); guarded everywhere.
import { detectLang } from '../i18n/index.js';

const KEY = 'soulcraft.settings.v1';
const isTouch = typeof window !== 'undefined' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

export const DEFAULTS = {
  lang: null,
  textures: 'classic',
  music: true,
  funMusic: false,
  volume: 0.7,
  renderDistance: isTouch ? 3 : 5,
  quality: 'auto', // auto | low | high: resolution (and view distance on auto)
  controlSize: 1,
  controlOpacity: 0.7,
  vibration: true,
  shaders: true, // waving leaves and grass, rippling water, warm dawn and dusk light
  fps: false,
  sensitivity: 1,
  autoJump: true,
  controls: 'auto', // auto | touch | desktop (mouse and keyboard)
  wheelSlots: true, // scrolling (wheel or two fingers) changes the hotbar slot
  tutorialDone: {},
};

let current = null;
const listeners = new Set();

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { s = {}; }
  current = { ...DEFAULTS, ...s };
  if (!current.lang) current.lang = detectLang();
  if (!['auto', 'low', 'high'].includes(current.quality)) current.quality = 'auto';
  current.renderDistance = Math.max(2, Math.min(8, current.renderDistance | 0 || DEFAULTS.renderDistance));
  return current;
}

export function settings() { return current || loadSettings(); }

export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode or full */ }
}

export function setSetting(k, v) {
  settings()[k] = v;
  saveSettings();
  listeners.forEach((fn) => { try { fn(k, v); } catch (e) { console.warn(e); } });
}

export function onSetting(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export { isTouch };
