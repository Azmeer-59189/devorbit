# DevOrbit styling

`app/globals.css` is the single stylesheet, imported once by `app/layout.tsx`.
It owns the shared design tokens, reusable controls, workspace component styles,
sign-in/invitation pages, responsive rules, and interaction states.

## Theme palette

The user-selected palette uses blue-gray `#DBE2EF` for the main background, off-white `#F9F7F7` for cards, tables, drawers and sidebar, blue `#3F72AF` for actions and links, and navy `#112D4E` for headings and text. Active navigation uses blue with white text. Semantic task states retain distinct colors.
The dashboard summary shows Active tasks, Overdue, Due for SEO audit, and Completed. Blocked and Awaiting acceptance remain in task filters but have no summary cards.

## Making changes

- Start with the `:root` design tokens for shared surfaces, text, borders, actions,
  chart colors, fonts, and corner radii. Change a token when the change should
  apply everywhere that uses it.
- Find the component's existing selector and edit it in place. Do not append a
  theme file or a second override stylesheet.
- Base selectors such as `.button`, `.card`, and `.field` provide shared behavior.
  `.connected-app` variants intentionally give the compact workspace different
  sizing from the sign-in and invitation flows.
- State rules (`:hover`, `:focus-visible`, `:disabled`, `[aria-pressed]`) and media
  queries are intentional variations. Keep them with the relevant rules when
  making changes, and check their cascade order before moving them. A later
  unconditional rule can override an earlier media query.
- Use a CSS Module for a new, isolated feature when its styles do not belong in
  the shared system. Import it from its component; do not use it to override
  unrelated global selectors.

## Responsive behavior

The light workspace uses 14px navigation, table content, and form inputs;
13px labels; 12px supporting captions; and 16px card headings. Shared muted
text and primary actions use the contrast-adjusted tokens at the top of the
stylesheet. Task statuses have permanent colors through `--status-*` tokens:
teal for completed, sky blue for in progress, purple for review, red for blocked,
ochre for not started, and slate for cancelled. Bind board/chart elements with
`data-status`; task badges use the corresponding status class. Do not assign
status colors by array index.

The dashboard opens with one row of summary tiles that link to filtered task
lists, each with a status-coloured icon chip and a small figure, and the explanation
of date/filter scope is available in the “About these numbers” disclosure. Cards are
soft: `--radius-card` corners with `--shadow-card`, lifting to `--shadow-card-hover`.

Chart components live in `components/dashboard-charts.tsx` and share one tooltip. The
completion trend layers the selected period over the previous one with monotone curves,
in day, week or month buckets by range length (`lib/dashboard-activity.ts`). A status
donut, ranked member and website bars, and open-work columns sit below it. Status
colours come from the `--chart-*` tokens and were checked for colour-blind separation;
keep every figure beside a label or data table, since amber and slate are below 3:1 on
the card surface. Data tables preserve exact values; larger rankings scroll vertically.

- Up to 700px: collapsed navigation, mobile spacing, single-column content.
- Up to 800–850px: stacked analytics and reporting layouts.
- Up to 1000–1250px: compact sidebar, tables, and forms.
- Activity charts: an 8/4 row then three columns on desktop, full-width trend and two columns up to 1200px, and one column below 850px.
- Short desktop windows have compact navigation spacing.
- Reduced-motion preferences disable animation and transitions.

These thresholds reflect the existing layouts. Change them deliberately rather
than introducing another breakpoint to counter an earlier rule.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:e2e`
after changes that affect shared styles or imports. The browser tests in `e2e/`
open every workspace page with mocked data at desktop and phone width, fail on
uncaught errors or a page wider than the window, and cover the main workflows.
For a change meant to be invisible, such as removing unused selectors, compare
full-page screenshots before and after with Playwright's `toHaveScreenshot`. Inspect the dashboard, task board, SEO forms,
dialogs, and sign-in flow at mobile, tablet, and desktop widths. Include keyboard
focus, active navigation, disabled controls, expanded details, and reduced motion.

The consolidation was compared against the previous three stylesheets using
local representative workspace and authentication markup at 390, 700, 768, 1000,
1280, 1536, and 1920px. This comparison checks rendering, not authenticated data
flows. Obsolete demo-dashboard and time-tracking selectors were removed; dynamic
status classes and chart-library selectors were retained.
