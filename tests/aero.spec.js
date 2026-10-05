import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// La Fábrica, season 4: hidden until season 3 is done; El Maestro's call and
// plan; the forger's passport, the pilot and the baggage handler's badge; the
// airport's cargo terminal built with its staff door, rows of containers, the
// baggage belt and the control room; the staff door wants the badge; a guard's
// torch sets off the alarm (the crew slips out); the belt carries the player
// deeper; past the guards the control room; the routing panel (a wrong send,
// then the belt pieces turned to Hangar 7); time running out sends the crew
// back; the pilot wants the passport; the jet takes off at the end.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('La Fábrica season 4', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(300_000);

  test('the badge, the guards, the belt, the routing panel and the jet', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    // (the messages are noted as they come: on a slow runner a toast can be gone before it is looked at)
    await page.evaluate(() => { const g = window.__sc.game, ui = g.ui, toast = ui.toast; g.player.god = true; (g.profile.guidesSeen || (g.profile.guidesSeen = {})).city = true; window.__toasts = []; ui.toast = function (m, ...a) { window.__toasts.push(m); return toast.call(this, m, ...a); }; });
    const toasted = (re) => page.waitForFunction((src) => window.__toasts.some((m) => new RegExp(src).test(m)), re.source, { timeout: 15_000 });

    const ae = () => page.evaluate(() => { const g = window.__sc.game, s = g.aero.state(); return { act: s.act, alarms: s.alarms, ids: g.missions.all().filter((m) => m.season === 4).map((m) => m.id) }; });
    const go = (name) => page.evaluate(async (name) => {
      const g = window.__sc.game, q = g.missions.placeXZ(name);
      await g.city.ensure(q.x, q.z, 64);
      const c = g.city.openCellNear(q.x, q.z, 20) || q;
      g.player.pos.set(c.x + 0.5, 126, c.z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); g.placeOnGround();
    }, name);
    const done = (id) => page.waitForFunction((id) => window.__sc.game.missions.isDone(id), id, { timeout: 30_000 });
    const count = (k) => page.evaluate((k) => window.__sc.game.inventory.count(k), k);

    // hidden until season 3 is done
    expect((await ae()).ids).toEqual([]);
    await page.evaluate(() => { const g = window.__sc.game, f = g.fabrica.state(), o = g.oro.state(), u = g.puerto.state(); f.done = true; f.act = 7; f.alias = 'espeto'; o.done = true; o.act = 9; u.done = true; u.act = 8; });
    expect(await ae()).toMatchObject({ act: 0, ids: ['f4_vuelo'] });

    // El Maestro's call and plan
    await go('Finca El Maestro');
    await done('f4_vuelo');
    const lesson = page.locator('[data-screen="aeroLesson"]');
    await expect(lesson).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 5; i++) await lesson.locator('[data-a="next"]').click();
    for (const a of [2, 0, 1, 2, 1]) await lesson.locator(`.quiz-a[data-i="${a}"]`).click();
    await lesson.locator('[data-a="go"]').click();
    await done('f4_plan4');

    // the forger (met in the market), the pilot and the baggage handler
    await go('Mercado de Atarazanas');
    await done('f4_falsificador');
    expect(await count('fake_passport')).toBe(1);
    await page.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['piloto', 'mozo']) M.complete(M.byId('f4_' + k)); });
    expect(await count('cargo_badge')).toBe(1);
    expect(await ae()).toMatchObject({ act: 3 });

    // the cargo terminal
    await go('Terminal de Carga');
    await page.waitForFunction(() => !!window.__sc.game.aero.plan(), null, { timeout: 60_000 });
    const pl = await page.evaluate(() => {
      const g = window.__sc.game, U = g.aero, pl = U.plan(), pt = (d, a) => U.pt(pl, d, a);
      return { base: pl.P.base, depth: pl.depth, width: pl.width, c0: pl.c0, mid: pl.mid, belt: pl.belt, beltFrom: pl.beltFrom, lanes: pl.lanes, door: pt(0, pl.mid), front: pt(-4, pl.mid), panel: pt(...pl.panel), box: pt(pl.containers[0][0], pl.containers[0][1]), onBelt: pt(pl.beltFrom + 1, pl.belt), control: pt(pl.c0 + 3, pl.mid) };
    });
    expect(pl.depth).toBeLessThanOrEqual(34);
    expect(pl.width).toBeLessThanOrEqual(34);
    const at = (q, y) => page.evaluate(async ([x, y, z]) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, y, z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); }, [q.x, y, q.z]);
    const block = (q, y) => page.evaluate(([x, y, z]) => window.__sc.game.world.getBlock(x, y, z), [q.x, y, q.z]);
    const B = await page.evaluate(() => window.__sc.B);
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.door, y: pl.base + 1, id: B.staff_door }, { timeout: 60_000 });
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.panel, y: pl.base + 1, id: B.route_panel }, { timeout: 60_000 });
    expect([B.cargo_container, B.cargo_container_red]).toContain(await block(pl.box, pl.base + 2));
    expect(await block(pl.onBelt, pl.base)).toBe(B.conveyor);
    await shot(page, 'aero-terminal');

    // the staff door wants the badge
    await page.waitForFunction(() => window.__sc.game.missions.prog('f4_entrada4').step === 1, null, { timeout: 15_000 });
    const use = (q, y, id) => page.evaluate(({ q, y, id }) => window.__sc.game.aero.use({ x: q.x, y, z: q.z, id }), { q, y, id });
    await page.evaluate(() => window.__sc.game.inventory.remove('cargo_badge', 1));
    await use(pl.door, pl.base + 1, B.staff_door);
    await toasted(/staff badge/);
    expect(await ae()).toMatchObject({ act: 3 });
    await page.evaluate(() => window.__sc.game.giveItem('cargo_badge', 1));
    await use(pl.door, pl.base + 1, B.staff_door);
    await done('f4_entrada4');
    expect(await ae()).toMatchObject({ act: 4, alarms: 0 });
    await expect(page.locator('.fab-panel.four')).toBeVisible();
    await shot(page, 'aero-hall');

    // in front of a guard, in the light of the torch: the alarm, and the crew slips out
    // (the guards walk their lanes and turn at the ends, so wait for a spot ahead of one)
    const inBeam = () => page.waitForFunction(() => {
      const g = window.__sc.game, U = g.aero, pl = U.plan();
      for (let i = 0; i < pl.lanes.length; i++) {
        const q = U.guardAt(pl, i), a = q.a + q.dir * 3;
        if (a < 2 || a > pl.width - 2) continue;
        const p = U.at(pl, q.d, a);
        if (!U.sees(pl, i, { x: p.x, y: pl.P.base + 2.55, z: p.z })) continue;
        g.player.pos.set(p.x, pl.P.base + 1.05, p.z); g.player.vel.set(0, 0, 0);
        return true;
      }
      return false;
    }, null, { timeout: 30_000 }).then(() => true);
    let seen = false;
    for (let i = 0; i < 4 && !seen; i++) {
      await page.evaluate(() => { window.__sc.game.aero.alarmT = 0; });
      expect(await inBeam()).toBe(true);
      seen = await page.waitForFunction(() => window.__sc.game.aero.state().alarms === 1, null, { timeout: 2_000 }).then(() => true, () => false);
    }
    expect(seen).toBe(true);
    expect(await page.evaluate(() => { const U = window.__sc.game.aero; return U.inside(U.plan()); })).toBe(false);
    await toasted(/Caught in a torch/);

    // back in through the staff door; the belt carries the player deeper into the hall
    await use(pl.door, pl.base + 1, B.staff_door);
    expect(await page.evaluate(() => { const U = window.__sc.game.aero; return U.inside(U.plan()); })).toBe(true);
    await page.evaluate(() => { window.__sc.game.aero.alarmT = 60; }); // (no guard looks while the belt is checked)
    await at(pl.onBelt, pl.base + 1.05);
    const d0 = await page.evaluate(() => { const U = window.__sc.game.aero; return U.where(U.plan()).d; });
    await page.waitForFunction((d0) => { const U = window.__sc.game.aero; return U.where(U.plan()).d >= d0 + 3; }, d0, { timeout: 15_000 });

    // past the guards: the control room
    await page.evaluate(() => { window.__sc.game.aero.alarmT = 0; });
    await at(pl.control, pl.base + 1.05);
    await done('f4_patrulla');
    expect(await ae()).toMatchObject({ act: 5, alarms: 1 });

    // the routing panel: a wrong send, then the belt pieces turned to Hangar 7
    await use(pl.panel, pl.base + 1, B.route_panel);
    const panel = page.locator('[data-screen="aeroRoute"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.rt-out.goal')).toHaveText('Hangar 7');
    await panel.locator('[data-a="send"]').click();
    await expect(panel.locator('.rt-msg')).toContainText(/Not there|line is broken/);
    expect(await ae()).toMatchObject({ act: 5 });
    await shot(page, 'aero-route');
    const turns = await page.evaluate(() => { const rt = window.__sc.game.aero.state().route; return rt.sol.map((v, i) => (v < 0 ? 0 : rt.cells[i].k ? (((v - rt.cells[i].r) % 4) + 4) % 4 : (((v - rt.cells[i].r) % 2) + 2) % 2)); });
    for (const [i, n] of turns.entries()) for (let k = 0; k < n; k++) await panel.locator(`.rt-cell[data-i="${i}"]`).click();
    await expect(panel.locator('.rt-to')).toHaveAttribute('data-to', 'hangar');
    await shot(page, 'aero-route-done');
    await panel.locator('[data-a="send"]').click();
    await done('f4_desvio');
    expect(await page.evaluate(() => { const s = window.__sc.game.aero.state(); return [s.act, s.escape > 140]; })).toEqual([6, true]);
    await expect(panel).toHaveCount(0);

    // time running out: the tower closes the airport, back to the terminal
    await page.evaluate(() => { window.__sc.game.aero.state().escape = 0.3; });
    await page.waitForFunction(() => window.__sc.game.aero.state().escape > 140, null, { timeout: 30_000 });
    await toasted(/tower closed the airport/);

    // to the jet: the pilot wants the passport
    await page.evaluate(() => window.__sc.game.inventory.remove('fake_passport', 1));
    await go('Hangar del Aeropuerto');
    await page.waitForFunction(() => window.__sc.game.missions.prog('f4_pista').step === 1, null, { timeout: 30_000 });
    const stairs = await page.evaluate(() => { const U = window.__sc.game.aero, st = U.stairs(U.jetSpot()); return { x: Math.floor(st.x), z: Math.floor(st.z) }; });
    await page.evaluate(({ x, z }) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, g.city.groundAt(x, z) + 1.05, z + 0.5); g.player.vel.set(0, 0, 0); }, stairs);
    await page.waitForFunction(() => !!window.__sc.game.aero.jet, null, { timeout: 10_000 });
    await shot(page, 'aero-jet');
    await toasted(/No passport/);
    await page.evaluate(() => window.__sc.game.giveItem('fake_passport', 1));
    const end = page.locator('[data-screen="aeroFinale"]');
    await expect(end).toBeVisible({ timeout: 30_000 });
    await expect(end).toContainText('Espeto');
    await shot(page, 'aero-finale');
    expect(await page.evaluate(() => { const s = window.__sc.game.aero.state(); return { act: s.act, done: s.done }; })).toEqual({ act: 7, done: true });
    expect(await count('fake_passport')).toBe(0);
    await end.locator('[data-act="close"]').click();
    // the jet rolls down the runway and climbs away
    await page.waitForFunction(() => { const j = window.__sc.game.aero.jet; return !j || j.takeoff > 1; }, null, { timeout: 10_000 });
    expect(problems).toEqual([]);
  });
});
