import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// The central bank of Malaga (the Banco de España building): stone walls, a door on the street, a marble hall with the counter and
// tellers, and the vault behind a steel door. Its counter opens the whole
// bank; a cash machine on the street only the account.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Malaga bank', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('the Banco de España building has a hall, a counter with tellers and a vault', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });

    // the plan: the building, its street side, where the counter and the vault go
    const plan = await page.evaluate(async () => {
      const g = window.__sc.game, c = g.city, pl = window.__sc.missionPlace('Banco de España'), q = c.toXZ(pl.lat, pl.lon);
      await c.ensure(q.x, q.z, 96);
      const P = c.bankPlan(), K = window.__sc.bank, { mid, depth } = K.coords(P, P.door.x, P.door.z);
      const pts = {};
      const pt = (name, d, a) => { pts[name] = K.point(P, d, a); };
      const L = K.layout(depth);
      pt('door', 0, mid); pt('out', -3, mid); pt('inside', L.counter - 2, mid); pt('counter', L.counter, mid + 3); pt('vaultDoor', L.vault, mid);
      return { P, depth, mid, ...L, base: P.base, pts };
    });
    expect(plan.P.side).toBeGreaterThanOrEqual(0);
    expect(plan.depth).toBeGreaterThan(14);
    const { door, out, inside, counter: counterCell } = plan.pts;

    // stand in the street before the door, looking in
    await page.evaluate(({ out, door }) => { const g = window.__sc.game, p = g.player; p.fly = false; p.pos.set(out.x + 0.5, 120, out.z + 0.5); g.placeOnGround(); p.yaw = Math.atan2(-(door.x - out.x), -(door.z - out.z)); p.pitch = -0.05; }, { out, door });
    await page.waitForFunction(({ c, v, y }) => { const g = window.__sc.game; return g.world.getBlock(c.x, y, c.z) === window.__sc.B.bank_counter && g.world.getBlock(v.x, y, v.z) > 0; }, { c: counterCell, v: plan.pts.vaultDoor, y: plan.base + 1 }, { timeout: 60_000 });
    const blocks = await page.evaluate(({ plan, door, vaultDoor, counterCell }) => {
      const g = window.__sc.game, w = g.world, y = plan.base;
      return {
        door: [w.getBlock(door.x, y + 1, door.z), w.getBlock(door.x, y + 2, door.z)],
        vaultDoor: w.getBlock(vaultDoor.x, y + 1, vaultDoor.z),
        counter: w.getBlock(counterCell.x, y + 1, counterCell.z),
      };
    }, { plan, door, vaultDoor: plan.pts.vaultDoor, counterCell });
    const B = await page.evaluate(() => window.__sc.B);
    expect(blocks.door).toEqual([B.air, B.air]);
    expect(blocks.vaultDoor).toBe(B.vault_door);
    expect(blocks.counter).toBe(B.bank_counter);
    await page.evaluate(({ out, y }) => { const p = window.__sc.game.player; p.pos.set(out.x + 0.5, y + 1.05, out.z + 0.5); p.vel.set(0, 0, 0); }, { out: plan.pts.out, y: plan.base });
    await shot(page, 'bank-front');

    // inside: the tellers behind the counter
    await page.evaluate(({ inside, counterCell, y }) => { const g = window.__sc.game, p = g.player; p.pos.set(inside.x + 0.5, y + 1.05, inside.z + 0.5); p.yaw = Math.atan2(-(counterCell.x - inside.x), -(counterCell.z - inside.z)); p.pitch = -0.1; }, { inside, counterCell, y: plan.base });
    await page.waitForFunction(() => window.__sc.game.entities.bankStaff.people.length > 0);
    await shot(page, 'bank-hall');

    // the counter opens the whole bank, a cash machine only the account
    await page.evaluate(({ c, y }) => { const g = window.__sc.game; g.use({ id: window.__sc.B.bank_counter, x: c.x, y: y + 1, z: c.z }, null, g.player.lookDir(), true); }, { c: counterCell, y: plan.base });
    await expect(page.locator('[data-screen="bank"] .panel-title')).toHaveText('Bank and exchange');
    await page.click('[data-screen="bank"] [data-act="close"]');
    await page.evaluate(() => { const g = window.__sc.game; g.useCooldown = 0; g.use({ id: window.__sc.B.atm, x: 0, y: 0, z: 0 }, null, g.player.lookDir(), true); });
    await expect(page.locator('[data-screen="bank"] .panel-title')).toHaveText('Cash Machine');
    expect(problems).toEqual([]);
  });
});
