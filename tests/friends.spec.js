import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

// Friends: a request by username, accepting it, seeing the friend online in
// a world, and joining that world with one tap.
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
const ANA = { name: 'Ana', username: 'ana', password: 'ana-pass-1' };
const BEN = { name: 'Ben', username: 'ben', password: 'ben-pass-1' };
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.bringToFront(); await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function signIn(page, u) {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ } });
  await page.goto('/?nosw=1');
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', u.username);
  await page.fill('#si-pass', u.password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}
const running = (page) => page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });

test.describe('Friends', () => {
  test.setTimeout(240_000);
  test('a friend request, accepting it, and joining a friend\'s world from the friends list', async ({ browser, request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [ANA, BEN]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    // the local Pages server finds the rooms Worker a little after it starts
    await request.post('/api/auth/login', { data: { login: ANA.username, password: ANA.password } });
    for (let i = 0; i < 60 && !(await request.post('/api/mp/room', { data: { world: 'probe' } })).ok(); i++) await new Promise((r) => setTimeout(r, 1000));

    const ana = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const ben = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const pa = watchConsole(ana), pb = watchConsole(ben);
    await signIn(ana, ANA);
    await ana.click('[data-act="friends"]');
    await ana.fill('#fr-name', '@ben');
    await ana.click('[data-screen="friends"] button[type=submit]');
    await expect(ana.locator('.fr-row', { hasText: 'Ben' })).toContainText(/waiting/i);
    // unknown names are explained
    await ana.fill('#fr-name', 'nobody-here');
    await ana.click('[data-screen="friends"] button[type=submit]');
    await expect(ana.locator('[data-screen="friends"] .form-error')).toHaveText('There is no player with that username.');

    await signIn(ben, BEN);
    await expect(ben.locator('[data-act="friends"] .dot')).toHaveText('1', { timeout: 15_000 });
    await ben.click('[data-act="friends"]');
    await ben.locator('.fr-row', { hasText: 'Ana' }).locator('[data-a="accept"]').click();
    await expect(ben.locator('.fr-row', { hasText: 'Ana' })).toContainText('online');

    // Ana plays and opens her world to friends
    await ana.evaluate(() => window.__sc.ui.closeAll());
    await ana.evaluate(() => window.__sc.ui.showTitle());
    await ana.click('[data-act="new"]');
    await ana.fill('#nw-name', 'Ana Land');
    await ana.click('[data-act="create"]');
    await running(ana);
    await ana.evaluate(() => window.__sc.app.openRoom());
    // Ben sees it and joins with one tap
    await ben.evaluate(() => window.__sc.ui.back());
    await ben.click('[data-act="friends"]');
    await expect(ben.locator('.fr-row', { hasText: 'Ana' })).toContainText('Ana Land', { timeout: 20_000 });
    await shot(ben, 'friends-list');
    await ben.locator('.fr-row', { hasText: 'Ana' }).locator('[data-a="join"]').click();
    await running(ben);
    expect(await ben.evaluate(() => window.__sc.game.meta.name)).toBe('Ana Land');
    await expect(ben.locator('.room-chip')).toContainText('2/4');
    // (the unknown name answered 404, which the browser logs)
    expect(pa.filter((x) => !/status of 404/.test(x))).toEqual([]);
    expect(pb).toEqual([]);
  });
});
