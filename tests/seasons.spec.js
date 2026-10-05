import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// La Fábrica's seasons picked on the title screen: four cards with where each
// one stands; a later season can be played without the earlier ones (in a new
// Malaga world the first time, then in that world); a finished season played
// again starts over, keeps its wardrobe items and pays nothing a second time.
test.describe('La Fábrica seasons', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('pick a season on the title screen, play a later one first, play a finished one again', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="seasons"]');
    const pick = page.locator('[data-screen="seasons"]');
    await expect(pick).toBeVisible();
    await expect(pick.locator('.season-card')).toHaveCount(4);
    await expect(pick.locator('.season-card.new')).toHaveCount(4);
    await expect(pick).toContainText('A new Malaga world');
    await expect(pick.locator('[data-seg="mode"] .on')).toHaveAttribute('data-v', 'survival');

    // season 4 straight away: a new Malaga world, season 4 open without seasons 1 to 3
    await pick.locator('[data-play="4"]').click();
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    const s4 = await page.evaluate(() => {
      const g = window.__sc.game, M = g.missions;
      return { city: g.meta.city, creative: g.creative, pick: g.profile.fabPick, open: g.aero.open, s3done: !!(g.profile.puerto && g.profile.puerto.done), ids: M.all().filter((m) => m.season === 4).map((m) => m.id), tracked: M.tracked && M.tracked.id };
    });
    expect(s4).toEqual({ city: 'malaga', creative: false, pick: 4, open: true, s3done: false, ids: ['f4_vuelo'], tracked: 'f4_vuelo' });

    // season 3 finished earlier; back on the title screen it shows as finished, in this world
    await page.evaluate(() => { const g = window.__sc.game, st = g.missions.state(); g.profile.puerto = { act: 8, done: true, paid: 0 }; for (const k of ['aviso', 'plan3', 'hacker']) st.done['f3_' + k] = Date.now(); });
    await page.evaluate(() => window.__sc.app.quitToTitle());
    await expect(page.locator('[data-screen="title"]')).toBeVisible({ timeout: 30_000 });
    await page.click('[data-act="seasons"]');
    await expect(pick.locator('.season-card[data-season="3"]')).toHaveClass(/done/);
    await expect(pick.locator('.season-card[data-season="4"]')).toHaveClass(/new/);
    await expect(pick).toContainText('Plays in your Malaga world');
    await expect(pick.locator('[data-play="3"]')).toHaveText('Play again');

    // played again: it starts over in the same world, the wardrobe keeps its items
    await pick.locator('[data-play="3"]').click();
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    const s3 = await page.evaluate(() => {
      const g = window.__sc.game, M = g.missions, s = g.puerto.state();
      return { act: s.act, done: s.done, cleared: s.cleared, open: g.puerto.open, steps: ['f3_aviso', 'f3_hacker'].map((id) => M.isDone(id)), tracked: M.tracked && M.tracked.id, worlds: window.__sc.app.worlds.filter((w) => w.city === 'malaga').length };
    });
    expect(s3).toEqual({ act: 0, done: false, cleared: true, open: true, steps: [false, false], tracked: 'f3_aviso', worlds: 1 });

    // its end, played again: no crystals a second time, and the finale says so
    const before = await page.evaluate(() => window.__sc.game.profile.crystals);
    await page.evaluate(() => window.__sc.game.puerto.finish());
    const end = page.locator('[data-screen="puertoFinale"]');
    await expect(end).toBeVisible();
    await expect(end).toContainText('Played again');
    expect(await page.evaluate(() => window.__sc.game.profile.crystals)).toBe(before);
    await end.locator('[data-act="close"]').click();
    expect(problems).toEqual([]);
  });
});
