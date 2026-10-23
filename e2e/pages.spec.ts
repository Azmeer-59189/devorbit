import {expect, test} from '@playwright/test';
import {expectNoHorizontalOverflow, openWorkspace} from './workspace';
import {websites} from './fixtures';

// Every page renders without uncaught errors and fits the window at desktop and phone width.
const pages: [string, string][] = [
  ['/workspace', 'Welcome, Azmeer!'],
  ['/workspace/tasks', 'Tasks'],
  ['/workspace/my-tasks', 'My tasks'],
  ['/workspace/websites', 'Websites'],
  [`/workspace/websites/${websites[0].id}`, 'Websites'],
  ['/workspace/reports', 'SEO'],
  [`/workspace/reports?website=${websites[0].id}`, 'SEO'],
  ['/workspace/website-features', 'Website features'],
  [`/workspace/website-features?website=${websites[0].id}`, 'Website features'],
  ['/workspace/team', 'Team'],
  ['/workspace/notifications', 'Notifications'],
  ['/workspace/account', 'Account'],
];

for (const [path, heading] of pages) {
  test(`${path} renders and fits the window`, async ({page}) => {
    const errors = await openWorkspace(page, path);
    await expect(page.locator('main h1')).toHaveText(heading);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
  });
}

test('sign-in page renders and fits the window', async ({page}) => {
  await page.goto('/login');
  await expect(page.getByRole('button', {name: /sign in/i})).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
