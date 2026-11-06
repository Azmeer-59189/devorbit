'use client';
import {useCallback, useEffect, useState} from 'react';
import {Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {Workspace} from '@/lib/live-types';
import type {dashboardActivity} from '@/lib/dashboard-activity';
import {shiftDate, workspaceDate} from '@/lib/dates';
import {workspaceFetch} from '@/lib/workspace-client';
import TaskSheetStatus from '@/components/task-sheet-status';
import {useChartAnimation} from '@/lib/motion';
import {taskFiltersToSearch, type TaskFilters} from '@/lib/task-list';
type Dashboard = {
  activity?: ReturnType<typeof dashboardActivity>;
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
function Empty() {
  return <div className="analytics-empty">No records match these filters yet.</div>;
}
export default function LiveDashboard({
  data,
  onTasks,
  onSeo,
  onAudits,
}: {
  data: Workspace;
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
  const refreshSheet = useCallback(() => setRefresh(n => n + 1), []);
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
  const chartStyle = {fontSize: 12, color: 'var(--muted)'};
  const animation = useChartAnimation();
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
      <TaskSheetStatus timezone={data.workspace.timezone} onSynced={refreshSheet} />
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
      <div className="analytics-legend" aria-label="Date shortcuts">
        <button
          onClick={() => {
            setStart(shiftDate(workspaceDate(data.workspace.timezone), -27));
            setEnd(workspaceDate(data.workspace.timezone));
          }}
        >
          Last 28 days
        </button>
        <button
          onClick={() => {
            setStart(shiftDate(workspaceDate(data.workspace.timezone), -364));
            setEnd(workspaceDate(data.workspace.timezone));
          }}
        >
          Last 12 months
        </button>
      </div>
      <details className="analytics-scope">
        <summary>About these numbers</summary>
        <p>
          Team and website charts include all dates with the selected website and owner filters. The monthly chart,
          Completed card, and SEO use the selected dates, based on recorded completion and SEO measurement dates. Team
          member means task owner or report submitter. Archived tasks are excluded.
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
                    data-status={item.status}
                    onClick={item.open}
                    aria-label={`${item.label}: ${item.value}. View them`}
                  >
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </button>
                ) : (
                  <div key={item.label} className="attention-item" data-status={item.status}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                  </div>
                ),
              )}
            </div>
          </section>
          <div className="analytics-grid">
            {dashboard.activity ? (
              [
                {
                  title: 'Completed work by team member',
                  description: `All dates | ${dashboard.activity.completed} completed tasks | current owner`,
                  rows: dashboard.activity.owners.map(r => ({
                    ...r,
                    name:
                      data.members.find(m => m.id === r.id)?.display_name ||
                      (r.id === 'unassigned' ? 'Unassigned' : 'Unknown member'),
                  })),
                },
                {
                  title: 'Tasks by website',
                  description: 'All dates and statuses | multi-site tasks count once per linked website.',
                  rows: dashboard.activity.websites.map(r => ({
                    ...r,
                    name:
                      data.websites.find(w => w.id === r.id)?.name ||
                      (r.id === 'unlinked' ? 'No website linked' : 'Unknown website'),
                  })),
                },
                {
                  title: 'Recorded completions by month',
                  description: `${start} to ${end} | imported work dates and assumed completion dates are included.`,
                  rows: dashboard.activity.months.map(r => ({...r, id: r.name})),
                },
              ].map(chart => (
                <article className="card analytics-chart" key={chart.title}>
                  <h3>{chart.title}</h3>
                  <p>{chart.description}</p>
                  {chart.rows.some(r => r.count > 0) ? (
                    <>
                      <div className="workload-chart-scroll" tabIndex={0} role="region" aria-label={chart.title}>
                        <ResponsiveContainer width="100%" height={Math.max(240, chart.rows.length * 38 + 32)}>
                          <BarChart
                            data={chart.rows}
                            layout="vertical"
                            accessibilityLayer
                            style={chartStyle}
                            margin={{right: 24}}
                          >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                            <XAxis type="number" allowDecimals={false} tick={{fill: 'var(--text)'}} />
                            <YAxis
                              type="category"
                              dataKey="name"
                              width={115}
                              interval={0}
                              tick={{fontSize: 12, fill: 'var(--text)'}}
                            />
                            <Tooltip />
                            <Bar
                              dataKey="count"
                              name="Tasks"
                              fill="var(--palette-teal)"
                              radius={[0, 4, 4, 0]}
                              maxBarSize={24}
                              {...animation}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <details>
                        <summary>View chart data</summary>
                        <div className="table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Group</th>
                                <th>Tasks</th>
                              </tr>
                            </thead>
                            <tbody>
                              {chart.rows.map(r => (
                                <tr key={r.id}>
                                  <td>{r.name}</td>
                                  <td>{r.count}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </>
                  ) : (
                    <div className="analytics-empty">
                      No recorded completions in this date range. Choose an earlier From date to explore history.
                    </div>
                  )}
                </article>
              ))
            ) : (
              <div role="status" className="card analytics-empty">
                Refresh charts to load task history.
              </div>
            )}
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
                        {...animation}
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
              Charts use all matching records.{' '}
              <button className="text-button" onClick={() => drill({})}>
                Open all {dashboard.task_count} in Tasks
              </button>
            </p>
          </section>
        </>
      )}
    </section>
  );
}
