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

- **Home**: task status, workload, website and SEO charts with date, member and website filters.
- **Websites**: registry with add, edit, archive and restore; detail view with linked tasks and reports.
- **Tasks**: creation, assignment requests the recipient accepts or declines, handover, progress with blocker and reopen reasons, independent review, comments with mentions, collaborators, filters and editing with conflict detection.
- **SEO reports and form builder**: administrator-defined templates with versioned, immutable published schemas; weekly submissions with append-only revisions; CSV export.
- **Team**: email invitations (resend, cancel, expiry), roles and deactivation, with at least one administrator always kept.
- **Notifications** for assignments, reviews and mentions.

Time tracking was removed in migration 010. Historical work-log rows are retained in the database, and the `/api/work-logs` routes return `410 Gone`.

## Security model

- Row-level security on every table; users read only their own workspace.
- No direct table writes. Every change goes through a database function that checks the caller's role and validates input, with retry-safe request IDs, revision checks against concurrent edits and an audit event per change.
- API routes verify the Supabase session and an active workspace profile before calling the database as that user.
- `SUPABASE_SECRET_KEY` is used only server-side for sending invitation emails. Never expose it to the browser.

See [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md) for the architecture, data model and RLS matrix.

## Database setup

Apply the migrations in `supabase/migrations/` in order (001–010) to the Supabase project, then bootstrap the first administrator. [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) has the step-by-step guide, including SMTP and invitation configuration.

## Not yet verified

- Visual and mobile QA in a real browser.
- End-to-end runs against the hosted Supabase project; the database tests run against an embedded PostgreSQL.
- Production deployment (Vercel is the intended host), monitoring and a tested backup restore.
- Import of the website source snapshot in `data/imports/`, which has not been written to Supabase.

## Branding

`public/logo.svg` is the DevOrbit mark and favicon. The UI uses DM Sans and Manrope with system fallbacks.
