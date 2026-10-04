import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// La Fábrica, season 2: hidden until season 1 is done; El Maestro's call and
// second class; the forged order, the uniform and the boat; Siroco freed with
// the right answers on the quay (not with the wrong ones); the prep; La
// Térmica built with its furnaces, gold shelves, pumps, generator, red phone
// and outflow grate; the siege (a furnace needs a bar and power, the water
// floods the vault when the pumps stop, the generator brings the power back,
// a drilled wall is braced, the negotiator answered calmly, the police
// storming in when their patience runs out); twelve bars melted; out through
// the pipe with the gold; the end on La Misericordia beach.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('La Fábrica season 2', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(300_000);

  test('the rescue, the gold of La Térmica under siege, the pipe and the sea', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    await page.evaluate(() => { const g = window.__sc.game; g.player.god = true; (g.profile.guidesSeen || (g.profile.guidesSeen = {})).city = true; });

    const oro = () => page.evaluate(() => { const g = window.__sc.game, s = g.oro.state(); return { act: s.act, melted: s.melted, ids: g.missions.all().filter((m) => m.season === 2).map((m) => m.id) }; });
    const go = (name) => page.evaluate(async (name) => {
      const g = window.__sc.game, q = g.missions.placeXZ(name);
      await g.city.ensure(q.x, q.z, 64);
      const c = g.city.openCellNear(q.x, q.z, 20) || q;
      g.player.pos.set(c.x + 0.5, 126, c.z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); g.placeOnGround();
    }, name);
    const done = (id) => page.waitForFunction((id) => window.__sc.game.missions.isDone(id), id, { timeout: 30_000 });
    const count = (k) => page.evaluate((k) => window.__sc.game.inventory.count(k), k);

    // hidden until season 1 is done
    expect((await oro()).ids).toEqual([]);
    await page.evaluate(() => { const f = window.__sc.game.fabrica.state(); f.done = true; f.act = 7; f.alias = 'pimpi'; });
    expect(await oro()).toMatchObject({ act: 0, ids: ['f2_llamada'] });

    // act 1: El Maestro calls; the second class
    await go('Finca El Maestro');
    await done('f2_llamada');
    const lesson = page.locator('[data-screen="oroLesson"]');
    await expect(lesson).toBeVisible({ timeout: 10_000 });
    for (let i = 0; i < 5; i++) await lesson.locator('[data-a="next"]').click();
    for (const a of [2, 0, 1, 2, 0]) await lesson.locator(`.quiz-a[data-i="${a}"]`).click();
    await shot(page, 'oro-class');
    await lesson.locator('[data-a="go"]').click();
    await done('f2_clase2');
    expect(await oro()).toMatchObject({ act: 2, ids: ['f2_llamada', 'f2_clase2', 'f2_orden', 'f2_uniforme', 'f2_lancha'] });

    // act 2: the forged order (met in the street), the uniform and the boat
    await go('Mercado de Atarazanas');
    await done('f2_orden');
    await page.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['uniforme', 'lancha']) M.complete(M.byId('f2_' + k)); });
    expect([await count('fake_order'), await count('police_uniform')]).toEqual([1, 1]);
    expect(await oro()).toMatchObject({ act: 3 });

    // act 3: the quay; a story that does not add up, then the right one
    await go('Muelle Uno');
    const rescue = page.locator('[data-screen="oroRescue"]');
    await expect(rescue).toBeVisible({ timeout: 15_000 });
    for (const a of [0, 1, 0]) await rescue.locator(`.quiz-a[data-i="${a}"]`).click();
    await expect(rescue).toContainText('does not add up');
    await rescue.locator('[data-a="ok"]').click();
    expect(await page.evaluate(() => window.__sc.game.missions.isDone('f2_rescate'))).toBe(false);
    await page.evaluate(() => { window.__sc.game.oro.rescueT = 0; });
    await expect(rescue).toBeVisible({ timeout: 10_000 });
    for (const a of [1, 0, 2]) await rescue.locator(`.quiz-a[data-i="${a}"]`).click();
    await shot(page, 'oro-rescue');
    await rescue.locator('[data-a="ok"]').click();
    await done('f2_rescate');
    expect([await count('fake_order'), await count('police_uniform')]).toEqual([0, 0]);
    expect(await oro()).toMatchObject({ act: 4 });
    await page.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['buzos', 'fundidor', 'turnos']) M.complete(M.byId('f2_' + k)); });
    expect(await oro()).toMatchObject({ act: 5 });

    // act 5: La Térmica, the gold vault
    await go('La Térmica');
    await page.waitForFunction(() => !!window.__sc.game.oro.plan(), null, { timeout: 60_000 });
    const pl = await page.evaluate(() => {
      const g = window.__sc.game, O = g.oro, pl = O.plan(), pt = (d, a) => O.pt(pl, d, a);
      return { base: pl.P.base, depth: pl.depth, width: pl.width, door: pt(0, pl.mid), front: pt(-4, pl.mid), phone: pt(...pl.phone), gen: pt(...pl.generator), furnace: pt(...pl.furnaces[0]), furnace2: pt(...pl.furnaces[1]), furnaces: pl.furnaces.length, shelf: pt(...pl.shelves[0]), shelves: pl.shelves.length, pump: pt(...pl.pumps[0]), pump2: pt(...pl.pumps[1]), grate: pt(...pl.outflow), vault: pt(pl.vault + 1, pl.mid) };
    });
    expect(pl.depth).toBeLessThanOrEqual(42);
    expect(pl.width).toBeLessThanOrEqual(34);
    expect(pl.furnaces).toBeGreaterThanOrEqual(2);
    expect(pl.shelves).toBeGreaterThanOrEqual(8);
    const at = (q, y) => page.evaluate(async ([x, y, z]) => { const g = window.__sc.game; g.player.pos.set(x + 0.5, y, z + 0.5); g.player.vel.set(0, 0, 0); await g.ensureLoaded(); }, [q.x, y, q.z]);
    const block = (q, y) => page.evaluate(([x, y, z]) => window.__sc.game.world.getBlock(x, y, z), [q.x, y, q.z]);
    const B = await page.evaluate(() => window.__sc.B);
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.door, y: pl.base + 1, id: B.factory_door }, { timeout: 60_000 });
    await at(pl.vault, pl.base + 4);
    await page.waitForFunction(({ q, y, id }) => window.__sc.game.world.getBlock(q.x, y, q.z) === id, { q: pl.shelf, y: pl.base + 1, id: B.gold_shelf }, { timeout: 60_000 });
    expect(await block(pl.furnace, pl.base + 1)).toBe(B.gold_furnace);
    expect(await block(pl.pump, pl.base + 1)).toBe(B.water_pump);
    expect(await block(pl.gen, pl.base + 1)).toBe(B.generator);
    expect(await block(pl.phone, pl.base + 1)).toBe(B.red_phone);
    expect(await block(pl.grate, pl.base)).toBe(B.sewer_grate);
    expect(await block(pl.vault, pl.base)).toBe(B.vault_floor);
    await shot(page, 'oro-vault');

    // the door: in, the siege begins (its events held back, to drive them one by one)
    await at(pl.front, pl.base + 1);
    await page.waitForFunction(() => window.__sc.game.missions.prog('f2_entrada2').step === 1, null, { timeout: 15_000 });
    const use = (q, y, id) => page.evaluate(({ q, y, id }) => window.__sc.game.oro.use({ x: q.x, y, z: q.z, id }), { q, y, id });
    const calm = () => page.evaluate(() => { const s = window.__sc.game.oro.state(); Object.assign(s, { nextPhone: 1e4, nextCut: 1e4, nextDrill: 1e4, nextPump: 1e4, nextCrew: 1e4 }); });
    await use(pl.door, pl.base + 1, B.factory_door);
    await calm();
    await done('f2_entrada2');
    expect(await oro()).toMatchObject({ act: 6, melted: 0 });
    await expect(page.locator('.fab-panel.two')).toBeVisible();

    // a furnace needs a bar; the shelves give two at a time
    await use(pl.furnace, pl.base + 1, B.gold_furnace);
    expect(await page.evaluate(() => Object.keys(window.__sc.game.oro.state().furnaces).length)).toBe(0);
    for (let i = 0; i < 3; i++) await use(pl.shelf, pl.base + 1, B.gold_shelf);
    expect(await count('gold_bar')).toBe(2);
    await use(pl.furnace, pl.base + 1, B.gold_furnace);
    expect(await block(pl.furnace, pl.base + 1)).toBe(B.gold_furnace_on);
    expect(await count('gold_bar')).toBe(1);
    await page.evaluate(() => { window.__sc.game.oro.state().furnaces[0].t = 0.3; });
    await page.waitForFunction(() => window.__sc.game.oro.state().melted === 1, null, { timeout: 10_000 });
    expect(await block(pl.furnace, pl.base + 1)).toBe(B.gold_furnace);
    await shot(page, 'oro-furnace');

    // the power cut: the furnaces wait; the generator brings the power back
    await page.evaluate(() => { window.__sc.game.oro.state().nextCut = 0.1; });
    await page.waitForFunction(() => window.__sc.game.oro.state().power === false, null, { timeout: 10_000 });
    expect(await block(pl.gen, pl.base + 1)).toBe(B.generator_off);
    await use(pl.furnace2, pl.base + 1, B.gold_furnace);
    await page.evaluate(() => { window.__sc.game.oro.state().furnaces[1].t = 0.3; });
    await page.waitForTimeout(1200);
    expect(await oro()).toMatchObject({ melted: 1 });
    await use(pl.gen, pl.base + 1, B.generator_off);
    await calm();
    await page.waitForFunction(() => window.__sc.game.oro.state().melted === 2, null, { timeout: 10_000 });
    expect(await block(pl.gen, pl.base + 1)).toBe(B.generator);

    // a pump stops; with none running the vault floods: no bars until it is drained
    await page.evaluate(() => { window.__sc.game.oro.state().nextPump = 0.1; });
    await page.waitForFunction(() => window.__sc.game.oro.state().pumps.includes(false), null, { timeout: 10_000 });
    await calm();
    await page.evaluate(() => { const O = window.__sc.game.oro, s = O.state(), pl = O.plan(); s.pumps = [false, false]; O.setPump(pl, 0, false); O.setPump(pl, 1, false); s.water = 99.5; });
    await page.waitForFunction(() => window.__sc.game.oro.state().flood > 0, null, { timeout: 10_000 });
    await use(pl.shelf, pl.base + 1, B.gold_shelf);
    expect(await count('gold_bar')).toBe(0);
    await expect(page.locator('.fab-panel .fp-alerts')).toContainText('flooded');
    await page.evaluate(() => { window.__sc.game.oro.state().flood = 0.1; });
    await page.waitForFunction(() => window.__sc.game.oro.state().flood === 0, null, { timeout: 10_000 });
    expect(await block(pl.pump, pl.base + 1)).toBe(B.water_pump_off);
    await use(pl.pump, pl.base + 1, B.water_pump_off);
    await use(pl.pump2, pl.base + 1, B.water_pump_off);
    expect(await page.evaluate(() => window.__sc.game.oro.state().pumps)).toEqual([true, true]);
    expect(await block(pl.pump, pl.base + 1)).toBe(B.water_pump);

    // the police drill a wall: braced in time; not braced, it costs patience
    await page.evaluate(() => { window.__sc.game.oro.state().nextDrill = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.oro.state().drill, null, { timeout: 10_000 });
    await calm();
    const dq = await page.evaluate(() => { const O = window.__sc.game.oro, d = O.state().drill; return O.pt(O.plan(), d.d, d.a); });
    expect(await block(dq, pl.base + 1)).toBe(B.drill_wall);
    await shot(page, 'oro-drill');
    await use(dq, pl.base + 1, B.drill_wall);
    expect(await page.evaluate(() => window.__sc.game.oro.state().drill)).toBeNull();
    expect(await block(dq, pl.base + 1)).toBe(B.plaster_white);
    const pat = await page.evaluate(() => window.__sc.game.oro.state().patience);
    await page.evaluate(() => { window.__sc.game.oro.state().nextDrill = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.oro.state().drill, null, { timeout: 10_000 });
    await calm();
    await page.evaluate(() => { window.__sc.game.oro.state().drill.t = 0.1; });
    await page.waitForFunction(() => !window.__sc.game.oro.state().drill, null, { timeout: 10_000 });
    expect(await page.evaluate(() => window.__sc.game.oro.state().patience)).toBe(pat - 15);

    // the red phone: Inspector Vega, answered calmly
    await page.evaluate(() => { const s = window.__sc.game.oro.state(); s.patience = 40; s.nextPhone = 0.1; });
    await page.waitForFunction(() => !!window.__sc.game.oro.state().phone, null, { timeout: 10_000 });
    await calm();
    await use(pl.phone, pl.base + 1, B.red_phone);
    const phone = page.locator('[data-screen="oroPhone"]');
    await expect(phone.locator('[data-c]')).toHaveCount(4);
    await phone.locator('[data-c="0"]').click();
    expect(await page.evaluate(() => { const s = window.__sc.game.oro.state(); return [s.phone, s.patience]; })).toEqual([null, 48]);

    // out of patience: the police storm in, the entry waits again
    await page.evaluate(() => { window.__sc.game.oro.state().patience = 0; });
    await page.waitForFunction(() => window.__sc.game.oro.state().act === 5, null, { timeout: 10_000 });
    expect(await page.evaluate(() => { const g = window.__sc.game; return [g.missions.isDone('f2_entrada2'), g.missions.prog('f2_entrada2').step, g.oro.inside(g.oro.plan()), g.oro.state().melted]; })).toEqual([false, 1, false, 0]);

    // in again and melted to the end
    await use(pl.door, pl.base + 1, B.factory_door);
    await calm();
    await done('f2_entrada2');
    await page.evaluate(() => {
      const g = window.__sc.game, O = g.oro, s = O.state();
      while (s.melted < 11) { s.melted++; g.missions.event('oro_melt'); }
      O.apply('start', { i: 0 }, true); s.furnaces[0].t = 0.3;
    });
    await done('f2_oro');
    expect(await oro()).toMatchObject({ act: 7, melted: 12 });

    // act 7: out through the outflow pipe with the gold
    await at(pl.grate, pl.base + 1);
    await use(pl.grate, pl.base, B.sewer_grate);
    await done('f2_desague');
    expect(await count('gold_sack')).toBe(12);
    expect(await page.evaluate(() => { const g = window.__sc.game; return g.oro.inside(g.oro.plan()); })).toBe(false);

    // act 8: to El Maestro's boat on the beach
    await go('La Misericordia');
    const end = page.locator('[data-screen="oroFinale"]');
    await expect(end).toBeVisible({ timeout: 30_000 });
    await expect(end).toContainText('12 of 12');
    await expect(end).toContainText('Pimpi');
    await shot(page, 'oro-finale');
    expect(await page.evaluate(() => { const g = window.__sc.game, s = g.oro.state(); return { act: s.act, done: s.done, sacks: s.sacks, left: g.inventory.count('gold_sack') }; })).toEqual({ act: 9, done: true, sacks: 12, left: 0 });
    await end.locator('[data-act="close"]').click();
    expect(problems).toEqual([]);
  });
});
