'use client';
import {useEffect, useState} from 'react';
import {Bell, CheckCheck, ChevronRight, LoaderCircle} from 'lucide-react';
import {workspaceFetch} from '@/lib/workspace-client';
type Notice = {id: string; task_id: string; title: string; kind: string; read_at: string | null; created_at: string};
export default function LiveNotifications({
  onOpenTask,
  timezone,
}: {
  onOpenTask: (id: string) => void;
  timezone: string;
}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [unread, setUnread] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch('/api/notifications')
      .then(result => {
        if (!cancelled) {
          setItems(result.notifications);
          setUnread(result.unread);
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
  }, [retry]);
  async function mark(id: string | null) {
    setBusy(true);
    setError('');
    try {
      await workspaceFetch('/api/notifications', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({id}),
      });
      setItems(current =>
        current.map(item => (id === null || item.id === id ? {...item, read_at: new Date().toISOString()} : item)),
      );
      setRetry(n => n + 1);
      window.dispatchEvent(new Event('notifications-changed'));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <div className="card-heading">
        <div>
          <h2>Notifications</h2>
          <p>{unread} unread · Latest 100 updates</p>
        </div>
        <button className="text-button" disabled={busy} onClick={() => mark(null)}>
          <CheckCheck size={16} />
          Mark all read
        </button>
      </div>
      <div className="section-toolbar padded">
        <label className="checkbox-field">
          <input type="checkbox" checked={unreadOnly} onChange={e => setUnreadOnly(e.target.checked)} />
          Unread only
        </label>
        <button className="button secondary" disabled={busy || loading} onClick={() => setRetry(n => n + 1)}>
          Refresh updates
        </button>
      </div>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {loading ? (
        <div className="padded row">
          <LoaderCircle className="spin" size={18} />
          Loading updates…
        </div>
      ) : items.length ? (
        items
          .filter(item => !unreadOnly || !item.read_at)
          .map(item => (
            <button
              key={item.id}
              className={`notification-row ${item.read_at ? 'read' : ''}`}
              disabled={busy}
              aria-label={`${item.read_at ? '' : 'Unread: '}${item.title}. Open task`}
              onClick={() => {
                mark(item.id);
                onOpenTask(item.task_id);
              }}
            >
              <span className="notification-symbol">
                <Bell size={19} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>
                  {item.kind.replaceAll('_', ' ')} ·{' '}
                  {new Date(item.created_at).toLocaleString('en-GB', {timeZone: timezone})}
                </p>
              </div>
              <ChevronRight size={17} />
            </button>
          ))
      ) : (
        !error && (
          <div className="empty">
            <Bell size={27} />
            <h3>You’re up to date</h3>
            <p>Assignment requests, review decisions, and mentions will appear here.</p>
          </div>
        )
      )}
      {!loading && unreadOnly && items.length > 0 && items.every(item => item.read_at) && (
        <p className="padded">No unread updates in the latest 100 notifications.</p>
      )}
    </section>
  );
}
