'use client';
import {useState, type RefObject} from 'react';
import {workspaceFetch} from '@/lib/workspace-client';
import {fieldsForPage} from '@/lib/seo-review';
import type {SeoValues} from '@/lib/seo-health';

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

/** Administrator review and one-time import of the saved Google Sheet snapshot. */
export default function SeoImport({
  pageFields,
  busy,
  lockRef,
  onBusy,
  onError,
  onMessage,
  onImported,
}: {
  pageFields: ReturnType<typeof fieldsForPage>;
  busy: boolean;
  /** Shared with the page so an import never overlaps a form save. */
  lockRef: RefObject<boolean>;
  onBusy: (busy: boolean) => void;
  onError: (message: string) => void;
  onMessage: (message: string) => void;
  /** Reloads the catalog and workspace after a successful import. */
  onImported: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  return (
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
          onBusy(true);
          onError('');
          try {
            setPreview(await workspaceFetch('/api/seo-health/import'));
            setConfirmed(false);
          } catch (e) {
            onError((e as Error).message);
          } finally {
            onBusy(false);
          }
        }}
      >
        Review real-data import
      </button>
      {preview && (
        <>
          <p className="seo-import-notice">{preview.notice}</p>
          <p className="form-hint">
            Known conflicts: some remarks quote older speed values; Norway Analytics and UAE YouTube remarks disagree
            with their structured cells. Preserve both, then review them. Finland has no July score or remarks.
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
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I reviewed the
            snapshot and conflict rules. Import missing data without overwriting existing profiles.
          </label>
          <button
            className="button primary"
            disabled={!confirmed || busy}
            onClick={async () => {
              if (lockRef.current) return;
              lockRef.current = true;
              onBusy(true);
              onError('');
              try {
                const r = await workspaceFetch('/api/seo-health/import', {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({confirm: true}),
                });
                onMessage(
                  `Import finished: ${r.websites_added} websites added, ${r.profiles_added} SEO forms added, ${r.historical_audits_added} audit records added; ${r.conflicts} conflicts preserved, ${r.skipped} already imported websites skipped.`,
                );
                setPreview(null);
                await onImported();
              } catch (e) {
                onError((e as Error).message);
              } finally {
                onBusy(false);
                lockRef.current = false;
              }
            }}
          >
            Import reviewed data
          </button>
        </>
      )}
    </section>
  );
}
