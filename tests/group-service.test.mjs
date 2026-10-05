import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../group-service/google-apps-script/Code.gs', import.meta.url), 'utf8');
const gid = '01d930ae-1234-4567-89ab-ccddeeff0011';
const member = 'M'.repeat(43), submit = 'S'.repeat(43);
const hash = value => createHash('sha256').update(value).digest('base64url');
const requestHeaders = ['id', 'publication', 'visibility', 'consent', 'title', 'description', 'requestor', 'requestedAt', 'status'];
const inboxHeaders = ['id', 'receivedAt', 'title', 'description', 'requestor', 'contact', 'allowedSharing', 'reviewStatus'];

function fixture(managed = false) {
  const properties = new Map(Object.entries({ CP_GROUP_ID: gid, CP_GROUP_NAME: 'Test Church', CP_SHEET_ID: 'sheet',
    CP_MEMBER_HASH: hash(member), CP_SUBMIT_HASH: hash(submit) }));
  const data = { Requests: [requestHeaders, [randomUUID(), 'published', 'group-only', 'group-only', 'Prayer', 'Details', 'Name', new Date().toISOString(), 'requested']], Inbox: [inboxHeaders] };
  const controls = { failBatch: false, loseResponse: false, locked: false, batches: 0,
    setupLink: `https://closetprayer.com/#group=CPG1.s.test_deployment_1234567890.${gid}.${submit}` };
  if (managed) {
    properties.set('CP_CONSOLE_VERSION', '1');
    data.ConsoleCommands = [['id', 'createdAt', 'command', 'outcome', 'completedAt']];
  }
  function sheet(name) { if (!data[name]) return null; return {
    getSheetId: () => Object.keys(data).indexOf(name),
    getLastRow: () => data[name].length,
    setFrozenRows: () => {},
    getRange: (row, col, height = 1, width = 1) => ({
      getValues: () => data[name].slice(row - 1, row - 1 + height).map(cells => cells.slice(col - 1, col - 1 + width)),
      setValue: value => { data[name][row - 1][col - 1] = value; },
      setNumberFormat() { return this; },
      setValues(values) {
        for (const [offset, cells] of values.entries()) {
          while (data[name].length < row + offset) data[name].push([]);
          cells.forEach((value, index) => { data[name][row - 1 + offset][col - 1 + index] = value; });
        }
        return this;
      },
    }),
    appendRow: cells => data[name].push(Array.from(cells)),
  }; }
  const context = vm.createContext({ console, Set, Date, Number, JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value),
      setProperties: values => Object.entries(values).forEach(([key, value]) => properties.set(key, value)) }) },
    SpreadsheetApp: {
      openById: () => ({ getId: () => 'sheet', getSheetByName: sheet, getSpreadsheetTimeZone: () => 'America/New_York', insertSheet: name => { data[name] = []; return sheet(name); } }),
      getUi: () => ({ Button: { OK: 'ok' }, ButtonSet: { OK_CANCEL: 'ok-cancel' }, alert: () => {},
        prompt: () => ({ getSelectedButton: () => 'ok', getResponseText: () => controls.setupLink }) }),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (controls.locked) return false; controls.locked = true; return true; }, releaseLock: () => { controls.locked = false; } }) },
    Sheets: { Spreadsheets: { get: id => ({ spreadsheetId: id }), batchUpdate({ requests }, id) {
      assert.equal(id, 'sheet'); assert.equal(controls.locked, true);
      controls.batches++;
      if (controls.failBatch) throw new Error('SIMULATED GOOGLE FAILURE');
      const draft = structuredClone(data);
      for (const request of requests) {
        const update = request.updateCells, append = request.appendCells;
        const change = update || append;
        const name = Object.keys(draft)[update ? update.start.sheetId : append.sheetId];
        const cells = change.rows[0].values.map(cell => {
          assert.deepEqual(Object.keys(cell.userEnteredValue), ['stringValue']);
          return cell.userEnteredValue.stringValue;
        });
        if (append) draft[name].push(cells);
        else {
          const { rowIndex, columnIndex } = update.start;
          while (draft[name].length <= rowIndex) draft[name].push([]);
          cells.forEach((value, offset) => { draft[name][rowIndex][columnIndex + offset] = value; });
        }
      }
      Object.assign(data, draft);
      if (controls.loseResponse) { controls.loseResponse = false; throw new Error('LOST RESPONSE'); }
      return {};
    } } },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      formatDate: (date, timeZone) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
        return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}Z`;
      },
      computeDigest: (algorithm, value) => createHash(algorithm).update(value).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      newBlob: value => ({ getBytes: () => Buffer.from(value) }), getUuid: randomUUID },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ text: value, setMimeType() { return this; } }) },
  });
  vm.runInContext(source, context);
  const call = (action, token = member, extra = {}) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ protocol: 'cp-group', version: 1, groupId: gid, token, action, ...extra }) } }).text);
  function queue(command, id = randomUUID()) {
    data.ConsoleCommands.push([id, new Date().toISOString(), JSON.stringify(command), 'pending', '']);
    return id;
  }
  function revision(type, row = 1) {
    const headers = type === 'Requests' ? requestHeaders : inboxHeaders;
    const object = Object.fromEntries(headers.map((key, col) => [key, data[type][row][col]]));
    return context.cpRowRevision_(object, headers);
  }
  return { data, context, call, properties, controls, queue, revision };
}

test('member and public submission credentials have separate scopes', () => {
  const { call } = fixture();
  assert.equal(call('sync').ok, true);
  assert.equal(call('sync', submit).code, 'access-denied');
  assert.equal(call('submit-info', member).code, 'access-denied');
  assert.equal(call('submit-info', submit).group.name, 'Test Church');
  assert.equal(call('delete-all', member).code, 'access-denied');
  assert.equal(call('sync', member, { groupId: randomUUID() }).code, 'access-denied');
});

test('members can submit for review but cannot perform public or administrative operations', () => {
  const { call, data } = fixture(true);
  assert.equal(call('sync').capabilities.memberSubmissions, true);
  assert.equal(call('member-submit-info').ok, true);
  assert.equal(call('member-submit-info', submit).code, 'access-denied');
  assert.equal(call('console-info', member).code, 'access-denied');
  const requestId = randomUUID();
  const submission = { name: 'Member prayer', description: 'Please pray', requestor: '', contact: 'private@example.test', website: '', consent: true, visibility: 'group-only' };
  assert.equal(call('member-submit', member, { requestId, submission }).accepted, true);
  assert.equal(call('member-submit', member, { requestId, submission }).accepted, true);
  assert.equal(data.Inbox.length, 2); assert.equal(data.Requests.length, 2);
  assert.equal(data.Inbox[1][7], 'pending');
  assert.equal(call('member-submit', submit, { requestId: randomUUID(), submission }).code, 'access-denied');
  assert.equal(call('member-submit', member, { requestId: randomUUID(), submission: { ...submission, consent: false } }).ok, false);
});

test('owner-only bootstrap checks the fixed setup record and never resets another group', () => {
  const f = fixture();
  f.properties.clear(); f.data.Requests = [requestHeaders];
  const install = { sheetId: 'sheet', installId: randomUUID(), groupId: gid, name: 'Test Church', memberToken: member, submissionToken: submit };
  f.context.CP_INSTALL = install;
  f.data.GroupSetup = [['key', 'value'], ['setup', JSON.stringify({ ...install, protocol: 'cp-setup', version: 1, phase: 'authorizing' })], ['authorized', '']];
  assert.match(f.context.doGet().text, /approval completed/);
  assert.equal(f.properties.get('CP_MEMBER_HASH'), hash(member));
  assert.equal(f.data.GroupSetup[2][1], install.installId);
  assert.match(f.context.doGet().text, /approval completed/, 'Approval is idempotent');
  f.properties.set('CP_GROUP_ID', randomUUID());
  const before = JSON.stringify([...f.properties]);
  assert.match(f.context.doGet().text, /could not be verified/);
  assert.equal(JSON.stringify([...f.properties]), before);
  delete f.context.CP_INSTALL;
  assert.match(f.context.doGet().text, /Use your invitation/, 'Public version never bootstraps');
});

test('bootstrap refuses an altered setup nonce, nonempty sheet, or missing advanced service permission', () => {
  for (const fault of ['nonce', 'records', 'permission']) {
    const f = fixture(); f.properties.clear();
    const install = { sheetId: 'sheet', installId: randomUUID(), groupId: gid, name: 'Test Church', memberToken: member, submissionToken: submit };
    f.context.CP_INSTALL = install;
    f.data.GroupSetup = [['key', 'value'], ['setup', JSON.stringify({ ...install, protocol: 'cp-setup', version: 1, phase: 'authorizing', ...(fault === 'nonce' ? { installId: randomUUID() } : {}) })], ['authorized', '']];
    if (fault !== 'records') f.data.Requests = [requestHeaders];
    if (fault === 'permission') f.context.Sheets.Spreadsheets.get = () => { throw new Error('Denied'); };
    assert.match(f.context.doGet().text, /could not be verified/);
    assert.equal(f.properties.size, 0); assert.equal(f.data.GroupSetup[2][1], '');
  }
});

test('enabling management requires the existing public link and preserves records and command history', () => {
  const f = fixture();
  const original = JSON.stringify(f.data);
  f.controls.setupLink = f.controls.setupLink.replace('.s.', '.m.');
  assert.throws(() => f.context.enableAdministratorConsole(), /public submission link/);
  assert.equal(JSON.stringify(f.data), original);
  f.controls.setupLink = f.controls.setupLink.replace('.m.', '.s.');
  f.context.enableAdministratorConsole();
  assert.equal(f.properties.get('CP_CONSOLE_VERSION'), '1');
  assert.equal(f.call('console-info', submit).sheetId, 'sheet');
  assert.equal(f.data.ConsoleSettings[2][1], '1');
  assert.equal(f.data.ConsoleSettings[5][1], submit);
  assert.equal(JSON.stringify({ Requests: f.data.Requests, Inbox: f.data.Inbox }), original);
  const operation = [randomUUID(), new Date().toISOString(), '{}', 'rejected', new Date().toISOString()];
  f.data.ConsoleCommands.push(operation);
  f.context.enableAdministratorConsole();
  assert.equal(f.data.ConsoleCommands.length, 2);
  assert.deepEqual(f.data.ConsoleCommands[1], operation);
});

test('native spreadsheet dates hash like REST serial dates without shifting unchanged timestamps', () => {
  const f = fixture(true);
  f.data.Requests[1][7] = new Date('2026-10-01T04:00:00.123Z');
  const canonical = [...f.data.Requests[1]];
  canonical[7] = '2026-10-01T00:00:00.123Z';
  assert.equal(f.revision('Requests'), hash(JSON.stringify(canonical)));
  const command = { version: 1, type: 'update', id: canonical[0], expected: f.revision('Requests'), prayer: {
    publication: 'published', visibility: 'group-only', title: 'Edited native-date prayer', description: '', requestor: '', requestedAt: canonical[7], status: 'answered',
  } };
  assert.equal(f.call('console-process', submit, { requestId: f.queue(command) }).outcome, 'applied');
  assert.equal(f.data.Requests[1][7], '2026-10-01T04:00:00.123Z');
});

test('only published fields enter a snapshot and submitter restrictions win', () => {
  const { data, call } = fixture();
  data.Requests[1][2] = 'shareable';
  data.Requests.push([randomUUID(), 'draft', 'shareable', 'shareable', 'Hidden draft', 'Secret', 'Name', new Date().toISOString(), 'requested']);
  data.Inbox.push([randomUUID(), new Date().toISOString(), 'Private inbox', 'Secret', 'Person', 'private@example.test', 'group-only', 'pending']);
  const result = call('sync');
  assert.equal(result.prayers.length, 1);
  assert.equal(result.prayers[0].visibility, 'group-only');
  assert.ok(!JSON.stringify(result).includes('private@example.test'));
  assert.ok(!JSON.stringify(result).includes(member));
  assert.equal(call('sync', member, { revision: result.revision }).unchanged, true);
  data.Requests[1][1] = 'withdrawn';
  const withdrawn = call('sync', member, { revision: result.revision });
  assert.equal(withdrawn.complete, true);
  assert.equal(withdrawn.prayers.length, 0);
});

const submission = { name: '=IMPORTXML("https://example.invalid","x")', description: 'Please pray', requestor: '+Name', contact: 'private@example.test', visibility: 'group-only', consent: true, website: '' };

test('submissions enter the inbox, neutralize formulas, and retries are idempotent', () => {
  const { data, call } = fixture();
  const requestId = randomUUID();
  assert.equal(call('submit', submit, { requestId, submission }).accepted, true);
  assert.equal(call('submit', submit, { requestId, submission }).accepted, true);
  assert.equal(data.Inbox.length, 2);
  assert.ok(data.Inbox[1][2].startsWith("'="));
  assert.ok(data.Inbox[1][4].startsWith("'+"));
  assert.equal(data.Inbox[1][7], 'pending');
  assert.equal(data.Requests.length, 2);
});

test('missing consent, honeypots, and invalid text fail without writes', () => {
  const { data, call } = fixture();
  for (const change of [{ consent: false }, { website: 'spam' }, { name: 'x'.repeat(201) }]) {
    assert.equal(call('submit', submit, { requestId: randomUUID(), submission: { ...submission, ...change } }).ok, false);
  }
  assert.equal(data.Inbox.length, 1);
});

test('submission caps bound accepted writes and key rotation revokes old readers', () => {
  const { data, call, properties } = fixture();
  for (let i = 0; i < 20; i++) assert.equal(call('submit', submit, { requestId: randomUUID(), submission }).accepted, true);
  assert.equal(call('submit', submit, { requestId: randomUUID(), submission }).ok, false);
  assert.equal(data.Inbox.length, 21);
  properties.set('CP_MEMBER_HASH', hash('N'.repeat(43)));
  assert.equal(call('sync', member).code, 'access-denied');
  assert.equal(call('sync', 'N'.repeat(43)).ok, true);
});

test('damaged sheet headers and duplicate request IDs fail closed', () => {
  const first = fixture();
  first.data.Requests[0] = ['damaged'];
  assert.equal(first.call('sync').ok, false);
  const second = fixture();
  second.data.Requests.push([...second.data.Requests[1]]);
  assert.equal(second.call('sync').ok, false);
});

function draft(id = randomUUID()) {
  return { version: 1, type: 'create', id, prayer: { title: '=A1', description: 'A literal prayer, not a formula', requestor: '+Name',
    requestedAt: '2026-10-01T12:00:00.000Z', publication: 'draft', status: 'requested', visibility: 'group-only', consent: 'group-only' } };
}

test('a public token cannot provide administrative commands or read the private queue', () => {
  const state = fixture(true);
  const command = draft();
  const result = state.call('console-process', submit, { requestId: randomUUID(), command });
  assert.equal(result.outcome, 'not-found');
  assert.equal(state.data.Requests.length, 2);
  assert.equal(state.call('console-process', member, { requestId: randomUUID() }).code, 'access-denied');
  assert.equal(state.call('console-info', submit).sheetId, 'sheet');
  assert.equal(fixture().call('console-info', submit).code, 'access-denied');
});

test('private queue writes are literal, atomic with receipts, and retries are idempotent', () => {
  const state = fixture(true);
  const command = draft();
  const id = state.queue(command);
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'applied');
  assert.equal(state.data.Requests[2][4], '=A1');
  assert.equal(state.data.ConsoleCommands[1][3], 'applied');
  assert.equal(state.controls.batches, 1);
  state.queue(command, id);
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'applied');
  assert.equal(state.data.Requests.length, 3);
  assert.equal(state.controls.batches, 1);
});

test('lost responses are recoverable without duplicating prayers', () => {
  const state = fixture(true);
  const id = state.queue(draft());
  state.controls.loseResponse = true;
  assert.equal(state.call('console-process', submit, { requestId: id }).ok, false);
  assert.equal(state.data.ConsoleCommands[1][3], 'applied');
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'applied');
  assert.equal(state.data.Requests.length, 3);
});

test('a failed batch leaves all records and the receipt unchanged', () => {
  const state = fixture(true);
  const id = state.queue(draft());
  const before = structuredClone(state.data);
  state.controls.failBatch = true;
  assert.equal(state.call('console-process', submit, { requestId: id }).ok, false);
  assert.deepEqual(state.data, before);
  state.controls.failBatch = false;
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'applied');
});

test('two administrators editing the same version do not overwrite one another', () => {
  const state = fixture(true);
  const command = { ...draft(state.data.Requests[1][0]), type: 'update', expected: state.revision('Requests') };
  const first = state.queue(command);
  const second = state.queue({ ...command, prayer: { ...command.prayer, title: 'Stale second edit' } });
  assert.equal(state.call('console-process', submit, { requestId: first }).outcome, 'applied');
  assert.equal(state.call('console-process', submit, { requestId: second }).outcome, 'conflict');
  assert.equal(state.data.Requests[1][4], '=A1');
  assert.equal(state.data.ConsoleCommands[2][3], 'conflict');
});

test('approval preserves submitter consent and never copies administrator-only contact fields', () => {
  const state = fixture(true);
  const id = randomUUID();
  state.call('submit', submit, { requestId: id, submission });
  const command = { ...draft(id), type: 'approve', expected: state.revision('Inbox') };
  command.prayer.publication = 'published'; command.prayer.consent = 'shareable';
  const queued = state.queue(command);
  assert.equal(state.call('console-process', submit, { requestId: queued }).outcome, 'applied');
  assert.equal(state.data.Inbox[1][7], 'approved');
  assert.equal(state.data.Requests[2][3], 'group-only');
  const feed = state.call('sync');
  assert.equal(feed.prayers.find(row => row.id === id).visibility, 'group-only');
  assert.doesNotMatch(JSON.stringify(feed), /private@example.test/);
});

test('updates cannot widen original consent, even with a forged browser command', () => {
  const state = fixture(true);
  const command = { ...draft(state.data.Requests[1][0]), type: 'update', expected: state.revision('Requests') };
  command.prayer.visibility = 'shareable'; command.prayer.consent = 'shareable';
  const id = state.queue(command);
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'rejected');
  assert.equal(state.data.Requests[1][3], 'group-only');
});

test('row reordering uses stable IDs, while edits or deletions cause conflicts', () => {
  const state = fixture(true);
  const command = { ...draft(state.data.Requests[1][0]), type: 'update', expected: state.revision('Requests') };
  const id = state.queue(command);
  state.data.Requests.splice(1, 0, [randomUUID(), 'draft', 'group-only', 'group-only', 'Other', '', '', '2026-10-01T12:00:00Z', 'requested']);
  assert.equal(state.call('console-process', submit, { requestId: id }).outcome, 'applied');
  assert.equal(state.data.Requests[1][4], 'Other');
  assert.equal(state.data.Requests[2][4], '=A1');
  const changed = state.queue({ ...command, expected: state.revision('Requests', 2) });
  state.data.Requests.splice(2, 1);
  assert.equal(state.call('console-process', submit, { requestId: changed }).outcome, 'conflict');
});

test('decline is private, repeated moderation conflicts, and stale pending commands expire', () => {
  const state = fixture(true);
  const id = randomUUID();
  state.call('submit', submit, { requestId: id, submission });
  const command = { version: 1, type: 'decline', id, expected: state.revision('Inbox') };
  const first = state.queue(command), second = state.queue(command);
  assert.equal(state.call('console-process', submit, { requestId: first }).outcome, 'applied');
  assert.equal(state.call('console-process', submit, { requestId: second }).outcome, 'conflict');
  assert.equal(state.data.Inbox[1][7], 'declined');
  const expired = state.queue(draft());
  state.data.ConsoleCommands.at(-1)[1] = '2000-01-01T00:00:00Z';
  assert.equal(state.call('console-process', submit, { requestId: expired }).outcome, 'expired');
});

test('public submission and menu/console operations honor the same lock', () => {
  const state = fixture(true);
  const id = state.queue(draft());
  state.controls.locked = true;
  assert.equal(state.call('console-process', submit, { requestId: id }).ok, false);
  assert.equal(state.call('submit', submit, { requestId: randomUUID(), submission }).ok, false);
  assert.equal(state.data.Inbox.length, 1);
  assert.equal(state.data.ConsoleCommands[1][3], 'pending');
});
