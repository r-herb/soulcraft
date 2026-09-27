import { expect } from '@playwright/test';

// Collect console errors/warnings and page errors for a test.
export function watchConsole(page) {
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const text = m.text();
      // headless software GL noise, not from our code
      if (/GPU stall due to ReadPixels|WebGL: CONTEXT_LOST|Automatic fallback to software WebGL|swiftshader/i.test(text)) return;
      problems.push(`${m.type()}: ${text}`);
    }
  });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  return problems;
}

export async function openTitle(page, query = '') {
  await page.addInitScript(() => {
    try { if (!sessionStorage.getItem('sc-test-init')) { localStorage.clear(); sessionStorage.setItem('sc-test-init', '1'); } } catch { /* ignore */ }
  });
  await page.goto('/?nosw=1' + query);
  await expect(page.locator('[data-screen="title"]')).toBeVisible();
}

export async function startNewWorld(page, seed = 'playwright') {
  await page.click('[data-act="new"]');
  await page.fill('#nw-seed', seed);
  await page.click('[data-act="create"]');
  await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 90_000 });
  // let the player settle on the ground
  await page.waitForFunction(() => window.__sc.game.player.onGround, null, { timeout: 20_000 });
}

export const game = (page, fn, arg) => page.evaluate(fn, arg);

// Look down at the ground a couple of blocks in front of the player.
export async function lookDown(page) {
  await page.evaluate(() => { const g = window.__sc.game; g.player.pitch = -0.95; });
  await page.waitForTimeout(300);
  // keep villagers out of the line of sight
  await page.evaluate(() => { const g = window.__sc.game; for (const e of g.entities.list) if (e.villager && e.pos.distanceTo(g.player.pos) < 8) { e.pos.x += 12; e.wanderT = 60; e.target = null; } });
  await page.waitForTimeout(300);
  // clear any plant in the way so we aim at a real block
  for (let i = 0; i < 3; i++) {
    const plant = await page.evaluate(() => { const g = window.__sc.game; const h = g.target; if (h && (h.id === 29 || h.id === 30)) { g.world.setBlock(h.x, h.y, h.z, 0); return true; } return false; });
    if (!plant) break;
    await page.waitForTimeout(300);
  }
}

// Desktop grabs the pointer while playing, so the pause menu is opened
// with Escape there and with the on-screen button on touch devices.
export async function openPause(page, info) {
  if (info.project.name === 'mobile') await page.locator('.hud-btn[data-b="pause"]').click();
  else await page.keyboard.press('Escape');
  await page.locator('[data-screen="pause"]').waitFor();
}

// Hold the break action until the targeted block is gone.
export async function breakTarget(page, info) {
  const target = await page.evaluate(() => { const h = window.__sc.game.target; return h && { x: h.x, y: h.y, z: h.z }; });
  if (!target) return null;
  const gone = () => page.evaluate((tg) => window.__sc.game.world.getBlock(tg.x, tg.y, tg.z) === 0, target);
  if (info.project.name === 'mobile') {
    const b = await page.locator('.act.attack').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 200 && !(await gone()); i++) await page.waitForTimeout(25);
    await page.mouse.up();
  } else {
    await page.evaluate(() => { const i = window.__sc.input; i.attack = true; i.pressed.add('attack'); });
    for (let i = 0; i < 200 && !(await gone()); i++) await page.waitForTimeout(25);
    await page.evaluate(() => { window.__sc.input.attack = false; });
  }
  return target;
}
