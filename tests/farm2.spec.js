import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Farm 2: an orange pip grows into a bush whose fruit is picked and grows
// again; hens lay into a nest box near them; an incubator hatches eggs into
// chicks.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Farm 2', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(180_000);

  test('an orange bush fruits again; a nest box gathers eggs; an incubator hatches chicks', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'orangeworld');
    const ids = await page.evaluate(() => { const B = window.__sc.B; return { o0: B.orange_0, o2: B.orange_2, o3: B.orange_3, nest: B.nest_box, inc: B.incubator }; });

    // plant a pip on the grass in front of the player
    const plot = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, p = g.player.pos;
      const x = Math.floor(p.x) + 2, z = Math.floor(p.z), y = g.world.topSolid(x, z);
      g.world.setBlock(x, y, z, B.grass); g.world.setBlock(x, y + 1, z, B.air); g.world.setBlock(x, y + 2, z, B.air);
      g.inventory.slots[g.inventory.selected] = { item: 'orange_seed', count: 1 };
      g.useCooldown = 0;
      g.use({ id: B.grass, x, y, z, nx: 0, ny: 1, nz: 0 }, null, { x: 0, y: -1, z: 0 }, true);
      return { x, y: y + 1, z };
    });
    expect(await page.evaluate((q) => window.__sc.game.world.getBlock(q.x, q.y, q.z), plot)).toBe(ids.o0);
    // it grows to fruit
    await page.evaluate(() => { window.__sc.game.meta.playTime += 460; });
    await page.waitForFunction(({ q, o3 }) => window.__sc.game.world.getBlock(q.x, q.y, q.z) === o3, { q: plot, o3: ids.o3 }, { timeout: 10_000 });
    await page.evaluate((q) => { const p = window.__sc.game.player; p.yaw = Math.PI / 2; p.pitch = -0.3; }, plot);
    await shot(page, 'orange-bush');
    // picking: oranges, and the bush stays (one stage back), then fruits again
    const picked = await page.evaluate((q) => {
      const g = window.__sc.game, B = window.__sc.B;
      g.inventory.slots[g.inventory.selected] = null;
      const before = g.inventory.count('orange');
      g.useCooldown = 0;
      g.use({ id: B.orange_3, ...q, nx: 0, ny: 1, nz: 0 }, null, { x: 0, y: -1, z: 0 }, true);
      return { got: g.inventory.count('orange') - before, block: g.world.getBlock(q.x, q.y, q.z) };
    }, plot);
    expect(picked.got).toBeGreaterThanOrEqual(2);
    expect(picked.block).toBe(ids.o2);
    await page.evaluate(() => { window.__sc.game.meta.playTime += 160; });
    await page.waitForFunction(({ q, o3 }) => window.__sc.game.world.getBlock(q.x, q.y, q.z) === o3, { q: plot, o3: ids.o3 }, { timeout: 10_000 });

    // a nest box: a hen nearby lays into it; using it gives the eggs
    const nest = await page.evaluate((q) => {
      const g = window.__sc.game, B = window.__sc.B;
      const x = q.x + 2, y = q.y, z = q.z + 2;
      g.world.setBlock(x, y, z, B.nest_box);
      const hen = g.livestock.spawn('chicken', x + 2.5, y + 0.05, z + 0.5);
      hen.eggT = 0.01;
      return { x, y, z };
    }, plot);
    await page.waitForFunction((n) => { const E = window.__sc.game.farm.extra(); return (E.nests[`${n.x},${n.y},${n.z}`] || 0) >= 1; }, nest, { timeout: 10_000 });
    const eggs = await page.evaluate((n) => {
      const g = window.__sc.game, B = window.__sc.B, before = g.inventory.count('egg');
      g.useCooldown = 0;
      g.use({ id: B.nest_box, ...n, nx: 0, ny: 1, nz: 0 }, null, { x: 0, y: -1, z: 0 }, true);
      return g.inventory.count('egg') - before;
    }, nest);
    expect(eggs).toBeGreaterThanOrEqual(1);

    // an incubator: two eggs in, and after three minutes of play two chicks
    const hatch = await page.evaluate((q) => {
      const g = window.__sc.game, B = window.__sc.B;
      const x = q.x - 2, y = q.y, z = q.z + 2;
      g.world.setBlock(x, y, z, B.incubator);
      g.inventory.slots[g.inventory.selected] = { item: 'egg', count: 2 };
      for (let i = 0; i < 2; i++) { g.useCooldown = 0; g.use({ id: B.incubator, x, y, z, nx: 0, ny: 1, nz: 0 }, null, { x: 0, y: -1, z: 0 }, true); }
      const babies = () => g.livestock.active().filter((e) => e.type === 'chicken' && e.baby).length;
      return { x, y, z, in: g.farm.incubator(x, y, z).eggs.length, babies: babies() };
    }, plot);
    expect(hatch.in).toBe(2);
    await page.evaluate(() => { window.__sc.game.meta.playTime += 200; });
    await page.waitForFunction((b) => window.__sc.game.livestock.active().filter((e) => e.type === 'chicken' && e.baby).length >= b + 2, hatch.babies, { timeout: 10_000 });
    expect(await page.evaluate((h) => window.__sc.game.farm.incubator(h.x, h.y, h.z).eggs.length, hatch)).toBe(0);
    await shot(page, 'incubator-chicks');
    expect(problems).toEqual([]);
  });
});
