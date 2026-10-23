export type Page =
  | 'Form builder'
  | 'Website features'
  | 'SEO reports'
  | 'Overview'
  | 'Websites'
  | 'Team tasks'
  | 'My tasks'
  | 'Team & roles'
  | 'Notifications'
  | 'Account';

const slugs: Record<Page, string> = {
  Overview: '',
  Websites: 'websites',
  'Team tasks': 'tasks',
  'My tasks': 'my-tasks',
  'Team & roles': 'team',
  Notifications: 'notifications',
  Account: 'account',
  'SEO reports': 'reports',
  'Website features': 'website-features',
  'Form builder': 'forms',
};
const pages = Object.fromEntries(Object.entries(slugs).map(([page, slug]) => [slug, page as Page]));

/** Pages only administrators can open. */
export const adminPages: Page[] = ['Team & roles', 'Form builder'];

/**
 * Reads the workspace page from a pathname such as `/workspace/websites/<id>`.
 * Unknown paths fall back to the Overview page.
 */
export function parseWorkspacePath(pathname: string): {page: Page; websiteId: string | null} {
  const [, root, slug = '', id] = pathname.replace(/\/+$/, '').split('/');
  const page = root === 'workspace' ? pages[slug] : undefined;
  if (!page) return {page: 'Overview', websiteId: null};
  return {page, websiteId: page === 'Websites' && id ? decodeURIComponent(id) : null};
}

export function workspacePath(page: Page, websiteId?: string | null) {
  const slug = slugs[page];
  const base = slug ? `/workspace/${slug}` : '/workspace';
  return page === 'Websites' && websiteId ? `${base}/${encodeURIComponent(websiteId)}` : base;
}
