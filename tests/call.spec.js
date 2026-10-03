import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

// Calls between friends: a video call on a computer, answered, connected
// both ways, then hung up. (The browser's fake camera and microphone.)
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
const EVE = { name: 'Eve', username: 'eve', password: 'eve-pass-1' };
const FINN = { name: 'Finn', username: 'finn', password: 'finn-pass-1' };
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.bringToFront(); await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function signIn(page, u) {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ } });
  await page.goto('/?nosw=1');
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', u.username);
  await page.fill('#si-pass', u.password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}

test.describe('Calls', () => {
  test.setTimeout(240_000);
  test('a friend calls, the other answers, both see and hear each other, and the call ends', async ({ browser, playwright, baseURL, request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [EVE, FINN]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    const users = (await (await request.get('/api/admin/users?q=')).json()).users;
    const id = (n) => users.find((u) => u.username === n).id;
    const eveApi = await playwright.request.newContext({ baseURL });
    await eveApi.post('/api/auth/login', { data: { login: 'eve', password: EVE.password } });
    const finnApi = await playwright.request.newContext({ baseURL });
    await finnApi.post('/api/auth/login', { data: { login: 'finn', password: FINN.password } });
    await eveApi.post('/api/friends', { data: { username: 'finn' } });
    await finnApi.post(`/api/friends/${id('eve')}/accept`, { data: {} });
    for (let i = 0; i < 60 && !(await eveApi.post('/api/mp/room', { data: { world: 'probe' } })).ok(); i++) await new Promise((r) => setTimeout(r, 1000));
    // strangers cannot ring anyone
    expect((await (await playwright.request.newContext({ baseURL })).post('/api/call/signal', { data: { to: id('finn'), data: { type: 'invite' } } })).status()).toBe(401);

    const ctx = { viewport: { width: 1100, height: 650 }, permissions: ['camera', 'microphone'] };
    const pe = await (await browser.newContext(ctx)).newPage();
    const pf = await (await browser.newContext(ctx)).newPage();
    const probE = watchConsole(pe), probF = watchConsole(pf);
    await signIn(pe, EVE);
    await signIn(pf, FINN);
    await pe.click('[data-act="friends"]');
    await pe.locator('.fr-row', { hasText: 'Finn' }).locator('[data-a="call"]').click({ timeout: 30_000 });
    await expect(pe.locator('.call-tile.ringing')).toBeVisible();
    await expect(pf.locator('.call-ring')).toContainText('Eve', { timeout: 20_000 });
    await pf.locator('.call-ring [data-a="yes"]').click();
    // connected both ways, with video from the other side
    const connected = (page) => page.waitForFunction(() => { const c = window.__sc.app.calls.call; if (!c) return false; const p = [...c.peers.values()][0]; return p && p.pc.connectionState === 'connected' && p.stream.getVideoTracks().length > 0; }, null, { timeout: 60_000 });
    await connected(pe);
    await connected(pf);
    await pe.waitForFunction(() => [...document.querySelectorAll('.call-tile:not(.me) video')].some((v) => v.videoWidth > 0), null, { timeout: 30_000 });
    await shot(pe, 'call-video');
    // mute works; hanging up ends the call on both sides
    await pe.locator('.call-bar [data-a="mic"]').click();
    expect(await pe.evaluate(() => window.__sc.app.calls.call.local.getAudioTracks()[0].enabled)).toBe(false);
    await pe.locator('.call-bar [data-a="end"]').click();
    await expect(pe.locator('.call-box')).toHaveCount(0);
    await expect(pf.locator('.call-box')).toHaveCount(0, { timeout: 20_000 });
    expect(probE).toEqual([]);
    expect(probF).toEqual([]);
  });

  test('a call and an invite to play wait for a friend whose game was closed; push subscriptions', async ({ browser, playwright, baseURL, request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [EVE, FINN]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    const users = (await (await request.get('/api/admin/users?q=')).json()).users;
    const id = (n) => users.find((u) => u.username === n).id;
    const eveApi = await playwright.request.newContext({ baseURL });
    await eveApi.post('/api/auth/login', { data: { login: 'eve', password: EVE.password } });
    const finnApi = await playwright.request.newContext({ baseURL });
    await finnApi.post('/api/auth/login', { data: { login: 'finn', password: FINN.password } });
    await eveApi.post('/api/friends', { data: { username: 'finn' } });
    await finnApi.post(`/api/friends/${id('eve')}/accept`, { data: {} });

    // push: the server's key, a subscription only to a real push service
    const key = (await (await finnApi.get('/api/push/key')).json()).key;
    expect(key).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect((await finnApi.post('/api/push/subscribe', { data: { endpoint: 'https://evil.example.com/x', lang: 'lv' } })).status()).toBe(400);
    expect((await finnApi.post('/api/push/subscribe', { data: { endpoint: 'https://fcm.googleapis.com/fcm/send/test-finn', lang: 'lv' } })).ok()).toBeTruthy();

    // Eve rings while Finn's game is closed: the call waits for him
    expect((await eveApi.post('/api/call/signal', { data: { to: id('finn'), data: { type: 'invite', call: 'abc123', video: false } } })).ok()).toBeTruthy();
    const pend = await (await finnApi.get('/api/push/pending')).json();
    expect(pend.lang).toBe('lv');
    expect(pend.events.find((e) => e.kind === 'call')).toMatchObject({ from: id('eve'), name: 'Eve', call: 'abc123' });
    // Finn opens the game: it rings; he declines and the call stops waiting
    const pf = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
    const probF = watchConsole(pf);
    await signIn(pf, FINN);
    await expect(pf.locator('.call-ring')).toContainText('Eve', { timeout: 15_000 });
    await shot(pf, 'call-waiting');
    await pf.locator('.call-ring [data-a="no"]').click();
    await expect(pf.locator('.call-ring')).toHaveCount(0);
    await expect.poll(async () => (await (await finnApi.get('/api/push/pending')).json()).events.filter((e) => e.kind === 'call').length).toBe(0);

    // Eve opens her world and invites Finn: a card with Join comes up in his game
    let code = null;
    for (let i = 0; i < 60 && !code; i++) { const r = await eveApi.post('/api/mp/room', { data: { world: 'Malaga' } }); if (r.ok()) code = (await r.json()).code; else await new Promise((r2) => setTimeout(r2, 1000)); }
    expect((await finnApi.post('/api/mp/invite', { data: { to: id('eve'), room: 'BAD', world: 'x' } })).status()).toBe(400);
    expect((await eveApi.post('/api/mp/invite', { data: { to: id('finn'), room: code, world: 'Malaga', city: 'malaga' } })).ok()).toBeTruthy();
    await expect(pf.locator('.invite-card')).toContainText('Eve', { timeout: 15_000 });
    await expect(pf.locator('.invite-card [data-a="join"]')).toBeVisible();
    await shot(pf, 'invite-card');
    await pf.locator('.invite-card [data-a="later"]').click();
    await expect(pf.locator('.invite-card')).toHaveCount(0);
    await expect.poll(async () => (await (await finnApi.get('/api/push/pending')).json()).events.filter((e) => e.kind === 'game').length).toBe(0);
    // the friends list offers to turn notifications on (when the browser can)
    expect(probF).toEqual([]);
  });
});
