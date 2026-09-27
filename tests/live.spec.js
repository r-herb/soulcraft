import { test, expect } from '@playwright/test';

// Runs against the deployed site (LIVE_URL) after each deploy.
test('live site serves the game', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  const res = await page.goto('/');
  expect(res.status()).toBe(200);
  await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.logo').first()).toHaveText('Soulcraft');
  const sw = await page.request.get('/sw.js');
  expect(sw.status()).toBe(200);
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(problems.filter((p) => !/swiftshader|WebGL/i.test(p))).toEqual([]);
});

test('live accounts API and admin panel are up', async ({ page, request }) => {
  const me = await request.get('/api/me');
  expect(me.status()).toBe(200); // API + database reachable
  expect(await me.json()).toEqual({ role: null, user: null }); // nobody signed in
  expect((await request.get('/api/saves')).status()).toBe(401);
  await page.goto('/admin');
  await expect(page.locator('form[data-form="login"]')).toBeVisible({ timeout: 30_000 });
  // the superadmin from the GitHub secrets can sign in
  const login = process.env.SUPERADMIN_LOGIN, password = process.env.SUPERADMIN_PASSWORD;
  test.skip(!login || !password, 'SUPERADMIN_* secrets not set');
  await page.fill('#a-login', login);
  await page.fill('#a-pass', password);
  await page.click('form[data-form="login"] button[type=submit]');
  await expect(page.locator('table.users')).toBeVisible({ timeout: 30_000 });
  await page.request.post('/api/auth/logout', { data: {} });
});
