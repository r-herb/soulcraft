import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openTitle, startNewWorld, watchConsole } from './helpers.js';

// Four languages: English, Russian, Spanish and Latvian.
const dict = (l) => JSON.parse(readFileSync(new URL(`../src/i18n/${l}.json`, import.meta.url), 'utf8'));
const EN = dict('en');
const OTHERS = ['ru', 'es', 'lv'];
const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join();

// every screen whose buttons must fit their text
async function overflowing(page, sel) {
  return page.locator(sel).evaluateAll((els) => els.filter((b) => b.offsetParent && b.scrollWidth > b.clientWidth + 2).map((b) => b.textContent.trim()));
}

test.describe('Languages', () => {
  test('every language has every text, with the same placeholders and no long dashes', () => {
    for (const l of OTHERS) {
      const d = dict(l);
      expect(Object.keys(d).sort(), l).toEqual(Object.keys(EN).sort());
      for (const [k, v] of Object.entries(EN)) {
        expect(placeholders(d[k]), `${l} ${k}`).toBe(placeholders(v));
        expect(/[–—]/.test(d[k]), `${l} ${k} has a long dash`).toBe(false);
      }
    }
  });

  for (const l of OTHERS) {
    test(`${l.toUpperCase()}: the title, inventory, pause and settings are translated and fit`, async ({ page }) => {
      const problems = watchConsole(page);
      const d = dict(l);
      await openTitle(page);
      await page.click(`[data-lang="${l}"]`);
      await expect(page.locator('[data-act="new"]')).toHaveText(d['title.new']);
      await expect(page.locator('html')).toHaveAttribute('lang', l);
      expect(await overflowing(page, '[data-screen="title"] .btn')).toEqual([]);
      await startNewWorld(page, 'lang-' + l);
      await page.evaluate(() => window.__sc.ui.openInventory());
      await expect(page.locator('[data-screen="inventory"] .panel-title')).toHaveText(d['inv.title']);
      const inv = await page.evaluate(() => { const p = document.querySelector('.inv-panel'); return p.scrollWidth - p.clientWidth; });
      expect(inv).toBeLessThanOrEqual(2);
      await page.evaluate(() => window.__sc.ui.closeAll());
      await page.evaluate(() => window.__sc.ui.openPause());
      expect(await overflowing(page, '[data-screen="pause"] .btn')).toEqual([]);
      await page.locator('[data-screen="pause"] [data-act="settings"]').click();
      await expect(page.locator('[data-screen="settings"] .panel-title')).toHaveText(d['settings.title']);
      expect(await overflowing(page, '[data-screen="settings"] button')).toEqual([]);
      // the language is kept after a reload
      await page.evaluate(() => window.__sc.app.quitToTitle());
      await page.reload();
      await expect(page.locator('[data-act="new"]')).toHaveText(d['title.new']);
      expect(problems).toEqual([]);
    });
  }

  test('the browser language picks the game language', async ({ browser }) => {
    for (const [locale, l] of [['lv-LV', 'lv'], ['es-ES', 'es'], ['de-DE', 'en']]) {
      const ctx = await browser.newContext({ locale });
      const page = await ctx.newPage();
      await page.goto('/?nosw=1');
      await expect(page.locator('[data-act="new"]')).toHaveText(dict(l)['title.new']);
      await ctx.close();
    }
  });
});
