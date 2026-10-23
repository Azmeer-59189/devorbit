# DevOrbit styling

`app/globals.css` is the single stylesheet, imported once by `app/layout.tsx`.
It owns the shared design tokens, reusable controls, workspace component styles,
sign-in/invitation pages, responsive rules, and interaction states.

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
teal for completed, blue for in progress, purple for review, red for blocked,
ochre for not started, and slate for cancelled. Bind board/chart elements with
`data-status`; task badges use the corresponding status class. Do not assign
status colors by array index.

Dashboard shortcuts are compact, and the explanation of date/filter scope is
available in the “About these numbers” disclosure. Workload charts use horizontal
bars and scroll vertically for larger teams; full owner names remain available
in the clickable list below the chart.

- Up to 700px: collapsed navigation, mobile spacing, single-column content.
- Up to 800–850px: stacked analytics and reporting layouts.
- Up to 1000–1250px: compact sidebar, tables, and forms.
- From 1450px: three dashboard chart columns.
- Short desktop windows have compact navigation spacing.
- Reduced-motion preferences disable animation and transitions.

These thresholds reflect the existing layouts. Change them deliberately rather
than introducing another breakpoint to counter an earlier rule.

## Verification

Run `npm run typecheck`, `npm run lint`, and `npm run build` after changes that
affect shared styles or imports. Inspect the dashboard, task board, SEO forms,
dialogs, and sign-in flow at mobile, tablet, and desktop widths. Include keyboard
focus, active navigation, disabled controls, expanded details, and reduced motion.

The consolidation was compared against the previous three stylesheets using
local representative workspace and authentication markup at 390, 700, 768, 1000,
1280, 1536, and 1920px. This comparison checks rendering, not authenticated data
flows. Obsolete demo-dashboard and time-tracking selectors were removed; dynamic
status classes and chart-library selectors were retained.
