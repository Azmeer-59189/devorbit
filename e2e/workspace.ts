import {expect, type Page} from '@playwright/test';
import {apiResponse} from './fixtures';

const session = {
  access_token: 'e2e-access-token',
  refresh_token: 'e2e-refresh-token',
  token_type: 'bearer',
  expires_in: 31536000,
  expires_at: Math.floor(Date.now() / 1000) + 31536000,
  user: {id: '00000000-0000-4000-8000-000000000001', email: 'azmeer@example.com', aud: 'authenticated'},
};

/**
 * Opens a workspace page signed in as the test administrator. The browser reads a
 * stored session, whatever the Supabase project, and every /api call is answered
 * from fixtures, so nothing reaches Supabase. Returns uncaught page errors.
 */
export async function openWorkspace(page: Page, path: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(stored => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      return /^sb-.+-auth-token$/.test(key) ? stored : getItem.call(this, key);
    };
  }, JSON.stringify(session));
  await page.route(/\.supabase\.co\//, route => route.abort());
  await page.route('**/api/**', route => route.fulfill({json: apiResponse(new URL(route.request().url()))}));
  await page.goto(path);
  await expect(page.locator('main h1')).toBeVisible();
  return errors;
}

/** Fails when anything on the page is wider than the window, which zooms phones out. */
export async function expectNoHorizontalOverflow(page: Page) {
  const {scrollWidth, innerWidth} = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, 'page is wider than the window').toBeLessThanOrEqual(innerWidth);
}
