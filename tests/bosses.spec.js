import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';
import { installBot } from './bot.js';

// Plays the whole guardian progression, start to victory screen, through the
// real Soul Map and real fight mechanics (a bot aims, parries and throws).
// God mode (dev panel) keeps it deterministic; everything else is the game.
const ORDER = ['voidDragon', 'shellKing', 'whirlwindKing', 'emberWarden', 'soulStorm'];

test.describe('Boss progression', () => {
  test.setTimeout(30 * 60_000);

  test('all five guardians can be defeated, in order, ending on the victory screen', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'runs once, on the desktop profile');
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 800, height: 450 });
    await openTitle(page, '&dev=1');
    await startNewWorld(page, 'bosses');
    // dev panel: god mode + a kit (includes the Void Lantern that opens the map)
    // (the desktop game holds pointer lock, so the panel is driven from the page)
    await expect(page.locator('[data-dev="god"]')).toHaveCount(1);
    await page.evaluate(() => { for (const k of ['god', 'give']) document.querySelector(`[data-dev="${k}"]`).click(); });
    expect(await page.evaluate(() => window.__sc.game.player.god)).toBe(true);
    await page.evaluate(installBot);

    for (const id of ORDER) {
      // the next guardian is ready on the Soul Map; the ones after it are locked
      await page.keyboard.press('KeyM');
      await expect(page.locator('[data-screen="map"]')).toBeVisible();
      const node = page.locator(`.map-node[data-boss="${id}"]`);
      await expect(node).toHaveClass(/ready/);
      const next = ORDER[ORDER.indexOf(id) + 1];
      if (next) await expect(page.locator(`.map-node[data-boss="${next}"]`)).toHaveClass(/locked/);
      await node.locator('button').click();
      await page.evaluate(() => window.__sc.input.exitLock());
      await page.waitForFunction(() => !document.querySelector('[data-screen="loading"]') && window.__sc.game.running && !window.__sc.game.paused, null, { timeout: 90_000 });
      // walk into the arena
      await page.evaluate((bossId) => {
        const g = window.__sc.game;
        const a = g.arenaFor(bossId);
        g.player.pos.set(a.x + 0.5, a.y + 1.1, a.z + (bossId === 'voidDragon' ? 12.5 : 9.5));
        g.player.vel.set(0, 0, 0);
      }, id);
      await page.waitForFunction((bossId) => window.__sc.game.bosses.active && window.__sc.game.bosses.active.id === bossId, id, { timeout: 30_000 });
      await expect(page.locator('.boss-bar')).toBeVisible();
      // the title card only shows for a few seconds; on a slow machine it can
      // be gone before this line runs, so check that it was shown for this boss
      await page.waitForFunction((bossId) => window.__sc.ui.hud.lastCard === window.__sc.game.bossName(bossId), id, { timeout: 20_000 });
      const t0 = Date.now();
      // poll, logging progress so a slow fight is visible in the CI log
      for (let i = 0; ; i++) {
        const st = await page.evaluate((bossId) => { const g = window.__sc.game; const b = g.bosses.active; return { done: g.meta.bosses[bossId], hp: b ? Math.round(b.hp) : null, fps: g.fps, pos: g.player.pos.toArray().map(Math.round), dim: g.meta.dim, paused: g.paused }; }, id);
        if (st.done) break;
        if (i % 3 === 0) console.log(id, JSON.stringify(st));
        expect(Date.now() - t0, `${id} not defeated in 12 minutes`).toBeLessThan(12 * 60_000);
        await page.waitForTimeout(5000);
      }
      const stats = await page.evaluate(() => ({ ...window.__bot, timer: undefined }));
      console.log(`${id} defeated in ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(stats));
      if (id !== 'soulStorm') {
        await expect(page.locator('.boss-bar')).toBeHidden({ timeout: 10_000 });
      }
    }
    // victory screen with stats
    await expect(page.locator('[data-screen="victory"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="victory"] .stats-grid div')).toHaveCount(7);
    const saved = await page.evaluate(async () => { await window.__sc.game.save(true); return window.__sc.game.meta.bosses; });
    expect(Object.values(saved).every(Boolean)).toBe(true);
    expect(problems).toEqual([]);
  });
});
