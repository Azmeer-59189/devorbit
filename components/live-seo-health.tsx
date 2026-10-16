'use client';
import {useEffect, useRef, useState} from 'react';
import {Workspace, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {seoFields, seoStatuses, SeoValues, seoInput} from '@/lib/seo-health';
import {compareSeo, reviewSeo} from '@/lib/seo-review';
import SeoTrend from '@/components/seo-trend';
type Audit = {
  id: string;
  measurement_date: string;
  score: number;
  source: string;
  actor_id: string;
  reason: string | null;
  created_at: string;
  supersedes_id: string | null;
};
type Site = {
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
};
type Revision = {
  id: string;
  revision: number;
  fields: SeoValues;
  notes: Record<string, string>;
  source: string;
  actor_id: string;
  reason: string;
  created_at: string;
};
type Catalog = {websites: Site[]; audits: Audit[]; revisions: Revision[]};
type ImportPreview = {
  notice: string;
  rows: {
    name: string;
    url: string;
    fields: SeoValues;
    notes: Record<string, string>;
    audits: {score: number; measurement_date: string}[];
    review: string;
  }[];
};
export default function LiveSeoHealth({data, onChanged}: {data: Workspace; onChanged: () => Promise<void>}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [fields, setFields] = useState<SeoValues>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [versionId, setVersionId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{key: string; id: string} | null>(null);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch('/api/seo-health')
      .then(d => {
        if (!cancelled) setCatalog(d);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function open(id: string | null) {
    if (lock.current) return;
    if (dirty && !window.confirm('Discard your unsaved SEO form?')) return;
    setBusy(true);
    setError('');
    try {
      const d: Catalog = await workspaceFetch('/api/seo-health' + (id ? `?website=${id}` : ''));
      setCatalog(d);
      const selected = id ? d.websites[0] : null;
      setSite(selected);
      setFields(selected ? {...selected.fields, website_url: selected.canonical_url, cms: selected.cms || ''} : {});
      setNotes(selected?.notes || {});
      setSource(selected?.source || '');
      setReason('');
      setVersionId('');
      setDirty(false);
      pending.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!site || lock.current) return;
    setError('');
    try {
      const values = {website_id: site.id, expected_revision: site.revision, fields, notes, source, reason};
      const key = JSON.stringify(values);
      if (pending.current?.key !== key) pending.current = {key, id: crypto.randomUUID()};
      const input = seoInput({...values, request_id: pending.current.id});
      lock.current = true;
      setBusy(true);
      await workspaceFetch('/api/seo-health', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      const d: Catalog = await workspaceFetch(`/api/seo-health?website=${site.id}`);
      setCatalog(d);
      setSite(d.websites[0]);
      setFields(d.websites[0].fields);
      setNotes(d.websites[0].notes);
      setDirty(false);
      setReason('');
      pending.current = null;
      setMessage('SEO form saved. Previous values and dated audits are preserved.');
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const member = (id: string) => data.members.find(m => m.id === id)?.display_name || 'Team member';
  const visibleSites = (catalog?.websites || []).filter(w => {
    const review = reviewSeo(w.fields);
    return (
      `${w.name} ${w.country}`.toLowerCase().includes(search.toLowerCase()) &&
      (!attentionOnly || review.issues.length > 0 || review.missing.length > 0 || !w.latest_audit)
    );
  });
  const selectedVersion = catalog?.revisions.find(r => r.id === versionId);
  const latestVersion = catalog?.revisions[0];
  function change(key: string, value: string | number | null) {
    setFields({...fields, [key]: value});
    setDirty(true);
    setMessage('');
  }
  return (
    <div className="seo-health">
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="timesheet-message">
          {message}
        </p>
      )}
      <div className="section-toolbar">
        <div>
          <h2>{site ? site.name : 'SEO & Website Health'}</h2>
          <p className="form-hint">
            One fixed form based on your website dashboard. No templates or weekly publishing steps.
          </p>
        </div>
        <div className="row">
          {site && (
            <button className="button secondary" disabled={busy} onClick={() => open(null)}>
              All websites
            </button>
          )}
          <button className="button secondary" disabled={busy} onClick={() => open(site?.id || null)}>
            Reload latest
          </button>
        </div>
      </div>
      {!catalog && !error && <p>Loading website health…</p>}
      {!site && catalog && (
        <>
          <p className="form-hint">
            {catalog.websites.length} websites · {catalog.websites.filter(w => !!w.latest_audit).length} with a dated
            audit · {catalog.websites.filter(w => reviewSeo(w.fields).issues.length > 0).length} with checklist issues
          </p>
          <label className="field">
            Find a website
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Website or country" />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} />
            Show websites needing attention
          </label>
          <section className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Latest SEO score</th>
                  <th>Audit date</th>
                  <th>Source</th>
                  <th>Analytics</th>
                  <th>Page load</th>
                  <th>Needs attention</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visibleSites.map(w => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.name}</strong>
                      <small className="block">
                        {w.country}
                        {w.archived_at || w.status === 'archived' ? ' · Archived' : ''}
                      </small>
                    </td>
                    <td>{w.latest_audit ? `${w.latest_audit.score}/100` : 'Not recorded'}</td>
                    <td>{w.latest_audit?.measurement_date || 'Not recorded'}</td>
                    <td>{w.latest_audit?.source || '—'}</td>
                    <td>{statusName(String(w.fields.google_analytics || 'unknown'))}</td>
                    <td>{typeof w.fields.page_seconds === 'number' ? `${w.fields.page_seconds} s` : 'Not recorded'}</td>
                    <td>
                      <details>
                        <summary>
                          {reviewSeo(w.fields).issues.length} issues · {reviewSeo(w.fields).missing.length} missing
                          fields
                        </summary>
                        <ul>
                          {reviewSeo(w.fields).issues.map(f => (
                            <li key={f.key}>
                              {f.label}: {statusName(String(w.fields[f.key]))}
                            </li>
                          ))}
                        </ul>
                        <p>
                          Not recorded:{' '}
                          {reviewSeo(w.fields)
                            .missing.map(f => f.label)
                            .join(', ') || 'None'}
                        </p>
                      </details>
                    </td>
                    <td>
                      <button className="text-button" disabled={busy} onClick={() => open(w.id)}>
                        Open SEO form
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!catalog.websites.length && (
              <p className="padded">Add a website or import the source sheet below to get started.</p>
            )}
            {!!catalog.websites.length && !visibleSites.length && (
              <p className="padded">No websites match these filters.</p>
            )}
          </section>
          <p className="form-hint">
            Latest SEO score is selected by audit date. Page-load values are durations, not SEO scores; their
            method/date may be unspecified.
          </p>
        </>
      )}
      {site && catalog && (
        <>
          <SeoTrend key={site.id} audits={catalog.audits} />
          <section className="card padded">
            <h3>Latest saved review</h3>
            <p>
              {reviewSeo(site.fields).issues.length} checklist issues · {reviewSeo(site.fields).missing.length} fields
              not recorded.
            </p>
            <p className="form-hint">
              Generated maintenance reference dates are excluded from completeness and issue counts.
            </p>
            <details>
              <summary>Review checklist issues</summary>
              <ul>
                {reviewSeo(site.fields).issues.map(f => (
                  <li key={f.key}>
                    {f.label}: {statusName(String(site.fields[f.key]))}
                  </li>
                ))}
              </ul>
              {!reviewSeo(site.fields).issues.length && <p>No issues flagged by recorded checklist statuses.</p>}
            </details>
          </section>
          <form
            className="card padded seo-fixed-form"
            onSubmit={e => {
              e.preventDefault();
              save();
            }}
          >
            <fieldset
              className="live-form-fieldset"
              disabled={busy || !!site.archived_at || site.status === 'archived'}
            >
              {[...new Set(seoFields.map(f => f.group))].map(group => (
                <fieldset className="seo-field-group" key={group}>
                  <legend>{group}</legend>
                  <div className="seo-form-grid">
                    {seoFields
                      .filter(f => f.group === group)
                      .map(f => (
                        <div key={f.key}>
                          <label className="field">
                            {f.label}
                            {f.type === 'duration' ? ' (seconds)' : ''}
                            {f.type === 'status' ? (
                              <select
                                value={String(fields[f.key] || 'unknown')}
                                onChange={e => change(f.key, e.target.value)}
                              >
                                {seoStatuses.map(s => (
                                  <option value={s} key={s}>
                                    {statusName(s)}
                                  </option>
                                ))}
                              </select>
                            ) : f.type === 'long_text' ? (
                              <textarea
                                rows={12}
                                readOnly={f.key === 'remarks'}
                                maxLength={5000}
                                value={String(fields[f.key] ?? '')}
                                onChange={e => change(f.key, e.target.value)}
                              />
                            ) : (
                              <input
                                type={
                                  ['number', 'duration'].includes(f.type)
                                    ? 'number'
                                    : f.type === 'date'
                                      ? 'date'
                                      : f.type === 'url'
                                        ? 'url'
                                        : 'text'
                                }
                                step="any"
                                min={0}
                                max={f.type === 'number' ? 100 : f.type === 'duration' ? 3600 : undefined}
                                readOnly={['website_url', 'cms', 'qa', 'plugin_updated', 'backup_date'].includes(f.key)}
                                value={fields[f.key] ?? ''}
                                maxLength={5000}
                                onChange={e =>
                                  change(
                                    f.key,
                                    e.target.value === ''
                                      ? null
                                      : ['number', 'duration'].includes(f.type)
                                        ? Number(e.target.value)
                                        : e.target.value,
                                  )
                                }
                              />
                            )}
                          </label>
                          {['qa', 'plugin_updated', 'backup_date', 'remarks'].includes(f.key) ? (
                            <small className="form-hint">
                              {f.key === 'remarks'
                                ? 'Generated from the latest saved form. Save changes to refresh.'
                                : f.key === 'backup_date'
                                  ? 'Automatic reference: seven days before today; not a confirmed backup.'
                                  : 'Automatic reference: first day of the current month; changes monthly, not daily. Not a completion record.'}
                            </small>
                          ) : ['website_url', 'cms'].includes(f.key) ? (
                            <small className="form-hint">Managed in the website profile.</small>
                          ) : (
                            <details className="seo-field-note" open={!!notes[f.key] || undefined}>
                              <summary>Field note / original detail</summary>
                              <textarea
                                aria-label={`${f.label} note`}
                                maxLength={2000}
                                rows={2}
                                value={notes[f.key] || ''}
                                onChange={e => {
                                  setNotes({...notes, [f.key]: e.target.value});
                                  setDirty(true);
                                }}
                              />
                            </details>
                          )}
                        </div>
                      ))}
                  </div>
                </fieldset>
              ))}
              <div className="seo-form-grid">
                <label className="field">
                  SEO audit source / tool
                  <input
                    maxLength={500}
                    value={source}
                    placeholder="e.g. Rank Math SEO Analyzer"
                    onChange={e => {
                      setSource(e.target.value);
                      setDirty(true);
                    }}
                  />
                </label>
                <label className="field">
                  Correction reason
                  <textarea
                    maxLength={2000}
                    value={reason}
                    onChange={e => {
                      setReason(e.target.value);
                      setDirty(true);
                    }}
                    placeholder="Required when correcting an existing score for the same date and source"
                  />
                </label>
              </div>
              <p className="form-hint">
                Leave unmeasured fields blank. Unknown is different from No. Do not enter passwords, API keys or payment
                credentials. Scores require an audit date and source.
              </p>
              <button className="button primary" disabled={!dirty} type="submit">
                {busy ? 'Saving…' : 'Save SEO form'}
              </button>
            </fieldset>
            {(site.archived_at || site.status === 'archived') && (
              <p className="form-hint">Restore this website from Websites before editing.</p>
            )}
          </form>
          <section className="card padded">
            <h3>Dated SEO audits</h3>
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
                      <td>{a.measurement_date}</td>
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
            <h3>Form change history</h3>
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
                  Version {selectedVersion.revision} → Version {latestVersion.revision}. Automatic maintenance
                  references and summaries are excluded.
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
                    {compareSeo(selectedVersion, latestVersion).map(f => (
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
                    {selectedVersion.source !== latestVersion.source && (
                      <tr>
                        <th>Audit source</th>
                        <td>{selectedVersion.source || 'Not recorded'}</td>
                        <td>{latestVersion.source || 'Not recorded'}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {!compareSeo(selectedVersion, latestVersion).length &&
                  selectedVersion.source === latestVersion.source && (
                    <p>No recorded field or note changes between these versions.</p>
                  )}
              </div>
            )}
            {catalog.revisions.map(r => (
              <details key={r.id} className="seo-history">
                <summary>
                  Version {r.revision} · {member(r.actor_id)} ·{' '}
                  {new Date(r.created_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})}
                </summary>
                <p>{r.reason || 'Form updated'}</p>
                <dl>
                  {seoFields.map(f => (
                    <div key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>
                        {r.fields[f.key] === null || r.fields[f.key] === undefined
                          ? 'Not recorded'
                          : String(r.fields[f.key])}
                        {r.notes[f.key] ? ` · ${r.notes[f.key]}` : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </section>
        </>
      )}
      {!site && data.profile.role === 'administrator' && (
        <section className="card padded">
          <h3>Import your Google Sheet data</h3>
          <p className="form-hint">
            Saved source snapshot: 14 websites, all 33 fields and 27 July/October SEO audits. This leaves the original
            Google Sheet unchanged.
          </p>
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                setPreview(await workspaceFetch('/api/seo-health/import'));
                setConfirmed(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Review real-data import
          </button>
          {preview && (
            <>
              <p className="seo-import-notice">{preview.notice}</p>
              <p className="form-hint">
                Known conflicts: some remarks quote older speed values; Norway Analytics and UAE YouTube remarks
                disagree with their structured cells. Preserve both, then review them. Finland has no July score or
                remarks.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Website</th>
                      <th>Source URL</th>
                      <th>Audits</th>
                      <th>Source fields</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(w => (
                      <tr key={w.url}>
                        <td>
                          {w.name}
                          <small className="block">{w.review}</small>
                        </td>
                        <td>{w.url}</td>
                        <td>{w.audits.map(a => `${a.measurement_date}: ${a.score}/100`).join('; ')}</td>
                        <td>
                          <details>
                            <summary>Review 33 fields</summary>
                            <dl>
                              {seoFields.map(f => (
                                <div key={f.key}>
                                  <dt>{f.label}</dt>
                                  <dd>
                                    {String(w.fields[f.key] ?? 'Not recorded')}
                                    {w.notes[f.key] ? ` · ${w.notes[f.key]}` : ''}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed
                the snapshot and conflict rules. Import missing data without overwriting existing profiles.
              </label>
              <button
                className="button primary"
                disabled={!confirmed || busy}
                onClick={async () => {
                  if (lock.current) return;
                  lock.current = true;
                  setBusy(true);
                  setError('');
                  try {
                    const r = await workspaceFetch('/api/seo-health/import', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({confirm: true}),
                    });
                    setMessage(
                      `Import finished: ${r.websites_added} websites added, ${r.profiles_added} SEO forms added, ${r.historical_audits_added} audit records added; ${r.conflicts} conflicts preserved, ${r.skipped} already imported websites skipped.`,
                    );
                    setPreview(null);
                    setCatalog(await workspaceFetch('/api/seo-health'));
                    await onChanged();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                    lock.current = false;
                  }
                }}
              >
                Import reviewed data
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
