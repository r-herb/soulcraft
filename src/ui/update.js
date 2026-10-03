// The update notice: the game asks the server which version is deployed
// (/version.json, written by the build) when it starts, every few minutes and
// whenever the game comes back (tab shown, focus, back-forward cache, online)
// - on computers, Android and iPhone alike. When it is newer than the running one, a window
// over the blurred game names both versions; Update saves the game, lets the
// new service worker take over and reloads. Below the versions: what the new
// version brings (the changelog entries newer than the running build's).
import { t, getLang } from '../i18n/index.js';
import { VERSION } from './ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let shown = null;
// the newest changelog entry this build already has
const KNOWN = typeof __APP_NOTES_TOP__ !== 'undefined' ? __APP_NOTES_TOP__ : '';

// the deployed version and its latest changelog entries
export async function latestInfo() {
  try {
    const r = await fetch('/version.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j.version === 'string' ? { version: j.version, notes: Array.isArray(j.notes) ? j.notes : [] } : null;
  } catch { return null; }
}
export async function latestVersion() { const i = await latestInfo(); return i && i.version; }

// the entries this build does not have yet, in the player's language
export function newNotes(notes) {
  const out = [], lang = getLang();
  for (const n of notes || []) {
    if (!n || n.id === KNOWN) break;
    const pick = (o) => (o && (o[lang] || o.en)) || '';
    const items = pick(n.items);
    if (Array.isArray(items) && items.length) out.push({ title: pick(n.title), items });
  }
  return out;
}

function notesHtml(notes) {
  const list = newNotes(notes);
  if (!list.length) return '';
  return `<div class="update-notes"><b>${esc(t('update.whatsNew'))}</b>${list.map((n) => `<div class="un-entry">${n.title ? `<p class="un-title">${esc(n.title)}</p>` : ''}<ul>${n.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div>`;
}

export function showUpdate(to, { save, reg } = {}, notes = []) {
  if (shown) {
    shown.querySelector('[data-v="to"]').textContent = to;
    const old = shown.querySelector('.update-notes'), html = notesHtml(notes);
    if (html) { if (old) old.outerHTML = html; else shown.querySelector('.update-vers').insertAdjacentHTML('afterend', html); }
    return shown;
  }
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* none */ }
  const node = document.createElement('div');
  node.className = 'update-modal';
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.innerHTML = `<div class="update-card panel">
      <h2 class="panel-title">${esc(t('update.title'))}</h2>
      <p class="faint">${esc(t('update.text'))}</p>
      <div class="update-vers"><span><small>${esc(t('update.from'))}</small><b data-v="from">${esc(VERSION)}</b></span><i>&#8594;</i><span><small>${esc(t('update.to'))}</small><b data-v="to">${esc(to)}</b></span></div>
      ${notesHtml(notes)}
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
    const info = await latestInfo();
    busy = false;
    if (info && info.version !== VERSION) showUpdate(info.version, opts, info.notes);
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
