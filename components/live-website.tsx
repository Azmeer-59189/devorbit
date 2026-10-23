'use client';
import {useEffect, useRef, useState} from 'react';
import {Workspace, Task, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {reviewSeo} from '@/lib/seo-review';
import {SeoValues} from '@/lib/seo-health';
import {websiteConfig, websiteManagementInput} from '@/lib/website-management';
type Site = {
  id: string;
  name: string;
  country: string;
  canonical_url: string;
  cms: string;
  status: string;
  configuration: Record<string, string>;
  revision?: number;
  archived_at: string | null;
};
type Detail = {
  website: Site;
  tasks: Task[];
  logs: {id: string; user_id: string; work_date: string; duration_minutes: number; notes: string}[];
  reports: {
    id: string;
    period_start: string;
    period_end: string;
    form_template_versions: {title: string; version_number: number};
  }[];
  relatedErrors: string[];
};
export default function LiveWebsite({
  id,
  data,
  onBack,
  onChanged,
  onTask,
  onReports,
}: {
  id: string;
  data: Workspace;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onTask: (task: Task) => void;
  onReports: () => void;
}) {
  const [health, setHealth] = useState<{
    fields: SeoValues;
    latest_audit: {score: number; measurement_date: string; source: string} | null;
  } | null>(null);
  const [healthError, setHealthError] = useState('');
  const [healthRetry, setHealthRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch(`/api/seo-health?website=${id}`)
      .then(d => {
        if (!cancelled) {
          setHealth(d.websites[0] || null);
          setHealthError('');
        }
      })
      .catch(e => {
        if (!cancelled) setHealthError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, healthRetry]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Site | null>(null);
  const [tab, setTab] = useState('Overview');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  const receipt = useRef<{key: string; id: string} | null>(null);
  const canEdit = ['administrator', 'manager'].includes(data.profile.role);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch(`/api/websites/${id}`)
      .then(d => {
        if (!cancelled) {
          setDetail(d);
          setForm(d.website);
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function reload() {
    if (dirty && !window.confirm('Discard your unsaved website changes and load the latest version?')) return;
    try {
      const d = await workspaceFetch(`/api/websites/${id}`);
      setDetail(d);
      setForm(d.website);
      setDirty(false);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function save(action: string) {
    if (!form || saving.current) return;
    if (action === 'archive' && !window.confirm('Archive this website? Its tasks and reports will be preserved.'))
      return;
    setError('');
    try {
      const values = {
        ...form,
        url: form.canonical_url,
        website_id: id,
        expected_revision: form.revision,
        action,
        configuration: Object.fromEntries(websiteConfig.map(k => [k, form.configuration[k] || ''])),
      };
      const key = JSON.stringify(values);
      if (receipt.current?.key !== key) receipt.current = {key, id: crypto.randomUUID()};
      const input = websiteManagementInput({...values, request_id: receipt.current.id});
      saving.current = true;
      setBusy(true);
      await workspaceFetch(`/api/websites/${id}`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      receipt.current = null;
      setDirty(false);
      setMessage(
        action === 'archive'
          ? 'Website archived. History is preserved.'
          : action === 'restore'
            ? 'Website restored.'
            : 'Website updated.',
      );
      const d = await workspaceFetch(`/api/websites/${id}`);
      setDetail(d);
      setForm(d.website);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  function change(p: Partial<Site>) {
    setForm({...form!, ...p});
    setDirty(true);
    setMessage('');
  }
  return (
    <section className="website-management">
      <div className="section-toolbar">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            if (!dirty || window.confirm('Discard unsaved website changes?')) onBack();
          }}
        >
          Back to websites
        </button>
        <button className="text-button" disabled={busy} onClick={reload}>
          Reload latest
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="timesheet-message" role="status">
          {message}
        </p>
      )}
      {!detail || !form ? (
        <p className="card padded">
          {error ? 'Unable to load website. Use Reload latest to retry.' : 'Loading website…'}
        </p>
      ) : (
        <>
          <section className="card padded">
            <div className="website-detail-header">
              <div>
                <h2>{detail.website.name}</h2>
                <p className="muted">
                  {detail.website.country} · {statusName(detail.website.status)}
                </p>
              </div>
              <a
                className="button secondary"
                href={/^https?:\/\//.test(detail.website.canonical_url) ? detail.website.canonical_url : undefined}
                target="_blank"
                rel="noreferrer"
              >
                Visit website ↗
              </a>
            </div>
            <div className="simple-task-tabs website-detail-tabs" role="group" aria-label="Website sections">
              {['Overview', 'Details', 'Tasks', 'Reports'].map(t => (
                <button className="button secondary" key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                  {t}
                </button>
              ))}
            </div>
            {tab === 'Overview' && (
              <div className="website-overview">
                <section>
                  <h3>SEO health</h3>
                  {healthError ? (
                    <p role="alert">
                      {healthError}{' '}
                      <button className="text-button" onClick={() => setHealthRetry(n => n + 1)}>
                        Retry SEO summary
                      </button>
                    </p>
                  ) : health ? (
                    <>
                      <p>
                        <strong>{health.latest_audit ? `${health.latest_audit.score}/100` : 'No dated audit'}</strong>
                      </p>
                      {health.latest_audit && (
                        <p>
                          Last audit: {health.latest_audit.measurement_date} ? {health.latest_audit.source}
                        </p>
                      )}
                      <p>
                        {reviewSeo(health.fields).issues.length} checklist issues ?{' '}
                        {reviewSeo(health.fields).missing.length} missing fields
                      </p>
                    </>
                  ) : (
                    <p role="status">Loading SEO summary?</p>
                  )}
                  <button className="button secondary" onClick={onReports}>
                    Open SEO form & history
                  </button>
                </section>
                <section>
                  <h3>Open tasks</h3>
                  <p className="form-hint">From up to 100 linked tasks.</p>
                  {detail.tasks
                    .filter(t => !['completed', 'cancelled'].includes(t.progress))
                    .slice(0, 5)
                    .map(t => (
                      <button key={t.id} className="website-related-row" onClick={() => onTask(t)}>
                        <strong>{t.title}</strong>
                        <span>
                          {statusName(t.progress)} ? {t.due_date ? `Due ${t.due_date}` : 'No deadline'}
                        </span>
                      </button>
                    ))}
                  {!detail.tasks.some(t => !['completed', 'cancelled'].includes(t.progress)) && (
                    <p>No open tasks in the loaded list.</p>
                  )}
                  <button className="text-button" onClick={() => setTab('Tasks')}>
                    View linked tasks
                  </button>
                </section>
                <section>
                  <h3>Website information</h3>
                  <p>{detail.website.canonical_url}</p>
                  <p>CMS: {detail.website.cms || 'Not recorded'}</p>
                  <button className="text-button" onClick={() => setTab('Details')}>
                    View website settings
                  </button>
                </section>
              </div>
            )}
            {tab === 'Details' && (
              <form
                onSubmit={e => {
                  e.preventDefault();
                  save('save');
                }}
              >
                {form.revision === undefined && (
                  <p className="form-error">Apply migration 006 to enable website editing.</p>
                )}
                <fieldset
                  className="live-form-fieldset"
                  disabled={
                    busy || !canEdit || !!form.archived_at || form.status === 'archived' || form.revision === undefined
                  }
                >
                  <div className="form-row">
                    <label className="field">
                      Website name *
                      <input
                        required
                        maxLength={150}
                        value={form.name}
                        onChange={e => change({name: e.target.value})}
                      />
                    </label>
                    <label className="field">
                      Country / chapter *
                      <input
                        required
                        maxLength={100}
                        value={form.country}
                        onChange={e => change({country: e.target.value})}
                      />
                    </label>
                  </div>
                  <label className="field">
                    Website URL *
                    <input
                      required
                      type="url"
                      value={form.canonical_url}
                      onChange={e => change({canonical_url: e.target.value})}
                    />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      CMS
                      <input maxLength={100} value={form.cms || ''} onChange={e => change({cms: e.target.value})} />
                    </label>
                    <label className="field">
                      Status
                      <select value={form.status} onChange={e => change({status: e.target.value})}>
                        {[
                          'active',
                          'maintenance',
                          'needs_attention',
                          'inactive',
                          ...(form.status === 'archived' ? ['archived'] : []),
                        ].map(s => (
                          <option key={s} value={s}>
                            {statusName(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <h3>Website configuration</h3>
                  <p className="form-hint">
                    Keep provider names and operational notes here. Never enter passwords, API keys, or other
                    credentials.
                  </p>
                  {websiteConfig.map(k => (
                    <label className="field" key={k}>
                      {
                        {
                          hosting: 'Hosting provider',
                          domain_registrar: 'Domain registrar',
                          crm: 'CRM / integrations',
                          analytics: 'Analytics tools',
                          notes: 'Operational notes',
                        }[k]
                      }
                      {k === 'notes' ? (
                        <textarea
                          rows={4}
                          maxLength={2000}
                          value={form.configuration[k] || ''}
                          onChange={e => change({configuration: {...form.configuration, [k]: e.target.value}})}
                        />
                      ) : (
                        <input
                          maxLength={2000}
                          value={form.configuration[k] || ''}
                          onChange={e => change({configuration: {...form.configuration, [k]: e.target.value}})}
                        />
                      )}
                    </label>
                  ))}
                  {canEdit && (
                    <button className="button primary" disabled={!dirty} type="submit">
                      {busy ? 'Saving…' : 'Save changes'}
                    </button>
                  )}
                </fieldset>
              </form>
            )}
            {tab === 'Tasks' && (
              <>
                <h3>Linked tasks</h3>
                <p className="form-hint">Up to 100 linked tasks. Open a task to manage its progress and assignment.</p>
                {detail.tasks.map(t => (
                  <button className="website-related-row" key={t.id} onClick={() => onTask(t)}>
                    <strong>{t.title}</strong>
                    <span>
                      {statusName(t.progress)} ·{' '}
                      {data.members.find(m => m.id === t.assignee_id)?.display_name || 'Unassigned'}
                    </span>
                  </button>
                ))}
                {!detail.tasks.length && <p className="muted">No tasks linked to this website.</p>}
              </>
            )}
            {tab === 'Reports' && (
              <>
                <div className="section-toolbar">
                  <h3>Report history</h3>
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (!dirty || window.confirm('Discard unsaved website changes?')) onReports();
                    }}
                  >
                    Open reporting
                  </button>
                </div>
                <p className="form-hint">Latest 100 reports for this website.</p>
                {detail.reports.map(r => (
                  <article key={r.id} className="website-related-row">
                    <strong>
                      {r.form_template_versions.title} · v{r.form_template_versions.version_number}
                    </strong>
                    <span>
                      {r.period_start} — {r.period_end}
                    </span>
                  </article>
                ))}
                {!detail.reports.length && <p className="muted">No reports submitted for this website.</p>}
              </>
            )}
            {detail.relatedErrors.map(e => (
              <p role="alert" className="form-error" key={e}>
                {e}
              </p>
            ))}
          </section>
          {canEdit && (
            <section className="card padded website-archive">
              <div>
                <h3>{form.archived_at || form.status === 'archived' ? 'Archived website' : 'Archive website'}</h3>
                <p className="muted">
                  Archived websites remain available in history. Existing tasks and reports stay intact.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={busy || dirty || form.revision === undefined}
                onClick={() => save(form.archived_at || form.status === 'archived' ? 'restore' : 'archive')}
              >
                {form.archived_at || form.status === 'archived' ? 'Restore website' : 'Archive website'}
              </button>
            </section>
          )}
        </>
      )}
    </section>
  );
}
