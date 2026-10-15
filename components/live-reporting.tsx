'use client';
import {useEffect, useState} from 'react';
import {Workspace} from '@/lib/live-types';
import {
  fieldTypes,
  ReportField,
  ReportingCatalog,
  Template,
  TemplateVersion,
  seoFields,
  templateInput,
  reportInput,
  validateAnswers,
} from '@/lib/reporting';
import {workspaceFetch} from '@/lib/workspace-client';
import {weekRange, workspaceDate} from '@/lib/dates';
import ReportFields from './live-report-fields';
import {csv} from '@/lib/csv';
type Revision = {
  id: string;
  revision_number: number;
  answers: Record<string, unknown>;
  reason: string;
  created_at: string;
  actor_id: string;
};
type Report = {
  id: string;
  website_id: string;
  template_version_id: string;
  period_start: string;
  period_end: string;
  submitter_id: string;
  report_revisions: Revision[];
  form_template_versions: TemplateVersion;
};
const blank = (): Template => ({
  id: '',
  title: '',
  description: '',
  type: 'custom',
  state: 'draft',
  draft_fields: [],
  draft_website_ids: [],
  draft_revision: 1,
  published_draft_revision: null,
});
export default function LiveReporting({data, builder = false}: {data: Workspace; builder?: boolean}) {
  const [catalog, setCatalog] = useState<ReportingCatalog>({templates: [], versions: [], assignments: []});
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState<Template>(blank);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [site, setSite] = useState('');
  const [versionId, setVersionId] = useState('');
  const [week, setWeek] = useState(() => weekRange(workspaceDate(data.workspace.timezone)).start);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Report | null>(null);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [filter, setFilter] = useState('');
  async function reload() {
    const [c, r] = await Promise.all([workspaceFetch('/api/templates'), workspaceFetch('/api/reports')]);
    setCatalog(c);
    setReports(r);
    setReady(true);
    return c as ReportingCatalog;
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([workspaceFetch('/api/templates'), workspaceFetch('/api/reports')])
      .then(([c, r]) => {
        if (!cancelled) {
          setCatalog(c);
          setReports(r);
          setReady(true);
        }
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
  function change(p: Partial<Template>) {
    setDraft({...draft, ...p});
    setDirty(true);
  }
  function pick(t: Template) {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    setDraft(t);
    setDirty(false);
    setPreview(false);
    setPreviewAnswers({});
  }
  function updateField(index: number, p: Partial<ReportField>) {
    change({draft_fields: draft.draft_fields.map((f, i) => (i === index ? {...f, ...p} : f))});
  }
  async function templateAction(action: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const input = templateInput({
        request_id: crypto.randomUUID(),
        template_id: draft.id || null,
        action: action === 'save' && !draft.id ? 'create' : action,
        expected_revision: draft.draft_revision,
        title: draft.title,
        description: draft.description,
        type: draft.type,
        fields: draft.draft_fields,
        website_ids: draft.draft_website_ids,
      });
      const saved = await workspaceFetch('/api/templates', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      const c = await reload();
      setDraft(c.templates.find(t => t.id === saved.id)!);
      setDirty(false);
      setMessage(
        action === 'publish'
          ? 'Published a new immutable version.'
          : action === 'archive'
            ? 'Template archived. Existing reports are preserved.'
            : 'Draft saved.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const versions = catalog.versions
    .filter(
      v =>
        catalog.templates.some(t => t.id === v.template_id && t.state === 'published') &&
        catalog.assignments.some(a => a.template_id === v.template_id && a.website_id === site),
    )
    .filter((v, i, all) => all.findIndex(x => x.template_id === v.template_id) === i);
  const version = selected?.form_template_versions || versions.find(v => v.id === versionId);
  const latest = selected?.report_revisions.toSorted((a, b) => b.revision_number - a.revision_number)[0];
  async function submit() {
    if (busy || !version) return;
    setBusy(true);
    setError('');
    try {
      const input = reportInput({
        request_id: crypto.randomUUID(),
        submission_id: selected?.id,
        website_id: selected?.website_id || site,
        template_version_id: version.id,
        period_start: selected?.period_start || week,
        answers,
        reason,
        expected_revision: latest?.revision_number,
      });
      validateAnswers(version.fields, answers);
      await workspaceFetch('/api/reports', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      await reload();
      setSelected(null);
      setEditing(false);
      setAnswers({});
      setDirty(false);
      setMessage('Report saved with its version and revision history.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportReports() {
    const rows = reports
      .filter(r => !filter || r.website_id === filter)
      .map(r => {
        const revision = r.report_revisions.toSorted((a, b) => b.revision_number - a.revision_number)[0];
        return {
          website: siteName(r.website_id),
          period_start: r.period_start,
          period_end: r.period_end,
          template: r.form_template_versions.title,
          version: r.form_template_versions.version_number,
          revision: revision?.revision_number,
          answers: JSON.stringify(revision?.answers || {}),
          schema: JSON.stringify(r.form_template_versions.fields),
        };
      });
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv(rows)], {type: 'text/csv;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'devorbit-reports-latest-100.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const siteName = (id: string) => data.websites.find(s => s.id === id)?.name || 'Website';
  return (
    <div className="reporting-page">
      {error && (
        <div role="alert" className="form-error">
          {error}{' '}
          <button
            className="text-button"
            onClick={() =>
              reload()
                .then(() => setError(''))
                .catch(e => setError(e.message))
            }
          >
            Refresh data
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="report-notice">
          {message}
        </p>
      )}
      {!ready && !error && <p>Loading reporting workspace…</p>}
      {builder ? (
        <div className="report-layout">
          <aside className="card padded">
            <button className="button primary" onClick={() => pick(blank())}>
              New template
            </button>
            {catalog.templates.map(t => (
              <button className="report-template" key={t.id} onClick={() => pick(t)}>
                <strong>{t.title}</strong>
                <small>
                  {t.state} · draft revision {t.draft_revision}
                </small>
              </button>
            ))}
          </aside>
          <section className="card padded">
            <h2>{draft.id ? 'Edit template' : 'Create a report template'}</h2>
            <p className="muted">
              Save a draft, preview it, then publish. Published versions and submitted answers stay unchanged.
            </p>
            <fieldset className="live-form-fieldset" disabled={busy || draft.state === 'archived'}>
              <label className="field">
                Title
                <input value={draft.title} maxLength={150} onChange={e => change({title: e.target.value})} />
              </label>
              <label className="field">
                Description
                <textarea
                  value={draft.description}
                  maxLength={2000}
                  onChange={e => change({description: e.target.value})}
                />
              </label>
              <label className="field">
                Report type
                <select value={draft.type} onChange={e => change({type: e.target.value})}>
                  {['custom', 'seo', 'maintenance', 'website_update'].map(t => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <div className="row">
                <button
                  className="button secondary"
                  onClick={() =>
                    change({
                      draft_fields: [
                        ...draft.draft_fields,
                        {key: `field_${Date.now()}`, label: 'New field', type: 'short_text', required: false, help: ''},
                      ],
                    })
                  }
                >
                  Add field
                </button>
                <button
                  className="button secondary"
                  onClick={() => {
                    if (!draft.draft_fields.length || window.confirm('Replace the draft fields with the SEO preset?'))
                      change({type: 'seo', draft_fields: structuredClone(seoFields)});
                  }}
                >
                  Use SEO preset
                </button>
              </div>
              {draft.draft_fields.map((f, i) => (
                <section className="report-field-editor" key={i}>
                  <div className="form-row">
                    <label className="field">
                      Label
                      <input value={f.label} onChange={e => updateField(i, {label: e.target.value})} />
                    </label>
                    <label className="field">
                      Stable field key
                      <input value={f.key} onChange={e => updateField(i, {key: e.target.value})} />
                    </label>
                    <label className="field">
                      Type
                      <select
                        value={f.type}
                        onChange={e => {
                          const clean: ReportField = {
                            key: f.key,
                            label: f.label,
                            help: f.help,
                            required: f.required,
                            type: e.target.value as ReportField['type'],
                          };
                          if (['dropdown', 'multi_select'].includes(clean.type)) clean.options = ['Option 1'];
                          change({draft_fields: draft.draft_fields.map((v, n) => (n === i ? clean : v))});
                        }}
                      >
                        {fieldTypes.map(t => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field">
                    Help text
                    <input value={f.help} onChange={e => updateField(i, {help: e.target.value})} />
                  </label>
                  <label className="checkbox-field">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={e => updateField(i, {required: e.target.checked})}
                    />
                    Required
                  </label>
                  {['dropdown', 'multi_select'].includes(f.type) && (
                    <label className="field">
                      Options (one per line)
                      <textarea
                        value={f.options?.join('\n') || ''}
                        onChange={e => updateField(i, {options: e.target.value.split('\n')})}
                      />
                    </label>
                  )}
                  {['integer', 'decimal'].includes(f.type) && (
                    <div className="form-row">
                      {(['min', 'max'] as const).map(k => (
                        <label className="field" key={k}>
                          {k}
                          <input
                            type="number"
                            value={f[k] ?? ''}
                            onChange={e => {
                              const next = {...f};
                              if (e.target.value === '') delete next[k];
                              else next[k] = Number(e.target.value);
                              change({draft_fields: draft.draft_fields.map((v, n) => (n === i ? next : v))});
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {['short_text', 'long_text', 'url'].includes(f.type) && (
                    <label className="field">
                      Maximum characters
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={f.max_length ?? ''}
                        onChange={e => {
                          const next = {...f};
                          if (e.target.value === '') delete next.max_length;
                          else next.max_length = Number(e.target.value);
                          change({draft_fields: draft.draft_fields.map((v, n) => (n === i ? next : v))});
                        }}
                      />
                    </label>
                  )}
                  <div className="row">
                    <button
                      className="text-button"
                      disabled={i === 0}
                      onClick={() => {
                        const fields = [...draft.draft_fields];
                        [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
                        change({draft_fields: fields});
                      }}
                    >
                      Move up
                    </button>
                    <button
                      className="text-button"
                      onClick={() => change({draft_fields: draft.draft_fields.filter((_, n) => i !== n)})}
                    >
                      Remove field
                    </button>
                  </div>
                </section>
              ))}
              <fieldset className="site-choices">
                <legend>Assigned websites</legend>
                {data.websites
                  .filter(s => !s.archived_at && s.status !== 'archived')
                  .map(s => (
                    <label key={s.id}>
                      <input
                        type="checkbox"
                        checked={draft.draft_website_ids.includes(s.id)}
                        onChange={e =>
                          change({
                            draft_website_ids: e.target.checked
                              ? [...draft.draft_website_ids, s.id]
                              : draft.draft_website_ids.filter(id => id !== s.id),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
              </fieldset>
              <div className="row">
                <button className="button primary" onClick={() => templateAction('save')}>
                  Save draft
                </button>
                <button className="button secondary" onClick={() => setPreview(!preview)}>
                  Preview
                </button>
                <button
                  className="button primary"
                  disabled={!draft.id || dirty || draft.published_draft_revision === draft.draft_revision}
                  onClick={() => templateAction('publish')}
                >
                  Publish version
                </button>
                {draft.id && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      if (window.confirm('Archive this template and stop new submissions?')) templateAction('archive');
                    }}
                  >
                    Archive
                  </button>
                )}
              </div>
              {dirty && <p className="form-hint">Unsaved changes. Save before publishing.</p>}
            </fieldset>
            {preview && (
              <section className="report-field-editor">
                <h3>Form preview</h3>
                <ReportFields fields={draft.draft_fields} answers={previewAnswers} onChange={setPreviewAnswers} />
              </section>
            )}
            <h3>Published versions</h3>
            {catalog.versions
              .filter(v => v.template_id === draft.id)
              .map(v => (
                <details key={v.id}>
                  <summary>
                    Version {v.version_number} · {v.title}
                  </summary>
                  <p>{v.description}</p>
                  {v.fields.map(f => (
                    <p key={f.key}>
                      {f.label} · {f.type}
                      {f.required ? ' · required' : ''}
                    </p>
                  ))}
                </details>
              ))}
          </section>
        </div>
      ) : (
        <>
          <section className="card padded">
            <h2>
              {selected
                ? `Report: ${siteName(selected.website_id)} · ${selected.period_start}`
                : 'Submit a weekly report'}
            </h2>
            {!selected ? (
              <div className="form-row">
                <label className="field">
                  Website
                  <select
                    value={site}
                    onChange={e => {
                      setSite(e.target.value);
                      setVersionId('');
                      setAnswers({});
                    }}
                  >
                    <option value="">Choose a website</option>
                    {data.websites
                      .filter(s => !s.archived_at && s.status !== 'archived')
                      .map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  Published form
                  <select
                    value={versionId}
                    onChange={e => {
                      setVersionId(e.target.value);
                      setAnswers({});
                    }}
                  >
                    <option value="">Choose a form</option>
                    {versions.map(v => (
                      <option key={v.id} value={v.id}>
                        {v.title} · v{v.version_number}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Week starting Monday
                  <input type="date" value={week} onChange={e => setWeek(e.target.value)} />
                </label>
              </div>
            ) : (
              <button
                className="button secondary"
                onClick={() => {
                  if (dirty && !window.confirm('Discard unsaved report changes?')) return;
                  setSelected(null);
                  setEditing(false);
                  setAnswers({});
                  setDirty(false);
                }}
              >
                Back to new report
              </button>
            )}
            {version && (
              <>
                <p className="report-notice">
                  {version.title} · published version {version.version_number}. {version.description}
                </p>
                {!selected || editing ? (
                  <form
                    onSubmit={e => {
                      e.preventDefault();
                      submit();
                    }}
                  >
                    <ReportFields
                      fields={version.fields}
                      answers={answers}
                      disabled={busy}
                      onChange={v => {
                        setAnswers(v);
                        setDirty(true);
                      }}
                    />
                    {selected && (
                      <label className="field">
                        Revision reason *
                        <textarea required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />
                      </label>
                    )}
                    <button className="button primary" disabled={busy}>
                      {busy ? 'Saving…' : selected ? 'Save revision' : 'Submit report'}
                    </button>
                  </form>
                ) : (
                  <>
                    <ReportFields
                      fields={version.fields}
                      answers={latest?.answers || {}}
                      onChange={() => {}}
                      disabled
                    />
                    {(selected.submitter_id === data.profile.id || data.profile.role === 'administrator') && (
                      <button
                        className="button primary"
                        onClick={() => {
                          setAnswers(latest?.answers || {});
                          setReason('');
                          setEditing(true);
                        }}
                      >
                        Revise report
                      </button>
                    )}
                    <h3>Revision history</h3>
                    {selected.report_revisions
                      .toSorted((a, b) => b.revision_number - a.revision_number)
                      .map(r => (
                        <details key={r.id}>
                          <summary>
                            Revision {r.revision_number} · {new Date(r.created_at).toLocaleString()} ·{' '}
                            {data.members.find(m => m.id === r.actor_id)?.display_name || 'Team member'}
                          </summary>
                          <p>{r.reason || 'Original submission'}</p>
                          <ReportFields fields={version.fields} answers={r.answers} disabled onChange={() => {}} />
                        </details>
                      ))}
                  </>
                )}
              </>
            )}
            {site && !versions.length && !selected && (
              <p className="form-hint">
                No published forms assigned to this website. Ask your administrator to publish one in Form builder.
              </p>
            )}
          </section>
          <section className="card padded">
            <h2>Report history</h2>
            <button className="button secondary" disabled={!reports.length} onClick={exportReports}>
              Export displayed reports (CSV)
            </button>
            <p className="muted">
              Latest 100 reports. Measurements retain their source, measurement date and scale in every revision.
            </p>
            <label className="field">
              Filter by website
              <select value={filter} onChange={e => setFilter(e.target.value)}>
                <option value="">All websites</option>
                {data.websites.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {reports
              .filter(r => !filter || r.website_id === filter)
              .map(r => (
                <button
                  className="report-template"
                  key={r.id}
                  onClick={() => {
                    if (dirty && !window.confirm('Discard unsaved changes?')) return;
                    setSelected(r);
                    setEditing(false);
                    setDirty(false);
                  }}
                >
                  <strong>
                    {siteName(r.website_id)} · {r.form_template_versions.title}
                  </strong>
                  <small>
                    {r.period_start} — {r.period_end} · v{r.form_template_versions.version_number} ·{' '}
                    {r.report_revisions.length} revision(s)
                  </small>
                </button>
              ))}
            {!reports.length && <p>No reports submitted yet.</p>}
          </section>
        </>
      )}
    </div>
  );
}
