import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';
import { GOODS } from '../server/goods.js';

// Gems by their real value (quartz, amethyst, topaz, emerald, sapphire, ruby,
// diamond): ores underground, the gem they drop, gold panning in water,
// nuggets that make an ingot, hidden caches in Malaga and gems under the city.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Gems', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('the exchange prices gems in the order of their real value', () => {
    const order = ['quartz', 'amethyst', 'topaz', 'emerald', 'sapphire', 'ruby', 'diamond'].map((g) => GOODS[g]);
    expect(order.every((p) => p > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(GOODS.gold_nugget * 9).toBeLessThanOrEqual(GOODS.gold_ingot);
  });

  test('gem ores underground, mining a gem, panning for gold', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'gemworld');
    // the stone around holds gem ores
    const ores = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, p = g.player.pos, n = {};
      const keys = ['quartz_ore', 'amethyst_ore', 'topaz_ore', 'emerald_ore', 'sapphire_ore', 'ruby_ore'];
      for (let x = Math.floor(p.x) - 40; x < p.x + 40; x++) for (let z = Math.floor(p.z) - 40; z < p.z + 40; z++) for (let y = 2; y < 64; y++) {
        const b = g.world.getBlock(x, y, z);
        for (const k of keys) if (b === B[k]) n[k] = (n[k] || 0) + 1;
      }
      return n;
    });
    expect(ores.quartz_ore || 0).toBeGreaterThan(0);
    expect(Object.values(ores).reduce((a, b) => a + b, 0)).toBeGreaterThan(20);

    // a ruby ore broken with an iron pickaxe drops a ruby, which is picked up
    const ruby = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, p = g.player.pos;
      const x = Math.floor(p.x) + 1, y = Math.floor(p.y), z = Math.floor(p.z);
      g.world.setBlock(x, y, z, B.ruby_ore);
      g.inventory.slots[g.inventory.selected] = { item: 'iron_pickaxe', count: 1 };
      g.breakBlock({ id: B.ruby_ore, x, y, z });
      return true;
    });
    expect(ruby).toBe(true);
    await page.waitForFunction(() => window.__sc.game.inventory.count('ruby') >= 1, null, { timeout: 10_000 });

    // panning: away from water nothing, in water a nugget (one pan in four)
    const pan = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, p = g.player.pos;
      g.inventory.slots[g.inventory.selected] = { item: 'gold_pan', count: 1 };
      const dry = g.pan(() => 0.1);
      const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
      g.world.setBlock(x + 1, y, z, B.water);
      const wet = g.pan(() => 0.1), empty = g.pan(() => 0.9);
      return { dry, wet, empty, nuggets: g.inventory.count('gold_nugget') };
    });
    expect(pan).toEqual({ dry: null, wet: 'gold_nugget', empty: null, nuggets: 1 });
    expect(problems).toEqual([]);
  });

  test('Malaga: hidden gem caches open once, and gems lie under the city', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    // a cache near the start (wait for the chunks around to be made)
    await page.waitForTimeout(4000);
    const found = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, c = g.city, p = g.player.pos;
      let cache = null, gems = 0;
      for (let r = 0; r < 70 && !cache; r++) for (let dz = -r; dz <= r && !cache; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz, y = c.groundAt(x, z);
        if (g.world.getBlock(x, y, z) === B.gem_cache) { cache = { x, y, z }; break; }
      }
      const ores = ['quartz_ore', 'amethyst_ore', 'topaz_ore', 'emerald_ore', 'sapphire_ore', 'ruby_ore', 'diamond_ore'].map((k) => B[k]);
      for (let x = Math.floor(p.x) - 24; x < p.x + 24; x++) for (let z = Math.floor(p.z) - 24; z < p.z + 24; z++) for (let y = 1; y < c.groundAt(x, z) - 3; y++) if (ores.includes(g.world.getBlock(x, y, z))) gems++;
      return { cache, gems };
    });
    expect(found.gems).toBeGreaterThan(5);
    expect(found.cache).not.toBeNull();
    await page.evaluate((c) => { const p = window.__sc.game.player; p.pos.set(c.x + 2.5, c.y + 1.05, c.z + 0.5); p.yaw = Math.PI / 2; p.pitch = -0.6; }, found.cache);
    await shot(page, 'gem-cache');
    const opened = await page.evaluate((c) => {
      const g = window.__sc.game, B = window.__sc.B;
      const gems = () => ['quartz', 'amethyst', 'topaz', 'emerald', 'sapphire', 'ruby', 'diamond'].reduce((a, k) => a + g.inventory.count(k), 0);
      const before = gems();
      g.use({ id: B.gem_cache, ...c }, null, g.player.lookDir(), true);
      return { block: g.world.getBlock(c.x, c.y, c.z), got: gems() - before, open: B.gem_cache_open };
    }, found.cache);
    expect(opened.block).toBe(opened.open);
    expect(opened.got).toBeGreaterThanOrEqual(2);
    expect(problems).toEqual([]);
  });
});
