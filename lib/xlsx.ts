/**
 * Minimal dependency-free .xlsx writer for exports. Text is always written as an
 * inline string, never a formula, so exported data cannot execute in a
 * spreadsheet. YYYY-MM-DD and YYYY-MM-DD HH:MM strings become real Excel dates;
 * finite numbers stay numeric. The header row is bold, frozen and filterable.
 */
export type Cell = string | number | boolean | null | undefined;
export type Sheet = {name: string; rows: Record<string, Cell>[]};

const encoder = new TextEncoder();
const crcTable = Array.from({length: 256}, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Stored (uncompressed) ZIP archive; every reader, including Excel, accepts it. */
function zip(files: {name: string; data: Uint8Array}[]) {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const header = (signature: number, size: number) => {
      const bytes = new Uint8Array(size + name.length);
      const view = new DataView(bytes.buffer);
      view.setUint32(0, signature, true);
      return {bytes, view};
    };
    const local = header(0x04034b50, 30);
    local.view.setUint16(4, 20, true); // version needed
    local.view.setUint16(12, 0x21, true); // 1980-01-01, a fixed date keeps output reproducible
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, file.data.length, true);
    local.view.setUint32(22, file.data.length, true);
    local.view.setUint16(26, name.length, true);
    local.bytes.set(name, 30);
    const entry = header(0x02014b50, 46);
    entry.view.setUint16(4, 20, true);
    entry.view.setUint16(6, 20, true);
    entry.view.setUint16(14, 0x21, true);
    entry.view.setUint32(16, crc, true);
    entry.view.setUint32(20, file.data.length, true);
    entry.view.setUint32(24, file.data.length, true);
    entry.view.setUint16(28, name.length, true);
    entry.view.setUint32(42, offset, true);
    entry.bytes.set(name, 46);
    parts.push(local.bytes, file.data);
    central.push(entry.bytes);
    offset += local.bytes.length + file.data.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const bytes of [...parts, ...central, end]) {
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}

const escape = (text: string) =>
  text
    // Characters XML 1.0 cannot carry, including unpaired surrogates.
    .replace(
      /[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,
      '',
    )
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function column(index: number) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}
/** Excel serial day for a calendar date or minute-precision timestamp, or null. */
export function excelDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, y, m, d, hh = '0', mm = '0'] = match;
  const time = Date.UTC(+y, +m - 1, +d, +hh, +mm);
  const check = new Date(time);
  if (check.getUTCFullYear() !== +y || check.getUTCMonth() !== +m - 1 || check.getUTCDate() !== +d || +hh > 23)
    return null;
  return (time - Date.UTC(1899, 11, 30)) / 86400000;
}
// Style indexes in styles.xml below.
const DATE = 1,
  DATETIME = 2,
  HEADER = 3;
function cell(ref: string, value: Cell, header = false) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const text = String(value);
  const serial = header ? null : excelDate(text);
  if (serial !== null) return `<c r="${ref}" s="${text.length > 10 ? DATETIME : DATE}"><v>${serial}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${header ? ` s="${HEADER}"` : ''}><is><t xml:space="preserve">${escape(text.slice(0, 32767))}</t></is></c>`;
}
function worksheet(rows: Record<string, Cell>[]) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const widths = keys.map((key, i) => {
    const longest = Math.max(key.length, ...rows.slice(0, 200).map(r => String(r[key] ?? '').length));
    return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(10, longest + 2))}" customWidth="1"/>`;
  });
  const lines = [keys.map((key, i) => cell(column(i) + 1, key, true)).join('')].concat(
    rows.map((row, r) => keys.map((key, i) => cell(column(i) + (r + 2), row[key])).join('')),
  );
  const last = keys.length ? `${column(keys.length - 1)}${rows.length + 1}` : 'A1';
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (widths.length ? `<cols>${widths.join('')}</cols>` : '') +
    `<sheetData>${lines.map((cells, r) => `<row r="${r + 1}">${cells}</row>`).join('')}</sheetData>` +
    (keys.length ? `<autoFilter ref="A1:${last}"/>` : '') +
    '</worksheet>'
  );
}
function sheetNames(sheets: Sheet[]) {
  const used = new Set<string>();
  return sheets.map((sheet, i) => {
    const base =
      sheet.name
        .replace(/[\\/?*[\]:]/g, ' ')
        .trim()
        .slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());
    return name;
  });
}

export function xlsx(sheets: Sheet[]) {
  const names = sheetNames(sheets);
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      xml +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        names
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      xml +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      xml +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names.map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets><definedNames>' +
        sheets
          .map((sheet, i) =>
            sheet.rows.length
              ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escape(names[i].replaceAll("'", "''"))}'!$A$1:$${column(Object.keys(sheet.rows[0]).length - 1)}$${sheet.rows.length + 1}</definedName>`
              : '',
          )
          .join('') +
        '</definedNames></workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      xml +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ],
    [
      'xl/styles.xml',
      xml +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ...sheets.map((sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, worksheet(sheet.rows)]),
  ];
  return zip(files.map(([name, text]) => ({name, data: encoder.encode(text)})));
}
