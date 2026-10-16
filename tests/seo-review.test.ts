import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareSeo, reviewSeo} from '../lib/seo-review';

test('SEO review distinguishes unknown, missing, negative, and not-applicable statuses', () => {
  const review = reviewSeo({seo_implementation: 'no', google_analytics: 'unknown', seo_score: 0, qa: 'generated'});
  assert.ok(review.issues.some(f => f.key === 'seo_implementation'));
  assert.ok(review.missing.some(f => f.key === 'google_analytics'));
  assert.ok(!review.missing.some(f => ['seo_score', 'qa', 'plugin_updated', 'backup_date', 'remarks'].includes(f.key)));
  assert.equal(reviewSeo({seo_implementation: 'not_applicable'}).issues.length, 0);
});

test('SEO comparison retains note-only changes and zero scores, excluding automatic references', () => {
  const changes = compareSeo(
    {fields: {seo_score: 0, qa: 'old'}, notes: {google_analytics: 'old detail'}},
    {fields: {seo_score: 60, qa: 'new'}, notes: {google_analytics: 'new detail'}},
  );
  assert.deepEqual(
    changes.map(f => f.key),
    ['seo_score', 'google_analytics'],
  );
});
