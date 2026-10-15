# DevOrbit

A developer operations workspace for the International Desk, based on the supplied PROJECT_SRS.md. Includes a custom orbit logo, a responsive light dashboard, and clearly labeled sample data.

## Run locally

Requires Node.js 20.9 or later (Node 24 used during development).

```sh
npm install
npm run dev
```

Open http://127.0.0.1:3000. The home page redirects to the live workspace at `/workspace`; sign in at `/login`. The browser-only demo workspace has been removed.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

## Implemented preview

- DevOrbit SVG logo/favicon and responsive sidebar/dashboard.
- Overview with record-derived KPIs, time chart, task breakdown, activity, and website pulse.
- Task creation, pending request accept/decline with reason, separate assignment/progress states, Kanban drag/drop and table, task drawer, comments, handover requests, collaborators, blocked reason and independent review checks.
- Manual work log creation, standalone/multi-website entries, 12-hour warning, team totals and filtered CSV/XLSX exports.
- Website directory, addition, archive, detail tabs and linked tasks/reports.
- Sample weekly SEO submissions, explicit revisions with original history.
- Template draft fields, preview and immutable version snapshots.
- Notification read states, demo team directory and setup settings.

The preview uses browser state and a fixed October 12â€“18, 2026 fixture week. It is **not production-ready and is not a multi-user backend**. UI workflow checks are for the demo and do not replace server authorization. No in-app invitation, role editing, mentions, attachment uploads, work-log editing, server persistence, automated schedule coverage, or production RLS acceptance is claimed. The form builder is a partial preview, not wired into arbitrary report submission. SEO report entry currently uses the fixed v1 template. No source Excel workbook was modified or imported.

## Production phases

The local environment now connects to Supabase Auth. See [Supabase setup](docs/SUPABASE_SETUP.md) for the remaining migration and administrator steps. `/login` supports email/password sign-in and `/workspace` is a separate live workspace with website/task creation and assignment responses: the server validates the access token and requires an active workspace profile, then uses user-scoped RLS queries. `/` redirects to `/workspace`. Run `npm run check:supabase` for a credential-safe connection check. Website and task creation requires migration 002 after the foundation. Task status/reviews/comments/collaborators/handover, notifications and team administration require migration 003 (`supabase/migrations/202610150003_task_workflows_and_team.sql`). See the Supabase setup guide for the one-time step.

See [architecture, data model, RLS matrix, phased plan](docs/IMPLEMENTATION.md). The initial SQL migration is a deny-by-default **foundation**, not the complete production schema. All normal writes are deliberately revoked until transactional, authorized mutations and cross-role/workspace integration tests are implemented. Do not enable broad write policies to make the preview live.

1. Create a Supabase development project and copy `.env.example` to `.env.local` with the project URL and publishable key. Never expose a service-role key in browser code.
2. Apply `supabase/migrations/202610150001_foundation.sql` with the Supabase migration runner to a fresh project. Migration has not been applied or verified against a live database here.
3. Complete invitation-only auth, server sessions, active-profile enforcement, checked mutation RPCs, optimistic concurrency, audit and recipient notifications. Connect services one vertical slice at a time. Add rate limits and real workspace data only after security tests pass.
4. Finish the deferred SRS features and run UAT-01â€“20, including server/RLS denial cases. Choose private attachment policies and explicit website reporting schedules.
5. Import this Next.js repository into Vercel, configure environment values, and use `npm run build`. Provision a tested backup/recovery plan for the selected Supabase tier. Live deployment and external resource provisioning have not been performed.

This delivery includes Phase 0 design/foundation and a locally usable UI preview of subsequent phases; those phases remain gated on server implementations.

## Branding

`public/logo.svg` contains the DevOrbit mark: two white orbital paths, a central node, and a green satellite on a violet tile. It also serves as the favicon. The UI uses DM Sans and Manrope with system fallbacks.

## Verification notes

Production build, TypeScript, lint, 46 domain/auth/validation/PostgreSQL/export tests, HTTP page/health checks pass. Production dependency audit reports zero known advisories. The Next.js lint toolchain currently reports five development-only advisories in its glob/braces chain; do not blindly downgrade the framework to satisfy the audit suggestion. Browser visual/mobile QA remains unverified because no browser is connected. Real migration/RLS/transaction tests pass in isolated PostgreSQL; the new migration has not been applied to the hosted project here. Hosted end-to-end creation remains to be verified after the user applies it.


## Task workflows and team members

Open a live task drawer for progress, blocker/completion/reopen notes, independent reviews, comments/mentions, collaborators, reviewer changes and handovers. Apply migration 003 first. Admins use Team & roles to add an existing Supabase Auth account by email, name and role. First create the login under Supabase Authentication, then add its workspace membership in DevOrbit. No password or service-role key is collected by the app, and no email invitation is sent. See docs/SUPABASE_SETUP.md for the full onboarding steps and current limitations.

## Live timesheets and readability theme

Apply migration 004 (supabase/migrations/202610150004_work_logs_and_timesheets.sql) after 001-003, then open Timesheets in the live workspace. This enables daily/weekly views, manual entries, contributor/site filters, audited own edits, reasoned admin corrections, warning confirmation, history and CSV/XLSX export across pages. Full setup details, limits and verification boundaries are in docs/SUPABASE_SETUP.md. The updated app/theme.css adds an ink sidebar, warm tinted surfaces and violet/teal/amber accents while retaining readable text and prior typography changes. Actual browser screenshots/mobile QA and hosted end-to-end work-log verification remain pending.
