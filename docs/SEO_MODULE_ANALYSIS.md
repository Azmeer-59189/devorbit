# SEO and website tracking: workbook analysis

Source: [International Website's Dashboard](https://docs.google.com/spreadsheets/d/1kxbHqHrzCJW9ArZyRuTze96mpCMzdTKjbBEXb_6aRxQ/edit). Both tabs were read through the connected Google Drive/Sheets tools. The source workbook was not modified. This is an analysis and import-preparation pass; the app and hosted database have not been changed to this design.

The product owner wants the workbook's functionality and fields, not its visual layout. Time management remains excluded.

## What the workbook actually does

The main tab, `International Websites Dashbaord` (gid 0), has website names in C3:P3 and 33 field rows grouped into 10 categories. Each column is one website's current operational state. It is a manually maintained matrix, not a weekly-submission form. The reviewed cells contain entered values rather than calculated SEO scores. The workbook does not establish a weekly reporting schedule or automatically audit live websites.

`SEO Summary` (gid 365983363) contains country/site label, URL, SEO rating and audit date. Its 13 ratings are dated July 23, 2026. The main matrix has 14 ratings dated October 15, 2026. Treat these as separate dated audit observations, not competing values to overwrite. Both tabs explicitly credit Rank Math SEO Analyzer. Tool/device configuration and methodology version are not recorded.

## Exact field inventory and proposed behavior

| Workbook category | Fields | Application behavior |
|---|---|---|
| Website information | Website URL; CMS Platform | Reuse the existing website identity and CMS. Retain the chapter label, map by canonical URL, do not create duplicates based on display-name differences. |
| SEO & performance | SEO Implementation; SEO Rating; Last SEO Audit Date; Google Analytics; Page Speed Score | Show current implementation/analytics states. Record each SEO audit's score, date and source as history. Store the page-speed value as a duration with explicit units, not a 0–100 score. |
| Donation & CRM | Donation CRM; Donation Checkout; Recurring Donations; Currency Supported | Provider names, configuration states, currency and explanatory notes. No credentials or payment details. |
| Events & ticketing | Event Ticketing Platform | Provider/custom platform name and availability state. |
| Email marketing | Mailchimp Embedded | Presence state and optional notes. |
| Content | Blogs; News Articles; Financial Reports; Impact Reports; Directors Information; Newsletter/Email Signup; Video Content | Separate status for each item; retain unknown and work-in-progress states. These indicate presence, not a content-quality assessment. |
| Security & compliance | Security Plugins Installed; SSL Certificate; GDPR / Privacy Policy; Chatbot / Captcha in Forms | Record the reported presence/checklist state. Do not interpret a privacy-policy entry as a verified legal-compliance claim. The combined chatbot/captcha field must remain combined during import because its values cannot distinguish the two features. |
| Maintenance & QA | Website QA; Last Plugin Update; Backup Status (Server) | QA cadence and notes, plugin-update date, recorded backup date. A recorded backup date alone does not demonstrate a successful backup or restore test. |
| Social media links | Facebook; Instagram; LinkedIn; Twitter / X; YouTube | Presence status for each platform; optional actual URL for future entries. The sheet has presence indicators, not actual social-profile URLs. |
| Notes | General Notes / Remarks | Preserve the original remarks and their provenance; add new notes without silently replacing them. |

## Recommended simple workflow

1. Open **SEO & Website Health** and choose a website. Show its latest score, last audit date and current checklist, grouped by the source categories.
2. **Edit website checklist** changes configuration/presence/status fields with actor/time and previous-value history. A user can update only the section that changed; no need to submit all 33 fields every week.
3. **Add SEO audit** captures audit date, SEO score (0–100), source/tool, optional measured page duration, metric definition/device where known, findings and next actions. Saving appends an observation; it does not overwrite an older audit. Corrections preserve revisions.
4. **History** lists past audits and significant checklist edits. Latest score means latest measurement date, not last import/upload time. Imports must not masquerade as new audits performed by the importing administrator.
5. **Network summary** shows one latest record per website, filtering by chapter, source and checklist gaps. Selecting a website opens its history. Scores are already measured in the source; do not derive a new composite score from Yes/No checkboxes.
6. A user may deliberately create a task from an identified gap (e.g. missing Analytics or a performance issue). Do not automatically generate tasks from historical notes or unconfirmed thresholds.

Existing role rules and audit protections should be reused: administrators/managers manage stable website configuration; authorized members submit direct audit observations; corrections remain appropriately restricted. General form templates can remain available for custom reports, but normal SEO entry should not require building/publishing a template first. Do not impose mandatory weekly periods on imported audits; their audit dates are the source identity.

## Real data ready for a reviewed import

`data/imports/international-websites-source.json` preserves the source rows, all 14 website columns, each field's cell reference, 27 normalized audit observations and raw values. This snapshot has not been written to Supabase.

The website roster is FOIH US, Indus Canada, UAE, UK, Germany, Australia, Switzerland, France, Denmark, Norway, Spain, Ireland, Netherlands and Finland. All source CMS entries are WordPress.

Import rules:

- Match existing websites by normalized canonical URL and create only missing ones. Do not overwrite user edits to existing website profiles; present differences for resolution.
- The October source includes Finland; the July summary does not. Finland's earlier score is unknown, not zero.
- Preserve both July and October observations. Historical audit dates do not mean the site was checked at import time. The import actor and original audit author are different concepts; original audit authors are not recorded.
- Use an immutable source-file/tab/cell/date import identity for idempotent retries. Subsequent pulls that change an already-imported source value should be flagged for a reasoned revision rather than silently replacing it. The snapshot is not automatic ongoing synchronization.
- Keep exact raw text and source coordinates alongside parsed values. Record successful/failed import counts and validation warnings before committing a batch.

## Specific data issues to preserve or resolve

- **Duration versus score:** `Page Speed Score` contains durations. Netherlands `953 ms` normalizes to `0.953 s`. Do not call it a PageSpeed/Lighthouse score or assume it means LCP. The measurement definition, device, method and measurement date are not supplied for these durations; do not borrow the SEO audit date without confirmation.
- **Stale notes:** FOIH US has a structured duration of `5.94 s` while its remarks say `3.43s`. Preserve both; use the structured cell for the current imported duration and flag the notes as potentially stale. Norway's structured Analytics entry says Yes while its remarks say No. UAE's YouTube cell says Yes while its remarks say it is absent. These need visible conflict flags, not automatic guessing.
- **Dates hiding the year:** Plugin update displays `Sep-1` and backup displays `Sep-18`. The actual Sheets date serials are 46266 and 46283, resolving to September 1 and September 18, 2026. Store full dates and preserve the original display text.
- **QA versus SEO dates:** The QA statement says content was updated through July 23, 2026 and mentions monthly QA. That is distinct from the October SEO audit date. Do not treat it as proof of a later QA run.
- **Missing is not No:** Dashes and blank cells mean unspecified unless the owner confirms otherwise. Preserve No, Not yet, Work in progress and unspecified as separate states. Future forms may offer explicit Not applicable, but legacy dashes must not be silently mapped to it.
- **Qualified status:** Switzerland's Analytics value is `Yes, but free version.` Preserve Yes plus its note; do not infer a particular licensed product plan. Netherlands' recurring-donations note says the bank account is not open; preserve the explanatory note separately from the No status.
- **Missing remarks:** Finland has a website, checklist and October score, but its General Notes cell is blank. Do not shift Netherlands' remarks into Finland or invent a description.
- **Sources:** The sheet explicitly credits Rank Math for SEO ratings. Record that attribution. Future sources or methods should stay distinguishable; the workbook provides no evidence for Lighthouse scores, Search Console traffic, backlinks or keyword rankings.

## Difference from the current module

The current module is a generic versioned weekly-report form with an SEO-score preset and a trend chart. It lacks the workbook's 33-field operational checklist and a dedicated date-based SEO audit workflow. The next implementation should add those two coherent workflows and a reviewed real-data import. This changes SEO functionality and field coverage, rather than merely restyling the reporting page.
