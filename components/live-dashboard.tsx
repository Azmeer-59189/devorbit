'use client';
import {useEffect, useState} from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {Workspace, statusName} from '@/lib/live-types';
import {shiftDate, workspaceDate} from '@/lib/dates';
import {workspaceFetch} from '@/lib/workspace-client';
type Dashboard = {
  today: string;
  active_tasks: number;
  overdue_tasks: number;
  completed_tasks: number;
  total_minutes: number;
  log_count: number;
  task_count: number;
  statuses: {progress: string; count: number}[];
  workload: {assignee_id: string | null; name: string; count: number}[];
  daily: {date: string; minutes: number}[];
  contributors: {user_id: string; name: string; minutes: number}[];
  websites: {id: string; name: string; minutes: number}[];
  sources: string[];
  seo_count: number;
  seo: {
    id: string;
    website: string;
    website_id: string;
    source: string;
    value: number;
    scale: number;
    measured_at: string;
    submission_id: string;
  }[];
  tasks: {
    id: string;
    title: string;
    progress: string;
    priority: string;
    assignee_id: string | null;
    due_date: string | null;
  }[];
  logs: {id: string; user_id: string; work_date: string; duration_minutes: number; notes: string}[];
};
const colors = ['#746095', '#4c897c', '#ba9657', '#6384ab', '#9c7189', '#87909f'];
function Empty() {
  return <div className="analytics-empty">No records match these filters yet.</div>;
}
export default function LiveDashboard({
  data,
  onTask,
  onReports,
}: {
  data: Workspace;
  onTask: (id: string) => void;
  onReports: () => void;
}) {
  const [end, setEnd] = useState(() => workspaceDate(data.workspace.timezone));
  const [start, setStart] = useState(() => shiftDate(workspaceDate(data.workspace.timezone), -27));
  const [website, setWebsite] = useState('');
  const [user, setUser] = useState('');
  const [source, setSource] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{key: string; value: Dashboard} | null>(null);
  const [failure, setFailure] = useState<{key: string; message: string} | null>(null);
  const params = new URLSearchParams({start, end, website, user, source});
  const key = params.toString() + `&refresh=${refresh}`;
  useEffect(() => {
    let cancelled = false;
    workspaceFetch(`/api/dashboard?${key}`)
      .then(value => {
        if (!cancelled) {
          setResult({key, value});
          setFailure(null);
        }
      })
      .catch(e => {
        if (!cancelled) setFailure({key, message: e.message});
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  const dashboard = result?.key === key ? result.value : null;
  const error = failure?.key === key ? failure.message : '';
  const name = (id: string | null) => data.members.find(m => m.id === id)?.display_name || 'Unassigned';
  const chartStyle = {fontSize: 12, color: '#625a70'};
  return (
    <section className="live-analytics">
      <div className="analytics-heading">
        <div>
          <h2>Your workspace at a glance</h2>
          <p>Real records from your shared workspace.</p>
        </div>
        <button className="button secondary" onClick={() => setRefresh(n => n + 1)}>
          Refresh charts
        </button>
      </div>
      <div className="analytics-filters">
        <label className="field">
          From
          <input type="date" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
        <label className="field">
          Website
          <select
            value={website}
            onChange={e => {
              setWebsite(e.target.value);
              setSource('');
            }}
          >
            <option value="">All websites</option>
            {data.websites.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.archived_at ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Team member
          <select
            value={user}
            onChange={e => {
              setUser(e.target.value);
              setSource('');
            }}
          >
            <option value="">Everyone</option>
            {data.members.map(m => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.active === false ? ' (inactive)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className="text-button"
          onClick={() => {
            setEnd(workspaceDate(data.workspace.timezone));
            setStart(shiftDate(workspaceDate(data.workspace.timezone), -27));
            setWebsite('');
            setUser('');
            setSource('');
          }}
        >
          Reset
        </button>
      </div>
      <p className="analytics-scope">
        Tasks show their current status and current owner across all dates. The selected dates apply to completion dates
        and SEO measurement dates. Team member means task owner or report submitter.
      </p>
      {error ? (
        <div role="alert" className="form-error">
          {error}
        </div>
      ) : !dashboard ? (
        <div className="card analytics-loading" role="status">
          Loading your charts…
        </div>
      ) : (
        <>
          <div className="kpi-grid analytics-kpis">
            {[
              {label: 'Active tasks · now', value: dashboard.active_tasks},
              {label: 'Overdue · now', value: dashboard.overdue_tasks},
              {label: 'Completed · selected dates', value: dashboard.completed_tasks},
              {label: 'Matching tasks', value: dashboard.task_count},
            ].map(k => (
              <div className="card kpi" key={k.label}>
                <div className="kpi-top">{k.label}</div>
                <div className="kpi-value">{k.value}</div>
              </div>
            ))}
          </div>
          <div className="analytics-grid">
            <article className="card analytics-chart">
              <h3>Task status</h3>
              <p>Current snapshot · {dashboard.task_count} tasks</p>
              {dashboard.statuses.length ? (
                <>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart accessibilityLayer>
                      <Pie
                        data={dashboard.statuses.map(s => ({...s, label: statusName(s.progress)}))}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={60}
                        outerRadius={90}
                        isAnimationActive={false}
                      >
                        {dashboard.statuses.map((s, i) => (
                          <Cell key={s.progress} fill={colors[i % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="analytics-legend">
                    {dashboard.statuses.map((s, i) => (
                      <span key={s.progress}>
                        <i style={{background: colors[i % colors.length]}} />
                        {statusName(s.progress)} <strong>{s.count}</strong>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <Empty />
              )}
            </article>
            <article className="card analytics-chart">
              <h3>Current workload</h3>
              <p>
                Active tasks by current owner, with unassigned work separate. Pending requests do not change ownership.
              </p>
              {dashboard.workload.length ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dashboard.workload} accessibilityLayer style={chartStyle}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfeb" />
                    <XAxis dataKey="name" tick={{fontSize: 11}} interval={0} height={65} angle={-20} textAnchor="end" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar
                      dataKey="count"
                      name="Active tasks"
                      fill="#746095"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty />
              )}
            </article>
          </div>
          <article className="card analytics-chart">
            <div className="analytics-heading">
              <div>
                <h3>SEO score trend</h3>
                <p>
                  Current audit observations and latest legacy report revisions · 0–100 scale · measurements retain
                  their original source.
                </p>
              </div>
              <button className="text-button" onClick={onReports}>
                Open reports
              </button>
            </div>
            <label className="field analytics-source">
              Measurement source
              <select value={source} onChange={e => setSource(e.target.value)}>
                <option value="">Choose a source</option>
                {dashboard.sources.map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {!website || !source ? (
              <div className="analytics-empty">
                Choose one website above and a source here to view a comparable trend.
              </div>
            ) : dashboard.seo.length ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={dashboard.seo} accessibilityLayer style={chartStyle}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e6dfeb" />
                    <XAxis dataKey="measured_at" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Line
                      dataKey="value"
                      name="SEO score (0–100)"
                      stroke="#746095"
                      strokeWidth={2}
                      dot={{r: 4}}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <details>
                  <summary>
                    View measurements ({dashboard.seo.length} of {dashboard.seo_count}; latest 500 maximum)
                  </summary>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Measured</th>
                          <th>Website</th>
                          <th>Score</th>
                          <th>Source</th>
                          <th>Audit / report ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.seo.map(m => (
                          <tr key={m.id}>
                            <td>{m.measured_at}</td>
                            <td>{m.website}</td>
                            <td>
                              {m.value} / {m.scale}
                            </td>
                            <td>{m.source}</td>
                            <td>{m.submission_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            ) : (
              <Empty />
            )}
          </article>
          <section className="card analytics-records">
            <h3>Behind the numbers</h3>
            <p>Charts use all matching records. The preview below shows up to 50 tasks.</p>
            <details>
              <summary>
                Task records ({dashboard.tasks.length} of {dashboard.task_count})
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Owner</th>
                      <th>Status</th>
                      <th>Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.tasks.map(t => (
                      <tr key={t.id}>
                        <td>
                          <button className="text-button" onClick={() => onTask(t.id)}>
                            {t.title}
                          </button>
                        </td>
                        <td>{name(t.assignee_id)}</td>
                        <td>{statusName(t.progress)}</td>
                        <td>{t.due_date || 'No due date'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        </>
      )}
    </section>
  );
}
