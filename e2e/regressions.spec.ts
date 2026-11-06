import {expect, test} from '@playwright/test';
import {openWorkspace} from './workspace';
import {apiResponse, tasks, websites} from './fixtures';

test('task discard confirmation is above the drawer, traps focus, cancels and discards independently', async ({
  page,
}) => {
  await openWorkspace(page, '/workspace/tasks');
  await page.getByRole('button', {name: tasks[0].title, exact: true}).click();
  const drawer = page.getByRole('dialog', {name: tasks[0].title, exact: true});
  const comment = drawer.getByRole('textbox', {name: 'Add a comment'});
  await comment.fill('TEST unsaved comment');
  await page.keyboard.press('Escape');
  const confirmation = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  const cancel = confirmation.getByRole('button', {name: 'Cancel', exact: true});
  const discard = confirmation.getByRole('button', {name: 'Discard', exact: true});
  await expect(cancel).toBeFocused();
  await expect(confirmation).toBeVisible();
  expect(
    await confirmation.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    }),
  ).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await expect(discard).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
  await comment.evaluate(el => (el as HTMLElement).focus());
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(confirmation).toHaveCount(0);
  await expect(comment).toHaveValue('TEST unsaved comment');
  await expect(comment).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(comment).toHaveValue('TEST unsaved comment');
  await page.keyboard.press('Escape');
  await discard.click();
  await expect(drawer).toHaveCount(0);
  await page.getByRole('button', {name: tasks[0].title, exact: true}).click();
  await expect(page.getByRole('textbox', {name: 'Add a comment'})).toHaveValue('');
});

test('saved health review refreshes SEO and the website overview using the same scope', async ({page}) => {
  const id = websites[0].id;
  await openWorkspace(page, `/workspace/reports?website=${id}`);
  let saved = false;
  await page.route('**/api/seo-health**', async route => {
    if (new URL(route.request().url()).pathname !== '/api/seo-health') return route.fallback();
    if (route.request().method() === 'POST') {
      saved = true;
      return route.fulfill({json: {id: 'TEST-review'}});
    }
    const catalog = apiResponse(new URL(route.request().url())) as {websites: {fields: Record<string, unknown>}[]};
    const result = structuredClone(catalog);
    result.websites[0].fields = saved
      ? {seo_implementation: 'yes', google_analytics: 'unknown', page_seconds: 0, ssl: 'no'}
      : {seo_implementation: 'unknown', google_analytics: 'unknown'};
    return route.fulfill({json: result});
  });
  await page.getByRole('button', {name: 'Reload latest', exact: true}).click();
  await page.getByRole('combobox', {name: /^SEO Implementation/}).selectOption('yes');
  await page.getByRole('button', {name: 'Save SEO', exact: true}).click();
  await expect(page.getByText('4 of 5 fields recorded', {exact: true})).toBeVisible();
  await page.goto(`/workspace/websites/${id}`);
  await expect(page.locator('.website-overview')).toContainText('SEO & performance: 0 checklist issues');
  await expect(page.locator('.website-overview')).toContainText('1 fields not recorded');
  await page.getByRole('button', {name: 'Reload latest', exact: true}).click();
  await expect(page.locator('.website-overview')).toContainText('1 fields not recorded');
});
