import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Armor and shields as in the classic game: pieces crafted from leather to
// emberite go into their slots, armor points take damage off and the pieces
// wear out; a raised shield stops a blow from the front but not from behind.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Armor', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(180_000);

  test('armor slots, protection, wear, and the shield', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'armorworld');

    // a hit without armor
    const bare = await page.evaluate(() => { const g = window.__sc.game, p = g.player; p.health = 20; p.invuln = 0; g.damagePlayer(6, 'mob'); return 20 - p.health; });
    expect(bare).toBe(6);

    // put on iron armor: the helmet from the hand, the rest in the inventory screen
    await page.evaluate(() => {
      const g = window.__sc.game;
      g.inventory.slots[g.inventory.selected] = { item: 'iron_helmet', count: 1 };
      g.useCooldown = 0;
      g.use(null, null, g.player.lookDir(), true);
      g.inventory.slots[10] = { item: 'iron_chestplate', count: 1 };
      g.inventory.slots[11] = { item: 'iron_leggings', count: 1 };
      g.inventory.slots[12] = { item: 'iron_boots', count: 1 };
    });
    expect(await page.evaluate(() => window.__sc.game.inventory.armor[0]?.item)).toBe('iron_helmet');
    await page.evaluate(() => window.__sc.ui.openInventory());
    const slotOf = (i) => page.locator('.inv-grid.main .slot').nth(i - 9);
    // boots into the head slot are refused
    await slotOf(12).click();
    await page.locator('.inv-armor [data-armor="0"]').click();
    expect(await page.evaluate(() => window.__sc.game.inventory.armor[0]?.item)).toBe('iron_helmet');
    for (const [i, a] of [[10, 1], [11, 2], [12, 3]]) { await slotOf(i).click(); await page.locator(`.inv-armor [data-armor="${a}"]`).click(); }
    expect(await page.evaluate(() => window.__sc.game.inventory.armorPoints)).toBe(15);
    await expect(page.locator('.inv-armor .armor-pts')).toContainText('15');
    await shot(page, 'armor-inventory');
    await page.click('[data-screen="inventory"] [data-act="close"]');
    await expect(page.locator('.bar-row.armor')).toBeVisible();

    // the same hit now takes much less, and each piece wears a little
    const armored = await page.evaluate(() => { const g = window.__sc.game, p = g.player; p.health = 20; p.invuln = 0; g.damagePlayer(6, 'mob'); return { lost: 20 - p.health, dmg: g.inventory.armor.map((s) => s.dmg) }; });
    expect(armored.lost).toBeLessThan(3.5); // 15 points: about half
    expect(armored.dmg).toEqual([1, 1, 1, 1]);
    // a fall is not stopped by armor
    const fall = await page.evaluate(() => { const g = window.__sc.game, p = g.player; p.health = 20; p.invuln = 0; g.damagePlayer(4, 'fall'); return 20 - p.health; });
    expect(fall).toBe(4);
    // worn out, a piece breaks
    const broke = await page.evaluate(() => { const g = window.__sc.game, p = g.player; g.inventory.armor[3].dmg = 194; p.health = 20; p.invuln = 0; g.damagePlayer(2, 'mob'); return g.inventory.armor[3]; });
    expect(broke).toBeNull();

    // the shield: raised, it stops a blow from the front, not one from behind
    const shield = await page.evaluate(() => {
      const g = window.__sc.game, p = g.player;
      g.inventory.armor = [null, null, null, null];
      g.inventory.slots[g.inventory.selected] = { item: 'shield', count: 1 };
      g.blocking = true;
      const look = p.lookDir();
      const front = { pos: { x: p.pos.x + look.x * 2, y: p.pos.y, z: p.pos.z + look.z * 2 } };
      const back = { pos: { x: p.pos.x - look.x * 2, y: p.pos.y, z: p.pos.z - look.z * 2 } };
      p.health = 20; p.invuln = 0;
      const a = g.damagePlayer(6, 'mob', front);
      const hpFront = p.health;
      p.invuln = 0;
      const b = g.damagePlayer(6, 'mob', back);
      g.blocking = false;
      return { a, hpFront, b, hpBack: p.health, wear: g.inventory.held.dmg };
    });
    expect(shield).toEqual({ a: false, hpFront: 20, b: true, hpBack: 14, wear: 1 });
    expect(problems).toEqual([]);
  });
});
