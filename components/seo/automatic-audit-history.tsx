'use client';
import {useEffect, useState} from 'react';
import {workspaceFetch} from '@/lib/workspace-client';
type Run = {
  id: string;
  state: string;
  measured_at: string | null;
  created_at: string;
  seo_score: number | null;
  performance_score: number | null;
  lcp_seconds: number | null;
  lighthouse_version: string | null;
};
export default function AutomaticAuditHistory({
  website,
  refresh,
  timezone,
}: {
  website: string;
  refresh?: string;
  timezone: string;
}) {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch(`/api/seo-health/automate?website=${website}`)
      .then(r => {
        if (!cancelled) {
          setRuns(r.runs);
          setError('');
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [website, refresh, retry]);
  return (
    <details className="card padded">
      <summary>Automatic audit history</summary>
      <p className="form-hint">
        Latest 20 attempts. Mobile Lighthouse lab measurements, not real-user field data. A running attempt older than
        two minutes may have timed out; retry after the five-minute cooldown.
      </p>
      {error ? (
        <p role="alert">
          {error}{' '}
          <button className="text-button" onClick={() => setRetry(n => n + 1)}>
            Retry
          </button>
        </p>
      ) : !runs ? (
        <p role="status">Loading audits…</p>
      ) : !runs.length ? (
        <p>No automatic audits yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Measured / attempted</th>
                <th>Status</th>
                <th>SEO /100</th>
                <th>Performance /100</th>
                <th>LCP (seconds)</th>
                <th>Lighthouse version</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td>{new Date(r.measured_at || r.created_at).toLocaleString('en-GB', {timeZone: timezone})}</td>
                  <td>{r.state}</td>
                  <td>{r.seo_score ?? '—'}</td>
                  <td>{r.performance_score ?? '—'}</td>
                  <td>{r.lcp_seconds ?? '—'}</td>
                  <td>{r.lighthouse_version || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
