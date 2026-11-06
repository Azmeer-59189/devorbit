// Paste into Extensions > Apps Script in the connected Google Sheet.
// Only the sheet-sync key belongs here; never paste a Supabase service key.
const TASK_HEADERS = [
  'Task ID',
  'Title',
  'Websites',
  'Priority',
  'Status',
  'Created date',
  'Completed date',
  'Archived',
];
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('DevDesk')
    .addItem('Connect dashboard', 'connectDevDesk')
    .addItem('Sync now', 'syncDevDeskTasks')
    .addItem('Stop automatic sync', 'stopDevDeskSync')
    .addToUi();
}
function connectDevDesk() {
  const ui = SpreadsheetApp.getUi();
  const url = ui.prompt(
    'Dashboard URL',
    'Enter your production URL, e.g. https://devorbit-eight.vercel.app',
    ui.ButtonSet.OK_CANCEL,
  );
  if (url.getSelectedButton() !== ui.Button.OK) return;
  const base = url.getResponseText().trim().replace(/\/$/, '');
  if (!/^https:\/\/[a-zA-Z0-9.-]+$/.test(base)) throw new Error('Use an HTTPS dashboard URL without a path.');
  const key = ui.prompt(
    'Sheet sync key',
    'Enter TASK_SHEET_SYNC_SECRET from your server environment settings.',
    ui.ButtonSet.OK_CANCEL,
  );
  if (key.getSelectedButton() !== ui.Button.OK) return;
  if (key.getResponseText().trim().length < 32) throw new Error('The key must be at least 32 characters.');
  PropertiesService.getScriptProperties().setProperties({
    DEVDESK_URL: base,
    DEVDESK_SYNC_KEY: key.getResponseText().trim(),
    DEVDESK_SHEET_ID: SpreadsheetApp.getActiveSpreadsheet().getId(),
  });
  syncDevDeskTasks();
  stopDevDeskSync();
  ScriptApp.newTrigger('syncDevDeskTasks').timeBased().everyMinutes(5).create();
  ui.alert('Connected. Task changes will sync about every five minutes. You can also use DevDesk > Sync now.');
}
function stopDevDeskSync() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'syncDevDeskTasks')
    .forEach(t => ScriptApp.deleteTrigger(t));
}
function syncDevDeskTasks() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  let log;
  try {
    const config = PropertiesService.getScriptProperties().getProperties();
    if (!config.DEVDESK_URL || !config.DEVDESK_SYNC_KEY || !config.DEVDESK_SHEET_ID)
      throw new Error('Use DevDesk > Connect dashboard first.');
    const book = SpreadsheetApp.openById(config.DEVDESK_SHEET_ID);
    log = book.getSheetByName('Sync') || book.insertSheet('Sync');
    const reference = book.getSheetByName('Team and websites');
    if (!reference || reference.getLastRow() < 2) throw new Error('The team reference tab is missing.');
    const members = reference
      .getRange(2, 1, reference.getLastRow() - 1, 1)
      .getDisplayValues()
      .flat()
      .map(v => v.trim())
      .filter(Boolean);
    if (!members.length || new Set(members).size !== members.length)
      throw new Error('Team member names must be present and unique.');
    const websiteOptions = new Set(
      reference
        .getRange(2, 3, reference.getLastRow() - 1, 1)
        .getDisplayValues()
        .flat()
        .map(v => v.trim())
        .filter(Boolean),
    );
    const rows = [];
    const ids = new Set();
    for (const member of members) {
      const sheet = book.getSheetByName(member);
      if (!sheet) throw new Error('Missing task tab for ' + member + '. Restore it before syncing.');
      const width = sheet.getLastColumn();
      const headers = sheet
        .getRange(1, 1, 1, width)
        .getDisplayValues()[0]
        .map(v => v.trim());
      const columns = taskSheetColumns(headers, member);
      if (sheet.getLastRow() > 5001) throw new Error(member + ': at most 5,000 rows per tab.');
      const values = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues() : [];
      values.forEach((cells, index) => {
        if (cells.every(v => v === '')) return;
        const location = member + ' row ' + (index + 2) + ': ';
        if (!String(cells[columns.title]).trim()) throw new Error(location + 'enter a title, or clear the whole row.');
        const websites = taskSheetWebsites(columns.websites.map(i => cells[i]).join('; '), websiteOptions, location);
        if (!cells[columns.id]) {
          const current = sheet.getRange(index + 2, 1, 1, width).getValues()[0];
          if (current[columns.id] || current[columns.title] !== cells[columns.title])
            throw new Error('Tasks changed while syncing. Please sync again.');
          cells[columns.id] = Utilities.getUuid();
          sheet.getRange(index + 2, columns.id + 1).setValue(cells[columns.id]);
        }
        if (ids.has(String(cells[columns.id])))
          throw new Error(location + 'duplicate Task ID. Move the whole row between tabs instead of copying it.');
        ids.add(String(cells[columns.id]));
        const cell = i =>
          cells[i] instanceof Date
            ? Utilities.formatDate(cells[i], book.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
            : String(cells[i]).trim();
        rows.push({
          id: cell(columns.id),
          title: cell(columns.title),
          assignee: member,
          websites: [...new Set(websites)].join('; '),
          priority: cell(columns.priority),
          status: cell(columns.status),
          created_date: cell(columns.created),
          completed_date: cell(columns.completed),
          archived: cell(columns.archived),
        });
      });
    }
    if (rows.length > 5000) throw new Error('Use at most 5,000 tasks across the member tabs.');
    SpreadsheetApp.flush();
    let changed = 0;
    if (!rows.length) throw new Error('No tasks to sync. Existing dashboard tasks were kept.');
    for (let i = 0; i < rows.length; i += 200) {
      const response = UrlFetchApp.fetch(config.DEVDESK_URL + '/api/integrations/task-sheet', {
        method: 'post',
        contentType: 'application/json',
        headers: {Authorization: 'Bearer ' + config.DEVDESK_SYNC_KEY},
        payload: JSON.stringify({sheet_id: book.getId(), rows: rows.slice(i, i + 200)}),
        muteHttpExceptions: true,
      });
      let result;
      try {
        result = JSON.parse(response.getContentText());
      } catch (_) {
        throw new Error('Dashboard did not return a sync response (HTTP ' + response.getResponseCode() + ').');
      }
      if (response.getResponseCode() !== 200) throw new Error(result.error || 'Dashboard rejected the sync.');
      changed += result.updated;
    }
    log.getRange('A1:B3').setValues([
      ['Last successful sync', new Date()],
      ['Updated tasks', changed],
      ['Latest error', ''],
    ]);
    log.getRange('B1').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  } catch (error) {
    if (log) log.getRange('A3:B3').setValues([['Latest error', String(error.message).slice(0, 1000)]]);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

// Google Sheets serializes multiple dropdown chips with commas. Legacy columns use semicolons.
function taskSheetWebsites(value, websiteOptions, location) {
  const selected = String(value)
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean);
  if (selected.some(w => w !== 'All websites' && !websiteOptions.has(w)))
    throw new Error(location + 'choose websites from the dropdown; typed names must match the registry.');
  return selected.includes('All websites') ? [...websiteOptions] : [...new Set(selected)];
}
function taskSheetColumns(headers, member) {
  const keys = {
    id: 'Task ID',
    title: 'Title',
    priority: 'Priority',
    status: 'Status',
    created: 'Created date',
    completed: 'Completed date',
    archived: 'Archived',
  };
  const columns = {};
  for (const key of Object.keys(keys)) {
    if (headers.filter(h => h === keys[key]).length !== 1)
      throw new Error(member + ': expected one "' + keys[key] + '" column.');
    columns[key] = headers.indexOf(keys[key]);
  }
  columns.websites = headers
    .map((h, i) => (['Websites', 'Website', 'Website 2', 'Website 3'].includes(h) ? i : -1))
    .filter(i => i >= 0);
  if (!columns.websites.length) throw new Error(member + ': add the Websites column.');
  return columns;
}
