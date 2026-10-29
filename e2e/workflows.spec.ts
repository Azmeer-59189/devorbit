import {expect, test} from '@playwright/test';
import {openWorkspace} from './workspace';
import {tasks, websites} from './fixtures';

test('dashboard summary tiles open the matching task list', async ({page}) => {
  await openWorkspace(page, '/workspace');
  await page.getByRole('button', {name: /^Overdue: 2/}).click();
  await expect(page).toHaveURL(/\/workspace\/tasks\?.*overdue=true/);
  await expect(page.locator('main h1')).toHaveText('Tasks');
});

test('task completion shows only three statuses and uses their total', async ({page}) => {
  await openWorkspace(page, '/workspace');
  const chart = page.locator('.task-completion');
  await expect(chart.locator('.completion-row')).toHaveCount(3);
  const statuses = ['to_do', 'in_progress', 'completed'];
  const total = tasks.filter(t => statuses.includes(t.progress)).length;
  for (const status of statuses) {
    const count = tasks.filter(t => t.progress === status).length;
    await expect(chart.locator(`[data-status="${status}"]`)).toHaveAttribute(
      'aria-label',
      new RegExp(`${count} of ${total} tasks`),
    );
  }
  await expect(chart.getByRole('button', {name: /Blocked|In review|Cancelled/})).toHaveCount(0);
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
  const headers = page.locator('.website-comparison thead th').filter({has: page.locator('.matrix-site')});
  await expect(headers).toHaveCount(6);

  const unaudited = page.getByRole('button', {name: /Not yet audited/});
  await unaudited.click();
  await expect(unaudited).toHaveAttribute('aria-pressed', 'true');
  await expect(headers).toHaveCount(3);
  await unaudited.click();
  await expect(headers).toHaveCount(6);

  const score = page.getByRole('button', {name: /^SEO Rating/});
  await score.click();
  await score.click();
  await expect(headers.first()).toContainText('CRD United Kingdom');
  const rating = page.getByRole('row', {name: /^SEO Rating/});
  await expect(rating.locator('td').first()).toHaveText('92/100');
});

test('Website features groups narrow the table to one section', async ({page}) => {
  await openWorkspace(page, '/workspace/website-features');
  const social = page.getByRole('button', {name: /^Social media/});
  await social.click();
  await expect(social).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.website-comparison thead th')).toHaveCount(websites.length + 1);
  await expect(page.locator('.matrix-section')).toHaveCount(1);
  await expect(page.locator('.matrix-section')).toHaveText('Social media');
  await expect(page.locator('.website-comparison tbody tr:not(.matrix-section)')).toHaveCount(5);
  await page.getByRole('button', {name: /^All sections/}).click();
  await expect(page.locator('.matrix-section')).not.toHaveCount(1);
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

test('moving a card to Blocked saves without a blocker field', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  await page.getByRole('button', {name: 'Kanban', exact: true}).click();
  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/task-actions'));
  await page.getByRole('combobox', {name: 'Move Fix broken hreflang tags'}).selectOption('blocked');
  const body = (await request).postDataJSON();
  expect(body.status).toBe('blocked');
  expect(body.reason).toBe('Blocked in dashboard; no reason recorded.');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
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

  await page.getByRole('button', {name: 'Update score manually'}).click();
  const dialog = page.getByRole('dialog', {name: 'Update SEO score manually'});
  await dialog.getByRole('spinbutton', {name: 'Score (0–100)'}).fill('88');
  await expect(dialog.getByRole('combobox', {name: 'Source / tool'})).toHaveValue('Manual SEO review');
  await dialog.getByRole('combobox', {name: 'Source / tool'}).fill('PageSpeed Insights');
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
  await expect(page.getByRole('button', {name: 'Update score manually'})).toBeDisabled();

  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/seo-health'));
  await page.getByRole('button', {name: 'Save SEO'}).click();
  const body = (await request).postDataJSON();
  expect(body.fields.google_analytics).toBe('no');
  expect(body.fields.seo_score).toBe(92);
  expect(body.source).toBe('PageSpeed Insights');
  expect(body.reason).toBe('');
});

test('task creation uses the simplified fields', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  await page.locator('main').getByRole('button', {name: 'Create task'}).click();
  const form = page.getByRole('dialog', {name: 'Create a task'});
  for (const name of ['description', 'category', 'due_date'])
    await expect(form.locator(`[name="${name}"]`)).toHaveCount(0);
  await form.locator('input[name="title"]').fill('New simple task');
  const request = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/tasks'));
  await form.getByRole('button', {name: 'Create task', exact: true}).click();
  const body = (await request).postDataJSON();
  expect(body.title).toBe('New simple task');
  expect(body.category).toBe('general');
  expect(body.due_date).toBeNull();
});

test('editing a task preserves the fields removed from the form', async ({page}) => {
  await openWorkspace(page, '/workspace/tasks');
  const original = tasks.find(t => t.title === 'Fix broken hreflang tags')!;
  await page.getByRole('button', {name: original.title, exact: true}).click();
  await page.getByRole('button', {name: 'Edit task details', exact: true}).click();
  const form = page.locator('.task-edit-form');
  for (const name of ['description', 'category', 'due_date'])
    await expect(form.locator(`[name="${name}"]`)).toHaveCount(0);
  await form.locator('[name="title"]').fill('Updated task title');
  const request = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith('/api/tasks/' + original.id));
  await form.getByRole('button', {name: 'Save details'}).click();
  const body = (await request).postDataJSON();
  expect(body.title).toBe('Updated task title');
  expect(body.description).toBe(original.description);
  expect(body.category).toBe(original.category);
  expect(body.due_date).toBe(original.due_date);
});
