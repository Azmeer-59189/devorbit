import {createHash, timingSafeEqual} from 'node:crypto';
import {InputError} from './live-validation';

export const taskSheetHeaders = [
  'Task ID',
  'Title',
  'Website',
  'Website 2',
  'Website 3',
  'Priority',
  'Status',
  'Created date',
  'Completed date',
  'Archived',
];
export function validSheetSecret(actual: string | null, expected: string) {
  if (!actual || expected.length < 32) return false;
  const hash = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(hash(actual), hash(`Bearer ${expected}`));
}
export function taskSheetRows(input: Record<string, unknown>, sheetId: string) {
  if (input.sheet_id !== sheetId) throw new InputError('This spreadsheet is not connected to this dashboard.');
  if (!Array.isArray(input.rows) || input.rows.length > 200) throw new InputError('Send at most 200 tasks per sync.');
  const ids = new Set<string>();
  return input.rows.map((raw, index) => {
    const fail = (message: string): never => {
      throw new InputError(`Row ${index + 2}: ${message}`);
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Invalid task.');
    const row = raw as Record<string, unknown>;
    const text = (key: string, max: number, required = false) => {
      if (!required && row[key] === undefined) return '';
      if (typeof row[key] !== 'string' || (row[key] as string).length > max) return fail(`Check ${key}.`);
      const value = (row[key] as string).trim();
      if (required && !value) return fail(`${key} is required.`);
      return value;
    };
    const id = text('id', 36, true).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || ids.has(id))
      return fail('Task ID is invalid or duplicated.');
    ids.add(id);
    const date = (key: string) => {
      const value = text(key, 10);
      if (
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        return fail(`Use a valid YYYY-MM-DD ${key}.`);
      return value || null;
    };
    const priority = text('priority', 20).toLowerCase() || 'medium';
    const status = text('status', 20).toLowerCase().replaceAll(' ', '_') || 'to_do';
    if (!['low', 'medium', 'high', 'urgent'].includes(priority)) return fail('Invalid priority.');
    if (!['to_do', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'].includes(status))
      return fail('Invalid status.');
    const completed = date('completed_date');
    const blocker = text('blocker', 2000);
    if (status === 'completed' && !completed) return fail('Enter the completed date.');
    if (status !== 'completed' && completed) return fail('Clear the completed date for an unfinished task.');
    if (status === 'blocked' && row.blocker !== undefined && !blocker) return fail('Enter the blocker.');
    const archived = text('archived', 5).toLowerCase();
    if (!['', 'yes', 'no'].includes(archived)) return fail('Archived must be Yes or No.');
    const websites = text('websites', 10000)
      .split(';')
      .map(v => v.trim())
      .filter(Boolean);
    if (websites.length > 50) return fail('Use at most 50 websites.');
    return {
      id,
      title: text('title', 200, true),
      assignee: text('assignee', 200),
      websites,
      ...(row.category === undefined ? {} : {category: text('category', 100) || 'general'}),
      priority,
      status,
      created_date: date('created_date'),
      completed_date: completed,
      ...(row.description === undefined ? {} : {description: text('description', 10000)}),
      ...(row.due_date === undefined ? {} : {due_date: date('due_date')}),
      ...(row.blocker === undefined ? {} : {blocker}),
      ...(row.completion_notes === undefined ? {} : {completion_notes: text('completion_notes', 5000)}),
      archived: archived === 'yes',
    };
  });
}
