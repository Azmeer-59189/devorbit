'use client';
import {useEffect, useState} from 'react';
import {Bell, CheckCheck, ChevronRight, LoaderCircle} from 'lucide-react';
import {workspaceFetch} from '@/lib/workspace-client';
type Notice = {id: string; task_id: string; title: string; kind: string; read_at: string | null; created_at: string};
export default function LiveNotifications({onOpenTask}: {onOpenTask: (id: string) => void}) {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    workspaceFetch('/api/notifications')
      .then(result => {
        if (!cancelled) setItems(result.notifications);
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
  }, []);
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
          <p>{items.filter(item => !item.read_at).length} unread · Latest 100 updates</p>
        </div>
        <button className="text-button" disabled={busy} onClick={() => mark(null)}>
          <CheckCheck size={16} />
          Mark all read
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
        items.map(item => (
          <button
            key={item.id}
            className={`notification-row ${item.read_at ? 'read' : ''}`}
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
              <p>{new Date(item.created_at).toLocaleString()}</p>
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
    </section>
  );
}
