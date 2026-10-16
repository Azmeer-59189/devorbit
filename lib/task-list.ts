import {InputError} from './live-validation';
import {recordId} from './reporting';
import {calendarDate, workspaceTimestamp} from './dates';
import {Task, Member, Website, statusName} from './live-types';
export const taskStatuses = ['to_do', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'];
/** Status filter values: 'open' means not completed or cancelled, as the dashboard counts active work. */
export const taskStatusFilters = ['open', ...taskStatuses];
const scopes = ['all', 'assigned', 'pending', 'created', 'completed'];
const sorts = ['newest', 'oldest', 'due', 'priority', 'title'];
const priorities = ['low', 'medium', 'high', 'urgent'];
export const taskFilterDefaults = {
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
export type TaskFilters = typeof taskFilterDefaults;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validDate(value: string) {
  try {
    return calendarDate(value);
  } catch {
    return '';
  }
}
/**
 * Reads task filters from a page URL. Unlike taskListFilters, invalid values are
 * dropped rather than rejected, so an edited or stale link still opens the list.
 */
export function taskFiltersFromSearch(p: URLSearchParams): TaskFilters {
  const pick = (key: string, allowed: string[]) => (allowed.includes(p.get(key) || '') ? p.get(key)! : '');
  const id = (key: string) => (uuid.test(p.get(key) || '') ? p.get(key)! : '');
  const page = Number(p.get('page'));
  const q = p.get('q') || '';
  return {
    q: q.length <= 200 ? q : '',
    website: id('website'),
    owner: p.get('owner') === 'unassigned' ? 'unassigned' : id('owner'),
    creator: id('creator'),
    status: pick('status', taskStatusFilters),
    priority: pick('priority', priorities),
    start: validDate(p.get('start') || ''),
    end: validDate(p.get('end') || ''),
    overdue: p.get('overdue') === 'true',
    sort: pick('sort', sorts) || 'newest',
    page: Number.isInteger(page) && page >= 1 && page <= 1000000 ? page : 1,
  };
}
/** Writes only the filters that differ from the defaults, keeping shared links short. */
export function taskFiltersToSearch(filters: Partial<TaskFilters>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({...taskFilterDefaults, ...filters}))
    if (value !== taskFilterDefaults[key as keyof TaskFilters]) params.set(key, String(value));
  return params;
}
export function taskListFilters(p: URLSearchParams) {
  const scope = p.get('scope') || 'all',
    sort = p.get('sort') || 'newest',
    status = p.get('status') || '',
    priority = p.get('priority') || '',
    page = Number(p.get('page') || 1),
    q = (p.get('q') || '').trim();
  if (
    !scopes.includes(scope) ||
    !sorts.includes(sort) ||
    (status && !taskStatusFilters.includes(status)) ||
    (priority && !priorities.includes(priority)) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 1000000 ||
    q.length > 200
  )
    throw new InputError('Invalid task filters.');
  const start = p.get('start') || '',
    end = p.get('end') || '';
  if (start) calendarDate(start);
  if (end) calendarDate(end);
  if (start && end && end < start) throw new InputError('End date must follow start date.');
  const owner = p.get('owner') || '';
  if (owner && owner !== 'unassigned') recordId(owner);
  return {
    scope,
    sort,
    status,
    priority,
    page,
    q,
    start,
    end,
    owner,
    creator: recordId(p.get('creator'), false),
    website: recordId(p.get('website'), false),
    overdue: p.get('overdue') === 'true',
    export: p.get('export') === 'true',
  };
}
export function boardTransition(task: Task, target: string, actor: Member) {
  if (!taskStatuses.includes(target)) return 'Choose a valid status.';
  if (!task.assignee_id) return 'Accept an assignment before moving this task.';
  if (actor.id !== task.assignee_id && !['administrator', 'manager'].includes(actor.role))
    return 'Only the owner or a manager can move this task.';
  if (task.progress === 'in_review' && target !== 'cancelled' && target !== task.progress)
    return 'Open this task for an independent review decision.';
  if (['completed', 'cancelled'].includes(task.progress) && !['to_do', 'in_progress', task.progress].includes(target))
    return 'Reopen this task as To Do or In Progress.';
  if (task.review_required && target === 'completed') return 'Send this task for independent review before completion.';
  if (!task.review_required && target === 'in_review') return 'This task does not require review.';
  return '';
}
export type TaskListRow = Task & {
  website_ids: string[];
  pending_assignment_id: string | null;
  pending_recipient_id: string | null;
};
/** Most rows the task list returns in export mode (migration 015). */
export const taskExportLimit = 5000;
/** One spreadsheet row per task, with people and websites resolved to names. */
export function taskExportRows(
  tasks: TaskListRow[],
  lookup: {members: Member[]; websites: Website[]; timezone: string},
) {
  const person = (id: string | null | undefined) =>
    id ? lookup.members.find(m => m.id === id)?.display_name || 'Former member' : '';
  return tasks.map(t => ({
    Task: t.title,
    Description: t.description || '',
    Category: t.category,
    Status: statusName(t.progress),
    Priority: statusName(t.priority),
    Owner: person(t.assignee_id) || 'Unassigned',
    'Awaiting acceptance by': person(t.pending_recipient_id),
    Creator: person(t.creator_id),
    'Review required': t.review_required ? 'Yes' : 'No',
    Reviewer: person(t.reviewer_id),
    Websites: t.website_ids.map(id => lookup.websites.find(w => w.id === id)?.name || 'Website').join(', '),
    'Due date': t.due_date || '',
    Created: workspaceTimestamp(t.created_at, lookup.timezone),
    Completed: workspaceTimestamp(t.completed_at, lookup.timezone),
    'Blocker reason': t.blocker_reason || '',
  }));
}
