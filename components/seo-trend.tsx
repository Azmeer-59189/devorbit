'use client';
import {useState} from 'react';
import {CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {seoTrend, TrendAudit} from '@/lib/seo-trend';

export default function SeoTrend({audits}: {audits: TrendAudit[]}) {
  const sources = [...new Set(audits.map(a => a.source))].sort();
  const [chosenSource, setSource] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const source = sources.includes(chosenSource) ? chosenSource : sources[0] || '';
  const invalidRange = !!start && !!end && start > end;
  const points = invalidRange ? [] : seoTrend(audits, source, start, end);
  const latest = points.at(-1);
  const previous = points.at(-2);
  const change = latest && previous ? latest.score - previous.score : null;
  return (
    <section className="card padded">
      <h3>SEO score trend</h3>
      <p className="form-hint">
        Based on the latest 100 audit records loaded for this website. Corrected scores replace their superseded
        records. Each tool/source is shown separately.
      </p>
      <div className="seo-form-grid">
        <label className="field">
          Audit source / tool
          <select value={source} onChange={e => setSource(e.target.value)} disabled={!sources.length}>
            {!sources.length && <option value="">No sources recorded</option>}
            {sources.map(s => (
              <option key={s} value={s}>
                {s || 'Unspecified source'}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
      </div>
      {invalidRange && <p role="alert">Choose an end date on or after the start date.</p>}
      {latest ? (
        <>
          <p>
            <strong>{latest.score}/100</strong> on {latest.measurement_date}.{' '}
            {change === null
              ? 'Add another audit from this source to see a change.'
              : `${change > 0 ? '+' : ''}${change} points compared with ${previous!.measurement_date} within this date range.`}
          </p>
          <div style={{height: 280, width: '100%'}} aria-label={`SEO scores from ${source}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{top: 12, right: 20, bottom: 12, left: 0}}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="measurement_date" minTickGap={30} />
                <YAxis domain={[0, 100]} width={40} />
                <Tooltip />
                <Line
                  type="linear"
                  dataKey="score"
                  name="SEO score (0–100)"
                  stroke="#6d28d9"
                  strokeWidth={2}
                  dot={{r: 4}}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details>
            <summary>View chart data ({points.length} audits)</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Audit date</th>
                    <th>Score /100</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map(a => (
                    <tr key={a.id}>
                      <td>{a.measurement_date}</td>
                      <td>{a.score}</td>
                      <td>{a.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        !invalidRange && <p>No audits match this source and date range.</p>
      )}
    </section>
  );
}
