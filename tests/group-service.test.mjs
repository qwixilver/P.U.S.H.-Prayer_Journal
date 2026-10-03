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

function fixture() {
  const properties = new Map(Object.entries({ CP_GROUP_ID: gid, CP_GROUP_NAME: 'Test Church', CP_SHEET_ID: 'sheet',
    CP_MEMBER_HASH: hash(member), CP_SUBMIT_HASH: hash(submit) }));
  const data = { Requests: [requestHeaders, [randomUUID(), 'published', 'group-only', 'group-only', 'Prayer', 'Details', 'Name', new Date().toISOString(), 'requested']], Inbox: [inboxHeaders] };
  function sheet(name) { return {
    getLastRow: () => data[name].length,
    getRange: (row, col, height = 1, width = 1) => ({
      getValues: () => data[name].slice(row - 1, row - 1 + height).map(cells => cells.slice(col - 1, col - 1 + width)),
      setValue: value => { data[name][row - 1][col - 1] = value; },
    }),
    appendRow: cells => data[name].push(Array.from(cells)),
  }; }
  const context = vm.createContext({ console, Set, Date, Number, JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || null,
      setProperty: (key, value) => properties.set(key, value) }) },
    SpreadsheetApp: { openById: () => ({ getSheetByName: sheet }), flush: () => {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => createHash(algorithm).update(value).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
      newBlob: value => ({ getBytes: () => Buffer.from(value) }), getUuid: randomUUID },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: value => ({ text: value, setMimeType() { return this; } }) },
  });
  vm.runInContext(source, context);
  const call = (action, token = member, extra = {}) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ protocol: 'cp-group', version: 1, groupId: gid, token, action, ...extra }) } }).text);
  return { data, context, call, properties };
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
