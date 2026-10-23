// Workspace data served in place of the API during browser tests. Dates are relative to
// today in UTC, which is also the workspace timezone, so due-date hints are stable.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export const members = [
  ['Azmeer Khan', 'administrator'],
  ['Sara Ahmed', 'manager'],
  ['Daniel Brooks', 'developer'],
  ['Priya Nair', 'developer'],
  ['Omar Farooq', 'seo_specialist'],
  ['Lena Fischer', 'developer'],
].map(([display_name, role], i) => ({id: id(i + 1), display_name, role, active: true}));

export const websites = [
  ['CRD United Kingdom', 'UK', 'https://crd.co.uk', 'WordPress'],
  ['CRD Germany', 'DE', 'https://crd.de', 'WordPress'],
  ['CRD UAE', 'AE', 'https://crd.ae', 'Webflow'],
  ['CRD Pakistan', 'PK', 'https://crd.pk', 'WordPress'],
  ['CRD Canada', 'CA', 'https://crd.ca', 'Shopify'],
  ['CRD Australia', 'AU', 'https://crd.com.au', 'WordPress'],
].map(([name, country, canonical_url, cms], i) => ({
  id: id(100 + i),
  name,
  country,
  canonical_url,
  cms,
  status: 'active',
  archived_at: null,
}));

const taskRows: [string, string, string, string, number | null, number | null][] = [
  ['Fix broken hreflang tags', 'SEO', 'high', 'in_progress', 3, -2],
  ['Migrate blog to new theme', 'Development', 'medium', 'to_do', 4, 6],
  ['Compress hero images', 'Performance', 'low', 'completed', 5, -5],
  ['Set up GA4 conversions', 'Analytics', 'high', 'in_review', 2, 1],
  ['Update cookie banner copy', 'Content', 'medium', 'blocked', 6, -1],
  ['Audit Core Web Vitals', 'SEO', 'urgent', 'in_progress', 5, 3],
  ['Add schema markup to products', 'SEO', 'medium', 'to_do', null, 9],
  ['Renew SSL certificate', 'Maintenance', 'urgent', 'to_do', 3, 0],
  ['Rewrite About page', 'Content', 'low', 'cancelled', 4, null],
  ['Fix 404s from old sitemap', 'SEO', 'high', 'in_progress', 2, 4],
  ['Plugin security updates', 'Maintenance', 'medium', 'completed', 3, -8],
  ['Landing page A/B test', 'Development', 'medium', 'to_do', 6, 12],
];
export const tasks = taskRows.map(([title, category, priority, progress, owner, due], i) => ({
  id: id(200 + i),
  title,
  description: 'Task description for browser tests.',
  category,
  priority,
  progress,
  assignee_id: owner ? id(owner) : null,
  creator_id: id(1),
  due_date: due === null ? null : day(due),
  review_required: i % 3 === 0,
  reviewer_id: i % 3 === 0 ? id(2) : null,
  created_at: new Date(Date.now() - i * 2 * 86400000).toISOString(),
  revision: 1,
  blocker_reason: progress === 'blocked' ? 'Waiting on legal approval' : null,
  completed_at: progress === 'completed' ? new Date().toISOString() : null,
}));
const taskWebsites = tasks.map((t, i) => ({task_id: t.id, website_id: websites[i % websites.length].id}));
const count = (status: string) => tasks.filter(t => t.progress === status).length;
const statuses = ['to_do', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled'];

export const workspace = {
  profile: {...members[0], email: 'azmeer@example.com'},
  workspace: {name: 'CRD International', timezone: 'UTC'},
  websites,
  members,
  tasks,
  assignments: [{id: id(300), task_id: tasks[6].id, recipient_id: id(1), state: 'pending'}],
  taskWebsites,
  counts: {open_tasks: 9, websites: websites.length},
};

const dashboard = {
  today: day(0),
  active_tasks: 9,
  overdue_tasks: 2,
  completed_tasks: 2,
  total_minutes: 0,
  log_count: 0,
  task_count: tasks.length,
  statuses: statuses.map(progress => ({progress, count: count(progress)})),
  workload: members.slice(1).map(m => ({
    assignee_id: m.id,
    name: m.display_name,
    count: tasks.filter(t => t.assignee_id === m.id && !['completed', 'cancelled'].includes(t.progress)).length,
  })),
  daily: [],
  contributors: [],
  websites: [],
  sources: ['PageSpeed Insights'],
  seo_count: 0,
  seo: [],
  tasks: [],
  logs: [],
  deadlines: {on_time: 6, overdue: 2, no_deadline: 1},
  attention: {overdue: 2, blocked: 1, pending_assignments: 1, audits_due: 3, audit_interval_days: 30},
};

const taskList = {
  tasks: tasks.map((t, i) => ({
    ...t,
    website_ids: [taskWebsites[i].website_id],
    pending_assignment_id: null,
    pending_recipient_id: null,
  })),
  total: tasks.length,
  page: 1,
  page_size: 25,
  board_counts: Object.fromEntries(statuses.map(s => [s, count(s)])),
  unassigned: 1,
};

/** Latest audit scores by website; null means not yet audited (three of six). */
export const auditScores = [92, null, 74, null, 41, null];
const seoFields = [
  {seo_implementation: 'yes', google_analytics: 'yes', page_seconds: 2.1, currency: 'GBP'},
  {seo_implementation: 'in_progress', google_analytics: 'no'},
  {seo_implementation: 'yes', page_seconds: 3.4},
  {},
  {seo_implementation: 'no', google_analytics: 'yes', page_seconds: 1.8, currency: 'CAD'},
  {google_analytics: 'yes'},
];
const seo = {
  websites: websites.map((w, i) => ({
    ...w,
    fields: seoFields[i],
    notes: {},
    source: '',
    revision: 1,
    latest_audit:
      auditScores[i] === null
        ? null
        : {
            id: id(400 + i),
            measurement_date: day(-10 * i),
            score: auditScores[i],
            source: 'PageSpeed Insights',
            actor_id: id(5),
            reason: null,
            created_at: new Date().toISOString(),
            supersedes_id: null,
          },
    audit_due: auditScores[i] === null,
  })),
  audits: [],
  revisions: [],
  audit_interval_days: 30,
};

const notifications = {
  notifications: [
    {
      id: id(500),
      task_id: tasks[0].id,
      kind: 'assigned',
      title: 'You were assigned “Fix broken hreflang tags”',
      read_at: null,
      created_at: new Date().toISOString(),
    },
    {
      id: id(501),
      task_id: tasks[2].id,
      kind: 'completed',
      title: '“Compress hero images” was completed',
      read_at: new Date().toISOString(),
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
  unread: 1,
};

/** The JSON a GET to this API path returns; unknown paths get an empty object. */
export function apiResponse(url: URL): unknown {
  const path = url.pathname;
  if (path === '/api/workspace') return workspace;
  if (path === '/api/dashboard') return dashboard;
  if (path === '/api/tasks') return taskList;
  if (path.startsWith('/api/tasks/'))
    return {
      task: tasks.find(t => path.endsWith(t.id)) || tasks[0],
      comments: [],
      reviews: [],
      activity: [],
      assignments: [],
    };
  if (path === '/api/notifications') return notifications;
  if (path === '/api/seo-health') {
    const website = url.searchParams.get('website');
    if (!website) return seo;
    const sites = seo.websites.filter(s => s.id === website);
    return {...seo, websites: sites, audits: sites.flatMap(s => (s.latest_audit ? [s.latest_audit] : []))};
  }
  if (path === '/api/team') return {members};
  if (path === '/api/invitations') return {invitations: [], configured: true};
  if (path.startsWith('/api/websites/')) {
    const site = websites.find(s => path.endsWith(s.id)) || websites[0];
    return {website: {...site, notes: '', owner_id: id(2)}, tasks: tasks.slice(0, 3), reports: [], relatedErrors: []};
  }
  return {};
}
