import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seoTrend, TrendAudit} from '../lib/seo-trend';

const audit = (
  id: string,
  date: string,
  score: number,
  source = 'Tool A',
  supersedes_id: string | null = null,
): TrendAudit => ({
  id,
  measurement_date: date,
  score,
  source,
  supersedes_id,
  created_at: `${date}T12:00:00Z`,
});
test('SEO trend uses corrected scores, isolates sources, and orders by measurement date', () => {
  const rows = [
    audit('old', '2026-07-01', 30),
    audit('new', '2026-07-01', 40, 'Tool A', 'old'),
    audit('oct', '2026-10-01', 0),
    audit('other', '2026-10-02', 99, 'Tool B'),
  ];
  assert.deepEqual(
    seoTrend(rows, 'Tool A', '', '').map(a => a.score),
    [40, 0],
  );
  assert.deepEqual(
    seoTrend(rows, 'Tool A', '2026-10-01', '2026-10-01').map(a => a.id),
    ['oct'],
  );
  assert.equal(seoTrend(rows, 'Tool A', '2027-01-01', '').length, 0);
});
test('SEO trend excludes every replaced record in a correction chain', () => {
  const rows = [
    audit('a', '2026-07-01', 20),
    audit('b', '2026-07-01', 30, 'Tool A', 'a'),
    audit('c', '2026-07-01', 40, 'Tool A', 'b'),
  ];
  assert.deepEqual(
    seoTrend(rows, 'Tool A', '', '').map(a => a.id),
    ['c'],
  );
});
