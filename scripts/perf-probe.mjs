// Rough frame-rate probe for a weak phone: a landscape phone viewport at
// DPR 3, software WebGL, and the CPU slowed down with DevTools throttling.
// Starts a new world, walks and turns for a while, and prints the frame
// rate and frame time. Needs `npm run build && npm run preview` running.
//   node scripts/perf-probe.mjs [cpuSlowdown=4] [seconds=20] [query]
import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';

const slow = Number(process.argv[2] || 4);
const seconds = Number(process.argv[3] || 20);
const query = process.argv[4] || '';
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  executablePath: existsSync(local) ? local : undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto('http://localhost:4173/?nosw=1' + query);
await page.waitForSelector('[data-screen="title"]');
await page.click('[data-act="new"]');
await page.fill('#nw-seed', 'perf');
await page.click('[data-act="create"]');
await page.waitForFunction(() => window.__sc && window.__sc.game.running && !document.querySelector('[data-screen="loading"]'), null, { timeout: 120_000 });
await page.waitForTimeout(3000);
if (process.env.PR) await page.evaluate((pr) => { const g = window.__sc.game; g.renderer.setPixelRatio(pr); g.resize(); }, Number(process.env.PR));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: slow });
const res = await page.evaluate(async (secs) => {
  const g = window.__sc.game, input = window.__sc.input;
  const times = [];
  let last = performance.now(), run = true;
  const tick = (t) => { times.push(t - last); last = t; if (run) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const t0 = performance.now();
  while (performance.now() - t0 < secs * 1000) {
    input.move.z = 1; g.player.yaw += 0.02;
    await new Promise((r) => setTimeout(r, 50));
  }
  run = false; input.move.z = 0;
  times.shift();
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  return {
    fps: +(1000 / avg).toFixed(1),
    p50: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
    p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    pixelRatio: g.renderer.getPixelRatio(),
    drawCalls: g.renderer.info.render.calls,
    triangles: g.renderer.info.render.triangles,
    quality: g.quality ? { ...g.quality } : null,
  };
}, seconds);
console.log(JSON.stringify({ cpuSlowdown: slow, ...res }));
await browser.close();
