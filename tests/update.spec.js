import { test, expect } from '@playwright/test';
import { openTitle, watchConsole } from './helpers.js';

// A newer deploy: the game notices /version.json changed and shows the update
// window over the blurred game, with the running and the new version; Update
// reloads the page. The running build's own version shows no window.
test('a newer version on the server opens the update window', async ({ page }) => {
  const problems = watchConsole(page);
  let next = null;
  await page.route('**/version.json', async (route) => {
    if (!next) return route.continue();
    // the new version's changelog: one new entry, then the one this build already has
    const notes = [{ id: 'next-entry', title: { en: 'Brand new things' }, items: { en: ['A shiny new feature', 'A fixed bug'] } }, ...known];
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: next, sha: 'next', notes }) });
  });
  let known = [];
  await openTitle(page);
  const cur = await page.evaluate(async () => (await (await fetch('/version.json', { cache: 'no-store' })).json()));
  const running = cur.version;
  known = cur.notes;
  expect(known.length).toBeGreaterThan(0);
  expect(running).toMatch(/^v\.2\.\d{2}-\d{2}-\d{4}-\d{4}$/);
  await expect(page.locator('[data-screen="title"]')).toContainText(running);
  await page.waitForTimeout(4500);
  await expect(page.locator('.update-modal')).toHaveCount(0);

  // a new deploy: the next check (the tab coming back) finds it
  next = 'v.2.31-12-2099-2359';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.update-modal')).toBeVisible();
  await expect(page.locator('.update-modal [data-v="from"]')).toHaveText(running);
  await expect(page.locator('.update-modal [data-v="to"]')).toHaveText(next);
  expect(await page.locator('.update-modal').evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur');
  // what is new: only the entries this build does not have yet
  await expect(page.locator('.update-notes')).toContainText("What's new");
  await expect(page.locator('.update-notes .un-entry')).toHaveCount(1);
  await expect(page.locator('.update-notes li')).toHaveText(['A shiny new feature', 'A fixed bug']);
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/update-${test.info().project.name}.png` });
  const nav = page.waitForEvent('framenavigated');
  await page.click('.update-modal [data-act="update"]');
  await nav;
  expect(problems).toEqual([]);
});
