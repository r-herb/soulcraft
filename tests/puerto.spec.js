import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// La Fábrica, season 3: hidden until season 2 is done; Siroco's call and
// plan; the hacker, the locksmith's stethoscope and the boatman; the port
// warehouse built with its fuse box, crates, laser corridor, safe and barred
// cell; a camera that sees the player sets off the alarm (the crew slips out),
// the fuse box blinds the cameras for a while and then needs a minute; a
// laser beam that is on sets off the alarm too; past them the office; the
// safe's dial (a wrong set, then the clicks); the key opens the cell; the run
// to the boat (time running out sends the crew back), and the end at the
// Muelle de Heredia.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('La Fábrica season 3', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(300_000);

  test('the cameras, the lasers, the safe, the cell and the run to the boat', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    await page.evaluate(() => { const g = window.__sc.game; g.player.god = true; (g.profile.guidesSeen || (g.profile.guidesSeen = {})).city = true; });

    const pu = () => page.evaluate(() => { const g = window.__sc.game, s = g.puerto.state(); return { act: s.act, alarms: s.alarms, ids: g.missions.all().filter((m) => m.season === 3).map((m) => m.id) }; });
    const go = (name) => page.evaluate(async (name) => {
      const g = window.__sc.game, q = g.missions.placeXZ(name);
      await g.city.ensure(q.x, q.z, 64);
      const c = g.city.openCellNear(q.x, q.z, 20) || q;
      g.player.pos.set(c.x + 0.5, 126, c.z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); g.placeOnGround();
    }, name);
    const done = (id) => page.waitForFunction((id) => window.__sc.game.missions.isDone(id), id, { timeout: 30_000 });
    const count = (k) => page.evaluate((k) => window.__sc.game.inventory.count(k), k);

    // hidden until season 2 is done
    expect((await pu()).ids).toEqual([]);
    await page.evaluate(() => { const g = window.__sc.game, f = g.fabrica.state(), o = g.oro.state(); f.done = true; f.act = 7; f.alias = 'espeto'; o.done = true; o.act = 9; });
    expect(await pu()).toMatchObject({ act: 0, ids: ['f3_aviso'] });

    // Siroco's call and plan
    await go('Finca El Maestro');
    await done('f3_aviso');
    const lesson = page.locator('[data-screen="puertoLesson"]');
    await expect(lesson).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 5; i++) await lesson.locator('[data-a="next"]').click();
    for (const a of [1, 2, 0, 1, 0]) await lesson.locator(`.quiz-a[data-i="${a}"]`).click();
    await lesson.locator('[data-a="go"]').click();
    await done('f3_plan3');

    // the hacker (met in the street), the locksmith and the boatman
    await go('La Rosaleda');
    await done('f3_hacker');
    await page.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['cerrajero', 'barquero']) M.complete(M.byId('f3_' + k)); });
    expect(await count('stethoscope')).toBe(1);
    expect(await pu()).toMatchObject({ act: 3 });

    // the port warehouse
    await go('Almacén del Puerto');
    await page.waitForFunction(() => !!window.__sc.game.puerto.plan(), null, { timeout: 60_000 });
    const pl = await page.evaluate(() => {
      const g = window.__sc.game, U = g.puerto, pl = U.plan(), pt = (d, a) => U.pt(pl, d, a);
      return { base: pl.P.base, depth: pl.depth, width: pl.width, c0: pl.c0, mid: pl.mid, door: pt(0, pl.mid), front: pt(-4, pl.mid), fuse: pt(...pl.fuse), safe: pt(...pl.safe), cell: pt(...pl.cell.door), crate: pt(...pl.crates[0]), laser: pt(pl.lasers[0], pl.mid), office: pt(pl.c0 + 5, pl.mid) };
    });
    expect(pl.depth).toBeLessThanOrEqual(34);
    expect(pl.width).toBeLessThanOrEqual(34);
    const at = (q, y) => page.evaluate(async ([x, y, z]) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, y, z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); }, [q.x, y, q.z]);
    const block = (q, y) => page.evaluate(([x, y, z]) => window.__sc.game.world.getBlock(x, y, z), [q.x, y, q.z]);
    const B = await page.evaluate(() => window.__sc.B);
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.door, y: pl.base + 1, id: B.factory_door }, { timeout: 60_000 });
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.safe, y: pl.base + 1, id: B.safe }, { timeout: 60_000 });
    expect(await block(pl.fuse, pl.base + 1)).toBe(B.fuse_box);
    expect(await block(pl.cell, pl.base + 1)).toBe(B.cell_door);
    expect(await block(pl.crate, pl.base + 1)).toBe(B.crate);

    // in through the door
    await page.waitForFunction(() => window.__sc.game.missions.prog('f3_entrada3').step === 1, null, { timeout: 15_000 });
    const use = (q, y, id) => page.evaluate(({ q, y, id }) => window.__sc.game.puerto.use({ x: q.x, y, z: q.z, id }), { q, y, id });
    await use(pl.door, pl.base + 1, B.factory_door);
    await done('f3_entrada3');
    expect(await pu()).toMatchObject({ act: 4, alarms: 0 });
    await expect(page.locator('.fab-panel.three')).toBeVisible();
    await shot(page, 'puerto-hall');

    // in front of a camera, in its cone: the alarm, and the crew slips out
    // (a free spot in the hall in a camera's cone right now; the cones sweep, so wait for one)
    const inCone = () => page.waitForFunction(() => {
      const g = window.__sc.game, U = g.puerto, pl = U.plan();
      for (let c = 0; c < pl.cams.length; c++) {
        const o = U.camPos(pl, c), yaw = U.camYaw(pl, c);
        for (const k of [4, 5, 6, 7, 3, 8, 9]) {
          const x = o.x + Math.sin(yaw) * k, z = o.z + Math.cos(yaw) * k, y = pl.P.base + 1.05;
          if (g.world.getBlock(Math.floor(x), pl.P.base + 1, Math.floor(z)) || g.world.getBlock(Math.floor(x), pl.P.base + 2, Math.floor(z))) continue;
          const w = U.where(pl, { x, y, z });
          if (!U.inside(pl, { x, y, z }) || w.d >= pl.c0 || w.d < 4) continue;
          if (!U.sees(pl, c, { x, y: y + 1.5, z })) continue;
          g.player.pos.set(x, y, z); g.player.vel.set(0, 0, 0);
          return true;
        }
      }
      return false;
    }, null, { timeout: 15_000 }).then(() => true);
    // (the cones keep sweeping: if one has moved on before the player is seen, another try)
    let seen = false;
    for (let i = 0; i < 4 && !seen; i++) {
      await page.evaluate(() => { window.__sc.game.puerto.alarmT = 0; });
      expect(await inCone()).toBe(true);
      seen = await page.waitForFunction(() => window.__sc.game.puerto.state().alarms === 1, null, { timeout: 2_000 }).then(() => true, () => false);
    }
    expect(seen).toBe(true);
    expect(await page.evaluate(() => { const U = window.__sc.game.puerto; return U.inside(U.plan()); })).toBe(false);

    // back in (the lobby is out of the cameras' sight); the fuse box blinds them, then needs a minute
    await use(pl.door, pl.base + 1, B.factory_door);
    await page.waitForTimeout(800);
    expect(await pu()).toMatchObject({ alarms: 1 });
    await use(pl.fuse, pl.base + 1, B.fuse_box);
    expect(await page.evaluate(() => { const s = window.__sc.game.puerto.state(); return [s.camsOff > 20, s.fuseCd > 50]; })).toEqual([true, true]);
    await page.evaluate(() => { window.__sc.game.puerto.alarmT = 0; });
    expect(await inCone()).toBe(true);
    await page.waitForTimeout(1200);
    expect(await pu()).toMatchObject({ alarms: 1 });
    await use(pl.fuse, pl.base + 1, B.fuse_box);
    expect(await page.evaluate(() => window.__sc.game.puerto.state().camsOff <= 25)).toBe(true);
    await shot(page, 'puerto-cams-off');

    // a laser beam that is on: the alarm
    await page.evaluate(() => { window.__sc.game.puerto.state().camsOff = 600; });
    await page.waitForFunction(() => window.__sc.game.puerto.laserOn(0) && window.__sc.game.puerto.laserOn(0, Date.now() / 1000 + 0.6), null, { timeout: 10_000 });
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.laser, y: pl.base + 1, id: B.laser }, { timeout: 5_000 });
    await shot(page, 'puerto-laser');
    await at(pl.laser, pl.base + 1.05);
    await page.waitForFunction(() => window.__sc.game.puerto.state().alarms === 2, null, { timeout: 5_000 });
    // ... and off, it lets the crew through
    await page.waitForFunction(() => !window.__sc.game.puerto.laserOn(0), null, { timeout: 10_000 });
    await page.waitForFunction(({ q, y }) => window.__sc.game.world.getBlock(q.x, y, q.z) === 0, { q: pl.laser, y: pl.base + 1 }, { timeout: 5_000 });

    // past the cameras and the lasers: the office
    await use(pl.door, pl.base + 1, B.factory_door);
    await page.evaluate(() => { window.__sc.game.puerto.state().camsOff = 600; window.__sc.game.puerto.alarmT = 0; });
    await at(pl.office, pl.base + 1.05);
    await done('f3_sigilo');
    expect(await pu()).toMatchObject({ act: 5, alarms: 2 });

    // the safe: a wrong set of numbers, then the three clicks
    await use(pl.safe, pl.base + 1, B.safe);
    const safe = page.locator('[data-screen="puertoSafe"]');
    await expect(safe).toBeVisible();
    const combo = await page.evaluate(() => window.__sc.game.puerto.state().combo);
    const dialTo = async (n) => {
      const now = Number(await safe.locator('.sd-num').textContent()), diff = (n - now + 40) % 40;
      for (let i = 0; i < Math.floor(diff / 5); i++) await safe.locator('[data-d="5"]').click();
      for (let i = 0; i < diff % 5; i++) await safe.locator('[data-d="1"]').click();
      await expect(safe.locator('.sd-num')).toHaveText(String(n).padStart(2, '0'));
    };
    const wrong = combo.map((n) => (n + 7) % 40);
    for (const n of wrong) { await dialTo(n); await safe.locator('[data-a="set"]').click(); }
    await expect(safe.locator('.sd-msg')).toContainText('does not move');
    await page.waitForTimeout(700);
    for (const n of combo) { await dialTo(n); await expect(safe.locator('.sd-ear')).toContainText('CLICK'); await safe.locator('[data-a="set"]').click(); }
    await shot(page, 'puerto-safe');
    await done('f3_caja');
    expect(await count('cell_key')).toBe(1);
    expect(await pu()).toMatchObject({ act: 6 });

    // the cell: the key opens it, the run begins
    await expect(safe).toHaveCount(0);
    await use(pl.cell, pl.base + 1, B.cell_door);
    await done('f3_celda');
    expect(await count('cell_key')).toBe(0);
    await page.waitForFunction(({ q, y }) => window.__sc.game.world.getBlock(q.x, y, q.z) === 0, { q: pl.cell, y: pl.base + 1 }, { timeout: 5_000 });
    expect(await page.evaluate(() => { const s = window.__sc.game.puerto.state(); return [s.act, s.escape > 140]; })).toEqual([7, true]);
    await shot(page, 'puerto-cell');
    // time running out: the police block the port, back to the warehouse
    // (the messages are noted as they come: on a slow runner a toast can be gone before it is looked at)
    await page.evaluate(() => { const g = window.__sc.game, ui = g.ui, toast = ui.toast; window.__toasts = []; ui.toast = function (m, ...a) { window.__toasts.push(m); return toast.call(this, m, ...a); }; g.puerto.state().escape = 0.3; });
    await page.waitForFunction(() => window.__sc.game.puerto.state().escape > 140, null, { timeout: 30_000 });
    expect(await page.evaluate(() => window.__toasts.some((m) => /blocked the port/.test(m)))).toBe(true);

    // to the boat
    await go('Muelle de Heredia');
    const end = page.locator('[data-screen="puertoFinale"]');
    await expect(end).toBeVisible({ timeout: 30_000 });
    await expect(end).toContainText('Espeto');
    await shot(page, 'puerto-finale');
    expect(await page.evaluate(() => { const s = window.__sc.game.puerto.state(); return { act: s.act, done: s.done }; })).toEqual({ act: 8, done: true });
    await end.locator('[data-act="close"]').click();
    expect(problems).toEqual([]);
  });
});
