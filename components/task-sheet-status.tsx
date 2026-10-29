'use client';
import {useEffect, useState} from 'react';
import {workspaceFetch} from '@/lib/workspace-client';
export default function TaskSheetStatus({timezone, onSynced}: {timezone: string; onSynced?: () => void}) {
  const [state, setState] = useState<{
    connected: boolean;
    url: string;
    last_synced_at: string | null;
    setup_pending: boolean;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let previous: string | null | undefined;
    const refresh = () =>
      workspaceFetch('/api/integrations/task-sheet')
        .then(result => {
          if (cancelled) return;
          setState(result);
          if (previous !== undefined && result.last_synced_at && previous !== result.last_synced_at) onSynced?.();
          previous = result.last_synced_at;
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [onSynced]);
  if (!state?.connected) return null;
  return (
    <div className="info-callout">
      <a href={state.url} target="_blank" rel="noreferrer">
        Update tasks in Google Sheets
      </a>
      <span className="block form-hint">
        {state.setup_pending
          ? 'Apply the task sheet migration to finish setup.'
          : state.last_synced_at
            ? `Last task sync: ${new Date(state.last_synced_at).toLocaleString('en-GB', {timeZone: timezone})}. Sync runs about every five minutes.`
            : 'Waiting for the first task sync. Connect the Apps Script in your Google Sheet.'}
      </span>
    </div>
  );
}
