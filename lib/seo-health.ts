import spec from './seo-fields.json';
import {InputError} from './live-validation';
import {recordId} from './reporting';
import {calendarDate} from './dates';
export const seoFields = spec;
export const seoStatuses = ['unknown', 'yes', 'no', 'in_progress', 'not_yet', 'not_applicable'];
export type SeoValues = Record<string, string | number | null>;
export function validateSeo(fields: unknown, notes: unknown) {
  if (
    !fields ||
    typeof fields !== 'object' ||
    Array.isArray(fields) ||
    !notes ||
    typeof notes !== 'object' ||
    Array.isArray(notes)
  )
    throw new InputError('Enter valid SEO fields and notes.');
  const values = fields as SeoValues;
  const noteValues = notes as Record<string, string>;
  const keys = new Set(seoFields.map(f => f.key));
  if (Object.keys(values).some(k => !keys.has(k)) || Object.keys(noteValues).some(k => !keys.has(k)))
    throw new InputError('Unknown SEO field.');
  for (const field of seoFields) {
    const value = values[field.key];
    if (value === undefined || value === null || value === '') continue;
    if (['number', 'duration'].includes(field.type)) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        (field.type === 'number' && value > 100) ||
        (field.type === 'duration' && value > 3600)
      )
        throw new InputError(`${field.label} is outside its allowed range.`);
    } else if (
      typeof value !== 'string' ||
      value.length > 5000 ||
      /-----BEGIN .*PRIVATE KEY|[?&](password|token|api_key)=/i.test(value)
    )
      throw new InputError('Use text without passwords or credentials.');
    if (field.type === 'status' && !seoStatuses.includes(String(value)))
      throw new InputError(`Choose a valid status for ${field.label}.`);
    if (field.type === 'date') calendarDate(value);
  }
  for (const note of Object.values(noteValues))
    if (typeof note !== 'string' || note.length > 2000)
      throw new InputError('Field notes must be at most 2,000 characters.');
  if (values.seo_score !== undefined && values.seo_score !== null && values.seo_score !== '' && !values.audit_date)
    throw new InputError('An SEO score needs an audit date.');
  return {fields: values, notes: noteValues};
}
export function seoInput(raw: unknown) {
  if (!raw || typeof raw !== 'object') throw new InputError('Invalid SEO form.');
  const v = raw as Record<string, unknown>;
  if (!Number.isInteger(v.expected_revision) || Number(v.expected_revision) < 0)
    throw new InputError('Reload this website before saving.');
  const source = String(v.source ?? '').trim();
  const reason = String(v.reason ?? '').trim();
  if (source.length > 500 || reason.length > 2000) throw new InputError('Source or correction reason is too long.');
  const checked = validateSeo(v.fields, v.notes ?? {});
  if (
    checked.fields.seo_score !== null &&
    checked.fields.seo_score !== undefined &&
    checked.fields.seo_score !== '' &&
    !source
  )
    throw new InputError('Enter the SEO audit source/tool.');
  return {
    request_id: recordId(v.request_id)!,
    website_id: recordId(v.website_id)!,
    expected_revision: v.expected_revision,
    ...checked,
    source,
    reason,
  };
}
/** Audit reminder schedule: websites with no dated audit in this many days are due (migration 016). */
export function auditScheduleInput(raw: unknown) {
  const days = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).interval_days : undefined;
  if (!Number.isInteger(days) || Number(days) < 7 || Number(days) > 730)
    throw new InputError('Choose an audit interval between 7 and 730 days.');
  return {interval_days: days as number};
}
