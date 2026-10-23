import {displayDate, dueHint} from '@/lib/dates';

/**
 * A task due date in short form ("Oct 21"), with how close it is for open work
 * ("2 days overdue", "Due tomorrow"). The exact date stays in the <time> element.
 */
export default function DueDate({
  date,
  today,
  open,
  inline = false,
  empty = 'No due date',
}: {
  date: string | null;
  today: string;
  /** Completed and cancelled work shows the date only. */
  open: boolean;
  /** Keep the hint on the same line, e.g. on board cards. */
  inline?: boolean;
  empty?: string;
}) {
  if (!date) return <span className="due-date due-empty">{empty}</span>;
  const hint = open ? dueHint(date, today) : '';
  return (
    <span className={`due-date${open && date < today ? ' overdue' : ''}`}>
      <time dateTime={date} title={date}>
        {inline && 'Due '}
        {displayDate(date, today)}
      </time>
      {/* Inline already starts with "Due", so "Due Oct 24 · tomorrow". */}
      {hint && (inline ? ` · ${hint.replace(/^Due /, '')}` : <small className="block due-hint">{hint}</small>)}
    </span>
  );
}
