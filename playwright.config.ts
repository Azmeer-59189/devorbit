import {defineConfig} from '@playwright/test';

const port = 3100;
const ci = !!process.env.CI;

// Browser tests run against a production build with mocked API responses (see e2e/).
// CI builds in an earlier step; locally the server builds first unless one is running.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    // Locally, use the installed Chrome instead of downloading a browser.
    ...(ci ? {} : {channel: 'chrome'}),
  },
  projects: [
    {name: 'desktop', use: {viewport: {width: 1440, height: 900}}},
    {name: 'phone', use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}},
  ],
  webServer: {
    command: `${ci ? '' : 'npm run build && '}npx next start --hostname 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/login`,
    timeout: 300_000,
    reuseExistingServer: !ci,
  },
});
