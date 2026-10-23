import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seoTaskDraft} from '../lib/seo-task';
test('SEO task drafts retain website and saved audit context without assigning or changing the issue', () => {
  const site = {id: 'website-id', name: 'Netherlands', revision: 4, source: 'Recorded tool'};
  const draft = seoTaskDraft(site, 'Google Analytics', 'not_yet', 'Awaiting access');
  assert.equal(draft.websiteId, site.id);
  assert.match(draft.description, /Not Yet/);
  assert.match(draft.description, /version: 4/);
  assert.match(draft.description, /Recorded tool/);
  assert.match(draft.description, /Awaiting access/);
  assert.equal(seoTaskDraft({...site, name: 'x'.repeat(200)}, 'Long field', 'no').title.length, 200);
});
