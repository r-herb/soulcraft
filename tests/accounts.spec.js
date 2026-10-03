import { test, expect } from '@playwright/test';

// Accounts, against the real Pages Functions + a local D1 database
// (wrangler pages dev, superadmin admin / admin-pass-123).
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

// SHOTS=dir saves screenshots of these screens for a visual check
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true }); };

async function adminSignIn(page) {
  await page.goto('/admin');
  await page.fill('#a-login', ADMIN.login);
  await page.fill('#a-pass', ADMIN.password);
  await page.click('form[data-form="login"] button[type=submit]');
  await expect(page.locator('table.users')).toBeVisible();
}

async function addUser(page, u) {
  await page.click('[data-act="add"]');
  const d = page.locator('dialog.admin-dlg');
  await d.locator('[name="name"]').fill(u.name);
  if (u.username) await d.locator('[name="username"]').fill(u.username);
  if (u.email) await d.locator('[name="email"]').fill(u.email);
  if (u.phone) await d.locator('[name="phone"]').fill(u.phone);
  await d.locator('[name="password"]').fill(u.password);
  await d.locator('button[type=submit]').click();
  await expect(d).toHaveCount(0);
  await expect(page.locator('table.users', { hasText: u.name })).toBeVisible();
}

async function gameSignIn(page, login, password) {
  await page.goto('/?nosw=1');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', login);
  await page.fill('#si-pass', password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('superadmin manages users in the admin panel', async ({ page }) => {
  // a wrong password is refused
  await page.goto('/admin');
  await page.fill('#a-login', ADMIN.login);
  await page.fill('#a-pass', 'nope');
  await page.click('form[data-form="login"] button[type=submit]');
  await expect(page.locator('.form-error')).toHaveText('Wrong username or password.');

  await adminSignIn(page);
  await addUser(page, { name: 'Mia', email: 'mia@example.com', phone: '+371 2000 0001', password: 'mia-pass-1' });
  await addUser(page, { name: 'Temp', phone: '+37129999999', password: 'temp-pass-1' });
  // duplicate email is rejected with a clear message
  await page.click('[data-act="add"]');
  const d = page.locator('dialog.admin-dlg');
  await d.locator('[name="name"]').fill('Copy');
  await d.locator('[name="email"]').fill('MIA@example.com');
  await d.locator('[name="password"]').fill('whatever1');
  await d.locator('button[type=submit]').click();
  await expect(d.locator('.form-error')).toHaveText('That email is already used by another user.');
  await d.locator('[data-a="cancel"]').click();
  // edit: add a photo
  const row = page.locator('tr', { hasText: 'Mia' });
  await row.locator('[data-a="edit"]').click();
  await page.locator('dialog [data-a="photo"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('dialog img.av')).toHaveAttribute('src', /^data:image/);
  await page.locator('dialog button[type=submit]').click();
  await expect(page.locator('tr', { hasText: 'Mia' }).locator('img.av')).toBeVisible();
  // search, disable/enable, delete
  await page.fill('[data-act="search"]', 'temp');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  const temp = page.locator('tr', { hasText: 'Temp' });
  await temp.locator('[data-a="toggle"]').click();
  await expect(temp.locator('.badge')).toHaveText('Disabled');
  await temp.locator('[data-a="del"]').click();
  await page.locator('dialog [data-a="ok"]').click();
  await expect(page.locator('tbody')).toContainText('No users match.');
});

test('a player signs in with a phone number, edits the profile and changes the password', async ({ page }) => {
  await gameSignIn(page, '+37120000001', 'mia-pass-1');
  await expect(page.locator('[data-act="profile"]')).toContainText('Mia');
  await page.click('[data-act="profile"]');
  await page.fill('#pf-name', 'Mia K');
  await page.locator('[data-form="profile"] button[type=submit]').click();
  await expect(page.locator('.toast').last()).toHaveText('Profile saved');
  await page.locator('[data-act="photo"]').setInputFiles({ name: 'b.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.locator('.avatar-lg img')).toBeVisible();
  // password change: wrong current password is refused, then it works
  await page.fill('#pw-cur', 'wrong-one');
  await page.fill('#pw-new', 'mia-new-2');
  await page.fill('#pw-rep', 'mia-new-2');
  await page.locator('[data-form="password"] button[type=submit]').click();
  await expect(page.locator('[data-err="password"]')).toHaveText('The current password is wrong.');
  await page.fill('#pw-cur', 'mia-pass-1');
  await page.locator('[data-form="password"] button[type=submit]').click();
  await expect(page.locator('.toast').last()).toHaveText('Password changed');
  await page.click('[data-act="signout"]');
  await expect(page.locator('[data-act="signin"]')).toBeVisible();
  // the old password no longer works; the new one does, with the email
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', 'mia@example.com');
  await page.fill('#si-pass', 'mia-pass-1');
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('.form-error')).toHaveText('Wrong username or password.');
  await page.fill('#si-pass', 'mia-new-2');
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toContainText('Mia K');
});

test('a player signs in with a short username', async ({ page }) => {
  await adminSignIn(page);
  await addUser(page, { name: 'Teo', username: 'Teo', password: 'teo-pass-1' });
  await expect(page.locator('table.users', { hasText: '@teo' })).toBeVisible();
  // the same username twice is refused
  await page.click('[data-act="add"]');
  const d = page.locator('dialog.admin-dlg');
  await d.locator('[name="name"]').fill('Teo 2');
  await d.locator('[name="username"]').fill('TEO');
  await d.locator('[name="password"]').fill('whatever1');
  await d.locator('button[type=submit]').click();
  await expect(d.locator('.form-error')).toHaveText('That username is already taken.');
  await d.locator('[data-a="cancel"]').click();
  // any capitalisation signs in
  await gameSignIn(page, 'teo', 'teo-pass-1');
  await expect(page.locator('[data-act="profile"]')).toContainText('Teo');
});

test('saves follow the player to another device, and "keep me signed in" survives a reload', async ({ browser }) => {
  // device 1: play and save
  const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p1 = await ctx1.newPage();
  await gameSignIn(p1, 'mia@example.com', 'mia-new-2');
  await p1.reload();
  await expect(p1.locator('[data-act="profile"]')).toContainText('Mia K'); // autologin
  await p1.click('[data-act="new"]');
  await p1.fill('#nw-name', 'Cloud World');
  await p1.click('[data-act="create"]');
  await p1.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
  await p1.evaluate(async () => { const g = window.__sc.game; g.meta.day = 7; g.inventory.add('gold_ingot', 5); g.profile.crystals = 42; await g.save(true); });
  await p1.waitForTimeout(1500); // debounced upload
  // a second, creative world
  await p1.evaluate(() => window.__sc.app.quitToTitle());
  await p1.click('[data-screen="title"] [data-act="new"]');
  await p1.fill('#nw-name', 'Sky Build');
  await p1.click('[data-seg="mode"] [data-v="creative"]');
  await p1.click('[data-act="create"]');
  await p1.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
  await p1.evaluate(async () => { await window.__sc.game.save(true); });
  await p1.waitForTimeout(1500);
  // an old-style single cloud world ("current" slot) is picked up as a third world
  await p1.evaluate(async () => {
    const r = await fetch('/api/saves/current', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { version: 1, name: 'Old World', seed: 5, day: 3, difficulty: 'normal', dim: 'overworld', time: 0.2, edits: {}, bosses: {}, stats: {} }, savedAt: 1000 }) });
    if (!r.ok) throw new Error('put current ' + r.status);
  });
  await ctx1.close();
  // device 2: fresh browser, sign in, continue
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  await gameSignIn(p2, '+37120000001', 'mia-new-2');
  await expect(p2.locator('[data-act="continue"]')).toContainText('Sky Build');
  await p2.click('[data-act="worlds"]');
  await expect(p2.locator('.world-row')).toHaveCount(3);
  await expect(p2.locator('.world-row', { hasText: 'Sky Build' })).toContainText('Creative');
  await expect(p2.locator('.world-row', { hasText: 'Old World' })).toBeVisible();
  await p2.locator('.world-row', { hasText: 'Cloud World' }).locator('[data-act="play"]').click();
  await p2.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
  const st = await p2.evaluate(() => ({ day: window.__sc.game.meta.day, gold: window.__sc.game.inventory.count('gold_ingot'), crystals: window.__sc.game.profile.crystals }));
  expect(st).toEqual({ day: 7, gold: 5, crystals: 42 });
  await ctx2.close();
});

test('the admin sees the player\'s saves and can reset the password', async ({ page }) => {
  await adminSignIn(page);
  const row = page.locator('tr', { hasText: 'Mia K' });
  await row.locator('[data-a="saves"]').click();
  await expect(page.locator('dialog .saves-list')).toContainText('Cloud World');
  await page.locator('dialog [data-a="cancel"]').click();
  await row.locator('[data-a="pw"]').click();
  await page.locator('dialog [name="password"]').fill('reset-by-admin');
  await page.locator('dialog button[type=submit]').click();
  await expect(page.locator('.admin-toast')).toHaveText('Password set');
  await gameSignIn(page, 'mia@example.com', 'reset-by-admin');
});

test('a player resets a forgotten password with the emailed link', async ({ page }) => {
  await page.goto('/?nosw=1');
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', 'mia@example.com');
  await page.click('[data-act="forgot"]');
  await expect(page.locator('#fp-email')).toHaveValue('mia@example.com');
  // the local test server returns the link instead of emailing it
  const link = await page.evaluate(async () => (await (await fetch('/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mia@example.com' }) })).json()).testLink);
  expect(link).toContain('/?reset=');
  await page.click('[data-screen="forgot"] [data-act="submit"]');
  await expect(page.locator('.form-ok')).toContainText('link is on its way');
  // an unknown address gets the same answer
  await page.fill('#fp-email', 'nobody@example.com');
  await page.click('[data-screen="forgot"] [data-act="submit"]');
  await expect(page.locator('.form-ok')).toContainText('link is on its way');
  // only the newest link works; open it and choose a new password
  const fresh = await page.evaluate(async () => (await (await fetch('/api/auth/forgot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'mia@example.com' }) })).json()).testLink);
  await page.goto(new URL(fresh).pathname + new URL(fresh).search);
  await expect(page.locator('[data-screen="reset"]')).toBeVisible();
  await page.fill('#rp-new', 'from-the-email');
  await page.fill('#rp-rep', 'from-the-email');
  await page.click('[data-screen="reset"] [data-act="submit"]');
  await expect(page.locator('[data-screen="signin"]')).toBeVisible();
  await page.fill('#si-login', 'mia@example.com');
  await page.fill('#si-pass', 'from-the-email');
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toContainText('Mia K');
  // a used link does not work twice
  const again = await page.evaluate(async (tok) => (await fetch('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, password: 'another-one' }) })).status, new URL(fresh).searchParams.get('reset'));
  expect(again).toBe(400);
});

test('the admin sees statistics', async ({ page }) => {
  await adminSignIn(page);
  await page.click('[data-nav="stats"]');
  await expect(page.locator('.stat-tiles').first().locator('.stat-tile')).toHaveCount(6);
  const tile = (label) => page.locator('.stat-tile').filter({ has: page.locator('.st-label', { hasText: new RegExp('^' + label + '$') }) }).locator('.st-value');
  await expect(tile('Players')).toHaveText('2'); // Mia and Teo
  await expect(tile('Worlds in the cloud')).toHaveText('3');
  await expect(page.locator('.chart').first().locator('.bar')).toHaveCount(1); // both were active today
  await page.locator('.chart').first().locator('.hit').last().hover();
  await expect(page.locator('.chart').first().locator('.tip')).toContainText('2 active players');
  await page.locator('[data-act="table"]').first().click();
  await expect(page.locator('.chart-table').first().locator('tbody tr')).toHaveCount(14);
  await expect(page.locator('.top-list li')).toHaveCount(2);
});

test('a player sends an idea from the pause menu and the admin reads it', async ({ page }) => {
  await gameSignIn(page, 'teo', 'teo-pass-1');
  await page.click('[data-act="new"]');
  await page.fill('#nw-seed', 'feedback');
  await page.click('[data-act="create"]');
  await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
  // a death is counted by its cause (for the statistics), then saved
  await page.evaluate(async () => { const g = window.__sc.game; g.damagePlayer(999, 'fall'); await g.respawn(); window.__sc.ui.closeAll(); await g.save(true); });
  if (process.env.SHOTS) await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => window.__sc.ui.openPause());
  await shot(page, 'pause-phone');
  if (process.env.SHOTS) { await page.setViewportSize({ width: 780, height: 360 }); await shot(page, 'pause-short'); await page.setViewportSize({ width: 844, height: 390 }); }
  await expect(page.locator('[data-screen="pause"] [data-act="feedback"]')).toBeVisible();
  // (the pause screen may be re-rendered while the pointer lock settles: open the form directly)
  await page.evaluate(() => window.__sc.ui.open('feedback'));
  await page.click('[data-screen="feedback"] [data-v="bug"]');
  await page.click('[data-screen="feedback"] [data-act="send"]');
  await expect(page.locator('[data-screen="feedback"] .form-error')).toHaveText('Write a few words first.');
  await page.fill('#fb-text', 'The pig ran into the lava <b>twice</b>');
  await shot(page, 'feedback-phone');
  if (process.env.SHOTS) await page.setViewportSize({ width: 1280, height: 720 });
  await page.click('[data-screen="feedback"] [data-act="send"]');
  await expect(page.locator('.toast', { hasText: 'Thanks! The admin will read it.' })).toBeVisible();
  await expect(page.locator('[data-screen="feedback"]')).toHaveCount(0);

  await adminSignIn(page);
  await expect(page.locator('[data-fb-badge]')).toHaveText('1');
  await page.click('[data-nav="feedback"]');
  const item = page.locator('.fb-item').first();
  await expect(item.locator('.fb-body')).toHaveText('The pig ran into the lava <b>twice</b>'); // shown as text, not HTML
  await expect(item.locator('.badge')).toHaveText('Problem');
  await expect(item).toContainText('Teo');
  await expect(item.locator('.fb-ctx')).toContainText('survival');
  await shot(page, 'admin-feedback');
  await item.locator('[data-a="done"]').click();
  await expect(page.locator('.fb-item.done')).toHaveCount(1);
  await expect(page.locator('[data-fb-badge]')).toBeHidden();

  // the statistics page shows how the game is played
  await page.click('[data-nav="stats"]');
  await expect(page.locator('[data-insights] .stat-tile')).toHaveCount(3);
  await expect(page.locator('[data-chart="quest"] .hit')).toHaveCount(20);
  await expect(page.locator('.cause-list')).toContainText('Falls');
  await expect(page.locator('.insights-table tbody tr', { hasText: 'Teo' })).toContainText('@teo');
  await page.locator('[data-chart="quest"] .hit').first().hover();
  await shot(page, 'admin-insights');
});

test('the superadmin makes a player an admin; admins add and ban players but cannot delete or change admins', async ({ page, playwright, baseURL }) => {
  const sup = await playwright.request.newContext({ baseURL });
  expect((await sup.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
  const mk = async (u) => { const r = await sup.post('/api/admin/users', { data: u }); expect([201, 409]).toContain(r.status()); };
  await mk({ name: 'Moda', username: 'moda', password: 'moda-pass-1' });
  await mk({ name: 'Rowdy', username: 'rowdy', password: 'rowdy-pass-1' });
  const users = (await (await sup.get('/api/admin/users?q=')).json()).users;
  const moda = users.find((u) => u.username === 'moda'), rowdy = users.find((u) => u.username === 'rowdy');
  expect((await sup.post(`/api/admin/users/${moda.id}/role`, { data: { role: 'admin' } })).ok()).toBeTruthy();

  // the new admin signs in with the player account and uses the admin API
  const adm = await playwright.request.newContext({ baseURL });
  const me = await (await adm.post('/api/auth/login', { data: { login: 'moda', password: 'moda-pass-1' } })).json();
  expect(me.user.role).toBe('admin');
  expect((await adm.get('/api/admin/users?q=')).ok()).toBeTruthy();
  expect((await adm.post('/api/admin/users', { data: { name: 'Newbie', username: 'newbie', password: 'newbie-pass' } })).status()).toBe(201);
  // bans: the player cannot sign in, and is told why
  expect((await adm.post(`/api/admin/users/${rowdy.id}/ban`, { data: { minutes: 60, reason: 'rude in the chat' } })).ok()).toBeTruthy();
  const blocked = await (await playwright.request.newContext({ baseURL })).post('/api/auth/login', { data: { login: 'rowdy', password: 'rowdy-pass-1' } });
  expect(blocked.status()).toBe(403);
  expect(await blocked.json()).toMatchObject({ error: 'banned', reason: 'rude in the chat' });
  // limits of an admin
  expect((await adm.delete(`/api/admin/users/${rowdy.id}`)).status()).toBe(403);
  expect((await adm.post(`/api/admin/users/${rowdy.id}/role`, { data: { role: 'admin' } })).status()).toBe(403);
  expect((await adm.patch(`/api/admin/users/${moda.id}`, { data: { name: 'x' } })).status()).toBe(403);
  // the ban is lifted; the log shows who did what
  expect((await adm.delete(`/api/admin/users/${rowdy.id}/ban`)).ok()).toBeTruthy();
  expect((await (await playwright.request.newContext({ baseURL })).post('/api/auth/login', { data: { login: 'rowdy', password: 'rowdy-pass-1' } })).ok()).toBeTruthy();
  const log = (await (await sup.get('/api/admin/audit')).json()).entries;
  expect(log.some((e) => e.action === 'ban' && e.actorName === 'Moda' && e.targetName === 'Rowdy')).toBe(true);
  expect(log.some((e) => e.action === 'role' && e.actorName === 'Superadmin')).toBe(true);

  // the admin panel works for the admin (without the superadmin's buttons)
  await page.goto('/admin');
  await page.fill('#a-login', 'moda');
  await page.fill('#a-pass', 'moda-pass-1');
  await page.click('form[data-form="login"] button[type=submit]');
  await expect(page.locator('table.users')).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Rowdy' }).locator('[data-a="ban"]')).toBeVisible();
  await expect(page.locator('[data-a="del"]')).toHaveCount(0);
  await page.click('[data-nav="audit"]');
  await expect(page.locator('.audit-list')).toContainText('Moda');
  await shot(page, 'admin-audit');
});

test('superadmin analytics: sign-ins with device, screen and place, play time; the superadmin plays and comes back; the godmode badge', async ({ page, playwright, baseURL, request }) => {
  expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
  const zoe = { name: 'Zoe Analytics', username: 'zoe_an', password: 'zoe-pass-1' };
  expect([201, 409]).toContain((await request.post('/api/admin/users', { data: zoe })).status());
  // Zoe signs in from a phone-sized screen, then plays Malaga for a moment
  const z = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36' } });
  expect((await z.post('/api/auth/login', { data: { login: zoe.username, password: zoe.password, screen: '412x915@2.63' } })).ok()).toBeTruthy();
  await z.post('/api/presence', { data: { world: 'Malaga', city: 'malaga', mode: 'malaga', screen: '412x915@2.63' } });
  await new Promise((r) => setTimeout(r, 2200));
  await z.post('/api/presence', { data: { world: 'Malaga', city: 'malaga', mode: 'malaga', screen: '412x915@2.63' } });
  const list = (await (await request.get('/api/admin/analytics')).json()).users;
  const row = list.find((u) => u.username === zoe.username);
  expect(row.last).toMatchObject({ screen: '412x915@2.63', device: 'Android 14, Chrome, phone' });
  expect(row.online).toBe(true);
  expect(row.now).toMatchObject({ world: 'Malaga', mode: 'malaga' });
  expect(row.played30).toBeGreaterThanOrEqual(2);
  const det = await (await request.get('/api/admin/analytics/' + row.id)).json();
  expect(det.visits[0]).toMatchObject({ kind: 'login', screen: '412x915@2.63' });
  expect(det.play[0]).toMatchObject({ mode: 'malaga', world: 'Malaga' });
  // players cannot see analytics
  expect((await z.get('/api/admin/analytics')).status()).toBe(403);

  // the panel: the analytics tab and a player's details
  await adminSignIn(page);
  await page.click('[data-nav="analytics"]');
  await expect(page.locator('.analytics-table')).toContainText('Zoe Analytics');
  await page.locator('.analytics-table tr', { hasText: 'Zoe Analytics' }).click();
  await expect(page.locator('.analytics-detail')).toContainText('Malaga');
  await expect(page.locator('.analytics-detail')).toContainText('412x915');
  await shot(page, 'admin-analytics');

  // the superadmin plays: into the game with an own player account (an admin), and back to the panel
  await page.click('[data-act="play"]');
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-act="adminpanel"]')).toBeVisible({ timeout: 15_000 });
  const me = await page.evaluate(async () => (await (await fetch('/api/me')).json()));
  expect(me.user).toMatchObject({ role: 'admin', superLink: true });
  // the godmode badge: the server says who is an admin
  const badges = await page.evaluate(async (ids) => (await (await fetch('/api/badges?ids=' + ids.join(','))).json()), [me.user.id, row.id]);
  expect(badges.admins).toEqual([me.user.id]);
  await page.click('[data-act="adminpanel"]');
  await expect(page.locator('.admin-tabs')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-nav="analytics"]')).toBeVisible();
});
