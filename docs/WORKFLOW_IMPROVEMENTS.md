# Workflow improvements

- SEO → open a website → Latest saved review → Review checklist issues → Create task. The existing task form is prefilled with the issue, website, SEO category, saved version, source and field note. Choose an assignee and deadline before saving. Assignment acceptance and independent review rules still apply. Creating a task does not mark an SEO issue as resolved. Archived websites cannot create tasks from this action.
- Websites → open a website. Overview now shows latest SEO audit, checklist issue/missing-field counts, up to five open tasks from the loaded 100-task preview, and website information. Open SEO form & history links to this specific website.
- Notifications show an exact unread total from the server, a header badge refreshed every minute/on window focus/after marking read, an unread-only filter, refresh/retry, workspace-local timestamps and direct task opening. The notification list remains limited to the latest 100 records.
- Narrow-screen forms, website overview, toolbars and modal scrolling have been adjusted. Focus indicators and reduced-motion support were added.

No new database migration is needed for these improvements. Local validation passes 86 tests, lint, formatting, TypeScript and production build. Browser and mobile appearance remain unverified because no browser surface is connected.
