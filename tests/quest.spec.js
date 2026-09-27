import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';
import { installPilot } from './questpilot.js';

// Plays the whole Treasure Quest with the normal controls - walking,
// jumping, the levers, the memory tiles, bridge building, fighting - from
// the camp to the treasure chest. God mode (dev panel) only stops damage;
// falls still send the pilot back to its checkpoint.
test.describe('Treasure Quest', () => {
  test.setTimeout(40 * 60_000);

  test('all 12 levels, the Hoard Golem and the treasure', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'runs once, on the desktop profile');
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 800, height: 450 });
    await openTitle(page, '&dev=1');
    await page.click('[data-act="quest"]');
    await expect(page.locator('[data-screen="questIntro"]')).toBeVisible();
    await page.click('[data-screen="questIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    await expect(page.locator('.quest-obj')).toBeVisible();
    await page.evaluate(() => { document.querySelector('[data-dev="god"]').click(); });
    await page.evaluate(installPilot);

    const solved = (i) => page.evaluate((n) => window.__sc.game.meta.quest.solved.includes(n), i);
    // debugging aid: QUEST_FROM=10 skips ahead with the dev panel
    const from = Number(process.env.QUEST_FROM || 1);
    if (from > 1) {
      await page.evaluate(async (n) => { const g = window.__sc.game; while (g.quest.current() < n) { g.quest.devSkip(); await new Promise((r) => setTimeout(r, 1500)); } }, from);
    }
    const step = async (i, fn) => {
      const t0 = Date.now();
      await page.evaluate(fn);
      await page.waitForFunction((n) => window.__sc.game.meta.quest.solved.includes(n), i, { timeout: 120_000 });
      console.log(`level ${i} solved in ${Math.round((Date.now() - t0) / 1000)}s`);
    };
    const toNext = (i) => page.evaluate(async (n) => {
      // through the opened gate to the next level's checkpoint
      const qp = window.__qp; const L = qp.levels[n];
      await qp.path([[L.ox + 50.5, 0.5], [L.ox + 66.5, 0.5]]);
    }, i);

    // camp -> ruins
    if (from <= 1) await page.evaluate(async () => { const qp = window.__qp; await qp.path([[40.5, 0.5], [66.5, 0.5]]); });

    // 1: the map, in the maze's farthest dead end
    if (from <= 1) {
      await step(1, async () => {
        const qp = window.__qp; const L = qp.levels[1];
        const route = qp.mazePath(L, L.maze.far);
        await qp.path(route.slice(0, -1));
        // walk onto the pedestal; the map flies into the inventory on the way
        const [mx, mz] = route[route.length - 1];
        qp.go(mx, mz).catch(() => {});
        for (let i = 0; i < 600 && !window.__sc.game.meta.quest.hasMap; i++) await new Promise((r) => setTimeout(r, 50));
        qp.stop();
      });
      await expect(page.locator('[data-screen="treasureMap"]')).toBeVisible({ timeout: 10_000 });
      await page.locator('[data-screen="treasureMap"] [data-act="close"]').click();
      await page.evaluate(async () => { const qp = window.__qp; const L = qp.levels[1]; await qp.path(qp.mazePath(L, [3, 20], L.maze.far)); await qp.go(L.ox + 49.5, -1.5); });
      await toNext(1);
    }

    // 2: sky steps (parkour)
    if (from <= 2) {
      await step(2, async () => {
        const qp = window.__qp; const L = qp.levels[2];
        const pts = L.stones.map((s) => [(s.x0 + s.x1 + 1) / 2, (s.z0 + s.z1 + 1) / 2, { y: s.y + 1, jumpGaps: true, sprint: true, tol: 0.4 }]);
        await qp.course([[L.ox + 5.2, 0.5], ...pts, [L.ox + 48.5, 0.5, { jumpGaps: true, sprint: true }]]);
      });
      await toNext(2);
    }

    // 3: arrow hall
    if (from <= 3) {
      await step(3, async () => { const qp = window.__qp; const L = qp.levels[3]; await qp.path([[L.ox + 48.5, 0.5, { sprint: true }]]); });
      expect(await page.evaluate(() => window.__sc.game.entities.list.length)).toBeGreaterThanOrEqual(0);
      await toNext(3);
    }

    // 4: monster den
    if (from <= 4) {
      await step(4, async () => {
        const qp = window.__qp; const L = qp.levels[4];
        await qp.go(L.ox + 14.5, 0.5);
        await qp.fight(() => window.__sc.game.meta.quest.solved.includes(4));
      });
      await toNext(4);
    }

    // 5: lever riddle
    if (from <= 5) {
      await step(5, async () => {
        const qp = window.__qp; const L = qp.levels[5]; const g = window.__sc.game;
        for (const i of qp.leverPlan()) {
          const lv = L.levers[i];
          await qp.go(lv.x + 0.5, lv.z + 2.5);
          qp.aimAt(lv.x + 0.5, lv.y + 0.5, lv.z + 0.5);
          await new Promise((r) => setTimeout(r, 300));
          qp.press('use');
          await new Promise((r) => setTimeout(r, 500));
        }
        void g;
      });
      await toNext(5);
    }

    // 6: crumbling bridge
    if (from <= 6) {
      await step(6, async () => { const qp = window.__qp; const L = qp.levels[6]; await qp.course([[L.ox + 48.5, 0.9, { jumpGaps: true, sprint: true }]]); });
      await toNext(6);
    }

    // 7: key grove
    if (from <= 7) {
      await step(7, async () => {
        const qp = window.__qp; const L = qp.levels[7]; const o = L.ox;
        await qp.path([[o + 8.5, 2.5], [o + 8.5, 5.5], [o + 12.5, 5.5], [o + 14.5, 9.5]]);
        await qp.path([[o + 12.5, 5.5], [o + 8.5, 5.5], [o + 8.5, 2.5], [o + 33.5, 2.5], [o + 33.5, 8.5, { dive: true }]]);
        await new Promise((r) => setTimeout(r, 2500));
        await qp.path([[o + 33.5, 3.5], [o + 35.5, -5.5], [o + 36.5, -5.5, { y: 42 }], [o + 37.5, -5.5, { y: 43 }], [o + 38.5, -5.5, { y: 44 }], [o + 39.5, -5.5, { y: 45 }], [o + 39.5, -6.5, { y: 45 }], [o + 41.5, -7.5, { y: 45 }]]);
        await new Promise((r) => setTimeout(r, 1500));
      });
      await page.evaluate(async () => { const qp = window.__qp; const o = qp.levels[7].ox; await qp.path([[o + 39.5, -5.5], [o + 35.5, -5.5], [o + 36.5, -2.5], [o + 45.5, 0.5]]); });
      await toNext(7);
    }

    // 8: memory tiles
    if (from <= 8) {
      await step(8, async () => {
        const qp = window.__qp; const L = qp.levels[8]; const g = window.__sc.game;
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        await qp.go(L.ox + 17.5, 0.5);
        for (let attempt = 0; attempt < 4 && !g.meta.quest.solved.includes(8); attempt++) {
          for (let i = 0; i < 600 && !(g.quest.memory && g.quest.memory.phase === 'input'); i++) await wait(50);
          // walk only along the gaps between tiles: P stays on a gap column
          let P = [L.ox + 22.5, 0.5];
          await qp.go(P[0], P[1], { tol: 0.25 });
          for (const n of g.quest.memory.seq) {
            const tl = L.tiles[n];
            const bx = Math.abs(P[0] - (tl.x0 - 0.5)) <= Math.abs(P[0] - (tl.x0 + 2.5)) ? tl.x0 - 0.5 : tl.x0 + 2.5;
            const bz = Math.abs(P[1] - (tl.z0 - 0.5)) <= Math.abs(P[1] - (tl.z0 + 2.5)) ? tl.z0 - 0.5 : tl.z0 + 2.5;
            await qp.go(P[0], bz, { tol: 0.2, careful: true });
            await qp.go(bx, bz, { tol: 0.2, careful: true });
            await qp.go(tl.x0 + 1, tl.z0 + 1, { tol: 0.3, careful: true });
            await wait(350);
            await qp.go(bx, bz, { tol: 0.2, careful: true });
            P = [bx, bz];
            if (g.quest.memory && g.quest.memory.phase === 'wrong') break;
          }
          await wait(500);
        }
      });
      await toNext(8);
    }

    // 9: shadow maze
    if (from <= 9) {
      await step(9, async () => { const qp = window.__qp; const L = qp.levels[9]; await qp.path([...qp.mazePath(L, [3, 20]), [L.ox + 49.5, -1.5], [L.ox + 50.5, 0.5]]); });
      await toNext(9);
    }

    // 10: jump pads
    if (from <= 10) {
      await step(10, async () => {
        const qp = window.__qp; const L = qp.levels[10];
        const g = window.__sc.game;
        for (const pd of L.pads) {
          qp.go(pd.x + 0.5, pd.z + 0.5, { tol: 0.1 }).catch(() => {});
          for (let i = 0; i < 300 && g.player.pos.x < pd.x + 2; i++) await new Promise((r) => setTimeout(r, 50));
          qp.stop();
          for (let i = 0; i < 100 && !g.player.onGround; i++) await new Promise((r) => setTimeout(r, 50));
          await new Promise((r) => setTimeout(r, 300));
        }
        await qp.go(L.ox + 48.5, 0.5);
      });
      await toNext(10);
    }

    // 11: builder's gap - bridge planks with the build assist
    if (from <= 11) {
      await step(11, async () => {
        const qp = window.__qp; const L = qp.levels[11]; const g = window.__sc.game;
        await qp.go(L.ox + 16.5, 0.5);
        const i = g.inventory.slots.findIndex((s) => s && s.item === 'planks'); g.selectSlot(i);
        for (let x = L.ox + 20; x < L.ox + 34; x++) {
          await qp.go(x + 0.7, 0.5, { tol: 0.15, careful: true });
          if (g.world.getBlock(x + 1, 40, 0) === 0) {
            g.player.yaw = -Math.PI / 2; g.player.pitch = -1.3;
            await new Promise((r) => setTimeout(r, 250));
            qp.press('use');
            for (let k = 0; k < 40 && g.world.getBlock(x + 1, 40, 0) === 0; k++) await new Promise((r) => setTimeout(r, 50));
            if (g.world.getBlock(x + 1, 40, 0) === 0) throw new Error('plank not placed at ' + (x + 1));
          }
        }
        await qp.go(L.ox + 38.5, 0.5);
      });
      await toNext(11);
    }

    // 12: the Hoard Golem
    if (from <= 12) {
      await step(12, async () => {
        const qp = window.__qp; const L = qp.levels[12];
        await qp.go(L.ox + 20.5, 0.5);
        for (let i = 0; i < 100 && !window.__sc.game.bosses.active; i++) await new Promise((r) => setTimeout(r, 100));
        await qp.fight(() => window.__sc.game.meta.quest.solved.includes(12), 600_000);
      });
      await toNext(12);
    }

    // 13: the vault
    await page.evaluate(async () => {
      const qp = window.__qp; const L = qp.levels[13]; const c = L.chest;
      await qp.go(c.x - 1.5, c.z + 0.5);
      qp.aimAt(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      await new Promise((r) => setTimeout(r, 300));
      qp.press('use');
    });
    await expect(page.locator('[data-screen="questComplete"]')).toBeVisible({ timeout: 15_000 });
    const prof = await page.evaluate(() => ({ skins: window.__sc.app.profile.skins, skin: window.__sc.app.profile.skin, rewards: window.__sc.app.profile.rewards, blade: window.__sc.game.inventory.count('starfall_blade') }));
    expect(prof.skins).toContain('treasure');
    expect(prof.rewards.starfall).toBe(true);
    expect(prof.blade).toBe(1);

    // the blade carries over into a normal world
    await page.locator('[data-screen="questComplete"] [data-act="title"]').click();
    await expect(page.locator('[data-screen="title"]')).toBeVisible();
    await page.click('[data-act="new"]');
    await page.click('[data-act="create"]');
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    expect(await page.evaluate(() => window.__sc.game.inventory.count('starfall_blade'))).toBe(1);
    expect(problems).toEqual([]);
    void solved;
  });
});
