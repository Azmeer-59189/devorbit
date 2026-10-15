import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csv} from '../lib/csv';

test('CSV escapes delimiters, quotes and spreadsheet formulas', () => {
  const result = csv([{a: '=1+1', b: 'hello, "world"', c: ' \t=HYPERLINK("https://example.org")'}]);
  assert.ok(result.includes("'" + '=1+1'));
  assert.ok(result.includes('"hello, ""world"""'));
  assert.ok(result.includes('"\' \t=HYPERLINK'));
  assert.equal(csv([]), '');
});
