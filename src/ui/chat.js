// Chat: private messages with friends and the public channels (the Lobby
// and the ones admins make) the player was let into. New messages arrive
// live through the chat hub. Players report messages; admins delete them
// and mute players right here.
import { t, applyI18n, getLang } from '../i18n/index.js';
import { SVG } from './icons.js';
import { chat as api, account } from '../save/account.js';
import { onHub } from '../net/hub.js';

const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NAME_COLOURS = ['#7ff3ff', '#ffd36b', '#b98bff', '#7cf0a0', '#ff9a8a', '#8ab4ff', '#ffb86b', '#f0a0e0'];
const colourOf = (id) => NAME_COLOURS[Math.abs(id) % NAME_COLOURS.length];
const time = (ms) => new Date(ms).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit' });

// unread messages in all chats (for the badges), kept up to date by the hub
export const chatState = { unread: 0, listeners: new Set(), open: null };
const notify = () => chatState.listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
export async function refreshChat() {
  if (!account.user || !account.mp) { chatState.unread = 0; notify(); return; }
  try { const r = await api.list(); chatState.unread = r.convs.reduce((n, c) => n + c.unread, 0); } catch { /* offline */ }
  notify();
}

// new messages outside the open chat: count them, and say who wrote
export function startChatWatch(ui) {
  onHub((ev) => {
    if (ev.t === 'msg') {
      if (chatState.open === ev.conv || (account.user && ev.from === account.user.id)) return;
      chatState.unread++;
      notify();
      if (ui.game && ui.game.running && ev.kind === 'd') ui.toast(`${ev.msg.name}: ${ev.msg.text.slice(0, 60)}`, 'soul');
    } else if (ev.t === 'channels') refreshChat();
  });
  refreshChat();
}

export function chat(args, ui) {
  const node = el(`<div class="screen scrim" data-screen="chat">
    <div class="panel chat-panel">
      <div class="panel-head"><button class="btn small ghost chat-back hidden" data-act="list">&lt;</button><h2 class="panel-title" data-i18n="chat.title"></h2><button class="btn icon-btn ghost close-x" data-act="close" data-i18n-aria="common.close">${SVG.close}</button></div>
      <div class="chat-body">
        <div class="chat-convs"><p class="faint" data-i18n="common.loading"></p></div>
        <div class="chat-room">
          <div class="chat-head-row"><div class="chat-head faint" data-i18n="chat.pick"></div><button class="btn small hidden" data-act="call" data-i18n="call.call"></button></div>
          <div class="chat-msgs"></div>
          <form class="chat-send hidden" novalidate><input class="input" maxlength="300" autocomplete="off" data-i18n-placeholder="chat.placeholder"><button class="btn primary" type="submit" data-i18n="chat.send"></button></form>
          <p class="form-error" role="alert"></p>
        </div>
      </div>
    </div></div>`);
  const convsEl = node.querySelector('.chat-convs'), msgsEl = node.querySelector('.chat-msgs');
  const headEl = node.querySelector('.chat-head'), form = node.querySelector('.chat-send'), errEl = node.querySelector('.form-error');
  const panel = node.querySelector('.chat-panel');
  let convs = [], cur = null, admin = false, muted = null, messages = [];

  async function loadConvs() {
    let r;
    try { r = await api.list(); } catch { convsEl.innerHTML = `<p class="faint">${esc(t('chat.offline'))}</p>`; return; }
    convs = r.convs; admin = r.admin; muted = r.muted;
    chatState.unread = convs.reduce((n, c) => n + (c.conv === (cur && cur.conv) ? 0 : c.unread), 0); notify();
    const item = (c) => `<button class="chat-conv ${cur && cur.conv === c.conv ? 'on' : ''}" data-conv="${esc(c.conv)}">
      <span class="cc-name">${c.kind === 'c' ? '# ' : ''}${esc(c.kind === 'c' && c.id === 1 ? t('chat.lobby') : c.name)}</span>
      ${c.unread && !(cur && cur.conv === c.conv) ? `<span class="dot">${c.unread}</span>` : ''}
      <span class="cc-last faint">${c.last ? esc((c.last.text || t('chat.deleted')).slice(0, 40)) : ''}</span></button>`;
    const chans = convs.filter((c) => c.kind === 'c'), dms = convs.filter((c) => c.kind === 'd');
    convsEl.innerHTML = `${chans.length ? `<div class="section-label">${esc(t('chat.channels'))}</div>${chans.map(item).join('')}` : `<p class="faint small">${esc(t('chat.noChannels'))}</p>`}
      <div class="section-label">${esc(t('chat.friends'))}</div>${dms.length ? dms.map(item).join('') : `<p class="faint small">${esc(t('chat.noFriends'))}</p>`}`;
    convsEl.querySelectorAll('[data-conv]').forEach((b) => b.addEventListener('click', () => { ui.click(); openConv(convs.find((c) => c.conv === b.dataset.conv)); }));
    if (!cur && args.conv) { const c = convs.find((x) => x.conv === args.conv); if (c) openConv(c); }
  }

  function renderMsgs() {
    const me = account.user && account.user.id;
    msgsEl.innerHTML = messages.length ? messages.map((m) => `<div class="chat-msg ${m.userId === me ? 'mine' : ''}" data-id="${m.id}">
      <span class="cm-name" style="color:${colourOf(m.userId)}">${esc(m.name)}</span><span class="cm-time faint">${esc(time(m.at))}</span>
      ${m.deleted ? `<span class="cm-text faint"><i>${esc(t('chat.deleted'))}</i></span>` : `<span class="cm-text">${esc(m.text)}</span>`}
      ${!m.deleted && m.userId !== me ? `<span class="cm-acts"><button class="linkish" data-a="report" title="${esc(t('chat.report'))}">!</button>${admin ? `<button class="linkish" data-a="del">${esc(t('chat.delete'))}</button><button class="linkish" data-a="mute">${esc(t('chat.mute'))}</button>` : ''}</span>` : ''}
      ${!m.deleted && m.userId === me && admin ? `<span class="cm-acts"><button class="linkish" data-a="del">${esc(t('chat.delete'))}</button></span>` : ''}
    </div>`).join('') : `<p class="faint">${esc(t('chat.empty'))}</p>`;
    msgsEl.querySelectorAll('.chat-msg').forEach((row) => {
      const m = messages.find((x) => x.id === Number(row.dataset.id));
      row.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
        ui.click();
        try {
          if (b.dataset.a === 'report') { await api.report(m.id, ''); ui.toast(t('chat.reported'), 'ok'); }
          else if (b.dataset.a === 'del') { await api.del(m.id); m.deleted = true; renderMsgs(); }
          else if (b.dataset.a === 'mute') { await api.mute(m.userId, 60); ui.toast(t('chat.muted', { name: m.name }), 'ok'); }
        } catch (e) { errEl.textContent = e.data && e.data.message ? e.data.message : t('chat.err'); }
      }));
    });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  async function openConv(c) {
    cur = c; chatState.open = c.conv;
    panel.classList.add('in-room');
    headEl.textContent = c.kind === 'c' ? '# ' + (c.id === 1 ? t('chat.lobby') : c.name) : c.name;
    headEl.classList.remove('faint');
    const callBtn = node.querySelector('[data-act="call"]');
    callBtn.classList.toggle('hidden', !(c.kind === 'd' && ui.app.calls));
    callBtn.onclick = () => { ui.click(); ui.app.calls.start({ id: c.id, name: c.name }).catch(() => ui.toast(t('call.noMic'), 'warn')); };
    form.classList.remove('hidden');
    errEl.textContent = muted ? t('chat.youMuted', { until: time(muted) }) : '';
    try { messages = (await api.messages(c.kind, c.id)).messages; } catch { messages = []; errEl.textContent = t('chat.err'); }
    renderMsgs();
    if (messages.length) api.read(c.conv, messages[messages.length - 1].id);
    c.unread = 0;
    loadConvs();
    form.querySelector('input').focus();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const inp = form.querySelector('input');
    const text = inp.value.trim();
    if (!text || !cur) return;
    errEl.textContent = '';
    try {
      const r = await api.send(cur.kind, cur.id, text);
      inp.value = '';
      if (!messages.some((m) => m.id === r.message.id)) { messages.push(r.message); renderMsgs(); }
    } catch (e) {
      errEl.textContent = e.code === 'muted' ? t('chat.youMuted', { until: time(e.data.until) }) : e.code === 'slow_down' ? t('chat.slow') : t('chat.err');
    }
  });
  // keep keys typed here away from the game
  form.addEventListener('keydown', (e) => e.stopPropagation());

  const off = onHub((ev) => {
    if (!node.isConnected) { off(); return; }
    if (ev.t === 'msg') {
      if (cur && ev.conv === cur.conv) {
        if (!messages.some((m) => m.id === ev.msg.id)) { messages.push(ev.msg); renderMsgs(); }
        api.read(cur.conv, ev.msg.id);
      } else loadConvs();
    } else if (ev.t === 'del' && cur && ev.conv === cur.conv) {
      const m = messages.find((x) => x.id === ev.id);
      if (m) { m.deleted = true; renderMsgs(); }
    } else if (ev.t === 'channels') loadConvs();
  });
  node.querySelector('[data-act="list"]').addEventListener('click', () => { ui.click(); panel.classList.remove('in-room'); cur = null; chatState.open = null; loadConvs(); });
  node.querySelector('[data-act="close"]').addEventListener('click', () => { ui.click(); chatState.open = null; off(); ui.back(); refreshChat(); });
  applyI18n(node);
  loadConvs();
  return node;
}
