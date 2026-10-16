# DevOrbit

A developer operations workspace for the International Desk: websites, team tasks, SEO reporting and team onboarding in one place. Built with Next.js and Supabase (Postgres with row-level security). Requirements are in [docs/PROJECT_SRS.md](docs/PROJECT_SRS.md).

## Run locally

Requires Node.js 20.9 or later (Node 24 used during development).

```sh
npm install
cp .env.example .env.local   # then fill in the Supabase URL and publishable key
npm run dev
```

Open http://127.0.0.1:3000. The home page redirects to the workspace at `/workspace`; sign in at `/login`. New members join through an invitation link at `/join`.

`npm run dev` reloads on every save. `npm start` serves the last `npm run build` and must be rebuilt after changes.

```sh
npm run lint
npm run typecheck
npm test              # unit tests plus migration/RLS tests on an embedded PostgreSQL
npm run build
npm run check:supabase   # credential-safe connection check
```

## Features

- **Home**: task status, workload, website and SEO charts with date, member and website filters. Select a KPI, status slice, workload bar or legend entry to open the matching tasks; the task list count equals the number selected.
- **Websites**: registry with add, edit, archive and restore; detail view with linked tasks and reports.
- **Tasks**: creation, assignment requests the recipient accepts or declines, handover, progress with blocker and reopen reasons, independent review, comments with mentions, collaborators, filters and editing with conflict detection. Filters live in the URL, so a filtered list can be bookmarked or shared. **Export CSV** and **Export Excel** download every matching task (up to 5,000), not just the current page.
- **SEO & Website Health**: one fixed form per website with dated audits and revision history. **Export CSV** and **Export Excel** download the listed websites with one column per form field; automatically filled maintenance dates are labelled "(automatic reference)". `/workspace/reports?website=<id>` opens a website's form directly. (The earlier template-based reporting tables remain in the database but are no longer shown.)
- **Team**: email invitations (resend, cancel, expiry), roles and deactivation, with at least one administrator always kept.
- **Notifications** for assignments, reviews and mentions.

Time tracking was removed in migration 010. Historical work-log rows are retained in the database, and the `/api/work-logs` routes return `410 Gone`.

## Security model

- Row-level security on every table; users read only their own workspace.
- No direct table writes. Every change goes through a database function that checks the caller's role and validates input, with retry-safe request IDs, revision checks against concurrent edits and an audit event per change.
- API routes verify the Supabase session and an active workspace profile before calling the database as that user. Session tokens are verified locally against the project's cached signing keys (`getClaims`), so a signed-out token stays valid until it expires (one hour by default); deactivation takes effect on the next request.
- Request bodies must be JSON objects and are capped while streaming (1 MB by default, 24 KB for task and website creation), so malformed or oversized input returns `400`.
- `next.config.ts` sends a Content-Security-Policy limited to the app, the configured Supabase project and Google Fonts, plus `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. Add any new external origin there before the browser can load it.
- `SUPABASE_SECRET_KEY` is used only server-side for sending invitation emails. Never expose it to the browser.

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the architecture, data model and RLS matrix.

## Database setup

Apply the migrations in `supabase/migrations/` in order (001–015) to the Supabase project, then bootstrap the first administrator. [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) has the step-by-step guide, including SMTP and invitation configuration.

## Not yet verified

- Visual and mobile QA in a real browser, including a console check that the Content-Security-Policy blocks nothing the app needs.
- End-to-end runs against the hosted Supabase project; the database tests run against an embedded PostgreSQL.
- Production deployment (Vercel is the intended host), monitoring and a tested backup restore.
- Import of the website source snapshot in `data/imports/`, which has not been written to Supabase.

## Branding

`public/logo.svg` is the DevOrbit mark and favicon. The UI uses DM Sans and Manrope with system fallbacks.
