import {seoFields, SeoValues} from './seo-health';

// Generated reference dates and summaries are not evidence of checklist completion.
const generated = new Set(['qa', 'plugin_updated', 'backup_date', 'remarks']);
export function reviewSeo(fields: SeoValues) {
  const recorded = seoFields.filter(f => !generated.has(f.key));
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
