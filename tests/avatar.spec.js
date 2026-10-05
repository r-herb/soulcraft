import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Roblox-style avatars: the 3D avatar is unlocked with soul crystals (or by
// any achievement), dressed in the wardrobe (items for crystals, the best
// ones only from achievements), seen in the third-person views, with emotes,
// and sent to the other players as a short 'av:' string.
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(800); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

test.describe('Avatar', () => {
  test.setTimeout(180_000);

  test('unlock, dress up, achievements, third person and emotes', async ({ page }, info) => {
    const desktop = info.project.name === 'desktop';
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'avatarworld');
    const prof = () => page.evaluate(() => { const p = window.__sc.app.profile; return { crystals: p.crystals, avatar: p.avatar, owned: p.avOwned, skin: window.__sc.game.selfFig.skin }; });

    // the shop's avatar tab opens the wardrobe, locked at first
    await page.evaluate(() => { window.__sc.app.profile.crystals = 400; window.__sc.ui.open('shop'); });
    await page.click('[data-screen="shop"] [data-tab="avatar"]');
    const W = page.locator('[data-screen="wardrobe"]');
    await expect(W).toBeVisible();
    await expect(W.locator('.wd-act')).toContainText('150');
    await expect(W.locator('.wd-toggle')).toBeDisabled();
    await shot(page, 'avatar-locked');

    // unlock it for 150 crystals: worn at once
    await W.locator('.wd-act').click();
    await expect.poll(async () => (await prof()).crystals).toBe(250);
    let p = await prof();
    expect(p.avatar.unlocked).toBe(true);
    expect(p.avatar.on).toBe(true);
    expect(p.skin.startsWith('av:')).toBe(true);
    await expect(W.locator('.wd-toggle')).toBeChecked();

    // free hair is worn on a tap; the thumbnails are drawn
    await W.locator('[data-tab="hair"]').click();
    await W.locator('[data-item="hair:long"]').click();
    await expect.poll(async () => (await prof()).avatar.cfg.hair).toBe('long');
    const drawn = await W.locator('[data-item="hair:afro"] canvas').evaluate((c) => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
    expect(drawn).toBeGreaterThan(100);
    // a hair color
    await W.locator('.wd-sw').nth(0).click();
    await expect.poll(async () => (await prof()).avatar.cfg.hairC).toBe(0);

    // a hat for crystals: tried on first, then bought
    await W.locator('[data-tab="hat"]').click();
    await W.locator('[data-item="hat:tophat"]').click();
    await expect(W.locator('.wd-act')).toContainText('60');
    expect((await prof()).avatar.cfg.hat).toBe('none');
    await W.locator('.wd-act').click();
    await expect.poll(async () => (await prof()).crystals).toBe(190);
    p = await prof();
    expect(p.owned).toContain('hat:tophat');
    expect(p.avatar.cfg.hat).toBe('tophat');
    await shot(page, 'avatar-wardrobe');

    // the mayor's crown: only from the achievement, it cannot be bought
    await W.locator('[data-item="hat:crown"]').click();
    await expect(W.locator('.wd-act')).toBeHidden();
    await expect(W.locator('.wd-hint')).not.toBeEmpty();
    // leaving the tab takes off what was only tried on
    await W.locator('[data-tab="ach"]').click();
    await expect(W.locator('.wd-ach-row')).toHaveCount(11);
    await expect(W.locator('.wd-ach-row.done')).toHaveCount(0);

    // becoming mayor (and robbing the bank) unlocks their items, announced once
    await page.evaluate(() => { const p = window.__sc.app.profile; p.mayorAt = Date.now(); p.heist = { robbed: true }; window.__sc.game.noteProgress(); });
    expect(await page.evaluate(() => window.__sc.app.profile.achSeen)).toEqual(expect.arrayContaining(['mayor', 'heist']));
    await W.locator('[data-tab="hat"]').click();
    await W.locator('[data-tab="ach"]').click();
    await expect(W.locator('.wd-ach-row.done')).toHaveCount(2);
    await W.locator('[data-tab="hat"]').click();
    await W.locator('[data-item="hat:crown"]').click();
    await W.locator('[data-tab="top"]').click();
    await W.locator('[data-item="top:suit"]').click();
    await W.locator('[data-tab="glasses"]').click();
    await W.locator('[data-item="glasses:mask"]').click();
    await W.locator('[data-tab="back"]').click();
    await W.locator('[data-item="back:cape"]').click();
    await W.locator('.wd-act').click();
    p = await prof();
    expect(p.avatar.cfg).toMatchObject({ hat: 'crown', top: 'suit', glasses: 'mask', back: 'cape' });
    expect(p.crystals).toBe(110);
    // the look travels as one short string, the same one the figure wears
    expect(p.skin).toMatch(/^av:[0-9a-z]{11}$/);
    await shot(page, 'avatar-mayor');

    // the classic skin can come back; then the avatar again
    await W.locator('.wd-toggle').uncheck();
    await expect.poll(async () => (await prof()).skin).toBe('wanderer');
    await W.locator('.wd-toggle').check();
    await expect.poll(async () => (await prof()).skin.startsWith('av:')).toBe(true);
    await W.locator('[data-act="close"]').click();
    await page.evaluate(() => window.__sc.ui.closeAll());

    // the third-person views show the player's own avatar
    await page.evaluate(() => window.__sc.game.cycleView());
    await page.waitForFunction(() => window.__sc.game.selfFig.object.visible && !window.__sc.game.held.group.visible, null, { timeout: 10_000 });
    const view = await page.evaluate(() => { const g = window.__sc.game; return { third: g.thirdPerson, vis: g.selfFig.object.visible, avatar: !!g.selfFig.rig.avatar, held: g.held.group.visible, camD: g.camera.position.distanceTo(g.player.eye) }; });
    expect(view).toMatchObject({ third: 1, vis: true, avatar: true, held: false });
    expect(view.camD).toBeGreaterThan(0.5);
    await shot(page, 'avatar-third-back');

    // emotes: from the picker (G on a keyboard, the smiley button on touch)
    if (desktop) await page.keyboard.press('KeyG');
    else await page.locator('.hud-btn[data-b="emote"]').click();
    await page.locator('[data-screen="emotes"] [data-emote="dance"]').click();
    expect(await page.evaluate(() => window.__sc.game.emote && window.__sc.game.emote.id)).toBe('dance');
    await page.evaluate(() => window.__sc.game.cycleView());
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__sc.game.thirdPerson)).toBe(2);
    await shot(page, 'avatar-third-front-dance');
    // back to first person
    await page.evaluate(() => window.__sc.game.cycleView());
    await page.waitForFunction(() => !window.__sc.game.selfFig.object.visible && window.__sc.game.held.group.visible, null, { timeout: 10_000 });

    expect(problems).toEqual([]);
  });
});
