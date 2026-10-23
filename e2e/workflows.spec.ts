import {expect, test} from '@playwright/test';
import {openWorkspace} from './workspace';
import {websites} from './fixtures';

test('dashboard summary tiles open the matching task list', async ({page}) => {
  await openWorkspace(page, '/workspace');
  await page.getByRole('button', {name: /^Overdue: 2/}).click();
  await expect(page).toHaveURL(/\/workspace\/tasks\?.*overdue=true/);
  await expect(page.locator('main h1')).toHaveText('Tasks');
});

test('task list shows due-date hints and switches to the board', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  const row = page.getByRole('row', {name: /Fix broken hreflang tags/});
  await expect(row).toContainText('2 days overdue');
  await expect(row.locator('.badge')).toHaveText('In Progress');

  const list = page.getByRole('button', {name: 'List', exact: true});
  const board = page.getByRole('button', {name: 'Kanban', exact: true});
  await expect(list).toHaveAttribute('aria-pressed', 'true');
  await board.click();
  await expect(board).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', {name: 'In Progress column'})).toContainText('Fix broken hreflang tags');
});

test('SEO list filters from a summary tile and sorts by score', async ({page}) => {
  await openWorkspace(page, '/workspace/reports');
  const rows = page.locator('.website-comparison tbody tr');
  await expect(rows).toHaveCount(6);

  const unaudited = page.getByRole('button', {name: /Not yet audited/});
  await unaudited.click();
  await expect(unaudited).toHaveAttribute('aria-pressed', 'true');
  await expect(rows).toHaveCount(3);
  await unaudited.click();
  await expect(rows).toHaveCount(6);

  const score = page.getByRole('button', {name: /^SEO Rating/});
  await score.click();
  await score.click();
  await expect(page.getByRole('columnheader', {name: /SEO Rating/})).toHaveAttribute('aria-sort', 'descending');
  await expect(rows.first()).toContainText('CRD United Kingdom');
  await expect(rows.first()).toContainText('92/100');
});

test('Website features groups narrow the table to one section', async ({page}) => {
  await openWorkspace(page, '/workspace/website-features');
  const social = page.getByRole('button', {name: /^Social media/});
  await social.click();
  await expect(social).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.website-comparison thead th')).toHaveCount(6);
});

test('edit view counts unsaved changes and discards them', async ({page}) => {
  await openWorkspace(page, `/workspace/website-features?website=${websites[0].id}`);
  await expect(page.locator('.breadcrumb')).toContainText(websites[0].name);
  const bar = page.locator('.form-savebar');
  await expect(bar).toContainText('No unsaved changes');
  await expect(bar.getByRole('button', {name: 'Save features'})).toBeDisabled();

  await page.getByRole('combobox', {name: /^Blogs/}).selectOption('yes');
  await expect(bar).toContainText('1 unsaved change');
  await bar.getByRole('button', {name: 'Discard'}).click();
  await expect(bar).toContainText('No unsaved changes');
  await expect(page.getByRole('combobox', {name: /^Blogs/})).toHaveValue('unknown');
});

test('moving a card to Blocked asks for a reason in an in-app dialog', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  const posts: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.getByRole('button', {name: 'Kanban', exact: true}).click();
  await page.getByRole('combobox', {name: 'Move Fix broken hreflang tags'}).selectOption('blocked');

  const dialog = page.getByRole('alertdialog', {name: 'Why is this task blocked?'});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', {name: 'Mark blocked'})).toBeDisabled();
  await dialog.getByRole('textbox', {name: 'Blocker'}).fill('Waiting on DNS access');
  await expect(dialog.getByRole('button', {name: 'Mark blocked'})).toBeEnabled();
  await dialog.getByRole('button', {name: 'Cancel'}).click();
  await expect(dialog).toBeHidden();
  expect(posts).toEqual([]);
});

test('Escape closes only the newest dialog', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  await page.locator('main').getByRole('button', {name: 'Create task'}).click();
  const form = page.getByRole('dialog', {name: 'Create a task'});
  await form.locator('input[name="title"]').fill('Draft task');
  await page.keyboard.press('Escape');

  const discard = page.getByRole('alertdialog', {name: 'Discard unsaved changes?'});
  await expect(discard).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(discard).toBeHidden();
  await expect(form).toBeVisible();
  await expect(form.locator('input[name="title"]')).toHaveValue('Draft task');
});

test('recording a different score for an existing audit asks for a reason', async ({page}) => {
  await openWorkspace(page, `/workspace/reports?website=${websites[0].id}`);
  await expect(page.getByRole('spinbutton', {name: /SEO Rating/})).toHaveValue('92');
  await expect(page.getByRole('spinbutton', {name: /SEO Rating/})).toHaveAttribute('readonly', '');

  await page.getByRole('button', {name: 'Record audit'}).click();
  const dialog = page.getByRole('dialog', {name: 'Record an SEO audit'});
  await dialog.getByRole('spinbutton', {name: 'Score (0–100)'}).fill('88');
  await expect(dialog).toContainText('This corrects the 92/100 audit');
  const save = dialog.getByRole('button', {name: 'Save correction'});
  await expect(save).toBeDisabled();
  await dialog.getByRole('textbox', {name: 'Reason for the correction'}).fill('Re-ran after cache purge');

  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/seo-health'));
  await save.click();
  const body = (await request).postDataJSON();
  expect(body.fields.seo_score).toBe(88);
  expect(body.source).toBe('PageSpeed Insights');
  expect(body.reason).toBe('Re-ran after cache purge');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status').filter({hasText: 'Audit recorded: 88/100'})).toBeVisible();
});

test('saving the SEO form re-sends the latest audit unchanged', async ({page}) => {
  await openWorkspace(page, `/workspace/reports?website=${websites[0].id}`);
  await page.getByRole('combobox', {name: /^Google Analytics/}).selectOption('no');
  await expect(page.getByRole('button', {name: 'Record audit'})).toBeDisabled();

  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/seo-health'));
  await page.getByRole('button', {name: 'Save SEO'}).click();
  const body = (await request).postDataJSON();
  expect(body.fields.google_analytics).toBe('no');
  expect(body.fields.seo_score).toBe(92);
  expect(body.source).toBe('PageSpeed Insights');
  expect(body.reason).toBe('');
});
