import { test, expect } from '@playwright/test';
import { watchConsole } from './helpers.js';

// The economy: the exchange (prices fall as players sell), the bank
// account, the central bank's gold reserve, bus fares, and the cash
// machine screen in the game.
const ADMIN = { login: 'admin', password: 'admin-pass-123' };
const EVE = { name: 'Eve', username: 'eve', password: 'eve-pass-1' };
const FINN = { name: 'Finn', username: 'finn', password: 'finn-pass-1' };
const GIA = { name: 'Gia', username: 'gia', password: 'gia-pass-1' };
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(400); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

async function signIn(page, u) {
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ } });
  await page.goto('/?nosw=1');
  await page.click('[data-act="signin"]');
  await page.fill('#si-login', u.username);
  await page.fill('#si-pass', u.password);
  await page.click('[data-screen="signin"] [data-act="submit"]');
  await expect(page.locator('[data-act="profile"]')).toBeVisible();
}

test.describe('Economy', () => {
  test.setTimeout(180_000);

  test('the exchange, the bank, the central bank and bus fares (API)', async ({ request, playwright, baseURL }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [EVE, FINN]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    expect((await request.post('/api/auth/login', { data: { login: EVE.username, password: EVE.password } })).ok()).toBeTruthy();

    let s = await (await request.get('/api/econ')).json();
    expect(s.wallet).toEqual({ cash: 20, bank: 0 });
    expect(s.fare).toBe(2);
    const fruit = () => s.goods.find((g) => g.item === 'sunfruit');
    const before = fruit();
    expect(before.buy).toBeGreaterThan(before.sell);

    // selling a lot lowers the price
    let r = await request.post('/api/econ/sell', { data: { item: 'sunfruit', qty: 120 } });
    expect(r.ok()).toBeTruthy();
    const sold = await r.json();
    expect(sold.wallet.cash).toBe(20 + sold.total);
    s = await (await request.get('/api/econ')).json();
    expect(fruit().supply).toBe(120);
    expect(fruit().sell).toBeLessThan(before.sell);
    expect(fruit().buy).toBeLessThan(before.buy);

    // bad input and not enough money
    expect((await request.post('/api/econ/sell', { data: { item: 'dirt_cake', qty: 1 } })).status()).toBe(400);
    expect((await request.post('/api/econ/sell', { data: { item: 'sunfruit', qty: 0 } })).status()).toBe(400);
    r = await request.post('/api/econ/buy', { data: { item: 'diamond', qty: 500 } });
    expect(r.status()).toBe(402);
    expect((await r.json()).error).toBe('no_money');

    // the bank account
    const cash = s.wallet.cash;
    r = await request.post('/api/econ/deposit', { data: { amount: 50 } });
    expect((await r.json()).wallet).toEqual({ cash: cash - 50, bank: 50 });
    expect((await request.post('/api/econ/withdraw', { data: { amount: 51 } })).status()).toBe(402);
    r = await request.post('/api/econ/withdraw', { data: { amount: 20 } });
    expect((await r.json()).wallet).toEqual({ cash: cash - 30, bank: 30 });

    // gold goes into the central bank's reserve
    const gold0 = s.central.gold;
    r = await request.post('/api/econ/sell', { data: { item: 'gold_ingot', qty: 3 } });
    expect(r.ok()).toBeTruthy();
    s = await (await request.get('/api/econ')).json();
    expect(s.central.gold).toBe(gold0 + 3);
    expect(s.central.money).toBeGreaterThanOrEqual(s.wallet.cash + s.wallet.bank);

    // a bus ride costs the fare, and is refused without coins
    const c0 = s.wallet.cash;
    r = await request.post('/api/econ/pay', { data: { what: 'bus' } });
    expect((await r.json()).wallet.cash).toBe(c0 - 2);
    const h = await (await request.get('/api/econ/history')).json();
    expect(h.history.map((x) => x.kind)).toEqual(['bus', 'sell', 'withdraw', 'deposit', 'sell']);
    expect(h.history[0].amount).toBe(-2);

    // a city mission pays once
    r = await request.post('/api/econ/mission', { data: { id: 'tour' } });
    expect((await r.json()).paid).toBe(60);
    r = await request.post('/api/econ/mission', { data: { id: 'tour' } });
    expect((await r.json()).paid).toBe(0);
    expect((await request.post('/api/econ/mission', { data: { id: 'moon' } })).status()).toBe(400);

    // groceries and a meal
    r = await request.post('/api/econ/pay', { data: { what: 'shop', item: 'tomato', qty: 3 } });
    expect((await r.json()).total).toBe(6);
    r = await request.post('/api/econ/pay', { data: { what: 'meal', item: 'paella' } });
    expect((await r.json()).total).toBe(22);
    expect((await request.post('/api/econ/pay', { data: { what: 'shop', item: 'diamond', qty: 1 } })).status()).toBe(400);
    expect((await request.post('/api/econ/pay', { data: { what: 'meal', item: 'caviar' } })).status()).toBe(400);
    expect((await request.post('/api/econ/pay', { data: { what: 'taxi' } })).status()).toBe(400);
    // the Gran Diamante pays only after the big mission's twelve tasks
    r = await request.post('/api/econ/heist', { data: {} });
    expect(r.status()).toBe(409);
    expect((await r.json()).error).toBe('not_yet');
    // test coins are only for the superadmin's own player account
    expect((await request.post('/api/econ/testcash', { data: {} })).status()).toBe(403);

    // Finn has his own wallet and no coins for a second-hand diamond
    expect((await request.post('/api/auth/login', { data: { login: FINN.username, password: FINN.password } })).ok()).toBeTruthy();
    s = await (await request.get('/api/econ')).json();
    expect(s.wallet).toEqual({ cash: 20, bank: 0 });
    expect((await request.post('/api/econ/buy', { data: { item: 'diamond', qty: 1 } })).status()).toBe(402);
    // bus tickets: a bonobús of ten rides costs 13; an unknown ticket is refused
    r = await request.post('/api/econ/pay', { data: { what: 'ticket', kind: 'bonobus' } });
    expect(await r.json()).toMatchObject({ total: 13, wallet: { cash: 7 } });
    expect((await request.post('/api/econ/pay', { data: { what: 'ticket', kind: 'toString' } })).status()).toBe(400);
    for (let i = 0; i < 10; i++) await request.post('/api/econ/pay', { data: { what: 'bus' } });
    r = await request.post('/api/econ/pay', { data: { what: 'bus' } });
    expect(r.status()).toBe(402);
    // La Fábrica: the bags brought to El Maestro pay once per account, ten bags at most
    expect((await request.post('/api/econ/fabrica', { data: { bags: 0 } })).status()).toBe(400);
    r = await request.post('/api/econ/fabrica', { data: { bags: 30 } });
    expect(await r.json()).toMatchObject({ paid: 250000 });
    r = await request.post('/api/econ/fabrica', { data: { bags: 10 } });
    expect((await r.json()).paid).toBe(0);
    // season 2: the sacks of gold, once per account, twelve at most
    expect((await request.post('/api/econ/oro', { data: { sacks: 0 } })).status()).toBe(400);
    r = await request.post('/api/econ/oro', { data: { sacks: 40 } });
    expect(await r.json()).toMatchObject({ paid: 360000 });
    r = await request.post('/api/econ/oro', { data: { sacks: 12 } });
    expect((await r.json()).paid).toBe(0);

    // guests have no wallet
    const guest = await playwright.request.newContext({ baseURL });
    expect([401, 403]).toContain((await guest.get('/api/econ')).status());
    await guest.dispose();
  });

  test('salaries for quests, the lottery and the players\' market (API)', async ({ playwright, baseURL, request }) => {
    const IDA = { name: 'Ida', username: 'ida', password: 'ida-pass-1' };
    const JO = { name: 'Jo', username: 'jo', password: 'jo-pass-1' };
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    for (const u of [IDA, JO]) expect([201, 409]).toContain((await request.post('/api/admin/users', { data: u })).status());
    const as = async (u) => { const c = await playwright.request.newContext({ baseURL }); expect((await c.post('/api/auth/login', { data: { login: u.username, password: u.password } })).ok()).toBeTruthy(); return c; };
    const ida = await as(IDA), jo = await as(JO);
    const DAY = 24 * 3600e3;
    const later = { headers: { 'x-test-now': String(Date.now() + DAY + 60e3) } }; // the next Soulcraft month

    // quests this month: counted once each
    const counted = [];
    for (const [kind, ref] of [['daily', 'd1'], ['daily', 'd2'], ['boss', 'voidDragon'], ['treasure', 'L1'], ['daily', 'd1']]) {
      counted.push((await (await ida.post('/api/econ/quest', { data: { kind, ref } })).json()).counted);
    }
    expect(counted).toEqual([true, true, true, true, false]);
    expect((await ida.post('/api/econ/quest', { data: { kind: 'cheat', ref: 'x' } })).status()).toBe(400);
    let st = await (await ida.get('/api/econ')).json();
    expect(st.salary.quests).toEqual({ daily: 2, boss: 1, treasure: 1 });
    expect(st.salary.earned).toBe(2 * 6 + 40 + 8);
    expect(st.date.day).toBeGreaterThanOrEqual(1);

    // lottery tickets: both buy, at most 10 each
    expect((await ida.post('/api/econ/lottery', { data: { tickets: 2 } })).ok()).toBeTruthy();
    expect((await jo.post('/api/econ/lottery', { data: { tickets: 1 } })).ok()).toBeTruthy();
    expect((await ida.post('/api/econ/lottery', { data: { tickets: 9 } })).status()).toBe(409);
    st = await (await ida.get('/api/econ')).json();
    expect(st.lottery.mine).toBe(2);
    expect(st.lottery.tickets).toBeGreaterThanOrEqual(3);

    // the players' market: Ida offers, Jo buys; Ida takes another back
    let r = await (await ida.post('/api/econ/offers', { data: { item: 'diamond', qty: 2, price: 15 } })).json();
    const sold = r.id;
    r = await (await ida.post('/api/econ/offers', { data: { item: 'bread', qty: 5, price: 4 } })).json();
    const back = r.id;
    expect((await ida.post('/api/econ/offers', { data: { item: 'x', qty: 1, price: 1 } })).status()).toBe(400);
    const list = (await (await jo.get('/api/econ/offers')).json()).offers;
    expect(list.find((o) => o.id === sold)).toMatchObject({ item: 'diamond', qty: 2, price: 15, name: 'Ida', mine: false });
    expect((await ida.post(`/api/econ/offers/${sold}/buy`, { data: {} })).status()).toBe(400);
    const joCash = (await (await jo.get('/api/econ')).json()).wallet.cash;
    r = await (await jo.post(`/api/econ/offers/${sold}/buy`, { data: {} })).json();
    expect(r).toMatchObject({ ok: true, item: 'diamond', qty: 2 });
    expect(r.wallet.cash).toBe(joCash - 15);
    expect((await jo.post(`/api/econ/offers/${sold}/buy`, { data: {} })).status()).toBe(404);
    expect((await jo.post(`/api/econ/offers/${back}/cancel`, { data: {} })).status()).toBe(403);
    r = await (await ida.post(`/api/econ/offers/${back}/cancel`, { data: {} })).json();
    expect(r).toMatchObject({ ok: true, item: 'bread', qty: 5 });

    // the month ends: Ida's salary is paid once, and the lottery is drawn
    const before = (await (await ida.get('/api/econ')).json()).wallet.cash;
    st = await (await ida.get('/api/econ', later)).json();
    expect(st.salary.last).toMatchObject({ amount: 60 });
    const won = st.lottery.last.you ? st.lottery.last.pot : 0;
    expect(st.lottery.last.tickets).toBeGreaterThanOrEqual(3);
    expect(st.wallet.cash).toBe(before + 60 + won);
    st = await (await ida.get('/api/econ', later)).json();
    expect(st.wallet.cash).toBe(before + 60 + won);
    expect(st.salary.earned).toBe(0);
    const h = (await (await ida.get('/api/econ/history')).json()).history.map((x) => x.kind);
    expect(h).toContain('salary');
    expect(h).toContain('market_sell');
    await ida.dispose(); await jo.dispose();
  });

  test('guarding the economy: daily limits, quest limits, and an admin freezes and corrects a wallet', async ({ playwright, baseURL, request, page }) => {
    const KIM = { name: 'Kim', username: 'kim', password: 'kim-pass-1' };
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    expect([201, 409]).toContain((await request.post('/api/admin/users', { data: KIM })).status());
    const kim = await playwright.request.newContext({ baseURL });
    expect((await kim.post('/api/auth/login', { data: { login: KIM.username, password: KIM.password } })).ok()).toBeTruthy();

    // at most 8 diamonds a day, to the exchange and the market together
    expect((await kim.post('/api/econ/sell', { data: { item: 'diamond', qty: 6 } })).ok()).toBeTruthy();
    let r = await kim.post('/api/econ/sell', { data: { item: 'diamond', qty: 3 } });
    expect(r.status()).toBe(429);
    expect(await r.json()).toMatchObject({ error: 'daily_cap', left: 2 });
    expect((await kim.post('/api/econ/offers', { data: { item: 'diamond', qty: 2, price: 50 } })).ok()).toBeTruthy();
    expect((await kim.post('/api/econ/offers', { data: { item: 'diamond', qty: 1, price: 50 } })).status()).toBe(429);
    expect((await kim.post('/api/econ/sell', { data: { item: 'planks', qty: 64 } })).ok()).toBeTruthy();

    // three daily tasks count a day, however many are reported
    const counted = [];
    for (let i = 0; i < 5; i++) counted.push((await (await kim.post('/api/econ/quest', { data: { kind: 'daily', ref: 'fake' + i } })).json()).counted);
    expect(counted).toEqual([true, true, true, false, false]);

    // the admin sees the flag, freezes the wallet and takes coins back
    const ec = await (await request.get('/api/admin/econ')).json();
    const row = ec.users.find((u) => u.name === 'Kim');
    expect(row.flags).toContain('diamond 8/8');
    const id = row.userId;
    expect((await request.post(`/api/admin/econ/users/${id}/freeze`, { data: { hours: 2, reason: 'too many diamonds' } })).ok()).toBeTruthy();
    r = await kim.post('/api/econ/sell', { data: { item: 'planks', qty: 1 } });
    expect(r.status()).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'frozen', reason: 'too many diamonds' });
    expect((await kim.post('/api/econ/pay', { data: { what: 'bus' } })).status()).toBe(403);
    expect((await (await kim.get('/api/econ')).json()).frozen).toMatchObject({ reason: 'too many diamonds' });
    const cash = (await (await kim.get('/api/econ')).json()).wallet.cash;
    expect((await request.post(`/api/admin/econ/users/${id}/adjust`, { data: { cash: -100, bank: 0 } })).status()).toBe(400);
    r = await request.post(`/api/admin/econ/users/${id}/adjust`, { data: { cash: -100, bank: 0, reason: 'made-up diamonds' } });
    expect((await r.json()).wallet.cash).toBe(Math.max(0, cash - 100));
    expect((await (await request.get(`/api/admin/econ/users/${id}`)).json()).history[0].kind).toBe('admin');
    const audit = (await (await request.get('/api/admin/audit')).json()).entries.map((a) => a.action);
    expect(audit).toContain('econ_freeze');
    expect(audit).toContain('econ_adjust');

    // the Economy tab of the admin panel
    await page.goto('/admin');
    await page.fill('#a-login', ADMIN.login);
    await page.fill('#a-pass', ADMIN.password);
    await page.click('form[data-form="login"] button[type=submit]');
    await expect(page.locator('table.users')).toBeVisible();
    await page.click('[data-nav="econ"]');
    const tr = page.locator('.ec-list tr', { hasText: 'Kim' });
    await expect(tr).toContainText('diamond 8/8');
    await expect(tr).toContainText('frozen until');
    await shot(page, 'admin-econ');
    await tr.locator('[data-a="unfreeze"]').click();
    await expect(page.locator('.ec-list tr', { hasText: 'Kim' }).locator('[data-a="freeze"]')).toBeVisible();
    expect((await kim.post('/api/econ/sell', { data: { item: 'planks', qty: 1 } })).ok()).toBeTruthy();
    await kim.dispose();
  });

  test('the cash machine screen: sell, buy, deposit and the central bank', async ({ page, request }) => {
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    expect([201, 409]).toContain((await request.post('/api/admin/users', { data: GIA })).status());
    const logs = watchConsole(page);
    await signIn(page, GIA);
    await page.click('[data-act="new"]');
    await page.fill('#nw-name', 'Gia Town');
    await page.click('[data-act="create"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    await expect(page.locator('.coin-chip .coins')).toHaveText(/^\d+$/);
    const coins0 = Number(await page.locator('.coin-chip .coins').textContent());

    // using a cash machine opens the bank
    await page.evaluate(() => {
      const g = window.__sc.game;
      g.giveItem('diamond', 3);
      g.use({ id: 101, x: 0, y: 0, z: 0 }, null, { x: 0, y: 0, z: 1 }, true);
    });
    await expect(page.locator('[data-screen="bank"]')).toBeVisible();
    const row = page.locator('.bank-row[data-item="diamond"]');
    await expect(row).toContainText('3');
    await shot(page, 'bank-exchange');
    await row.locator('[data-a="sell"]').click();
    await expect(row.locator('.bank-name')).toContainText('2');
    expect(await page.evaluate(() => window.__sc.game.inventory.count('diamond'))).toBe(2);
    await expect.poll(async () => Number((await page.locator('[data-v="cash"]').textContent()).replace(/\D/g, ''))).toBeGreaterThan(coins0 + 50);

    // sell the rest, then buy one back (dearer than it sold)
    await row.locator('[data-a="sellAll"]').click();
    await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('diamond'))).toBe(0);
    await row.locator('[data-a="buy"]').click();
    await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('diamond'))).toBe(1);

    // the bank account
    await page.click('[data-tab="bank"]');
    await page.fill('#bank-amount', '15');
    await page.click('[data-a="deposit"]');
    await expect(page.locator('[data-v="bank"]')).toHaveText('15');
    await expect(page.locator('.bank-h').first()).toContainText('Deposit');
    await shot(page, 'bank-account');

    // the players' market: offer the diamond, then take it back
    await page.click('[data-tab="market"]');
    await page.selectOption('#mk-item', 'diamond');
    await page.fill('#mk-price', '99');
    await page.locator('.market-new button[type=submit]').click();
    const mine = page.locator('.market-list .bank-row', { hasText: 'Your offer' });
    await expect(mine).toHaveCount(1);
    expect(await page.evaluate(() => window.__sc.game.inventory.count('diamond'))).toBe(0);
    await shot(page, 'bank-market');
    await mine.locator('[data-a="cancel"]').click();
    await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('diamond'))).toBe(1);

    // a lottery ticket
    await page.click('[data-tab="lottery"]');
    await page.locator('[data-n="1"]').click();
    await expect(page.locator('[data-v="mine"]')).toHaveText('1 / 10');
    await shot(page, 'bank-lottery');

    // the city: calendar, salary, central bank
    await page.click('[data-tab="central"]');
    await expect(page.locator('.bank-date')).toContainText('year');
    await expect(page.locator('[data-v="salary"]')).toHaveText('0 / 300');
    await expect(page.locator('[data-v="gold"]')).toContainText('gold ingots');
    await expect(page.locator('.bank-stat.wide').last()).toContainText('%');
    await shot(page, 'bank-central');
    // the HUD shows the new balance
    const cash = await page.evaluate(() => window.__sc.ui.game && document.querySelector('[data-v="cash"]').textContent.replace(/\D/g, ''));
    await page.evaluate(() => window.__sc.ui.closeAll());
    await expect(page.locator('.coin-chip .coins')).toHaveText(cash);
    expect(logs).toEqual([]);
  });

  test('a food shop sells ingredients, a restaurant serves a meal, cooking at the workbench', async ({ page, request }) => {
    const HAL = { name: 'Hal', username: 'hal', password: 'hal-pass-1' };
    expect((await request.post('/api/auth/login', { data: ADMIN })).ok()).toBeTruthy();
    expect([201, 409]).toContain((await request.post('/api/admin/users', { data: HAL })).status());
    const logs = watchConsole(page);
    await signIn(page, HAL);
    await page.click('[data-act="new"]');
    await page.fill('#nw-name', 'Hal Town');
    await page.click('[data-act="create"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
    await expect(page.locator('.coin-chip .coins')).toHaveText('20');

    // the market stall
    await page.evaluate(() => window.__sc.game.use({ id: 102, x: 0, y: 0, z: 0 }, null, { x: 0, y: 0, z: 1 }, true));
    await expect(page.locator('[data-screen="foodShop"]')).toBeVisible();
    await expect(page.locator('.food-recipe')).toHaveCount(4);
    for (let i = 1; i <= 3; i++) {
      await page.locator('.bank-row[data-item="tomato"] [data-q="1"]').click();
      await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('tomato'))).toBe(i);
    }
    await page.locator('.bank-row[data-item="olive_oil"] [data-q="1"]').click();
    await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('olive_oil'))).toBe(1);
    await expect(page.locator('[data-v="cash"]')).toHaveText('10');
    await shot(page, 'food-shop');
    // cook gazpacho at the workbench: three tomatoes and olive oil
    await page.evaluate(() => { window.__sc.ui.closeAll(); window.__sc.ui.openInventory(); });
    await expect(page.locator('[data-screen="inventory"]')).toBeVisible();
    // (dispatched: after the shop screens Playwright's pointer lands a row off here)
    await page.locator('.recipe-list [data-recipe="gazpacho"]').dispatchEvent('click');
    await page.locator('[data-result]').dispatchEvent('click');
    await expect.poll(() => page.evaluate(() => window.__sc.game.inventory.count('gazpacho'))).toBe(1);
    expect(await page.evaluate(() => window.__sc.game.inventory.count('tomato'))).toBe(0);

    // the restaurant: full players are not served; hungry ones eat and pay
    await page.evaluate(() => { window.__sc.ui.closeAll(); window.__sc.game.use({ id: 103, x: 0, y: 0, z: 0 }, null, { x: 0, y: 0, z: 1 }, true); });
    await expect(page.locator('[data-screen="restaurant"]')).toBeVisible();
    await page.locator('.bank-row[data-item="churros"] [data-a="eat"]').click();
    await expect(page.locator('[data-screen="restaurant"] .form-error')).toHaveText('You are full.');
    await page.evaluate(() => { window.__sc.game.player.food = 6; });
    await page.locator('.bank-row[data-item="churros"] [data-a="eat"]').click();
    await expect.poll(() => page.evaluate(() => window.__sc.game.player.food)).toBe(12);
    await expect(page.locator('[data-v="cash"]')).toHaveText('2');
    await expect(page.locator('.bank-row[data-item="paella"] [data-a="eat"]')).toBeDisabled();
    await shot(page, 'restaurant');
    expect(logs).toEqual([]);
  });
});
