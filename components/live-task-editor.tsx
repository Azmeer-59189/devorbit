'use client';
import {useRef, useState} from 'react';
import {Task, Workspace} from '@/lib/live-types';
import {taskEditInput} from '@/lib/task-management';
import {workspaceFetch} from '@/lib/workspace-client';
export default function TaskEditor({
  task,
  websiteIds,
  data,
  onSaved,
  onCancel,
  onDirty,
  onBusy,
}: {
  task: Task;
  websiteIds: string[];
  data: Workspace;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [sites, setSites] = useState(websiteIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<{key: string; id: string} | null>(null);
  const saving = useRef(false);
  return (
    <form
      className="workflow-section task-edit-form"
      onChange={() => onDirty(true)}
      onSubmit={async e => {
        e.preventDefault();
        if (saving.current) return;
        const form = new FormData(e.currentTarget);
        const fields = {
          task_id: task.id,
          expected_revision: task.revision,
          title: form.get('title'),
          description: form.get('description'),
          category: form.get('category'),
          priority: form.get('priority'),
          due_date: form.get('due_date'),
          website_ids: sites,
        };
        try {
          setError('');
          const key = JSON.stringify(fields);
          if (pending.current?.key !== key) pending.current = {key, id: crypto.randomUUID()};
          const input = taskEditInput({...fields, request_id: pending.current.id});
          saving.current = true;
          setBusy(true);
          onBusy(true);
          await workspaceFetch(`/api/tasks/${task.id}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(input),
          });
          onDirty(false);
          await onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          saving.current = false;
          setBusy(false);
          onBusy(false);
        }
      }}
    >
      <h3>Edit task details</h3>
      <p className="form-hint">
        Assignment, progress and review use the controls below. Editing details preserves their current state.
      </p>
      <fieldset className="live-form-fieldset" disabled={busy}>
        <label className="field">
          Title *<input name="title" required maxLength={200} defaultValue={task.title} />
        </label>
        <label className="field">
          Description
          <textarea name="description" maxLength={10000} rows={4} defaultValue={task.description} />
        </label>
        <div className="form-row">
          <label className="field">
            Priority
            <select name="priority" defaultValue={task.priority}>
              {['low', 'medium', 'high', 'urgent'].map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Due date
            <input type="date" name="due_date" defaultValue={task.due_date || ''} />
          </label>
        </div>
        <label className="field">
          Category *<input name="category" required maxLength={100} defaultValue={task.category} />
        </label>
        <fieldset className="site-choices">
          <legend>Related websites</legend>
          {data.websites
            .filter(s => (!s.archived_at && s.status !== 'archived') || websiteIds.includes(s.id))
            .map(s => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={sites.includes(s.id)}
                  onChange={e => setSites(e.target.checked ? [...sites, s.id] : sites.filter(id => id !== s.id))}
                />
                {s.name}
                {s.archived_at || s.status === 'archived' ? ' (archived)' : ''}
              </label>
            ))}
        </fieldset>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button primary" type="submit">
            {busy ? 'Saving…' : 'Save details'}
          </button>
          <button className="button secondary" type="button" onClick={onCancel}>
            Cancel edit
          </button>
        </div>
      </fieldset>
    </form>
  );
}
