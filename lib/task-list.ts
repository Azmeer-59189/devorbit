import {InputError} from './live-validation';
import {recordId} from './reporting';
import {calendarDate} from './dates';
import {Task, Member} from './live-types';
export const taskStatuses = ['to_do', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'];
export function taskListFilters(p: URLSearchParams) {
  const scope = p.get('scope') || 'all',
    sort = p.get('sort') || 'newest',
    status = p.get('status') || '',
    priority = p.get('priority') || '',
    page = Number(p.get('page') || 1),
    q = (p.get('q') || '').trim();
  if (
    !['all', 'assigned', 'pending', 'created', 'completed'].includes(scope) ||
    !['newest', 'oldest', 'due', 'priority', 'title'].includes(sort) ||
    (status && !taskStatuses.includes(status)) ||
    (priority && !['low', 'medium', 'high', 'urgent'].includes(priority)) ||
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
