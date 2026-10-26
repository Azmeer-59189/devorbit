import type {SeoValues} from './seo-health';
export type AutomaticLoadTime = {
  id: string;
  load_seconds: number;
  measured_at: string;
  finished_at: string;
  lighthouse_version: string;
};
export function currentLoadTime(site: {fields: SeoValues; automatic_load_time?: AutomaticLoadTime | null}) {
  const automated = site.automatic_load_time;
  if (automated && Number.isFinite(Number(automated.load_seconds)) && Number(automated.load_seconds) > 0) {
    return {seconds: Number(automated.load_seconds), automatic: true, measuredAt: automated.measured_at};
  }
  return {seconds: site.fields.page_seconds ?? null, automatic: false, measuredAt: null};
}
