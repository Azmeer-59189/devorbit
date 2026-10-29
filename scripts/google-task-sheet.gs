// Paste into Extensions > Apps Script in the connected Google Sheet.
// Only the sheet-sync key belongs here; never paste a Supabase service key.
const TASK_HEADERS = [
  'Task ID',
  'Title',
  'Website',
  'Website 2',
  'Website 3',
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
      const headers = sheet.getRange(1, 1, 1, TASK_HEADERS.length).getDisplayValues()[0];
      if (headers.some((v, i) => v !== TASK_HEADERS[i]))
        throw new Error(member + ': restore the original task column headers before syncing.');
      if (sheet.getLastRow() > 5001) throw new Error(member + ': at most 5,000 rows per tab.');
      const values =
        sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TASK_HEADERS.length).getValues() : [];
      values.forEach((cells, index) => {
        if (cells.every(v => v === '')) return;
        const location = member + ' row ' + (index + 2) + ': ';
        if (!String(cells[1]).trim()) throw new Error(location + 'enter a title, or clear the whole row.');
        const websites = [cells[2], cells[3], cells[4]].map(v => String(v).trim()).filter(Boolean);
        if (websites.some(w => !websiteOptions.has(w)))
          throw new Error(location + 'choose websites from the dropdown; typed names must match the registry.');
        if (!cells[0]) {
          const current = sheet.getRange(index + 2, 1, 1, 2).getValues()[0];
          if (current[0] || current[1] !== cells[1]) throw new Error('Tasks changed while syncing. Please sync again.');
          cells[0] = Utilities.getUuid();
          sheet.getRange(index + 2, 1).setValue(cells[0]);
        }
        if (ids.has(String(cells[0])))
          throw new Error(location + 'duplicate Task ID. Move the whole row between tabs instead of copying it.');
        ids.add(String(cells[0]));
        const cell = i =>
          cells[i] instanceof Date
            ? Utilities.formatDate(cells[i], book.getSpreadsheetTimeZone(), 'yyyy-MM-dd')
            : String(cells[i]).trim();
        rows.push({
          id: cell(0),
          title: cell(1),
          assignee: member,
          websites: [...new Set(websites)].join('; '),
          priority: cell(5),
          status: cell(6),
          created_date: cell(7),
          completed_date: cell(8),
          archived: cell(9),
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
