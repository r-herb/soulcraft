import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// The farm: seeds grow into crops over play time and give a harvest;
// farm animals follow their food, breed, lay eggs, and are kept in the save
// when the player walks away.
const SHOTS = process.env.SHOTS;
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

test.describe('Farm', () => {
  test.setTimeout(180_000);

  test('crops grow and are harvested; animals breed, lay eggs and stay in the save', async ({ page }, info) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'farmworld');

    // plant wheat and tomatoes on a patch of grass in front of the player
    const plot = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B;
      const p = g.player.pos, x0 = Math.floor(p.x) + 2, z0 = Math.floor(p.z);
      const y = g.world.topSolid(x0, z0);
      for (let i = 0; i < 3; i++) { g.world.setBlock(x0 + i, y, z0, B.grass); g.world.setBlock(x0 + i, y + 1, z0, B.air); g.world.setBlock(x0 + i, y + 2, z0, B.air); }
      g.inventory.slots[g.inventory.selected] = { item: 'wheat_seeds', count: 2 };
      const use = (x) => { g.useCooldown = 0; g.use({ id: B.grass, x, y, z: z0, nx: 0, ny: 1, nz: 0 }, null, { x: 0, y: -1, z: 0 }, true); };
      use(x0); use(x0 + 1);
      g.inventory.slots[g.inventory.selected] = { item: 'tomato_seeds', count: 1 };
      use(x0 + 2);
      return { x0, y, z0, seedsLeft: g.inventory.count('wheat_seeds'), top: [0, 1, 2].map((i) => g.world.getBlock(x0 + i, y + 1, z0)), soil: g.world.getBlock(x0, y, z0), tracked: g.meta.crops.overworld.length };
    });
    const ids = await page.evaluate(() => ({ w0: window.__sc.B.wheat_0, t0: window.__sc.B.tomato_0, farmland: window.__sc.B.farmland, w3: window.__sc.B.wheat_3, t3: window.__sc.B.tomato_3 }));
    expect(plot.top).toEqual([ids.w0, ids.w0, ids.t0]);
    expect(plot.soil).toBe(ids.farmland);
    expect(plot.seedsLeft).toBe(0);
    expect(plot.tracked).toBe(3);

    // play time passes: the crops ripen (four stages of 150 s)
    await page.evaluate(() => { window.__sc.game.meta.playTime += 460; });
    await page.waitForFunction(({ x0, y, z0, w3 }) => window.__sc.game.world.getBlock(x0, y + 1, z0) === w3, { ...plot, w3: ids.w3 }, { timeout: 10_000 });
    expect(await page.evaluate(({ x0, y, z0 }) => window.__sc.game.world.getBlock(x0 + 2, y + 1, z0), plot)).toBe(ids.t3);
    await page.evaluate(({ x0, z0 }) => { const g = window.__sc.game; g.player.yaw = Math.atan2(-(x0 + 1.5 - g.player.pos.x), -(z0 + 0.5 - g.player.pos.z)); g.player.pitch = -0.6; }, plot);
    await shot(page, `farm-${info.project.name}-crops`);

    // harvest: ripe wheat gives wheat and seeds, tomatoes give tomatoes
    const got = await page.evaluate(({ x0, y, z0 }) => {
      const g = window.__sc.game, B = window.__sc.B;
      g.inventory.slots[g.inventory.selected] = null;
      for (let i = 0; i < 3; i++) g.breakBlock({ x: x0 + i, y: y + 1, z: z0, id: g.world.getBlock(x0 + i, y + 1, z0) });
      return { drops: g.entities.list.filter((e) => e.item).map((e) => e.item), left: g.meta.crops.overworld.length, air: g.world.getBlock(x0, y + 1, z0) === B.air };
    }, plot);
    expect(got.drops).toContain('wheat');
    expect(got.drops).toContain('wheat_seeds');
    expect(got.drops).toContain('tomato');
    expect(got.left).toBe(0);
    expect(got.air).toBe(true);

    // animals: two cows fed with wheat have a calf
    const farm = await page.evaluate(() => {
      const g = window.__sc.game, p = g.player.pos;
      const L = g.livestock;
      const a = L.spawn('cow', p.x + 3, p.y + 0.5, p.z + 1);
      const b = L.spawn('cow', p.x + 3, p.y + 0.5, p.z - 1);
      g.inventory.slots[g.inventory.selected] = { item: 'wheat', count: 4 };
      g.useCooldown = 0; g.use(null, a, { x: 1, y: 0, z: 0 }, true);
      g.useCooldown = 0; g.use(null, b, { x: 1, y: 0, z: 0 }, true);
      return { love: [a.loveT > 0, b.loveT > 0], wheat: g.inventory.count('wheat') };
    });
    expect(farm.love).toEqual([true, true]);
    expect(farm.wheat).toBe(2);
    await page.waitForFunction(() => window.__sc.game.entities.list.filter((e) => e.type === 'cow' && e.baby && !e.dead).length === 1, null, { timeout: 8000 });
    await shot(page, `farm-${info.project.name}-cows`);

    // a hen lays an egg; a sheep gives wool
    const hen = await page.evaluate(() => {
      const g = window.__sc.game, p = g.player.pos;
      const h = g.livestock.spawn('chicken', p.x - 2, p.y + 0.5, p.z);
      h.eggT = 0.1;
      const s = g.livestock.spawn('sheep', p.x - 3, p.y + 0.5, p.z + 2);
      s.damage(20, null);
      return true;
    });
    expect(hen).toBe(true);
    await page.waitForFunction(() => window.__sc.game.entities.list.some((e) => e.item === 'egg'), null, { timeout: 5000 });
    expect(await page.evaluate(() => window.__sc.game.entities.list.some((e) => e.item === 'wool'))).toBe(true);
    // monsters cap ignores animals, and pets leave them alone
    expect(await page.evaluate(() => window.__sc.game.entities.list.filter((e) => e.passive && !e.dead).length)).toBeGreaterThanOrEqual(4);

    if (SHOTS) {
      // on open grass away from the village
      await page.evaluate(() => { const g = window.__sc.game, p = g.player.pos; g.player.fly = true; p.set(p.x + 45, 90, p.z + 45); g.player.vel.set(0, 0, 0); });
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        const g = window.__sc.game, p = g.player.pos, L = g.livestock;
        const gy = g.world.topSolid(Math.floor(p.x), Math.floor(p.z));
        p.set(p.x, gy + 2.2, p.z);
        g.player.yaw = Math.PI; g.player.pitch = -0.35;
        const ax = p.x, az = p.z + 6;
        for (const e of g.entities.list) if (e.passive) e.dead = true;
        const y = (x, z) => g.world.topSolid(Math.floor(x), Math.floor(z)) + 1.05;
        L.spawn('chicken', ax - 2, y(ax - 2, az), az); L.spawn('sheep', ax, y(ax, az - 1), az - 1); L.spawn('cow', ax + 2.4, y(ax + 2.4, az), az); L.spawn('cow', ax + 1, y(ax + 1, az + 1.5), az + 1.5, true);
        for (const e of g.entities.list) if (e.passive) { e.yaw = -0.6; e.wanderT = 99; e.wanderDir.set(0, 0, 0); }
      });
      await shot(page, `farm-${info.project.name}-animals`);
    }
    // walking away parks them in the save; they come back when the player returns
    const parked = await page.evaluate(() => {
      const g = window.__sc.game;
      const n = g.entities.list.filter((e) => e.passive && !e.dead).length;
      const before = (g.meta.animals && g.meta.animals.overworld || []).length; // parked already (far away)
      const snap = g.livestock.snapshot().overworld.length;
      g.livestock.parkAll();
      return { n, before, snap, saved: g.meta.animals.overworld.length, alive: g.entities.list.filter((e) => e.passive && !e.dead).length };
    });
    expect(parked.snap).toBe(parked.n + parked.before);
    expect(parked.saved).toBe(parked.n + parked.before);
    expect(parked.alive).toBe(0);
    await page.evaluate(() => { window.__sc.game.livestock.t = 5; });
    await page.waitForFunction((n) => window.__sc.game.entities.list.filter((e) => e.passive && !e.dead).length >= n, parked.n, { timeout: 10_000 });
    expect(problems).toEqual([]);
  });
});
