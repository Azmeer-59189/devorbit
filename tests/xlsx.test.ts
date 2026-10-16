import {test} from 'node:test';
import assert from 'node:assert/strict';
import {crc32} from 'node:zlib';
import {excelDate, xlsx} from '../lib/xlsx';
import {exportBlob} from '../lib/export';

// Reads a stored (uncompressed) ZIP through its central directory and checks each CRC independently.
function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50);
  const files = new Map<string, string>();
  let at = view.getUint32(end + 16, true);
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const local = view.getUint32(at + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true);
    const data = bytes.subarray(start, start + size);
    assert.equal(crc32(data), view.getUint32(at + 16, true), `CRC of ${name}`);
    files.set(name, new TextDecoder().decode(data));
    at += 46 + nameLength;
  }
  return files;
}

test('workbooks are valid stored ZIPs with the required OpenXML parts', () => {
  const files = unzip(xlsx([{name: 'Tasks', rows: [{Task: 'One'}]}]));
  for (const part of [
    '[Content_Types].xml',
    '_rels/.rels',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
  ])
    assert.ok(files.has(part), part);
  assert.match(files.get('xl/workbook.xml')!, /<sheet name="Tasks" sheetId="1" r:id="rId1"\/>/);
});

test('cells are typed: text never becomes a formula, dates and numbers stay sortable', () => {
  const sheet = unzip(
    xlsx([
      {
        name: 'Data',
        rows: [
          {
            Text: '=HYPERLINK("http://evil","x")',
            Number: 42,
            Date: '2024-01-01',
            Stamp: '2024-01-01 12:00',
            Bad: '2024-02-30',
            Empty: null,
            Escaped: 'A & B <c> "d"\u0007',
          },
        ],
      },
    ]),
  ).get('xl/worksheets/sheet1.xml')!;
  assert.doesNotMatch(sheet, /<f>/);
  assert.match(
    sheet,
    /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;http:\/\/evil&quot;,&quot;x&quot;\)<\/t>/,
  );
  assert.match(sheet, /<c r="B2"><v>42<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" s="1"><v>45292<\/v><\/c>/);
  assert.match(sheet, /<c r="D2" s="2"><v>45292.5<\/v><\/c>/);
  assert.match(sheet, /<c r="E2" t="inlineStr">.*2024-02-30/);
  assert.doesNotMatch(sheet, /r="F2"/);
  assert.match(sheet, />A &amp; B &lt;c&gt; &quot;d&quot;<\/t>/);
  assert.match(sheet, /<c r="A1" t="inlineStr" s="3">/);
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:G2"\/>/);
});

test('date parsing rejects impossible calendar values', () => {
  assert.equal(excelDate('2024-01-01'), 45292);
  assert.equal(excelDate('1900-03-01'), 61);
  for (const value of ['2024-13-01', '2023-02-29', '2024-01-01 24:00', '20240101', 'soon'])
    assert.equal(excelDate(value), null);
});

test('sheet names are sanitized, truncated and unique; columns run past Z', () => {
  const wide = Object.fromEntries(Array.from({length: 28}, (_, i) => [`c${i}`, i]));
  const files = unzip(
    xlsx([
      {name: 'SEO: [health]/2026?', rows: [wide]},
      {name: 'seo  health 2026', rows: []},
      {name: 'x'.repeat(40), rows: []},
    ]),
  );
  const workbook = files.get('xl/workbook.xml')!;
  assert.match(workbook, /name="SEO   health  2026"/);
  assert.match(workbook, /name="x{31}"/);
  assert.match(files.get('xl/worksheets/sheet1.xml')!, /<c r="AB2"><v>27<\/v><\/c>/);
});

test('CSV exports start with a BOM and keep the formula guard', async () => {
  const bytes = new Uint8Array(await exportBlob([{a: '=1+1'}], 'csv', 'x').arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(new TextDecoder().decode(bytes), /"'=1\+1"/);
});
