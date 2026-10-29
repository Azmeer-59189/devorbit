# Tasks in Google Sheets

Google Sheets is the main task editor. DevDesk shows the synced tasks and uses their status, assignee, websites and dates in dashboard charts. Sheet tasks can be marked completed directly; dashboard assignment acceptance and review are not required for this reporting workflow.

The prepared workbook contains five current tasks in separate **Workspace Administrator**, **Jasim Rizvi**, and **azmeer** tabs, plus a reference list of fourteen websites:
https://docs.google.com/spreadsheets/d/1FDa_5fAC7-HDMKrOlS1s1rx3lESrDKo8B7Fi7i9IlQQ/edit

## One-time connection

1. Apply [migration 021](../supabase/migrations/202610290021_task_sheet_sync.sql), [migration 022](../supabase/migrations/202610290022_member_task_sheets.sql), then [migration 023](../supabase/migrations/202610290023_task_sheet_without_category.sql) in the Supabase SQL editor, after 020. These add sync functions and tracking tables; they do not change existing tasks until a sync runs.
2. Add these **server-only** variables to Vercel (and `.env` for local testing):
   - `TASK_SHEET_ID`: `1FDa_5fAC7-HDMKrOlS1s1rx3lESrDKo8B7Fi7i9IlQQ`
   - `TASK_SHEET_WORKSPACE_ID`: your existing workspace UUID.
   - `TASK_SHEET_ACTOR_ID`: the profile UUID of an active administrator or manager who owns this integration. Updates are attributed to this integration owner, not to individual sheet editors.
   - `TASK_SHEET_SYNC_SECRET`: a new random key of at least 32 characters. Generate one locally with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Never use the Supabase secret here.
   - The existing `SUPABASE_SECRET_KEY` and `NEXT_PUBLIC_SUPABASE_URL` must also be configured.
3. Deploy the updated app with those environment variables.
4. Open the Google Sheet → **Extensions → Apps Script**. Replace the starter code with [google-task-sheet.gs](../scripts/google-task-sheet.gs), then save.
5. Run `onOpen` once (or reopen the spreadsheet). Choose **DevDesk → Connect dashboard**. Enter your production dashboard URL and the new sheet sync key. Google will ask you to authorize the script.
6. The connection performs the first sync and then creates a five-minute trigger. Check the **Sync** tab for the successful time. The dashboard displays the same sync time and a link back to the sheet.

Google's [time-driven triggers](https://developers.google.com/apps-script/reference/script/clock-trigger-builder) run the script; no public spreadsheet or Google service-account API key is required. Only trusted task editors should have edit access: editors of a bound script can access its script properties. Use a separate sync key so its access is limited to this sheet/workspace connection.

## Everyday use

- Add a task on your **named member tab**. Fill Title, Website, Priority, Status and relevant dates. The tab name determines the assignee. New task IDs are generated automatically when syncing; existing IDs must stay unchanged. The ID column is hidden to keep editing simple.
- The visible columns are Title, Website, Website 2, Website 3, Priority, Status, Created date, Completed date, and Archived. Category, description, due date, blocker and completion notes are omitted; existing dashboard values for them are preserved.
- Choose websites from the dropdowns. Use the optional Website 2 and Website 3 dropdowns for tasks covering multiple sites. Leave them all blank for a general team task. Invalid names are rejected before sync and checked again against the dashboard registry.
- When adding a member, update the reference tab and create a task tab with exactly that active member's display name and the same headers/dropdowns. Duplicate member names are rejected. To reassign a task, move its full row to the other tab, retaining its ID; do not leave a duplicate in the original tab.
- Mark **completed** and enter **Completed date** when finished. Clear that date if reopening. The completed date drives period-based dashboard reporting. For blocked tasks, an existing blocker is retained; a new task records that no blocker reason was supplied in Sheets.
- Use **DevDesk → Sync now** before a presentation, then refresh the dashboard. While the dashboard stays open, it checks sync status each minute and refreshes charts after a new successful sync.
- Set **Archived** to **Yes** to remove a task from active reports. Removing a sheet row never deletes or archives dashboard data. Duplicating a task row requires clearing its copied Task ID first (unhide column A).
- Make task changes in the sheet. Existing dashboard task controls remain available, but they do not write back to Sheets. A later changed sheet row takes precedence.

## Errors and recovery

The Sync tab keeps the previous successful time and shows the latest error. Fix the indicated field and sync again. Each request processes at most 200 rows atomically; up to 5,000 rows are sent in batches. Earlier successful batches remain saved if a later batch fails. Retrying unchanged rows creates no duplicate tasks or audit events. A blank sheet keeps existing tasks.

The server checks the secret, spreadsheet identity, configured workspace, active integration owner, exact assignee/website membership, dates, statuses and stable task IDs. A task cannot be moved from another workspace or another connected sheet. The Supabase write RPC is executable only by the server service role. Change the sync secret in Vercel and reconnect the script to revoke an old key.

This is one-way task sync. SEO and website-feature fields continue to be managed in DevDesk.

The former combined Tasks tab is kept hidden as **Tasks (original)** for reference. The updated script reads only member tabs listed in column A of **Team and websites**, so this snapshot is never synced.
