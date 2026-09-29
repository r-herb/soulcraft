import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

// Chat: private messages between friends arrive live, the Lobby is only
// for players an admin let in, admins delete messages and mute players,
// and reported messages reach the admin.
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
const CARA = { name: 'Cara', username: 'cara', password: 'cara-pass-1' };
const DAN = { name: 'Dan', username: 'dan', password: 'dan-pass-1' };
const MOD = { name: 'Moddy', username: 'moddy', password: 'moddy-pass-1' };
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.bringToFront(); await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function signIn(page, u) {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ } });
  await page.goto('/?nosw=1');
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', u.username);
  await page.fill('#si-pass', u.password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}
async function asUser(playwright, baseURL, u) {
  const r = await playwright.request.newContext({ baseURL });
  expect((await r.post('/api/auth/login', { data: { login: u.username, password: u.password } })).ok()).toBeTruthy();
  return r;
}
const send = async (page, text) => { await page.fill('.chat-send .input', text); await page.click('.chat-send button[type=submit]'); };

test.describe('Chat', () => {
  test.setTimeout(240_000);
  test('friends chat live; the Lobby needs an admin; admins delete and mute; reports reach the admin', async ({ browser, playwright, baseURL, request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [CARA, DAN, MOD]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    const users = (await (await request.get('/api/admin/users?q=')).json()).users;
    const id = (n) => users.find((u) => u.username === n).id;
    await request.post(`/api/admin/users/${id('moddy')}/role`, { data: { role: 'admin' } });
    // Cara and Dan are friends
    const cara = await asUser(playwright, baseURL, CARA), dan = await asUser(playwright, baseURL, DAN);
    await cara.post('/api/friends', { data: { username: 'dan' } });
    await dan.post(`/api/friends/${id('cara')}/accept`, { data: {} });
    // wait until the local server reaches the rooms Worker (the chat hub lives there)
    for (let i = 0; i < 60 && !(await cara.post('/api/mp/room', { data: { world: 'probe' } })).ok(); i++) await new Promise((r) => setTimeout(r, 1000));

    const pc = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
    const pd = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
    const probC = watchConsole(pc), probD = watchConsole(pd);
    await signIn(pc, CARA);
    await signIn(pd, DAN);
    // no Lobby for Cara yet
    await pc.click('[data-act="chat"]');
    await expect(pc.locator('.chat-conv', { hasText: 'Dan' })).toBeVisible();
    await expect(pc.locator('.chat-conv', { hasText: 'Lobby' })).toHaveCount(0);
    await pc.locator('.chat-conv', { hasText: 'Dan' }).click();
    await send(pc, 'hola Dan!');
    await expect(pc.locator('.chat-msg', { hasText: 'hola Dan!' })).toBeVisible();
    // Dan sees the unread count live, then the message
    await expect(pd.locator('[data-act="chat"] .dot')).toHaveText('1', { timeout: 20_000 });
    await pd.click('[data-act="chat"]');
    await pd.locator('.chat-conv', { hasText: 'Cara' }).click();
    await expect(pd.locator('.chat-msg', { hasText: 'hola Dan!' })).toBeVisible();
    await send(pd, 'hi Cara');
    await expect(pc.locator('.chat-msg', { hasText: 'hi Cara' })).toBeVisible({ timeout: 20_000 });
    await shot(pc, 'chat-dm');
    // Dan reports Cara's message
    await pd.locator('.chat-msg', { hasText: 'hola Dan!' }).locator('[data-a="report"]').click();
    await expect(pd.locator('.toast', { hasText: 'admin will look' })).toBeVisible();

    // an admin lets Cara into the Lobby; it appears for her live
    await request.post('/api/admin/channels/1/members', { data: { username: 'cara' } });
    await expect(pc.locator('.chat-conv', { hasText: 'Lobby' })).toBeVisible({ timeout: 20_000 });
    await pc.locator('.chat-conv', { hasText: 'Lobby' }).click();
    await send(pc, 'hello Lobby');
    await expect(pc.locator('.chat-msg', { hasText: 'hello Lobby' })).toBeVisible();
    // Dan is not in the Lobby
    expect((await dan.get('/api/chat/c/1')).status()).toBe(403);
    // the admin (Moddy) sees the Lobby, deletes the message and mutes Cara
    const mod = await asUser(playwright, baseURL, MOD);
    const lobby = await (await mod.get('/api/chat/c/1')).json();
    const msg = lobby.messages.find((m) => m.text === 'hello Lobby');
    expect((await mod.delete(`/api/admin/messages/${msg.id}`)).ok()).toBeTruthy();
    await expect(pc.locator('.chat-msg', { hasText: 'message deleted' })).toBeVisible({ timeout: 20_000 });
    expect((await mod.post(`/api/admin/users/${id('cara')}/mute`, { data: { minutes: 30 } })).ok()).toBeTruthy();
    await send(pc, 'can I still talk?');
    await expect(pc.locator('.chat-room .form-error')).toContainText('muted');
    // the report is in the admin's list, and the log shows the moderation
    const reports = (await (await mod.get('/api/admin/reports')).json()).reports;
    expect(reports.some((r) => r.text === 'hola Dan!' && r.reporter === 'Dan')).toBe(true);
    const log = (await (await request.get('/api/admin/audit')).json()).entries;
    expect(log.some((e) => e.action === 'chat_delete' && e.actorName === 'Moddy')).toBe(true);
    expect(log.some((e) => e.action === 'chat_mute' && e.targetName === 'Cara')).toBe(true);
    await shot(pc, 'chat-lobby');
    const noise = (p) => p.filter((x) => !/status of (403|429)/.test(x));
    expect(noise(probC)).toEqual([]);
    expect(noise(probD)).toEqual([]);
  });
});
