export type Website = {
  id: string;
  name: string;
  country: string;
  canonical_url: string;
  cms: string;
  status: string;
  archived_at: string | null;
};
export type Member = {id: string; display_name: string; role: string; active?: boolean};
export type Task = {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  progress: string;
  assignee_id: string | null;
  creator_id: string;
  due_date: string | null;
  review_required: boolean;
  reviewer_id: string | null;
  created_at: string;
  revision: number;
  blocker_reason: string | null;
  completed_at: string | null;
  completed_by?: string | null;
  completion_notes?: string | null;
};
export type Assignment = {id: string; task_id: string; recipient_id: string; state: string};
export type Workspace = {
  profile: Member & {email: string};
  workspace: {name: string; timezone: string};
  websites: Website[];
  members: Member[];
  tasks: Task[];
  assignments: Assignment[];
  taskWebsites: {task_id: string; website_id: string}[];
  /** Database totals; websites and tasks above are capped lists. */
  counts: {open_tasks: number; websites: number};
};
export const statusName = (value: string) =>
  value
    .split('_')
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
export const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
