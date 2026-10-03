// Notifications: Web Push for a closed game (a friend calls or invites to
// play), a system notification when the game is open but out of sight, and
// what waits on the server when the game comes back.
import { account, pushApi } from '../save/account.js';
import { getLang } from '../i18n/index.js';

export const pushSupported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const fromB64u = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const ready = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('no_sw')), 5000))]);

// 'unsupported' | 'denied' | 'on' | 'off'
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  try { const r = await ready(); return (await r.pushManager.getSubscription()) ? 'on' : 'off'; } catch { return 'off'; }
}

// ask (from a tap), then subscribe this browser for the signed-in player
export async function enablePush() {
  if (!pushSupported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('denied'), { code: 'denied' });
  const { key } = await pushApi.key();
  const r = await ready();
  let sub = await r.pushManager.getSubscription();
  if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) });
  await pushApi.subscribe(sub.endpoint, getLang());
  return true;
}

// after signing in (maybe another player on this browser): the subscription follows the account
export async function refreshPush() {
  if (!account.user || !pushSupported() || Notification.permission !== 'granted') return;
  try { const r = await ready(); const sub = await r.pushManager.getSubscription(); if (sub) await pushApi.subscribe(sub.endpoint, getLang()); } catch { /* later */ }
}

// a notification while the game is open but hidden (another tab, the phone's home screen)
export function localNotify(title, body, tag) {
  try {
    if (document.visibilityState === 'visible' || !('Notification' in window) || Notification.permission !== 'granted') return;
    ready().then((r) => r.showNotification(title, { body, tag, icon: '/icons/icon-192.png', renotify: true, vibrate: [300, 150, 300] })).catch(() => {});
  } catch { /* no notifications here */ }
}

export async function fetchPending() {
  if (!account.user) return [];
  try { return (await pushApi.pending()).events || []; } catch { return []; }
}
