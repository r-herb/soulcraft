import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';
import { installPilot } from './questpilot.js';

// Chapter 2 of the Treasure Quest (the Frozen Spire), played with the
// normal controls from the vault's back door to the crystal chest. The dev
// panel skips chapter 1; god mode only stops damage.
test.describe('Treasure Quest chapter 2', () => {
  test.setTimeout(40 * 60_000);

  test('the Frozen Spire: 8 levels, the Frost Warden and the crystal vault', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'runs once, on the desktop profile');
    const problems = watchConsole(page);
    await page.setViewportSize({ width: 800, height: 450 });
    await openTitle(page, '&dev=1');
    await page.evaluate(() => window.__sc.setSetting('quality', 'low'));
    await page.click('[data-act="quest"]');
    await page.click('[data-screen="questIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    await page.evaluate(() => { document.querySelector('[data-dev="god"]').click(); });
    await page.evaluate(installPilot);
    // skip chapter 1 (and its chest) with the dev tools
    // debugging aid: QUEST_FROM=17 starts at a later chapter 2 level
    const from = Math.max(14, Number(process.env.QUEST_FROM || 14));
    await page.evaluate(async (n) => { const g = window.__sc.game; while (g.quest.current() < n) { g.quest.devSkip(); await new Promise((r) => setTimeout(r, 1500)); } }, from);
    expect(await page.evaluate(() => window.__sc.game.quest.state.checkpoint)).toBe(from);

    const step = async (i, fn) => {
      const t0 = Date.now();
      await page.evaluate(fn);
      await page.waitForFunction((n) => window.__sc.game.meta.quest.solved.includes(n), i, { timeout: 120_000 }).catch(async (e) => {
        const st = await page.evaluate(() => { const g = window.__sc.game, p = g.player.pos, q = g.meta.quest; return `at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} onGround=${g.player.onGround} level=${g.quest.current()} checkpoint=${q.checkpoint} falls=${q.falls} fps=${g.fps}`; });
        throw new Error(`level ${i} not solved: ${st}\n${e.message}`);
      });
      console.log(`level ${i} solved in ${Math.round((Date.now() - t0) / 1000)}s`);
    };
    const toNext = (i) => page.evaluate(async (n) => { const qp = window.__qp; const L = qp.levels[n]; await qp.path([[L.ox + 50.5, 0.5], [L.ox + 66.5, 0.5]]); }, i);

    // 14: ice slide - build up speed on the ice and jump the gaps
    if (from <= 14) {
      await step(14, async () => {
        const qp = window.__qp; const L = qp.levels[14];
        await qp.course([[L.ox + 5.2, 0.5], [L.ox + 48.5, 0.5, { jumpGaps: true, sprint: true }]]);
      });
      await toNext(14);
    }

    // 15: blink bridge - wait on each anchor until the next pad shines long enough
    if (from <= 15) {
      await step(15, async () => {
        const qp = window.__qp; const L = qp.levels[15]; const q = window.__sc.game.quest;
        const cross = async () => {
          for (const b of L.blinks) {
            await qp.go(b.x0 - 0.7, 0.5, { tol: 0.3, careful: true, retryOnFall: true });
            qp.stop();
            const len = b.x1 - b.x0 + 2;
            for (let k = 0; k < 200; k++) {
              const ph = (q.blinkT + b.phase) % L.blinkPeriod;
              if (ph < L.blinkOn && L.blinkOn - ph > len / 4.5 + 0.35) break;
              await new Promise((r) => setTimeout(r, 40));
            }
            await qp.go(b.x1 + 1.6, 0.5, { tol: 0.4, sprint: true, retryOnFall: true });
          }
          await qp.go(L.ox + 48.5, 0.5, { retryOnFall: true });
        };
        for (let i = 0; i < 6; i++) { try { await cross(); return; } catch (e) { if (e.message !== 'fell') throw e; await new Promise((r) => setTimeout(r, 600)); } }
      });
      await toNext(15);
    }

    // 16: updraft tower - ride each vent, step onto the wall, drop into the pool
    if (from <= 16) {
      await step(16, async () => {
        const qp = window.__qp; const L = qp.levels[16]; const g = window.__sc.game;
        for (const v of L.vents) {
          await qp.go(v.x0 + 1, 0.5, { tol: 0.4 });
          qp.stop();
          for (let k = 0; k < 150 && g.player.pos.y < v.top - 0.5; k++) await new Promise((r) => setTimeout(r, 50));
          await qp.go(v.x1 + 2.5, 0.5, { tol: 0.4, y: v.top - 3 });
          await qp.go(v.x1 + 8.5, 0.5, { tol: 0.6 });
          for (let k = 0; k < 60 && (g.player.inWater || !g.player.onGround); k++) await new Promise((r) => setTimeout(r, 50));
          await qp.go(v.x1 + 11.5, 0.5);
        }
        await qp.go(L.ox + 48.5, 0.5);
      });
      await toNext(16);
    }

    // 17: frost plates - light all four while the first ones still glow
    if (from <= 17) {
      await step(17, async () => {
        const qp = window.__qp; const L = qp.levels[17]; const o = L.ox;
        const pl = (i) => [L.plates[i].x + 0.5, L.plates[i].z + 0.5, { tol: 0.3, sprint: true }];
        await qp.path([[o + 8.5, 0.5], pl(0), [o + 12.5, 0.5, { sprint: true }], pl(1), [o + 14.5, 0.5, { sprint: true }], [o + 22.5, 0.5, { sprint: true }], [o + 25.5, 8.5, { sprint: true }], [o + 31.5, 8.5, { sprint: true }], [o + 34.5, 0.5, { sprint: true }], [o + 40.5, 0.5, { sprint: true }], pl(2), [o + 42.5, 0.5, { sprint: true }], pl(3), [o + 46.5, 0.5]]);
      });
      await toNext(17);
    }

    // 18: frost jets - pass each row right after it has fired
    if (from <= 18) {
      await step(18, async () => {
        const qp = window.__qp; const L = qp.levels[18]; const q = window.__sc.game.quest;
        for (const r of L.jets) {
          await qp.go(r.x - 2, 0.5, { tol: 0.4 });
          qp.stop();
          for (let k = 0; k < 150; k++) { const ph = (q.jetT + r.phase) % L.jetPeriod; if (ph > 0.05 && ph < 0.4) break; await new Promise((res) => setTimeout(res, 30)); }
          await qp.go(r.x + 3, 0.5, { tol: 0.5, sprint: true });
        }
        await qp.go(L.ox + 48.5, 0.5);
      });
      await toNext(18);
    }

    // 19: orb race - pillars first, the ice patch in the middle
    if (from <= 19) {
      await step(19, async () => {
        const qp = window.__qp; const L = qp.levels[19]; const o = L.ox; const orb = L.orbs;
        await qp.path([
          [o + 8.5, 0.5], [orb[0].x, orb[0].z, { sprint: true }],
          [o + 16.5, 7.5, { sprint: true }], [o + 17.5, 7.5, { y: 42 }], [o + 18.5, 7.5, { y: 43 }], [o + 19.5, 7.5, { y: 44 }], [orb[1].x, orb[1].z, { y: 44 }],
          [o + 19.5, 4.5], [orb[2].x, orb[2].z + 2.5, { sprint: true }], [orb[2].x, orb[2].z],
          [o + 29.5, -6.5, { sprint: true }], [o + 30.5, -6.5, { y: 42 }], [o + 31.5, -6.5, { y: 43 }], [o + 32.5, -6.5, { y: 44 }], [o + 33.5, -6.5, { y: 45 }], [orb[3].x, orb[3].z, { y: 45 }],
          [o + 36.5, -3.5], [orb[4].x, orb[4].z, { sprint: true }], [orb[5].x, orb[5].z, { sprint: true }],
        ]);
      });
      await toNext(19);
    }

    // 20: frost den
    if (from <= 20) {
      await step(20, async () => {
        const qp = window.__qp; const L = qp.levels[20];
        await qp.go(L.ox + 14.5, 0.5);
        await qp.fight(() => window.__sc.game.meta.quest.solved.includes(20));
      });
      await toNext(20);
    }

    // 21: the Frost Warden
    if (from <= 21) {
      await step(21, async () => {
        const qp = window.__qp; const L = qp.levels[21];
        await qp.go(L.ox + 20.5, 0.5);
        for (let i = 0; i < 100 && !window.__sc.game.bosses.active; i++) await new Promise((r) => setTimeout(r, 100));
        await qp.fight(() => window.__sc.game.meta.quest.solved.includes(21), 900_000);
      });
      await toNext(21);
    }

    // 22: the crystal vault
    await page.evaluate(async () => {
      const qp = window.__qp; const L = qp.levels[22]; const c = L.chest;
      await qp.go(c.x - 1.5, c.z + 0.5);
      qp.aimAt(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      await new Promise((r) => setTimeout(r, 300));
      qp.press('use');
    });
    await expect(page.locator('[data-screen="questComplete"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-screen="questComplete"]')).toContainText('Frozen Spire');
    const prof = await page.evaluate(() => ({ skins: window.__sc.app.profile.skins, rewards: window.__sc.app.profile.rewards, sword: window.__sc.game.inventory.count('frostbrand'), done2: window.__sc.game.meta.quest.done2 }));
    expect(prof.skins).toContain('frost_monarch');
    expect(prof.rewards.frostbrand).toBe(true);
    expect(prof.sword).toBe(1);
    expect(prof.done2).toBe(true);
    expect(problems).toEqual([]);
  });
});
