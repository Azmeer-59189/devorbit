# Connect DevOrbit to Supabase

The `.env` file is ignored by Git. It needs only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Do not place database passwords or service-role keys in public variables.

## Current verification

On October 15, 2026 the supplied configuration successfully reached the Supabase Auth API. Email authentication was enabled, public signup was enabled, and the `workspaces` endpoint reported a missing table. The project credentials are usable, but the DevOrbit database foundation has not yet been deployed.

Run `npm run check:supabase` to repeat read-only checks without printing credentials. A reachable endpoint is not proof that the whole schema or all authorization rules pass.

## Database setup

Preferred: use the Supabase CLI migration workflow with a locally authenticated account, link the project, and apply `supabase/migrations/202610150001_foundation.sql` using `supabase db push`. Review `supabase db push --dry-run` first. A project publishable key cannot apply SQL migrations. CLI account authentication and a database connection must be configured locally; do not paste secret credentials in chat.

For a fresh development project, the same migration can be run manually through the Supabase SQL Editor. This bypasses CLI migration history: record the migration as applied before later using `db push`, rather than applying it twice. Do not run it against an existing production schema without reviewing conflicts.

The foundation enables workspace RLS and denies normal writes. It is intentionally incomplete: workflow RPCs and remaining entities will be introduced in tested vertical slices. It must not be opened up with broad write policies.

## Invitation-only authentication

1. In Supabase Authentication settings, disable **Allow new users to sign up**. This must be disabled at the service level; hiding a signup button is insufficient.
2. Create/invite the intended administrator in Supabase Authentication. The Supabase dashboard account itself is not an application Auth user. Set the user's password privately through the appropriate invite/account flow.
3. In `supabase/bootstrap-admin.sql`, replace the administrator email placeholder with that Auth user's email and run the reviewed script as database owner. It creates one real workspace and an administrator profile; it refuses existing workspaces/profiles and never copies demo data.
4. Restart the Next.js server after environment changes and open `/login`. Sign in with that application account. `/workspace` verifies the JWT with Supabase on the server, then requires an active profile and reads data through the same user's RLS context. Inactive or absent profiles receive no records.

## Enable website and task creation

After the foundation and administrator setup, apply **only** `supabase/migrations/202610150002_live_creation.sql` in the SQL Editor (or the normal CLI migration workflow). Do not rerun the foundation or bootstrap scripts. Keep RLS enabled. The new migration grants authenticated users execution of narrow creation and assignment-response functions; it does not grant unrestricted table writes.

Refresh `/workspace`. Use **Add website** to save a website name, country/chapter, public canonical URL and CMS. This is restricted to active administrators and managers. Use **Create task** to enter a title, description, category, priority, optional due date, primary assignee, websites and independent reviewer. General tasks need no website. Self-assignment is immediately accepted; another user's assignment remains pending and does not change ownership until the recipient accepts in **My tasks**. Declines require a reason and retain the task and request history.

Create operations, linked website rows, assignment attempts and audit events commit in one database transaction. Request IDs prevent duplicate creations on retries. Active membership and workspace-scoped association checks are repeated in the database functions even when the API has already checked them. Functions have fixed empty search paths and no anonymous execution rights.

The original `/` route remains an explicitly labeled local demo. No auth or database policy is inferred from the demo's selected user identity.

## Enable task workflows and team administration

Apply **only** `supabase/migrations/202610150003_task_workflows_and_team.sql` after migrations 001 and 002. Keep RLS enabled; do not rerun previous scripts. This migration adds comments, collaborators, review decisions, recipient-scoped notifications, task completion attribution and narrowly authorized workflow/team functions. It does not create or email Auth users, change passwords, or require a service-role key.

Open a task in `/workspace` to update progress, record blockers, complete a task that does not require review, submit a review-required task, approve/request changes as an independent reviewer, change the reviewer, reopen a terminal task with a reason, comment/mention a teammate, manage collaborators, and request/withdraw handovers. A handover retains current ownership until acceptance. Terminal transitions withdraw pending requests so old acceptance cannot silently reopen completed/cancelled work. Optimistic revision checks reject stale edits; refreshing the drawer keeps unsent comment/reason text. The activity, assignment and review histories remain available.

Notifications cover new assignment events, mentions, review requests and decisions, with read/unread and mark-all-read. Their RLS policy permits only the active recipient to read them. Internal notification delivery is best effort and does not roll back successful task writes. Events use unique keys to prevent duplicates on retries. There are no email/push notifications.

### Add a team member

1. In Supabase, open **Authentication → Users → Add user → Create user**. Create the teammate's application login and set their password privately using the dashboard/account flow. Supabase dashboard accounts are not automatically application users. Keep public signup disabled.
2. As a DevOrbit administrator, open **Team & roles**. Enter the exact same email, their display name, and their role, then select **Add member**.
3. The teammate signs in to DevOrbit with that application email/password. They appear as an assignee, reviewer, collaborator and mention recipient immediately.

Do not run the initial `bootstrap-admin.sql` for additional members. The Add member function provisions only existing Auth users, derives the current workspace from the verified administrator, and refuses to overwrite or move an existing membership. It never collects a password. Developers/managers cannot add people or change roles. Admins can change other members' role/active status on this page. Their own administrator access is protected. Membership changes are serialized, audited and rate limited; inactive users retain historical attribution but lose app and RLS access.

Automated invitation email/account activation links, password recovery, and in-app Auth-user creation are not implemented. Hosted SMTP and a server-only administrative credential would need a separate completed onboarding implementation before claiming that flow. No invitation email is sent by adding a member here.

## Enable live work logs and timesheets

Apply **only** `supabase/migrations/202610150004_work_logs_and_timesheets.sql` after migrations 001–003. Keep RLS enabled and do not rerun earlier migrations. The publishable key cannot apply schema changes, so this remains a database-owner setup step.

Refresh DevOrbit and open **Timesheets → Log time**. Select a work date, whole minutes (1–1,440 per entry), category and description. A task and any number of available websites are optional. New entries always belong to the signed-in contributor; neither the browser nor a task owner supplies that identity. Standalone meetings/training/general work need no task or website. Contributors can work on another person's task without changing ownership.

Daily and Monday–Sunday weekly views support contributor and website filters, date navigation, per-day drilldown and 50-row pagination. Totals, day summaries and counts are calculated over the complete filtered record set on the server. Website filtering uses existence checks rather than a join that could multiply durations. Deactivated contributors and archived websites remain available for historical filtering.

Users edit their own entries. Managers cannot edit someone else's time. Administrators can correct another contributor's entry only with an explicit reason; its contributor remains unchanged. Every save appends an immutable snapshot of the date, minutes, notes, category, task and website IDs with its actor and reason. Existing entries receive a clearly marked system baseline at migration time; earlier unrecorded edits are not invented. **History** displays all available snapshots. Stale edits are rejected; the form can review the latest entry while retaining its draft.

Daily totals above 12 hours and likely duplicate records return warnings without saving first. Review the fields and select **Save anyway** to confirm. No timer or start/end timestamps are collected, so actual interval overlap cannot be detected; the duplicate warning compares contributor, date, duration, task and notes. Advisory locks serialize checks per contributor/date. Idempotent retries do not create extra records; changing an already-saved request's payload produces a conflict rather than silently discarding changes.

**CSV** and **Excel** export the complete filtered selection, not just the visible page. Exports contain numeric minutes, readable duration, contributor, dates, task and website names. Each log remains one row. Formula-like CSV content is escaped, and Excel notes are written as text. Exports are capped at 10,000 entries and date filters at 367 calendar days; larger selections must be narrowed. Empty exports retain the column headings.

Report/template workflows, attachments and advanced analytics remain later slices. The current live task list shows the latest 100 tasks; full server pagination/filters and Kanban are still pending.

## Theme and verification

`app/theme.css` provides the current warm-neutral/violet/teal/amber design over the existing styles, preserving previous font-size improvements. It adds an ink sidebar, tinted workspace and cards, darker text, clear field borders, and readable semantic badges. Selected primary/sidebar/secondary/badge text pairs were checked above WCAG's 4.5:1 normal-text contrast threshold. This does not claim a complete accessibility audit. No browser is connected for screenshot/mobile visual inspection; browser layout and hosted work-log flows still need verification after the migration is applied.

## Verification remaining

### Sign-in troubleshooting

The connection check subsequently confirmed public signup disabled and the workspace endpoint present. This does not verify the administrator profile or a successful user login. Sign-in now checks `/api/workspace` before navigation. Rejected tokens, absent memberships and missing browser sessions display an actionable error rather than silently redirecting back to login. Browser and server configuration were compared without printing their values and matched at diagnosis time.

If the account still cannot enter its workspace, run the read-only `supabase/diagnose-signin.sql` with the expected account email. A personalized copy is available locally in `.local/diagnose-signin.sql`. It returns only account/profile setup booleans; it never returns a password, hash or token. Do not disable RLS to troubleshoot login.

The initial sign-in rejection was traced to the local server's execution sandbox blocking outgoing Supabase requests. A test with an intentionally invalid token returned a network error inside the sandbox and a real Supabase JWT rejection outside it. Run the application server with outbound HTTPS access to the configured Supabase project. Server verification now returns HTTP 503 for connectivity/provider failures, HTTP 429 for rate limits, and HTTP 401 for invalid sessions. It continues to verify identities through Supabase and does not bypass RLS.

Auth settings and project reachability are verified. Successful login, admin provisioning, migration execution, cross-role/workspace RLS and deactivation tests require the database setup and application users. They have not been claimed as complete.

References: https://supabase.com/docs/guides/getting-started/api-keys and https://supabase.com/docs/guides/deployment/database-migrations.
# Forms and weekly reporting (migration 005)

After migrations 001–004, run `supabase/migrations/202610150005_forms_and_reporting.sql` once in the Supabase SQL Editor. Keep RLS enabled. Refresh DevOrbit afterward.

1. As administrator, open **Form builder**, create a template, and add fields or choose the SEO preset.
2. Select its websites, **Save draft**, check **Preview**, then **Publish version**.
3. Active members open **SEO reports**, choose an assigned website and published form, select the Monday of the reporting week, and submit.
4. Open a report in history to see its pinned form version and revisions. Its original submitter or an administrator can make a correction with a reason.

Publishing another version affects new reports. Historical reports keep their original schema. Archiving stops new submissions without deleting history. CSV exports contain the displayed, website-filtered latest 100 reports, with the latest answers and version schema. This phase does not calculate reporting coverage or combine measurements from different methodologies.

# Website management (migration 006)

Run `supabase/migrations/202610150006_website_management.sql` once after migrations 001–005. Keep RLS enabled, then refresh DevOrbit.

Open **Websites → Manage website** (or click its name). Details, Tasks, Time logs and Reports share one website view. Managers and administrators can edit the profile, status, hosting, registrar, CRM, analytics tool names and operational notes. Do not store credentials in configuration. Save changes before archiving. Use the **Archived websites** filter to restore a website. Archiving preserves all existing linked records and stops new website links through the existing creation/reporting flows.

Related sections explicitly show up to 100 records. Time entries linked to multiple websites are not split into per-website allocations. Reports retain their original form version; use Open reporting for submissions and revisions.

# Task management (migration 007)

Apply `supabase/migrations/202610150007_task_management.sql` once after 001–006, with RLS enabled. Refresh DevOrbit, open **Tasks**, select a task and choose **Edit task details**. The creator, accepted assignee, manager or administrator can edit title, description, category, priority, due date and website links. Existing archived website links may be retained; new links must reference current websites. Changes preserve ownership, progress and review settings and append an audit event with previous values.

Task lists combine website/search filters with status, owner, priority and overdue filters. Overdue means before today in the workspace timezone, excluding completed and cancelled tasks. Filters apply to the displayed latest 100 tasks. Clear filters restores that list. Use **Start work**, **Send for review**, **Mark completed**, or the status form for progress. Reassignment requests retain current ownership until accepted.

# Team invitations (migration 008)

1. Apply `supabase/migrations/202610150008_team_invitations.sql` once after 001–007. Keep RLS enabled.
2. Privately add `SUPABASE_SECRET_KEY` (Supabase server secret, or legacy service-role key) to the server `.env`. Never prefix it with `NEXT_PUBLIC_`, put it in browser code, or share it in chat. Configure the same secret in deployment environment variables.
3. Set `DEVORBIT_APP_URL` to the actual application origin, e.g. `http://localhost:3000` for local use or `https://your-deployment.example` for production. Restart the server after changing environment variables.
4. In Supabase Authentication URL Configuration, configure the correct Site URL and allow the join redirect, e.g. `http://localhost:3000/join**` locally and `https://your-deployment.example/join**` in production. Keep public sign-up disabled.
5. The Supabase **Invite user** and **Magic link** email templates must retain the standard `{{ .ConfirmationURL }}` link. The app uses the existing implicit browser-session flow. A customized token-hash or PKCE email template needs a corresponding confirmation handler and is not supported by this page.
6. Configure Supabase email delivery/custom SMTP for actual teammates. The default email service has recipient/rate restrictions. Keep Supabase provider limits in mind in addition to DevOrbit's one-minute resend cooldown and 20 emails per workspace/hour cap.
7. Open **Team → Invite a teammate**, enter name/email/role, and send. The recipient opens the email on a device that can reach the configured application URL, sets a password (minimum 12 characters), and joins. Localhost links only work on the machine hosting DevOrbit; use a deployed HTTPS origin for remote teammates.

Invitation rows remain pending until accepted and expire after seven days. Supabase verification links have their own shorter expiry. Resend renews the application invitation and sends another email. Existing Auth accounts receive a magic link with user creation disabled. Cancelled/expired invitations cannot provision profiles even if an Auth session was obtained. Cancellation does not delete Auth accounts. Existing memberships and inactive accounts are not moved/reactivated by invitations; use access management instead.

Email sending is not atomic with the database. A pending row may remain when delivery fails or its outcome is unknown. Check status, wait for the cooldown, and resend deliberately. A provider's accepted response is not proof the email reached the inbox. No email was sent during local automated tests; test a real invitation after setup. The manual existing-account workflow is retained in a collapsed section.

References: [Supabase invite API](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [email sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithotp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

# Home dashboard and analytics (migration 009)

Apply `supabase/migrations/202610150009_dashboard_analytics.sql` once after 001–008, keeping RLS enabled. Refresh DevOrbit and open **Home**. No new environment variables are needed.

Use date, website and team-member filters above the charts. Dates apply to work dates, completion timestamps converted to the workspace timezone, and SEO measurement dates. Task status, active counts, overdue counts and workload are current snapshots across all dates, filtered by current task owner and website. Time belongs to the recorded contributor; the SEO team filter identifies the report submitter. The default date range is the last 28 calendar days through today in the workspace timezone.

Daily/weekly time charts use integer-minute totals, displaying hours. Weekly grouping starts Monday; boundary weeks include only dates inside the chosen range. Shared website time totals overlap and should not be summed. Standalone time contributes to the overall total and contributor chart even when no website is linked.

SEO charts require one website and one explicitly selected source. Only observations belonging to each report's current revision are used; previous observations remain in historical records. The scale is 0–100 and different source names are never joined into a single trend. No reporting coverage or expected-submission percentage is calculated without a schedule.

Charts aggregate all matching records under caller RLS. **Behind the numbers** previews up to 50 task/time records and provides task detail links and time-log navigation. **View measurements** lists up to the latest 500 matching SEO observations, including source/date/report IDs. These preview caps do not cap task/time totals. Empty data displays an explicit empty state. Use Refresh charts after recording new work or reports.

# Remove time management (migration 010)

Time management has been removed from the current product scope at the owner's request. Apply `supabase/migrations/202610150010_remove_time_management.sql` once after 001–009, keeping RLS enabled. Refresh DevOrbit. No environment changes are needed.

Menus, website tabs, time charts and time exports are removed. Legacy work-log API routes return 410, and authenticated execution of legacy work-log/timesheet RPCs is revoked. The dashboard now queries tasks and SEO reporting only. Existing time records and historical migrations remain intact; no data is deleted. Older time-related setup instructions below are historical and no longer apply to this version.

