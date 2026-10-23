'use client';
import {useEffect, useRef, useState} from 'react';
import {Check, LoaderCircle, MessageSquare, RefreshCw, UserPlus, X} from 'lucide-react';
import {Workspace, Task, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {confirmAction} from '@/components/confirm-dialog';
import {taskActionInput} from '@/lib/live-validation';
import TaskEditor from '@/components/live-task-editor';
import {useDialog} from '@/components/live-dialog';
import DueDate from '@/components/due-date';
import {workspaceDate} from '@/lib/dates';

type Detail = {
  task: Task;
  website_ids: string[];
  comments: {id: string; author_id: string; body: string; created_at: string}[];
  collaborators: {user_id: string}[];
  reviews: {id: string; reviewer_id: string; decision: string; feedback: string; created_at: string}[];
  activity: {id: string; actor_id: string; action: string; safe_metadata: {reason?: string}; created_at: string}[];
  assignments: {id: string; recipient_id: string; state: string; reason: string; created_at: string}[];
};
export default function LiveTaskPanel({
  task,
  data,
  onClose,
  onChanged,
}: {
  task: Task;
  data: Workspace;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editDirty, setEditDirty] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [reason, setReason] = useState('');
  const [body, setBody] = useState('');
  const [mention, setMention] = useState('');
  const [member, setMember] = useState('');
  const [collaborator, setCollaborator] = useState('');
  const [reviewer, setReviewer] = useState('');
  const pendingAction = useRef<{key: string; id: string} | null>(null);
  const [reload, setReload] = useState(0);
  const close = async () => {
    if (busy) return;
    if (
      !(body.trim() || reason.trim() || editDirty) ||
      (await confirmAction({title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true}))
    )
      onClose();
  };
  useDialog(close);
  useEffect(() => {
    if (!(body.trim() || reason.trim() || editDirty)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [body, reason, editDirty]);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch(`/api/tasks/${task.id}`)
      .then(result => {
        if (!cancelled) {
          setDetail(result);
          setError('');
        }
      })
      .catch(error => {
        if (!cancelled) setError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [task.id, reload]);
  const current = detail?.task || task;
  const name = (id: string | null) =>
    data.members.find(member => member.id === id)?.display_name || (id ? 'Former team member' : 'Unassigned');
  const manager = ['administrator', 'manager'].includes(data.profile.role);
  const owner = data.profile.id === current.assignee_id;
  const editable = manager || owner || data.profile.id === current.creator_id;
  const canProgress = manager || owner;
  const reviewDecision =
    current.review_required &&
    current.progress === 'in_review' &&
    !owner &&
    (manager || data.profile.id === current.reviewer_id);
  const terminal = ['completed', 'cancelled'].includes(current.progress);
  const pending = detail?.assignments.find(a => a.state === 'pending');
  const linkedIds =
    detail?.website_ids || data.taskWebsites.filter(l => l.task_id === current.id).map(l => l.website_id);
  const linkedSites = linkedIds.map(id => data.websites.find(s => s.id === id)?.name).filter(Boolean);
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busy || !detail) return;
    setBusy(true);
    setError('');
    try {
      const key = JSON.stringify({task_id: current.id, expected_revision: current.revision, action, ...extra});
      if (pendingAction.current?.key !== key) pendingAction.current = {key, id: crypto.randomUUID()};
      const input = taskActionInput({
        request_id: pendingAction.current.id,
        task_id: current.id,
        expected_revision: current.revision,
        action,
        ...extra,
      });
      await workspaceFetch('/api/task-actions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      const updated = await workspaceFetch(`/api/tasks/${task.id}`);
      setDetail(updated);
      if (action === 'comment') {
        setBody('');
        setMention('');
      } else if (action === 'status' || action.startsWith('review_')) {
        setReason('');
        setStatus('');
      }
      pendingAction.current = null;
      setMember('');
      setCollaborator('');
      setReviewer('');
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const statuses = terminal
    ? current.assignee_id
      ? ['to_do', 'in_progress']
      : ['to_do']
    : current.review_required
      ? ['to_do', 'in_progress', 'blocked', 'in_review', 'cancelled']
      : ['to_do', 'in_progress', 'blocked', 'completed', 'cancelled'];
  return (
    <div className="overlay drawer-overlay" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section
        className="drawer workflow-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-task-title"
        data-live-dialog
      >
        <header>
          <span>
            Task details <small className="muted">· Revision {current.revision}</small>
          </span>
          <div className="row">
            <button
              className="icon-button"
              aria-label="Refresh task"
              disabled={busy}
              onClick={async () => {
                if (
                  !editDirty ||
                  (await confirmAction({
                    title: 'Discard your edits and reload?',
                    confirmLabel: 'Discard',
                    danger: true,
                  }))
                ) {
                  setEditing(false);
                  setEditDirty(false);
                  setReload(n => n + 1);
                }
              }}
            >
              <RefreshCw size={17} />
            </button>
            <button className="icon-button" aria-label="Close task" disabled={busy} onClick={close}>
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="drawer-body">
          <div className="row">
            <span className={`badge ${current.progress.replaceAll('_', '-')}`}>{statusName(current.progress)}</span>
            {pending && <span className="badge pending">Assignment awaiting acceptance</span>}
          </div>
          <h2 id="live-task-title">{current.title}</h2>
          <p className="task-description live-description">{current.description || 'No description added.'}</p>
          <div className="task-metadata">
            <span>Owner</span>
            <strong>{name(current.assignee_id)}</strong>
            <span>Created by</span>
            <strong>{name(current.creator_id)}</strong>
            <span>Priority / category</span>
            <strong>
              {statusName(current.priority)} · {current.category}
            </strong>
            <span>Due date</span>
            <strong>
              <DueDate
                date={current.due_date}
                today={workspaceDate(data.workspace.timezone)}
                open={!['completed', 'cancelled'].includes(current.progress)}
              />
            </strong>
            <span>Websites</span>
            <strong>{linkedSites.join(', ') || 'General work'}</strong>
            <span>Review</span>
            <strong>{current.review_required ? `Required · ${name(current.reviewer_id)}` : 'Not required'}</strong>
            {current.completed_at && (
              <>
                <span>Completed</span>
                <strong>
                  {new Date(current.completed_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})} ·{' '}
                  {name(current.completed_by || null)}
                </strong>
              </>
            )}
          </div>
          {current.blocker_reason && <div className="form-error">Blocked: {current.blocker_reason}</div>}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {!detail && !error && (
            <p className="row muted">
              <LoaderCircle size={16} className="spin" />
              Loading task history…
            </p>
          )}
          {detail && (
            <>
              {editable && !editing && (
                <button className="button secondary" onClick={() => setEditing(true)}>
                  Edit task details
                </button>
              )}
              {editing && (
                <TaskEditor
                  key={`${current.id}-${current.revision}`}
                  task={current}
                  websiteIds={linkedIds}
                  data={data}
                  onDirty={setEditDirty}
                  onBusy={setBusy}
                  onCancel={async () => {
                    if (
                      !editDirty ||
                      (await confirmAction({title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true}))
                    ) {
                      setEditing(false);
                      setEditDirty(false);
                    }
                  }}
                  onSaved={async () => {
                    const updated = await workspaceFetch(`/api/tasks/${task.id}`);
                    setDetail(updated);
                    setEditing(false);
                    await onChanged();
                  }}
                />
              )}
              <fieldset className="live-form-fieldset" disabled={busy || editing}>
                {((canProgress && current.assignee_id) ||
                  (editable && !current.assignee_id && current.progress === 'cancelled')) &&
                  current.progress !== 'in_review' && (
                    <form
                      className="workflow-section"
                      onSubmit={event => {
                        event.preventDefault();
                        act('status', {status: status || statuses[0], reason});
                      }}
                    >
                      <h3>{terminal ? 'Reopen task' : 'Update progress'}</h3>
                      {!terminal && (
                        <div className="task-quick-progress">
                          {current.progress === 'to_do' && (
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() => act('status', {status: 'in_progress', reason})}
                            >
                              Start work
                            </button>
                          )}
                          {current.progress === 'in_progress' && (
                            <button
                              className="button secondary"
                              type="button"
                              onClick={() =>
                                act('status', {status: current.review_required ? 'in_review' : 'completed', reason})
                              }
                            >
                              {current.review_required ? 'Send for review' : 'Mark completed'}
                            </button>
                          )}
                        </div>
                      )}
                      <label className="field">
                        {terminal ? 'Reopen as' : 'Status'}
                        <select value={status || ''} onChange={event => setStatus(event.target.value)} required>
                          <option value="">Choose a status</option>
                          {statuses
                            .filter(s => s !== current.progress)
                            .map(s => (
                              <option key={s} value={s}>
                                {statusName(s)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        {terminal
                          ? 'Reason for reopening *'
                          : status === 'blocked'
                            ? 'Blocker reason *'
                            : 'Notes / completion notes'}
                        <textarea
                          value={reason}
                          onChange={event => setReason(event.target.value)}
                          maxLength={2000}
                          required={terminal || status === 'blocked'}
                          placeholder={terminal ? 'Why does this need more work?' : 'Add context for this change…'}
                        />
                      </label>
                      <button className="button primary" type="submit">
                        <Check size={14} />
                        Save progress
                      </button>
                    </form>
                  )}
                {editable && !current.assignee_id && !terminal && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      if (
                        await confirmAction({
                          title: 'Cancel this task?',
                          message: 'It is unassigned. Its history will be kept.',
                          confirmLabel: 'Cancel task',
                          danger: true,
                        })
                      )
                        act('status', {status: 'cancelled'});
                    }}
                  >
                    Cancel task
                  </button>
                )}
                {reviewDecision && (
                  <section className="workflow-section">
                    <h3>Independent review</h3>
                    <label className="field">
                      Review feedback
                      <textarea
                        maxLength={2000}
                        value={reason}
                        onChange={event => setReason(event.target.value)}
                        placeholder="Describe your review or requested changes…"
                      />
                    </label>
                    <div className="row">
                      <button className="button primary" onClick={() => act('review_approve', {reason})}>
                        <Check size={14} />
                        Approve & complete
                      </button>
                      <button className="button secondary" onClick={() => act('review_changes', {reason})}>
                        Request changes
                      </button>
                    </div>
                  </section>
                )}
                {current.progress === 'in_review' && !reviewDecision && (
                  <div className="info-callout">
                    <p>
                      This task is awaiting an independent review from {name(current.reviewer_id)}. The assignee cannot
                      approve their own task.
                    </p>
                  </div>
                )}
                {canProgress && current.progress === 'in_review' && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      if (
                        await confirmAction({
                          title: 'Cancel this task?',
                          message: 'Its history will be kept.',
                          confirmLabel: 'Cancel task',
                          danger: true,
                        })
                      )
                        act('status', {status: 'cancelled'});
                    }}
                  >
                    Cancel task
                  </button>
                )}
                {editable && current.review_required && (
                  <form
                    className="row workflow-inline"
                    onSubmit={event => {
                      event.preventDefault();
                      act('reviewer', {member_id: reviewer});
                    }}
                  >
                    <label className="field">
                      Change independent reviewer
                      <select required value={reviewer} onChange={event => setReviewer(event.target.value)}>
                        <option value="">Select a reviewer</option>
                        {data.members
                          .filter(m => m.active !== false && m.id !== current.assignee_id)
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              {m.display_name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="button secondary" type="submit">
                      Save reviewer
                    </button>
                  </form>
                )}
                <section className="workflow-section">
                  <h3>Collaborators</h3>
                  <div className="collaborator-list">
                    {detail.collaborators.map(c => (
                      <span className="live-collaborator" key={c.user_id}>
                        {name(c.user_id)}
                        {editable && (
                          <button
                            aria-label={`Remove ${name(c.user_id)}`}
                            onClick={() => act('collaborator_remove', {member_id: c.user_id})}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  {!detail.collaborators.length && (
                    <p className="form-hint">
                      No collaborators yet. Collaborators can comment; ownership stays separate.
                    </p>
                  )}
                  {editable && (
                    <form
                      className="row workflow-inline"
                      onSubmit={event => {
                        event.preventDefault();
                        act('collaborator_add', {member_id: collaborator});
                      }}
                    >
                      <label className="field">
                        Add collaborator
                        <select required value={collaborator} onChange={event => setCollaborator(event.target.value)}>
                          <option value="">Select a teammate</option>
                          {data.members
                            .filter(m => m.active !== false && !detail.collaborators.some(c => c.user_id === m.id))
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button className="button secondary" type="submit">
                        <UserPlus size={14} />
                        Add
                      </button>
                    </form>
                  )}
                </section>
                {editable && !terminal && (
                  <section className="workflow-section">
                    <h3>{current.assignee_id ? 'Reassign task' : 'Assign task'}</h3>
                    {pending && (
                      <div className="info-callout">
                        <div>
                          <p>
                            Pending with {name(pending.recipient_id)}. Current ownership stays unchanged until
                            acceptance.
                          </p>
                          <button className="text-button" onClick={() => act('withdraw')}>
                            Withdraw request
                          </button>
                        </div>
                      </div>
                    )}
                    <form
                      className="row workflow-inline"
                      onSubmit={event => {
                        event.preventDefault();
                        act('handover', {member_id: member});
                      }}
                    >
                      <label className="field">
                        New assignee
                        <select required value={member} onChange={event => setMember(event.target.value)}>
                          <option value="">Select a teammate</option>
                          {data.members
                            .filter(
                              m =>
                                m.active !== false &&
                                m.id !== current.assignee_id &&
                                (!current.review_required || m.id !== current.reviewer_id),
                            )
                            .map(m => (
                              <option key={m.id} value={m.id}>
                                {m.display_name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button className="button secondary" type="submit">
                        {pending ? 'Replace assignment request' : 'Send assignment request'}
                      </button>
                    </form>
                  </section>
                )}
                <section className="workflow-section">
                  <h3>Comments</h3>
                  <div className="comments">
                    {detail.comments.map(comment => (
                      <article className="comment" key={comment.id}>
                        <span className="avatar purple">
                          {name(comment.author_id)
                            .split(' ')
                            .map(w => w[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <div>
                          <strong>{name(comment.author_id)}</strong>
                          <p className="live-description">{comment.body}</p>
                          <small>
                            {new Date(comment.created_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})}
                          </small>
                        </div>
                      </article>
                    ))}
                  </div>
                  <form
                    className="workflow-comment"
                    onSubmit={event => {
                      event.preventDefault();
                      act('comment', {body, mention_ids: mention ? [mention] : []});
                    }}
                  >
                    <label className="field">
                      Add a comment
                      <textarea
                        required
                        maxLength={5000}
                        value={body}
                        onChange={event => setBody(event.target.value)}
                        placeholder="Share an update with your team…"
                      />
                    </label>
                    <label className="field">
                      Mention a teammate (optional)
                      <select value={mention} onChange={event => setMention(event.target.value)}>
                        <option value="">No mention</option>
                        {data.members
                          .filter(m => m.active !== false && m.id !== data.profile.id)
                          .map(m => (
                            <option key={m.id} value={m.id}>
                              @{m.display_name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <button className="button primary" type="submit">
                      <MessageSquare size={14} />
                      Post comment
                    </button>
                  </form>
                </section>
              </fieldset>
              <section className="workflow-section">
                <h3>Review history</h3>
                {!detail.reviews.length && <p className="form-hint">No review decisions yet.</p>}
                {detail.reviews.map(review => (
                  <div className="history-item" key={review.id}>
                    <strong>
                      {name(review.reviewer_id)} · {statusName(review.decision)}
                    </strong>
                    <span className="live-description">{review.feedback || 'No additional feedback.'}</span>
                  </div>
                ))}
                <h3>Assignment history</h3>
                {detail.assignments.map(a => (
                  <div className="history-item" key={a.id}>
                    <strong>
                      {name(a.recipient_id)} · {statusName(a.state)}
                    </strong>
                    {a.reason && <span>{a.reason}</span>}
                  </div>
                ))}
                <h3>Activity</h3>
                {detail.activity.map(event => (
                  <div className="history-item" key={event.id}>
                    <strong>
                      {name(event.actor_id)} · {event.action.replaceAll('.', ' ').replaceAll('_', ' ')}
                    </strong>
                    <span>
                      {new Date(event.created_at).toLocaleString('en-GB', {timeZone: data.workspace.timezone})}
                      {event.safe_metadata.reason ? ` · ${event.safe_metadata.reason}` : ''}
                    </span>
                  </div>
                ))}
              </section>
            </>
          )}
          {busy && (
            <div className="workflow-saving" role="status">
              <LoaderCircle className="spin" size={16} />
              Saving…
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
