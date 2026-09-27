import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// In the Claude Code sandbox a Chromium build is preinstalled here; CI
// installs Playwright's own browsers instead.
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;
const live = process.env.LIVE_URL;
const baseURL = live || process.env.BASE_URL || 'http://localhost:4173';

const launch = { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: launch },
  webServer: live ? undefined : {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: live ? [
    { name: 'live', testMatch: /live\.spec\.js/, use: { ...devices['Desktop Chrome'], launchOptions: launch } },
  ] : [
    {
      name: 'mobile',
      testIgnore: /live\.spec\.js/,
      use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['Pixel 7'].userAgent, launchOptions: launch },
    },
    {
      name: 'desktop',
      testIgnore: /live\.spec\.js/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions: launch },
    },
  ],
});
