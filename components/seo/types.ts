import type {SeoValues} from '@/lib/seo-health';

// Shapes returned by /api/seo-health and helpers shared by the SEO and Website features pages.
export type Audit = {
  id: string;
  measurement_date: string;
  score: number;
  source: string;
  actor_id: string;
  reason: string | null;
  created_at: string;
  supersedes_id: string | null;
};
export type Site = {
  id: string;
  name: string;
  country: string;
  canonical_url: string;
  cms: string;
  archived_at: string | null;
  status: string;
  fields: SeoValues;
  notes: Record<string, string>;
  source: string;
  revision: number;
  latest_audit: Audit | null;
  lighthouse?: {
    id: string;
    seo_score: number;
    performance_score: number;
    lcp_seconds: number | null;
    measured_at: string;
    finished_at?: string;
    lighthouse_version: string;
  } | null;
  /** Current website with no dated audit within the workspace schedule (migration 016). */
  audit_due?: boolean;
};
export type Revision = {
  id: string;
  revision: number;
  fields: SeoValues;
  notes: Record<string, string>;
  source: string;
  actor_id: string;
  reason: string;
  created_at: string;
};
export type Catalog = {
  websites: Site[];
  audits: Audit[];
  revisions: Revision[];
  audit_interval_days?: number;
  automatic_audits_enabled?: boolean;
};
/** Lighthouse-style score bands: 90+ good, 50–89 needs work, under 50 poor. */
export const scoreBand = (score: number) => (score >= 90 ? 'good' : score >= 50 ? 'fair' : 'poor');
type FormSource = {
  fields: SeoValues;
  canonical_url: string;
  cms: string;
  latest_audit: {score: number; measurement_date: string} | null;
};
/** Form values: saved answers, with profile URL and CMS and the latest dated audit. */
export const formValues = (w: FormSource): SeoValues => ({
  ...w.fields,
  website_url: w.canonical_url,
  cms: w.cms || '',
  ...(w.latest_audit ? {seo_score: w.latest_audit.score, audit_date: w.latest_audit.measurement_date} : {}),
});
/** Status colour token for each score band. */
export const bandStatus = {good: 'completed', fair: 'to_do', poor: 'blocked'} as const;
