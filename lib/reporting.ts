import {InputError} from '@/lib/live-validation';
import {calendarDate, shiftDate, weekRange} from '@/lib/dates';
export const fieldTypes = [
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'date',
  'url',
  'dropdown',
  'multi_select',
  'checkbox',
] as const;
export type FieldType = (typeof fieldTypes)[number];
export type ReportField = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  help: string;
  options?: string[];
  min?: number;
  max?: number;
  max_length?: number;
  metric_key?: 'seo_score';
};
export type Template = {
  id: string;
  title: string;
  description: string;
  type: string;
  state: string;
  draft_fields: ReportField[];
  draft_website_ids: string[];
  draft_revision: number;
  published_draft_revision: number | null;
};
export type TemplateVersion = {
  id: string;
  template_id: string;
  version_number: number;
  title: string;
  description: string;
  type: string;
  fields: ReportField[];
  published_at: string;
};
export type ReportingCatalog = {
  templates: Template[];
  versions: TemplateVersion[];
  assignments: {template_id: string; website_id: string}[];
};
const dangerous = /password|passwd|secret|token|credential|api[ _-]?key|private[ _-]?key|card[ _-]?number|cvv/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function recordId(value: unknown, required = true) {
  if (!required && !value) return null;
  if (typeof value !== 'string' || !uuid.test(value)) throw new InputError('Select a valid workspace record.');
  return value;
}
export function fieldSchema(value: unknown, publishing = false): ReportField[] {
  if (!Array.isArray(value) || value.length > 50 || (publishing && !value.length))
    throw new InputError('Use between 1 and 50 fields when publishing.');
  const keys = new Set<string>();
  const fields = value.map((raw): ReportField => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Invalid field definition.');
    const f = raw as Record<string, unknown>;
    const key = String(f.key ?? '').trim();
    const label = String(f.label ?? '').trim();
    const help = String(f.help ?? '').trim();
    if (!/^[a-z][a-z0-9_]{0,49}$/.test(key) || keys.has(key))
      throw new InputError(
        'Field keys must be unique, start with a letter, and use lowercase letters, numbers or underscores.',
      );
    keys.add(key);
    if (!label || label.length > 120 || help.length > 500 || dangerous.test(key + ' ' + label + ' ' + help))
      throw new InputError('Use clear field labels and never collect passwords, tokens, keys or credentials.');
    if (!fieldTypes.includes(f.type as FieldType) || typeof f.required !== 'boolean')
      throw new InputError('Choose a valid field type and required flag.');
    const result: ReportField = {key, label, help, type: f.type as FieldType, required: f.required};
    if (['dropdown', 'multi_select'].includes(result.type)) {
      if (
        !Array.isArray(f.options) ||
        !f.options.length ||
        f.options.length > 50 ||
        f.options.some(v => typeof v !== 'string' || !v.trim() || v.length > 120)
      )
        throw new InputError('Dropdown and multi-select fields need 1–50 non-empty options.');
      result.options = f.options.map(v => v.trim());
      if (new Set(result.options).size !== result.options.length) throw new InputError('Field options must be unique.');
    }
    for (const bound of ['min', 'max'] as const) {
      if (f[bound] !== undefined) {
        if (typeof f[bound] !== 'number' || !Number.isFinite(f[bound]) || !['integer', 'decimal'].includes(result.type))
          throw new InputError('Numeric bounds must be finite numbers on numeric fields.');
        result[bound] = f[bound];
      }
    }
    if (result.min !== undefined && result.max !== undefined && result.min > result.max)
      throw new InputError('Minimum must not exceed maximum.');
    if (f.max_length !== undefined) {
      if (
        !Number.isInteger(f.max_length) ||
        Number(f.max_length) < 1 ||
        Number(f.max_length) > 5000 ||
        !['short_text', 'long_text', 'url'].includes(result.type)
      )
        throw new InputError('Text length must be a whole number between 1 and 5,000.');
      result.max_length = Number(f.max_length);
    }
    if (f.metric_key !== undefined) {
      if (
        f.metric_key !== 'seo_score' ||
        !['integer', 'decimal'].includes(result.type) ||
        key !== 'seo_score' ||
        result.min !== 0 ||
        result.max !== 100
      )
        throw new InputError('Only the standardized SEO score (0–100) can be an analytical metric.');
      result.metric_key = 'seo_score';
    }
    return result;
  });
  if (fields.some(f => f.metric_key === 'seo_score')) {
    if (
      !fields.some(f => f.key === 'source' && f.type === 'short_text' && f.required) ||
      !fields.some(f => f.key === 'measurement_date' && f.type === 'date' && f.required) ||
      !fields.some(
        f =>
          f.key === 'scale' &&
          f.type === 'dropdown' &&
          f.required &&
          f.options?.length === 1 &&
          f.options[0] === '0–100',
      )
    )
      throw new InputError('SEO metrics require source, measurement_date and a required 0–100 scale field.');
  }
  return fields;
}
export function validateAnswers(fields: ReportField[], value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 50000)
    throw new InputError('Enter valid report answers.');
  const answers = value as Record<string, unknown>;
  const allowed = new Set(fields.map(f => f.key));
  if (Object.keys(answers).some(key => !allowed.has(key)))
    throw new InputError('This report contains fields outside its template version.');
  for (const field of fields) {
    const v = answers[field.key];
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (empty) {
      if (field.required) throw new InputError(`${field.label} is required.`);
      continue;
    }
    if (['short_text', 'long_text', 'url', 'date', 'dropdown'].includes(field.type)) {
      if (typeof v !== 'string') throw new InputError(`${field.label} must be text.`);
      if (v.length > (field.max_length ?? (field.type === 'long_text' ? 5000 : field.type === 'url' ? 2048 : 500)))
        throw new InputError(`${field.label} is too long.`);
      if (field.required && !v.trim()) throw new InputError(`${field.label} is required.`);
    }
    if (
      ['integer', 'decimal'].includes(field.type) &&
      (typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (field.type === 'integer' && !Number.isInteger(v)) ||
        (field.min !== undefined && Number(v) < field.min) ||
        (field.max !== undefined && Number(v) > field.max))
    )
      throw new InputError(`${field.label} is outside its valid numeric range.`);
    if (field.type === 'date') calendarDate(v);
    if (field.type === 'url') {
      let url: URL;
      try {
        url = new URL(String(v));
      } catch {
        throw new InputError(`${field.label} needs a complete URL.`);
      }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new InputError(`${field.label} must be an HTTP/HTTPS URL without credentials.`);
    }
    if (field.type === 'dropdown' && !field.options?.includes(String(v)))
      throw new InputError(`Choose a valid option for ${field.label}.`);
    if (
      field.type === 'multi_select' &&
      (!Array.isArray(v) ||
        v.some(option => typeof option !== 'string' || !field.options?.includes(option)) ||
        new Set(v).size !== v.length)
    )
      throw new InputError(`Choose valid, unique options for ${field.label}.`);
    if (field.type === 'checkbox' && (typeof v !== 'boolean' || (field.required && v !== true)))
      throw new InputError(`${field.label} must be checked.`);
  }
  return answers;
}
export function templateInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new InputError('Invalid template.');
  const v = value as Record<string, unknown>;
  if (!['create', 'save', 'publish', 'archive'].includes(String(v.action)))
    throw new InputError('Invalid template action.');
  const create = v.action === 'create';
  const save = create || v.action === 'save';
  const title = String(v.title ?? '').trim();
  const description = String(v.description ?? '').trim();
  const type = String(v.type ?? 'custom');
  if (
    save &&
    (!title ||
      title.length > 150 ||
      description.length > 2000 ||
      !['seo', 'maintenance', 'website_update', 'custom'].includes(type))
  )
    throw new InputError('Enter a template title, description and valid report type.');
  if (!create && (!Number.isInteger(v.expected_revision) || Number(v.expected_revision) < 1))
    throw new InputError('Refresh this template before saving.');
  if (save && (!Array.isArray(v.website_ids) || v.website_ids.length > 100))
    throw new InputError('Select up to 100 websites.');
  return {
    request_id: recordId(v.request_id)!,
    template_id: recordId(v.template_id, !create),
    action: v.action,
    expected_revision: create ? null : v.expected_revision,
    title,
    description,
    type,
    fields: save ? fieldSchema(v.fields) : [],
    website_ids: save ? Array.from(new Set((v.website_ids as unknown[]).map(id => recordId(id)!))) : [],
  };
}
export function reportInput(value: unknown) {
  if (!value || typeof value !== 'object') throw new InputError('Invalid report.');
  const v = value as Record<string, unknown>;
  const revision = Boolean(v.submission_id);
  const period_start = calendarDate(v.period_start);
  if (weekRange(period_start).start !== period_start) throw new InputError('The reporting week must start on Monday.');
  const reason = String(v.reason ?? '').trim();
  if (reason.length > 2000 || (revision && !reason))
    throw new InputError('Revisions require a reason of at most 2,000 characters.');
  if (revision && (!Number.isInteger(v.expected_revision) || Number(v.expected_revision) < 1))
    throw new InputError('Refresh this report before revising.');
  if (
    !v.answers ||
    typeof v.answers !== 'object' ||
    Array.isArray(v.answers) ||
    JSON.stringify(v.answers).length > 50000
  )
    throw new InputError('Enter valid report answers.');
  return {
    request_id: recordId(v.request_id)!,
    submission_id: recordId(v.submission_id, false),
    website_id: recordId(v.website_id)!,
    template_version_id: recordId(v.template_version_id)!,
    period_start,
    period_end: shiftDate(period_start, 6),
    answers: v.answers,
    reason,
    expected_revision: revision ? v.expected_revision : null,
  };
}
export const seoFields: ReportField[] = [
  {
    key: 'seo_score',
    label: 'SEO score',
    type: 'integer',
    required: true,
    help: 'Comparable only with the same methodology and scale.',
    min: 0,
    max: 100,
    metric_key: 'seo_score',
  },
  {
    key: 'source',
    label: 'Source / methodology',
    type: 'short_text',
    required: true,
    help: 'Use a consistent tool and methodology name.',
  },
  {key: 'measurement_date', label: 'Measurement date', type: 'date', required: true, help: ''},
  {key: 'scale', label: 'Score scale', type: 'dropdown', required: true, help: '', options: ['0–100']},
  {key: 'findings', label: 'Findings and next steps', type: 'long_text', required: false, help: ''},
];
