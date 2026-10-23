import {statusName} from './live-types';
export type SeoTaskDraft = {title: string; description: string; websiteId: string; websiteName: string};
export function seoTaskDraft(
  site: {id: string; name: string; revision: number; source: string},
  label: string,
  value: string,
  note = '',
): SeoTaskDraft {
  return {
    title: `SEO: ${label} — ${site.name}`.slice(0, 200),
    websiteId: site.id,
    websiteName: site.name,
    description: `Resolve ${label} for ${site.name}.\nRecorded status: ${statusName(value)}\nSaved SEO form version: ${site.revision}\nAudit source: ${site.source || 'Not recorded'}${note ? `\nField note: ${note}` : ''}\n\nVerify the setup, complete the work, and update the SEO checklist.`,
  };
}
