import { test, expect } from '@playwright/test';

// Accounts, against the real Pages Functions + a local D1 database
// (wrangler pages dev, superadmin admin / admin-pass-123).
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

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
  await expect(page.locator('.form-error')).toHaveText('Wrong email/phone or password.');
  await page.fill('#si-pass', 'mia-new-2');
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toContainText('Mia K');
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
  await ctx1.close();
  // device 2: fresh browser, sign in, continue
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await ctx2.newPage();
  await gameSignIn(p2, '+37120000001', 'mia-new-2');
  await expect(p2.locator('[data-act="continue"]')).toContainText('Cloud World');
  await p2.click('[data-act="continue"]');
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
