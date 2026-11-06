import type {SupabaseClient} from '@supabase/supabase-js';
import {shiftDate, shiftMonths, workspaceDate} from './dates';

export type ActivityTask = {
  id: string;
  progress: string;
  assignee_id: string | null;
  completed_at: string | null;
  task_websites: {website_id: string}[];
};

/** Fetch every page: the dashboard's existing task preview is capped at 50 rows. */
export async function readActivityTasks(client: SupabaseClient, workspace: string) {
  const tasks: ActivityTask[] = [];
  for (let offset = 0; ; offset += 500) {
    const {data, error} = await client
      .from('tasks')
      .select('id,progress,assignee_id,completed_at,task_websites(website_id)')
      .eq('workspace_id', workspace)
      .is('archived_at', null)
      .order('id')
      .range(offset, offset + 499);
    if (error) throw error;
    tasks.push(...(data as ActivityTask[]));
    if (data.length < 500) return tasks;
  }
}

const dayNumber = (date: string) => Date.parse(date) / 86400000;
const monthNumber = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

/**
 * Buckets for the completion trend: days up to a month, weeks up to six months, then calendar
 * months, so every range has enough points to show a shape. The previous window is the same
 * length immediately before, and shares bucket positions with the selected one.
 */
function trendBuckets(start: string, end: string) {
  const days = dayNumber(end) - dayNumber(start) + 1;
  const unit = days <= 31 ? ('day' as const) : days <= 183 ? ('week' as const) : ('month' as const);
  const size = unit === 'week' ? 7 : 1;
  const position = (date: string, from: string) =>
    unit === 'month' ? monthNumber(date) - monthNumber(from) : Math.floor((dayNumber(date) - dayNumber(from)) / size);
  const count = position(end, start) + 1;
  return {
    unit,
    position,
    previous:
      unit === 'month'
        ? {start: shiftMonths(start, -count), end: shiftMonths(end, -count)}
        : {start: shiftDate(start, -days), end: shiftDate(start, -1)},
    // Zero-filled so gaps remain visible.
    points: Array.from({length: count}, (_, i) => ({
      date: unit === 'month' ? shiftMonths(start.slice(0, 8) + '01', i) : shiftDate(start, i * size),
      count: 0,
      previous: 0,
    })),
  };
}

export function dashboardActivity(
  tasks: ActivityTask[],
  filters: {
    start: string;
    end: string;
    user_id: string | null;
    website_id: string | null;
  },
  timezone: string,
) {
  const scoped = tasks.filter(
    t =>
      (!filters.user_id || t.assignee_id === filters.user_id) &&
      (!filters.website_id || t.task_websites.some(w => w.website_id === filters.website_id)),
  );
  const owners = new Map<string, number>();
  const websites = new Map<string, number>();
  const {unit, position, previous, points} = trendBuckets(filters.start, filters.end);
  let completed = 0;
  for (const task of scoped) {
    for (const id of new Set(task.task_websites.length ? task.task_websites.map(w => w.website_id) : ['unlinked']))
      websites.set(id, (websites.get(id) || 0) + 1);
    if (task.progress !== 'completed') continue;
    completed++;
    const owner = task.assignee_id || 'unassigned';
    owners.set(owner, (owners.get(owner) || 0) + 1);
    if (task.completed_at) {
      const date = workspaceDate(timezone, new Date(task.completed_at));
      if (date >= filters.start && date <= filters.end) points[position(date, filters.start)].count++;
      else if (date >= previous.start && date <= previous.end) points[position(date, previous.start)].previous++;
    }
  }
  const ranked = (values: Map<string, number>) =>
    [...values].map(([id, count]) => ({id, count})).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    completed,
    owners: ranked(owners),
    websites: ranked(websites),
    trend: {unit, points},
  };
}
