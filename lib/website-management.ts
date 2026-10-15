import {InputError, websiteInput} from './live-validation';
import {recordId} from './reporting';
export const websiteConfig = ['hosting', 'domain_registrar', 'crm', 'analytics', 'notes'] as const;
export function websiteManagementInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('Invalid website form.');
  const v = value as Record<string, unknown>;
  if (!['save', 'archive', 'restore'].includes(String(v.action)))
    throw new InputError('Choose a valid website action.');
  if (!Number.isInteger(v.expected_revision) || Number(v.expected_revision) < 1)
    throw new InputError('Refresh the website before saving.');
  const base = {
    request_id: recordId(v.request_id)!,
    website_id: recordId(v.website_id)!,
    expected_revision: v.expected_revision,
    action: v.action,
  };
  if (v.action !== 'save') return base;
  if (!['active', 'maintenance', 'needs_attention', 'inactive'].includes(String(v.status)))
    throw new InputError('Choose a website status.');
  if (!v.configuration || typeof v.configuration !== 'object' || Array.isArray(v.configuration))
    throw new InputError('Invalid website configuration.');
  const config = v.configuration as Record<string, unknown>;
  if (Object.keys(config).some(k => !websiteConfig.includes(k as (typeof websiteConfig)[number])))
    throw new InputError('Unsupported configuration field.');
  for (const value of Object.values(config))
    if (
      typeof value !== 'string' ||
      value.length > 2000 ||
      /-----BEGIN .*PRIVATE KEY|[?&](api_key|token|password)=/i.test(value)
    )
      throw new InputError('Configuration fields must be text, at most 2,000 characters, without credentials.');
  return {...websiteInput(v), ...base, status: v.status, configuration: config};
}
