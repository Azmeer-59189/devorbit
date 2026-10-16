export type TrendAudit = {
  id: string;
  measurement_date: string;
  score: number;
  source: string;
  created_at: string;
  supersedes_id: string | null;
};

export function seoTrend(audits: TrendAudit[], source: string, start: string, end: string) {
  const superseded = new Set(audits.map(a => a.supersedes_id).filter(Boolean));
  return audits
    .filter(
      a =>
        !superseded.has(a.id) &&
        a.source === source &&
        (!start || a.measurement_date >= start) &&
        (!end || a.measurement_date <= end),
    )
    .sort(
      (a, b) =>
        a.measurement_date.localeCompare(b.measurement_date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    );
}
