import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole, openPause } from './helpers.js';

// Daily tasks (progress, claiming, the all-three bonus) and seasonal events.
test.describe('Daily tasks and events', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });

  test('today\'s three tasks count progress and pay out soul crystals', async ({ page }, info) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'daily');
    await page.evaluate(() => { window.__sc.game.profile.crystals = 0; });
    const d = await page.evaluate(() => { const g = window.__sc.game; g.daily.note('noop'); return g.profile.daily; });
    expect(d.tasks).toHaveLength(3);
    expect(new Set(d.tasks.map((x) => x.id)).size).toBe(3);
    // finish the first task through the real counters where it is easy, else directly
    await page.evaluate(() => { const g = window.__sc.game, t = g.profile.daily.tasks[0]; g.daily.note(t.id, t.goal); });
    await openPause(page, info);
    await expect(page.locator('[data-act="daily"] .dot')).toHaveText('1');
    await page.click('[data-act="daily"]');
    await expect(page.locator('.daily-row')).toHaveCount(3);
    await expect(page.locator('.daily-row.done')).toHaveCount(1);
    await page.locator('.daily-row.done button').click();
    await expect(page.locator('.daily-row.claimed')).toHaveCount(1);
    const c1 = await page.evaluate(() => window.__sc.game.profile.crystals);
    expect(c1).toBeGreaterThan(0);
    // finishing the other two adds the bonus
    await page.evaluate(() => { const g = window.__sc.game; for (const t of g.profile.daily.tasks) g.daily.note(t.id, t.goal); });
    await page.evaluate(() => window.__sc.ui.back());
    await page.click('[data-act="daily"]');
    for (let i = 0; i < 2; i++) await page.locator('.daily-row.done button').first().click();
    await expect(page.locator('.daily-row.claimed')).toHaveCount(3);
    const r = await page.evaluate(() => ({ c: window.__sc.game.profile.crystals, bonus: window.__sc.game.profile.daily.bonus, sum: window.__sc.game.profile.daily.tasks.reduce((a, t) => a + t.reward, 0) }));
    expect(r.bonus).toBe(true);
    expect(r.c).toBe(r.sum + 20);
    expect(problems).toEqual([]);
  });

  test('a forced Frostfall shows its banner, snow and a villager gift', async ({ page }) => {
    await openTitle(page, '&event=frost');
    await expect(page.locator('[data-event="frost"]')).toBeVisible();
    await startNewWorld(page, 'frost');
    await page.waitForFunction(() => window.__sc.game.event && window.__sc.game.event.id === 'frost');
    // snow drifts around the player
    await page.waitForFunction(() => { const p = window.__sc.game.entities.particles; return Array.from(p.life).some((l) => l < -1); }, null, { timeout: 10_000 });
    // the first villager of the day gives a gift
    await page.waitForFunction(() => window.__sc.game.entities.list.some((e) => e.villager), null, { timeout: 30_000 });
    const c0 = await page.evaluate(() => window.__sc.game.profile.crystals);
    await page.evaluate(() => { const g = window.__sc.game; window.__sc.ui.openTrade(g.entities.list.find((e) => e.villager)); });
    await page.waitForFunction((c) => window.__sc.game.profile.crystals === c + 5, c0);
    // only once a day
    await page.evaluate(() => { const g = window.__sc.game; window.__sc.ui.closeAll(); window.__sc.ui.openTrade(g.entities.list.find((e) => e.villager)); });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__sc.game.profile.crystals)).toBe(c0 + 5);
  });
});
