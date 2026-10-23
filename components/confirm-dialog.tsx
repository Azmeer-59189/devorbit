'use client';
import {useEffect, useRef, useState} from 'react';
import {useDialog} from '@/components/live-dialog';

type Request = {
  title: string;
  message?: string;
  confirmLabel: string;
  /** Red confirm button, for actions such as cancelling or archiving. */
  danger?: boolean;
  /** Set to ask for a required written answer instead of a yes/no. */
  inputLabel?: string;
  resolve: (value: string | boolean) => void;
};

let show: ((request: Request) => void) | null = null;

/**
 * Asks the user to confirm in an in-app dialog; resolves true when confirmed. Falls back
 * to the browser's confirm box when no ConfirmHost is mounted.
 */
export function confirmAction(options: {title: string; message?: string; confirmLabel?: string; danger?: boolean}) {
  const open = show;
  if (!open) return Promise.resolve(window.confirm(options.title));
  return new Promise<boolean>(resolve =>
    open({confirmLabel: 'Confirm', ...options, resolve: value => resolve(value === true)}),
  );
}

/** Asks for a required written answer, such as a reason; resolves null when cancelled. */
export function promptText(options: {title: string; label: string; message?: string; confirmLabel?: string}) {
  const open = show;
  if (!open) return Promise.resolve(window.prompt(options.title)?.trim() || null);
  return new Promise<string | null>(resolve =>
    open({
      confirmLabel: 'Continue',
      ...options,
      inputLabel: options.label,
      resolve: value => resolve(typeof value === 'string' ? value : null),
    }),
  );
}

/** Mount once inside the workspace; renders the pending confirmation, if any. */
export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const current = useRef<Request | null>(null);
  useEffect(() => {
    show = next => {
      // A newer question replaces an unanswered one, which counts as cancelled.
      current.current?.resolve(false);
      current.current = next;
      setRequest(next);
    };
    return () => {
      show = null;
    };
  }, []);
  if (!request) return null;
  const done = (value: string | boolean) => {
    current.current = null;
    setRequest(null);
    request.resolve(value);
  };
  return <ConfirmDialog key={request.title} request={request} done={done} />;
}

function ConfirmDialog({request, done}: {request: Request; done: (value: string | boolean) => void}) {
  const [text, setText] = useState('');
  const cancel = () => done(false);
  useDialog(cancel);
  return (
    <div className="overlay" onMouseDown={event => event.target === event.currentTarget && cancel()}>
      <section
        className="modal confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={request.message ? 'confirm-message' : undefined}
        data-live-dialog
      >
        <form
          onSubmit={event => {
            event.preventDefault();
            if (request.inputLabel) {
              if (text.trim()) done(text.trim());
            } else done(true);
          }}
        >
          <h2 id="confirm-title">{request.title}</h2>
          {request.message && <p id="confirm-message">{request.message}</p>}
          {request.inputLabel && (
            <label className="field">
              {request.inputLabel}
              <textarea required maxLength={2000} rows={3} value={text} onChange={e => setText(e.target.value)} />
            </label>
          )}
          <footer>
            <button type="button" className="button secondary" onClick={cancel}>
              Cancel
            </button>
            <button
              type="submit"
              className={`button ${request.danger ? 'danger' : 'primary'}`}
              disabled={!!request.inputLabel && !text.trim()}
            >
              {request.confirmLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
