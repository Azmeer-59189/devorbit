import {test} from 'node:test';
import assert from 'node:assert/strict';
import {currentLoadTime} from '../lib/load-time';
test('automatic load time replaces the displayed manual value without mutating the recorded Pingdom input', () => {
  const site = {
    fields: {page_seconds: 1.2},
    automatic_load_time: {
      id: 'run',
      load_seconds: 7.114,
      measured_at: '2026-10-26T10:00:00Z',
      finished_at: '2026-10-26T10:01:00Z',
      lighthouse_version: '13',
    },
  };
  assert.equal(currentLoadTime(site).seconds, 7.114);
  assert.equal(currentLoadTime(site).automatic, true);
  assert.equal(site.fields.page_seconds, 1.2);
  assert.equal(currentLoadTime({fields: site.fields}).seconds, 1.2);
  assert.equal(currentLoadTime({fields: {}}).seconds, null);
});
