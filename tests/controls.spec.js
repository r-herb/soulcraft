import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// SHOTS=dir saves screenshots for a visual check
const shot = async (page, name) => { if (!process.env.SHOTS) return; await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` }); };

// A Windows laptop with a touch screen can look like a tablet to the
// browser. On "auto" the controls follow what the player really uses: a
// mouse click or WASD switches to mouse and keyboard, a finger back to touch.
test.describe('Controls follow the input device', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });

  test('a mouse click switches touch controls to mouse and keyboard', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'controls');
    // pretend the browser guessed "touch"
    await page.evaluate(() => { window.__sc.input.setTouchMode(true); window.__sc.ui.closeAll(); });
    await expect(page.locator('body')).toHaveClass(/\btouch\b/);
    await page.mouse.click(640, 360);
    await expect(page.locator('body')).not.toHaveClass(/\btouch\b/);
    expect(await page.evaluate(() => window.__sc.input.touchMode)).toBe(false);
    // WASD does the same
    await page.evaluate(() => { window.__sc.input.setTouchMode(true); window.__sc.ui.closeAll(); });
    await page.keyboard.down('KeyW');
    await page.keyboard.up('KeyW');
    expect(await page.evaluate(() => window.__sc.input.touchMode)).toBe(false);
    // the Settings choice wins over the guess
    await page.evaluate(() => window.__sc.setSetting('controls', 'touch'));
    await page.mouse.click(640, 360);
    expect(await page.evaluate(() => window.__sc.input.touchMode)).toBe(true);
    await page.evaluate(() => window.__sc.setSetting('controls', 'auto'));
    expect(problems).toEqual([]);
  });
});

test.describe('Mouse, trackpad and help', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop', 'desktop only'); });

  test('one trackpad swipe changes one item; the ? button replays the tutorial', async ({ page }) => {
    const problems = watchConsole(page);
    await openTitle(page);
    await startNewWorld(page, 'trackpad');
    // pretend the pointer is captured (headless Chrome may not grant it)
    await page.evaluate(() => { const i = window.__sc.input; i.pointerLocked = true; window.__sc.ui.closeAll(); window.__sc.game.selectSlot(0); });
    // a trackpad swipe: many small events, with momentum
    await page.evaluate(() => {
      // 40 events about 12 ms apart, like a real swipe (busy-wait: the
      // headless renderer is too slow for timers this short)
      for (let i = 0; i < 40; i++) {
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: 6, deltaMode: 0 }));
        const t = performance.now(); while (performance.now() - t < 12) { /* wait */ }
      }
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__sc.game.inventory.selected)).toBe(1);
    // mouse wheel notches: one item each
    await page.waitForTimeout(250);
    await page.evaluate(async () => {
      for (let i = 0; i < 2; i++) { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0 })); await new Promise((r) => setTimeout(r, 120)); }
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__sc.game.inventory.selected)).toBe(3);
    // arrow keys turn the view
    const yaw0 = await page.evaluate(() => window.__sc.game.player.yaw);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(400);
    await page.keyboard.up('ArrowRight');
    expect(await page.evaluate(() => window.__sc.game.player.yaw)).not.toBeCloseTo(yaw0, 2);
    // the ? button: how to play, and the tutorial from the start
    // (with the pointer captured, clicks go to the game, as in Minecraft: H opens the help)
    await page.keyboard.press('KeyH');
    await expect(page.locator('[data-screen="help"] .help-list dt').first()).toHaveText('Click');
    await shot(page, 'help-desktop');
    if (process.env.SHOTS) {
      await page.evaluate(() => { window.__sc.input.setTouchMode(true); window.__sc.ui.render(); });
      await page.setViewportSize({ width: 844, height: 390 });
      await shot(page, 'help-phone');
      await page.evaluate(() => window.__sc.ui.closeAll());
      await shot(page, 'hud-phone');
      await page.evaluate(() => { window.__sc.input.setTouchMode(false); window.__sc.ui.open('help'); });
      await page.setViewportSize({ width: 1280, height: 720 });
    }
    await page.click('[data-screen="help"] [data-act="replay"]');
    await expect(page.locator('[data-screen="help"]')).toHaveCount(0);
    await expect(page.locator('.tut-slot')).toContainText('W A S D');
    expect(problems).toEqual([]);
  });
});
