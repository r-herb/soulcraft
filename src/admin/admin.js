// Soulcraft admin panel (English only). The superadmin signs in with the
// credentials kept in GitHub secrets, then manages player accounts.
import '../ui/tokens.css';
import '../ui/styles.css';
import './admin.css';
import { resizeAvatar } from '../save/account.js';

const root = document.getElementById('admin');
// the game's stylesheet locks page scrolling; the admin page needs it
document.documentElement.style.overflow = 'auto';
document.documentElement.style.height = 'auto';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => (ms ? new Date(ms).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

async function api(path, opts = {}) {
  const res = await fetch('/api/' + path, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) { const e = new Error(data.message || data.error || 'Request failed (' + res.status + ')'); e.status = res.status; throw e; }
  return data;
}

function toast(msg, bad = false) {
  const d = document.createElement('div');
  d.className = 'admin-toast' + (bad ? ' bad' : '');
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3000);
}

// ---------- sign in ----------
function renderLogin(message = '') {
  root.innerHTML = `
    <div class="admin-wrap">
      <form class="admin-card admin-login" data-form="login" novalidate>
        <h1 class="panel-title">Soulcraft Admin</h1>
        <div class="field"><label for="a-login">Username</label><input id="a-login" class="input" autocomplete="username" required></div>
        <div class="field"><label for="a-pass">Password</label><input id="a-pass" class="input" type="password" autocomplete="current-password" required></div>
        <label class="check"><input type="checkbox" id="a-remember" checked> <span>Keep me signed in on this device</span></label>
        <p class="form-error" role="alert">${esc(message)}</p>
        <button class="btn primary wide" type="submit">Sign in</button>
        <a class="faint" href="/">Back to the game</a>
      </form>
    </div>`;
  root.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = root.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await api('auth/login', { method: 'POST', body: { login: root.querySelector('#a-login').value, password: root.querySelector('#a-pass').value, remember: root.querySelector('#a-remember').checked } });
      if (r.role !== 'superadmin') { await api('auth/logout', { method: 'POST', body: {} }); renderLogin('This account is a player account. Players sign in inside the game.'); return; }
      renderUsers();
    } catch (e) {
      renderLogin(e.status === 401 ? 'Wrong username or password.' : e.message);
    }
  });
}

// ---------- navigation ----------
function topBar(active) {
  return `<div class="admin-top"><h1>Soulcraft Admin</h1>
    <nav class="admin-tabs"><button class="${active === 'users' ? 'on' : ''}" data-nav="users">Users</button><button class="${active === 'stats' ? 'on' : ''}" data-nav="stats">Statistics</button></nav>
    <a class="btn small ghost" href="/">Open the game</a><button class="btn small ember" data-act="logout">Sign out</button></div>`;
}
function bindTopBar() {
  root.querySelector('[data-act="logout"]').addEventListener('click', async () => { await api('auth/logout', { method: 'POST', body: {} }).catch(() => {}); renderLogin(); });
  root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => (b.dataset.nav === 'stats' ? renderStats() : renderUsers())));
}

// ---------- statistics ----------
async function renderStats() {
  root.innerHTML = `<div class="admin-wrap">${topBar('stats')}<div class="admin-card loading"><p class="empty">Loading...</p></div></div>`;
  bindTopBar();
  let s;
  try { s = await api('admin/stats'); } catch (e) { if (e.status === 401 || e.status === 403) { renderLogin(); return; } toast(e.message, true); return; }
  root.querySelector('.loading').remove();
  const tile = (label, value, sub = '') => `<div class="stat-tile"><span class="st-label">${esc(label)}</span><b class="st-value">${esc(value)}</b>${sub ? `<span class="st-sub">${esc(sub)}</span>` : ''}</div>`;
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
  root.querySelector('.admin-wrap').insertAdjacentHTML('beforeend', `
    <div class="stat-tiles">
      ${tile('Players', s.users, `${s.newUsers30} new in 30 days${s.disabled ? `, ${s.disabled} disabled` : ''}`)}
      ${tile('Active, last 7 days', s.active7, pct(s.active7, s.users) + ' of players')}
      ${tile('Active, last 30 days', s.active30, pct(s.active30, s.users) + ' of players')}
      ${tile('Signed in now', s.signedIn, 'players with a valid session')}
      ${tile('Worlds in the cloud', s.worlds, `${s.creativeWorlds} creative`)}
      ${tile('Treasure Quest', `${s.questDone} / ${s.questStarted}`, 'finished / started')}
    </div>
    <div class="admin-card">
      <div class="chart-head"><h2>Active players per day</h2><span class="faint">last 14 days</span><button class="btn small ghost" data-act="table">Show table</button></div>
      <div class="chart" role="img" aria-label="Active players per day over the last 14 days"></div>
      <table class="chart-table hidden"><thead><tr><th>Day</th><th>Active players</th></tr></thead><tbody>${s.daily.map((d) => `<tr><td>${esc(d.day)}</td><td>${d.n}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="admin-card">
      <h2>Top players by soul crystals earned</h2>
      ${s.top.length ? `<ol class="top-list">${s.top.map((p) => `<li>${p.avatar ? `<img class="av" alt="" src="${esc(p.avatar)}">` : '<span class="av"></span>'}<b>${esc(p.name)}</b><span class="faint">${p.pet ? esc(p.pet) : ''}</span><span class="num">${p.crystals}</span></li>`).join('')}</ol>` : '<p class="empty">No player has saved a profile yet.</p>'}
    </div>
    <div class="admin-card"><p style="margin:0">Password reset by email: <b>${s.email ? 'ready' : 'not set up'}</b>${s.email ? '' : ' (add the RESEND_API_KEY secret in GitHub; until then reset passwords here)'}</p></div>`);
  drawBars(root.querySelector('.chart'), s.daily);
  root.querySelector('[data-act="table"]').addEventListener('click', (e) => {
    const tb = root.querySelector('.chart-table');
    tb.classList.toggle('hidden');
    e.target.textContent = tb.classList.contains('hidden') ? 'Show table' : 'Hide table';
  });
}

// A single-series bar chart: thin bars anchored to the baseline, a
// recessive grid, and a tooltip on hover or tap.
function drawBars(el, data) {
  const W = 720, H = 220, L = 34, R = 8, T = 12, B = 28;
  const max = Math.max(1, ...data.map((d) => d.n));
  const step = max <= 5 ? 1 : Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const bw = (W - L - R) / data.length;
  const barW = Math.max(6, Math.min(28, bw - 8));
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="bars">`;
  for (let v = 0; v <= top; v += step) svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${v}</text>`;
  data.forEach((d, i) => {
    const cx = L + bw * i + bw / 2, h = y(0) - y(d.n);
    const r = Math.min(4, h / 2);
    if (d.n > 0) svg += `<path class="bar" d="M${cx - barW / 2},${y(0)} v${-(h - r)} q0,${-r} ${r},${-r} h${barW - 2 * r} q${r},0 ${r},${r} v${h - r} z"/>`;
    if (i % 2 === (data.length - 1) % 2) svg += `<text x="${cx}" y="${H - 8}" class="tick" text-anchor="middle">${d.day.slice(5).replace('-', '.')}</text>`;
    svg += `<rect class="hit" x="${cx - bw / 2}" y="${T}" width="${bw}" height="${H - T - B}" data-i="${i}"/>`;
  });
  svg += '</svg><div class="tip hidden"></div>';
  el.innerHTML = svg;
  const tip = el.querySelector('.tip');
  const show = (e) => {
    const i = Number(e.target.dataset.i);
    if (Number.isNaN(i)) return;
    const d = data[i];
    tip.innerHTML = `<b>${d.n}</b> active player${d.n === 1 ? '' : 's'}<br><span>${esc(new Date(d.day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))}</span>`;
    tip.classList.remove('hidden');
    const box = el.getBoundingClientRect(), r = e.target.getBoundingClientRect();
    tip.style.left = Math.min(box.width - 140, Math.max(0, r.left - box.left + r.width / 2 - 60)) + 'px';
    el.querySelectorAll('.hit').forEach((h) => h.classList.toggle('on', h === e.target));
  };
  el.querySelectorAll('.hit').forEach((h) => { h.addEventListener('pointerenter', show); h.addEventListener('pointerdown', show); });
  el.addEventListener('pointerleave', () => { tip.classList.add('hidden'); el.querySelectorAll('.hit').forEach((h) => h.classList.remove('on')); });
}

// ---------- users ----------
let query = '';
async function renderUsers() {
  root.innerHTML = `
    <div class="admin-wrap">
      ${topBar('users')}
      <div class="admin-card">
        <div class="toolbar">
          <input class="input" type="search" placeholder="Search by name, username, email or phone" value="${esc(query)}" data-act="search">
          <button class="btn primary" data-act="add">+ Add user</button>
        </div>
      </div>
      <div class="admin-card"><table class="users"><thead><tr><th></th><th>Name</th><th>Email</th><th>Phone</th><th>Created</th><th>Last sign-in</th><th>Saves</th><th>Status</th><th></th></tr></thead><tbody><tr><td colspan="9" class="empty">Loading...</td></tr></tbody></table></div>
    </div>`;
  bindTopBar();
  root.querySelector('[data-act="add"]').addEventListener('click', () => userDialog(null));
  let t;
  root.querySelector('[data-act="search"]').addEventListener('input', (e) => { query = e.target.value; clearTimeout(t); t = setTimeout(loadUsers, 250); });
  await loadUsers();
}

async function loadUsers() {
  const tb = root.querySelector('tbody');
  let users;
  try { users = (await api('admin/users?q=' + encodeURIComponent(query))).users; }
  catch (e) { if (e.status === 401 || e.status === 403) { renderLogin(); return; } tb.innerHTML = `<tr><td colspan="9" class="empty">${esc(e.message)}</td></tr>`; return; }
  if (!users.length) { tb.innerHTML = `<tr><td colspan="9" class="empty">${query ? 'No users match.' : 'No users yet. Add the first one.'}</td></tr>`; return; }
  tb.innerHTML = users.map((u) => `
    <tr class="${u.disabled ? 'off' : ''}" data-id="${u.id}">
      <td>${u.avatar ? `<img class="av" alt="" src="${esc(u.avatar)}">` : '<span class="av"></span>'}</td>
      <td><b>${esc(u.name)}</b>${u.username ? `<div class="faint">@${esc(u.username)}</div>` : ''}</td><td>${esc(u.email || '-')}</td><td>${esc(u.phone || '-')}</td>
      <td>${esc(fmt(u.createdAt))}</td><td>${esc(fmt(u.lastLogin))}</td><td>${u.saves}</td>
      <td><span class="badge ${u.disabled ? 'off' : ''}">${u.disabled ? 'Disabled' : 'Active'}</span></td>
      <td><div class="acts">
        <button class="btn" data-a="edit">Edit</button><button class="btn" data-a="pw">Password</button><button class="btn" data-a="saves">Saves</button>
        <button class="btn" data-a="toggle">${u.disabled ? 'Enable' : 'Disable'}</button><button class="btn ember" data-a="del">Delete</button>
      </div></td>
    </tr>`).join('');
  tb.querySelectorAll('tr[data-id]').forEach((tr) => {
    const u = users.find((x) => x.id === Number(tr.dataset.id));
    tr.querySelector('[data-a="edit"]').addEventListener('click', () => userDialog(u));
    tr.querySelector('[data-a="pw"]').addEventListener('click', () => passwordDialog(u));
    tr.querySelector('[data-a="saves"]').addEventListener('click', () => savesDialog(u));
    tr.querySelector('[data-a="toggle"]').addEventListener('click', async () => {
      try { await api('admin/users/' + u.id, { method: 'PATCH', body: { disabled: !u.disabled } }); toast(u.disabled ? 'User enabled' : 'User disabled and signed out'); loadUsers(); }
      catch (e) { toast(e.message, true); }
    });
    tr.querySelector('[data-a="del"]').addEventListener('click', () => confirmDialog(`Delete ${u.name}?`, 'This removes the account and all of its cloud saves. It cannot be undone.', async () => {
      await api('admin/users/' + u.id, { method: 'DELETE' }); toast('User deleted'); loadUsers();
    }));
  });
}

function dialog(html) {
  const d = document.createElement('dialog');
  d.className = 'admin-dlg';
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.querySelectorAll('[data-a="cancel"]').forEach((b) => b.addEventListener('click', () => d.close()));
  d.showModal();
  return d;
}

function userDialog(u) {
  const isNew = !u;
  let avatar = u ? u.avatar : null;
  const d = dialog(`
    <h2>${isNew ? 'Add user' : 'Edit user'}</h2>
    <form novalidate>
      <div class="row"><img class="av" alt="" style="width:56px;height:56px" ${avatar ? `src="${esc(avatar)}"` : ''}><label class="btn small">Photo<input type="file" accept="image/*" class="hidden" data-a="photo"></label><button type="button" class="btn small ghost" data-a="nophoto">Remove</button></div>
      <div class="field"><label>Name</label><input class="input" name="name" maxlength="40" value="${esc(u ? u.name : '')}" required></div>
      <div class="field"><label>Username (optional, to sign in with, e.g. teo)</label><input class="input" name="username" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(u ? u.username || '' : '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" maxlength="120" value="${esc(u ? u.email || '' : '')}"></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" type="tel" maxlength="24" value="${esc(u ? u.phone || '' : '')}" placeholder="+371 20000000"></div>
      ${isNew ? '<div class="field"><label>Password (the player can change it later)</label><input class="input" name="password" type="text" autocomplete="off" minlength="6"></div>' : ''}
      <p class="faint" style="margin:0">The player signs in with the username, the email or the phone number, and the password.</p>
      <p class="form-error" role="alert"></p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-a="cancel">Cancel</button><button class="btn primary" type="submit">${isNew ? 'Create user' : 'Save'}</button></div>
    </form>`);
  const img = d.querySelector('img.av');
  d.querySelector('[data-a="photo"]').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { avatar = await resizeAvatar(f); img.src = avatar; } catch { toast('That picture could not be read.', true); }
  });
  d.querySelector('[data-a="nophoto"]').addEventListener('click', () => { avatar = null; img.removeAttribute('src'); });
  d.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const body = { name: f.name.value, username: f.username.value, email: f.email.value, phone: f.phone.value, avatar };
    if (isNew) body.password = f.password.value;
    try {
      if (isNew) await api('admin/users', { method: 'POST', body });
      else await api('admin/users/' + u.id, { method: 'PATCH', body });
      d.close();
      toast(isNew ? 'User created' : 'User saved');
      loadUsers();
    } catch (e) { d.querySelector('.form-error').textContent = e.message; }
  });
}

function passwordDialog(u) {
  const d = dialog(`
    <h2>Set password</h2>
    <form novalidate>
      <p class="dim" style="margin:0">New password for <b>${esc(u.name)}</b>. They are signed out everywhere and can change it themselves in their profile.</p>
      <div class="field"><label>New password</label><input class="input" name="password" type="text" autocomplete="off" minlength="6" required></div>
      <p class="form-error" role="alert"></p>
      <div class="dlg-actions"><button type="button" class="btn ghost" data-a="cancel">Cancel</button><button class="btn primary" type="submit">Set password</button></div>
    </form>`);
  d.querySelector('form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try { await api('admin/users/' + u.id + '/password', { method: 'POST', body: { password: ev.target.password.value } }); d.close(); toast('Password set'); }
    catch (e) { d.querySelector('.form-error').textContent = e.message; }
  });
}

async function savesDialog(u) {
  const d = dialog(`<h2>Saves: ${esc(u.name)}</h2><div class="saves-list"><div>Loading...</div></div><div class="dlg-actions" style="margin-top:var(--sp-3)"><button class="btn" data-a="cancel">Close</button></div>`);
  const list = d.querySelector('.saves-list');
  try {
    const { saves } = await api('admin/users/' + u.id + '/saves');
    const names = { current: 'World', quest: 'Treasure Quest', profile: 'Profile' };
    list.innerHTML = saves.length ? saves.map((s) => `<div><b>${esc(names[s.slot] || s.slot)}</b> - ${esc(s.summary)}<br><span class="faint">Saved ${esc(fmt(s.savedAt))}</span></div>`).join('') : '<div>No cloud saves yet.</div>';
  } catch (e) { list.innerHTML = `<div>${esc(e.message)}</div>`; }
}

function confirmDialog(title, text, action) {
  const d = dialog(`<h2>${esc(title)}</h2><p class="dim">${esc(text)}</p><p class="form-error"></p><div class="dlg-actions"><button class="btn ghost" data-a="cancel">Cancel</button><button class="btn ember" data-a="ok">Delete</button></div>`);
  d.querySelector('[data-a="ok"]').addEventListener('click', async () => {
    try { await action(); d.close(); } catch (e) { d.querySelector('.form-error').textContent = e.message; }
  });
}

// ---------- start ----------
(async () => {
  try {
    const me = await api('me');
    if (me.role === 'superadmin') renderUsers();
    else renderLogin();
  } catch (e) {
    renderLogin(e.status === 503 ? 'Accounts are not configured on this server yet.' : '');
  }
})();
