import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// El Gran Golpe's other ways in: with the plan whole, four informants give
// the tools; the sewer's hatches lead from the hall to the vault; the vault
// door opens with the code and closes again; the uniform fools the guards
// (not up close); firecrackers send them to the door; at night only the
// vault's guard is on duty; a teammate's show in the hall holds their eyes.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('El Gran Golpe: the other ways', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('the tools, the sewer, the coded door, the uniform, firecrackers, the night shift and a friend\'s show', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });

    // the plan whole: four informants with the tools join the missions
    const ids = await page.evaluate(() => {
      const g = window.__sc.game, H = g.heist, s = H.state();
      s.got = [...s.tasks]; for (const k of s.tasks) H.place(k, s.slots[k]);
      return g.missions.all().filter((m) => m.approach).map((m) => m.id);
    });
    expect(ids).toEqual(['x_uniform', 'x_sewer', 'x_fireworks', 'x_code']);
    const bag = await page.evaluate((ids) => {
      const g = window.__sc.game;
      for (const id of ids) g.missions.complete(g.missions.byId(id));
      return ['guard_uniform', 'sewer_key', 'firecracker', 'vault_code'].map((k) => g.inventory.count(k));
    }, ids);
    expect(bag).toEqual([1, 1, 3, 1]);

    // to the bank
    await page.evaluate(async () => {
      const g = window.__sc.game, q = g.missions.placeXZ('Banco de España');
      await g.city.ensure(q.x, q.z, 64);
      g.player.pos.set(q.x, 126, q.z); await g.ensureLoaded(); g.placeOnGround();
    });
    await page.waitForFunction(() => !!window.__sc.game.heist.plan(), null, { timeout: 60_000 });
    const pl = await page.evaluate(() => {
      const g = window.__sc.game, pl = g.heist.plan(), P = pl.P, pt = window.__sc.bank.point;
      const hatch = pt(P, pl.sewer.from, pl.sewer.a), hatch2 = pt(P, pl.sewer.to, pl.sewer.a), door = pt(P, pl.vault, pl.mid), hall = pt(P, 2, pl.mid);
      return { base: P.base, hatch, hatch2, door, hall, front: pt(P, -4, pl.mid), sewer: pl.sewer, vault: pl.vault, diamond: pt(P, pl.diamond, pl.mid) };
    });
    const at = (x, y, z) => page.evaluate(async ([x, y, z]) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, y, z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); }, [x, y, z]);
    const block = (x, y, z) => page.evaluate(([x, y, z]) => window.__sc.game.world.getBlock(x, y, z), [x, y, z]);
    const B = await page.evaluate(() => ({ grate: window.__sc.B.sewer_grate, door: window.__sc.B.vault_door, diamond: window.__sc.B.grand_diamond }));
    await at(pl.hall.x, pl.base + 1, pl.hall.z);
    await page.waitForFunction(({ h, y, id }) => window.__sc.game.world.getBlock(h.x, y, h.z) === id, { h: pl.hatch, y: pl.base, id: B.grate }, { timeout: 60_000 });
    expect(await block(pl.hatch2.x, pl.base, pl.hatch2.z)).toBe(B.grate);
    // the tunnel under the floor
    expect(await block(pl.hatch.x + 0, pl.base - 1, pl.hatch.z)).toBe(0);

    // the sewer: locked without the key; with it, down into the tunnel and up into the vault
    const grate = (h) => page.evaluate(({ h, y }) => { const g = window.__sc.game; g.heist.useGrate({ x: h.x, y, z: h.z }); const p = g.player.pos; return { y: p.y, d: window.__sc.bankD(Math.floor(p.x), Math.floor(p.z)) }; }, { h, y: pl.base });
    // the depth from the bank's door, for the checks
    await page.evaluate(() => { window.__sc.bankD = (x, z) => { const P = window.__sc.game.heist.plan().P; return P.side === 0 ? z - P.door.z : P.side === 2 ? P.door.z - z : P.side === 1 ? P.door.x - x : x - P.door.x; }; });
    await page.evaluate(() => window.__sc.game.inventory.remove('sewer_key', 1));
    await at(pl.hatch.x, pl.base + 1, pl.hatch.z);
    expect((await grate(pl.hatch)).y).toBeGreaterThan(pl.base);
    await page.evaluate(() => window.__sc.game.giveItem('sewer_key', 1));
    const down = await grate(pl.hatch);
    expect(down.y).toBeLessThan(pl.base);
    const up = await grate(pl.hatch2);
    expect(up.y).toBeGreaterThan(pl.base);
    expect(up.d).toBe(pl.sewer.to);
    await shot(page, 'heist-sewer-up');

    // the vault door: locked without the code; with it open for a while, then closed again
    await at(pl.hall.x, pl.base + 1, pl.hall.z);
    await page.evaluate(() => window.__sc.game.inventory.remove('vault_code', 1));
    await page.evaluate(({ d, y }) => window.__sc.game.heist.openVaultDoor({ x: d.x, y, z: d.z }), { d: pl.door, y: pl.base + 1 });
    expect(await block(pl.door.x, pl.base + 1, pl.door.z)).toBe(B.door);
    await page.evaluate(() => window.__sc.game.giveItem('vault_code', 1));
    await page.evaluate(({ d, y }) => window.__sc.game.heist.openVaultDoor({ x: d.x, y, z: d.z }), { d: pl.door, y: pl.base + 1 });
    expect([await block(pl.door.x, pl.base + 1, pl.door.z), await block(pl.door.x, pl.base + 2, pl.door.z)]).toEqual([0, 0]);
    await page.evaluate(() => { window.__sc.game.heist.doorT = 0.05; });
    await page.waitForFunction(({ d, y, id }) => window.__sc.game.world.getBlock(d.x, y, d.z) === id, { d: pl.door, y: pl.base + 1, id: B.door });

    // the guards, standing still mid-round; a spot in front of the vault's guard
    await page.waitForFunction(() => window.__sc.game.heist.guards.length === 3);
    await page.evaluate(() => { window.__sc.game.meta.time = 0.1; for (const gd of window.__sc.game.heist.guards) { gd.u = 0.5; gd.r.speed = 0; } });
    await page.waitForTimeout(2500);
    const facing = (dist) => page.evaluate((dist) => { const g = window.__sc.game, gd = g.heist.guards[2], o = gd.rig.group.position; g.player.pos.set(o.x + Math.sin(gd.yaw) * dist, o.y, o.z + Math.cos(gd.yaw) * dist); }, dist);
    const holding = () => page.evaluate(() => window.__sc.game.inventory.count('grand_diamond'));
    const take = () => page.evaluate(({ q, y }) => { const g = window.__sc.game; if (!g.inventory.count('grand_diamond')) g.heist.takeDiamond({ x: q.x, y, z: q.z }); }, { q: pl.diamond, y: pl.base + 2 });

    // the uniform: four steps in front of a guard, unnoticed; without it, caught
    await take();
    expect(await holding()).toBe(1);
    await page.evaluate(() => window.__sc.game.heist.wearUniform());
    expect(await page.evaluate(() => [window.__sc.game.heist.disguiseT > 40, window.__sc.game.inventory.count('guard_uniform')])).toEqual([true, 0]);
    await facing(4);
    await page.waitForTimeout(1500);
    expect(await holding()).toBe(1);
    await page.evaluate(() => { window.__sc.game.heist.disguiseT = 0.01; });
    await facing(4);
    await page.waitForFunction(() => window.__sc.game.inventory.count('grand_diamond') === 0, null, { timeout: 10_000 });

    // firecrackers outside: the guards run to the door and the vault is open to a thief
    await at(pl.front.x, pl.base + 1, pl.front.z);
    await page.evaluate(() => window.__sc.game.heist.firecracker());
    expect(await page.evaluate(() => [window.__sc.game.heist.distractT > 20, window.__sc.game.inventory.count('firecracker')])).toEqual([true, 2]);
    await page.waitForFunction((counter) => window.__sc.game.heist.guards.every((gd) => { const p = gd.rig.group.position; return window.__sc.bankD(Math.floor(p.x), Math.floor(p.z)) < counter; }), (await page.evaluate(() => window.__sc.game.heist.plan().counter)), { timeout: 20_000 });
    await shot(page, 'heist-firecracker');
    await take();
    await at(pl.diamond.x, pl.base + 1, pl.diamond.z - 1);
    await page.waitForTimeout(1500);
    expect(await holding()).toBe(1);
    await page.evaluate(() => { window.__sc.game.heist.returnDiamond(); window.__sc.game.heist.distractT = 0.01; });

    // a teammate's show in the hall: the guards watch it, not the thief
    await page.evaluate((h) => { const H = window.__sc.game.heist; H._dancer = H.dancer; H.dancer = () => ({ x: h.x + 0.5, y: 0, z: h.z + 0.5 }); }, pl.hall);
    await page.waitForTimeout(2500);
    await take();
    await facing(4);
    await page.waitForTimeout(1500);
    expect(await holding()).toBe(1);
    await page.evaluate(() => { const H = window.__sc.game.heist; H.dancer = H._dancer; H.returnDiamond(); });

    // the night shift: only the vault's guard
    await page.evaluate(() => { window.__sc.game.meta.time = 0.7; });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__sc.game.heist.guards.map((gd) => gd.rig.group.visible))).toEqual([false, false, true]);
    expect(await block(pl.diamond.x, pl.base + 2, pl.diamond.z)).toBe(B.diamond);
    expect(problems).toEqual([]);
  });
});
