// Bind this script to a private church-owned Google Sheet. See docs/groups.md.
// Public web requests have no administrative operations; admins use the Sheet menu.
const CP_REQUEST_HEADERS = ['id', 'publication', 'visibility', 'consent', 'title', 'description', 'requestor', 'requestedAt', 'status'];
const CP_INBOX_HEADERS = ['id', 'receivedAt', 'title', 'description', 'requestor', 'contact', 'allowedSharing', 'reviewStatus'];
const CP_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{43}$/;
const CP_UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Closet Prayer')
    .addItem('Configure group', 'configureGroup')
    .addItem('Add draft prayer', 'addDraftPrayer')
    .addItem('Publish selected requests', 'publishSelectedRequests')
    .addItem('Decline selected submissions', 'declineSelectedSubmissions')
    .addItem('Withdraw selected prayers', 'withdrawSelectedPrayers')
    .addItem('Mark selected prayers answered', 'answerSelectedPrayers')
    .addItem('Restrict selected prayers to group', 'restrictSelectedPrayers')
    .addToUi();
}

function configureGroup() {
  const ui = SpreadsheetApp.getUi();
  const prompt = ui.prompt('Configure group', 'Paste the private setup code generated in Closet Prayer > Settings > Prayer groups.', ui.ButtonSet.OK_CANCEL);
  if (prompt.getSelectedButton() !== ui.Button.OK) return;
  const config = JSON.parse(prompt.getResponseText());
  if (config.version !== 1 || !CP_UUID_PATTERN.test(config.groupId || '') ||
      !CP_TOKEN_PATTERN.test(config.memberToken || '') || !CP_TOKEN_PATTERN.test(config.submissionToken || '') ||
      config.memberToken === config.submissionToken) throw new Error('Invalid setup code.');
  const name = cpText_(config.name, 120, true);
  const properties = PropertiesService.getScriptProperties();
  const previous = properties.getProperty('CP_GROUP_ID');
  if (previous && previous !== config.groupId) throw new Error('This sheet already belongs to another group. Use a new spreadsheet for a new group.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  cpEnsureSheet_(sheet, 'Requests', CP_REQUEST_HEADERS);
  cpEnsureSheet_(sheet, 'Inbox', CP_INBOX_HEADERS);
  properties.setProperties({ CP_GROUP_ID: config.groupId.toLowerCase(), CP_GROUP_NAME: name,
    CP_SHEET_ID: sheet.getId(), CP_MEMBER_HASH: cpHash_(config.memberToken),
    CP_SUBMIT_HASH: cpHash_(config.submissionToken) });
  ui.alert('Group configured. Keep this spreadsheet private. Deploy the web app as yourself with access set to Anyone, then create invitations in Closet Prayer.');
}

function cpEnsureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (!sheet.getLastRow()) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  cpReadRows_(sheet, headers);
  return sheet;
}

function cpSheet_(name) {
  const id = PropertiesService.getScriptProperties().getProperty('CP_SHEET_ID');
  if (!id) throw new Error('Group is not configured.');
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw new Error('Missing group sheet.');
  return sheet;
}

function cpReadRows_(sheet, headers) {
  if (sheet.getLastRow() > 2001) throw new Error('Archive old rows before continuing.');
  const values = sheet.getRange(1, 1, Math.max(1, sheet.getLastRow()), headers.length).getValues();
  if (JSON.stringify(values[0]) !== JSON.stringify(headers)) throw new Error('The sheet columns have changed. Restore the template headers.');
  return values.slice(1).map((cells, index) => {
    const row = { sheetRow: index + 2 };
    headers.forEach((name, col) => { row[name] = cells[col]; });
    return row;
  });
}

function cpText_(value, limit, required) {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('Invalid text.');
  return value;
}

function cpCell_(value) {
  // Untrusted submissions must remain literal text, never spreadsheet formulas.
  return typeof value === 'string' && /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
}

function cpHash_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)).replace(/=+$/, '');
}

function cpCredentialMatches_(token, expected) {
  if (typeof token !== 'string' || !CP_TOKEN_PATTERN.test(token) || !expected) return false;
  const actual = cpHash_(token);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}

function cpGroup_() {
  const properties = PropertiesService.getScriptProperties();
  return { id: properties.getProperty('CP_GROUP_ID'), name: properties.getProperty('CP_GROUP_NAME') };
}

function cpResult_(data) {
  return Object.assign({ protocol: 'cp-group', version: 1, ok: true, group: cpGroup_() }, data);
}

function doGet() {
  return ContentService.createTextOutput('Closet Prayer group service. Use your invitation in the app.');
}

function doPost(event) {
  let result;
  try {
    const body = event && event.postData && event.postData.contents;
    if (typeof body !== 'string' || body.length > 20000) throw new Error('Invalid request.');
    result = cpHandleRequest_(JSON.parse(body));
  } catch (error) {
    // Do not return exception details or log request bodies containing credentials/prayers.
    result = { protocol: 'cp-group', version: 1, ok: false, code: 'service-error' };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function cpHandleRequest_(request) {
  const properties = PropertiesService.getScriptProperties();
  const deny = { protocol: 'cp-group', version: 1, ok: false, code: 'access-denied' };
  if (!request || request.protocol !== 'cp-group' || request.version !== 1 ||
      request.groupId !== properties.getProperty('CP_GROUP_ID')) return deny;
  if (request.action === 'sync') {
    if (!cpCredentialMatches_(request.token, properties.getProperty('CP_MEMBER_HASH'))) return deny;
    return cpSnapshot_(request.revision);
  }
  if (request.action === 'submit-info' || request.action === 'submit') {
    if (!cpCredentialMatches_(request.token, properties.getProperty('CP_SUBMIT_HASH'))) return deny;
    if (request.action === 'submit-info') return cpResult_({});
    return cpSubmit_(request);
  }
  return deny;
}

function cpSnapshot_(previousRevision) {
  const ids = new Set();
  const prayers = cpReadRows_(cpSheet_('Requests'), CP_REQUEST_HEADERS)
    .filter(row => row.publication === 'published')
    .map(row => {
      if (!CP_UUID_PATTERN.test(row.id) || ids.has(row.id) ||
          !['requested', 'answered'].includes(row.status) ||
          !['shareable', 'group-only'].includes(row.visibility)) throw new Error('Invalid published row.');
      ids.add(row.id);
      return { id: row.id,
        name: cpText_(row.title, 200, true), description: cpText_(row.description, 10000, false),
        requestor: cpText_(row.requestor, 120, false), requestedAt: new Date(row.requestedAt).toISOString(),
        status: row.status,
        visibility: row.visibility === 'shareable' && row.consent === 'shareable' ? 'shareable' : 'group-only' };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (prayers.length > 1000) throw new Error('Too many published prayers.');
  const revision = cpHash_(JSON.stringify({ group: cpGroup_(), prayers: prayers }));
  if (revision === previousRevision) return cpResult_({ revision: revision, unchanged: true });
  const result = cpResult_({ revision: revision, complete: true, prayers: prayers });
  if (Utilities.newBlob(JSON.stringify(result)).getBytes().length > 2000000) throw new Error('Published prayers are too large.');
  return result;
}

function cpSubmit_(request) {
  const submission = request.submission;
  if (!CP_UUID_PATTERN.test(request.requestId || '') || !submission || submission.consent !== true ||
      submission.website || !['group-only', 'shareable'].includes(submission.visibility)) throw new Error('Invalid submission.');
  const values = [request.requestId, new Date().toISOString(), cpText_(submission.name, 200, true),
    cpText_(submission.description, 10000, true), cpText_(submission.requestor, 120, false),
    cpText_(submission.contact, 200, false), submission.visibility, 'pending'];
  return cpWithLock_(function () {
    const sheet = cpSheet_('Inbox');
    const rows = cpReadRows_(sheet, CP_INBOX_HEADERS);
    // A retry after a lost response must not create another submission.
    if (rows.some(row => row.id === request.requestId)) return cpResult_({ accepted: true });
    if (rows.length >= 2000) throw new Error('Inbox full.');
    const properties = PropertiesService.getScriptProperties();
    const hour = new Date().toISOString().slice(0, 13);
    const day = hour.slice(0, 10);
    const counters = JSON.parse(properties.getProperty('CP_SUBMIT_LIMITS') || '{}');
    const hourCount = counters.hour === hour ? Number(counters.hourCount) || 0 : 0;
    const dayCount = counters.day === day ? Number(counters.dayCount) || 0 : 0;
    if (hourCount >= 20 || dayCount >= 100) throw new Error('Submission limit reached.');
    properties.setProperty('CP_SUBMIT_LIMITS', JSON.stringify({ hour: hour, day: day, hourCount: hourCount + 1, dayCount: dayCount + 1 }));
    sheet.appendRow(values.map(cpCell_));
    SpreadsheetApp.flush();
    return cpResult_({ accepted: true });
  });
}

function cpWithLock_(action) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) throw new Error('Group busy.');
  try { return action(); } finally { lock.releaseLock(); }
}

function cpSelection_(name, headers) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== name) throw new Error('Select rows in the ' + name + ' tab first.');
  const range = sheet.getActiveRange();
  return cpReadRows_(sheet, headers).filter(row => row.sheetRow >= range.getRow() && row.sheetRow <= range.getLastRow());
}

function addDraftPrayer() {
  cpWithLock_(function () {
    const sheet = cpSheet_('Requests');
    cpReadRows_(sheet, CP_REQUEST_HEADERS);
    if (sheet.getLastRow() >= 2001) throw new Error('Archive old rows first.');
    sheet.appendRow([Utilities.getUuid(), 'draft', 'group-only', 'group-only', 'New prayer request', '', '', new Date().toISOString(), 'requested']);
    SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
    sheet.getRange(sheet.getLastRow(), 5).activate();
  });
}

function publishSelectedRequests() {
  cpWithLock_(function () {
    const active = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const target = cpSheet_('Requests');
    const existing = cpReadRows_(target, CP_REQUEST_HEADERS);
    if (active.getName() === 'Requests') {
      const rows = cpSelection_('Requests', CP_REQUEST_HEADERS);
      rows.forEach(row => {
        cpText_(row.title, 200, true);
        cpText_(row.description, 10000, false);
        if (!CP_UUID_PATTERN.test(row.id) || !['requested', 'answered'].includes(row.status) || !Number.isFinite(new Date(row.requestedAt).getTime())) throw new Error('Invalid draft prayer.');
      });
      rows.forEach(row => target.getRange(row.sheetRow, 2).setValue('published'));
    } else {
      const rows = cpSelection_('Inbox', CP_INBOX_HEADERS).filter(row => row.reviewStatus === 'pending');
      if (existing.length + rows.filter(row => !existing.some(item => item.id === row.id)).length > 2000) throw new Error('Archive old requests first.');
      rows.forEach(row => {
        const visibility = row.allowedSharing === 'shareable' ? 'shareable' : 'group-only';
        const values = [row.id, 'published', visibility, visibility, row.title, row.description, row.requestor, row.receivedAt, 'requested'].map(cpCell_);
        const previous = existing.find(item => item.id === row.id);
        if (previous) target.getRange(previous.sheetRow, 1, 1, values.length).setValues([values]);
        else target.appendRow(values);
        active.getRange(row.sheetRow, 8).setValue('approved');
      });
    }
    SpreadsheetApp.flush();
  });
}

function declineSelectedSubmissions() {
  cpWithLock_(function () {
    const sheet = cpSheet_('Inbox');
    cpSelection_('Inbox', CP_INBOX_HEADERS).forEach(row => sheet.getRange(row.sheetRow, 8).setValue('declined'));
  });
}

function cpUpdateSelected_(column, value) {
  cpWithLock_(function () {
    const sheet = cpSheet_('Requests');
    cpSelection_('Requests', CP_REQUEST_HEADERS).forEach(row => sheet.getRange(row.sheetRow, column).setValue(value));
    SpreadsheetApp.flush();
  });
}

function withdrawSelectedPrayers() { cpUpdateSelected_(2, 'withdrawn'); }
function answerSelectedPrayers() { cpUpdateSelected_(9, 'answered'); }
function restrictSelectedPrayers() { cpUpdateSelected_(3, 'group-only'); }
