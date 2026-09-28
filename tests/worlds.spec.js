import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Several worlds side by side, and a creative world with flight.
test.describe('Worlds', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });

  const create = async (page, name, creative) => {
    await page.click('[data-screen="title"] [data-act="new"]');
    await page.fill('#nw-name', name);
    await page.fill('#nw-seed', name.toLowerCase());
    if (creative) await page.click('[data-seg="mode"] [data-v="creative"]');
    await page.click('[data-act="create"]');
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    await page.waitForFunction(() => window.__sc.game.player.onGround || window.__sc.game.player.fly, null, { timeout: 20_000 });
  };
  const quit = (page) => page.evaluate(() => window.__sc.app.quitToTitle());

  test('two worlds are kept apart, can be switched and deleted', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await create(page, 'Alpha', false);
    await page.evaluate(() => { const g = window.__sc.game; g.meta.day = 4; g.inventory.add('gold_ingot', 3); });
    await quit(page);
    await create(page, 'Beta', true);
    // creative: catalog, free placing, no damage, flight
    const c = await page.evaluate(() => {
      const g = window.__sc.game;
      const before = g.inventory.count('planks');
      const hurt = g.damagePlayer(10, 'mob');
      return { creative: g.creative, hurt, before, crystalsBefore: g.profile.crystals };
    });
    expect(c.creative).toBe(true);
    expect(c.hurt).toBe(false);
    await page.evaluate(() => window.__sc.input.pressed.add('fly'));
    await page.waitForFunction(() => window.__sc.game.player.fly);
    await page.evaluate(() => { window.__sc.input.jumpTouch = true; });
    const y0 = await page.evaluate(() => window.__sc.game.player.pos.y);
    await page.waitForFunction((y) => window.__sc.game.player.pos.y > y + 2, y0);
    await page.evaluate(() => { window.__sc.input.jumpTouch = false; });
    await page.evaluate(() => window.__sc.ui.openInventory());
    await expect(page.locator('[data-f="catalog"].on')).toBeVisible();
    await page.locator('[data-catalog="gold_block"]').click();
    expect(await page.evaluate(() => window.__sc.game.inventory.count('gold_block'))).toBe(64);
    await page.evaluate(() => window.__sc.ui.closeAll());
    await quit(page);

    // the list shows both, newest first; continue opens the newest
    await expect(page.locator('[data-act="continue"]')).toContainText('Beta');
    await page.click('[data-act="worlds"]');
    await expect(page.locator('.world-row')).toHaveCount(2);
    await expect(page.locator('.world-row').first()).toContainText('Beta');
    await expect(page.locator('.world-row').first()).toContainText('Creative');
    await page.locator('.world-row', { hasText: 'Alpha' }).locator('[data-act="play"]').click();
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    const a = await page.evaluate(() => ({ name: window.__sc.game.meta.name, day: window.__sc.game.meta.day, gold: window.__sc.game.inventory.count('gold_ingot'), creative: window.__sc.game.creative }));
    expect(a).toEqual({ name: 'Alpha', day: 4, gold: 3, creative: false });
    await quit(page);

    // delete Beta
    await page.click('[data-act="worlds"]');
    await page.locator('.world-row', { hasText: 'Beta' }).locator('[data-act="delete"]').click();
    await page.click('[data-screen="confirmDelete"] [data-act="ok"]');
    await expect(page.locator('.world-row')).toHaveCount(1);
    await expect(page.locator('.world-row')).toContainText('Alpha');
    expect(problems).toEqual([]);
  });
});
