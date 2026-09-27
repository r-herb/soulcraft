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
