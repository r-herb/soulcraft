import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Real-city worlds: Malaga from OpenStreetMap (public/city/malaga/: an index
// and tiles of 512 x 512 blocks loaded around the player).
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
      return { dim: g.meta.dim, city: g.meta.city, creative: g.creative, x: p.x, z: p.z, spawn: c.header.spawn, tiles: c.tiles.size };
    });
    expect(info).toMatchObject({ dim: 'city', city: 'malaga', creative: true });
    expect(Math.hypot(info.x - info.spawn[0], info.z - info.spawn[1])).toBeLessThan(45);
    // the world matches the city file: a building's walls stand where the map says
    const check = await page.evaluate(() => {
      const g = window.__sc.game, c = g.city, p = g.player.pos;
      let found = null;
      for (let r = 2; r < 60 && !found; r++) for (let dz = -r; dz <= r && !found; dz++) for (let dx = -r; dx <= r && !found; dx++) {
        const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
        if (c.bidAt(x, z)) found = { x, z };
      }
      if (!found) return null;
      const [base, h] = c.buildings.get(c.bidAt(found.x, found.z));
      return { base, h, block: g.world.getBlock(found.x, base + 2, found.z) };
    });
    expect(check).not.toBeNull();
    expect(check.block).toBeGreaterThan(0);
    await page.evaluate(() => { const g = window.__sc.game; g.player.pitch = -0.2; });
    await shot(page, 'city-street');
    // street lamps: an iron post three blocks high with a lantern on top, along the
    // streets and on the squares; they can be walked through, and the lantern gives light
    const lamps = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, c = g.city, p = g.player.pos, out = [];
      for (let z = Math.floor(p.z) - 30; z <= p.z + 30; z++) for (let x = Math.floor(p.x) - 30; x <= p.x + 30; x++) {
        const y = c.groundAt(x, z);
        if (g.world.getBlock(x, y + 4, z) === B.street_lamp) out.push([1, 2, 3].every((d) => g.world.getBlock(x, y + d, z) === B.lamp_post) && !c.bidAt(x, z));
      }
      const L = window.__sc.BLOCKS[B.street_lamp], P = window.__sc.BLOCKS[B.lamp_post];
      return { n: out.length, posts: out.every(Boolean), light: L.light, solid: L.solid || P.solid };
    });
    expect(lamps.n).toBeGreaterThan(5);
    expect(lamps).toMatchObject({ posts: true, light: 15, solid: false });
    // the windows are see-through (and still solid), and the rooms behind them have lights in the ceilings
    const rooms = await page.evaluate(() => {
      const g = window.__sc.game, B = window.__sc.B, BL = window.__sc.BLOCKS, p = g.player.pos;
      const lit = new Set([B.ceiling_lamp, B.ceiling_lamp_paving, B.ceiling_lamp_tiles, B.ceiling_lamp_lime]);
      let lights = 0, windows = 0;
      for (let z = Math.floor(p.z) - 30; z <= p.z + 30; z++) for (let x = Math.floor(p.x) - 30; x <= p.x + 30; x++) for (let y = 0; y < 128; y++) {
        const id = g.world.getBlock(x, y, z);
        if (lit.has(id)) lights++; else if (id === B.window) windows++;
      }
      return { lights, windows, window: { opaque: BL[B.window].opaque, solid: BL[B.window].solid }, glow: BL[B.ceiling_lamp].light };
    });
    expect(rooms.windows).toBeGreaterThan(50);
    expect(rooms.lights).toBeGreaterThan(20);
    expect(rooms).toMatchObject({ window: { opaque: false, solid: true }, glow: 12 });
    // at night the city is lit: never as dark as the open country
    await page.evaluate(() => { const g = window.__sc.game; g.meta.time = 0.75; g.player.pitch = -0.1; });
    await page.waitForFunction(() => window.__sc.game.materials.uniforms.uMinLight.value > 0.1, null, { timeout: 10_000 });
    await shot(page, 'city-night');
    await page.evaluate(() => { window.__sc.game.meta.time = 0.25; });
    // street names are painted on the roads and houses carry their numbers
    const marks = await page.evaluate(async () => {
      const c = window.__sc.game.city, [sx, sz] = c.header.spawn;
      await c.ensure(sx, sz, 700);
      let paint = 0, plaques = 0, atms = 0;
      for (const t of c.tiles.values()) for (const v of t.mark) { if (v === 1 || v === 2) paint++; else if (v === 4) atms++; else if (v >= 10) plaques++; }
      return { paint, plaques, atms };
    });
    expect(marks.paint).toBeGreaterThan(2000);
    expect(marks.plaques).toBeGreaterThan(20);
    expect(marks.atms).toBeGreaterThan(10); // a cash machine by each bank (within 700 m of the plaza)
    // real places land inside the map
    const larios = await page.evaluate(() => window.__sc.game.city.toXZ(36.7195, -4.4215));
    expect(larios.x).toBeGreaterThan(0);
    expect(larios.z).toBeGreaterThan(0);
    if (process.env.SHOTS) {
      // a look at some well-known places: [name, lat, lon, metres east and south of it, height]
      const views = [
        ['city-names', 36.71760, -4.42300, 0, 2, 38],
        ['city-names2', 36.71960, -4.42160, 0, 2, 30],
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
    // life in the city: sunbathers and fish at La Malagueta, swimmers in a pool, walkers in the old town
    await page.evaluate(() => { const g = window.__sc.game; g.meta.time = 0.2; g.player.fly = true; });
    const visit = async (name, find, kinds) => {
      const spot = await page.evaluate(find);
      expect(spot, name).not.toBeNull();
      await page.evaluate((s) => { const g = window.__sc.game; g.player.pos.set(s.x + 0.5, s.y, s.z + 0.5); g.player.yaw = s.yaw || 0; g.player.pitch = s.pitch ?? -0.5; }, spot);
      await page.waitForFunction((k) => { const l = window.__sc.game.entities.life; return k.every((kind) => l.count(kind) > 0); }, kinds, { timeout: 60_000 });
      await page.waitForTimeout(1500);
      await shot(page, name);
    };
    await visit('city-beach', async () => {
      const c = window.__sc.game.city, t = c.toXZ(36.7172, -4.4085);
      await c.ensure(t.x, t.z, 100);
      for (let r = 0; r < 80; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const a = c.at(t.x + dx, t.z + dz);
        if (a && a.s === 5 && !a.b) return { x: t.x + dx, z: t.z + dz + 4, y: a.g + 6, yaw: 0, pitch: -0.45 };
      }
      return null;
    }, ['sunbather', 'fish']);
    await visit('city-pool', () => {
      const c = window.__sc.game.city, p = window.__sc.game.player.pos;
      let best = null, bd = 1e9;
      const px = Math.floor(p.x), pz = Math.floor(p.z);
      for (let z = pz - 600; z < pz + 600; z += 3) for (let x = px - 600; x < px + 600; x += 3) {
        const a = c.at(x, z);
        if (!a || a.s !== 18 || a.b) continue;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < bd) { bd = d; best = { x, z: z + 7, y: a.g + 5, yaw: 0, pitch: -0.55 }; }
      }
      return best;
    }, ['swimmer']);
    await visit('city-walkers', () => {
      const c = window.__sc.game.city, t = c.toXZ(36.7196, -4.4216);
      return { x: t.x, z: t.z + 10, y: c.groundAt(t.x, t.z) + 2.5, yaw: 0, pitch: -0.15 };
    }, ['walker']);
    expect(problems).toEqual([]);
  });
});
