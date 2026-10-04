import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Malaga's city buses: stops with timetables and tickets, open-top
// double-deckers on the real lines with doors, an inspector and a validator,
// the top deck, STOP and jumping off. The clock is fixed so the test does not
// depend on the time of day.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Malaga buses', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(240_000);

  test('stops show the next buses; tickets are validated, the inspector puts out riders without one, STOP and jumping off work', async ({ page }) => {
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
      const k = 2, BUS = 12, DW = 12;
      let t = 0, d = 0;
      for (let i = 0; i <= k; i++) { t += (l.stops[i].d - d) / BUS; d = l.stops[i].d; if (i < k) t += DW; }
      const dep = l.deps.find((x) => x > 600 && x < 900);
      const at = dep + (t + 4) / 60;
      n.fixedMinutes = at;
      const b = n.active().find((x) => x.line === l && x.stop === k);
      return { li: n.lines.indexOf(l), ref: l.ref, at, bus: b && { x: b.x, z: b.z, key: b.key }, stop: l.stops[k].s };
    });
    expect(plan.bus).toBeTruthy();
    // stand next to the bus: its doors are open
    const toDoor = (key) => page.evaluate((k) => { const g = window.__sc.game, b = g.buses.meshes.get(k).bus, [x, z] = g.buses.toWorld(b, 2.6, 1); g.player.pos.set(x, b.y + 0.05, z); g.player.vel.set(0, 0, 0); }, key);
    await page.evaluate((b) => { const g = window.__sc.game; g.player.fly = false; g.player.pos.set(b.x, 120, b.z); }, plan.bus);
    await page.waitForFunction((key) => window.__sc.game.buses.meshes.has(key), plan.bus.key, { timeout: 30_000 });
    await page.waitForFunction((key) => window.__sc.game.buses.meshes.get(key).door > 0.9, plan.bus.key);
    await toDoor(plan.bus.key);
    await page.evaluate((b) => { const g = window.__sc.game, p = g.player; p.yaw = Math.atan2(-(b.x - p.pos.x), -(b.z - p.pos.z)); p.pitch = -0.05; }, plan.bus);
    await shot(page, 'bus-at-stop');
    // the stop's arrival board: the line standing here, now
    await page.waitForFunction((si) => { const bd = window.__sc.game.buses.boards.get(si); return !!(bd && bd.sprite); }, plan.stop, { timeout: 5_000 });
    expect(await page.evaluate(([si, ref]) => window.__sc.game.buses.boards.get(si).sprite.userData.rows.some((r) => r.ref === ref), [plan.stop, plan.ref])).toBe(true);
    // no two buses going the same way in the same lane closer than a bus length
    expect(await page.evaluate(() => {
      const n = window.__sc.game.buses.net, all = n.active();
      let worst = 99;
      for (const a of all) for (const b of all) {
        if (a === b) continue;
        let dh = b.heading - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        if (Math.abs(dh) > 0.8) continue;
        const fx = Math.sin(a.heading), fz = Math.cos(a.heading), dx = b.x - a.x, dz = b.z - a.z;
        if (Math.abs(dx * fz - dz * fx) > 2.4) continue;
        const along = Math.abs(dx * fx + dz * fz);
        worst = Math.min(worst, along);
      }
      return worst;
    })).toBeGreaterThan(11.5);

    // Spain drives on the right: the doors are on the right of the way the bus goes,
    // and the bus keeps to the right of its line (the two directions pass each other)
    const side = await page.evaluate((key) => {
      const g = window.__sc.game, m = g.buses.meshes.get(key), b = m.bus;
      const d = m.obj.userData.doors[0].m.getWorldPosition(m.obj.position.clone());
      const rx = -Math.cos(b.heading), rz = Math.sin(b.heading);
      let lane = 1e9;
      const P = b.line.pts;
      for (let i = 1; i < P.length; i++) {
        const [ax, az] = P[i - 1], [bx, bz] = P[i], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
        const f = Math.max(0, Math.min(1, ((b.x - ax) * vx + (b.z - az) * vz) / l2));
        lane = Math.min(lane, Math.hypot(b.x - ax - vx * f, b.z - az - vz * f));
      }
      return { door: (d.x - b.x) * rx + (d.z - b.z) * rz, lane };
    }, plan.bus.key);
    expect(side.door).toBeGreaterThan(0.8);
    expect(side.lane).toBeGreaterThan(1.2);
    // by the bus: how to get on, and where the tickets are
    await expect(page.locator('.bus-board')).toBeVisible();
    await expect(page.locator('.bus-board .bb-text')).toContainText('doors are open');
    await expect(page.locator('.bus-board .bb-tickets')).toContainText('ride free');
    await expect(page.locator('.bus-board [data-a="busboard"]')).toBeVisible();
    // walking in through the middle door gets the player on
    await page.evaluate((key) => { const g = window.__sc.game, b = g.buses.meshes.get(key).bus, [x, z] = g.buses.toWorld(b, 1.0, -0.6); g.player.pos.set(x, b.y + 0.05, z); g.player.vel.set(0, 0, 0); }, plan.bus.key);
    await page.waitForFunction(() => !!window.__sc.game.buses.riding, null, { timeout: 5_000 });
    await expect(page.locator('.bus-board')).toBeHidden();
    // walking about inside: forward along the bus (the joystick held), and back
    // (the joystick held until the rider has walked half a block, however slow the frames)
    const walkTo = (z) => page.evaluate((z) => new Promise((done) => {
      const g = window.__sc.game, r = g.buses.riding, b = g.buses.meshes.get(r.key).bus, from = r.lz, t0 = performance.now();
      g.player.yaw = b.heading + Math.PI;
      window.__sc.input.move.z = z;
      const iv = setInterval(() => { if (Math.abs(r.lz - from) > 0.5 || performance.now() - t0 > 10000) { clearInterval(iv); window.__sc.input.move.z = 0; done(r.lz - from); } }, 30);
    }), z);
    expect(await walkTo(-1)).toBeLessThan(-0.4);
    expect(await walkTo(1)).toBeGreaterThan(0.4);
    // off again, on the pavement to the right
    const off = await page.evaluate((key) => { const g = window.__sc.game, b = g.buses.meshes.get(key).bus; g.buses.getOff(b); const [lx] = g.buses.toLocal(b, g.player.pos.x, g.player.pos.z); return { riding: g.buses.riding, lx }; }, plan.bus.key);
    expect(off.riding).toBeNull();
    expect(off.lx).toBeGreaterThan(1.5);

    // a paying rider without a ticket: the validator refuses, and when the doors close the inspector puts them out
    await page.evaluate(() => { const bm = window.__sc.game.buses; Object.defineProperty(bm, 'pays', { configurable: true, get: () => true }); window.__sc.game.profile.tickets = 0; });
    await toDoor(plan.bus.key);
    expect(await page.evaluate(() => window.__sc.game.buses.tryBoard())).toBe(true);
    expect(await page.evaluate(() => { const r = window.__sc.game.buses.riding; return r && { deck: r.deck, valid: r.valid }; })).toEqual({ deck: 0, valid: false });
    await expect(page.locator('.bus-ride')).toBeVisible();
    await expect(page.locator('.bus-ride .br-line')).toContainText(plan.ref);
    await shot(page, 'bus-inside-inspector');
    await page.evaluate(() => window.__sc.game.buses.action());
    expect(await page.evaluate(() => { const r = window.__sc.game.buses.riding; return { valid: r.valid, offer: r.offer }; })).toEqual({ valid: false, offer: true });
    await expect(page.locator('.bus-ride [data-a="busact"]')).toContainText(/driver/);
    await page.evaluate((at) => { window.__sc.game.buses.net.fixedMinutes = at + 0.2; }, plan.at);
    await page.waitForFunction(() => window.__sc.game.buses.riding === null);
    await expect(page.locator('.bus-ride')).toBeHidden();

    // with a ticket: board, validate (beep), go up to the open top deck
    await page.evaluate((at) => { const g = window.__sc.game; g.buses.net.fixedMinutes = at; g.profile.tickets = 2; }, plan.at);
    await page.waitForFunction((key) => { const m = window.__sc.game.buses.meshes.get(key); return m && m.bus.stop >= 0; }, plan.bus.key);
    await toDoor(plan.bus.key);
    expect(await page.evaluate(() => window.__sc.game.buses.tryBoard())).toBe(true);
    await page.evaluate(() => window.__sc.game.buses.action());
    expect(await page.evaluate(() => ({ valid: window.__sc.game.buses.riding.valid, left: window.__sc.game.profile.tickets }))).toEqual({ valid: true, left: 1 });
    await page.evaluate(() => window.__sc.game.buses.action());
    await page.waitForFunction(() => { const g = window.__sc.game, m = g.buses.meshes.get(g.buses.riding.key); return Math.abs(g.player.pos.y - m.bus.y - 2.85) < 0.05; }, null, { timeout: 5_000 });
    const top = await page.evaluate(() => { const g = window.__sc.game, m = g.buses.meshes.get(g.buses.riding.key); return { deck: g.buses.riding.deck, dy: g.player.pos.y - m.bus.y }; });
    expect(top.deck).toBe(1);
    expect(Math.abs(top.dy - 2.85)).toBeLessThan(0.05);
    const before = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    // STOP while driving: the bus carries the player on and lets them off at the next stop
    await page.evaluate((at) => { window.__sc.game.buses.net.fixedMinutes = at + 0.2; }, plan.at);
    await page.waitForTimeout(500);
    await shot(page, 'bus-top-deck');
    await page.evaluate(() => window.__sc.game.buses.requestStop());
    expect(await page.evaluate(() => window.__sc.game.buses.riding.stop)).toBe(true);
    await expect(page.locator('.bus-ride .br-stop')).toHaveClass(/on/);
    const next = await page.evaluate((p) => {
      const n = window.__sc.game.buses.net, l = n.lines[p.li], k = 3, BUS = 12, DW = 12;
      let t = 0, d = 0;
      for (let i = 0; i <= k; i++) { t += (l.stops[i].d - d) / BUS; d = l.stops[i].d; if (i < k) t += DW; }
      const dep = l.deps.find((x) => x > 600 && x < 900);
      n.fixedMinutes = dep + (t + 4) / 60;
      return n.fixedMinutes;
    }, plan);
    await page.waitForFunction(() => window.__sc.game.buses.riding === null, null, { timeout: 15_000 });
    const after = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(20);
    expect(await page.evaluate((key) => { const g = window.__sc.game, m = g.buses.meshes.get(key); return m && m.bus.stop; }, plan.bus.key)).toBe(3);

    // jumping off the top deck of a driving bus lands in the street
    await page.evaluate((at) => { window.__sc.game.buses.net.fixedMinutes = at; }, next);
    await toDoor(plan.bus.key);
    expect(await page.evaluate(() => window.__sc.game.buses.tryBoard())).toBe(true);
    await page.evaluate(() => { const bm = window.__sc.game.buses; bm.action(); bm.action(); });
    await page.evaluate((at) => { window.__sc.game.buses.net.fixedMinutes = at + 0.2; }, next);
    await page.waitForTimeout(400);
    const jump = await page.evaluate(() => { const g = window.__sc.game, bm = g.buses, m = bm.meshes.get(bm.riding.key); const y0 = m.bus.y; bm.jumpOff(m.bus); return { y0, y: g.player.pos.y, riding: bm.riding }; });
    expect(jump.riding).toBeNull();
    expect(jump.y).toBeGreaterThan(jump.y0 + 3);
    await page.waitForFunction(() => window.__sc.game.player.onGround, null, { timeout: 10_000 });
    await page.evaluate(() => { delete window.__sc.game.buses.pays; });

    // the top deck of a moving bus carries a player standing on it
    const roof = await page.evaluate((at) => {
      const g = window.__sc.game, n = g.buses.net;
      n.fixedMinutes = at + 1.5;
      // a bus driving, with its next stop still well ahead and nothing in the way at the height of its top deck (a palm, a lamp)
      const clear = (x) => { for (let k = 0; k <= 50; k += 2) { const q = n.pointAt(x.line, x.d + k), gx = Math.floor(q.x), gz = Math.floor(q.z), y = g.city.groundAt(gx, gz) + 1 + 2.85; for (let dy = 0; dy < 3; dy++) for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) if (g.world.getBlock(gx + ox, Math.floor(y + dy), gz + oz) > 0) return false; } return true; };
      const free = (x) => x.stop < 0 && x.next < x.line.stops.length && x.line.stops[x.next].d - x.d > 60 && clear(x);
      const b = n.active().find((x) => free(x) && Math.hypot(x.x - g.player.pos.x, x.z - g.player.pos.z) < 150) || n.active().find(free);
      // (buses are drawn near the player: go close to this one)
      if (Math.hypot(b.x - g.player.pos.x, b.z - g.player.pos.z) > 120) g.player.pos.set(b.x + 20, 130, b.z + 20);
      return { key: b.key, x: b.x, z: b.z };
    }, plan.at);
    // (the world loaded there, and a frame to move the bus to the new time)
    await page.evaluate(async () => { await window.__sc.game.ensureLoaded(); });
    await page.waitForFunction((r) => { const m = window.__sc.game.buses.meshes.get(r.key); return m && Math.hypot(m.bus.x - r.x, m.bus.z - r.z) < 3; }, roof, { timeout: 30_000 });
    await page.evaluate((r) => { const g = window.__sc.game, b = g.buses.meshes.get(r.key).bus; g.player.pos.set(b.x, b.y + 3.0, b.z); g.player.vel.set(0, 0, 0); }, roof);
    const start = await page.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, z: p.z }; });
    // let the clock run for a few seconds
    await page.evaluate((at) => { const n = window.__sc.game.buses.net; const t0 = performance.now(); window.__busTimer = setInterval(() => { n.fixedMinutes = at + 1.5 + (performance.now() - t0) / 60000; }, 50); }, plan.at);
    await page.waitForTimeout(3000);
    const end = await page.evaluate(() => { clearInterval(window.__busTimer); const g = window.__sc.game, p = g.player.pos; return { x: p.x, y: p.y, z: p.z }; });
    const moved = Math.hypot(end.x - start.x, end.z - start.z);
    const onRoof = await page.evaluate((key) => { const g = window.__sc.game, m = g.buses.meshes.get(key); if (!m) return false; const b = m.bus, [lx, lz] = g.buses.toLocal(b, g.player.pos.x, g.player.pos.z); return Math.abs(lx) < 1.6 && Math.abs(lz) < 6.2 && Math.abs(g.player.pos.y - (b.y + 2.85)) < 0.5; }, roof.key);
    expect(moved).toBeGreaterThan(5);
    expect(onRoof).toBe(true);
    await shot(page, 'bus-roof');

    // a stop sign opens the timetable of its stop
    const sign = await page.evaluate((si) => { const g = window.__sc.game, c = g.city, s = g.buses.net.stops[si]; let best = null, bd = 1e9; for (let z = s.z - 12; z <= s.z + 12; z++) for (let x = s.x - 12; x <= s.x + 12; x++) { if (c.markAt(x, z) === 3) { const d = Math.hypot(x - s.x, z - s.z); if (d < bd) { bd = d; best = { x, z }; } } } return best; }, plan.stop);
    expect(sign).not.toBeNull();
    await page.evaluate((s) => { const g = window.__sc.game; g.buses.net.fixedMinutes = 12 * 60; const c = g.city.openCellNear(s.x + 4, s.z + 4, 6) || { x: s.x + 4, z: s.z + 4 }; g.player.pos.set(c.x + 0.5, g.city.groundAt(c.x, c.z) + 1.05, c.z + 0.5); g.player.vel.set(0, 0, 0); }, sign);
    // the arrival board over the sign
    await page.waitForFunction((s) => [...window.__sc.game.buses.boards.values()].some((bd) => bd.sprite && Math.hypot(bd.pos.x - s.x - 0.5, bd.pos.z - s.z - 0.5) < 1), sign, { timeout: 5_000 });
    await page.evaluate((s) => { const g = window.__sc.game, bd = [...g.buses.boards.values()].find((b) => b.sprite && Math.hypot(b.pos.x - s.x - 0.5, b.pos.z - s.z - 0.5) < 1), e = g.player.eye, q = bd.sprite.position; g.player.yaw = Math.atan2(-(q.x - e.x), -(q.z - e.z)); g.player.pitch = Math.atan2(q.y - e.y, Math.hypot(q.x - e.x, q.z - e.z)); }, sign);
    await shot(page, 'bus-board');
    await page.evaluate((s) => window.__sc.ui.open('busStop', s), sign);
    await expect(page.locator('[data-screen="busStop"] .bus-row').first()).toBeVisible();
    expect(await page.locator('[data-screen="busStop"] .bus-row').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-screen="busStop"] .bus-times b').first()).toContainText(/min|now/);
    // the ticket machine: guests ride free
    await expect(page.locator('[data-screen="busStop"] .bus-tickets')).toContainText('ride free');
    await shot(page, 'bus-stop-panel');
    await page.locator('[data-screen="busStop"] [data-act="map"]').click();
    await expect(page.locator('[data-screen="worldMap"]')).toBeVisible();
    await shot(page, 'bus-map');
    expect(problems).toEqual([]);
  });
});
