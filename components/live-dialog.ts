'use client';
import {useEffect, useRef} from 'react';

// Open dialogs, newest last. Only the newest handles Escape and Tab, so a confirmation
// opened over a form closes on its own instead of closing both.
const openDialogs: symbol[] = [];

export function useDialog(close: () => void) {
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const token = Symbol('dialog');
    openDialogs.push(token);
    const previous = document.activeElement as HTMLElement | null;
    // The newest dialog element is the one that just mounted.
    const dialog = Array.from(document.querySelectorAll<HTMLElement>('[data-live-dialog]')).at(-1);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() =>
      dialog?.querySelector<HTMLElement>('input,textarea,select,button')?.focus(),
    );
    const onKey = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== token) return;
      if (event.key === 'Escape') closeRef.current();
      if (event.key === 'Tab' && dialog) {
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>('button,input,textarea,select,a[href]'),
        ).filter(el => !el.hasAttribute('disabled'));
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
      cancelAnimationFrame(frame);
      document.body.style.overflow = oldOverflow;
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, []);
}
