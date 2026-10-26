# Automatic SEO and page-speed audits

## Enable it once

1. Apply `supabase/migrations/202610260017_automatic_seo.sql` in the Supabase SQL editor after migrations 001–016. Keep RLS enabled.
2. In your Google Cloud project, enable **PageSpeed Insights API**, then create an API key restricted to that API. See [Google's setup guide](https://developers.google.com/speed/docs/insights/v5/get-started).
3. Add `PAGESPEED_API_KEY` privately to your local `.env` and to **Vercel → DevOrbit → Settings → Environment Variables → Production**. Keep the existing server-only `SUPABASE_SECRET_KEY`. Do not prefix either key with `NEXT_PUBLIC_`, commit it, or paste it into chat.
4. Restart the local app / redeploy Vercel. Open **SEO → Run audit** beside a website, or open a website and choose **Run automatic audit**. Allow up to two minutes.

## What happens

The server sends the website registry's public URL to Google's fixed PageSpeed endpoint, requesting SEO and performance categories using the mobile strategy. This audits that page, not the entire website. Google returns Lighthouse lab scores: SEO /100, performance /100, largest contentful paint (LCP) seconds and speed-index seconds. The fetch timestamp, Lighthouse version, original URL, final URL and initiating member are retained.

Successful SEO scores enter the existing dated audit history under `Google PageSpeed Insights / Lighthouse mobile`, which is separate from manual/imported sources in trends. Another successful run on the same local date supersedes that source's prior score while preserving its record. Performance runs remain in their own history. The comparison table shows latest successful performance and LCP values; opening the website shows the latest 20 attempts. The old manually recorded page-speed field is preserved because its measurement method is unknown. Automatic audits do not change Analytics or SEO Implementation statuses.

Failures and partial provider responses leave previous successful measurements intact. Membership, website scope and archive status are checked; changing the website URL or membership during a run prevents saving it. Archived websites cannot start audits. Only the server role can finish runs or write provider results. Client callers cannot submit their own automated scores. The database serializes a five-minute cooldown per website and a 20-attempt workspace limit per hour. Failed and interrupted attempts count toward these limits. A server timeout can leave an attempt marked running; retry with a new attempt after five minutes.

This phase automates collection with one click. It does not install a scheduled/background audit job. A live Google mobile audit was verified locally, and the migration 017 table was confirmed available in the connected Supabase project. Other environments must apply the migration and configure the key before use. The connection test itself does not save measurements into the application.
