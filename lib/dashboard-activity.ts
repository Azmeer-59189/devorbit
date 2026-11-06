import type {SupabaseClient} from '@supabase/supabase-js';
import {workspaceDate} from './dates';

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
  const months = new Map<string, number>();
  // Zero-fill months within the selected range so gaps remain visible.
  const cursor = new Date(filters.start.slice(0, 7) + '-01T12:00:00Z');
  while (cursor.toISOString().slice(0, 7) <= filters.end.slice(0, 7)) {
    months.set(cursor.toISOString().slice(0, 7), 0);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
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
      if (date >= filters.start && date <= filters.end)
        months.set(date.slice(0, 7), (months.get(date.slice(0, 7)) || 0) + 1);
    }
  }
  const ranked = (values: Map<string, number>) =>
    [...values].map(([id, count]) => ({id, count})).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return {
    completed,
    owners: ranked(owners),
    websites: ranked(websites),
    months: [...months].map(([name, count]) => ({name, count})),
  };
}
