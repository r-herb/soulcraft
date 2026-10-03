// The update notice: the game asks the server which version is deployed
// (/version.json, written by the build) when it starts, every few minutes and
// whenever the game comes back (tab shown, focus, back-forward cache, online)
// - on computers, Android and iPhone alike. When it is newer than the running one, a window
// over the blurred game names both versions; Update saves the game, lets the
// new service worker take over and reloads.
import { t } from '../i18n/index.js';
import { VERSION } from './ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let shown = null;

export async function latestVersion() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.version === 'string' ? j.version : null;
  } catch { return null; }
}

export function showUpdate(to, { save, reg } = {}) {
  if (shown) { shown.querySelector('[data-v="to"]').textContent = to; return shown; }
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* none */ }
  const node = document.createElement('div');
  node.className = 'update-modal';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.innerHTML = `<div class="update-card panel">
      <h2 class="panel-title">${esc(t('update.title'))}</h2>
      <p class="faint">${esc(t('update.text'))}</p>
      <div class="update-vers"><span><small>${esc(t('update.from'))}</small><b data-v="from">${esc(VERSION)}</b></span><i>&#8594;</i><span><small>${esc(t('update.to'))}</small><b data-v="to">${esc(to)}</b></span></div>
      <button class="btn primary" data-act="update">${esc(t('update.reload'))}</button>
      <p class="faint small update-status" aria-live="polite"></p>
    </div>`;
  const btn = node.querySelector('[data-act="update"]');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    node.querySelector('.update-status').textContent = t('update.updating', { from: VERSION, to: node.querySelector('[data-v="to"]').textContent });
    try { if (save) await Promise.race([save(), new Promise((r) => setTimeout(r, 2500))]); } catch { /* reload anyway */ }
    try {
      if (reg) {
        await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 3000))]);
        if (reg.waiting) reg.waiting.postMessage('skipWaiting');
      }
    } catch { /* the network-first page still brings the new version */ }
    location.reload();
  });
  // keys and clicks stay in the window, not in the game behind it
  for (const ev of ['keydown', 'pointerdown', 'mousedown', 'wheel']) node.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(node);
  btn.focus();
  shown = node;
  return node;
}

// check now, every 5 minutes and when the tab is shown again
export function watchUpdates(opts = {}) {
  if (VERSION === 'dev') return;
  let busy = false;
  const check = async () => {
    if (busy) return;
    busy = true;
    const v = await latestVersion();
    busy = false;
    if (v && v !== VERSION) showUpdate(v, opts);
  };
  setTimeout(check, 4000);
  setInterval(check, 5 * 60 * 1000);
  // phones (Android, iPhone) freeze a page in the background or bring it back from the back-forward
  // cache without reloading it: check whenever the game is seen again or back online
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  window.addEventListener('pageshow', check);
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  return check;
}
