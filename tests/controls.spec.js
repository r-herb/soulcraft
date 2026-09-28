import { test, expect } from '@playwright/test';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

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
