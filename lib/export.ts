import {csv} from './csv';
import {xlsx, type Cell} from './xlsx';

export type ExportFormat = 'csv' | 'xlsx';

/** Encodes rows as a CSV (with BOM, so Excel reads UTF-8) or a single-sheet workbook. */
export function exportBlob(rows: Record<string, Cell>[], format: ExportFormat, sheet: string) {
  return format === 'csv'
    ? new Blob(['﻿' + csv(rows)], {type: 'text/csv;charset=utf-8'})
    : new Blob([xlsx([{name: sheet, rows}])], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
}

/** Starts a browser download such as devorbit-tasks-2026-10-16.xlsx. */
export function downloadRows(rows: Record<string, Cell>[], format: ExportFormat, name: string, date: string) {
  const url = URL.createObjectURL(exportBlob(rows, format, name));
  const a = document.createElement('a');
  a.href = url;
  a.download = `devorbit-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${date}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
