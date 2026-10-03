import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// La Fábrica, season 1: El Maestro at his farmhouse, the class (lessons, a
// quiz, an alias), four contacts for the preparations, the way into the old
// tobacco factory, the siege (presses fed with paper and ink, the red phone,
// a raid held at a door, a worker caught slipping out, the police storming in
// when their patience runs out), the tunnel out with the bags, and the end at
// the farmhouse with the red jumpsuit and the grinning mask.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('La Fábrica', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(300_000);

  test('the class, the preparations, the siege, the tunnel and the escape', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    await page.evaluate(() => { const g = window.__sc.game; g.player.god = true; (g.profile.guidesSeen || (g.profile.guidesSeen = {})).city = true; });

    const fab = () => page.evaluate(() => { const g = window.__sc.game, s = g.fabrica.state(); return { act: s.act, alias: s.alias, printed: s.printed, ids: g.missions.all().filter((m) => m.fab).map((m) => m.id) }; });
    const go = (name) => page.evaluate(async (name) => {
      const g = window.__sc.game, q = g.missions.placeXZ(name);
      await g.city.ensure(q.x, q.z, 64);
      const c = g.city.openCellNear(q.x, q.z, 20) || q;
      g.player.pos.set(c.x + 0.5, 126, c.z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); g.placeOnGround();
    }, name);
    const done = (id) => page.waitForFunction((id) => window.__sc.game.missions.isDone(id), id, { timeout: 30_000 });

    // only the first mission: find El Maestro
    expect(await fab()).toMatchObject({ act: 0, ids: ['f_maestro'] });
    await page.evaluate(() => window.__sc.ui.open('missions'));
    await expect(page.locator('.mis-card.fab[data-id="f_maestro"]')).toBeVisible();
    await page.evaluate(() => window.__sc.ui.closeAll());

    // act 1: the farmhouse, then El Maestro's class
    await go('Finca El Maestro');
    await done('f_maestro');
    const lesson = page.locator('[data-screen="fabLesson"]');
    await expect(lesson).toBeVisible({ timeout: 10_000 });
    await shot(page, 'fab-lesson');
    for (let i = 0; i < 5; i++) { await expect(lesson.locator('.blackboard h3')).not.toBeEmpty(); await lesson.locator('[data-a="next"]').click(); }
    // a wrong answer too many: the class again
    for (let i = 0; i < 5; i++) await lesson.locator('.quiz-a[data-i="0"]').click();
    await expect(lesson.locator('[data-a="again"]')).toBeVisible();
    await lesson.locator('[data-a="again"]').click();
    for (let i = 0; i < 5; i++) await lesson.locator('[data-a="next"]').click();
    for (const a of [1, 0, 2, 1, 2]) await lesson.locator(`.quiz-a[data-i="${a}"]`).click();
    await expect(lesson.locator('.alias-grid [data-alias]')).toHaveCount(6);
    await shot(page, 'fab-alias');
    await lesson.locator('[data-alias="biznaga"]').click();
    await expect(lesson).toHaveCount(0);
    await done('f_class');
    expect(await fab()).toMatchObject({ act: 2, alias: 'biznaga', ids: ['f_maestro', 'f_class', 'f_monos', 'f_mascaras', 'f_camion', 'f_planos'] });
    expect(await page.evaluate(() => window.__sc.game.missions.tracked.id)).toBe('f_monos');

    // act 2: the four contacts (one met in the street, the rest marked done)
    await go('Plaza de la Merced');
    await done('f_monos');
    await page.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['mascaras', 'camion', 'planos']) M.complete(M.byId('f_' + k)); });
    expect(await fab()).toMatchObject({ act: 3 });

    // act 3: the Tabacalera, built as a mint
    await go('La Tabacalera');
    await page.waitForFunction(() => !!window.__sc.game.fabrica.plan(), null, { timeout: 60_000 });
    const pl = await page.evaluate(() => {
      const g = window.__sc.game, F = g.fabrica, pl = F.plan(), pt = (d, a) => F.pt(pl, d, a);
      return { base: pl.P.base, mid: pl.mid, door: pt(0, pl.mid), front: pt(-4, pl.mid), phone: pt(...pl.phone), paper: pt(...pl.paper), ink: pt(...pl.ink), press: pt(...pl.presses[0]), presses: pl.presses.length, pallets: pl.pallets.length, from: pt(pl.tunnel.from, pl.tunnel.a), to: pt(pl.tunnel.to, pl.tunnel.a), dig: pt(pl.tunnel.from - 1, pl.tunnel.a), first: pt(...pl.pallets[0]) };
    });
    expect(pl.presses).toBeGreaterThanOrEqual(2);
    expect(pl.pallets).toBeGreaterThanOrEqual(10);
    const at = (q, y) => page.evaluate(async ([x, y, z]) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, y, z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); }, [q.x, y, q.z]);
    const block = (q, y) => page.evaluate(([x, y, z]) => window.__sc.game.world.getBlock(x, y, z), [q.x, y, q.z]);
    const B = await page.evaluate(() => window.__sc.B);
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.door, y: pl.base + 1, id: B.factory_door }, { timeout: 60_000 });
    await at(pl.paper, pl.base + 4);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.press, y: pl.base + 1, id: B.money_press }, { timeout: 60_000 });
    expect(await block(pl.phone, pl.base + 1)).toBe(B.red_phone);
    expect(await block(pl.paper, pl.base + 1)).toBe(B.paper_stack);
    expect(await block(pl.ink, pl.base + 1)).toBe(B.ink_barrel);
    expect(await block(pl.from, pl.base)).toBe(B.sewer_grate);
    expect(await block(pl.to, pl.base)).toBe(B.sewer_grate);
    expect(await block(pl.dig, pl.base - 1)).toBe(B.soft_earth);
    await shot(page, 'fab-inside');

    // at the door: the entry mission's first step met, then the door used
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(() => window.__sc.game.missions.prog('f_entrada').step === 1, null, { timeout: 15_000 });
    const use = (q, y, id) => page.evaluate(({ q, y, id }) => window.__sc.game.fabrica.use({ x: q.x, y, z: q.z, id }), { q, y, id });
    // the siege's events held back, to drive them one by one
    const calm = () => page.evaluate(() => { const s = window.__sc.game.fabrica.state(); Object.assign(s, { nextPhone: 1e4, nextRaid: 1e4, nextEsc: 1e4, nextCrew: 1e4 }); });
    await use(pl.door, pl.base + 1, B.factory_door);
    await calm();
    await done('f_entrada');
    expect(await fab()).toMatchObject({ act: 4, printed: 0 });
    expect(await page.evaluate(() => { const g = window.__sc.game; return g.fabrica.inside(g.fabrica.plan()); })).toBe(true);

    // a press needs paper and ink
    expect(await page.evaluate(() => [window.__sc.game.inventory.count('paper_roll'), window.__sc.game.inventory.count('ink_can')])).toEqual([0, 0]);
    await use(pl.press, pl.base + 1, B.money_press);
    expect(await page.evaluate(() => Object.keys(window.__sc.game.fabrica.state().presses).length)).toBe(0);
    await use(pl.paper, pl.base + 1, B.paper_stack);
    await use(pl.ink, pl.base + 1, B.ink_barrel);
    expect(await page.evaluate(() => [window.__sc.game.inventory.count('paper_roll'), window.__sc.game.inventory.count('ink_can')])).toEqual([4, 4]);
    await use(pl.press, pl.base + 1, B.money_press);
    expect(await block(pl.press, pl.base + 1)).toBe(B.money_press_on);
    // printed: the first pallet in the pallet room
    await page.evaluate(() => { const pr = window.__sc.game.fabrica.state().presses[0]; pr.jamAt = -1; pr.t = 0.3; });
    await page.waitForFunction(() => window.__sc.game.fabrica.state().printed === 1, null, { timeout: 10_000 });
    expect(await block(pl.first, pl.base + 1)).toBe(B.cash_pallet);
    expect(await block(pl.press, pl.base + 1)).toBe(B.money_press);
    await page.evaluate(() => window.__sc.ui.hud.fabUpdate && window.__sc.ui.hud.fabUpdate(window.__sc.game));
    await expect(page.locator('.fab-panel')).toBeVisible();
    await shot(page, 'fab-press');

    // a jammed press: fixed by hand
    await use(pl.press, pl.base + 1, B.money_press);
    await page.evaluate(() => { const pr = window.__sc.game.fabrica.state().presses[0]; pr.jamAt = pr.t - 0.2; });
    await page.waitForFunction(() => window.__sc.game.fabrica.state().presses[0].jam === true, null, { timeout: 10_000 });
    await use(pl.press, pl.base + 1, B.money_press);
    expect(await page.evaluate(() => { const pr = window.__sc.game.fabrica.state().presses[0]; return [pr.jam, pr.on]; })).toEqual([false, true]);
    await page.evaluate(() => { const pr = window.__sc.game.fabrica.state().presses[0]; pr.t = 0.3; });
    await page.waitForFunction(() => window.__sc.game.fabrica.state().printed === 2, null, { timeout: 10_000 });

    // the red phone: the negotiator, answered calmly
    await page.evaluate(() => { const s = window.__sc.game.fabrica.state(); s.patience = 50; s.nextPhone = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.fabrica.state().phone, null, { timeout: 10_000 });
    await use(pl.phone, pl.base + 1, B.red_phone);
    const phone = page.locator('[data-screen="fabPhone"]');
    await expect(phone.locator('[data-c]')).toHaveCount(4);
    await shot(page, 'fab-phone');
    await phone.locator('[data-c="0"]').click();
    expect(await page.evaluate(() => { const s = window.__sc.game.fabrica.state(); return [s.phone, s.patience]; })).toEqual([null, 58]);
    await calm();

    // a raid at the back door: held there, nothing lost
    await page.evaluate(() => { window.__sc.game.fabrica.state().nextRaid = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.fabrica.state().raid, null, { timeout: 10_000 });
    const door = await page.evaluate(() => window.__sc.game.fabrica.state().raid.door);
    await page.evaluate((door) => window.__sc.game.fabrica.action('door', { door }), door);
    await page.evaluate(() => { window.__sc.game.fabrica.state().raid.t = 0.1; });
    await page.waitForFunction(() => !window.__sc.game.fabrica.state().raid, null, { timeout: 10_000 });
    expect(await fab()).toMatchObject({ printed: 2 });
    // one not held: two pallets taken
    await page.evaluate(() => { const s = window.__sc.game.fabrica.state(); s.raid = { door: 'front', t: 0.1, held: false }; });
    await page.waitForFunction(() => !window.__sc.game.fabrica.state().raid, null, { timeout: 10_000 });
    expect(await fab()).toMatchObject({ printed: 0 });
    expect(await block(pl.first, pl.base + 1)).toBe(0);
    await calm();

    // a worker slipping out: caught on the way to the front door
    await page.evaluate(() => { window.__sc.game.fabrica.state().nextEsc = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.fabrica.state().esc, null, { timeout: 10_000 });
    await page.evaluate(() => { const g = window.__sc.game, F = g.fabrica, w = F.escapee(F.plan(), F.state().esc); g.player.pos.set(w.x, g.fabrica.plan().P.base + 1.05, w.z); });
    await page.waitForFunction(() => !window.__sc.game.fabrica.state().esc, null, { timeout: 10_000 });
    await calm();

    // out of patience: the police storm in, the crew is back outside the door
    await page.evaluate(() => { window.__sc.game.fabrica.state().patience = 0; });
    await page.waitForFunction(() => window.__sc.game.fabrica.state().act === 3, null, { timeout: 10_000 });
    expect(await page.evaluate(() => { const g = window.__sc.game; return [g.missions.isDone('f_entrada'), g.missions.prog('f_entrada').step, g.fabrica.inside(g.fabrica.plan()), g.fabrica.state().fails]; })).toEqual([false, 1, false, 1]);
    await expect(page.locator('.toast', { hasText: 'stormed' })).toBeVisible();

    // in again and printed to the end
    await use(pl.door, pl.base + 1, B.factory_door);
    await calm();
    await done('f_entrada');
    await page.evaluate(() => {
      const g = window.__sc.game, F = g.fabrica, s = F.state(), pl = F.plan();
      while (s.printed < 9) { s.printed++; F.placePallet(pl, s.printed); g.missions.event('fab_print'); }
      F.apply('start', { i: 1 }, true); const pr = s.presses[1]; pr.jamAt = -1; pr.t = 0.3;
    });
    await done('f_asedio');
    expect(await fab()).toMatchObject({ act: 5, printed: 10 });

    // act 5: the tunnel, from the pallet room's hatch, dug through, up through the lobby's
    await at(pl.from, pl.base + 1);
    await use(pl.from, pl.base, B.sewer_grate);
    expect(await page.evaluate(() => window.__sc.game.player.pos.y)).toBeLessThan(pl.base);
    await shot(page, 'fab-tunnel');
    await at(pl.to, pl.base - 2);
    await use(pl.to, pl.base, B.sewer_grate);
    await done('f_tunel');
    expect(await page.evaluate(() => window.__sc.game.inventory.count('money_bag'))).toBe(10);
    expect(await fab()).toMatchObject({ act: 6 });

    // act 6: the bags to El Maestro
    await go('Finca El Maestro');
    const end = page.locator('[data-screen="fabFinale"]');
    await expect(end).toBeVisible({ timeout: 30_000 });
    await expect(end).toContainText('10');
    await shot(page, 'fab-finale');
    const r = await page.evaluate(() => { const g = window.__sc.game, s = g.fabrica.state(); return { act: s.act, done: s.done, bags: s.bags, left: g.inventory.count('money_bag') }; });
    expect(r).toEqual({ act: 7, done: true, bags: 10, left: 0 });
    await end.locator('[data-act="close"]').click();
    expect(problems).toEqual([]);
  });
});
