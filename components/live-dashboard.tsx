'use client';
import {useEffect, useState} from 'react';
import {Check, ClipboardList, Clock3, Ban, CircleAlert, ScanEye} from 'lucide-react';
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
import {taskFiltersToSearch, type TaskFilters} from '@/lib/task-list';
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
  // Added by migration 016; absent until it is applied.
  deadlines?: {on_time: number; overdue: number; no_deadline: number};
  attention?: {
    overdue: number;
    blocked: number;
    pending_assignments: number;
    audits_due: number;
    audit_interval_days: number;
  };
};
// Brighter chart fills retain the status hues; text uses darker status tokens.
const statusColor = (status: string) => `var(--chart-${status}, var(--chart-cancelled))`;
const completionRows = [
  {status: 'completed', label: 'Completed', Icon: Check},
  {status: 'in_review', label: 'In review', Icon: ScanEye},
  {status: 'blocked', label: 'Blocked', Icon: CircleAlert},
  {status: 'in_progress', label: 'In progress', Icon: Clock3},
  {status: 'to_do', label: 'Not started', Icon: ClipboardList},
  {status: 'cancelled', label: 'Cancelled', Icon: Ban},
];
// Open tasks by urgency. Each slice opens the task list filter that returns the same count.
const deadlineSlices = [
  {key: 'overdue', label: 'Overdue', color: statusColor('blocked'), open: {overdue: true}},
  {key: 'on_time', label: 'On time', color: statusColor('completed'), open: {status: 'open', deadline: 'on_time'}},
  {key: 'no_deadline', label: 'No deadline', color: statusColor('cancelled'), open: {status: 'open', deadline: 'none'}},
] as const;
function Empty() {
  return <div className="analytics-empty">No records match these filters yet.</div>;
}
export default function LiveDashboard({
  data,
  onTask,
  onTasks,
  onSeo,
  onAudits,
}: {
  data: Workspace;
  onTask: (id: string) => void;
  /** Opens the task list with these URL filters. */
  onTasks: (search: string) => void;
  onSeo: (websiteId: string | null) => void;
  /** Opens the SEO list filtered to websites due for an audit. */
  onAudits: () => void;
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
    // Every workspace reload (after a task, assignment or SEO change) replaces `data`, so the charts
    // refetch too. The key is unchanged, so the current charts stay visible until the new numbers arrive.
  }, [key, data]);
  const dashboard = result?.key === key ? result.value : null;
  const error = failure?.key === key ? failure.message : '';
  const name = (id: string | null) => data.members.find(m => m.id === id)?.display_name || 'Unassigned';
  const chartStyle = {fontSize: 12, color: 'var(--muted)'};
  // Task charts ignore the date range and filter by website and current owner, exactly
  // like the task list, so the list opened from a chart shows the count that was clicked.
  const drill = (filters: Partial<TaskFilters>) =>
    onTasks(taskFiltersToSearch({website, owner: user, ...filters}).toString());
  // One row of counts, most urgent first. The attention counts need migration 016; overdue
  // comes from the same open-task query either way. Completed has no task-list filter.
  const summaryTiles = (d: Dashboard) => [
    {
      label: 'Active tasks',
      hint: 'Open right now',
      value: d.active_tasks,
      status: 'in_progress',
      open: () => drill({status: 'open'}),
    },
    {
      label: 'Overdue',
      hint: 'Past their due date',
      value: d.overdue_tasks,
      status: 'blocked',
      open: () => drill({overdue: true}),
    },
    ...(d.attention
      ? [
          {
            label: 'Blocked',
            hint: 'Waiting on something',
            value: d.attention.blocked,
            status: 'blocked',
            open: () => drill({status: 'blocked'}),
          },
          {
            label: 'Awaiting acceptance',
            hint: 'Assigned, not yet accepted',
            value: d.attention.pending_assignments,
            status: 'to_do',
            open: () => drill({pending: true}),
          },
          {
            label: 'Due for SEO audit',
            hint: `No audit in ${d.attention.audit_interval_days} days`,
            value: d.attention.audits_due,
            status: 'in_review',
            open: () => (website ? onSeo(website) : onAudits()),
          },
        ]
      : []),
    {label: 'Completed', hint: 'In the selected dates', value: d.completed_tasks, status: 'completed', open: null},
  ];
  return (
    <section className="live-analytics">
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
        <button className="button secondary" onClick={() => setRefresh(n => n + 1)}>
          Refresh charts
        </button>
      </div>
      <details className="analytics-scope">
        <summary>About these numbers</summary>
        <p>
          Tasks show their current status and current owner across all dates. The selected dates apply to completion
          dates and SEO measurement dates. Team member means task owner or report submitter.
        </p>
      </details>
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
          <section className="attention" aria-label="Summary">
            <div className="attention-grid">
              {summaryTiles(dashboard).map(item =>
                item.open ? (
                  <button
                    key={item.label}
                    className="attention-item"
                    data-status={item.value ? item.status : 'cancelled'}
                    onClick={item.open}
                    aria-label={`${item.label}: ${item.value}. View them`}
                  >
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                ) : (
                  <div key={item.label} className="attention-item" data-status={item.value ? item.status : 'cancelled'}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </div>
                ),
              )}
            </div>
          </section>
          <div className="analytics-grid">
            <article className="card analytics-chart">
              <h3>Open task deadlines</h3>
              <p>Open tasks by urgency · {dashboard.active_tasks} open</p>
              {dashboard.deadlines && dashboard.active_tasks > 0 ? (
                <>
                  <div className="donut-wrap">
                    <div className="donut-total" aria-hidden="true">
                      <strong>{dashboard.active_tasks}</strong>
                      <span>open</span>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart accessibilityLayer>
                        <Pie
                          data={deadlineSlices.map(s => ({label: s.label, count: dashboard.deadlines![s.key]}))}
                          dataKey="count"
                          nameKey="label"
                          innerRadius={60}
                          outerRadius={90}
                          isAnimationActive={false}
                          cursor="pointer"
                          onClick={(_, index) => drill(deadlineSlices[index].open)}
                        >
                          {deadlineSlices.map(s => (
                            <Cell key={s.key} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="analytics-legend">
                    {deadlineSlices.map(s => (
                      <button key={s.key} onClick={() => drill(s.open)}>
                        <i style={{background: s.color}} />
                        {s.label} <strong>{dashboard.deadlines![s.key]}</strong>
                      </button>
                    ))}
                  </div>
                  <p className="form-hint">Select a slice or label to see those tasks.</p>
                </>
              ) : dashboard.deadlines ? (
                <Empty />
              ) : (
                <div className="analytics-empty">
                  Apply the latest database migration (016) to see deadlines and attention counts.
                </div>
              )}
            </article>
            <article className="card analytics-chart">
              <h3>Current workload</h3>
              <p>Open tasks by owner, including unassigned work.</p>
              {dashboard.workload.length ? (
                <>
                  <div
                    className="workload-chart-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label="Workload chart; scroll for more team members"
                  >
                    <ResponsiveContainer width="100%" height={Math.max(240, dashboard.workload.length * 44 + 32)}>
                      <BarChart
                        data={dashboard.workload}
                        layout="vertical"
                        accessibilityLayer
                        style={chartStyle}
                        margin={{top: 8, right: 20, bottom: 0, left: 0}}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{fontSize: 12, fill: 'var(--muted)'}}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          tick={{fontSize: 12, fill: 'var(--muted)'}}
                          interval={0}
                          width={112}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(value: string) => (value.length > 17 ? `${value.slice(0, 16)}…` : value)}
                        />
                        <Tooltip />
                        <Bar
                          dataKey="count"
                          name="Active tasks"
                          fill="var(--chart-in_progress)"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={26}
                          isAnimationActive={false}
                          cursor="pointer"
                          onClick={(_, index) =>
                            drill({status: 'open', owner: dashboard.workload[index].assignee_id || 'unassigned'})
                          }
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="analytics-legend">
                    {dashboard.workload.map(w => (
                      <button
                        key={w.assignee_id || 'unassigned'}
                        onClick={() => drill({status: 'open', owner: w.assignee_id || 'unassigned'})}
                      >
                        {w.name} <strong>{w.count}</strong>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <Empty />
              )}
            </article>
            <article className="card analytics-chart task-completion">
              <h3>Task Completion</h3>
              <p>Share of {dashboard.task_count} matching tasks in each current status.</p>
              {dashboard.task_count > 0 ? (
                <>
                  <div className="completion-rows">
                    {completionRows.map(({status, label, Icon}) => {
                      const count = dashboard.statuses.find(s => s.progress === status)?.count || 0;
                      const percentage = (count / dashboard.task_count) * 100;
                      const displayPercentage = new Intl.NumberFormat('en', {maximumFractionDigits: 1}).format(
                        percentage,
                      );
                      return (
                        <button
                          key={status}
                          className="completion-row"
                          data-status={status}
                          onClick={() => drill({status})}
                          aria-label={`${label}: ${count} of ${dashboard.task_count} tasks (${displayPercentage}%). View tasks`}
                        >
                          <span className="completion-icon" aria-hidden="true">
                            <Icon size={17} />
                          </span>
                          <span className="completion-content">
                            <span className="completion-label">
                              <span>{label}</span>
                              <span>{displayPercentage}%</span>
                            </span>
                            <progress max={dashboard.task_count} value={count} aria-label={`${label} tasks`} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="form-hint">Select a status to view its tasks.</p>
                </>
              ) : (
                <Empty />
              )}
            </article>
          </div>
          <details className="dashboard-seo-details">
            <summary>SEO trend</summary>
            <article className="card analytics-chart">
              <div className="analytics-heading">
                <div>
                  <h3>SEO score trend</h3>
                  <p>
                    Current audit observations and latest legacy report revisions · 0–100 scale · measurements retain
                    their original source.
                  </p>
                </div>
                <button className="text-button" onClick={() => onSeo(website || null)}>
                  {website ? 'Open SEO form' : 'Open reports'}
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
                        stroke="var(--chart-completed)"
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
          </details>
          <section className="analytics-records">
            <h3>Behind the numbers</h3>
            <p>
              Charts use all matching records. The preview below shows up to 50 tasks.{' '}
              <button className="text-button" onClick={() => drill({})}>
                Open all {dashboard.task_count} in Tasks
              </button>
            </p>
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
