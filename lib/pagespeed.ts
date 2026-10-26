import {AccessError} from './live-auth';

export function publicAuditUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AccessError(400, 'Set a valid public website URL first.');
  }
  const host = url.hostname.toLowerCase();
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|test|invalid|example)$/.test(host) ||
    /^[\d.]+$/.test(host) ||
    host.includes(':') ||
    host.endsWith('.localhost')
  )
    throw new AccessError(400, 'Automatic audits require a public HTTP/HTTPS website address.');
  url.hash = '';
  return url.href;
}

export type PageSpeedResult = {
  seo_score: number;
  performance_score: number;
  lcp_seconds: number | null;
  load_seconds: number | null;
  speed_index_seconds: number | null;
  measured_at: string;
  final_url: string;
  lighthouse_version: string;
};
export function parsePageSpeed(raw: unknown): PageSpeedResult {
  type Lighthouse = {
    runtimeError?: unknown;
    configSettings?: {formFactor?: string};
    categories?: {seo?: {score?: unknown}; performance?: {score?: unknown}};
    fetchTime?: string;
    finalUrl?: string;
    lighthouseVersion?: string;
    audits?: Record<string, {numericValue?: unknown; details?: {items?: Record<string, unknown>[]}}>;
  };
  const result = (raw as {lighthouseResult?: Lighthouse})?.lighthouseResult;
  const validScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  if (
    !result ||
    result.runtimeError ||
    result.configSettings?.formFactor !== 'mobile' ||
    !validScore(result.categories?.seo?.score) ||
    !validScore(result.categories?.performance?.score) ||
    !result.fetchTime ||
    !Number.isFinite(Date.parse(result.fetchTime)) ||
    typeof result.finalUrl !== 'string' ||
    typeof result.lighthouseVersion !== 'string'
  )
    throw new AccessError(502, 'Google did not return a complete mobile audit. Previous results were kept.');
  const seconds = (key: string) => {
    const value = result.audits?.[key]?.numericValue;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 3600000
      ? Math.round(value) / 1000
      : null;
  };
  const metrics = result.audits?.metrics?.details?.items?.[0];
  const load = metrics?.observedLoad;
  const navigation = metrics?.observedNavigationStart;
  // Both values are relative trace timings in milliseconds, not epoch timestamps.
  const loadMilliseconds = typeof load === 'number' && typeof navigation === 'number' ? load - navigation : NaN;
  return {
    seo_score: Math.round(result.categories.seo.score * 100),
    performance_score: Math.round(result.categories.performance.score * 100),
    lcp_seconds: seconds('largest-contentful-paint'),
    load_seconds:
      Number.isFinite(loadMilliseconds) && loadMilliseconds > 0 && loadMilliseconds <= 3600000
        ? Math.round(loadMilliseconds) / 1000
        : null,
    speed_index_seconds: seconds('speed-index'),
    measured_at: new Date(result.fetchTime).toISOString(),
    final_url: publicAuditUrl(result.finalUrl),
    lighthouse_version: result.lighthouseVersion.slice(0, 100),
  };
}

/** A safe explanation for Lighthouse page-load errors; empty when Google gives no recognisable cause. */
async function pageFailureReason(response: Response) {
  try {
    const body = (await response.json()) as {error?: {message?: string}};
    const message = body.error?.message || '';
    if (/NO_FCP|NO_LCP/.test(message)) return 'Google could not render the page content.';
    if (/FAILED_DOCUMENT_REQUEST|ERRORED_DOCUMENT_REQUEST/.test(message))
      return 'Google could not load the website page. Check its redirects, TLS certificate and bot/firewall rules.';
    if (/PAGE_HUNG|PROTOCOL_TIMEOUT|TIMED_OUT/.test(message))
      return "The website did not finish loading inside Google's browser.";
  } catch {
    /* Never expose raw Google response bodies or credentials. */
  }
  return '';
}

export async function runPageSpeed(url: string, key: string, fetcher: typeof fetch = fetch) {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', publicAuditUrl(url));
  endpoint.searchParams.set('strategy', 'mobile');
  endpoint.searchParams.append('category', 'seo');
  endpoint.searchParams.append('category', 'performance');
  const signal = AbortSignal.timeout(180000);
  let response: Response | undefined;
  let reason = '';
  let retried = false;
  // One retry for transient transport/gateway failures, sharing the same total budget.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      response = await fetcher(endpoint, {headers: {'X-Goog-Api-Key': key}, cache: 'no-store', signal});
      if (response.status < 500) break;
      reason = await pageFailureReason(response);
      // A page that Google could not load fails the same way again, so only unexplained errors retry.
      if (attempt === 0 && !reason && [500, 502, 503, 504].includes(response.status)) {
        retried = true;
        continue;
      }
      break;
    } catch (error) {
      if (signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)))
        throw new AccessError(
          504,
          'Google did not finish this website audit within three minutes. Previous results were kept. Try again later; a slow or blocked page can prevent Google from completing it.',
        );
      if (attempt === 1)
        throw new AccessError(
          502,
          'Could not connect to Google PageSpeed after retrying. Previous results were kept. This is a connection failure, not a saved audit.',
        );
    }
  }
  if (!response) throw new AccessError(502, 'Google audit is unavailable. Previous results were kept.');
  if (response.status === 429) throw new AccessError(429, 'Google audit quota is busy. Wait a few minutes and retry.');
  if ([400, 401, 403].includes(response.status))
    throw new AccessError(
      502,
      'Google could not audit this URL. Check the PageSpeed API key, API enablement, and public website accessibility.',
    );
  if (!response.ok)
    throw new AccessError(
      502,
      `Google PageSpeed returned HTTP ${response.status}${retried ? ' after retrying' : ''}. ${reason || 'Its audit service could not complete this website test; try again later.'} Previous results were kept.`,
    );
  try {
    return parsePageSpeed(await response.json());
  } catch (error) {
    if (error instanceof AccessError) throw error;
    throw new AccessError(502, 'Google returned an unreadable audit. Previous results were kept.');
  }
}
