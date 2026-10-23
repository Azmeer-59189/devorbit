'use client';
import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Workspace, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {seoStatuses, SeoValues, seoInput} from '@/lib/seo-health';
import {compareSeo, reviewSeo, fieldsForPage} from '@/lib/seo-review';
import {seoTaskDraft, SeoTaskDraft} from '@/lib/seo-task';
import {workspaceDate} from '@/lib/dates';
import {downloadRows, type ExportFormat} from '@/lib/export';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  /** Current website with no dated audit within the workspace schedule (migration 016). */
  audit_due?: boolean;
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
type Catalog = {websites: Site[]; audits: Audit[]; revisions: Revision[]; audit_interval_days?: number};
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
export default function LiveSeoHealth({
  data,
  onChanged,
  onCreateTask,
  mode = 'seo',
}: {
  mode?: 'seo' | 'features';
  data: Workspace;
  onChanged: () => Promise<void>;
  onCreateTask?: (draft: SeoTaskDraft) => void;
}) {
  const [fieldGroup, setFieldGroup] = useState('all');
  const pageFields = fieldsForPage(mode);
  const reviewPage = (values: SeoValues) => reviewSeo(values, pageFields);
  const matrixFields = pageFields.filter(f => fieldGroup === 'all' || f.group === fieldGroup);
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
  // ?audit=due (the dashboard's "Websites due for audit") lists only websites due for an audit.
  const searchParams = useSearchParams();
  const [auditDueOnly, setAuditDueOnly] = useState(() => searchParams.get('audit') === 'due');
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null);
  const [versionId, setVersionId] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false);
  const pending = useRef<{key: string; id: string} | null>(null);
  // ?website=<id> opens that website's form, so dashboard links and shared URLs land on it.
  const initialSite = useRef(searchParams.get('website'));
  function show(d: Catalog, id: string | null) {
    setCatalog(d);
    const selected = id ? d.websites[0] || null : null;
    setSite(selected);
    setFields(selected ? {...selected.fields, website_url: selected.canonical_url, cms: selected.cms || ''} : {});
    setNotes(selected?.notes || {});
    setSource(selected?.source || '');
    setReason('');
    setVersionId('');
    setDirty(false);
    pending.current = null;
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set('website', selected.id);
    else url.searchParams.delete('website');
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
  }
  useEffect(() => {
    let cancelled = false;
    const id = uuid.test(initialSite.current || '') ? initialSite.current : null;
    workspaceFetch('/api/seo-health' + (id ? `?website=${id}` : ''))
      .then(d => {
        if (!cancelled) show(d, id);
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
      show(await workspaceFetch('/api/seo-health' + (id ? `?website=${id}` : '')), id);
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
    const review = reviewPage(w.fields);
    return (
      `${w.name} ${w.country}`.toLowerCase().includes(search.toLowerCase()) &&
      (!attentionOnly || review.issues.length > 0 || review.missing.length > 0 || !w.latest_audit) &&
      (!auditDueOnly || !!w.audit_due)
    );
  });
  function showAuditDue(value: boolean) {
    setAuditDueOnly(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('audit', 'due');
    else url.searchParams.delete('audit');
    window.history.replaceState(window.history.state, '', url);
  }
  async function saveSchedule() {
    if (lock.current || scheduleDraft === null) return;
    const days = Number(scheduleDraft);
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await workspaceFetch('/api/seo-health/schedule', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({interval_days: days}),
      });
      setCatalog(await workspaceFetch('/api/seo-health'));
      setScheduleDraft(null);
      setMessage(`Audit reminders now flag websites with no audit in the last ${days} days.`);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function exportSites(format: ExportFormat) {
    setError('');
    const rows = visibleSites.map(w => {
      const row: Record<string, string | number> = {Website: w.name, Country: w.country};
      for (const f of matrixFields) {
        const value =
          f.key === 'seo_score'
            ? w.latest_audit?.score
            : f.key === 'audit_date'
              ? w.latest_audit?.measurement_date
              : f.key === 'website_url'
                ? w.canonical_url
                : f.key === 'cms'
                  ? w.cms
                  : w.fields[f.key];
        row[
          f.label +
            (f.type === 'duration'
              ? ' (seconds)'
              : ['qa', 'plugin_updated', 'backup_date'].includes(f.key)
                ? ' (automatic reference)'
                : '')
        ] = value == null ? '' : f.type === 'status' ? statusName(String(value)) : value;
        row[f.label + ' note'] = w.notes[f.key] || '';
      }
      return row;
    });
    downloadRows(rows, format, mode === 'seo' ? 'SEO' : 'Website features', workspaceDate(data.workspace.timezone));
    setMessage(
      `Exported ${visibleSites.length} of ${catalog?.websites.length ?? 0} websites, one column per form field.`,
    );
  }
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
          <h2>{site ? site.name : mode === 'seo' ? 'SEO' : 'Website Features'}</h2>
          <p className="form-hint">
            {mode === 'seo'
              ? 'SEO performance and analytics across every website.'
              : 'Compare website capabilities across your entire registry.'}
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
            audit · {catalog.websites.filter(w => reviewPage(w.fields).issues.length > 0).length} with checklist issues
          </p>
          <label className="field">
            Find a website
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Website or country" />
          </label>
          <label className="checkbox-field">
            <input type="checkbox" checked={attentionOnly} onChange={e => setAttentionOnly(e.target.checked)} />
            Show websites needing attention
          </label>
          {mode === 'seo' && catalog.audit_interval_days !== undefined && (
            <>
              <label className="checkbox-field">
                <input type="checkbox" checked={auditDueOnly} onChange={e => showAuditDue(e.target.checked)} />
                Due for an audit ({catalog.websites.filter(w => w.audit_due).length}; none in the last{' '}
                {catalog.audit_interval_days} days)
              </label>
              {data.profile.role === 'administrator' && (
                <form
                  className="row audit-schedule"
                  onSubmit={e => {
                    e.preventDefault();
                    saveSchedule();
                  }}
                >
                  <label className="field">
                    Audit every (days)
                    <input
                      type="number"
                      min={7}
                      max={730}
                      step={1}
                      required
                      value={scheduleDraft ?? catalog.audit_interval_days}
                      onChange={e => setScheduleDraft(e.target.value)}
                    />
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy || scheduleDraft === null || Number(scheduleDraft) === catalog.audit_interval_days}
                  >
                    Save schedule
                  </button>
                </form>
              )}
            </>
          )}
          <div className="row">
            <button className="button secondary" disabled={!visibleSites.length} onClick={() => exportSites('csv')}>
              Export CSV
            </button>
            <button className="button secondary" disabled={!visibleSites.length} onClick={() => exportSites('xlsx')}>
              Export Excel
            </button>
          </div>
          <label className="field matrix-group">
            Field category
            <select value={fieldGroup} onChange={e => setFieldGroup(e.target.value)}>
              <option value="all">All fields</option>
              {[...new Set(pageFields.map(f => f.group))].map(g => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <p className="form-hint">
            {visibleSites.length} websites / {matrixFields.length} fields. Scroll horizontally to compare every column.
            Expand a value to read its note.
          </p>
          <section className="card comparison-wrap" tabIndex={0} role="region" aria-label="Website field comparison">
            <table className="website-comparison">
              <thead>
                <tr>
                  <th scope="col">Website</th>
                  {matrixFields.map(f => (
                    <th scope="col" key={f.key}>
                      {f.label}
                      {f.type === 'duration' ? ' (seconds)' : ''}
                      {['qa', 'plugin_updated', 'backup_date'].includes(f.key) ? ' (reference)' : ''}
                    </th>
                  ))}
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSites.map(w => (
                  <tr key={w.id}>
                    <th scope="row">
                      <strong>{w.name}</strong>
                      <small className="block">
                        {w.country}
                        {w.archived_at || w.status === 'archived' ? ' - Archived' : ''}
                      </small>
                    </th>
                    {matrixFields.map(f => {
                      const value =
                        f.key === 'seo_score'
                          ? w.latest_audit?.score
                          : f.key === 'audit_date'
                            ? w.latest_audit?.measurement_date
                            : f.key === 'website_url'
                              ? w.canonical_url
                              : f.key === 'cms'
                                ? w.cms
                                : w.fields[f.key];
                      const missing = value == null || value === '' || value === 'unknown';
                      const text = missing
                        ? 'Not recorded'
                        : f.type === 'status'
                          ? statusName(String(value))
                          : String(value);
                      return (
                        <td key={f.key}>
                          <span
                            className={f.type === 'status' ? 'matrix-status' : 'matrix-value'}
                            data-value={missing ? 'unknown' : String(value)}
                          >
                            {f.type === 'long_text' && text.length > 120 ? (
                              <details>
                                <summary>{text.slice(0, 100)}...</summary>
                                <p>{text}</p>
                              </details>
                            ) : (
                              text
                            )}
                            {!missing && f.type === 'duration' ? ' s' : ''}
                            {!missing && f.key === 'seo_score' ? '/100' : ''}
                          </span>
                          {w.notes[f.key] && (
                            <details className="matrix-note">
                              <summary>Note</summary>
                              <p>{w.notes[f.key]}</p>
                            </details>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <button className="text-button" disabled={busy} onClick={() => open(w.id)}>
                        Edit {mode === 'seo' ? 'SEO' : 'features'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleSites.length && (
              <p className="padded">No websites match. Clear your filters or add websites to your registry.</p>
            )}
          </section>
          <p className="form-hint">
            {mode === 'seo'
              ? 'Latest SEO score is selected by audit date.'
              : 'Maintenance dates are automatic references, not confirmed completion records.'}{' '}
            Page-load values are durations, not SEO scores; their method/date may be unspecified.
          </p>
        </>
      )}
      {site && catalog && (
        <>
          {mode === 'seo' && <SeoTrend key={site.id} audits={catalog.audits} />}
          <section className="card padded">
            <h3>Latest saved review</h3>
            <p>
              {reviewPage(site.fields).issues.length} checklist issues · {reviewPage(site.fields).missing.length} fields
              not recorded.
            </p>
            <p className="form-hint">
              Generated maintenance reference dates are excluded from completeness and issue counts.
            </p>
            <details>
              <summary>Review checklist issues</summary>
              <ul>
                {reviewPage(site.fields).issues.map(f => (
                  <li key={f.key}>
                    {f.label}: {statusName(String(site.fields[f.key]))}
                    {onCreateTask && !site.archived_at && site.status !== 'archived' && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          onCreateTask(seoTaskDraft(site, f.label, String(site.fields[f.key]), site.notes[f.key]))
                        }
                      >
                        Create task
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {!reviewPage(site.fields).issues.length && <p>No issues flagged by recorded checklist statuses.</p>}
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
              {[...new Set(pageFields.map(f => f.group))].map(group => (
                <fieldset className="seo-field-group" key={group}>
                  <legend>{group}</legend>
                  <div className="seo-form-grid">
                    {pageFields
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
                {mode === 'seo' && (
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
                )}
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
                {busy ? 'Saving...' : mode === 'seo' ? 'Save SEO' : 'Save features'}
              </button>
            </fieldset>
            {(site.archived_at || site.status === 'archived') && (
              <p className="form-hint">Restore this website from Websites before editing.</p>
            )}
          </form>
          <section className="card padded">
            {mode === 'seo' && (
              <>
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
              </>
            )}
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
                  {new Date(r.created_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})}
                </summary>
                <p>{r.reason || 'Form updated'}</p>
                <dl>
                  {pageFields.map(f => (
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
      {!site && mode === 'features' && data.profile.role === 'administrator' && (
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
                              {pageFields.map(f => (
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
