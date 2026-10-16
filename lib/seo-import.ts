import snapshot from '@/data/imports/international-websites-source.json';
import {seoFields, SeoValues, validateSeo} from './seo-health';
export function prepareSeoImport() {
  return snapshot.websites.map(w => {
    const fields: SeoValues = {};
    const notes: Record<string, string> = {};
    for (const f of seoFields) {
      const cell = w.fields[f.label as keyof typeof w.fields];
      const raw = cell?.raw;
      let value: string | number | null = raw ?? null;
      if (f.type === 'status') {
        const text = String(raw ?? '').trim();
        value =
          text === 'Yes' || text.startsWith('Yes,')
            ? 'yes'
            : text === 'No' || text.startsWith('No (')
              ? 'no'
              : text === 'Work in progress'
                ? 'in_progress'
                : text === 'Not yet'
                  ? 'not_yet'
                  : 'unknown';
        if (text && !['Yes', 'No'].includes(text)) notes[f.key] = text;
      }
      if (f.key === 'seo_score') value = Number(String(raw).split('/')[0]);
      if (f.key === 'audit_date') value = '2026-10-15';
      if (f.key === 'page_seconds') value = w.page_duration.seconds;
      if (f.key === 'plugin_updated') value = w.maintenance_dates.plugin_updated;
      if (f.key === 'backup_date') value = w.maintenance_dates.backup_date;
      fields[f.key] = value;
    }
    validateSeo(fields, notes);
    return {
      source_key: `1kxbHqHrzCJW9ArZyRuTze96mpCMzdTKjbBEXb_6aRxQ:website:${w.canonical_url}`,
      name: w.name,
      country: w.name,
      url: w.canonical_url,
      cms: String(fields.cms || ''),
      fields,
      notes,
      audits: snapshot.audits.filter(a => a.website_url === w.canonical_url),
      provenance: w,
      warnings: [
        'Structured values and original notes retained; remarks may be stale. Page-load measurement date/method unspecified.',
      ],
    };
  });
}
