import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseWorkspacePath, workspacePath, type Page} from '../lib/workspace-routes';

test('every workspace page round-trips through its URL', () => {
  const pages: Page[] = [
    'Overview',
    'Websites',
    'Team tasks',
    'My tasks',
    'Team & roles',
    'Notifications',
    'Account',
    'SEO reports',
    'Website features',
    'Form builder',
  ];
  for (const page of pages) assert.deepEqual(parseWorkspacePath(workspacePath(page)), {page, websiteId: null});
  assert.equal(workspacePath('Overview'), '/workspace');
  assert.equal(workspacePath('Team tasks'), '/workspace/tasks');
});

test('website detail URLs carry the website id', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  assert.equal(workspacePath('Websites', id), `/workspace/websites/${id}`);
  assert.deepEqual(parseWorkspacePath(`/workspace/websites/${id}/`), {page: 'Websites', websiteId: id});
  assert.equal(workspacePath('Team tasks', id), '/workspace/tasks');
});

test('unknown or foreign paths fall back to the overview', () => {
  for (const path of ['/workspace/unknown', '/workspace/', '/login', '/', '/workspace/tasks-extra'])
    assert.deepEqual(parseWorkspacePath(path), {page: 'Overview', websiteId: null});
});
