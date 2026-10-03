import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// El Gran Golpe, Malaga's big mission: twelve tasks picked at random give
// the twelve pieces of the bank's plan; the puzzle puts them together; the
// weak wall at the back of the vault breaks, a guard who sees the player in
// the vault catches them, the Gran Diamante is taken and carried away, and
// traded at the bank's counter the player becomes Malaga's mayor.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('El Gran Golpe', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(300_000);

  test('twelve tasks, the plan puzzle, the vault, the guards, the diamond and the mayor', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });

    // twelve tasks, each with its own square of the plan
    const st = await page.evaluate(() => { const h = window.__sc.game.heist.state(); return { n: h.tasks.length, slots: Object.values(h.slots).sort((a, b) => a - b) }; });
    expect(st.n).toBe(12);
    expect(st.slots).toEqual([...Array(12).keys()]);

    // do them all: go to each informant (with what they ask for), do what is asked
    const got = await page.evaluate(() => {
      const g = window.__sc.game, M = g.missions, H = g.heist;
      const go = (name) => { const q = M.placeXZ(name); g.player.pos.set(q.x + 2, 80, q.z + 2); };
      for (const m of H.missions()) {
        for (let guard = 0; guard < 6 && !M.isDone(m.id); guard++) {
          const s = m.steps[M.prog(m.id).step];
          if (s.ev === 'reach') { if (s.give) g.giveItem(s.give, 1); go(s.near); M.t = 5; M.update(0); }
          else if (s.ev === 'getoff') { go(s.near); M.event('getoff'); }
          else M.event(s.ev, { item: s.item, key: m.id });
        }
      }
      return { got: H.state().got.length, done: H.missions().filter((m) => M.isDone(m.id)).length };
    });
    expect(got).toEqual({ got: 12, done: 12 });

    // the puzzle: a wrong square shakes, the right one takes the piece
    await page.evaluate(() => window.__sc.ui.open('heistMap'));
    await expect(page.locator('.heist-piece')).toHaveCount(12);
    const first = await page.evaluate(() => { const h = window.__sc.game.heist.state(); const k = h.got[0]; return { k, slot: h.slots[k] }; });
    await page.click(`.heist-piece[data-key="${first.k}"]`);
    await page.click(`.heist-slot[data-slot="${(first.slot + 1) % 12}"]`);
    await expect(page.locator('.heist-slot.full')).toHaveCount(0);
    await page.click(`.heist-slot[data-slot="${first.slot}"]`);
    await expect(page.locator('.heist-slot.full')).toHaveCount(1);
    await shot(page, 'heist-puzzle');
    // the rest
    for (let i = 1; i < 12; i++) {
      const k = await page.evaluate((i) => window.__sc.game.heist.state().got[i], i);
      await page.click(`.heist-piece[data-key="${k}"]`);
      const slot = await page.evaluate((k) => window.__sc.game.heist.state().slots[k], k);
      await page.click(`.heist-slot[data-slot="${slot}"]`);
    }
    await expect(page.locator('.heist-slot.full')).toHaveCount(12);
    expect(await page.evaluate(() => ({ map: window.__sc.game.heist.state().map, item: window.__sc.game.inventory.count('heist_map'), tracked: window.__sc.game.missions.tracked.id }))).toEqual({ map: true, item: 1, tracked: 'heist' });
    // the plan shows the bank (drawn once its part of the city is loaded)
    await page.waitForFunction(() => !!window.__sc.game.heist.plan(), null, { timeout: 60_000 });
    await page.waitForTimeout(300);
    await shot(page, 'heist-plan');
    await page.click('[data-screen="heistMap"] [data-act="close"]');

    // the bank: round the back to the weak wall
    const plan = await page.evaluate(async () => {
      const g = window.__sc.game, c = g.city, H = g.heist, q = g.missions.placeXZ('Banco de España');
      await c.ensure(q.x, q.z, 96);
      const pl = H.plan(), K = window.__sc.bank;
      const pt = (d, a) => K.point(pl.P, d, a);
      return { base: pl.P.base, weak: pt(pl.depth, pl.mid), out: pt(pl.depth + 3, pl.mid), inVault: pt(pl.depth - 1, pl.mid), diamond: pt(pl.diamond, pl.mid), far: pt(pl.depth + 80, pl.mid), hall: pt(pl.counter - 2, pl.mid) };
    });
    await page.evaluate(({ out, weak, base }) => { const g = window.__sc.game, p = g.player; p.fly = false; p.pos.set(out.x + 0.5, base + 1.05, out.z + 0.5); p.yaw = Math.atan2(-(weak.x - out.x), -(weak.z - out.z)); p.pitch = -0.05; }, plan);
    await page.waitForFunction(({ w, y }) => window.__sc.game.world.getBlock(w.x, y, w.z) === window.__sc.B.weak_wall, { w: plan.weak, y: plan.base + 1 }, { timeout: 60_000 });
    await shot(page, 'heist-weak-wall');
    await page.evaluate(({ weak, base }) => {
      const g = window.__sc.game, B = window.__sc.B;
      g.inventory.slots[g.inventory.selected] = { item: 'iron_pickaxe', count: 1 };
      for (const y of [base + 1, base + 2]) g.breakBlock({ id: B.weak_wall, x: weak.x, y, z: weak.z });
    }, plan);
    expect(await page.evaluate(({ w, y }) => window.__sc.game.world.getBlock(w.x, y, w.z), { w: plan.weak, y: plan.base + 1 })).toBe(0);

    // inside the vault, the guards walk their rounds; the diamond on its pedestal
    await page.waitForFunction(() => window.__sc.game.heist.guards.length === 3);
    await page.evaluate(({ diamond, base }) => { const g = window.__sc.game, B = window.__sc.B; g.use({ id: B.grand_diamond, x: diamond.x, y: base + 2, z: diamond.z }, null, g.player.lookDir(), true); }, plan);
    expect(await page.evaluate(() => window.__sc.game.inventory.count('grand_diamond'))).toBe(1);
    // seen by a guard in the vault (creative: caught and walked out; the diamond goes back)
    await page.evaluate(() => {
      const g = window.__sc.game, gd = g.heist.guards[2], o = gd.rig.group.position;
      // in the middle of the round (a guard starts anywhere on it; at an end, two steps ahead is the wall), standing still
      gd.u = 0.5; gd.r.speed = 0;
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const g = window.__sc.game, gd = g.heist.guards[2], o = gd.rig.group.position;
      g.player.pos.set(o.x + Math.sin(gd.yaw) * 2, o.y, o.z + Math.cos(gd.yaw) * 2);
    });
    await page.waitForFunction(() => window.__sc.game.inventory.count('grand_diamond') === 0, null, { timeout: 10_000 });
    expect(await page.evaluate(({ diamond, base }) => window.__sc.game.world.getBlock(diamond.x, base + 2, diamond.z), plan)).toBe(await page.evaluate(() => window.__sc.B.grand_diamond));

    // again, unseen this time: take it and get away
    await page.evaluate(({ diamond, base, far }) => {
      const g = window.__sc.game, B = window.__sc.B;
      for (const gd of g.heist.guards) gd.r.speed = 0;
      g.use({ id: B.grand_diamond, x: diamond.x, y: base + 2, z: diamond.z }, null, g.player.lookDir(), true);
      g.player.pos.set(far.x + 0.5, 90, far.z + 0.5);
    }, plan);
    await page.waitForFunction(() => window.__sc.game.heist.state().escaped, null, { timeout: 10_000 });

    // back at the counter: the diamond traded; the city's new mayor
    await page.evaluate(({ hall, base }) => { const g = window.__sc.game; g.player.pos.set(hall.x + 0.5, base + 1.05, hall.z + 0.5); g.ui.open('bank'); }, plan);
    await page.click('[data-screen="bank"] [data-a="grand"]');
    await expect(page.locator('[data-screen="mayor"]')).toBeVisible();
    await shot(page, 'heist-mayor');
    expect(await page.evaluate(() => { const g = window.__sc.game; return { mayor: !!g.heist.state().mayor, done: g.missions.isDone('heist'), left: g.inventory.count('grand_diamond') }; })).toEqual({ mayor: true, done: true, left: 0 });
    expect(problems).toEqual([]);
  });
});
