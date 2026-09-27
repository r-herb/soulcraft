import { test, expect } from '@playwright/test';
import { watchConsole, openTitle, startNewWorld, lookDown, openPause, breakTarget } from './helpers.js';

test.describe('Soulcraft smoke', () => {
  test('loads without console errors and shows the title screen', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await expect(page.locator('.logo').first()).toHaveText('Soulcraft');
    await expect(page.locator('[data-act="new"]')).toBeVisible();
    await page.waitForTimeout(500);
    expect(problems).toEqual([]);
  });

  test('language switch EN/RU changes text', async ({ page }) => {
    await openTitle(page);
    await page.click('[data-lang="en"]');
    await expect(page.locator('[data-act="new"]')).toHaveText('New World');
    await page.click('[data-lang="ru"]');
    await expect(page.locator('[data-act="new"]')).toHaveText('Новый мир');
    await expect(page.locator('.tagline')).toHaveText('Строй. Выживай. Освободи души.');
    // persisted and applied after reload
    await page.reload();
    await expect(page.locator('[data-act="new"]')).toHaveText('Новый мир');
    await page.click('[data-lang="en"]');
    await expect(page.locator('[data-act="new"]')).toHaveText('New World');
  });

  test('new world starts and the 3D world renders', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page);
    const st = await page.evaluate(() => { const g = window.__sc.game; return { chunks: g.world.loadedCount(), hud: !document.getElementById('hud').classList.contains('hidden') }; });
    expect(st.chunks).toBeGreaterThan(8);
    expect(st.hud).toBe(true);
    // the canvas shows real, varied pixels (not a blank colour)
    const shot = await page.locator('#game').screenshot();
    const distinct = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 32);
      const d = x.getImageData(0, 0, 64, 32).data; const set = new Set();
      for (let i = 0; i < d.length; i += 4) set.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
      return set.size;
    }, shot.toString('base64'));
    expect(distinct).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });

  test('player moves with the joystick / keyboard', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__sc.game.player.pos.toArray());
    if (info.project.name === 'mobile') {
      const zone = page.locator('.joy-zone');
      const box = await zone.boundingBox();
      const sx = box.x + box.width * 0.35, sy = box.y + box.height * 0.6;
      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await page.mouse.move(sx, sy - 60, { steps: 5 });
    } else {
      await page.keyboard.down('KeyW');
    }
    // keep pushing until the player has walked at least a block (slow CI GPUs render few frames)
    await page.waitForFunction((b) => { const p = window.__sc.game.player.pos; return Math.hypot(p.x - b[0], p.z - b[2]) > 1; }, before, { timeout: 15_000 });
    if (info.project.name === 'mobile') await page.mouse.up(); else await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => window.__sc.game.player.pos.toArray());
    const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
    expect(moved).toBeGreaterThan(1);
  });

  test('a block can be broken and placed', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page);
    // stand still on flat ground and look down
    await lookDown(page);
    // select an empty hand slot so we break with the hand
    await page.evaluate(() => window.__sc.game.selectSlot(8));
    const itemsBefore = await page.evaluate(() => window.__sc.game.inventory.slots.reduce((n, s) => n + (s ? s.count : 0), 0));
    const target = await breakTarget(page, info);
    expect(target).not.toBeNull();
    const broken = await page.evaluate((tg) => window.__sc.game.world.getBlock(tg.x, tg.y, tg.z), target);
    expect(broken).toBe(0);
    // the dropped block flies into the inventory
    await page.waitForFunction((n) => window.__sc.game.inventory.slots.reduce((m, s) => m + (s ? s.count : 0), 0) > n, itemsBefore, { timeout: 15_000 });
    // place planks back into the hole
    await page.evaluate(() => { const g = window.__sc.game; const i = g.inventory.slots.findIndex((s) => s && s.item === 'planks'); g.selectSlot(i); });
    await page.waitForTimeout(300);
    const placed0 = await page.evaluate(() => window.__sc.game.meta.stats.placed);
    if (info.project.name === 'mobile') {
      const b = await page.locator('.act.use').boundingBox();
      await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    } else {
      await page.evaluate(() => { window.__sc.input.pressed.add('use'); });
    }
    await page.waitForFunction((n) => window.__sc.game.meta.stats.placed > n, placed0, { timeout: 10_000 });
    const placed1 = await page.evaluate(() => window.__sc.game.meta.stats.placed);
    expect(placed1).toBe(placed0 + 1);
  });

  test('inventory opens and closes', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page);
    if (info.project.name === 'mobile') await page.locator('.act.inv').click();
    else await page.keyboard.press('KeyE');
    await expect(page.locator('[data-screen="inventory"]')).toBeVisible();
    await expect(page.locator('.recipe-list .slot').first()).toBeVisible();
    // recipe book auto-fills the grid: planks from logs needs a log
    await page.evaluate(() => window.__sc.game.inventory.add('log', 2));
    await page.locator('[data-f="can"]').click();
    await page.locator('[data-f="all"]').click();
    await page.locator('.recipe-list [data-recipe="planks"]').click();
    await page.locator('[data-result]').click();
    const planks = await page.evaluate(() => window.__sc.game.inventory.count('planks'));
    expect(planks).toBeGreaterThanOrEqual(20);
    await page.locator('[data-screen="inventory"] [data-act="close"]').click();
    await expect(page.locator('[data-screen="inventory"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__sc.game.paused)).toBe(false);
  });

  test('pause and settings work', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page);
    await openPause(page, info);
    expect(await page.evaluate(() => window.__sc.game.paused)).toBe(true);
    await page.locator('[data-screen="pause"] [data-act="settings"]').click();
    await expect(page.locator('[data-screen="settings"]')).toBeVisible();
    // switch language inside settings: applied instantly
    await page.locator('[data-seg="lang"] [data-v="ru"]').click();
    await expect(page.locator('[data-screen="settings"] .panel-title')).toHaveText('Настройки');
    await page.locator('[data-seg="lang"] [data-v="en"]').click();
    await expect(page.locator('[data-screen="settings"] .panel-title')).toHaveText('Settings');
    // toggle FPS counter
    await page.locator('[data-toggle="fps"] [data-v="1"]').click();
    await page.locator('[data-screen="settings"] [data-act="back"]').click();
    await expect(page.locator('[data-screen="pause"]')).toBeVisible();
    await page.locator('[data-screen="pause"] [data-act="resume"]').click();
    await expect(page.locator('[data-screen="pause"]')).toHaveCount(0);
    await expect(page.locator('.fps')).toBeVisible();
    expect(await page.evaluate(() => window.__sc.game.paused)).toBe(false);
  });

  test('saving and reloading keeps progress', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page, 'savetest');
    const mark = await page.evaluate(async () => {
      const g = window.__sc.game;
      g.inventory.add('gold_ingot', 7);
      const p = g.player.pos;
      const x = Math.floor(p.x) + 2, z = Math.floor(p.z), y = g.world.topSolid(x, z) + 1;
      g.world.setBlock(x, y, z, 42); // gold block
      g.meta.day = 3;
      return { x, y, z };
    });
    await openPause(page, info);
    await page.locator('[data-screen="pause"] [data-act="save"]').click();
    await expect(page.locator('.toast').first()).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await expect(page.locator('[data-act="continue"]')).toBeEnabled();
    await page.click('[data-act="continue"]');
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    const st = await page.evaluate((m) => { const g = window.__sc.game; return { gold: g.inventory.count('gold_ingot'), block: g.world.getBlock(m.x, m.y, m.z), day: g.meta.day }; }, mark);
    expect(st.gold).toBe(7);
    expect(st.block).toBe(42);
    expect(st.day).toBe(3);
  });
});
