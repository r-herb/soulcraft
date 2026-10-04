import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

// Play with friends: two signed-in players in one world, through the real
// Pages Functions and the rooms Durable Object (wrangler dev, see
// playwright.config.js).
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
const HOST = { name: 'Hostie', email: 'host-mp@example.com', password: 'host-pass-1' };
const GUEST = { name: 'Guesto', email: 'guest-mp@example.com', password: 'guest-pass-1' };

async function makeUsers(request) {
  const r = await request.post('/api/auth/login', { data: ADMIN });
  expect(r.ok()).toBeTruthy();
  for (const u of [HOST, GUEST]) {
    const res = await request.post('/api/admin/users', { data: u });
    expect([200, 201, 409]).toContain(res.status());
  }
  // the local Pages server finds the rooms Worker a little after it starts
  await request.post('/api/auth/login', { data: { login: HOST.email, password: HOST.password } });
  for (let i = 0; i < 60; i++) {
    const res = await request.post('/api/mp/room', { data: { world: 'probe' } });
    if (res.ok()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('the rooms Worker never answered');
}

async function signIn(page, u) {
  await page.addInitScript(() => {
    try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ }
  });
  await page.goto('/?nosw=1');
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', u.email);
  await page.fill('#si-pass', u.password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}

// SHOTS=dir saves screenshots of the multiplayer screens for a visual check
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.bringToFront(); await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };
const running = (page) => page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
// keep a test page's game running while the other page has the focus
const unpause = (page) => page.evaluate(() => { const g = window.__sc.game; if (g.paused && !g.player.dead) window.__sc.ui.closeAll(); });

test.describe('Play with friends', () => {
  test.setTimeout(240_000);

  test('a guest joins the host\'s world: players, blocks, monsters, saves', async ({ browser, request }) => {
    await makeUsers(request);
    const hostCtx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const guestCtx = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const host = await hostCtx.newPage();
    const guest = await guestCtx.newPage();
    const hostProblems = watchConsole(host);
    const guestProblems = watchConsole(guest);

    // the host starts a world and opens it to friends
    await signIn(host, HOST);
    await host.click('[data-act="new"]');
    await host.fill('#nw-name', 'Shared Isle');
    await host.fill('#nw-seed', 'friends');
    await host.click('[data-act="create"]');
    await running(host);
    await host.waitForFunction(() => window.__sc.game.player.onGround, null, { timeout: 20_000 });
    await host.evaluate(() => { window.__sc.game.player.god = true; window.__sc.ui.openPause(); });
    await host.click('[data-screen="pause"] [data-act="room"]');
    await host.click('[data-screen="room"] [data-act="open"]');
    const code = (await host.locator('[data-room-code]').textContent()).trim();
    await shot(host, 'room-open');
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    await host.evaluate(() => window.__sc.ui.closeAll());

    // the guest joins with the code
    await signIn(guest, GUEST);
    await guest.click('[data-act=\"together\"]');
    await guest.click('[data-screen=\"together\"] [data-act=\"t-code\"]');
    await guest.fill('#mp-code', code.toLowerCase());
    await shot(guest, 'join');
    await guest.click('[data-screen="join"] [data-act="join"]');
    await running(guest);
    await expect(guest.locator('.room-chip')).toHaveText(`${code} · 2/4`);
    await expect(host.locator('.room-chip')).toHaveText(`${code} · 2/4`);
    const gw = await guest.evaluate(() => { const g = window.__sc.game; return { name: g.meta.name, seed: g.meta.seed, guest: g.isGuest }; });
    const hw = await host.evaluate(() => window.__sc.game.meta.seed);
    expect(gw).toEqual({ name: 'Shared Isle', seed: hw, guest: true });

    // each sees the other
    await host.waitForFunction(() => { const n = window.__sc.game.net; return n && [...n.players.values()].some((p) => p.seen && p.object.visible); }, null, { timeout: 20_000 });
    await guest.waitForFunction(() => { const n = window.__sc.game.net; return n && [...n.players.values()].some((p) => p.seen); }, null, { timeout: 20_000 });
    // each one's name floats over the head (Roblox style), seen through walls
    await host.waitForFunction(() => [...window.__sc.game.net.players.values()].some((p) => p.seen && p.tag.userData.name === 'Guesto'), null, { timeout: 10_000 });
    expect(await host.evaluate(() => [...window.__sc.game.net.players.values()].filter((p) => p.seen).map((p) => ({ name: p.tag.userData.name, through: p.tag.material.depthTest === false, shown: p.tag.visible })))).toEqual([{ name: 'Guesto', through: true, shown: true }]);
    // and the player's own name in the third-person view
    expect(await host.evaluate(() => { const g = window.__sc.game; g.thirdPerson = 1; return new Promise((r) => setTimeout(() => { const n = g.selfTag && g.selfTag.userData.name; g.thirdPerson = 0; r(n); }, 300)); })).toBe('Hostie');
    // the host puts on a 3D avatar and waves: the guest sees both
    await host.evaluate(() => { const g = window.__sc.game, p = g.profile; p.avatar = { unlocked: true, on: true, cfg: { hat: 'cap', back: 'cape' } }; g.applySkin(); g.startEmote('wave'); });
    await guest.waitForFunction(() => [...window.__sc.game.net.players.values()].some((p) => p.rig && p.rig.avatar && p.skin.startsWith('av:') && p.fig.emote === 'wave'), null, { timeout: 15_000 });
    if (process.env.SHOTS) {
      // stand the guest a few steps from the host, looking at them
      const hp = await host.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, y: p.y, z: p.z }; });
      await guest.evaluate((p) => { const g = window.__sc.game; g.player.pos.set(p.x + 4, p.y, p.z + 1); g.player.yaw = Math.atan2(4, 1); g.player.pitch = -0.1; }, hp);
      await host.evaluate(() => { const g = window.__sc.game; g.selectSlot(1); g.held.swing(); });
      await guest.waitForTimeout(1500);
      await unpause(guest);
      await guest.waitForTimeout(500);
      await shot(guest, 'guest-sees-host');
      await guest.evaluate(() => window.__sc.ui.openPause());
      await guest.click('[data-screen="pause"] [data-act="room"]');
      await shot(guest, 'room-guest');
      await guest.evaluate(() => window.__sc.ui.closeAll());
    }

    // a block placed by the guest appears for the host (and the host saves it)
    const spot = await guest.evaluate(() => { const g = window.__sc.game, p = g.player.pos; const x = Math.floor(p.x) + 2, z = Math.floor(p.z); const y = g.world.topSolid(x, z) + 1; const id = g.world.getBlock(x, y - 1, z); g.world.setBlock(x, y, z, id); return { x, y, z, id }; });
    await host.waitForFunction((s) => window.__sc.game.world.getBlock(s.x, s.y, s.z) === s.id, spot, { timeout: 15_000 });
    // and one broken by the host disappears for the guest
    await host.evaluate((s) => window.__sc.game.world.setBlock(s.x, s.y, s.z, 0), spot);
    await guest.waitForFunction((s) => window.__sc.game.world.getBlock(s.x, s.y, s.z) === 0, spot, { timeout: 15_000 });
    // edits made before joining arrive too
    const early = await host.evaluate(() => { const g = window.__sc.game; const k = Object.keys(g.meta.edits.overworld); return k.length; });
    expect(early).toBeGreaterThan(0);

    // a monster the host runs shows up for the guest; the guest's hits kill it
    await guest.evaluate(() => { window.__sc.game.player.god = true; });
    const gp = await guest.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, y: p.y, z: p.z }; });
    await host.evaluate((p) => { const g = window.__sc.game; window.__mob = g.entities.spawnMob('skitter', p.x + 3, p.y + 0.5, p.z); }, gp);
    await host.waitForFunction(() => window.__mob.netId, null, { timeout: 15_000 });
    const mobId = await host.evaluate(() => window.__mob.netId);
    await guest.waitForFunction((id) => window.__sc.game.net.puppets.has(id), mobId, { timeout: 15_000 });
    const kills0 = await guest.evaluate(() => window.__sc.game.meta.stats.kills);
    await guest.evaluate((id) => { const g = window.__sc.game, m = g.net.puppets.get(id); for (let i = 0; i < 4; i++) g.entities.playerHit(m, 10, null); }, mobId);
    await host.waitForFunction(() => window.__mob.dead, null, { timeout: 15_000 });
    await guest.waitForFunction((a) => window.__sc.game.meta.stats.kills === a.k + 1 && !window.__sc.game.net.puppets.has(a.id), { k: kills0, id: mobId }, { timeout: 15_000 });

    // monsters go for the guest too, and their hits land on the guest
    await guest.evaluate(() => { window.__sc.game.player.god = false; });
    const hp0 = await guest.evaluate(() => window.__sc.game.player.health);
    const gp2 = await guest.evaluate(() => { const p = window.__sc.game.player.pos; return { x: p.x, y: p.y, z: p.z }; });
    await host.evaluate((p) => { const g = window.__sc.game; g.player.pos.x -= 30; window.__mob2 = g.entities.spawnMob('hollow', p.x + 1.2, p.y + 0.2, p.z); }, gp2);
    await guest.waitForFunction((h) => { const g = window.__sc.game; if (g.paused && !g.player.dead) window.__sc.ui.closeAll(); return g.player.health < h; }, hp0, { timeout: 30_000, polling: 250 });
    await host.evaluate(() => { window.__mob2.dead = true; window.__sc.game.player.pos.x += 30; });

    // the guest's things are kept in the host's world
    await guest.evaluate(() => { const g = window.__sc.game; g.player.health = g.player.maxHealth; g.inventory.add('bone_dust', 3); });
    await guest.evaluate(() => window.__sc.app.quitToTitle());
    await expect(guest.locator('[data-screen="title"]')).toBeVisible();
    await expect(host.locator('.room-chip')).toHaveText(`${code} · 1/4`);
    const kept = await host.evaluate(() => { const g = window.__sc.game; const s = Object.values(g.meta.guests || {})[0]; return s && s.inventory ? JSON.stringify(s.inventory).includes('bone_dust') : false; });
    expect(kept).toBe(true);

    // rejoining brings them back
    await guest.click('[data-act=\"together\"]');
    await guest.click('[data-screen=\"together\"] [data-act=\"t-code\"]');
    await guest.fill('#mp-code', code);
    await guest.click('[data-screen="join"] [data-act="join"]');
    await running(guest);
    expect(await guest.evaluate(() => window.__sc.game.inventory.count('bone_dust'))).toBe(3);

    // a wrong code is explained
    const third = await (await browser.newContext()).newPage();
    await signIn(third, HOST);
    await third.click('[data-act=\"together\"]');
    await third.click('[data-screen=\"together\"] [data-act=\"t-code\"]');
    await third.fill('#mp-code', 'ZZZZZZ');
    await third.click('[data-screen="join"] [data-act="join"]');
    await expect(third.locator('[data-screen="join"] .form-error')).toHaveText('No open room with this code. Check it with your friend.');

    // the host closes the room: the guest is sent back to the title
    await unpause(host);
    await host.evaluate(() => window.__sc.app.closeRoom());
    await expect(guest.locator('[data-screen="title"]')).toBeVisible({ timeout: 15_000 });
    await expect(guest.locator('.toast', { hasText: 'The host closed the world.' })).toBeVisible();
    expect(await host.evaluate(() => window.__sc.game.net)).toBeNull();
    await expect(host.locator('.room-chip')).toBeHidden();

    expect(hostProblems).toEqual([]);
    expect(guestProblems).toEqual([]);
  });

  test('Malaga together: a guest\'s deeds count for the team, the big mission is shared, the plan puzzle too', async ({ browser, request }) => {
    test.setTimeout(300_000);
    await makeUsers(request);
    const host = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const guest = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage();
    const hostProblems = watchConsole(host), guestProblems = watchConsole(guest);

    // "Play with friends": Malaga together opens the world to friends at once
    await signIn(host, HOST);
    await host.click('[data-act="together"]');
    await shot(host, 'together');
    await host.click('[data-screen="together"] [data-act="t-city"]');
    await host.click('[data-screen="cityIntro"] [data-act="start"]');
    await running(host);
    await host.waitForFunction(() => !!(window.__sc.game.net && window.__sc.game.net.code), null, { timeout: 30_000 });
    await expect(host.locator('[data-screen="friends"]')).toBeVisible();
    const code = await host.evaluate(() => window.__sc.game.net.code);
    await host.evaluate(() => window.__sc.ui.closeAll());

    await signIn(guest, GUEST);
    await guest.evaluate((c) => window.__sc.app.joinRoom(c), code);
    await running(guest);
    // the guest gets the team's state: the host's twelve tasks
    await guest.waitForFunction(() => { const g = window.__sc.game; return g.missions.guest && g.team && g.team.heist && g.team.heist.tasks.length === 12; }, null, { timeout: 30_000 });
    const tasks = await host.evaluate(() => window.__sc.game.heist.state().tasks);
    expect(await guest.evaluate(() => window.__sc.game.heist.state().tasks)).toEqual(tasks);

    // the guest eats in three restaurants: the team's critic mission is done, and the guest is rewarded too
    await guest.evaluate(() => { const M = window.__sc.game.missions; for (const k of ['1,1', '5,2', '9,9']) M.event('meal', { item: 'paella', key: k }); });
    await host.waitForFunction(() => window.__sc.game.missions.isDone('critic'), null, { timeout: 15_000 });
    await guest.waitForFunction(() => window.__sc.game.missions.isDone('critic'), null, { timeout: 15_000 });

    // the guest meets an informant (a task with just a meeting): the host's game sees it, and a piece of the plan comes
    const t1 = await host.evaluate(() => { const H = window.__sc.game.heist; const m = H.missions().find((x) => x.steps.length === 1 && x.steps[0].ev === 'reach' && !x.steps[0].give); return m && { id: m.id, key: m.key, place: m.steps[0].near }; });
    expect(t1).toBeTruthy();
    await guest.evaluate((name) => { const g = window.__sc.game, q = g.missions.placeXZ(name); g.player.fly = true; g.player.pos.set(q.x + 1, 80, q.z + 1); }, t1.place);
    await unpause(host);
    await host.waitForFunction((id) => window.__sc.game.missions.isDone(id), t1.id, { timeout: 30_000 });
    await guest.waitForFunction((key) => window.__sc.game.heist.state().got.includes(key), t1.key, { timeout: 30_000 });
    // the guest puts that piece in the plan: the host's plan has it too
    await guest.evaluate((key) => { const H = window.__sc.game.heist, s = H.state(); H.place(key, s.slots[key]); }, t1.key);
    await host.waitForFunction((key) => window.__sc.game.heist.state().placed.includes(key), t1.key, { timeout: 15_000 });
    expect(hostProblems).toEqual([]);
    expect(guestProblems).toEqual([]);
  });
});
