import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// The world map: pick a place, travel there for a life, respawn there.
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const mapOpen = (page) => page.locator('[data-screen="worldMap"]');
const pickWorld = (page, x, z) => page.evaluate(([x, z]) => document.querySelector('[data-screen="worldMap"]')._pickWorld(x, z), [x, z]);

test.describe('World map', () => {
  test.setTimeout(180_000);

  test('survival: travel costs a life, the place becomes the respawn point, a new day gives a life back', async ({ page }, info) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'mapworld');
    // the minimap and the lives chip are on the HUD
    await expect(page.locator('.minimap')).toBeVisible();
    await expect(page.locator('.lives-chip')).toHaveText('3/3');
    await shot(page, `wmap-${info.project.name}-hud`);

    await page.evaluate(() => window.__sc.ui.openMap());
    await expect(mapOpen(page)).toBeVisible();
    await expect(page.locator('.wmap-lives .life.on')).toHaveCount(3);
    const start = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    // a place 120 blocks east
    await page.waitForTimeout(400);
    await pickWorld(page, start.x + 120, start.z + 10);
    await expect(page.locator('.wmap-confirm')).toBeVisible();
    await expect(page.locator('.wmap-q')).toContainText('3/3');
    await shot(page, `wmap-${info.project.name}-picked`);
    await page.locator('.wmap-confirm [data-act="go"]').click();
    await page.waitForFunction(() => { const g = window.__sc.game; return g.meta.home && !document.querySelector('[data-screen="loading"]') && !g.paused; }, null, { timeout: 60_000 });
    const after = await page.evaluate(() => { const g = window.__sc.game, p = g.player.pos; return { x: p.x, z: p.z, y: p.y, lives: g.lives, home: g.meta.home, ground: g.world.groundBelow(p.x, 126, p.z) }; });
    expect(Math.hypot(after.x - (start.x + 120), after.z - (start.z + 10))).toBeLessThan(50);
    expect(after.lives).toBe(2);
    expect(Math.abs(after.y - (after.ground + 1.05))).toBeLessThan(1.5);
    await expect(page.locator('.lives-chip')).toHaveText('2/3');

    // dying brings the player back to the chosen place
    await page.evaluate(async () => { const g = window.__sc.game; g.player.pos.x -= 60; g.player.dead = true; await g.respawn(); });
    const back = await page.evaluate(() => { const g = window.__sc.game, p = g.player.pos; return { x: p.x, z: p.z }; });
    expect(Math.hypot(back.x - after.home.x, back.z - after.home.z)).toBeLessThan(3);

    // no lives: the map says so and the trip cannot start
    await page.evaluate(() => { window.__sc.game.meta.lives = 0; window.__sc.ui.closeAll(); window.__sc.ui.openMap(); });
    await page.waitForTimeout(300);
    await pickWorld(page, back.x - 80, back.z);
    await expect(page.locator('.wmap-confirm [data-act="go"]')).toBeDisabled();
    await page.evaluate(() => window.__sc.ui.closeAll());

    // a new day gives a life back
    await page.evaluate(() => { window.__sc.game.meta.time = 0.9995; });
    await page.waitForFunction(() => window.__sc.game.lives === 1, null, { timeout: 20_000 });
    expect(problems).toEqual([]);
  });

  test('creative: travel is free', async ({ page }) => {
    await openTitle(page);
    await page.click('[data-act="new"]');
    await page.fill('#nw-name', 'Free trips');
    await page.fill('#nw-seed', 'free');
    await page.click('[data-seg="mode"] [data-v="creative"]');
    await page.click('[data-act="create"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    expect(await page.evaluate(() => window.__sc.game.creative)).toBe(true);
    await expect(page.locator('.lives-chip')).toBeHidden();
    await page.evaluate(() => window.__sc.ui.openMap());
    await expect(page.locator('.wmap-lives')).toContainText(/free/i);
    const start = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    await page.waitForTimeout(300);
    await pickWorld(page, start.x - 90, start.z + 40);
    await page.locator('.wmap-confirm [data-act="go"]').click();
    await page.waitForFunction(() => window.__sc.game.meta.home && !window.__sc.game.paused, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__sc.game.lives)).toBe(3);
  });

  test('Malaga: the city map shows the landmarks and takes the player to Gibralfaro', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    await expect(page.locator('.minimap')).toBeVisible();
    await shot(page, 'wmap-city-hud');
    await page.evaluate(() => window.__sc.ui.openMap());
    await expect(mapOpen(page)).toBeVisible();
    await page.waitForTimeout(500);
    await shot(page, 'wmap-city-map');
    const gib = await page.evaluate(() => window.__sc.game.city.toXZ(36.72344, -4.41174));
    await pickWorld(page, gib.x + 12, gib.z + 30);
    await page.locator('.wmap-confirm [data-act="go"]').click();
    await page.waitForFunction(() => window.__sc.game.meta.home && !window.__sc.game.paused, null, { timeout: 60_000 });
    const p = await page.evaluate(() => { const g = window.__sc.game, p = g.player.pos; return { x: p.x, y: p.y, z: p.z, lives: g.lives }; });
    expect(Math.hypot(p.x - gib.x, p.z - gib.z)).toBeLessThan(80);
    expect(p.y).toBeGreaterThan(60); // up on the hill
    expect(p.lives).toBe(2);
    await shot(page, 'wmap-city-arrived');
  });
});
