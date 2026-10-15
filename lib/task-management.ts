import {InputError, taskInput} from './live-validation';
import {recordId} from './reporting';
import {Task} from './live-types';
export function taskEditInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Invalid task form.');
  const v = value as Record<string, unknown>;
  if (!Number.isInteger(v.expected_revision) || Number(v.expected_revision) < 1)
    throw new InputError('Refresh the task before editing.');
  const fields = taskInput({...v, assignee_id: null, review_required: false, reviewer_id: null});
  return {
    request_id: fields.request_id,
    task_id: recordId(v.task_id)!,
    expected_revision: v.expected_revision,
    title: fields.title,
    description: fields.description,
    category: fields.category,
    priority: fields.priority,
    due_date: fields.due_date,
    website_ids: fields.website_ids,
  };
}
export type TaskFilters = {status: string; assignee: string; priority: string; overdue: boolean};
export function taskMatches(task: Task, filters: TaskFilters, today: string) {
  return (
    (filters.status === 'all' || task.progress === filters.status) &&
    (filters.assignee === 'all' ||
      (filters.assignee === 'unassigned' ? !task.assignee_id : task.assignee_id === filters.assignee)) &&
    (filters.priority === 'all' || task.priority === filters.priority) &&
    (!filters.overdue ||
      (!!task.due_date && task.due_date < today && !['completed', 'cancelled'].includes(task.progress)))
  );
}
