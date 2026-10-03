import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// Guides: the first time in Malaga a card opens the city guide; every mission
// has a guide (its steps in order, tips, the reward), opened the first time it
// is followed and from its ? button; the heist's final gets one when the plan
// is whole. And dying with the Gran Diamante sends it back to the vault.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(700); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Guides', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });
  test.setTimeout(180_000);

  test('the city guide, the mission guides, and the diamond lost on death', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await page.click('[data-act="city"]');
    await page.click('[data-screen="cityIntro"] [data-seg="mode"] [data-v="survival"]');
    await page.click('[data-screen="cityIntro"] [data-act="start"]');
    await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
    await page.evaluate(() => { window.__sc.game.player.god = true; });

    // the first arrival: a card that opens the city guide
    const card = page.locator('.guide-card');
    await expect(card).toContainText('Welcome to Malaga');
    await shot(page, 'guide-card');
    // (the mouse is captured in the game on a computer: J opens the card's guide)
    await page.keyboard.press('KeyJ');
    const city = page.locator('[data-screen="cityGuide"]');
    await expect(city).toBeVisible();
    await expect(city.locator('.guide-part')).toHaveCount(9);
    await shot(page, 'guide-city');
    // off to the first mission: its guide, every step and tips
    await city.locator('[data-act="start"]').click();
    const help = page.locator('[data-screen="missionHelp"]');
    await expect(help).toContainText('The tourist route');
    await expect(help.locator('.guide-steps li')).toHaveCount(5);
    // the player starts on Plaza de la Constitución: that step is ticked off, the Cathedral is next
    await expect(help.locator('.guide-steps li.done')).toHaveCount(1);
    await expect(help.locator('.guide-steps li.now')).toContainText('Catedral');
    await expect(help.locator('.guide-tips li')).toHaveCount(3);
    await shot(page, 'guide-tour');
    await help.locator('[data-act="ok"]').click();
    await expect(help).toHaveCount(0);
    expect(await page.evaluate(() => window.__sc.game.profile.guidesSeen)).toMatchObject({ city: true, 'm:tour': true });

    // the ? of any mission opens its guide
    await page.evaluate(() => window.__sc.ui.open('missions'));
    await page.locator('.mis-card[data-id="bus"] [data-a="help"]').click();
    await expect(help).toContainText('A ride to the beach');
    await expect(help.locator('.guide-steps li')).toHaveCount(3);
    await help.locator('[data-act="close"]').click();
    // following a mission the first time opens its guide
    await page.locator('.mis-card[data-id="paella"] [data-a="track"]').click();
    await expect(help).toContainText('The paella master');
    await expect(help.locator('.guide-tips li')).toHaveCount(3);
    await help.locator('[data-act="ok"]').click();
    expect(await page.evaluate(() => window.__sc.game.missions.tracked.id)).toBe('paella');
    // not the second time
    await page.locator('.mis-card[data-id="critic"] [data-a="track"]').click();
    await expect(help).toContainText('Restaurant critic');
    await help.locator('[data-act="ok"]').click();
    await page.locator('.mis-card[data-id="paella"] [data-a="track"]').click();
    await page.waitForTimeout(300);
    await expect(help).toHaveCount(0);
    expect(await page.evaluate(() => window.__sc.game.missions.tracked.id)).toBe('paella');
    await page.evaluate(() => window.__sc.ui.closeAll());

    // the plan put together: a card for the final mission's guide
    await page.evaluate(() => { const H = window.__sc.game.heist, s = H.state(); s.got = [...s.tasks]; for (const k of s.tasks) H.place(k, s.slots[k]); });
    await expect(card).toContainText('The heist');
    await page.keyboard.press('KeyJ');
    await expect(help.locator('.guide-steps li')).toHaveCount(3);
    await expect(help.locator('.guide-tips li')).toHaveCount(5);
    await expect(help).toContainText('weak wall');
    await shot(page, 'guide-final');
    await help.locator('[data-act="ok"]').click();

    // the diamond taken, then death: it goes back on its pedestal
    await page.evaluate(async () => {
      const g = window.__sc.game, q = g.missions.placeXZ('Banco de España');
      await g.city.ensure(q.x, q.z, 64);
      g.player.pos.set(q.x, 126, q.z); await g.ensureLoaded(); g.placeOnGround();
    });
    await page.waitForFunction(() => !!window.__sc.game.heist.plan(), null, { timeout: 60_000 });
    const r = await page.evaluate(async () => {
      const g = window.__sc.game, H = g.heist, s = H.state(), pl = H.plan();
      const q = window.__sc.bank.point(pl.P, pl.diamond, pl.mid), y = pl.P.base + 2;
      g.player.pos.set(q.x + 0.5, y + 1, q.z - 1.5); await g.ensureLoaded();
      H.takeDiamond({ x: q.x, y, z: q.z });
      const had = g.inventory.count('grand_diamond'), step = g.missions.prog('heist').step;
      g.player.god = false; g.player.invuln = 0;
      g.damagePlayer(999, 'guard');
      return { had, step, after: g.inventory.count('grand_diamond'), robbed: s.robbed, back: g.world.getBlock(q.x, y, q.z) === window.__sc.B.grand_diamond, dead: g.player.dead, stepAfter: g.missions.prog('heist').step };
    });
    expect(r).toEqual({ had: 1, step: 1, after: 0, robbed: false, back: true, dead: true, stepAfter: 0 });
    await expect(page.locator('.toast', { hasText: 'took it back to the vault' })).toBeVisible();
    expect(problems).toEqual([]);
  });
});
