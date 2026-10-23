'use client';
import {FormEvent, useEffect, useRef, useState} from 'react';
import {LoaderCircle, Plus, RefreshCw, ShieldCheck} from 'lucide-react';
import {Workspace, Member, initials, statusName} from '@/lib/live-types';
import {workspaceFetch} from '@/lib/workspace-client';
import {confirmAction} from '@/components/confirm-dialog';
import {memberInput} from '@/lib/live-validation';
import LiveInvitations from '@/components/live-invitations';
type TeamMember = Member & {email: string; active: boolean};
export default function LiveTeam({data, onChanged}: {data: Workspace; onChanged: () => Promise<void>}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const pending = useRef<{key: string; id: string} | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch('/api/team')
      .then(result => {
        if (!cancelled) {
          setMembers(result.members);
          setError('');
        }
      })
      .catch(error => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  async function save(event: FormEvent<HTMLFormElement>, action: 'add' | 'update', member?: TeamMember) {
    event.preventDefault();
    if (saving.current) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const role = String(form.get('role'));
    const active = form.get('active') === 'on';
    if (
      action === 'update' &&
      (!active || role !== member?.role) &&
      !(await confirmAction({
        title: `Change access for ${member?.display_name}?`,
        message: active
          ? `Their role becomes ${role.replaceAll('_', ' ')}.`
          : 'They will lose access to this workspace.',
        confirmLabel: 'Save access',
        danger: !active,
      }))
    )
      return;
    setError('');
    setMessage('');
    try {
      const values = {
        action,
        member_id: member?.id,
        display_name: form.get('display_name'),
        email: form.get('email'),
        role,
        active: action === 'add' ? true : active,
      };
      const key = JSON.stringify(values);
      if (pending.current?.key !== key) pending.current = {key, id: crypto.randomUUID()};
      const input = memberInput({request_id: pending.current.id, ...values});
      saving.current = true;
      setBusy(true);
      await workspaceFetch('/api/team', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(input),
      });
      if (action === 'add') element.reset();
      setMessage(
        action === 'add'
          ? 'Team member added. They can now sign in and receive tasks.'
          : 'Team access updated. History has been preserved.',
      );
      pending.current = null;
      setReload(n => n + 1);
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="team-success" role="status">
          {message}
        </div>
      )}
      <LiveInvitations />
      <details className="existing-member-tools">
        <summary>Add an existing account manually</summary>
        <div className="info-callout">
          <ShieldCheck size={22} />
          <div>
            <strong>Two steps to add a teammate</strong>
            <p>
              First create their login in Supabase → Authentication → Users → Add user → Create user. Then enter that
              same email below to grant access to this workspace. They sign in using the password set privately in
              Supabase. Public sign-up stays disabled.
            </p>
          </div>
        </div>
        <div className="team-admin-grid">
          <section className="card">
            <div className="card-heading">
              <div>
                <h2>Add team member</h2>
                <p>Give a teammate access to your workspace</p>
              </div>
              <Plus size={18} />
            </div>
            <form className="team-add-form" onSubmit={event => save(event, 'add')}>
              <fieldset className="live-form-fieldset" disabled={busy}>
                <label className="field">
                  Full name *<input required name="display_name" maxLength={150} placeholder="Teammate’s name" />
                </label>
                <label className="field">
                  Login email *
                  <input required name="email" type="email" maxLength={254} placeholder="teammate@organization.org" />
                </label>
                <label className="field">
                  Access level *
                  <select name="role" defaultValue="developer">
                    <option value="developer">Developer</option>
                    <option value="manager">Manager</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </label>
                <p className="form-hint">
                  Developers create and work on tasks. Managers also manage website profiles. Administrators manage team
                  access and templates.
                </p>
                <button className="button primary" type="submit">
                  {busy ? <LoaderCircle className="spin" size={15} /> : <Plus size={15} />}Add member
                </button>
              </fieldset>
            </form>
          </section>
        </div>
      </details>
      <div className="team-admin-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Team & roles</h2>
              <p>{members.length} members · Deactivation preserves historical records</p>
            </div>
            <button
              className="icon-button"
              aria-label="Refresh team"
              onClick={() => {
                setLoading(true);
                setReload(n => n + 1);
              }}
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {loading ? (
            <div className="padded row">
              <LoaderCircle className="spin" size={18} />
              Loading team…
            </div>
          ) : (
            members.map(member => (
              <form
                className="team-member-form"
                key={`${member.id}-${member.role}-${member.active}`}
                onSubmit={event => save(event, 'update', member)}
              >
                <div className="live-member-row">
                  <span className="avatar purple">{initials(member.display_name)}</span>
                  <span>
                    <strong>
                      {member.display_name}
                      {member.id === data.profile.id ? ' (you)' : ''}
                    </strong>
                    <small>{member.email}</small>
                  </span>
                  <span className={`badge ${member.active ? 'healthy' : 'cancelled'}`}>
                    {member.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <fieldset
                  className="team-access-controls live-form-fieldset"
                  disabled={busy || member.id === data.profile.id}
                >
                  <label className="field">
                    Role
                    <select name="role" defaultValue={member.role}>
                      {['developer', 'manager', 'administrator'].map(role => (
                        <option key={role} value={role}>
                          {statusName(role)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-field">
                    <input name="active" type="checkbox" defaultChecked={member.active} />
                    Active
                  </label>
                  <button className="button secondary" type="submit">
                    Save access
                  </button>
                </fieldset>
                {member.id === data.profile.id && (
                  <p className="form-hint">Your own administrator access is protected.</p>
                )}
              </form>
            ))
          )}
        </section>
      </div>
    </>
  );
}
