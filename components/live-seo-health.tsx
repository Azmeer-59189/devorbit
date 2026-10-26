'use client';
import {useEffect, useRef, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {Workspace, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {confirmAction} from '@/components/confirm-dialog';
import {seoStatuses, SeoValues, seoInput} from '@/lib/seo-health';
import {ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Pencil} from 'lucide-react';
import {compareCells, fieldsForPage, recordableFields, reviewSeo} from '@/lib/seo-review';
import {seoTaskDraft, SeoTaskDraft} from '@/lib/seo-task';
import {displayDate, workspaceDate} from '@/lib/dates';
import {downloadRows, type ExportFormat} from '@/lib/export';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
import SeoTrend from '@/components/seo-trend';
import SummaryTiles, {type Tile} from '@/components/seo/summary-tiles';
import SeoHistory from '@/components/seo/seo-history';
import SeoImport from '@/components/seo/seo-import';
import {bandStatus, formValues, scoreBand, type Catalog, type Site} from '@/components/seo/types';
import AutomaticAuditHistory from '@/components/seo/automatic-audit-history';
import RecordAuditDialog, {type NewAudit} from '@/components/seo/record-audit-dialog';
const sectionId = (group: string) => 'section-' + group.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
  const pageFields = fieldsForPage(mode).map(f =>
    f.key === 'page_seconds' ? {...f, label: 'Recorded load time (manual)'} : f,
  );
  const reviewPage = (values: SeoValues) => reviewSeo(values, pageFields);
  const matrixFields = pageFields.filter(f => fieldGroup === 'all' || f.group === fieldGroup);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [fields, setFields] = useState<SeoValues>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [auditing, setAuditing] = useState<string | null>(null);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  // Narrows the table to one summary tile's websites; cleared by selecting the tile again.
  const [focus, setFocus] = useState<'' | 'issues' | 'gaps' | 'unaudited'>('');
  const [sort, setSort] = useState<{key: string; direction: 1 | -1}>({key: 'name', direction: 1});
  // ?audit=due (the dashboard's "Websites due for audit") lists only websites due for an audit.
  const searchParams = useSearchParams();
  const [auditDueOnly, setAuditDueOnly] = useState(() => searchParams.get('audit') === 'due');
  const [scheduleDraft, setScheduleDraft] = useState<string | null>(null);
  const lock = useRef(false);
  const pending = useRef<{key: string; id: string} | null>(null);
  // ?website=<id> opens that website's form, so dashboard links and shared URLs land on it.
  const initialSite = useRef(searchParams.get('website'));
  function show(d: Catalog, id: string | null) {
    setCatalog(d);
    const selected = id ? d.websites[0] || null : null;
    setSite(selected);
    setFields(selected ? formValues(selected) : {});
    setNotes(selected?.notes || {});
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
    if (dirty && !(await confirmAction({title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true})))
      return;
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
  /** Saves the form and, when it carries a new score, the dated audit; then reloads the website. */
  async function submit(
    values: {fields: SeoValues; notes: Record<string, string>; source: string; reason: string},
    done: string,
  ) {
    if (!site) return;
    if (lock.current) throw new Error('Wait for the current save to finish.');
    const payload = {website_id: site.id, expected_revision: site.revision, ...values};
    const key = JSON.stringify(payload);
    if (pending.current?.key !== key) pending.current = {key, id: crypto.randomUUID()};
    const input = seoInput({...payload, request_id: pending.current.id});
    lock.current = true;
    setBusy(true);
    try {
      await workspaceFetch('/api/seo-health', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      const d: Catalog = await workspaceFetch(`/api/seo-health?website=${site.id}`);
      setCatalog(d);
      setSite(d.websites[0]);
      // Keep profile URL, CMS and the latest audit in the form after a save, as on open.
      setFields(formValues(d.websites[0]));
      setNotes(d.websites[0].notes);
      setDirty(false);
      pending.current = null;
      setMessage(done);
      await onChanged();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!site || lock.current) return;
    setError('');
    try {
      // Re-sending the latest audit unchanged records nothing new, so a form save never
      // creates or corrects an audit; that happens only through Record audit.
      await submit(
        {fields, notes, source: site.latest_audit?.source ?? site.source ?? '', reason: ''},
        mode === 'seo'
          ? 'SEO form saved. Previous values and dated audits are preserved.'
          : 'Website features saved. Previous values are preserved.',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function recordAudit(audit: NewAudit) {
    if (!site) return;
    await submit(
      {
        fields: {...formValues(site), seo_score: audit.score, audit_date: audit.date},
        notes: site.notes,
        source: audit.source,
        reason: audit.reason,
      },
      `Audit recorded: ${audit.score}/100 on ${displayDate(audit.date, today)}.`,
    );
  }
  function discard() {
    if (!site) return;
    setFields(formValues(site));
    setNotes(site.notes);
    setDirty(false);
    pending.current = null;
  }
  async function automaticAudit(website: string) {
    if (lock.current || dirty) return;
    lock.current = true;
    setBusy(true);
    setAuditing(website);
    setError('');
    try {
      const result = await workspaceFetch('/api/seo-health/automate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({website_id: website, request_id: crypto.randomUUID()}),
        // Google may need 95 seconds; keep waiting through the server's 120-second window.
        signal: AbortSignal.timeout(125000),
      });
      const updated: Catalog = await workspaceFetch('/api/seo-health' + (site ? `?website=${site.id}` : ''));
      show(updated, site?.id || null);
      const refreshed = updated.websites.find(w => w.id === website);
      const run = refreshed?.lighthouse;
      setMessage(
        result.state === 'completed' && run
          ? `Audit saved ${new Date(run.finished_at || run.measured_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})}. SEO ${run.seo_score}/100; mobile performance ${run.performance_score}/100. A fresh audit can return the same scores.`
          : 'Audit is still running or was interrupted. Reload before retrying.',
      );
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
      setAuditing(null);
      setAuditRefresh(n => n + 1);
    }
  }
  const member = (id: string) => data.members.find(m => m.id === id)?.display_name || 'Team member';
  const today = workspaceDate(data.workspace.timezone);
  // Audit-backed fields come from the latest dated audit; the website profile owns URL and CMS.
  const cellValue = (w: Site, key: string) =>
    key === 'seo_score'
      ? w.latest_audit?.score
      : key === 'audit_date'
        ? w.latest_audit?.measurement_date
        : key === 'website_url'
          ? w.canonical_url
          : key === 'cms'
            ? w.cms
            : w.fields[key];
  // Reviews count what the table shows, so profile and audit values are not reported as gaps.
  const reviewSite = (w: Site) =>
    reviewPage({
      ...w.fields,
      ...Object.fromEntries(['seo_score', 'audit_date', 'website_url', 'cms'].map(k => [k, cellValue(w, k) ?? null])),
    });
  const sortField = pageFields.find(f => f.key === sort.key);
  const visibleSites = (catalog?.websites || [])
    .filter(w => {
      const review = reviewSite(w);
      return (
        `${w.name} ${w.country}`.toLowerCase().includes(search.toLowerCase()) &&
        (focus !== 'issues' || review.issues.length > 0) &&
        (focus !== 'gaps' || review.missing.length > 0) &&
        (focus !== 'unaudited' || !w.latest_audit) &&
        (!auditDueOnly || !!w.audit_due)
      );
    })
    .sort(
      (a, b) =>
        (sortField
          ? compareCells(cellValue(a, sortField.key), cellValue(b, sortField.key), sortField.type, sort.direction)
          : 0) || a.name.localeCompare(b.name) * (sortField ? 1 : sort.direction),
    );
  const toggleSort = (key: string) =>
    setSort(current => ({key, direction: current.key === key && current.direction === 1 ? -1 : 1}));
  const groups = [...new Set(pageFields.map(f => f.group))];
  const liveReview = reviewPage(fields);
  const currentAudits = (catalog?.audits || []).filter(a => !catalog?.audits.some(n => n.supersedes_id === a.id));
  const trendReady = currentAudits.some((a, i) => currentAudits.findIndex(b => b.source === a.source) !== i);
  /** Recorded answers in a form section as the user edits; generated fields are not counted. */
  const groupProgress = (group: string) => {
    const total = recordableFields(pageFields).filter(f => f.group === group).length;
    return {done: total - liveReview.missing.filter(f => f.group === group).length, total};
  };
  const blankish = (v: unknown) => (v == null || v === '' || v === 'unknown' ? '' : String(v));
  const saved = site ? formValues(site) : {};
  const changes = site
    ? pageFields.filter(
        f => blankish(fields[f.key]) !== blankish(saved[f.key]) || (notes[f.key] || '') !== (site.notes[f.key] || ''),
      ).length
    : 0;
  /** Unrecorded answers in a field group across the websites currently listed. */
  const groupGaps = (group: string) =>
    visibleSites.reduce(
      (n, w) => n + reviewSite(w).missing.filter(f => group === 'all' || f.group === group).length,
      0,
    );
  // Counts cover every website, so they stay put while a tile filters the table.
  function summaryTiles(d: Catalog): Tile[] {
    const reviews = d.websites.map(reviewSite);
    const issueTile: Tile = {
      label: 'Checklist issues',
      hint: 'Websites with a No or In progress answer',
      value: reviews.filter(r => r.issues.length > 0).length,
      status: 'blocked',
      focus: 'issues',
      active: focus === 'issues',
    };
    if (mode === 'seo') {
      const scores = d.websites.flatMap(w => (w.latest_audit ? [w.latest_audit.score] : []));
      const average = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return [
        {
          label: 'Average SEO score',
          hint: `Latest audit on ${scores.length} of ${d.websites.length} websites`,
          value: average ?? '—',
          status: average === null ? 'cancelled' : bandStatus[scoreBand(average)],
        },
        {
          label: 'Not yet audited',
          hint: 'No dated audit recorded',
          value: d.websites.length - scores.length,
          status: 'to_do',
          focus: 'unaudited',
          active: focus === 'unaudited',
        },
        issueTile,
        ...(d.audit_interval_days !== undefined
          ? [
              {
                label: 'Due for audit',
                hint: `No audit in ${d.audit_interval_days} days`,
                value: d.websites.filter(w => w.audit_due).length,
                status: 'in_review',
                focus: 'audit_due',
                active: auditDueOnly,
              },
            ]
          : []),
      ];
    }
    const total = d.websites.length * recordableFields(pageFields).length;
    const blank = reviews.reduce((n, r) => n + r.missing.length, 0);
    const share = total ? Math.round(((total - blank) / total) * 100) : 0;
    return [
      {
        label: 'Fields recorded',
        hint: `${total - blank} of ${total} answers`,
        value: `${share}%`,
        status: total ? bandStatus[scoreBand(share)] : 'cancelled',
      },
      {
        label: 'Websites with gaps',
        hint: 'At least one answer missing',
        value: reviews.filter(r => r.missing.length > 0).length,
        status: 'to_do',
        focus: 'gaps',
        active: focus === 'gaps',
      },
      issueTile,
      {
        label: 'Complete',
        hint: 'Every field recorded',
        value: reviews.filter(r => r.missing.length === 0).length,
        status: 'completed',
      },
    ];
  }
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
      if (mode === 'seo') {
        row['Mobile performance /100'] = w.lighthouse?.performance_score ?? '';
        row['Mobile LCP (seconds)'] = w.lighthouse?.lcp_seconds ?? '';
        row['Automatic measured at'] = w.lighthouse?.measured_at ?? '';
        row['Lighthouse version'] = w.lighthouse?.lighthouse_version ?? '';
      }
      for (const f of matrixFields) {
        const value = cellValue(w, f.key);
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
      {mode === 'seo' && (
        <p className="form-hint">
          Automatic audits use Google PageSpeed Insights mobile Lighthouse. Performance /100 and LCP seconds are
          separate from the manually recorded speed field. Limit: 20 audits/workspace/hour, five minutes between website
          attempts.
        </p>
      )}
      {auditing && (
        <p role="status">Running Google mobile audit... This can take up to two minutes. Keep this page open.</p>
      )}
      <div className="section-toolbar">
        {/* The page heading already names the list, so the title only appears for one website. */}
        {site ? (
          <div className="site-header">
            <h2>{site.name}</h2>
            <p className="site-meta site-meta-dotted">
              <span>{site.country}</span>
              {/^https?:\/\//i.test(site.canonical_url) ? (
                <a href={site.canonical_url} target="_blank" rel="noreferrer">
                  {site.canonical_url.replace(/^https?:\/\//i, '')}
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : (
                <span>{site.canonical_url}</span>
              )}
              <span>{site.cms || 'CMS not set'}</span>
              {(site.archived_at || site.status === 'archived') && <span>Archived</span>}
            </p>
            <p className="site-meta">
              {mode === 'seo' &&
                (site.latest_audit ? (
                  <>
                    <span className="matrix-score" data-band={scoreBand(site.latest_audit.score)}>
                      {site.latest_audit.score}/100
                    </span>
                    <span>
                      Latest audit {displayDate(site.latest_audit.measurement_date, today)} · {site.latest_audit.source}
                    </span>
                  </>
                ) : (
                  <span>Not yet audited</span>
                ))}
              <span>
                {recordableFields(pageFields).length - reviewSite(site).missing.length} of{' '}
                {recordableFields(pageFields).length} fields recorded
              </span>
            </p>
          </div>
        ) : (
          <p className="form-hint">{catalog ? `${catalog.websites.length} websites` : ''}</p>
        )}
        <div className="row">
          {site && (
            <button className="button secondary" disabled={busy} onClick={() => open(null)}>
              All websites
            </button>
          )}
          {site && mode === 'seo' && (
            <button
              className="button primary"
              disabled={busy || dirty || !!site.archived_at || site.status === 'archived'}
              title={dirty ? 'Save or discard your changes first' : undefined}
              onClick={() => setRecording(true)}
            >
              Record audit
            </button>
          )}
          {!site && catalog && (
            <>
              <button className="button secondary" disabled={!visibleSites.length} onClick={() => exportSites('csv')}>
                Export CSV
              </button>
              <button className="button secondary" disabled={!visibleSites.length} onClick={() => exportSites('xlsx')}>
                Export Excel
              </button>
            </>
          )}
          <button className="button secondary" disabled={busy} onClick={() => open(site?.id || null)}>
            Reload latest
          </button>
        </div>
      </div>
      {!catalog && !error && <p>Loading website health…</p>}
      {!site && catalog && (
        <>
          <SummaryTiles
            tiles={summaryTiles(catalog)}
            onToggle={tile =>
              tile.focus === 'audit_due'
                ? showAuditDue(!auditDueOnly)
                : setFocus(focus === tile.focus ? '' : (tile.focus as typeof focus))
            }
          />
          <div className="task-filter-panel seo-filter-panel">
            <label className="field">
              Find a website
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Website or country" />
            </label>
            {mode === 'seo' && catalog.audit_interval_days !== undefined && (
              <>
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
          </div>
          {groups.length > 1 && (
            <div className="simple-task-tabs matrix-tabs" role="group" aria-label="Field group">
              {['all', ...groups].map(g => {
                const gaps = groupGaps(g);
                return (
                  <button
                    key={g}
                    className="button secondary"
                    aria-pressed={fieldGroup === g}
                    onClick={() => setFieldGroup(g)}
                  >
                    {g === 'all' ? 'All fields' : g}
                    {gaps > 0 && (
                      <span className="tab-count">
                        {gaps}
                        <span className="sr-only"> gaps</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          <p className="form-hint">
            {visibleSites.length} of {catalog.websites.length} websites · {matrixFields.length} fields. Select a column
            heading to sort, or a website to edit it.
          </p>
          <section className="card comparison-wrap" tabIndex={0} role="region" aria-label="Website field comparison">
            <table className="website-comparison">
              <thead>
                <tr>
                  {[{key: 'name', label: 'Website', type: 'text'}, ...matrixFields].map(f => {
                    const sorted = sort.key === f.key;
                    const Icon = !sorted ? ArrowUpDown : sort.direction === 1 ? ArrowUp : ArrowDown;
                    return (
                      <th
                        scope="col"
                        key={f.key}
                        aria-sort={sorted ? (sort.direction === 1 ? 'ascending' : 'descending') : undefined}
                      >
                        <button className="sort-button" onClick={() => toggleSort(f.key)}>
                          {f.label}
                          {f.type === 'duration' ? ' (seconds)' : ''}
                          {['qa', 'plugin_updated', 'backup_date'].includes(f.key) ? ' (reference)' : ''}
                          <Icon size={13} aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                  {mode === 'seo' && (
                    <>
                      <th scope="col">Mobile performance /100</th>
                      <th scope="col">LCP (seconds)</th>
                      <th scope="col">Automatic audit</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleSites.map(w => (
                  <tr key={w.id}>
                    <th scope="row">
                      <button
                        className="matrix-site"
                        disabled={busy}
                        onClick={() => open(w.id)}
                        aria-label={`Edit ${mode === 'seo' ? 'SEO' : 'features'} for ${w.name}`}
                      >
                        <strong>{w.name}</strong>
                        <Pencil size={13} aria-hidden="true" />
                      </button>
                      <small className="block">
                        {w.country}
                        {w.archived_at || w.status === 'archived' ? ' - Archived' : ''}
                      </small>
                    </th>
                    {matrixFields.map(f => {
                      const value = cellValue(w, f.key);
                      const missing = value == null || value === '' || value === 'unknown';
                      const text =
                        f.type === 'status'
                          ? statusName(String(value))
                          : f.type === 'date'
                            ? displayDate(String(value), today)
                            : String(value);
                      return (
                        <td key={f.key}>
                          {missing ? (
                            // A faint dash keeps recorded values prominent; screen readers still hear the state.
                            <span className="matrix-empty" title="Not recorded">
                              <span aria-hidden="true">—</span>
                              <span className="sr-only">Not recorded</span>
                            </span>
                          ) : f.key === 'seo_score' ? (
                            <span className="matrix-score" data-band={scoreBand(Number(value))}>
                              {String(value)}/100
                            </span>
                          ) : (
                            <span
                              className={f.type === 'status' ? 'matrix-status' : 'matrix-value'}
                              data-value={String(value)}
                              title={f.type === 'date' ? String(value) : undefined}
                            >
                              {f.type === 'long_text' && text.length > 120 ? (
                                <details>
                                  <summary>{text.slice(0, 100)}...</summary>
                                  <p>{text}</p>
                                </details>
                              ) : (
                                text
                              )}
                              {f.type === 'duration' ? ' s' : ''}
                            </span>
                          )}
                          {w.notes[f.key] && (
                            <details className="matrix-note">
                              <summary>Note</summary>
                              <p>{w.notes[f.key]}</p>
                            </details>
                          )}
                        </td>
                      );
                    })}
                    {mode === 'seo' && (
                      <>
                        <td>{w.lighthouse?.performance_score ?? 'Not recorded'}</td>
                        <td>{w.lighthouse?.lcp_seconds ?? 'Not recorded'}</td>
                        <td>
                          {w.lighthouse && (
                            <small className="block">
                              {new Date(w.lighthouse.finished_at || w.lighthouse.measured_at).toLocaleString('en-GB', {
                                timeZone: data.workspace.timezone,
                              })}
                            </small>
                          )}
                          <button
                            className="button secondary"
                            disabled={busy || !!w.archived_at || w.status === 'archived'}
                            onClick={() => automaticAudit(w.id)}
                          >
                            {auditing === w.id ? 'Auditing...' : 'Run audit'}
                          </button>
                        </td>
                      </>
                    )}
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
      {site && mode === 'seo' && (
        <section className="card padded">
          <div className="section-toolbar">
            <h3>Automatic SEO & page speed</h3>
            <button
              className="button primary"
              disabled={busy || dirty || !!site.archived_at || site.status === 'archived'}
              onClick={() => automaticAudit(site.id)}
            >
              {auditing ? 'Auditing...' : 'Run automatic audit'}
            </button>
          </div>
          {dirty && <p className="form-hint">Save or discard form changes before running an automatic audit.</p>}
          <p>
            Mobile performance:{' '}
            <strong>{site.lighthouse ? `${site.lighthouse.performance_score}/100` : 'Not recorded'}</strong> / Largest
            contentful paint:{' '}
            {site.lighthouse?.lcp_seconds == null ? 'Not recorded' : `${site.lighthouse.lcp_seconds} seconds`}
          </p>
          {site.lighthouse && (
            <p className="form-hint">
              Measured{' '}
              {new Date(site.lighthouse.measured_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})} /
              Lighthouse {site.lighthouse.lighthouse_version}
            </p>
          )}
          <AutomaticAuditHistory
            key={site.id}
            website={site.id}
            refresh={`${site.lighthouse?.id || ''}:${auditRefresh}`}
            timezone={data.workspace.timezone}
          />
        </section>
      )}
      {recording && site && catalog && (
        <RecordAuditDialog
          websiteName={site.name}
          audits={catalog.audits}
          today={today}
          defaultSource={site.latest_audit?.source ?? site.source ?? ''}
          onSubmit={recordAudit}
          onClose={() => setRecording(false)}
        />
      )}
      {site && catalog && (
        <>
          {/* A trend needs two audits from one source; until then the header shows the latest. */}
          {mode === 'seo' && trendReady && <SeoTrend key={site.id} audits={catalog.audits} />}
          <section className="card padded">
            <h3>Latest saved review</h3>
            <p>
              {reviewSite(site).issues.length} checklist issues · {reviewSite(site).missing.length} fields not recorded.
            </p>
            <p className="form-hint">
              Generated maintenance reference dates are excluded from completeness and issue counts.
            </p>
            <details>
              <summary>Review checklist issues</summary>
              <ul>
                {reviewSite(site).issues.map(f => (
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
              {!reviewSite(site).issues.length && <p>No issues flagged by recorded checklist statuses.</p>}
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
              <div className={groups.length > 1 ? 'seo-form-layout' : undefined}>
                {groups.length > 1 && (
                  <nav className="seo-form-nav" aria-label="Form sections">
                    {groups.map(g => {
                      const p = groupProgress(g);
                      return (
                        <a key={g} href={`#${sectionId(g)}`}>
                          <span>{g}</span>
                          {p.total > 0 && (
                            <small>
                              {p.done}/{p.total}
                              <span className="sr-only"> recorded</span>
                            </small>
                          )}
                        </a>
                      );
                    })}
                  </nav>
                )}
                <div>
                  {groups.map(group => (
                    <fieldset className="seo-field-group" key={group} id={sectionId(group)}>
                      <legend>
                        {group}
                        {groupProgress(group).total > 0 && (
                          <small>
                            {groupProgress(group).done} of {groupProgress(group).total} recorded
                          </small>
                        )}
                      </legend>
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
                                    readOnly={[
                                      'website_url',
                                      'cms',
                                      'seo_score',
                                      'audit_date',
                                      'qa',
                                      'plugin_updated',
                                      'backup_date',
                                    ].includes(f.key)}
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
                                <>
                                  {['seo_score', 'audit_date'].includes(f.key) && (
                                    <small className="form-hint">
                                      From the latest audit. Use Record audit to add one.
                                    </small>
                                  )}
                                  <details className="seo-field-note" open={!!notes[f.key] || undefined}>
                                    <summary>{notes[f.key] ? 'Note' : 'Add note'}</summary>
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
                                </>
                              )}
                            </div>
                          ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </div>
              <p className="form-hint">
                Leave unmeasured fields blank. Unknown is different from No. Do not enter passwords, API keys or payment
                credentials.
              </p>
              {/* Stays in view while editing a long form; Discard restores the last saved values. */}
              <div className="form-savebar" data-dirty={dirty || undefined}>
                <span role="status">
                  {changes > 0
                    ? `${changes} unsaved change${changes === 1 ? '' : 's'}`
                    : dirty
                      ? 'Unsaved changes'
                      : 'No unsaved changes'}
                </span>
                <div className="row">
                  {dirty && (
                    <button type="button" className="text-button" onClick={discard}>
                      Discard
                    </button>
                  )}
                  <button className="button primary" disabled={!dirty} type="submit">
                    {busy ? 'Saving...' : mode === 'seo' ? 'Save SEO' : 'Save features'}
                  </button>
                </div>
              </div>
            </fieldset>
            {(site.archived_at || site.status === 'archived') && (
              <p className="form-hint">Restore this website from Websites before editing.</p>
            )}
          </form>
          <SeoHistory
            key={site.id}
            catalog={catalog}
            mode={mode}
            pageFields={pageFields}
            member={member}
            today={today}
            timezone={data.workspace.timezone}
          />
        </>
      )}
      {!site && mode === 'features' && data.profile.role === 'administrator' && (
        <SeoImport
          pageFields={pageFields}
          busy={busy}
          lockRef={lock}
          onBusy={setBusy}
          onError={setError}
          onMessage={setMessage}
          onImported={async () => {
            setCatalog(await workspaceFetch('/api/seo-health'));
            await onChanged();
          }}
        />
      )}
    </div>
  );
}
