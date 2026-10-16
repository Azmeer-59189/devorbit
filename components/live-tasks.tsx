'use client';
import {useEffect, useRef, useState} from 'react';
import {Task, Workspace, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {taskActionInput} from '@/lib/live-validation';
import {boardTransition, taskStatuses} from '@/lib/task-list';
type ListTask = Task & {
  website_ids: string[];
  pending_assignment_id: string | null;
  pending_recipient_id: string | null;
};
type Result = {
  tasks: ListTask[];
  total: number;
  page: number;
  page_size: number;
  board_counts: Record<string, number>;
  unassigned: number;
};
const defaults = {
  q: '',
  website: '',
  owner: '',
  creator: '',
  status: '',
  priority: '',
  start: '',
  end: '',
  overdue: false,
  sort: 'newest',
  page: 1,
};
export default function LiveTasks({
  data,
  mine,
  onOpen,
  onChanged,
  onCreate,
}: {
  data: Workspace;
  mine: boolean;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
  onCreate: () => void;
}) {
  const [filters, setFilters] = useState(defaults);
  const [scope, setScope] = useState(mine ? 'assigned' : 'all');
  const [view, setView] = useState('list');
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<{key: string; value: Result} | null>(null);
  const [failure, setFailure] = useState<{key: string; message: string} | null>(null);
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const dragged = useRef<ListTask | null>(null);
  const params = new URLSearchParams(Object.entries({...filters, scope}).map(([key, value]) => [key, String(value)]));
  const key = params.toString() + `&refresh=${refresh}`;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      workspaceFetch(`/api/tasks?${key}`)
        .then(value => {
          if (!cancelled) {
            setSnapshot({key, value});
            setFailure(null);
          }
        })
        .catch(e => {
          if (!cancelled) setFailure({key, message: e.message});
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, data.tasks]);
  const result = snapshot?.key === key ? snapshot.value : null;
  const error = failure?.key === key ? failure.message : '';
  const name = (id: string | null) => data.members.find(m => m.id === id)?.display_name || 'Unassigned';
  const sites = (task: ListTask) =>
    task.website_ids.map(id => data.websites.find(w => w.id === id)?.name || 'Website').join(', ') || 'General work';
  function filter(p: Partial<typeof defaults>) {
    setFilters({...filters, ...p, page: 1});
  }
  async function move(task: ListTask, target: string) {
    if (lock.current || target === task.progress) return;
    const invalid = boardTransition(task, target, data.profile);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    let reason = '';
    if (target === 'blocked' || ['completed', 'cancelled'].includes(task.progress)) {
      const answer = window.prompt(
        target === 'blocked' ? 'Why is this task blocked?' : 'Why are you reopening this task?',
      );
      if (!answer?.trim()) return;
      reason = answer.trim();
    }
    if (target === 'cancelled' && !window.confirm('Cancel this task and retain its history?')) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    try {
      const input = taskActionInput({
        request_id: crypto.randomUUID(),
        task_id: task.id,
        expected_revision: task.revision,
        action: 'status',
        status: target,
        reason,
      });
      await workspaceFetch('/api/task-actions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      setMessage(`Moved to ${statusName(target)}.`);
      setRefresh(n => n + 1);
      await onChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function respond(task: ListTask, accept: boolean) {
    if (lock.current || !task.pending_assignment_id) return;
    const reason = accept ? '' : window.prompt('Why are you declining this assignment?');
    if (!accept && !reason?.trim()) return;
    lock.current = true;
    setBusy(true);
    setActionError('');
    try {
      await workspaceFetch('/api/assignments', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({request_id: task.pending_assignment_id, accept, reason: reason || ''}),
      });
      setRefresh(n => n + 1);
      setMessage(accept ? 'Assignment accepted.' : 'Assignment declined.');
      await onChanged();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function pending(task: ListTask) {
    return task.pending_assignment_id ? (
      <span className="block task-pending-label">
        Awaiting {name(task.pending_recipient_id)}
        {task.assignee_id ? ' · Current owner retained' : ''}
      </span>
    ) : null;
  }
  return (
    <section className="live-task-browser">
      <div className="section-toolbar">
        <div className="simple-task-tabs" role="group" aria-label="Task layout">
          {['list', 'board'].map(v => (
            <button key={v} className="button secondary" aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'list' ? 'List' : 'Kanban'}
            </button>
          ))}
        </div>
        <button className="button secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}>
          Refresh tasks
        </button>
      </div>
      {mine && (
        <div className="simple-task-tabs" role="group" aria-label="My task category">
          {['assigned', 'pending', 'created', 'completed'].map(s => (
            <button
              className="button secondary"
              key={s}
              aria-pressed={scope === s}
              onClick={() => {
                setScope(s);
                setFilters({...filters, page: 1});
              }}
            >
              {statusName(s)}
            </button>
          ))}
        </div>
      )}
      <div className="task-filter-panel">
        <label className="field">
          Search
          <input
            maxLength={200}
            placeholder="Title, description or category"
            value={filters.q}
            onChange={e => filter({q: e.target.value})}
          />
        </label>
        <label className="field">
          Website
          <select value={filters.website} onChange={e => filter({website: e.target.value})}>
            <option value="">All websites</option>
            {data.websites.map(w => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        {(['owner', 'creator'] as const).map(k => (
          <label className="field" key={k}>
            {statusName(k)}
            <select value={filters[k]} onChange={e => filter({[k]: e.target.value})}>
              <option value="">Everyone</option>
              {k === 'owner' && <option value="unassigned">Unassigned</option>}
              {data.members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                  {m.active === false ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="field">
          Status
          <select value={filters.status} onChange={e => filter({status: e.target.value})}>
            <option value="">All statuses</option>
            {taskStatuses.map(s => (
              <option key={s} value={s}>
                {statusName(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Priority
          <select value={filters.priority} onChange={e => filter({priority: e.target.value})}>
            <option value="">All priorities</option>
            {['low', 'medium', 'high', 'urgent'].map(p => (
              <option key={p} value={p}>
                {statusName(p)}
              </option>
            ))}
          </select>
        </label>
        {(['start', 'end'] as const).map(k => (
          <label className="field" key={k}>
            Created {k === 'start' ? 'from' : 'through'}
            <input type="date" value={filters[k]} onChange={e => filter({[k]: e.target.value})} />
          </label>
        ))}
        <label className="field">
          Sort
          <select value={filters.sort} onChange={e => filter({sort: e.target.value})}>
            {[
              ['newest', 'Newest first'],
              ['oldest', 'Oldest first'],
              ['due', 'Due date'],
              ['priority', 'Highest priority'],
              ['title', 'Title A–Z'],
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={filters.overdue} onChange={e => filter({overdue: e.target.checked})} />
          Overdue only
        </label>
        <button className="text-button" onClick={() => setFilters(defaults)}>
          Clear filters
        </button>
      </div>
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      {message && (
        <p role="status" className="timesheet-message">
          {message}
        </p>
      )}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : !result ? (
        <p role="status" className="card padded">
          Loading tasks…
        </p>
      ) : (
        <>
          <p className="form-hint">
            {result.total} matching tasks · page {result.page} of{' '}
            {Math.max(1, Math.ceil(result.total / result.page_size))}. Date filters use task creation dates in{' '}
            {data.workspace.timezone}.
          </p>
          {view === 'list' ? (
            <section className="card table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Websites</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Owner</th>
                    <th>Due date</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.tasks.map(t => (
                    <tr key={t.id}>
                      <td>
                        <button className="text-button" onClick={() => onOpen(t.id)}>
                          {t.title}
                        </button>
                        <small className="block">{t.category}</small>
                      </td>
                      <td>{sites(t)}</td>
                      <td>
                        {statusName(t.progress)}
                        {pending(t)}
                      </td>
                      <td>{statusName(t.priority)}</td>
                      <td>{name(t.assignee_id)}</td>
                      <td>{t.due_date || 'No due date'}</td>
                      <td>
                        {t.pending_recipient_id === data.profile.id ? (
                          <div className="row">
                            <button className="button secondary" disabled={busy} onClick={() => respond(t, true)}>
                              Accept
                            </button>
                            <button className="text-button" disabled={busy} onClick={() => respond(t, false)}>
                              Decline
                            </button>
                          </div>
                        ) : (
                          <button className="text-button" onClick={() => onOpen(t.id)}>
                            Open
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!result.tasks.length && (
                <div className="empty">
                  <h3>No matching tasks</h3>
                  <p>Clear filters or create a task.</p>
                  <button className="button primary" onClick={onCreate}>
                    Create task
                  </button>
                </div>
              )}
            </section>
          ) : (
            <>
              <p className="form-hint">
                Board cards show the current page of accepted tasks. Column counts cover all matching pages. Unassigned
                and pending requests remain separate below. Drag a card or use its Move control; open task details for
                review decisions.
              </p>
              <div className="live-kanban">
                {taskStatuses.map(status => (
                  <section
                    className="live-kanban-column"
                    key={status}
                    aria-label={`${statusName(status)} column`}
                    onDragOver={e => {
                      if (dragged.current) e.preventDefault();
                    }}
                    onDrop={e => {
                      e.preventDefault();
                      const task = dragged.current;
                      dragged.current = null;
                      if (task) move(task, status);
                    }}
                  >
                    <h3>
                      {statusName(status)} <span>{result.board_counts[status] || 0}</span>
                    </h3>
                    {result.tasks
                      .filter(t => t.assignee_id && t.progress === status)
                      .map(t => (
                        <article
                          className="live-kanban-card"
                          key={t.id}
                          draggable={
                            !busy &&
                            (t.assignee_id === data.profile.id ||
                              ['administrator', 'manager'].includes(data.profile.role))
                          }
                          onDragStart={event => {
                            dragged.current = t;
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', t.id);
                          }}
                          onDragEnd={() => {
                            dragged.current = null;
                          }}
                        >
                          <button className="task-card-title" onClick={() => onOpen(t.id)}>
                            {t.title}
                          </button>
                          <small>{sites(t)}</small>
                          <p>
                            {name(t.assignee_id)} · {statusName(t.priority)}
                          </p>
                          {t.due_date && <p>Due {t.due_date}</p>}
                          {pending(t)}
                          <label className="field">
                            Move
                            <select
                              aria-label={`Move ${t.title}`}
                              value=""
                              disabled={
                                busy ||
                                !(
                                  t.assignee_id === data.profile.id ||
                                  ['administrator', 'manager'].includes(data.profile.role)
                                )
                              }
                              onChange={e => move(t, e.target.value)}
                            >
                              <option value="">Choose status</option>
                              {taskStatuses
                                .filter(s => s !== t.progress && !boardTransition(t, s, data.profile))
                                .map(s => (
                                  <option key={s} value={s}>
                                    {statusName(s)}
                                  </option>
                                ))}
                            </select>
                          </label>
                        </article>
                      ))}
                    {!result.tasks.some(t => t.assignee_id && t.progress === status) && (
                      <p className="form-hint">No cards on this page.</p>
                    )}
                  </section>
                ))}
              </div>
              <section className="card padded">
                <h3>Unassigned / pending requests</h3>
                <p className="form-hint">
                  {result.unassigned} unassigned matching tasks across all pages. A pending handover keeps its accepted
                  owner and board card until the recipient accepts.
                </p>
                {result.tasks
                  .filter(t => !t.assignee_id || t.pending_assignment_id)
                  .map(t => (
                    <div className="task-separate-request" key={t.id}>
                      <button className="text-button" onClick={() => onOpen(t.id)}>
                        {t.title}
                      </button>
                      {pending(t)}
                      {t.pending_recipient_id === data.profile.id && (
                        <div className="row">
                          <button className="button secondary" disabled={busy} onClick={() => respond(t, true)}>
                            Accept
                          </button>
                          <button className="text-button" disabled={busy} onClick={() => respond(t, false)}>
                            Decline
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </section>
            </>
          )}
          <div className="table-footer">
            <button
              className="button secondary"
              disabled={filters.page === 1 || busy}
              onClick={() => setFilters({...filters, page: filters.page - 1})}
            >
              Previous
            </button>
            <span>
              Showing {result.tasks.length} of {result.total}
            </span>
            <button
              className="button secondary"
              disabled={filters.page * 25 >= result.total || busy}
              onClick={() => setFilters({...filters, page: filters.page + 1})}
            >
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
