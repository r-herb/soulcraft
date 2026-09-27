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

// ---------- users ----------
let query = '';
async function renderUsers() {
  root.innerHTML = `
    <div class="admin-wrap">
      <div class="admin-top"><h1>Soulcraft Admin</h1><a class="btn small ghost" href="/">Open the game</a><button class="btn small ember" data-act="logout">Sign out</button></div>
      <div class="admin-card">
        <div class="toolbar">
          <input class="input" type="search" placeholder="Search by name, email or phone" value="${esc(query)}" data-act="search">
          <button class="btn primary" data-act="add">+ Add user</button>
        </div>
      </div>
      <div class="admin-card"><table class="users"><thead><tr><th></th><th>Name</th><th>Email</th><th>Phone</th><th>Created</th><th>Last sign-in</th><th>Saves</th><th>Status</th><th></th></tr></thead><tbody><tr><td colspan="9" class="empty">Loading...</td></tr></tbody></table></div>
    </div>`;
  root.querySelector('[data-act="logout"]').addEventListener('click', async () => { await api('auth/logout', { method: 'POST', body: {} }).catch(() => {}); renderLogin(); });
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
      <td><b>${esc(u.name)}</b></td><td>${esc(u.email || '-')}</td><td>${esc(u.phone || '-')}</td>
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
      <div class="field"><label>Email</label><input class="input" name="email" type="email" maxlength="120" value="${esc(u ? u.email || '' : '')}"></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" type="tel" maxlength="24" value="${esc(u ? u.phone || '' : '')}" placeholder="+371 20000000"></div>
      ${isNew ? '<div class="field"><label>Password (the player can change it later)</label><input class="input" name="password" type="text" autocomplete="off" minlength="6"></div>' : ''}
      <p class="faint" style="margin:0">The player signs in with the email or the phone number, and the password.</p>
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
    const body = { name: f.name.value, email: f.email.value, phone: f.phone.value, avatar };
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
