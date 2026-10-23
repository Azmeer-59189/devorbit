'use client';
import {useState} from 'react';
import {compareSeo, fieldsForPage} from '@/lib/seo-review';
import {displayDate} from '@/lib/dates';
import type {Catalog} from './types';

/** Dated audits and saved form versions for one website, collapsed until needed. */
export default function SeoHistory({
  catalog,
  mode,
  pageFields,
  member,
  today,
  timezone,
}: {
  catalog: Catalog;
  mode: 'seo' | 'features';
  pageFields: ReturnType<typeof fieldsForPage>;
  member: (id: string) => string;
  today: string;
  timezone: string;
}) {
  const [versionId, setVersionId] = useState('');
  const selectedVersion = catalog.revisions.find(r => r.id === versionId);
  const latestVersion = catalog.revisions[0];
  return (
    <details className="card padded history-section">
      <summary>
        <h3>History</h3>
        <small>
          {mode === 'seo' && `${catalog.audits.length} audit${catalog.audits.length === 1 ? '' : 's'} · `}
          {catalog.revisions.length} saved version{catalog.revisions.length === 1 ? '' : 's'}
        </small>
      </summary>
      {mode === 'seo' && (
        <>
          <h4>Dated SEO audits</h4>
          <p className="form-hint">
            Latest 100 audit records, including corrections. Imported audit authors are not known; the shown actor
            performed the import.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Audit date</th>
                  <th>Score</th>
                  <th>Source</th>
                  <th>Recorded by</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {catalog.audits.map(a => (
                  <tr key={a.id}>
                    <td>
                      <time dateTime={a.measurement_date} title={a.measurement_date}>
                        {displayDate(a.measurement_date, today)}
                      </time>
                    </td>
                    <td>{a.score}/100</td>
                    <td>{a.source}</td>
                    <td>{member(a.actor_id)}</td>
                    <td>
                      {catalog.audits.some(n => n.supersedes_id === a.id) ? 'Superseded · ' : ''}
                      {a.reason || 'Recorded audit'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!catalog.audits.length && <p>No audits recorded yet.</p>}
        </>
      )}
      <h4>Form change history</h4>
      <p className="form-hint">Latest 30 saved versions. Every save preserves the previous version.</p>
      <label className="field">
        Compare a saved version with the latest saved version
        <select value={versionId} onChange={e => setVersionId(e.target.value)}>
          <option value="">Choose a version</option>
          {catalog.revisions.slice(1).map(r => (
            <option key={r.id} value={r.id}>
              Version {r.revision}
            </option>
          ))}
        </select>
      </label>
      {selectedVersion && latestVersion && (
        <div className="table-wrap">
          <p>
            Version {selectedVersion.revision} → Version {latestVersion.revision}. Automatic maintenance references and
            summaries are excluded.
          </p>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Previous</th>
                <th>Latest saved</th>
              </tr>
            </thead>
            <tbody>
              {compareSeo(selectedVersion, latestVersion)
                .filter(f => pageFields.some(p => p.key === f.key))
                .map(f => (
                  <tr key={f.key}>
                    <th>{f.label}</th>
                    {[selectedVersion, latestVersion].map(r => (
                      <td key={r.id}>
                        {String(r.fields[f.key] ?? 'Not recorded') || 'Not recorded'}
                        {r.notes[f.key] && <small className="block">Note: {r.notes[f.key]}</small>}
                      </td>
                    ))}
                  </tr>
                ))}
              {mode === 'seo' && selectedVersion.source !== latestVersion.source && (
                <tr>
                  <th>Audit source</th>
                  <td>{selectedVersion.source || 'Not recorded'}</td>
                  <td>{latestVersion.source || 'Not recorded'}</td>
                </tr>
              )}
            </tbody>
          </table>
          {!compareSeo(selectedVersion, latestVersion).some(f => pageFields.some(p => p.key === f.key)) &&
            (mode !== 'seo' || selectedVersion.source === latestVersion.source) && (
              <p>No recorded field or note changes between these versions.</p>
            )}
        </div>
      )}
      {catalog.revisions.map(r => (
        <details key={r.id} className="seo-history">
          <summary>
            Version {r.revision} · {member(r.actor_id)} ·{' '}
            {new Date(r.created_at).toLocaleString('en-GB', {timeZone: timezone})}
          </summary>
          <p>{r.reason || 'Form updated'}</p>
          <dl>
            {pageFields.map(f => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {r.fields[f.key] === null || r.fields[f.key] === undefined ? 'Not recorded' : String(r.fields[f.key])}
                  {r.notes[f.key] ? ` · ${r.notes[f.key]}` : ''}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ))}
    </details>
  );
}
