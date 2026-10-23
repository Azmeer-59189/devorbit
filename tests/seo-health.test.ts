import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditScheduleInput, seoFields, seoInput, validateSeo} from '../lib/seo-health';
import {prepareSeoImport} from '../lib/seo-import';
test('fixed SEO form covers the 33 worksheet fields and preserves real-data distinctions', () => {
  assert.equal(seoFields.length, 33);
  assert.equal(new Set(seoFields.map(f => f.key)).size, 33);
  const rows = prepareSeoImport();
  assert.equal(rows.length, 14);
  assert.equal(
    rows.reduce((n, w) => n + w.audits.length, 0),
    27,
  );
  const nl = rows.find(w => w.name === 'Netherlands')!;
  assert.equal(nl.fields.page_seconds, 0.953);
  assert.equal(nl.fields.recurring_donations, 'no');
  assert.match(nl.notes.recurring_donations, /Bank account/i);
  const us = rows.find(w => w.name === 'FOIH US')!;
  assert.equal(us.fields.financial_reports, 'yes');
  assert.equal(us.fields.linkedin, 'unknown');
  assert.equal(us.fields.plugin_updated, '2026-09-01');
  assert.equal(us.fields.backup_date, '2026-09-18');
  assert.match(String(us.fields.remarks), /3.43s/);
  assert.equal(us.fields.page_seconds, 5.94);
  const finland = rows.find(w => w.name === 'Finland')!;
  assert.equal(finland.fields.remarks, null);
  assert.equal(finland.audits.length, 1);
  assert.equal(finland.fields.video, 'in_progress');
  for (const row of rows) {
    assert.equal(Object.keys(row.fields).length, 33);
    validateSeo(row.fields, row.notes);
  }
});
test('SEO form validates numeric units, dates, statuses and source before submission', () => {
  const input = {
    request_id: crypto.randomUUID(),
    website_id: crypto.randomUUID(),
    expected_revision: 0,
    fields: {seo_score: 75, audit_date: '2026-10-16', google_analytics: 'unknown', page_seconds: 0.953},
    notes: {},
    source: 'Rank Math SEO Analyzer',
  };
  assert.equal(seoInput(input).fields.page_seconds, 0.953);
  assert.throws(() => seoInput({...input, source: ''}));
  assert.throws(() => seoInput({...input, fields: {seo_score: 101, audit_date: '2026-10-16'}}));
  assert.throws(() => seoInput({...input, fields: {audit_date: '2026-02-30'}}));
  assert.throws(() => seoInput({...input, fields: {password: 'secret'}}));
  assert.throws(() => seoInput({...input, fields: {ssl: 'maybe'}}));
});
test('audit schedule accepts whole days from 7 to 730', () => {
  assert.deepEqual(auditScheduleInput({interval_days: 90}), {interval_days: 90});
  for (const interval_days of [6, 731, 30.5, '30', null]) assert.throws(() => auditScheduleInput({interval_days}));
  assert.throws(() => auditScheduleInput(null));
});
