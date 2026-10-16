export class InputError extends Error {}
type Input = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Enter valid form data.');
  return value as Input;
}
// Reads a JSON object body, counting bytes as they stream so a missing or
// understated Content-Length cannot slip past the limit. The default stays
// above the largest form the validators accept (a full report template).
export async function readJson(request: Request, maxBytes = 1_000_000): Promise<Input> {
  if (Number(request.headers.get('content-length') || 0) > maxBytes)
    throw new InputError('The submitted form is too large.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InputError('The submitted form is too large.');
      }
      chunks.push(read.value);
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InputError('Enter valid form data.');
  }
  return object(value);
}
function text(input: Input, key: string, max: number, required = false) {
  const value = input[key];
  if (value !== undefined && value !== null && typeof value !== 'string') throw new InputError(`${key} must be text.`);
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > max)
    throw new InputError(`${key} ${required ? 'is required and ' : ''}must be at most ${max} characters.`);
  return result;
}
function id(value: unknown, required = false) {
  if (!value && !required) return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new InputError('Select a valid workspace record.');
  return value;
}
export function websiteInput(value: unknown) {
  const input = object(value);
  const name = text(input, 'name', 150, true);
  const country = text(input, 'country', 100, true);
  const cms = text(input, 'cms', 100);
  const raw = text(input, 'url', 2048, true);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new InputError('Enter a complete website URL, such as https://example.org.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new InputError('Use an HTTP or HTTPS website URL without credentials, query parameters, or fragments.');
  url.hostname = url.hostname.toLowerCase();
  return {request_id: id(input.request_id, true)!, name, country, cms, url: url.href.replace(/\/$/, '')};
}
export function taskInput(value: unknown) {
  const input = object(value);
  const title = text(input, 'title', 200, true);
  const description = text(input, 'description', 10000);
  const category = text(input, 'category', 100, true);
  const priority = text(input, 'priority', 20, true);
  if (!['low', 'medium', 'high', 'urgent'].includes(priority)) throw new InputError('Choose a valid priority.');
  const due = text(input, 'due_date', 10);
  if (
    due &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(due) ||
      Number.isNaN(Date.parse(due)) ||
      new Date(due).toISOString().slice(0, 10) !== due)
  )
    throw new InputError('Choose a valid due date.');
  if (input.review_required !== undefined && typeof input.review_required !== 'boolean')
    throw new InputError('Review required must be true or false.');
  const review = input.review_required === true;
  const assignee = id(input.assignee_id);
  const reviewer = id(input.reviewer_id);
  if (review && (!reviewer || reviewer === assignee))
    throw new InputError('Choose an independent reviewer, different from the assignee.');
  if (!Array.isArray(input.website_ids) || input.website_ids.length > 50)
    throw new InputError('Select up to 50 websites.');
  const websiteIds = Array.from(new Set(input.website_ids.map(value => id(value, true)!)));
  return {
    request_id: id(input.request_id, true)!,
    title,
    description,
    category,
    priority,
    due_date: due || null,
    assignee_id: assignee,
    review_required: review,
    reviewer_id: review ? reviewer : null,
    website_ids: websiteIds,
  };
}
export function assignmentInput(value: unknown) {
  const input = object(value);
  const request_id = id(input.request_id, true)!;
  if (typeof input.accept !== 'boolean') throw new InputError('Choose accept or decline.');
  const reason = text(input, 'reason', 2000);
  if (!input.accept && !reason) throw new InputError('A decline reason is required.');
  return {request_id, accept: input.accept, reason};
}
export function taskActionInput(value: unknown) {
  const input = object(value);
  const action = text(input, 'action', 30, true);
  if (
    ![
      'status',
      'review_approve',
      'review_changes',
      'comment',
      'collaborator_add',
      'collaborator_remove',
      'reviewer',
      'handover',
      'withdraw',
    ].includes(action)
  )
    throw new InputError('Choose a valid task action.');
  if (!Number.isInteger(input.expected_revision) || Number(input.expected_revision) < 1)
    throw new InputError('Refresh this task before saving.');
  const status = text(input, 'status', 20);
  if (
    action === 'status' &&
    !['to_do', 'in_progress', 'blocked', 'in_review', 'completed', 'cancelled'].includes(status)
  )
    throw new InputError('Choose a valid task status.');
  const reason = text(input, 'reason', 2000);
  const body = text(input, 'body', 5000, action === 'comment');
  const member = id(
    input.member_id,
    ['collaborator_add', 'collaborator_remove', 'reviewer', 'handover'].includes(action),
  );
  const raw = input.mention_ids ?? [];
  if (!Array.isArray(raw) || raw.length > 50) throw new InputError('Select up to 50 mentioned members.');
  return {
    request_id: id(input.request_id, true)!,
    task_id: id(input.task_id, true)!,
    expected_revision: input.expected_revision,
    action,
    status: status || null,
    reason,
    body,
    member_id: member,
    mention_ids: Array.from(new Set(raw.map(value => id(value, true)!))),
  };
}
export function memberInput(value: unknown) {
  const input = object(value);
  const action = text(input, 'action', 20, true);
  if (!['add', 'update'].includes(action)) throw new InputError('Choose a valid member action.');
  const role = text(input, 'role', 20, true);
  if (!['administrator', 'manager', 'developer'].includes(role)) throw new InputError('Choose a valid role.');
  if (input.active !== undefined && typeof input.active !== 'boolean')
    throw new InputError('Active must be true or false.');
  const email = text(input, 'email', 254, action === 'add').toLowerCase();
  if (action === 'add' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new InputError('Enter a valid email address.');
  return {
    request_id: id(input.request_id, true)!,
    action,
    role,
    active: input.active !== false,
    email,
    display_name: text(input, 'display_name', 150, action === 'add'),
    member_id: id(input.member_id, action === 'update'),
  };
}
