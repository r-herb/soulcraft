import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// More weapons: a diamond sword, a fast dagger, a heavy battle axe, a war
// hammer that hits everyone around, a crossbow, throwing knives that can be
// picked up again and a soul staff that needs no ammunition; all crafted at
// the workbench (and some from villagers).
test.describe('Weapons', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(180_000);

  test('the new weapons: recipes, speed, reach, ranged shots', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'armory');
    // (no monsters of the night wander in: one in front would take a blow meant for the line)
    await page.evaluate(() => { const g = window.__sc.game; g.player.god = true; g.entities.trySpawn = () => {}; });
    const give = (k, n = 1) => page.evaluate(([k, n]) => { const g = window.__sc.game; g.inventory.slots[0] = null; g.giveItem(k, n); g.selectSlot(g.inventory.slots.findIndex((s) => s && s.item === k)); }, [k, n]);
    // three monsters in a row in front of the player, standing still (put back after each blow's knockback)
    const line = () => page.evaluate(() => {
      const g = window.__sc.game, p = g.player.pos;
      g.meta.time = 0.6; // night: the Hollows do not burn in the sun
      for (const e of g.entities.list) if (e.def && !e.dead) { e.dead = true; e.remove(); }
      g.entities.list = g.entities.list.filter((e) => !(e.def && e.dead));
      g.player.yaw = 0; g.player.pitch = -0.2;
      const out = [];
      for (const dx of [0, 1.2, -1.2]) {
        const x = p.x + dx, z = p.z - 2.2, y = g.world.groundBelow(x, p.y + 4, z) + 1.05;
        const m = g.entities.spawnMob('hollow', x, y, z); m.hp = 200; m.speed = 0; m.def = { ...m.def, speed: 0, dmg: 0 }; m.home = m.pos.clone(); out.push(m);
      }
      window.__line = out;
      return out.length;
    });
    const hp = () => page.evaluate(() => window.__line.map((m) => m.hp));

    // a blow with each: its damage, and how long until the next one (a sword: 0.45 s)
    // (the attack button held until the first blow lands)
    const hold = (ms) => page.evaluate((ms) => new Promise((done) => {
      const g = window.__sc.game, inp = window.__sc.input, t0 = performance.now();
      const aim = () => { const m = window.__line[0], e = g.player.eye; for (const k of window.__line) { k.pos.copy(k.home); k.vel.set(0, 0, 0); } g.player.yaw = Math.atan2(-(m.pos.x - e.x), -(m.pos.z - e.z)); g.player.pitch = Math.atan2(m.pos.y + 1 - e.y, Math.hypot(m.pos.x - e.x, m.pos.z - e.z)); };
      aim(); inp.attack = true;
      const iv = setInterval(() => { aim(); if ((window.__hits && window.__hits.length) || performance.now() - t0 > ms) { clearInterval(iv); inp.attack = false; done(); } }, 30);
    }), ms);
    await page.evaluate(() => { const E = window.__sc.game.entities; const o = E.playerHit.bind(E); E.playerHit = (e, d, dir, via) => { (window.__hits = window.__hits || []).push({ who: (window.__line || []).indexOf(e), d, cd: +window.__sc.game.attackCooldown.toFixed(2), knock: +Math.hypot(dir.x, dir.z).toFixed(1) }); return o(e, d, dir, via); }; });
    const blow = async (k) => { await line(); await give(k); await page.evaluate(() => { window.__hits = []; }); await hold(4000); return page.evaluate(() => window.__hits[0]); };
    expect(await blow('iron_sword')).toMatchObject({ d: 6, cd: 0.45 });
    expect(await blow('diamond_sword')).toMatchObject({ d: 7, cd: 0.45 });
    expect(await blow('dagger')).toMatchObject({ d: 3, cd: 0.22 });
    const axe = await blow('battle_axe');
    expect(axe).toMatchObject({ d: 9, cd: 0.8 });
    expect(axe.knock).toBeGreaterThan(1.3);
    expect((await hp()).slice(1)).toEqual([200, 200]);
    // the war hammer: the one struck and the ones beside it
    await line(); await give('war_hammer');
    await page.evaluate(() => { window.__hits = []; });
    await hold(4000);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__hits[0] && window.__hits[0].who)).toBe(0);
    const ham = await hp();
    // (a full blow on the one struck, six tenths of it on each one beside it)
    expect([...ham].sort((a, b) => a - b)).toEqual([190, 194, 194]);
    // the crossbow uses an arrow; the soul staff none
    await page.evaluate(() => { const E = window.__sc.game.entities; const o = E.shoot.bind(E); window.__shots = []; E.shoot = (kind, from, dir, speed, damage, owner, src) => { window.__shots.push({ kind, speed, damage, owner }); return o(kind, from, dir, speed, damage, owner, src); }; });
    await give('crossbow');
    await page.evaluate(() => { const g = window.__sc.game; g.player.god = false; g.giveItem('arrow', 3); });
    await page.evaluate(() => window.__sc.input.pressed.add('use'));
    await page.waitForFunction(() => window.__shots.length > 0);
    expect(await page.evaluate(() => [window.__sc.game.inventory.count('arrow'), window.__shots.pop()])).toEqual([2, { kind: 'arrow', speed: 46, damage: 9, owner: 'player' }]);
    await give('soul_staff');
    // (once the crossbow is loaded again)
    await page.waitForFunction(() => window.__sc.game.useCooldown <= 0);
    await page.evaluate(() => window.__sc.input.pressed.add('use'));
    await page.waitForFunction(() => window.__shots.length > 0);
    expect(await page.evaluate(() => [window.__sc.game.inventory.count('arrow'), window.__shots.pop()])).toEqual([2, { kind: 'soul_bolt', speed: 30, damage: 8, owner: 'player' }]);
    // a throwing knife flies, and lies on the ground to be picked up again
    await give('throwing_knife', 3);
    await page.waitForFunction(() => window.__sc.game.useCooldown <= 0);
    await page.evaluate(() => { window.__sc.game.player.pitch = -0.6; window.__sc.input.pressed.add('use'); });
    await page.waitForFunction(() => window.__sc.game.inventory.count('throwing_knife') === 2);
    await page.waitForFunction(() => window.__sc.game.entities.list.some((e) => e.item === 'throwing_knife') || window.__sc.game.inventory.count('throwing_knife') === 3, null, { timeout: 10_000 });
    expect(problems).toEqual([]);
  });
});
