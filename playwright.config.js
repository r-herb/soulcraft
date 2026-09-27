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
const withApi = !process.env.NO_API && !(/(quest|bosses)\.spec/.test(args) && !/accounts/.test(args));

const launch = { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };

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
      // the accounts API: Pages Functions + a throwaway local D1 database
      command: 'rm -rf .wrangler/test-state && npx wrangler d1 migrations apply soulcraft --local --persist-to .wrangler/test-state && npx wrangler pages dev dist --port 8788 --persist-to .wrangler/test-state --binding SUPERADMIN_LOGIN=admin --binding SUPERADMIN_PASSWORD=admin-pass-123',
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
      testMatch: /accounts\.spec\.js/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:8788', viewport: { width: 1280, height: 720 }, launchOptions: launch },
    },
    {
      name: 'mobile',
      testIgnore: /(live|accounts)\.spec\.js/,
      use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent, launchOptions: launch },
    },
    {
      name: 'desktop',
      testIgnore: /(live|accounts)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions: launch },
    },
  ],
});
