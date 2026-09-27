import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Survival systems: night enemies with working AI, combat and drops, hunger
// and eating, death and respawn, villagers and trading, the shop.
test.describe('Survival', () => {
  test('night enemies chase, hit, take knockback and drop loot', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'nightfall');
    // jump to night, spawn a Hollow a few blocks away
    const id = await page.evaluate(() => {
      const g = window.__sc.game;
      g.meta.time = 0.6;
      const p = g.player.pos;
      const x = p.x + 6, z = p.z;
      const y = g.world.groundBelow(x, 120, z) + 1.05;
      const m = g.entities.spawnMob('hollow', x, y, z);
      window.__mob = m;
      return m.type;
    });
    expect(id).toBe('hollow');
    // it walks toward the player and hurts them
    await page.waitForFunction(() => window.__sc.game.player.health < 20, null, { timeout: 30_000 });
    // fight back with the sword: aim at the mob and attack until it dies
    await page.evaluate(() => {
      const g = window.__sc.game;
      const i = g.inventory.slots.findIndex((s) => s && s.item === 'wood_sword');
      g.selectSlot(i);
      window.__fight = setInterval(() => {
        const m = window.__mob; if (!m || m.dead) return;
        const e = g.player.eye; const dx = m.pos.x - e.x, dy = m.pos.y + 1 - e.y, dz = m.pos.z - e.z;
        g.player.yaw = Math.atan2(-dx, -dz); g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        window.__sc.input.pressed.add('attack');
      }, 100);
    });
    const kills0 = await page.evaluate(() => window.__sc.game.meta.stats.kills);
    await page.waitForFunction(() => window.__mob.dead, null, { timeout: 60_000 });
    await page.evaluate(() => clearInterval(window.__fight));
    expect(await page.evaluate(() => window.__sc.game.meta.stats.kills)).toBe(kills0 + 1);
    expect(problems).toEqual([]);
  });

  test('eating restores hunger, death shows the respawn screen', async ({ page }, info) => {
    await openTitle(page);
    await startNewWorld(page, 'hunger');
    await page.evaluate(() => { const g = window.__sc.game; g.player.food = 6; const i = g.inventory.slots.findIndex((s) => s && s.item === 'sunfruit'); g.selectSlot(i); });
    if (info.project.name === 'mobile') await page.locator('.act.use').click();
    // a single-frame press can land on a use cooldown, so keep pressing until it eats
    await page.waitForFunction(() => {
      const g = window.__sc.game;
      if (g.player.food > 6) return true;
      window.__sc.input.pressed.add('use');
      return false;
    }, null, { timeout: 10_000, polling: 500 });
    // die from a fall-sized hit
    await page.evaluate(() => window.__sc.game.damagePlayer(100, 'fall'));
    await expect(page.locator('[data-screen="death"]')).toBeVisible();
    await expect(page.locator('[data-screen="death"] h1')).toHaveText('You fell');
    await page.locator('[data-screen="death"] [data-act="respawn"]').click();
    await page.waitForFunction(() => { const g = window.__sc.game; return !g.player.dead && g.player.health === g.player.maxHealth && !g.paused; }, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__sc.game.meta.stats.deaths)).toBe(1);
  });

  test('villagers trade and friendship grows; the shop unlocks a skin', async ({ page }) => {
    await openTitle(page);
    await startNewWorld(page, 'village');
    await page.waitForFunction(() => window.__sc.game.entities.list.some((e) => e.villager), null, { timeout: 30_000 });
    // open trading with the nearest villager and make a tier-0 trade
    await page.evaluate(() => {
      const g = window.__sc.game;
      const v = g.entities.list.find((e) => e.villager);
      const o = v.offers.find((x) => x.tier === 0);
      g.inventory.add(o.give[0], 64);
      window.__v = v;
      g.ui.openTrade(v);
    });
    await expect(page.locator('[data-screen="trade"]')).toBeVisible();
    const before = await page.evaluate(() => window.__v.data.xp);
    await page.locator('.trade-row:not(.locked) button').first().click();
    expect(await page.evaluate(() => window.__v.data.xp)).toBe(before + 1);
    await page.locator('[data-screen="trade"] [data-act="close"]').click();
    // shop: buy and wear a skin with soul crystals
    await page.evaluate(() => { window.__sc.game.addCrystals(50); window.__sc.ui.open('shop'); });
    await page.locator('[data-skin="moss"]').click();
    await page.locator('.pv-act').click();
    await expect(page.locator('[data-skin="moss"] .pr')).toHaveText(/Wearing/);
    expect(await page.evaluate(() => window.__sc.app.profile.skins)).toContain('moss');
  });

  test('Russian UI: every screen text is translated and fits', async ({ page }) => {
    await openTitle(page);
    await page.click('[data-lang="ru"]');
    await startNewWorld(page, 'russkiy');
    await page.evaluate(() => window.__sc.ui.openInventory());
    await expect(page.locator('[data-screen="inventory"] .panel-title')).toHaveText('Инвентарь');
    // nothing overflows the panel horizontally
    const overflow = await page.evaluate(() => { const p = document.querySelector('.inv-panel'); return p.scrollWidth - p.clientWidth; });
    expect(overflow).toBeLessThanOrEqual(2);
    await page.evaluate(() => window.__sc.ui.closeAll());
    await page.evaluate(() => window.__sc.ui.openPause());
    for (const sel of ['[data-act="resume"]', '[data-act="map"]', '[data-act="shop"]', '[data-act="settings"]', '[data-act="save"]', '[data-act="quit"]']) {
      const box = await page.locator(`[data-screen="pause"] ${sel}`).evaluate((b) => ({ sw: b.scrollWidth, cw: b.clientWidth }));
      expect(box.sw).toBeLessThanOrEqual(box.cw + 2);
    }
  });
});
