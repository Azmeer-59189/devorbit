# Developer Operations Dashboard

> **Scope update from product owner:** Time management is removed from this version. Work-log entry, timesheets, time exports and all time-based charts are excluded. The historical TIME requirements below are retained as reference only and do not authorize reintroducing these features. Focus on websites, tasks, team collaboration and reporting. Existing historical time records are preserved, with application access disabled by migration 010.
## Software Requirements Specification (SRS) & Implementation Handoff

**Version:** 1.0 (implementation baseline)  
**Date:** 2026-10-15  
**Status:** Approved workflow decisions; remaining product assumptions identified below  
**Audience:** Product owner, Codex, Claude Code, developers, reviewers  
**Project type:** Internal, multi-user web application  
**Deployment target:** Vercel  
**Preferred database/auth:** Supabase (PostgreSQL + Supabase Auth)  
**Source references:** `International Website's Dashboard.xlsx`; `Jasim Time Sheet - International Desk.xlsx` (read-only reference data)

> **Important for coding agents:** This document is the source of truth for project initialization. Do not assume unconfirmed details are approved. Implement in vertical slices, preserve data integrity, and ask before expanding the MVP. Do not edit the reference spreadsheets. No application code is included in this document.

---

# 1. Executive Summary

Build a collaborative Developer Operations Dashboard for an international website development team. The application replaces dispersed task/timesheet spreadsheets and a website/SEO status workbook with a structured, searchable, auditable, chart-driven system.

The application must support:
1. Team task creation, assignment with **accept/decline**, ownership, collaboration, handovers, and optional review.
2. Daily manual work logs and automatic daily/weekly timesheet summaries.
3. International website registry, configuration, operational records, and linked tasks.
4. Direct-submission weekly SEO/website reports with history and charts.
5. Admin-managed dynamic form templates that can be shared or assigned per website.
6. Team and website analytics, notifications, exports, role-based access, and auditability.

**Product principle:** Tasks, time entries, website configuration, and periodic reports are different entities, even though they share users and websites.

# 2. Context and Source-Workbook Observations

## 2.1 Website dashboard
The reference workbook has a main worksheet named approximately `International Websites Dashbaor` (as spelled in source), with 14 international website columns and categories covering website information, SEO/performance, donation/CRM, events, email marketing, content, security/maintenance, social media, and notes. A separate `SEO Summary` worksheet includes country, website URL, SEO rating, and audit date.

**Implications:**
- Treat CMS, domain, CRM, integrations, and other relatively stable details as website profile/configuration.
- Treat SEO scores and audits as timestamped measurements, not a single overwritten value.
- Allow website-specific configurations and reporting templates.
- Distinguish SEO score sources/methodologies; source workbook values may differ across tabs.

## 2.2 Task/timesheet workbook
The reference workbook contains `Jasim Rizvi`, `Jasim Rizvi - Web`, and `Azmeer` sheets. Observed formats include dated daily task descriptions, free-text durations (e.g., minutes/hours), notes, and in some sheets priority/status columns. Activities can cover several websites, meetings, maintenance, and other work.

**Implications:**
- Normalize time to integer minutes; display hours/minutes in UI.
- Support standalone work logs without a formal task.
- Support one task linked to multiple websites.
- Provide task categories and historical activity logs.
- Do not assume every historical row is a clean, importable task.

## 2.3 Data migration
Historical spreadsheet import is **optional** and requires a separate mapping/validation plan. MVP must work with new data without importing legacy sheets. Reference workbooks are never edited by this project.

# 3. Goals, Non-goals, and Success Criteria

## 3.1 Goals
- Provide a single workspace for team collaboration and operational visibility.
- Reduce duplicate entry by deriving timesheets from work logs.
- Make SEO and maintenance trends comparable over time.
- Allow admin-configurable website reporting without schema migrations for every field.
- Offer interactive, filterable analytics grounded in underlying records.
- Preserve accountability through permissions, history, and review controls.

## 3.2 Non-goals for MVP
- Automated Google Search Console, Google Analytics, PageSpeed, or SEO crawler integrations.
- AI-generated task or SEO summaries.
- Email/push notifications.
- Automatic time tracker / start-stop timer.
- Advanced project budgeting, billing, payroll, attendance, or HR performance ranking.
- PDF generation and automated scheduled report distribution.
- Full historical spreadsheet migration.
- External client portals or public-facing pages.

## 3.3 Acceptance definition
MVP is acceptable only when the end-to-end scenarios in §15 pass, permissions are enforced server-side, reports are versioned, charts reconcile with records, and core flows are responsive.

# 4. Users, Roles, and Authorization

## 4.1 Roles
**Administrator:** Manages users, roles, websites, reporting templates, and system settings; can correct records with audit history.

**Team Lead/Manager:** Oversees tasks, can assign/reassign work, review designated tasks, manage website profiles, and view team analytics. Cannot manage user roles or publish reporting templates unless explicitly granted.

**Developer:** Views team tasks and relevant website information, creates/assigns tasks, accepts/declines assignments, collaborates, logs own time, and submits SEO reports.

## 4.2 Permission baseline

| Capability | Developer | Manager | Admin |
|---|---|---|---|
| View internal team tasks | Yes | Yes | Yes |
| Create and assign tasks | Yes | Yes | Yes |
| Accept/decline tasks assigned to self | Yes | Yes | Yes |
| Edit task content | Creator/assignee per rules | Yes | Yes |
| Update task progress | Current assignee | Yes | Yes |
| Comment and mention teammates | Yes | Yes | Yes |
| Add/remove collaborators | Task creator/assignee | Yes | Yes |
| Enter/edit own work logs | Yes | Yes | Yes |
| Edit another user's work logs | No | No | Authorized correction only |
| Submit weekly SEO reports | Yes | Yes | Yes |
| Correct own submitted report | Yes, via revision | Yes, via revision | Yes, via revision |
| Manage website configuration | Read-only | Yes | Yes |
| Create/publish form templates | No | No | Yes |
| Manage users/roles | No | No | Yes |
| View team-wide analytics | Yes (non-sensitive) | Yes | Yes |

**Rules:** All access must be enforced in backend and Supabase RLS, not only hidden UI controls. Managers must not silently modify another user's logged time. Deactivated users remain linked to historical records. Team-wide visibility is limited to the organization/workspace.

## 4.3 Organization boundary
Design the schema with a `workspace_id` / organization boundary for safe isolation, even if MVP deploys to only one team. Do not build full multi-tenant billing or workspace switching in MVP.

# 5. Confirmed Workflow Decisions

- **Collaboration model:** Collaborative team; developers can assign work to one another.
- **Assignment model:** Recipient must accept or decline.
- **Task review:** Optional per task.
- **Weekly reporting:** Direct submission; no mandatory approval.
- **Time tracking:** Manual entry only.
- **Form management:** Admin-configurable dynamic forms, assignable to websites.
- **Analytics:** Interactive charts with filters and drill-down.
- **Deployment:** Vercel; Supabase preferred.
- **Coding:** Codex and Claude Code will implement. This SRS contains no application code.

# 6. Information Architecture / Navigation

**Workspace**
1. Overview
2. My Tasks
3. Team Task Board
4. Timesheets
5. Notifications

**Websites & Reporting**
6. Websites (list and detail)
7. SEO & Website Reports
8. Analytics & Exports

**Administration (role-gated)**
9. Form Builder
10. Team & Roles
11. Settings

**Cross-cutting views:** Task detail drawer/page, task creation modal/page, website detail tabs, report entry and revision views, search results, user profile.

# 7. Detailed Functional Requirements

Identifiers are stable requirement IDs; agents should reference them in implementation plans and tests.

## 7.1 Authentication & profiles
- **AUTH-01** Email/password login through Supabase Auth.
- **AUTH-02** Admin invites/provisions team members; no public self-registration in MVP.
- **AUTH-03** User profile includes display name, email, role, active flag, optional avatar, timestamps.
- **AUTH-04** Users may update their own profile and notification preferences.
- **AUTH-05** Sessions and logout are secure; unauthorized routes and API calls denied.
- **AUTH-06** Deactivation blocks future access but preserves historical authorship.

## 7.2 Task creation and assignment
- **TASK-01** Create task with title (required), description, category, priority, due date (optional), website associations (0..n), creator, primary assignee (optional), collaborators, and review-required flag.
- **TASK-02** A task has exactly one primary assignee at a time, or is unassigned.
- **TASK-03** Assigning to another user creates a **pending assignment request**; assignee cannot be considered owner until acceptance.
- **TASK-04** Recipient can accept or decline; decline requires reason and notifies creator.
- **TASK-05** Self-assignment is accepted immediately.
- **TASK-06** A new assignee on handover must accept; retain prior ownership and work logs.
- **TASK-07** Task creator may withdraw/cancel a pending request.
- **TASK-08** Accepted tasks support To Do, In Progress, Blocked, In Review (conditional), Completed, Cancelled.
- **TASK-09** Blocked state requires blocker reason; clearing blocked state preserves history.
- **TASK-10** If review is required, assignee submits for review; designated reviewer approves or requests changes. Reviewer must not be the same person as assignee for tasks requiring independent review.
- **TASK-11** If review is not required, assignee may complete directly.
- **TASK-12** Completed tasks store completion timestamp, actor, and optional completion notes.
- **TASK-13** Reopening a task records actor, reason, and previous state.
- **TASK-14** Priorities: Low, Medium, High, Urgent; due date optional.
- **TASK-15** Tasks can be linked to multiple websites; general/team tasks may have none.
- **TASK-16** Task table supports text search, pagination, sort, filters by assignee, creator, status, priority, website, and date.
- **TASK-17** Kanban shows accepted tasks by progress status; pending requests appear separately.
- **TASK-18** Kanban drag-and-drop must obey workflow transitions and server authorization.
- **TASK-19** Optional attachments are restricted to approved file types/sizes and stored privately.
- **TASK-20** Prevent destructive hard-deletes of tasks in normal UI; use archive/cancel with history.

### Assignment state versus task progress
Maintain **two separate state machines**:
- Assignment: Unassigned / Pending / Accepted / Declined / Withdrawn / Superseded.
- Progress: To Do / In Progress / Blocked / In Review / Completed / Cancelled.

A declined request is an event, not a task's permanent progress state. Multiple historical assignment attempts may exist for a task, but no more than one active pending primary-assignee request should exist at once.

## 7.3 Collaboration
- **COL-01** Task comments with author and timestamp.
- **COL-02** @mentions select actual workspace users and create notifications.
- **COL-03** Add/remove collaborators separately from primary assignee.
- **COL-04** Collaborators may comment and log their own time; they cannot mark another assignee's task complete.
- **COL-05** All assignments, declines, handovers, status changes, review decisions, and significant edits generate immutable audit events.
- **COL-06** Activity feed orders events newest first and links to affected records.
- **COL-07** Task links/attachments may be shared only with authorized team members.

## 7.4 Work logs / timesheets
- **TIME-01** Add manual work log with work date, user, duration in integer minutes (>0), category, notes, optional task, optional website links.
- **TIME-02** Permit standalone entries for meetings, coordination, training, maintenance, and general work.
- **TIME-03** Work logs linked to a task do not inherit ownership; each contributor logs their own time.
- **TIME-04** A work log may reference multiple websites, but **do not multiply its duration** when aggregating total time across websites.
- **TIME-05** Daily and weekly views with totals and filters.
- **TIME-06** User can edit own logs; preserve revision/audit history.
- **TIME-07** Admin corrections must include reason and original value history.
- **TIME-08** Reject invalid/negative/zero durations; warn (not silently reject) on suspicious daily totals and overlapping duplicate entries.
- **TIME-09** Timezone-aware timestamps; `work_date` represents the user's intended calendar date.
- **TIME-10** Timesheet export to CSV/Excel with selected filters.

## 7.5 Website registry
- **SITE-01** Admin/manager can add, update, archive website profile.
- **SITE-02** Website profile fields: display name, country/chapter, canonical URL, CMS, status, assigned team members, notes, optional integration/configuration metadata.
- **SITE-03** Unique website identity must not rely solely on display name; canonical URL uniqueness scoped to workspace where practical.
- **SITE-04** Detail tabs: Overview, Tasks & Updates, SEO History, Maintenance, Integrations, Activity History.
- **SITE-05** Link website to multiple tasks, logs, form templates, and reports.
- **SITE-06** Archive website without deleting historical data.
- **SITE-07** Store no passwords, tokens, API secrets, or payment credentials in ordinary profile fields or custom-form responses.
- **SITE-08** Configuration changes are audited.

## 7.6 Form builder
- **FORM-01** Admin creates template with title, description, type (SEO / Maintenance / Website Update / Custom), field definitions, and website assignments.
- **FORM-02** Field types: short text, long text, integer/decimal number, date, URL, dropdown, multi-select, checkbox.
- **FORM-03** Fields support label, stable key, required flag, help text, order, and type-appropriate validation.
- **FORM-04** Admin can reuse template across websites or assign to selected websites.
- **FORM-05** Templates have Draft / Published / Archived status.
- **FORM-06** Publishing a changed template creates a new immutable version; old submissions remain bound to their version.
- **FORM-07** Draft editing does not mutate published versions.
- **FORM-08** Forms support preview before publication.
- **FORM-09** Restrict dangerous fields (e.g., password/secret collection); validate both client- and server-side.
- **FORM-10** Common analytical metrics should have standardized keys/units; arbitrary JSON fields should not automatically become chart series.
- **FORM-11** Changing a field type or options in a new version must not reinterpret previous responses.

## 7.7 SEO & periodic website reporting
- **RPT-01** Developer selects website, reporting type/template, reporting week/period, and completes fields.
- **RPT-02** Direct submission publishes report to authorized dashboards immediately; no manager approval step.
- **RPT-03** Reports store submitter, submission time, reporting period, template version, and website.
- **RPT-04** A submission can be corrected via a new revision; previous revisions remain available.
- **RPT-05** Prevent accidental duplicate active reports for same website + template + reporting period, while permitting explicit revisions.
- **RPT-06** Display latest and historical reports per website.
- **RPT-07** SEO metrics store score, measurement date, source/tool/methodology, unit/scale, and optional context.
- **RPT-08** Charts must compare like-for-like metrics only (same metric and compatible method/scale).
- **RPT-09** Reporting coverage shows expected vs submitted periods **only when an explicit reporting schedule/assignment exists**.
- **RPT-10** Reports support filtering, search, and export.
- **RPT-11** Direct submission does not grant unrestricted editing of another person's reports; revisions require appropriate authorization.

## 7.8 Notifications
- **NOTIF-01** In-app notification for assignment request, acceptance, decline, mention, reassignment, review request, and review result.
- **NOTIF-02** Read/unread status and link to target.
- **NOTIF-03** Notification list, unread badge, mark read, mark all read.
- **NOTIF-04** Avoid duplicate notifications from retries; notification delivery is best-effort and does not determine whether a task update succeeded.
- **NOTIF-05** Email and push are out of scope for MVP.

## 7.9 Analytics & exports
- **AN-01** Overview KPIs: accepted active tasks, pending assignments, blocked/overdue tasks, work minutes, website activity, latest reporting coverage.
- **AN-02** Task charts: status breakdown, created/completed over time, overdue trends.
- **AN-03** Team charts: work minutes by developer, active workload, completion trends; **not** a simplistic employee performance ranking.
- **AN-04** Website charts: tasks/updates by website and outstanding issues.
- **AN-05** SEO charts: score trends and audit history by website and methodology.
- **AN-06** All charts support filters (date range, developer, website, status where relevant), accessible legends/tooltips, and drill-down to source records.
- **AN-07** Define denominators and timezone boundaries consistently; show empty states instead of fake zeroes.
- **AN-08** Export filtered records to CSV and XLSX.
- **AN-09** Multi-website tasks count once in global totals; website-specific counts can include the same task for each linked site and must label this clearly.
- **AN-10** Time totals never double-count multi-website work logs.

# 8. Page-by-Page UI Requirements

| Page | Primary components | Primary actions | Key states |
|---|---|---|---|
| Overview | KPI cards, task charts, activity feed, attention queue | Filter, drill down, quick create | Loading, empty, filtered, error |
| My Tasks | Tabs: Assigned, Pending, Created, Completed | Accept/decline, update, create | Pending acceptance, blocked |
| Team Task Board | Kanban + table toggle, filters | Drag status, open task, assign | Permission denied, review required |
| Task Detail | Header, metadata, comments, activity, logs, attachments | Comment, mention, handover, log time | Pending, active, review, completed |
| Timesheets | Day/week toggle, entries table, totals | Add/edit log, export | Missing logs, invalid duration |
| Websites | Searchable directory, status chips | Open/add/archive | Archived, no websites |
| Website Detail | Profile + six tabs | Edit profile, view reports/tasks | No reports, inactive site |
| SEO Reports | Website/week selector, form, report history | Submit, revise, export | Duplicate period, outdated template |
| Analytics | Interactive charts and filters | Drill down, export | No data, incompatible metric |
| Form Builder | Template list, editor, preview, version history | Draft, publish, assign | Unsaved changes, archived |
| Team & Roles | User list, invitations, roles | Invite, deactivate, change role | Pending invite, access denied |
| Notifications | Inbox and unread counter | Mark read, open linked item | Empty/unread |
| Settings | Profile, workspace settings, preferences | Update allowed settings | Validation/error |

**UI conventions:** Desktop-first responsive design; collapsible sidebar; accessible keyboard navigation; loading skeletons; clear form validation; light mode default, dark mode optional; side drawer for task detail on desktop and full-page layout on mobile. Avoid decorative charts that cannot be traced to records.

# 9. Conceptual Data Model

The following entities are conceptual; exact SQL migrations are a separate design deliverable.

| Entity | Important fields / relationships |
|---|---|
| Workspace | id, name, settings |
| UserProfile | auth_user_id, workspace_id, name, role, active |
| Website | workspace_id, name, country, url, cms, status, configuration |
| WebsiteMember | website_id, user_id, assignment type |
| Task | workspace_id, creator_id, assignee_id nullable, title, description, priority, progress_state, review_required, due_at, completed_at |
| TaskWebsite | task_id, website_id |
| AssignmentRequest | task_id, proposed_assignee_id, requester_id, state, response_reason, timestamps |
| TaskCollaborator | task_id, user_id |
| TaskComment | task_id, author_id, body, timestamps |
| TaskReview | task_id, reviewer_id, decision, feedback, timestamps |
| WorkLog | user_id, task_id nullable, work_date, duration_minutes, category, notes |
| WorkLogWebsite | work_log_id, website_id |
| FormTemplate | workspace_id, name, type, state |
| FormTemplateVersion | template_id, version_number, immutable field schema |
| FormTemplateWebsite | template_id, website_id |
| ReportSubmission | website_id, template_version_id, period_start, period_end, submitter_id, current_revision_id |
| ReportRevision | submission_id, revision_number, answers JSON, actor_id, timestamp, reason |
| MetricObservation | website_id, report_revision_id nullable, metric_key, value, unit, source, measured_at |
| Notification | recipient_id, type, target, read_at, created_at |
| AuditEvent | workspace_id, actor_id, entity_type, entity_id, action, before/after safe metadata, created_at |
| Attachment | owner/parent reference, private storage path, metadata |

**Database invariants:**
- Foreign keys and constraints prevent orphaned relationships.
- User IDs come from authenticated identity, never blindly trusted request payloads.
- `workspace_id` must be checked on every cross-entity association.
- Published form versions and report revisions are immutable.
- Audit events are append-only to normal users.
- Task ownership cannot change without acceptance (except explicitly authorized admin recovery, always audited).
- Dates, timestamps, and minutes use unambiguous types.
- All destructive actions are soft-delete/archive where business history matters.

# 10. Business Rules & Edge Cases

1. Pending assignment does not count as accepted workload.
2. Declining does not delete the task or erase the attempted assignment.
3. An inactive recipient cannot receive a new assignment.
4. Handover retains previous comments, work logs, and actor history.
5. Only designated reviewer/authorized manager can approve review-required tasks; avoid self-approval.
6. A blocked task can still accumulate legitimate work logs.
7. Time logged by collaborators is credited to those collaborators, not automatically to task owner.
8. General meetings need no website/task association.
9. A report correction must not overwrite its original submission.
10. A published template edit creates a new version; older reports remain renderable.
11. Archived websites remain in historical filters and reports.
12. Multi-website associations must not inflate global time totals.
13. Chart date filters use a consistent workspace timezone, defaulting to `Asia/Karachi` unless admin changes it.
14. For overdue tasks, compare due dates using defined timezone and exclude completed/cancelled tasks.
15. Handle concurrent edits with server-side validation; show conflict feedback where data may have changed.

# 11. Non-functional Requirements

## 11.1 Security
- Supabase Auth, least-privilege RLS policies, secure server-side authorization.
- No service-role key or secrets exposed in browser bundles.
- Never collect WordPress/admin/payment credentials through dynamic forms.
- Private file storage with signed, short-lived access where needed.
- Validate all inputs, sanitize rendered user content, protect against XSS and CSRF as appropriate.
- Apply rate limiting to sensitive mutations/auth-adjacent routes.
- Record security-relevant changes without logging secrets.

## 11.2 Reliability and data integrity
- Use transactions for multi-step state changes (e.g., acceptance + owner update + audit event).
- Idempotency/retry handling for duplicate submissions/notifications.
- Define backup/recovery strategy appropriate to hosting plan; free tier does not imply guaranteed production-grade backups.
- No silent loss of work logs, reports, or historical revisions.

## 11.3 Performance
**Initial targets, to validate under realistic data:** dashboard interactive within ~3 seconds on typical broadband after initial auth; paginated task list queries ideally <1 second server-side for ordinary filters; charts aggregate server-side rather than downloading entire tables. These are design targets, not measured guarantees.

## 11.4 Accessibility and usability
- Responsive at common mobile/tablet/desktop widths.
- Keyboard-accessible controls, clear focus states, readable contrast.
- Do not rely on status color alone; include text/icons.
- Empty, loading, error, offline/retry, and permission-denied states.
- Confirm destructive actions; warn before leaving unsaved forms.

## 11.5 Observability
- Error logging with request correlation where practical.
- Health checks and clear deployment configuration.
- No secrets or sensitive free-text content in telemetry.

# 12. Recommended Technology Stack

| Layer | Recommended |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| UI | Tailwind CSS, shadcn/ui |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth |
| Storage | Supabase Storage for private attachments |
| Hosting | Vercel |
| Tests | Unit/integration + end-to-end tests (tool selection by coding agents) |
| Version control | GitHub |

Use supported, mutually compatible stable releases at implementation time. Verify current Vercel/Supabase free-tier quotas and operational limitations before production rollout. Keep database migrations in version control.

# 13. API / Service Boundaries (Technology-Agnostic)

- **Identity service:** current user, profiles, roles.
- **Task service:** CRUD, assignment lifecycle, progress transitions, review, comments.
- **Work log service:** entries, totals, export.
- **Website service:** directory, configuration, relationships.
- **Template service:** draft, validation, publish, versions, assignments.
- **Reporting service:** submission, revisions, metric extraction, history.
- **Analytics service:** aggregated, filtered, authorized queries.
- **Notification service:** durable in-app events/read state.
- **Audit service:** append-only event recording.

Codex/Claude should decide exact route/Server Action shapes only after schema and RLS review. Prefer clear service boundaries and avoid business rules implemented solely in UI components.

# 14. Development Phases & Agent Handoff

## Phase 0 — Project initialization
- Create Next.js TypeScript project, lint/format config, env template, README.
- Set up Supabase project connection and local development guidance.
- Establish route groups, UI component conventions, design tokens, test scaffolding.
- Draft initial schema and RLS matrix **before implementing business features**.
- Create a minimal CI workflow for lint/typecheck/tests.

## Phase 1 — Auth, users, website registry
- Authentication, invitations, roles, RLS.
- Website CRUD/archive, membership, basic profile UI.
- Tests for cross-role and cross-workspace access.

## Phase 2 — Tasks and collaboration
- Task create/list/detail.
- Assignment request acceptance/decline, self-assignment, handover.
- Comments, collaborators, statuses, optional review, audit trail.
- My Tasks and team board.

## Phase 3 — Timesheets
- Manual work log entry, task association, standalone entries.
- Daily/weekly totals, filtering, edits and audit.
- CSV/XLSX export.

## Phase 4 — Form builder and reporting
- Template drafts, publishing/versioning, website assignment.
- Weekly SEO direct submissions, revisions, metrics, report history.

## Phase 5 — Analytics and notifications
- KPIs, interactive charts, drill-down, date/site/developer filters.
- In-app notifications and activity feed.

## Phase 6 — Hardening and deployment
- Security/RLS tests, performance checks, responsive QA, accessibility.
- Vercel deploy, Supabase production configuration, backup/recovery runbook.
- UAT against §15 scenarios.

**Agent operating instructions:**
1. Read this SRS before generating files.
2. First produce a proposed architecture, data model, RLS plan, and phased task list; do not build the entire app in one pass.
3. For each phase, implement smallest complete vertical slice with tests.
4. Run lint/typecheck/tests and report results.
5. Do not alter the source Excel files.
6. Document assumptions, deviations, environment variables, migrations, and manual setup steps.
7. Ask before adding out-of-scope integrations, paid services, or new product features.
8. Do not invent seeded production data; clearly label demo fixtures.
9. Never use admin/service-role keys in client-side code.
10. Review authorization and audit requirements before merging a feature.

# 15. End-to-End Acceptance Scenarios

| ID | Scenario | Pass condition |
|---|---|---|
| UAT-01 | Developer A assigns to B | B sees Pending; task not yet counted as B's accepted work |
| UAT-02 | B declines with reason | A notified; reason preserved; task remains available for reassignment |
| UAT-03 | B accepts | Ownership changes; task enters To Do; history preserved |
| UAT-04 | A adds C as collaborator | C can comment/log own time but cannot complete B's task |
| UAT-05 | Task marked Blocked | Reason required and displayed |
| UAT-06 | Review-required task submitted | Enters In Review; authorized reviewer approves/requests changes |
| UAT-07 | Non-review task completed | Assignee can complete directly |
| UAT-08 | Developer logs meeting time | Entry appears in timesheet without task/website |
| UAT-09 | One task covers three websites | Global task count remains one; website filters find task |
| UAT-10 | Two developers log time on same task | Separate logs and correct combined total |
| UAT-11 | Admin publishes new form version | Old reports render against old version |
| UAT-12 | Developer submits weekly SEO report | Visible immediately in report history and eligible charts |
| UAT-13 | Developer corrects report | New revision; old values preserved |
| UAT-14 | SEO scores use different methodologies | Chart prevents misleading direct comparison |
| UAT-15 | Unauthorized developer edits another's time | Rejected by server/RLS |
| UAT-16 | Website archived | No new normal assignments; old tasks/reports still visible |
| UAT-17 | Chart filters applied | Aggregates reconcile to underlying records |
| UAT-18 | User deactivated | Login/access blocked; historical attribution intact |
| UAT-19 | User opens mobile UI | Core task, log, and report flows remain usable |
| UAT-20 | Export timesheets | Export matches selected filters and time totals |

# 16. Open Questions / Product Assumptions

These do not block initial scaffolding, but must be resolved before affected features ship:

| Topic | Proposed default | Decision needed by |
|---|---|---|
| Number of initial users | Small internal team | Phase 1 |
| Website roster | Use workbook as reference, admin can edit | Phase 1 |
| Who may edit task description after acceptance | Creator, assignee, manager/admin with audit | Phase 2 |
| Assignment decline/reassign handling | Creator selects another assignee | Phase 2 |
| Review assignee | Creator by default, override permitted | Phase 2 |
| Work log maximum daily duration | Warning above 12 hours, not hard block | Phase 3 |
| Reporting period | Calendar week Monday–Sunday in workspace timezone | Phase 4 |
| Expected weekly reports | Explicit per-website schedule assignment | Phase 4 |
| Attachment size/types | Conservative allowlist; configure from storage quotas | Phase 2 |
| Reporting metric standardization | SEO score 0–100 only when source supports that scale | Phase 4 |
| Data import | Separate optional migration project | After MVP |
| Branding | Neutral professional UI; organization branding configurable | Phase 0 |
| User onboarding | Admin invite only | Phase 1 |

# 17. Definition of Done (Each Feature)

A feature is complete only if:
- Functional behavior matches its requirement IDs.
- Validation and authorization are enforced server-side.
- Database migrations and RLS changes are reviewed.
- Relevant unit/integration/E2E tests pass.
- Audit/history behavior is correct where required.
- Loading, empty, error, and permission states are handled.
- Mobile layout and keyboard navigation are checked.
- Documentation and environment instructions are updated.
- No sensitive credentials are committed.
- No reference spreadsheets are modified.

# 18. First Prompt for Codex or Claude Code

> Read `PROJECT_SRS.md` fully. We are initializing an internal Developer Operations Dashboard. Do not start implementing all features immediately. First review the requirements, identify ambiguities and security risks, propose the Next.js/Supabase architecture, draft the PostgreSQL entity relationships and RLS authorization matrix, and produce a phased implementation plan aligned to the SRS requirement IDs. Then scaffold only Phase 0 after presenting the plan. Do not edit the reference Excel workbooks, do not invent business requirements, and do not expose Supabase service-role credentials to the browser. All future implementation must follow this SRS and include tests.

---

**Document change policy:** When a confirmed requirement changes, update the version/date, summarize the decision, and adjust related acceptance tests before implementation.
