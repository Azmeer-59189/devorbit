import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditToCorrect, fieldsForPage, compareCells, compareSeo, reviewSeo, seoExportRows} from '../lib/seo-review';
import {seoFields} from '../lib/seo-health';

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

test('SEO exports have one labelled column per form field and flag automatic dates', () => {
  const [row] = seoExportRows([
    {
      name: 'UK',
      country: 'United Kingdom',
      canonical_url: 'https://example.org',
      cms: 'WordPress',
      status: 'active',
      archived_at: null,
      fields: {seo_implementation: 'in_progress', seo_score: 0, plugin_updated: '2026-10-01'},
      notes: {seo_implementation: 'Schema pending', plugin_updated: 'Automatically set'},
      source: 'Sheet',
      latest_audit: {score: 71, measurement_date: '2026-10-01', source: 'Lighthouse'},
    },
  ]);
  for (const field of seoFields)
    assert.ok(field.label in row || `${field.label} (automatic reference)` in row, `missing column for ${field.label}`);
  assert.equal(row['Website URL'], 'https://example.org');
  assert.equal(row['CMS Platform'], 'WordPress');
  assert.equal(row['SEO Implementation'], 'In Progress');
  assert.equal(row['SEO Rating'], 0);
  assert.equal(row['Last Plugin Update (automatic reference)'], '2026-10-01');
  assert.equal(row['Latest audit score'], 71);
  assert.equal(row['Field notes'], 'SEO Implementation: Schema pending');
  assert.match(String(row['Checklist issues']), /SEO Implementation/);
});

test('SEO and website features partition all fields and scope checklist reviews', () => {
  const seo = fieldsForPage('seo');
  const features = fieldsForPage('features');
  assert.deepEqual(
    seo.map(f => f.key),
    ['seo_implementation', 'seo_score', 'audit_date', 'google_analytics', 'page_seconds'],
  );
  assert.equal(new Set([...seo, ...features].map(f => f.key)).size, 33);
  assert.equal(seo.length + features.length, 33);
  assert.equal(reviewSeo({ssl: 'no', seo_implementation: 'yes'}, seo).issues.length, 0);
  assert.equal(reviewSeo({ssl: 'no', seo_implementation: 'yes'}, features).issues[0].key, 'ssl');
});

test('comparison columns sort by type and always keep blank values last', () => {
  const sort = (values: (string | number | null)[], type: string, direction: 1 | -1) =>
    [...values].sort((a, b) => compareCells(a, b, type, direction));
  assert.deepEqual(sort([74, null, 9, 92], 'number', 1), [9, 74, 92, null]);
  assert.deepEqual(sort([74, null, 9, 92], 'number', -1), [92, 74, 9, null]);
  assert.deepEqual(sort(['no', 'unknown', 'yes', 'in_progress'], 'status', 1), ['yes', 'in_progress', 'no', 'unknown']);
  assert.deepEqual(sort(['2026-10-03', '', '2026-09-13'], 'date', -1), ['2026-10-03', '2026-09-13', '']);
});

test('a new score corrects only the current audit with the same date and source', () => {
  const audits = [
    {id: 'b', measurement_date: '2026-10-23', score: 90, source: 'PageSpeed', supersedes_id: 'a'},
    {id: 'a', measurement_date: '2026-10-23', score: 80, source: 'PageSpeed', supersedes_id: null},
    {id: 'c', measurement_date: '2026-10-01', score: 70, source: 'Rank Math', supersedes_id: null},
  ];
  assert.equal(auditToCorrect(audits, '2026-10-23', 'PageSpeed')?.id, 'b');
  assert.equal(auditToCorrect(audits, '2026-10-23', 'Rank Math'), undefined);
  assert.equal(auditToCorrect(audits, '2026-10-02', 'Rank Math'), undefined);
});
