import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// In the Claude Code sandbox a Chromium build is preinstalled here; CI
// installs Playwright's own browsers instead.
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;
const live = process.env.LIVE_URL;
const baseURL = live || process.env.BASE_URL || 'http://localhost:4173';

// The accounts API server (wrangler + workerd) costs CPU, and the quest and
// boss bots time their jumps against the frame rate, so runs that only
// target those long playthroughs (or set NO_API=1) leave it out.
const args = process.argv.slice(2).join(' ');
const withApi = !process.env.NO_API && !(/(quest2?|bosses)\.spec/.test(args) && !/accounts/.test(args));

// wrangler's two local servers reach each other over localhost; a sandbox
// HTTP proxy in the environment breaks that, so they run without it
const noProxy = 'env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy ';

const launch = { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, actionTimeout: 15_000, navigationTimeout: 60_000, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: launch },
  webServer: live ? undefined : [
    {
      command: 'npm run preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    withApi && {
      // multiplayer rooms: the Durable Object Worker, found by the Pages
      // server below through wrangler's local dev registry (an entry left
      // by an earlier run that was killed would point at a dead port)
      command: 'rm -f "$HOME/.config/.wrangler/registry/soulcraft-mp" && ' + noProxy + 'npx wrangler dev --config mp/wrangler.toml --port 8790 --persist-to .wrangler/test-mp',
      url: 'http://localhost:8790',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_ACCOUNT_ID: 'local' },
    },
    withApi && {
      // the accounts API: Pages Functions + a throwaway local D1 database
      command: 'rm -rf .wrangler/test-state && npx wrangler d1 migrations apply soulcraft --local --persist-to .wrangler/test-state && ' + noProxy + 'npx wrangler pages dev dist --port 8788 --persist-to .wrangler/test-state --binding SUPERADMIN_LOGIN=admin --binding SUPERADMIN_PASSWORD=admin-pass-123 --binding MAIL_TEST=1 --binding TEST_CLOCK=1 --binding PUSH_TEST=1 --do ROOMS=Room@soulcraft-mp',
      url: 'http://localhost:8788',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_ACCOUNT_ID: 'local' },
    },
  ].filter(Boolean),
  projects: live ? [
    { name: 'live', testMatch: /live\.spec\.js/, use: { ...devices['Desktop Chrome'], launchOptions: launch } },
  ] : [
    {
      name: 'accounts',
      testMatch: /(accounts|multiplayer|friends|chat|call|econ)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8788', viewport: { width: 1280, height: 720 }, launchOptions: launch },
    },
    {
      name: 'mobile',
      testIgnore: /(live|accounts|multiplayer|friends|chat|call|econ)\.spec\.js/,
      use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent, launchOptions: launch },
    },
    {
      name: 'desktop',
      testIgnore: /(live|accounts|multiplayer|friends|chat|call|econ)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions: launch },
    },
  ],
});
