import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePageSpeed, publicAuditUrl, runPageSpeed} from '../lib/pagespeed';
const fixture = () => ({
  lighthouseResult: {
    configSettings: {formFactor: 'mobile'},
    categories: {seo: {score: 0}, performance: {score: 0.87}},
    fetchTime: '2026-10-26T10:00:00.000Z',
    finalUrl: 'https://foih.ch/',
    lighthouseVersion: '13.0.0',
    audits: {
      'largest-contentful-paint': {numericValue: 2300},
      'speed-index': {numericValue: 4700},
      metrics: {details: {items: [{observedLoad: 7114, observedNavigationStart: 0}]}},
    },
  },
});
test('PageSpeed results preserve zero scores and separate scores from milliseconds converted to seconds', () => {
  const result = parsePageSpeed(fixture());
  assert.equal(result.seo_score, 0);
  assert.equal(result.performance_score, 87);
  assert.equal(result.lcp_seconds, 2.3);
  assert.equal(result.speed_index_seconds, 4.7);
  assert.equal(result.load_seconds, 7.114);
  assert.throws(() => parsePageSpeed({lighthouseResult: {categories: {seo: {score: null}}}}), /complete mobile audit/);
  assert.throws(
    () =>
      parsePageSpeed({...fixture(), lighthouseResult: {...fixture().lighthouseResult, runtimeError: {code: 'NO_FCP'}}}),
    /complete mobile audit/,
  );
});
test('load time uses the observed load event, with no fallback to LCP or speed index', () => {
  const data = fixture();
  data.lighthouseResult.audits.metrics.details.items[0] = {observedLoad: 50, observedNavigationStart: 100};
  assert.equal(parsePageSpeed(data).load_seconds, null);
  data.lighthouseResult.audits.metrics.details.items = [];
  assert.equal(parsePageSpeed(data).load_seconds, null);
  assert.equal(parsePageSpeed(data).lcp_seconds, 2.3);
});

test('transient Google failures retry once within a shared timeout, while quota failures do not retry', async () => {
  let calls = 0;
  const signals: (AbortSignal | null | undefined)[] = [];
  const recovered = await runPageSpeed('https://foih.ch', 'test-secret', (async (_input, init) => {
    signals.push(init?.signal);
    calls++;
    return calls === 1 ? new Response('', {status: 500}) : Response.json(fixture());
  }) as typeof fetch);
  assert.equal(calls, 2);
  assert.equal(recovered.performance_score, 87);
  assert.equal(signals[0], signals[1]);
  calls = 0;
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () => {
      calls++;
      return new Response('', {status: 429});
    }) as typeof fetch),
    /quota/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () => {
      calls++;
      throw new DOMException('Expired', 'TimeoutError');
    }) as typeof fetch),
    /three minutes/,
  );
  assert.equal(calls, 1);
});

test('Google browser failures have specific safe messages without leaking provider response details', async () => {
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () =>
      Response.json(
        {error: {message: 'FAILED_DOCUMENT_REQUEST secret-provider-details'}},
        {status: 500},
      )) as typeof fetch),
    error =>
      error instanceof Error &&
      /HTTP 500/.test(error.message) &&
      /redirects/.test(error.message) &&
      !/secret-provider-details/.test(error.message),
  );
});

test('page load failures reported by Google are not retried', async () => {
  let calls = 0;
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () => {
      calls++;
      return Response.json({error: {message: 'Lighthouse returned error: NO_FCP'}}, {status: 500});
    }) as typeof fetch),
    error => error instanceof Error && /render the page/.test(error.message) && !/after retrying/.test(error.message),
  );
  assert.equal(calls, 1);
});
test('Automatic audit URLs reject private addresses, credentials and unsupported protocols', () => {
  for (const url of [
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://[::1]',
    'http://localhost',
    'https://host.local',
    'https://u:p@foih.ch',
    'ftp://foih.ch',
    'http://foih.ch:8000',
  ])
    assert.throws(() => publicAuditUrl(url));
  assert.equal(publicAuditUrl('https://foih.ch/#section'), 'https://foih.ch/');
});
test('PageSpeed sends only the public URL to a fixed Google endpoint with mobile SEO and performance categories', async () => {
  const calls: URL[] = [];
  const fake = (async (input: URL | RequestInfo, options?: RequestInit) => {
    calls.push(new URL(String(input)));
    assert.equal((options?.headers as Record<string, string>)['X-Goog-Api-Key'], 'test-secret');
    return Response.json(fixture());
  }) as typeof fetch;
  await runPageSpeed('https://foih.ch', 'test-secret', fake);
  assert.equal(calls[0].hostname, 'www.googleapis.com');
  assert.deepEqual(calls[0].searchParams.getAll('category'), ['seo', 'performance']);
  assert.equal(calls[0].searchParams.get('strategy'), 'mobile');
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () => new Response('', {status: 429})) as typeof fetch),
    /quota/,
  );
  await assert.rejects(
    runPageSpeed('https://foih.ch', 'test-secret', (async () => {
      throw new Error('secret-provider-details');
    }) as typeof fetch),
    /Could not connect/,
  );
});
