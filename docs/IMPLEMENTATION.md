# DevOrbit implementation plan

Task list completion: migration 014 adds a read-only security-invoker RPC for full-dataset filtering, deterministic pagination and ordering, personal scopes and accepted-board counts under caller RLS. Task list UI is independent of the overview's latest-100 preview. Existing assignment/progress/review RPCs remain authoritative for all changes. Native drag/drop and a Move selector share the same validation/action path; review decisions remain in task detail. Reason prompts and revision conflicts preserve workflow rules. Kanban is explicitly paginated, with global filtered column counts and current-page cards; pending ownership stays separate. PostgreSQL tests cover multiple pages, stable sort, timezone dates, role/workspace boundaries and pending ownership. Browser drag/drop/mobile QA remains a hosted verification step.

Current SEO scope: one fixed 33-field form replaces routine template management. Migration 011 adds RLS-scoped current checklist profiles, immutable form revisions, dated audit observations with append-only corrections, and immutable source-import receipts/provenance. Website-row locks serialize edits/corrections; revision checks and payload-bound mutation receipts prevent stale edits and duplicate saves. Audit corrections are restricted to the original actor or an administrator. Registry identity fields are derived from the existing website profile, not trusted from the form.

The main navigation exposes SEO & Website Health. One grouped form covers the supplied worksheet categories; statuses preserve unknown/no/in-progress distinctions and qualified notes. Network summaries use audit dates; record history preserves actors and imported-author uncertainty. Administrator import uses a server-owned snapshot and explicit preview confirmation, preserves existing website/SEO values, skips score conflicts and is idempotent by source website identity. The dashboard combines current dedicated audits with legacy report metrics without double counting matching website/date/source records. Legacy template records are retained; their builder is no longer part of the daily workflow. No time-management features are restored.


Product-owner scope change: time management is excluded. Migration 010 replaces the dashboard RPC without time queries or fields and revokes authenticated execution of the legacy work-log/timesheet RPCs. Legacy HTTP endpoints return 410. The connected UI no longer contains timesheet navigation, website time tabs, time charts or exports. The legacy demo landing route redirects to the connected workspace. Historical SQL migrations, data and regression tests remain; do not rerun old migrations to restore grants. Earlier time-management implementation notes below describe historical work, not current product scope.

The supplied PROJECT_SRS.md defines the product requirements. DevOrbit is the confirmed product name. No source workbook is modified. Historical import, paid services, automated integrations, and public registration are excluded.

## Architecture

Next.js App Router and TypeScript, responsive React components, Recharts, Supabase PostgreSQL/Auth, Vercel. The initial workspace is an explicitly labeled local demo, backed by browser storage, not an authenticated multi-user system. Domain functions live outside components. Live writes must use transactional database functions after authentication; a client-selected role is never authorization.

## Entity relationships

Workspace has profiles, websites, tasks, templates and audit events. Tasks have many assignment attempts, collaborators, comments, reviews, website links and work logs. Logs belong to contributors, not task owners. Templates have immutable published versions; submissions bind to a version and contain immutable revisions. Metrics retain source and scale. Notifications belong to recipients. Every association must remain within one workspace.

## RLS matrix

All access requires an active auth-linked profile in the row's workspace. Developers read workspace records, edit their own logs/profile, and use checked task workflow functions. Managers additionally manage websites/tasks, but cannot edit others' time or roles. Administrators manage users/templates and correct time only with a reason. Reports permit original submitter or admin revisions. Published versions, revisions and audit events are append-only. Notifications are recipient-only. No public/anonymous record access. Database migrations use deny-by-default RLS until a feature's transactional operations and tests are ready.

## Phases and completion gates

0. Architecture, schema/RLS baseline, branding, Next scaffold, env template and CI.
1. AUTH-01–06 / SITE-01–08: connect a Supabase project, invitation-only authentication, server identity and website registry; cross-workspace RLS tests.
2. TASK / COL: assignment acceptance and handover, review, comments, audit; UAT-01–07.
3. TIME: contributor logs, audited edits, normalized totals and exports; UAT-08–10,15,20.
4. FORM / RPT: immutable publication/revision and explicit schedules; UAT-11–14.
5. AN / NOTIF: reconciled filters, record drilldown and recipient notifications; UAT-17.
6. Authenticated browser/security/concurrency tests, responsive QA, backup plan and Vercel deployment; UAT-16,18,19.

Each phase requires server validation, authorization, audit and applicable tests before production completion. Local demo interactions do not satisfy server/RLS acceptance criteria.

### Connected website/task creation slice

Implemented live `/workspace` navigation, real website/task creation, active-member assignment, multiple website links, independent reviewer selection, pending recipient accept/decline, scoped search and source record detail. The `202610150002_live_creation.sql` migration introduces narrow transactional RPCs, retry receipts, and atomic audit events. General writes stay revoked and RLS stays enabled. The API derives identity and workspace from verified membership, not request fields. Self-assignment creates accepted ownership; other-user assignment creates a pending request with no owner.

SQL integration tests run the actual migrations and RPCs in an isolated PostgreSQL engine (PGlite), with Supabase's auth identity/role boundary represented by test roles and `auth.uid()`. They cover workspace isolation, direct-write denial, anonymous denial, inactive membership, spoofed identities, archived links, atomic validation failures, retries, assignment acceptance/decline and audit. This is not a hosted Supabase end-to-end or browser test. Applying the new migration to the hosted project remains a manual setup step because the available publishable key cannot administer its schema.

### Task workflows and team provisioning slice

Migration 003 adds guarded status transitions, independent reviews, blocker/reopen/completion notes and attribution, immutable review records, comments with selected workspace mentions, collaborators, handovers/withdrawals and recipient-only notifications. All task actions use row locks, checked revisions, request receipts and append-only audit events. Inactive profile names remain visible for historical authorship; selectors accept only active members. Notification insertion failures are isolated from business mutations.

Administrator-only membership functions provision existing Auth users by exact email and manage role/active flags within the current workspace. The workspace lock serializes membership changes; self-removal of admin access is refused and at least one active administrator is preserved. Passwords and Auth user creation remain in Supabase's dashboard. There is no service-role key in browser or server configuration and no invitation mail is sent. Both the API and database repeat role/workspace checks. Tests cover self-approval denial, collaborator denial, cross-workspace mentions, stale revisions, terminal request withdrawal, retries, notification isolation/failure, admin boundaries, inactive access and retained history.

### Live work logs and timesheets slice (TIME-01–10)

Migration 004 adds an authorized save RPC, immutable revision snapshots, filtered aggregate/read RPC, and per-contributor/day locks for warning checks. New entries derive contributor/workspace from authenticated membership. Own edits and reasoned administrator corrections preserve identity, history and link snapshots. Manager/unauthorized edits, stale revisions, cross-workspace references and invalid durations are rejected. SQL existence filters prevent multi-website time inflation. Existing archived associations may be retained on historical edits but cannot be added to new entries.

The live Timesheets page offers daily/weekly navigation, contributor/website filtering, per-day drilldown, entry editing, warning confirmation, history and server pagination. Authenticated CSV/XLSX endpoints use the same filtered aggregate service and export all matching rows up to an explicit cap. Tests inspect real XLSX XML and CSV content as well as PostgreSQL authorization/aggregation/revision scenarios. Actual overlap detection is unavailable without start/end times; only likely duplicate detection is claimed.

The requested readability refresh uses a separate theme stylesheet instead of replacing existing user-edited typography. Ink navigation, warm neutral surfaces and restrained violet/teal/amber accents provide contrast and hierarchy. Selected text pairs meet 4.5:1; connected browser visual verification remains unavailable. The Next.js route/form documentation bundled under `node_modules/next/dist/docs/` was read before implementation as required by AGENTS.md.

## Defaults and unresolved setup

Asia/Karachi timezone; Monday–Sunday reporting; 12-hour warning; creator is default independent reviewer; no automatic expected reporting coverage without explicit schedules. Demo people/websites are fictitious fixtures. A real team roster and Supabase project credentials are needed for live onboarding. Attachments remain unimplemented until private bucket/type/size policies are configured. Production backups depend on the selected Supabase plan and need a documented restore exercise.

Official references: https://nextjs.org/docs/app/getting-started/installation and https://supabase.com/docs/guides/database/postgres/row-level-security.
# Forms and reporting phase

Migration 005 adds administrator-only draft editing, website assignments applied at publish time, immutable published schemas, weekly submissions, append-only corrections, and immutable SEO observations. Verified membership supplies actor/workspace identity. Both API validation and transactional SQL enforce field types and scope. Unique weekly identity prevents duplicate submissions; revision checks reject stale edits. Corrections use the original schema even after a new publication or archive.

The connected Form builder supports nine field types, ordering, validation bounds, preview, SEO preset, version history and archive. SEO reports supports direct submission, website-filtered history, source/date/scale retention, reasoned revisions and a clearly capped CSV export. Charting, schedules, automatic reminders and attachment storage remain separate work. Local PostgreSQL tests cover permissions, retry receipts, duplicate prevention, pinned schemas and retained measurements; hosted application and browser verification still require manual checks after migration.

# Website management completion slice

Migration 006 adds guarded website editing, archiving and restoration with row locks, expected revisions, payload-bound retry receipts and atomic audit events. Configuration updates merge supported operational fields, preserving existing configuration keys. Managers and administrators may mutate records in their workspace; other active members may read the detail view. Archiving never deletes linked tasks, time entries or reports.

The connected website detail view exposes Details, Tasks, Time logs and Reports, plus a current/archived registry filter. Related queries are scoped to the authenticated workspace with RLS and explicitly capped at 100 records per section. Historical task owners and time contributors remain attributed. New migration setup remains manual; hosted browser verification is separate from local PostgreSQL integration tests.

# Task management completion slice

Migration 007 adds an authenticated metadata-edit RPC with row locks, revision checks, payload-bound retry receipts and atomic before/after audit records. Creator, accepted assignee and workspace managers/admins may edit task details. Caller-provided ownership, review or progress values cannot change those workflow fields. Linked archived websites may be retained, while new inactive/out-of-scope links are rejected. Existing status, independent review and assignment-acceptance functions remain authoritative.

The task drawer has a separate edit form with retained errors and unsaved-change protection, plus progress shortcuts and clearer assignment labels. Client filters combine status/owner/priority/website/search and overdue calendar dates within the explicitly disclosed latest-100 task list. Database integration tests cover scope, unauthorized edits, stale revisions, retry payload changes, atomic invalid links and preserved workflow state. Hosted and visual verification remain pending manual setup.

# Team onboarding slice

Migration 008 adds administrator-managed invitations, cancellation, resend cooldown/rate accounting, delivery status and email-verified transactional acceptance. A verified Auth user without a profile can inspect only the invitation matching their email through a narrow RPC. Acceptance derives user and role from trusted database records, requires a current invitation and active inviting administrator, preserves existing memberships, and appends an audit event. Repeated acceptance does not reactivate an inactive profile. No general table writes are granted and RLS remains enabled.

Privileged Auth operations are isolated in a route-imported mail module using the server-only `SUPABASE_SECRET_KEY`. All application decisions and mutations use the caller's verified session, with duplicate role checks in SQL. Redirect origins come exclusively from configured `DEVORBIT_APP_URL`, never request Origin/Host or supplied destinations. New users receive Auth invitations; existing Auth emails receive an OTP/magic-link resend with user creation disabled. Email errors retain pending invitations and return safe operational messages. No Auth credentials, passwords or link tokens are written to application audit records.

The Team page includes invitation creation/list/resend/cancel and keeps manual provisioning collapsed. `/join` uses the existing implicit browser Auth callback, verifies email-bound invitation metadata, permits password setup and then accepts through the user-scoped RPC. Provider links and application invitations have separate expiries. Database, validation and mocked-provider tests cover scope, verification, cancellation, expiry, duplicate requests, redirects and error handling. SMTP, secret configuration, hosted email delivery and browser acceptance require manual setup/verification.

# Home analytics slice

## Fixed SEO overview and comparison

The fixed SEO page now shows audit coverage, checklist issue counts, missing fields, an attention filter and per-website issue details. Unknown values are counted separately from negative/in-progress checklist statuses; zero scores remain recorded. Generated maintenance reference dates and remarks are excluded from completeness checks.

Saved form history supports comparing an older version with the latest saved version, including note-only changes and source changes. Comparison uses immutable saved snapshots, excluding automatic references and generated summaries. Existing limits remain 30 form versions and 100 dated audit records per website. No new migration is required. Local unit tests cover missing/status distinctions and snapshot comparisons; hosted browser appearance remains unverified.

Migration 009 adds a read-only security-invoker dashboard RPC with active-membership checks, validated calendar range/member/website filters, caller RLS, full-dataset task/time aggregates and capped record previews. Website associations use EXISTS for task/time filtering, avoiding multiplication of durations. Current task snapshots are explicitly distinguished from date-filtered work/completion/measurement facts. SEO joins observations to current report revision pointers, retains source/scale, and never averages sources together. Missing schedule denominators are not invented.

The live Home dashboard contains task status, workload, daily/weekly time, contributor totals, linked-website time and single-website/source SEO charts. Weekly bins preserve minute totals and disclose partial weeks. Recharts animations are disabled to keep the UI steady. Legends, tables and underlying-record previews supplement chart interaction. Preview limits are disclosed separately from aggregate totals. Database tests verify RLS isolation, inactive access, date validation, total reconciliation, shared-link handling and latest SEO revisions; a unit test verifies weekly boundaries. Real hosted charts and browser appearance require verification after migration.

