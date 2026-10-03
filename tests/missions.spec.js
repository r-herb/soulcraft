import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Malaga missions: the HUD follows a mission with an arrow and a distance;
// walking past the landmarks, a bus ride to the beach, a paella, eating out
// and a first deposit each complete their mission.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Malaga missions', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(180_000);

  test('the tourist route, the bus ride, the paella, the critic and the first deposit', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });

    // the HUD follows the tourist route: the next place, its distance and an arrow
    await expect(page.locator('.quest-obj')).toBeVisible();
    await expect(page.locator('.quest-obj b')).toHaveText('The tourist route');
    await expect(page.locator('.quest-obj span')).toContainText(/Go to Plaza de la Constituci.n \(0\/5\) - \d+ m/);
    await expect(page.locator('.quest-obj .mis-arrow')).toBeVisible();
    await shot(page, 'missions-hud');

    // walk past the five landmarks (teleporting next to each)
    const visit = (name) => page.evaluate((n) => {
      const g = window.__sc.game, pl = window.__sc.missionPlace(n);
      const q = g.city.toXZ(pl.lat, pl.lon);
      g.player.pos.set(q.x + 3, 120, q.z + 3);
      g.missions.t = 5; g.missions.update(0);
    }, name);
    for (const n of ['Plaza de la Constitución', 'Catedral', 'Alcazaba', 'Gibralfaro']) await visit(n);
    expect(await page.evaluate(() => window.__sc.game.missions.prog('tour').seen.length)).toBe(4);
    await visit('La Malagueta');
    expect(await page.evaluate(() => window.__sc.game.missions.isDone('tour'))).toBe(true);
    // now the HUD follows the next mission
    await expect(page.locator('.quest-obj b')).not.toHaveText('The tourist route');

    // the bus: board, two stops, get off at the beach (getting off early starts over)
    const r = await page.evaluate(() => {
      const g = window.__sc.game, M = g.missions;
      const go = (name) => { const pl = window.__sc.missionPlace(name), q = g.city.toXZ(pl.lat, pl.lon); g.player.pos.set(q.x, 60, q.z); };
      go('Catedral');
      M.event('board'); M.event('stop'); M.event('getoff');
      const early = M.prog('bus').step;
      M.event('board'); M.event('stop'); M.event('stop');
      go('La Malagueta'); M.event('getoff');
      return { early, done: M.isDone('bus') };
    });
    expect(r).toEqual({ early: 0, done: true });

    // the paella: rice, cooking, eating it at the beach (not elsewhere)
    const p = await page.evaluate(() => {
      const g = window.__sc.game, M = g.missions;
      const go = (name) => { const pl = window.__sc.missionPlace(name), q = g.city.toXZ(pl.lat, pl.lon); g.player.pos.set(q.x, 60, q.z); };
      M.event('buy', { item: 'tomato' });
      const s0 = M.prog('paella').step;
      M.event('buy', { item: 'rice' }); M.event('craft', { item: 'paella' });
      go('Gibralfaro'); M.event('eat', { item: 'paella' });
      const notHere = M.isDone('paella');
      go('La Malagueta'); M.event('eat', { item: 'paella' });
      return { s0, notHere, done: M.isDone('paella') };
    });
    expect(p).toEqual({ s0: 0, notHere: false, done: true });

    // the critic: three different restaurants (the same one twice counts once)
    const c = await page.evaluate(() => {
      const M = window.__sc.game.missions;
      M.event('meal', { item: 'paella', key: '1,1' }); M.event('meal', { item: 'churros', key: '1,1' });
      const n = M.prog('critic').n;
      M.event('meal', { item: 'churros', key: '5,2' }); M.event('meal', { item: 'espetos', key: '9,9' });
      return { n, done: M.isDone('critic') };
    });
    expect(c).toEqual({ n: 1, done: true });

    // the missions screen from the pause menu: four done, the deposit to go
    await page.evaluate(() => window.__sc.ui.openPause());
    await page.click('[data-screen="pause"] [data-act="missions"]');
    await expect(page.locator('.mis-list .mis-card:not(.heist)')).toHaveCount(5);
    await expect(page.locator('.mis-list .mis-card.done:not(.heist)')).toHaveCount(4);
    // and the big mission: its box and its twelve tasks
    await expect(page.locator('.heist-card')).toBeVisible();
    await expect(page.locator('.mis-list .mis-card.heist')).toHaveCount(12);
    await expect(page.locator('.mis-card[data-id="deposit"] [data-a="track"]')).toBeVisible();
    await shot(page, 'missions-list');
    await page.evaluate(() => window.__sc.game.missions.event('deposit'));
    // (walking past the landmarks also met some of the big mission's informants)
    expect(await page.evaluate(() => Object.keys(window.__sc.game.profile.missions.done).filter((k) => !k.startsWith('h_')).length)).toBe(5);
    expect(problems).toEqual([]);
  });
});
