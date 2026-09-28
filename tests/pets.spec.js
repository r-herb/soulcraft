import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Companions from the Soul Shop follow the player and fight for them.
test.describe('Companions', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });

  test('a fox bought in the shop follows the player and defeats a monster', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'pets');
    await page.evaluate(() => { const g = window.__sc.game; g.profile.crystals = 100; g.player.god = true; });
    await page.evaluate(() => window.__sc.ui.open('shop'));
    await page.click('[data-tab="pets"]');
    await page.click('[data-pet="fox"]');
    await page.click('.pv-act');
    await expect(page.locator('[data-pet="fox"]')).toContainText('With you');
    expect(await page.evaluate(() => ({ c: window.__sc.game.profile.crystals, pet: window.__sc.game.profile.pet }))).toEqual({ c: 40, pet: 'fox' });
    // closing the shop on desktop can reopen the pause menu (pointer lock
    // lost); close it again until the game runs
    await page.waitForFunction(() => { const g = window.__sc.game; if (g.paused) { window.__sc.input.pressed.clear(); window.__sc.ui.closeAll(); } return !g.paused && g.pet && g.pet.kind === 'fox'; }, null, { timeout: 15_000, polling: 250 });
    // it keeps up when the player moves away
    await page.evaluate(() => { const g = window.__sc.game; g.player.pos.x += 40; });
    await page.waitForFunction(() => { const g = window.__sc.game; if (g.paused) window.__sc.ui.closeAll(); return g.pet.pos.distanceTo(g.player.pos) < 8; }, null, { timeout: 20_000, polling: 250 });
    // a monster next to the player gets bitten until it is gone
    const hp0 = await page.evaluate(() => {
      const g = window.__sc.game, p = g.player.pos;
      const m = g.entities.spawnMob('skitter', p.x + 3, p.y + 0.5, p.z);
      window.__mob = m;
      return m.hp;
    });
    expect(hp0).toBeGreaterThan(0);
    await page.waitForFunction(() => { if (window.__sc.game.paused) window.__sc.ui.closeAll(); return window.__mob.dead; }, null, { timeout: 30_000, polling: 250 });
    // leaving it at home removes it
    await page.evaluate(() => { window.__sc.game.profile.pet = null; });
    await page.waitForFunction(() => !window.__sc.game.entities.list.some((e) => e.isPet), null, { timeout: 5_000 });
    expect(problems).toEqual([]);
  });
});
