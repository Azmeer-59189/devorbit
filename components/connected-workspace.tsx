'use client';

import {FormEvent, useCallback, useEffect, useRef, useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  LayoutDashboard,
  ListTodo,
  LoaderCircle,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  Bell,
  Users,
  X,
} from 'lucide-react';
import {createBrowserSupabase} from '@/lib/supabase';
import {SeoTaskDraft} from '@/lib/seo-task';
import {taskInput, websiteInput} from '@/lib/live-validation';

import {Workspace, Task, statusName, statusClass, initials} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {ConfirmHost, confirmAction} from '@/components/confirm-dialog';
import {useDialog} from '@/components/live-dialog';
import LiveTasks from '@/components/live-tasks';
import LiveTaskPanel from '@/components/live-task-panel';
import LiveTeam from '@/components/live-team';
import LiveNotifications from '@/components/live-notifications';
import LiveSeoHealth from '@/components/live-seo-health';
import LiveWebsite from '@/components/live-website';
import LiveDashboard from '@/components/live-dashboard';
import DueDate from '@/components/due-date';
import {workspaceDate} from '@/lib/dates';
import {adminPages, parseWorkspacePath, workspacePath, type Page} from '@/lib/workspace-routes';

const pageLabels: Record<string, string> = {
  Overview: 'Home',
  'Team tasks': 'Tasks',
  'Team & roles': 'Team',
  'SEO reports': 'SEO',
  'Form builder': 'Website Features',
};
const pageLabel = (page: string) => pageLabels[page] || page;
// Shallow navigation: updates the URL and history without reloading the workspace.
const go = (path: string) => window.history.pushState(null, '', path);
export default function ConnectedWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [data, setData] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const route = parseWorkspacePath(pathname);
  const page: Page =
    data && adminPages.includes(route.page) && data.profile.role !== 'administrator' ? 'Overview' : route.page;
  const selectedWebsite = page === 'Websites' ? route.websiteId : null;
  const taskParam = searchParams.get('task');
  const [query, setQuery] = useState('');
  const [websiteFilter, setWebsiteFilter] = useState('all');
  const [websiteView, setWebsiteView] = useState('active');
  const [dialog, setDialog] = useState<'website' | 'task' | null>(null);
  const [seoDraft, setSeoDraft] = useState<SeoTaskDraft | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      workspaceFetch('/api/notifications')
        .then(r => {
          if (!cancelled) setUnread(r.unread || 0);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener('notifications-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('notifications-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);
  const [fetchedTask, setFetchedTask] = useState<Task | null>(null);
  const [mobile, setMobile] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await workspaceFetch('/api/workspace'));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to load your workspace.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch('/api/workspace')
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(error => {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Unable to load your workspace.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  async function logout() {
    try {
      const {error} = await createBrowserSupabase().auth.signOut();
      if (error) throw error;
      router.replace('/login');
    } catch {
      setError('Unable to sign out. Please retry.');
    }
  }
  // The open task lives in the URL (?task=<id>) so it can be shared and closed with Back.
  // Tasks outside the loaded list (e.g. from a notification) are fetched once and cached.
  const selected = taskParam
    ? data?.tasks.find(t => t.id === taskParam) || (fetchedTask?.id === taskParam ? fetchedTask : null)
    : null;
  const needsFetch = Boolean(data && taskParam && !selected);
  useEffect(() => {
    if (!needsFetch || !taskParam) return;
    let cancelled = false;
    workspaceFetch(`/api/tasks/${encodeURIComponent(taskParam)}`)
      .then(result => {
        if (!cancelled) setFetchedTask(result.task);
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [needsFetch, taskParam]);
  const withTask = (path: string, taskId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (taskId) params.set('task', taskId);
    else params.delete('task');
    const search = params.toString();
    return search ? `${path}?${search}` : path;
  };
  const openTask = (task: Task) => {
    if (!data?.tasks.some(t => t.id === task.id)) setFetchedTask(task);
    go(withTask(pathname, task.id));
  };
  const openTaskId = (id: string) => go(withTask(pathname, id));
  const closeTask = () => go(withTask(pathname, null));
  const openWebsite = (id: string | null) => go(workspacePath('Websites', id));
  // Drill-downs open a page with its filters or website already in the URL.
  const openWith = (next: Page, search: string) => {
    go(workspacePath(next) + (search ? `?${search}` : ''));
    setMobile(false);
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
  };
  const openSeo = (id: string | null) =>
    openWith('SEO reports', id ? new URLSearchParams({website: id}).toString() : '');
  const navigate = (next: Page) => {
    if (next === page && !selectedWebsite) {
      setMobile(false);
      return;
    }
    go(workspacePath(next));
    setQuery('');
    setWebsiteFilter('all');
    setMobile(false);
    window.scrollTo({top: 0, left: 0, behavior: 'instant'});
  };
  if (!data)
    return (
      <div className="live-shell">
        <header>
          <Link className="brand" href="/workspace">
            <Image src="/logo.svg" alt="" width={35} height={35} />
            <span>IHHN DevDesk.</span>
          </Link>
          <Link className="button secondary" href="/login">
            Back to sign in
          </Link>
        </header>
        <main>
          {loading ? (
            <section className="card padded row">
              <LoaderCircle size={18} className="spin" />
              Loading your workspace…
            </section>
          ) : (
            <section className="card padded">
              <h2>Unable to open your workspace</h2>
              <p role="alert" className="muted">
                {error}
              </p>
              <div className="row" style={{marginTop: 20}}>
                <button
                  className="button primary"
                  onClick={() => {
                    setLoading(true);
                    load();
                  }}
                >
                  Try again
                </button>
                <Link className="button secondary" href="/login">
                  Sign in again
                </Link>
              </div>
            </section>
          )}
        </main>
      </div>
    );
  const canAddWebsites = ['administrator', 'manager'].includes(data.profile.role);
  // The open website, from /websites/<id> or the SEO pages' ?website=<id>.
  const crumbSiteId =
    page === 'Websites'
      ? selectedWebsite
      : ['SEO reports', 'Website features'].includes(page)
        ? searchParams.get('website')
        : null;
  const crumbSite = crumbSiteId ? data.websites.find(w => w.id === crumbSiteId)?.name : undefined;
  const memberName = (id: string | null) =>
    data.members.find(m => m.id === id)?.display_name || (id ? 'Former team member' : 'Unassigned');
  const siteName = (id: string) => data.websites.find(s => s.id === id)?.name || 'Website';
  const taskSites = (task: Task) => data.taskWebsites.filter(l => l.task_id === task.id).map(l => l.website_id);
  const myPending = data.assignments.filter(a => a.recipient_id === data.profile.id);
  const filteredTasks = !!query || websiteFilter !== 'all';
  const websites = data.websites.filter(
    s =>
      (websiteView === 'archived'
        ? !!s.archived_at || s.status === 'archived'
        : !s.archived_at && s.status !== 'archived') &&
      `${s.name} ${s.country} ${s.canonical_url}`.toLowerCase().includes(query.toLowerCase()),
  );
  function tasksTable(items: Task[]) {
    return items.length ? (
      <div className="table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th>Task name</th>
              <th>Websites</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Owner</th>
              <th>Due date</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map(task => {
              const pending = data!.assignments.find(a => a.task_id === task.id);
              return (
                <tr key={task.id}>
                  <td>
                    <button className="live-task-name" onClick={() => openTask(task)}>
                      <span>
                        <strong>{task.title}</strong>
                        <small>{task.category}</small>
                      </span>
                    </button>
                  </td>
                  <td>{taskSites(task).map(siteName).join(', ') || 'General work'}</td>
                  <td>
                    <span className={`badge ${pending ? 'pending' : statusClass(task.progress)}`}>
                      {pending && !task.assignee_id ? 'Pending acceptance' : statusName(task.progress)}
                    </span>
                  </td>
                  <td>
                    <span className={`priority ${task.priority}`}>⚑ {statusName(task.priority)}</span>
                  </td>
                  <td>
                    {task.assignee_id ? (
                      <span>
                        {memberName(task.assignee_id)}
                        {pending && (
                          <small className="block">Handover pending: {memberName(pending.recipient_id)}</small>
                        )}
                      </span>
                    ) : pending ? (
                      <span title="Not yet accepted">Requested: {memberName(pending.recipient_id)}</span>
                    ) : (
                      'Unassigned'
                    )}
                  </td>
                  <td>
                    <DueDate
                      date={task.due_date}
                      today={workspaceDate(data!.workspace.timezone)}
                      open={!['completed', 'cancelled'].includes(task.progress)}
                      empty="—"
                    />
                  </td>
                  <td>
                    <button className="icon-button" aria-label={`Open ${task.title}`} onClick={() => openTask(task)}>
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">
        <ListTodo size={26} />
        <h3>{filteredTasks ? 'No matching tasks' : 'Make room for your next step'}</h3>
        <p>
          {filteredTasks
            ? 'Try another filter or clear the current filters.'
            : 'Create a task, choose an owner, and connect it to your websites.'}
        </p>
        <button className="button primary" style={{marginTop: 18}} onClick={() => setDialog('task')}>
          <Plus size={15} />
          Create task
        </button>
      </div>
    );
  }
  return (
    <div className="app-shell connected-app">
      <ConfirmHost />
      <a className="skip-link" href="#workspace-main">
        Skip to content
      </a>
      <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}>
        <Link
          className="brand"
          href="/workspace"
          onClick={event => {
            event.preventDefault();
            navigate('Overview');
          }}
        >
          <Image src="/logo.svg" width={35} height={35} alt="" />
          <span>
            IHHN DevDesk<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-icon">{initials(data.workspace.name)}</span>
          <span>
            <strong>{data.workspace.name}</strong>
            <small>Connected workspace</small>
          </span>
        </div>
        <div className="nav-groups">
          <button className="button secondary sidebar-create" onClick={() => setDialog('task')}>
            <Plus size={16} /> New task
          </button>
          <div className="nav-label">WORKSPACE</div>
          {(
            [
              ['Overview', LayoutDashboard],
              ['Websites', Globe2],
              ['Team tasks', ListTodo],
              ['SEO reports', SearchCheck],
              ['Website features', SlidersHorizontal],
              ['Team & roles', Users],
            ] as const
          )
            .filter(([label]) => label !== 'Team & roles' || data.profile.role === 'administrator')
            .map(([label, Icon]) => (
              <button
                key={label}
                className={`nav-item ${page === label ? 'active' : ''}`}
                onClick={() => navigate(label)}
              >
                <Icon size={18} />
                <span>{pageLabel(label)}</span>
              </button>
            ))}
          <details className="simple-more" open>
            <summary>More tools</summary>
            {(
              [
                ['My tasks', UserCheck],
                ['Notifications', Bell],
                ['Account', ShieldCheck],
              ] as const
            ).map(([label, Icon]) => (
              <button
                key={label}
                className={`nav-item ${page === label ? 'active' : ''}`}
                onClick={() => navigate(label)}
              >
                <Icon size={18} />
                <span>{pageLabel(label)}</span>
                {label === 'My tasks' && myPending.length > 0 && <em>{myPending.length}</em>}
              </button>
            ))}
          </details>
        </div>
        <div className="sidebar-bottom">
          <div className="live-connection">
            <i />
            <span>Workspace connected</span>
          </div>
          <button className="user-profile" onClick={() => navigate('Account')}>
            <span className="avatar purple">{initials(data.profile.display_name)}</span>
            <span>
              <strong>{data.profile.display_name}</strong>
              <small>{statusName(data.profile.role)}</small>
            </span>
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-toggle" aria-label="Toggle navigation" onClick={() => setMobile(!mobile)}>
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            {crumbSite ? (
              <>
                <span>{pageLabel(page)}</span>
                <ChevronRight size={13} />
                <strong>{crumbSite}</strong>
              </>
            ) : (
              <strong>{pageLabel(page)}</strong>
            )}
          </div>
          <div className="topbar-actions">
            <span className="workspace-date">
              {new Intl.DateTimeFormat('en', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                timeZone: data.workspace.timezone,
              }).format(new Date())}
            </span>
            <button
              className="icon-button notification-bell"
              aria-label={`Notifications, ${unread} unread`}
              onClick={() => navigate('Notifications')}
            >
              <Bell size={18} />
              {unread > 0 && <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
            <button className="icon-button" aria-label="Refresh workspace" onClick={load}>
              <RefreshCw size={17} />
            </button>
            <button className="button secondary" onClick={logout}>
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </header>
        <main id="workspace-main" tabIndex={-1} data-page={page}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{data.workspace.name}</div>
              <h1>{page === 'Overview' ? `Welcome, ${data.profile.display_name.split(' ')[0]}!` : pageLabel(page)}</h1>
              <p>
                {page === 'Overview'
                  ? 'Manage your websites, assign work, and track progress.'
                  : page === 'Websites'
                    ? 'All your websites in one place. Open linked tasks or add a new website.'
                    : page === 'Team tasks'
                      ? 'See what needs doing, who owns it, and when it is due.'
                      : page === 'Team & roles'
                        ? 'Add teammates and manage their access.'
                        : page === 'SEO reports'
                          ? 'Compare SEO implementation, ratings, audit dates, analytics and page speed.'
                          : page === 'Website features'
                            ? 'Compare all website capabilities, integrations, content and maintenance in one view.'
                            : page === 'Form builder'
                              ? 'Update website health with your fixed SEO form.'
                              : page === 'Account'
                                ? 'Your profile and workspace details.'
                                : 'Your work and updates.'}
              </p>
            </div>
            <div className="heading-actions">
              {canAddWebsites && page === 'Websites' && (
                <button className="button primary" onClick={() => setDialog('website')}>
                  <Plus size={15} />
                  Add website
                </button>
              )}
              {['Overview', 'Team tasks', 'My tasks'].includes(page) && (
                <button className="button primary" onClick={() => setDialog('task')}>
                  <Plus size={16} />
                  Create task
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="form-error live-error">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'Overview' && (
            <>
              <LiveDashboard
                data={data}
                onTasks={search => openWith('Team tasks', search)}
                onSeo={openSeo}
                onAudits={() => openWith('SEO reports', 'audit=due')}
              />

              {myPending.length > 0 && (
                <section className="simple-pending">
                  <span>
                    {myPending.length} task assignment{myPending.length === 1 ? '' : 's'} waiting for your response.
                  </span>
                  <button className="button secondary" onClick={() => navigate('My tasks')}>
                    Review assignments
                  </button>
                </section>
              )}
              {!data.websites.length && !data.tasks.length && (
                <section className="live-welcome card">
                  <div className="welcome-orbit">
                    <Globe2 size={31} />
                  </div>
                  <div>
                    <span className="eyebrow">A FRESH START</span>
                    <h2>Welcome to your shared orbit.</h2>
                    <p>
                      {canAddWebsites
                        ? 'Start by adding your first website. Then create a task and link it to the websites it supports.'
                        : 'Create your first task. Your administrator or manager can add websites to the registry.'}
                    </p>
                  </div>
                  <button className="button primary" onClick={() => setDialog(canAddWebsites ? 'website' : 'task')}>
                    Get started
                    <ArrowRight size={15} />
                  </button>
                </section>
              )}
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Recent tasks</h2>
                    <p>Latest records from your workspace</p>
                  </div>
                  <button className="text-button" onClick={() => navigate('Team tasks')}>
                    View all tasks
                    <ArrowRight size={14} />
                  </button>
                </div>
                {tasksTable(data.tasks.slice(0, 6))}
              </section>
            </>
          )}
          {page === 'Websites' && selectedWebsite && (
            <LiveWebsite
              key={selectedWebsite}
              id={selectedWebsite}
              data={data}
              onBack={() => openWebsite(null)}
              onChanged={load}
              onTask={openTask}
              onReports={() => openSeo(selectedWebsite)}
            />
          )}
          {page === 'Websites' && !selectedWebsite && (
            <>
              <div className="section-toolbar">
                <div className="row">
                  <strong>{websites.length} websites</strong>
                  <select
                    className="live-select"
                    aria-label="Website list"
                    value={websiteView}
                    onChange={e => setWebsiteView(e.target.value)}
                  >
                    <option value="active">Current websites</option>
                    <option value="archived">Archived websites</option>
                  </select>
                </div>
                <label className="live-search">
                  <Search size={15} />
                  <input
                    aria-label="Search websites"
                    placeholder="Search websites…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                  />
                </label>
              </div>
              {websites.length ? (
                <div className="website-grid">
                  {websites.map(site => (
                    <article className="card website-card" key={site.id}>
                      <div className="website-card-top">
                        <span className="live-site-icon">
                          <Globe2 size={24} />
                        </span>
                        {/* Active is green; maintenance and needs attention amber; inactive neutral. */}
                        <span className={`badge ${site.status === 'active' ? 'healthy' : statusClass(site.status)}`}>
                          {statusName(site.status)}
                        </span>
                      </div>
                      <h2>
                        <button className="website-name-button" onClick={() => openWebsite(site.id)}>
                          {site.name}
                        </button>
                      </h2>
                      <p>{site.country}</p>
                      <a
                        className="live-site-url"
                        href={/^https?:\/\//i.test(site.canonical_url) ? site.canonical_url : undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {site.canonical_url}
                        <ExternalLink size={12} />
                      </a>
                      <div className="website-metrics">
                        <span>
                          <small>CMS</small>
                          <strong>{site.cms || 'Not specified'}</strong>
                        </span>
                        <span>
                          <small>Linked tasks</small>
                          <strong>{data.taskWebsites.filter(l => l.website_id === site.id).length}</strong>
                        </span>
                      </div>
                      <footer>
                        <button className="text-button" onClick={() => openWebsite(site.id)}>
                          Manage website
                          <ArrowRight size={14} />
                        </button>
                        <button className="text-button" onClick={() => setDialog('task')}>
                          <Plus size={13} />
                          Create task
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <section className="card empty">
                  <Globe2 size={30} />
                  <h3>
                    {query
                      ? 'No matching websites'
                      : websiteView === 'archived'
                        ? 'No archived websites'
                        : 'Add your first website'}
                  </h3>
                  <p>
                    {query
                      ? 'Try searching by country or URL.'
                      : canAddWebsites
                        ? 'Keep the website URL, country, and CMS in one shared profile.'
                        : 'Ask your administrator or manager to add your website profiles.'}
                  </p>
                  {canAddWebsites && (
                    <button className="button primary" style={{marginTop: 18}} onClick={() => setDialog('website')}>
                      <Plus size={15} />
                      Add website
                    </button>
                  )}
                </section>
              )}
            </>
          )}
          {(page === 'Team tasks' || page === 'My tasks') && (
            <LiveTasks
              key={page}
              data={data}
              mine={page === 'My tasks'}
              onOpen={openTaskId}
              onChanged={load}
              onCreate={() => setDialog('task')}
            />
          )}
          {(page === 'SEO reports' || page === 'Website features') && (
            <LiveSeoHealth
              key={page}
              mode={page === 'Website features' ? 'features' : 'seo'}
              data={data}
              onChanged={load}
              onCreateTask={draft => {
                setSeoDraft(draft);
                setDialog('task');
              }}
            />
          )}
          {page === 'Form builder' && data.profile.role === 'administrator' && (
            <LiveSeoHealth mode="features" data={data} onChanged={load} />
          )}

          {page === 'Team & roles' && data.profile.role === 'administrator' && (
            <LiveTeam data={data} onChanged={load} />
          )}
          {page === 'Notifications' && <LiveNotifications onOpenTask={openTaskId} timezone={data.workspace.timezone} />}
          {page === 'Account' && (
            <div className="settings-grid">
              <section className="card padded">
                <h2>Your profile</h2>
                <div className="detail-grid">
                  <div>
                    <small>Display name</small>
                    <strong>{data.profile.display_name}</strong>
                  </div>
                  <div>
                    <small>Email</small>
                    <strong>{data.profile.email}</strong>
                  </div>
                  <div>
                    <small>Role</small>
                    <strong>{statusName(data.profile.role)}</strong>
                  </div>
                  <div>
                    <small>Workspace timezone</small>
                    <strong>{data.workspace.timezone}</strong>
                  </div>
                </div>
                <p className="muted">
                  Website creation is available to administrators and managers. All active members can create and assign
                  tasks.
                </p>
              </section>
              <section className="card padded">
                <h2>Team members</h2>
                {data.members.map(member => (
                  <div className="live-member-row" key={member.id}>
                    <span className="avatar purple">{initials(member.display_name)}</span>
                    <span>
                      <strong>
                        {member.display_name}
                        {member.id === data.profile.id ? ' (you)' : ''}
                      </strong>
                      <small>{statusName(member.role)}</small>
                    </span>
                  </div>
                ))}
                <p className="muted">
                  Only active workspace members can receive new assignments. Administrators can add members and manage
                  access under Team & roles.
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Image src="/logo.svg" width={14} height={14} alt="" />
              IHHN DevDesk · Your connected workspace
            </span>
            <span>{data.workspace.timezone}</span>
          </footer>
        </main>
      </div>
      {dialog && (
        <CreationDialog
          kind={dialog}
          draft={seoDraft}
          data={data}
          onClose={() => {
            setDialog(null);
            setSeoDraft(null);
          }}
          onSaved={async () => {
            setDialog(null);
            setSeoDraft(null);
            setMessage(dialog === 'website' ? 'Website added to your workspace.' : 'Task created and saved.');
            await load();
          }}
        />
      )}
      {selected && <LiveTaskPanel task={selected} data={data} onClose={() => closeTask()} onChanged={load} />}
      {message && (
        <div role="status" className="toast">
          <Check size={17} />
          {message}
          <button aria-label="Dismiss notification" onClick={() => setMessage('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function CreationDialog({
  kind,
  draft,
  data,
  onClose,
  onSaved,
}: {
  kind: 'website' | 'task';
  draft?: SeoTaskDraft | null;
  data: Workspace;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [review, setReview] = useState(false);
  const [assignee, setAssignee] = useState(data.profile.id);
  const busyRef = useRef(false);
  const close = async () => {
    if (busy) return;
    if (!dirty || (await confirmAction({title: 'Discard unsaved changes?', confirmLabel: 'Discard', danger: true})))
      onClose();
  };
  useDialog(close);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    setError('');
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) || '').trim();
    try {
      const input =
        kind === 'website'
          ? websiteInput({
              request_id: requestId,
              name: get('name'),
              country: get('country'),
              url: get('url'),
              cms: get('cms'),
            })
          : taskInput({
              request_id: requestId,
              title: get('title'),
              description: get('description'),
              category: get('category'),
              priority: get('priority'),
              due_date: get('due_date'),
              assignee_id: assignee || null,
              review_required: review,
              reviewer_id: get('reviewer_id') || null,
              website_ids: form.getAll('website_ids'),
            });
      busyRef.current = true;
      setBusy(true);
      await workspaceFetch(kind === 'website' ? '/api/websites' : '/api/tasks', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      setDirty(false);
      await onSaved();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to save. Please retry.');
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="live-form-title" data-live-dialog>
        <header>
          <div>
            <span className="eyebrow">{data.workspace.name.toUpperCase()}</span>
            <h2 id="live-form-title">{kind === 'website' ? 'Add a website' : 'Create a task'}</h2>
          </div>
          <button className="icon-button" aria-label="Close form" disabled={busy} onClick={close}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={submit} onChange={() => setDirty(true)}>
          <fieldset className="live-form-fieldset" disabled={busy}>
            <div className="modal-fields">
              {kind === 'website' ? (
                <>
                  <label className="field">
                    Website name *
                    <input name="name" required maxLength={150} placeholder="e.g. United Kingdom website" />
                  </label>
                  <label className="field">
                    Country / chapter *
                    <input name="country" required maxLength={100} placeholder="e.g. United Kingdom" />
                  </label>
                  <label className="field">
                    Canonical website URL *
                    <input name="url" required type="url" maxLength={2048} placeholder="https://your-website.org" />
                  </label>
                  <label className="field">
                    CMS
                    <input name="cms" maxLength={100} placeholder="e.g. WordPress, Webflow, or Custom" />
                  </label>
                  <p className="form-hint">
                    Use the public website address. Do not include passwords, API keys, tokens, or payment credentials.
                  </p>
                </>
              ) : (
                <>
                  <label className="field">
                    Task title *
                    <input
                      name="title"
                      defaultValue={draft?.title}
                      required
                      maxLength={200}
                      placeholder="What needs to be done?"
                    />
                  </label>
                  <label className="field">
                    Description
                    <textarea
                      name="description"
                      defaultValue={draft?.description}
                      maxLength={10000}
                      rows={3}
                      placeholder="Context, expected outcome, and any useful details…"
                    />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      Assign to
                      <select value={assignee} onChange={event => setAssignee(event.target.value)}>
                        <option value="">Unassigned</option>
                        {data.members
                          .filter(member => member.active !== false)
                          .map(member => (
                            <option key={member.id} value={member.id}>
                              {member.display_name}
                              {member.id === data.profile.id ? ' (you)' : ''}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="field">
                      Due date
                      <input name="due_date" type="date" />
                    </label>
                  </div>
                  <p className="form-hint">
                    {assignee === data.profile.id
                      ? 'Self-assigned tasks are accepted immediately.'
                      : assignee
                        ? 'Your teammate must accept before becoming the task owner.'
                        : 'An unassigned task remains available for later assignment.'}
                  </p>
                  <fieldset className="site-choices">
                    <legend>Related websites (optional)</legend>
                    {data.websites
                      .filter(site => !site.archived_at && site.status !== 'archived')
                      .map(site => (
                        <label key={site.id}>
                          <input
                            name="website_ids"
                            type="checkbox"
                            value={site.id}
                            defaultChecked={site.id === draft?.websiteId}
                          />
                          {site.name}
                        </label>
                      ))}
                    {draft && !data.websites.some(w => w.id === draft.websiteId) && (
                      <label>
                        <input name="website_ids" type="checkbox" value={draft.websiteId} defaultChecked />
                        {draft.websiteName}
                      </label>
                    )}
                    {!data.websites.length && !draft && (
                      <span className="form-hint">No websites yet. You can still create a general task.</span>
                    )}
                  </fieldset>
                  <details className="simple-task-options">
                    <summary>More options: category, priority and review</summary>
                    <div>
                      <div className="form-row">
                        <label className="field">
                          Category *
                          <select name="category" defaultValue={draft ? 'SEO' : 'Development'}>
                            {['Development', 'Bug fix', 'SEO', 'Content', 'Maintenance', 'Meeting', 'General'].map(
                              category => (
                                <option key={category}>{category}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label className="field">
                          Priority *
                          <select name="priority" defaultValue="medium">
                            {['low', 'medium', 'high', 'urgent'].map(priority => (
                              <option key={priority} value={priority}>
                                {statusName(priority)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={review}
                          disabled={data.members.filter(m => m.active !== false).length < 2}
                          onChange={event => setReview(event.target.checked)}
                        />
                        Require independent review
                      </label>
                      {data.members.filter(m => m.active !== false).length < 2 && (
                        <p className="form-hint">Independent review needs another active team member.</p>
                      )}
                      {review && (
                        <label className="field">
                          Reviewer *
                          <select name="reviewer_id" required>
                            <option value="">Select a reviewer</option>
                            {data.members
                              .filter(member => member.active !== false && member.id !== assignee)
                              .map(member => (
                                <option key={member.id} value={member.id}>
                                  {member.display_name}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                    </div>
                  </details>
                </>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
            </div>
          </fieldset>
          <footer>
            <button className="button secondary" type="button" disabled={busy} onClick={close}>
              Cancel
            </button>
            <button className="button primary" disabled={busy} type="submit">
              {busy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}{' '}
              {busy ? 'Saving…' : kind === 'website' ? 'Add website' : 'Create task'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
