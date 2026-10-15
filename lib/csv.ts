/**
 * Builds a CSV string with every cell quoted. Cells that a spreadsheet would
 * treat as a formula (=, +, -, @, or a leading tab/carriage return) are
 * prefixed with an apostrophe so exported data cannot execute.
 */
export function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const safe = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]|^[\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [keys.map(safe).join(','), ...rows.map(row => keys.map(key => safe(row[key])).join(','))].join('\r\n');
}
