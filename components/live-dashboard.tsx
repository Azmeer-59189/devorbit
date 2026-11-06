'use client';
import {useCallback, useEffect, useState, type ReactNode} from 'react';
import {AlarmClock, CircleCheckBig, ListTodo, SearchCheck} from 'lucide-react';
import {Workspace, statusName} from '@/lib/live-types';
import type {dashboardActivity} from '@/lib/dashboard-activity';
import {displayDate, shiftDate, workspaceDate} from '@/lib/dates';
import {workspaceFetch} from '@/lib/workspace-client';
import TaskSheetStatus from '@/components/task-sheet-status';
import {
  Meter,
  SegmentBar,
  SeoTrendChart,
  Sparkline,
  StatusDonut,
  TrendChart,
  WorkloadChart,
  trendLabel,
} from '@/components/dashboard-charts';
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
/** Title, plot and exact-values table shared by every dashboard chart. */
function ChartCard({
  eyebrow,
  title,
  description,
  span,
  aside,
  table,
  empty,
  scroll,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  span: 4 | 8;
  aside?: ReactNode;
  table: {head: string[]; rows: (string | number)[][]};
  /** Shown instead of the plot when there is nothing to draw. */
  empty: string | null;
  scroll?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`card analytics-chart activity-card span-${span}`}>
      <div className="activity-card-head">
        <div>
          <span className="activity-eyebrow">{eyebrow}</span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {aside}
      </div>
      {empty ? (
        <div className="analytics-empty">{empty}</div>
      ) : (
        <>
          <div
            className={scroll ? 'activity-ranking-scroll' : 'activity-plot'}
            tabIndex={0}
            role="region"
            aria-label={title}
          >
            {children}
          </div>
          <details>
            <summary>View chart data</summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    {table.head.map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </article>
  );
}
function Ranking({rows}: {rows: {id: string; name: string; count: number}[]}) {
  const most = Math.max(...rows.map(r => r.count));
  return (
    <ol className="activity-ranking">
      {rows.map((row, index) => (
        <li key={row.id}>
          <span className="activity-rank-index" aria-hidden="true">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="activity-rank-content">
            <div className="activity-rank-label">
              <span>{row.name}</span>
              <strong>{row.count.toLocaleString()}</strong>
            </div>
            <div className="activity-rank-track" aria-hidden="true">
              <span style={{width: `${(row.count / most) * 100}%`}} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
const rankedTable = (rows: {name: string; count: number}[]) => ({
  head: ['Group', 'Tasks'],
  rows: rows.map(r => [r.name, r.count]),
});
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
  const today = workspaceDate(data.workspace.timezone);
  const presets = [
    {label: 'Last 28 days', days: 27},
    {label: 'Last 12 months', days: 364},
  ];
  // Task charts ignore the date range and filter by website and current owner, exactly
  // like the task list, so the list opened from a chart shows the count that was clicked.
  const drill = (filters: Partial<TaskFilters>) =>
    onTasks(taskFiltersToSearch({website, owner: user, ...filters}).toString());
  // One row of counts, most urgent first. The attention counts need migration 016; overdue
  // comes from the same open-task query either way. Completed has no task-list filter.
  const summaryTiles = (d: Dashboard) => {
    const count = (status: string) => d.statuses.find(s => s.progress === status)?.count || 0;
    const websites = data.websites.filter(w => !w.archived_at).length;
    return [
      {
        label: 'Active tasks',
        hint: 'Open right now',
        value: d.active_tasks,
        status: 'in_progress',
        icon: <ListTodo size={18} aria-hidden="true" />,
        figure: (
          <SegmentBar
            parts={['to_do', 'in_progress', 'in_review', 'blocked'].map(status => ({status, value: count(status)}))}
          />
        ),
        open: () => drill({status: 'open'}),
      },
      {
        label: 'Overdue',
        hint: 'Past their due date',
        value: d.overdue_tasks,
        status: 'blocked',
        icon: <AlarmClock size={18} aria-hidden="true" />,
        figure: <Meter share={d.active_tasks ? d.overdue_tasks / d.active_tasks : 0} />,
        open: () => drill({overdue: true}),
      },
      ...(d.attention
        ? [
            {
              label: 'Due for SEO audit',
              hint: `No audit in ${d.attention.audit_interval_days} days`,
              value: d.attention.audits_due,
              status: 'in_review',
              icon: <SearchCheck size={18} aria-hidden="true" />,
              figure: <Meter share={websites ? d.attention.audits_due / websites : 0} />,
              open: () => (website ? onSeo(website) : onAudits()),
            },
          ]
        : []),
      {
        label: 'Completed',
        hint: 'In the selected dates',
        value: d.completed_tasks,
        status: 'completed',
        icon: <CircleCheckBig size={18} aria-hidden="true" />,
        figure: d.activity ? <Sparkline points={d.activity.trend.points} /> : null,
        open: null,
      },
    ];
  };
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
      <div className="analytics-toolbar">
        <div className="analytics-legend" aria-label="Date shortcuts">
          {presets.map(preset => (
            <button
              key={preset.label}
              aria-pressed={end === today && start === shiftDate(today, -preset.days)}
              onClick={() => {
                setStart(shiftDate(workspaceDate(data.workspace.timezone), -preset.days));
                setEnd(workspaceDate(data.workspace.timezone));
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <details className="analytics-scope">
          <summary>About these numbers</summary>
          <p>
            Status, workload, team and website charts include all dates with the selected website and owner filters. The
            completion trend, Completed card, and SEO use the selected dates, based on recorded completion and SEO
            measurement dates. Previous period is the same length immediately before the selected dates. Team member
            means task owner or report submitter. Archived tasks are excluded.
          </p>
        </details>
      </div>
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
              {summaryTiles(dashboard).map(item => {
                const content = (
                  <>
                    <i className="tile-icon">{item.icon}</i>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                    <small>{item.hint}</small>
                    {item.figure}
                  </>
                );
                return item.open ? (
                  <button
                    key={item.label}
                    className="attention-item"
                    data-status={item.status}
                    onClick={item.open}
                    aria-label={`${item.label}: ${item.value}. View them`}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={item.label} className="attention-item" data-status={item.status}>
                    {content}
                  </div>
                );
              })}
            </div>
          </section>
          <div className="analytics-grid activity-grid">
            {dashboard.activity ? (
              <ActivityCharts
                dashboard={dashboard}
                activity={dashboard.activity}
                data={data}
                start={start}
                end={end}
                today={today}
                onStatus={status => drill({status})}
              />
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
                  <SeoTrendChart points={dashboard.seo} />
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
function ActivityCharts({
  dashboard,
  activity,
  data,
  start,
  end,
  today,
  onStatus,
}: {
  dashboard: Dashboard;
  activity: NonNullable<Dashboard['activity']>;
  data: Workspace;
  start: string;
  end: string;
  today: string;
  onStatus: (status: string) => void;
}) {
  const {trend} = activity;
  const total = trend.points.reduce((n, p) => n + p.count, 0);
  const change = total - trend.points.reduce((n, p) => n + p.previous, 0);
  const owners = activity.owners.map(r => ({
    ...r,
    name:
      data.members.find(m => m.id === r.id)?.display_name || (r.id === 'unassigned' ? 'Unassigned' : 'Unknown member'),
  }));
  const websites = activity.websites.map(r => ({
    ...r,
    name:
      data.websites.find(w => w.id === r.id)?.name || (r.id === 'unlinked' ? 'No website linked' : 'Unknown website'),
  }));
  const workload = dashboard.workload.filter(r => r.count > 0);
  const deadlines = dashboard.deadlines;
  return (
    <>
      <ChartCard
        eyebrow="Recorded history"
        title={`Recorded completions by ${trend.unit}`}
        description={`${displayDate(start, today)} to ${displayDate(end, today)} · includes imported work dates and assumed completion dates`}
        span={8}
        aside={
          <div className="trend-total">
            <strong>{total.toLocaleString()}</strong>
            <span data-direction={change > 0 ? 'up' : change < 0 ? 'down' : undefined}>
              {change > 0 ? '▲ ' : change < 0 ? '▼ ' : ''}
              {change ? Math.abs(change).toLocaleString() : 'No change'} vs previous period
            </span>
          </div>
        }
        table={{
          head: ['Period', 'Tasks', 'Previous period'],
          rows: trend.points.map(p => [trendLabel(p.date, trend.unit, today), p.count, p.previous]),
        }}
        empty={
          trend.points.some(p => p.count || p.previous)
            ? null
            : 'No recorded completions in this date range. Choose an earlier From date to explore history.'
        }
      >
        <div className="trend-legend">
          <span>
            <i data-series="current" />
            Selected period
          </span>
          <span>
            <i data-series="previous" />
            Previous period
          </span>
        </div>
        <TrendChart trend={trend} today={today} />
      </ChartCard>
      <ChartCard
        eyebrow="Current workload"
        title="Task status"
        description="All time · every task with the selected filters"
        span={4}
        table={{
          head: ['Status', 'Tasks'],
          rows: dashboard.statuses.map(s => [statusName(s.progress), s.count]),
        }}
        empty={
          dashboard.statuses.some(s => s.count > 0) ? null : 'No tasks match the selected website and team member.'
        }
      >
        <StatusDonut statuses={dashboard.statuses} onStatus={onStatus} />
        {deadlines && deadlines.on_time + deadlines.overdue + deadlines.no_deadline > 0 ? (
          <div className="deadline-health">
            <span>Open task deadlines</span>
            <SegmentBar
              parts={[
                {status: 'completed', value: deadlines.on_time},
                {status: 'blocked', value: deadlines.overdue},
                {status: 'cancelled', value: deadlines.no_deadline},
              ]}
            />
            <ul>
              <li data-status="completed">
                <i />
                {deadlines.on_time} on time
              </li>
              <li data-status="blocked">
                <i />
                {deadlines.overdue} overdue
              </li>
              <li data-status="cancelled">
                <i />
                {deadlines.no_deadline} none
              </li>
            </ul>
          </div>
        ) : null}
      </ChartCard>
      <ChartCard
        eyebrow="Work distribution"
        title="Completed work by team member"
        description={`All time · ${activity.completed} completed tasks, grouped by current owner`}
        span={4}
        scroll
        table={rankedTable(owners)}
        empty={owners.length ? null : 'No tasks match the selected website and team member.'}
      >
        <Ranking rows={owners} />
      </ChartCard>
      <ChartCard
        eyebrow="Work distribution"
        title="Tasks by website"
        description="All time · each linked website receives one count per task"
        span={4}
        scroll
        table={rankedTable(websites)}
        empty={websites.length ? null : 'No tasks match the selected website and team member.'}
      >
        <Ranking rows={websites} />
      </ChartCard>
      <ChartCard
        eyebrow="Current workload"
        title="Open tasks by team member"
        description="Tasks not yet completed or cancelled, by current owner"
        span={4}
        table={rankedTable(workload)}
        empty={workload.length ? null : 'No open tasks match the selected website and team member.'}
      >
        <WorkloadChart rows={workload} />
      </ChartCard>
    </>
  );
}
