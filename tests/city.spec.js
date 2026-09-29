import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Real-city worlds: Malaga from OpenStreetMap (public/city/malaga.bin.gz).
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Malaga', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(process.env.SHOTS ? 900_000 : 180_000);

  test('a creative Malaga world starts on Plaza de la Constitucion with streets and buildings', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await expect(page.locator('[data-screen="cityIntro"]')).toContainText('OpenStreetMap');
    await shot(page, 'city-intro');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    const info = await page.evaluate(() => {
      const g = window.__sc.game, p = g.player.pos, c = g.city;
      return { dim: g.meta.dim, city: g.meta.city, creative: g.creative, x: p.x, z: p.z, w: c.w, d: c.d, spawn: c.header.spawn };
    });
    expect(info).toMatchObject({ dim: 'city', city: 'malaga', creative: true });
    expect(Math.hypot(info.x - info.spawn[0], info.z - info.spawn[1])).toBeLessThan(45);
    // the world matches the city file: a building's walls stand where the map says
    const check = await page.evaluate(() => {
      const g = window.__sc.game, c = g.city, p = g.player.pos;
      let found = null;
      for (let r = 2; r < 60 && !found; r++) for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        if (c.inside(x, z) && c.bid[z * c.w + x]) found = { x, z };
      }
      if (!found) return null;
      const b = c.bid[found.z * c.w + found.x];
      const base = c.table[b * 4], h = c.table[b * 4 + 1];
      return { base, h, block: g.world.getBlock(found.x, base + 2, found.z) };
    });
    expect(check).not.toBeNull();
    expect(check.block).toBeGreaterThan(0);
    await page.evaluate(() => { const g = window.__sc.game; g.player.pitch = -0.2; });
    await shot(page, 'city-street');
    // real places land inside the map
    const larios = await page.evaluate(() => window.__sc.game.city.toXZ(36.7195, -4.4215));
    expect(larios.x).toBeGreaterThan(0);
    expect(larios.z).toBeGreaterThan(0);
    if (process.env.SHOTS) {
      // a look at some well-known places: [name, lat, lon, metres east and south of it, height]
      const views = [
        ['city-larios', 36.7195, -4.4215, 0, 60, 2],
        ['city-cathedral', 36.72017, -4.41961, 25, 75, 35],
        ['city-alcazaba', 36.72112, -4.41593, -30, 80, 35],
        ['city-gibralfaro', 36.72344, -4.41174, 20, 85, 30],
        ['city-port', 36.7180, -4.4134, 50, 70, 35],
        ['city-malagueta', 36.7190, -4.4075, -20, 75, 18],
        ['city-limonar', 36.7260, -4.3990, 30, 80, 40],
      ];
      const gotIt = page.getByRole('button', { name: 'Got it' });
      // see far (a headless browser would otherwise lower the view distance)
      await page.evaluate(() => { const sc = window.__sc; sc.setSetting('quality', 'high'); sc.setSetting('renderDistance', 6); sc.game.quality.rdCap = 0; });
      // the mouse is captured by the game, so the hint is closed directly
      if (await gotIt.isVisible()) await gotIt.evaluate((b) => b.click());
      for (const [name, lat, lon, dx, dz, up] of views) {
        await page.evaluate(([lat, lon, dx, dz, up]) => {
          const g = window.__sc.game, c = g.city, t = c.toXZ(lat, lon);
          const x = t.x + dx, z = t.z + dz;
          const y = Math.min(124, Math.max(c.groundAt(x, z), c.groundAt(t.x, t.z)) + up);
          g.player.fly = true;
          g.player.pos.set(x + 0.5, y, z + 0.5);
          g.player.yaw = Math.atan2(dx, dz);
          g.player.pitch = -Math.atan2(y - c.groundAt(t.x, t.z), Math.hypot(dx, dz) || 1) * 0.9;
        }, [lat, lon, dx, dz, up]);
        // wait for the view to be built (slow in a headless browser)
        await page.waitForFunction(([lat, lon]) => {
          const g = window.__sc.game, w = g.world, t = g.city.toXZ(lat, lon);
          const all = [...w.chunks.values()];
          const rd = g.viewDistance();
          return w.isReadyAround(t.x, t.z) && all.filter((c) => c.meshed).length >= (2 * rd + 1) ** 2 * 0.9;
        }, [lat, lon], { timeout: 240_000, polling: 1000 });
        await shot(page, name);
      }
    }
    expect(problems).toEqual([]);
  });
});
