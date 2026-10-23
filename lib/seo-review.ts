import {seoFields, SeoValues} from './seo-health';

// Generated reference dates and summaries are not evidence of checklist completion.
const generated = new Set(['qa', 'plugin_updated', 'backup_date', 'remarks']);
export const seoPageKeys = new Set([
  'seo_implementation',
  'seo_score',
  'audit_date',
  'google_analytics',
  'page_seconds',
]);
export function fieldsForPage(mode: 'seo' | 'features') {
  return seoFields.filter(f => (mode === 'seo' ? seoPageKeys.has(f.key) : !seoPageKeys.has(f.key)));
}
export function reviewSeo(fields: SeoValues, selectedFields = seoFields) {
  const recorded = selectedFields.filter(f => !generated.has(f.key));
  const missing = recorded.filter(f => fields[f.key] == null || fields[f.key] === '' || fields[f.key] === 'unknown');
  const issues = recorded.filter(
    f => f.type === 'status' && ['no', 'not_yet', 'in_progress'].includes(String(fields[f.key])),
  );
  return {missing, issues};
}

export function compareSeo(
  previous: {fields: SeoValues; notes: Record<string, string>},
  latest: {fields: SeoValues; notes: Record<string, string>},
) {
  return seoFields.filter(
    f =>
      !generated.has(f.key) &&
      ((previous.fields[f.key] ?? '') !== (latest.fields[f.key] ?? '') ||
        (previous.notes[f.key] ?? '') !== (latest.notes[f.key] ?? '')),
  );
}

type SeoExportSite = {
  name: string;
  country: string;
  canonical_url: string;
  cms: string;
  status: string;
  archived_at: string | null;
  fields: SeoValues;
  notes: Record<string, string>;
  source: string;
  latest_audit: {score: number; measurement_date: string; source: string} | null;
};
const display = (value: string) =>
  value
    .split('_')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
/** One spreadsheet row per website with a column per SEO form field, labelled as on the form. */
export function seoExportRows(sites: SeoExportSite[]) {
  return sites.map(site => {
    const {issues, missing} = reviewSeo(site.fields);
    const row: Record<string, string | number> = {
      Website: site.name,
      Country: site.country,
      Archived: site.archived_at || site.status === 'archived' ? 'Yes' : 'No',
      'Latest audit score': site.latest_audit?.score ?? '',
      'Latest audit date': site.latest_audit?.measurement_date ?? '',
      'Latest audit source': site.latest_audit?.source ?? '',
    };
    for (const field of seoFields) {
      const value =
        field.key === 'website_url'
          ? site.canonical_url
          : field.key === 'cms'
            ? site.fields.cms || site.cms
            : site.fields[field.key];
      // Maintenance dates are filled automatically; the label keeps them from reading as verified.
      const label =
        generated.has(field.key) && field.key !== 'remarks' ? `${field.label} (automatic reference)` : field.label;
      row[label] =
        value === null || value === undefined || value === ''
          ? ''
          : field.type === 'status'
            ? display(String(value))
            : value;
    }
    row['Field notes'] = seoFields
      .filter(f => site.notes[f.key] && !generated.has(f.key))
      .map(f => `${f.label}: ${site.notes[f.key]}`)
      .join('\n');
    row['Profile source'] = site.source;
    row['Checklist issues'] = issues.map(f => f.label).join(', ');
    row['Fields not recorded'] = missing.map(f => f.label).join(', ');
    return row;
  });
}
