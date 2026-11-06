'use client';
import {FormEvent, useState} from 'react';
import {X} from 'lucide-react';
import {useDialog} from '@/components/live-dialog';
import {displayDate} from '@/lib/dates';
import {auditToCorrect} from '@/lib/seo-review';

type Audit = {id: string; measurement_date: string; score: number; source: string; supersedes_id: string | null};
export type NewAudit = {score: number; date: string; source: string; reason: string};

/**
 * Records one dated SEO score. A score for a date and source that already has a different
 * score is a correction, which needs a reason; the original stays in the audit history.
 */
export default function RecordAuditDialog({
  websiteName,
  audits,
  today,
  defaultSource,
  onSubmit,
  onClose,
}: {
  websiteName: string;
  audits: Audit[];
  today: string;
  defaultSource: string;
  /** Saves the audit; a rejection is shown in the dialog. */
  onSubmit: (audit: NewAudit) => Promise<void>;
  onClose: () => void;
}) {
  const [score, setScore] = useState('');
  const [date, setDate] = useState(today);
  const [source, setSource] = useState(defaultSource);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => {
    if (!busy) onClose();
  };
  useDialog(close);
  const value = Number(score);
  const valid = score !== '' && Number.isFinite(value) && value >= 0 && value <= 100 && !!date && !!source.trim();
  const previous = valid ? auditToCorrect(audits, date, source.trim()) : undefined;
  const correcting = !!previous && previous.score !== value;
  const sources = [...new Set(audits.map(a => a.source))].sort();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit({score: value, date, source: source.trim(), reason: correcting ? reason.trim() : ''});
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="record-audit-title" data-live-dialog>
        <header>
          <div>
            <span className="eyebrow">{websiteName}</span>
            <h2 id="record-audit-title">Update SEO score manually</h2>
          </div>
          <button className="icon-button" aria-label="Close" disabled={busy} onClick={close}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={submit}>
          <fieldset className="live-form-fieldset" disabled={busy}>
            <div className="modal-fields">
              <p className="form-hint">
                Record a score from your review or another tool. The overview displays the latest audit by date; older
                entries stay in the history. This does not run a Google audit.
              </p>
              <label className="field">
                Score (0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="any"
                  required
                  value={score}
                  onChange={e => setScore(e.target.value)}
                />
              </label>
              <label className="field">
                Audit date
                <input type="date" required max={today} value={date} onChange={e => setDate(e.target.value)} />
              </label>
              <label className="field">
                Source / tool
                <input
                  required
                  maxLength={500}
                  list="audit-sources"
                  placeholder="e.g. PageSpeed Insights"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                />
                <datalist id="audit-sources">
                  {sources.map(s => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </label>
              {previous &&
                (correcting ? (
                  <>
                    <p className="info-callout">
                      This corrects the {previous.score}/100 audit from {displayDate(previous.measurement_date, today)}{' '}
                      ({previous.source}). The original stays in the history.
                    </p>
                    <label className="field">
                      Reason for the correction
                      <textarea
                        required
                        maxLength={2000}
                        rows={3}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <p className="form-hint">
                    This audit is already recorded with the same score; saving changes nothing.
                  </p>
                ))}
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
            </div>
          </fieldset>
          <footer>
            <button type="button" className="button secondary" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="button primary" disabled={busy || !valid || (correcting && !reason.trim())}>
              {busy ? 'Saving…' : correcting ? 'Save correction' : 'Save SEO score'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
