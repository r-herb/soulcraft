import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Malaga's city buses: stops with timetables, buses on the real lines,
// riding inside and on the roof. The clock is fixed so the test does not
// depend on the time of day.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Malaga buses', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('stops show the next buses; a bus can be boarded, ridden and left; the roof carries a player', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    const info = await page.evaluate(() => { const n = window.__sc.game.buses.net; return { lines: n.lines.length, stops: n.stops.length }; });
    expect(info.lines).toBeGreaterThan(20);
    expect(info.stops).toBeGreaterThan(50);

    // noon: pick a line with a stop in the middle and a bus standing at it
    const plan = await page.evaluate(() => {
      const g = window.__sc.game, n = g.buses.net;
      n.fixedMinutes = 12 * 60;
      const l = n.lines.find((x) => x.stops.length >= 5 && x.len > 1500 && x.deps.some((d) => d > 600 && d < 900));
      const k = 2, BUS = 6, DW = 18;
      let t = 0, d = 0;
      for (let i = 0; i <= k; i++) { t += (l.stops[i].d - d) / BUS; d = l.stops[i].d; if (i < k) t += DW; }
      const dep = l.deps.find((x) => x > 600 && x < 900);
      const at = dep + (t + 4) / 60;
      n.fixedMinutes = at;
      const b = n.active().find((x) => x.line === l && x.stop === k);
      return { li: n.lines.indexOf(l), ref: l.ref, at, bus: b && { x: b.x, z: b.z, key: b.key }, stop: l.stops[k].s };
    });
    expect(plan.bus).toBeTruthy();
    // stand next to the bus
    await page.evaluate((b) => { const g = window.__sc.game; g.player.fly = false; g.player.pos.set(b.x, 120, b.z); }, plan.bus);
    await page.waitForFunction((key) => window.__sc.game.buses.meshes.has(key), plan.bus.key, { timeout: 30_000 });
    // on the pavement by the door
    await page.evaluate((key) => { const g = window.__sc.game, b = g.buses.meshes.get(key).bus, [x, z] = g.buses.toWorld(b, 2.6, 1); g.player.pos.set(x, b.y + 0.05, z); g.player.vel.set(0, 0, 0); }, plan.bus.key);
    await page.evaluate((b) => { const g = window.__sc.game, p = g.player; p.yaw = Math.atan2(-(b.x - p.pos.x), -(b.z - p.pos.z)); p.pitch = -0.05; }, plan.bus);
    await shot(page, 'bus-at-stop');
    // board it
    expect(await page.evaluate(() => window.__sc.game.buses.tryBoard())).toBe(true);
    expect(await page.evaluate(() => !!window.__sc.game.buses.riding)).toBe(true);
    const before = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    // a minute later the bus (and the player in it) has moved on
    await page.evaluate((at) => { window.__sc.game.buses.net.fixedMinutes = at + 1; }, plan.at);
    await page.waitForTimeout(1000);
    const after = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(40);
    await shot(page, 'bus-inside');
    // get off
    await page.evaluate(() => { const g = window.__sc.game, m = g.buses.meshes.get(g.buses.riding.key); g.buses.getOff(m.bus); });
    expect(await page.evaluate(() => window.__sc.game.buses.riding)).toBeNull();

    // the roof: stand on a moving bus and be carried along
    const roof = await page.evaluate((at) => {
      const g = window.__sc.game, n = g.buses.net;
      n.fixedMinutes = at + 1.5;
      // a bus driving, with its next stop still well ahead
      const free = (x) => x.stop < 0 && x.next < x.line.stops.length && x.line.stops[x.next].d - x.d > 60;
      const b = n.active().find((x) => free(x) && Math.hypot(x.x - g.player.pos.x, x.z - g.player.pos.z) < 150) || n.active().find(free);
      return { key: b.key, x: b.x, z: b.z };
    }, plan.at);
    // (wait for a frame to move the bus to the new time)
    await page.waitForFunction((r) => { const m = window.__sc.game.buses.meshes.get(r.key); return m && Math.hypot(m.bus.x - r.x, m.bus.z - r.z) < 3; }, roof, { timeout: 30_000 });
    await page.evaluate((r) => { const g = window.__sc.game, b = g.buses.meshes.get(r.key).bus; g.player.pos.set(b.x, b.y + 3.3, b.z); g.player.vel.set(0, 0, 0); }, roof);
    const start = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    // let the clock run for a few seconds
    await page.evaluate((at) => { const n = window.__sc.game.buses.net; const t0 = performance.now(); window.__busTimer = setInterval(() => { n.fixedMinutes = at + 1.5 + (performance.now() - t0) / 60000; }, 50); }, plan.at);
    await page.waitForTimeout(3000);
    const end = await page.evaluate(() => { clearInterval(window.__busTimer); const g = window.__sc.game, p = g.player.pos; return { x: p.x, y: p.y, z: p.z }; });
    const moved = Math.hypot(end.x - start.x, end.z - start.z);
    const onRoof = await page.evaluate((key) => { const g = window.__sc.game, m = g.buses.meshes.get(key); if (!m) return false; const b = m.bus, [lx, lz] = g.buses.toLocal(b, g.player.pos.x, g.player.pos.z); return Math.abs(lx) < 1.6 && Math.abs(lz) < 6.2 && Math.abs(g.player.pos.y - (b.y + 3.1)) < 0.5; }, roof.key);
    expect(moved).toBeGreaterThan(5);
    expect(onRoof).toBe(true);
    await shot(page, 'bus-roof');

    // a stop sign opens the timetable of its stop
    const sign = await page.evaluate((si) => { const g = window.__sc.game, c = g.city, s = g.buses.net.stops[si]; let best = null, bd = 1e9; for (let z = s.z - 12; z <= s.z + 12; z++) for (let x = s.x - 12; x <= s.x + 12; x++) { if (c.inside(x, z) && c.mark[z * c.w + x] === 3) { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = { x, z }; } } } return best; }, plan.stop);
    expect(sign).not.toBeNull();
    await page.evaluate((s) => { const g = window.__sc.game; g.buses.net.fixedMinutes = 12 * 60; g.player.pos.set(s.x + 2.5, 120, s.z + 2.5); g.placeOnGround(); window.__sc.ui.open('busStop', s); }, sign);
    await expect(page.locator('[data-screen="busStop"] .bus-row').first()).toBeVisible();
    expect(await page.locator('[data-screen="busStop"] .bus-row').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-screen="busStop"] .bus-times b').first()).toContainText(/min|now/);
    await shot(page, 'bus-stop-panel');
    await page.locator('[data-screen="busStop"] [data-act="map"]').click();
    await expect(page.locator('[data-screen="worldMap"]')).toBeVisible();
    await shot(page, 'bus-map');
    expect(problems).toEqual([]);
  });
});
