import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import Dexie from 'dexie';
import { db } from '../src/db.js';
import { createGroupStore } from '../src/utils/groupStore.js';
import { callGroupService, groupInvitationLink, newGroupId, normalizeGroupEndpoint,
  parseGroupInvitation, randomGroupToken, validateGroupResponse } from '../src/utils/groupProtocol.js';

const invite = { version: 1, scope: 'member', endpoint: `https://script.google.com/macros/s/${'A'.repeat(60)}/exec`,
  groupId: '01d930ae-1234-4567-89ab-ccddeeff0011', token: 'M'.repeat(43) };
const link = groupInvitationLink(invite);
const prayer = { id: '12d930ae-1234-4567-89ab-ccddeeff0011', name: 'A group prayer', description: 'Please pray.',
  requestor: 'Member', status: 'requested', requestedAt: '2026-09-20T12:00:00Z', visibility: 'group-only' };
const snapshot = (prayers = [prayer], revision = 'revision_1') => ({ protocol: 'cp-group', version: 1,
  ok: true, group: { id: invite.groupId, name: 'Test Church' }, complete: true, revision, prayers });

before(async () => {
  // Open the actual v4 schema over an existing personal database.
  const old = new Dexie('PrayerJournalDB');
  old.version(3).stores({ categories: '++id, name, description, showSingle',
    requestors: '++id, categoryId, name, description, security',
    prayers: '++id, requestorId, name, description, requestedAt, answeredAt, status, security',
    events: '++id, prayerId, createdAt', journalEntries: '++id, title, createdAt, updatedAt' });
  await old.prayers.add({ name: 'Existing personal prayer' });
  old.close();
  await db.open();
  assert.equal((await db.prayers.toArray())[0].name, 'Existing personal prayer');
});
beforeEach(async () => { await db.groups.clear(); await db.groupPrayers.clear(); });
after(async () => { await db.delete(); });

test('private invitations round-trip through links and QR-sized codes', () => {
  assert.deepEqual(parseGroupInvitation(link, 'member'), invite);
  assert.deepEqual(parseGroupInvitation(new URL(link).hash.slice(7)), invite);
  assert.ok(link.length < 300);
  assert.equal(randomGroupToken().length, 43);
  assert.match(newGroupId(), /^[a-f0-9-]{36}$/);
});

test('refresh all forces fresh checks, shares pending work, and preserves offline groups', async () => {
  let offline = false, calls = 0, active = 0, maxActive = 0;
  const store = createGroupStore(db, () => {}, async group => {
    calls++; active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 2)); active--;
    if (offline && group.endpoint === invite.endpoint) throw new Error('Offline');
    return snapshot();
  });
  await store.join(link);
  await store.join(groupInvitationLink({ ...invite, endpoint: invite.endpoint.replace('A'.repeat(60), 'B'.repeat(60)) }));
  calls = 0; offline = true;
  const first = store.syncAll(), second = store.syncAll();
  assert.equal(first, second);
  assert.deepEqual(await first, { total: 2, refreshed: 1, failed: 1, skipped: 0 });
  assert.equal(calls, 2); assert.equal(maxActive, 1);
  assert.equal(await db.groupPrayers.count(), 2);
  await db.groups.clear();
  assert.deepEqual(await store.syncAll(), { total: 0, refreshed: 0, failed: 0, skipped: 0 });
});

test('member submission discovers upgrades, sends only form fields, and requires current membership', async () => {
  const calls = [];
  let upgraded = false;
  const store = createGroupStore(db, () => {}, async (group, action, extra) => {
    calls.push({ group, action, extra });
    const result = { ...snapshot(), capabilities: { memberSubmissions: upgraded } };
    if (action === 'member-submit') result.accepted = true;
    return result;
  });
  const group = await store.join(link);
  await assert.rejects(store.submissionInfo(group.id), /service update/);
  assert.equal(calls.some(call => call.action === 'member-submit-info'), false);
  upgraded = true;
  assert.equal((await store.submissionInfo(group.id)).name, 'Test Church');
  assert.equal((await db.groups.get(group.id)).memberSubmissions, true);
  const requestId = newGroupId();
  await store.submit(group.id, { name: 'Submitted', description: 'For review', requestor: '', contact: '', website: '', visibility: 'group-only', consent: true, journal: 'PRIVATE' }, requestId);
  const sent = calls.at(-1);
  assert.equal(sent.action, 'member-submit'); assert.equal(sent.group.token, invite.token);
  assert.equal(sent.extra.requestId, requestId); assert.equal(sent.extra.submission.journal, undefined);
  assert.equal(await db.groupPrayers.count(), 1, 'Sending does not auto-publish a local group prayer');
  await db.groups.update(group.id, { accessDenied: true });
  await assert.rejects(store.submit(group.id, {}, requestId), /membership/);
  await store.leave(group.id);
  await assert.rejects(store.submissionInfo(group.id), /membership/);
});

test('an unchanged snapshot still advertises new member submission capability', () => {
  const response = { ...snapshot(), unchanged: true, capabilities: { memberSubmissions: true } };
  assert.equal(validateGroupResponse(response, invite, 'revision_1').memberSubmissions, true);
  assert.equal(validateGroupResponse(snapshot(), invite).memberSubmissions, false);
});

test('submission invitations cannot join and unsafe endpoints are rejected', () => {
  const submit = groupInvitationLink({ ...invite, scope: 'submit', token: 'S'.repeat(43) });
  assert.throws(() => parseGroupInvitation(submit, 'member'), /submission/);
  for (const url of ['http://script.google.com/macros/s/1234567890123456/exec',
    'https://script.google.com.evil.test/macros/s/1234567890123456/exec',
    invite.endpoint + '?secret=abc', invite.endpoint.replace('/exec', '/dev')]) {
    assert.throws(() => normalizeGroupEndpoint(url));
  }
  assert.throws(() => parseGroupInvitation('CPG1.m.ABC.fake.secret'));
});

test('only approved schema fields enter the cache', () => {
  const result = validateGroupResponse(snapshot([{ ...prayer, contact: 'private@example.test', token: 'secret' }]), invite);
  assert.equal(result.prayers[0].contact, undefined);
  assert.equal(result.prayers[0].token, undefined);
  assert.throws(() => validateGroupResponse(snapshot([{ ...prayer, visibility: 'unknown' }]), invite));
  assert.throws(() => validateGroupResponse(snapshot([prayer, prayer]), invite));
  assert.throws(() => validateGroupResponse(snapshot([{ ...prayer, id: 1234567890123456 }]), invite));
  assert.throws(() => validateGroupResponse(snapshot([prayer], 123456789), invite));
  assert.throws(() => validateGroupResponse({ ...snapshot(), group: { id: newGroupId(), name: 'Other' } }, invite));
});

test('requests put credentials in a simple POST body with no cookies or referrer', async () => {
  let called;
  const result = await callGroupService(invite, 'sync', {}, async (url, options) => {
    called = { url, options };
    return new Response(JSON.stringify(snapshot()), { headers: { 'Content-Type': 'application/json' } });
  });
  assert.equal(result.ok, true);
  assert.equal(called.url, invite.endpoint);
  assert.ok(!called.url.includes(invite.token));
  assert.equal(called.options.credentials, 'omit');
  assert.equal(called.options.referrerPolicy, 'no-referrer');
  assert.deepEqual(Object.keys(called.options.headers), ['Content-Type']);
  assert.match(called.options.headers['Content-Type'], /^text\/plain/);
  assert.equal(JSON.parse(called.options.body).token, invite.token);
});

test('HTML login responses and oversized data are rejected', async () => {
  await assert.rejects(callGroupService(invite, 'sync', {}, async () => new Response('<html>Sign in</html>')), /did not return data/);
  await assert.rejects(callGroupService(invite, 'sync', {}, async () => new Response('x'.repeat(2_000_001))), /too large/);
});

test('joining is idempotent, separate from personal records, and scopes groups by endpoint', async () => {
  const store = createGroupStore(db, () => {}, async () => snapshot());
  await store.join(link); await store.join(link);
  assert.equal(await db.groups.count(), 1);
  assert.equal(await db.groupPrayers.count(), 1);
  assert.equal(await db.prayers.count(), 1);
  const second = { ...invite, endpoint: invite.endpoint.replace('A'.repeat(60), 'B'.repeat(60)) };
  await store.join(groupInvitationLink(second));
  assert.equal(await db.groups.count(), 2);
  assert.equal(await db.groupPrayers.count(), 2);
});

test('a full snapshot applies edits and withdrawals atomically', async () => {
  let response = snapshot([prayer, { ...prayer, id: newGroupId() }]);
  const store = createGroupStore(db, () => {}, async () => response);
  const group = await store.join(link);
  response = snapshot([{ ...prayer, name: 'Updated', status: 'answered' }], 'revision_2');
  await store.sync(group.id);
  assert.equal(await db.groupPrayers.count(), 1);
  assert.equal((await db.groupPrayers.toArray())[0].name, 'Updated');
});

test('partial and malformed updates keep the last good snapshot', async () => {
  let response = snapshot();
  const store = createGroupStore(db, () => {}, async () => response);
  const group = await store.join(link);
  response = { ...snapshot([]), complete: false };
  await assert.rejects(store.sync(group.id), /incomplete/);
  assert.equal(await db.groupPrayers.count(), 1);
  response = snapshot([{ ...prayer, name: null }]);
  await assert.rejects(store.sync(group.id), /invalid/);
  assert.equal(await db.groupPrayers.count(), 1);
});

test('group-only requests cannot enter Security; stricter updates remove old selections', async () => {
  let response = snapshot();
  const store = createGroupStore(db, () => {}, async () => response);
  const group = await store.join(link);
  await assert.rejects(store.setSecurity(group.id, prayer.id, true), /restricted/);
  response = snapshot([{ ...prayer, visibility: 'shareable' }], 'revision_2');
  await store.sync(group.id);
  await store.setSecurity(group.id, prayer.id, true);
  assert.equal((await db.groupPrayers.toArray())[0].security, true);
  response = snapshot([prayer], 'revision_3');
  await assert.rejects(store.shareablePrayer(group.id, prayer.id), /restricted/);
  assert.equal((await db.groupPrayers.toArray())[0].security, false);
});

test('offline failures preserve content and refuse sharing; revocation clears the group cache', async () => {
  let fail = false;
  let response = snapshot([{ ...prayer, visibility: 'shareable' }]);
  const store = createGroupStore(db, () => {}, async () => { if (fail) throw new Error('Offline'); return response; });
  const group = await store.join(link);
  fail = true;
  await assert.rejects(store.shareablePrayer(group.id, prayer.id), /Offline/);
  assert.equal(await db.groupPrayers.count(), 1);
  fail = false;
  response = { protocol: 'cp-group', version: 1, ok: false, code: 'access-denied' };
  await assert.rejects(store.sync(group.id), /no longer valid/);
  assert.equal(await db.groupPrayers.count(), 0);
  assert.equal((await db.groups.get(group.id)).accessDenied, true);
  assert.equal(await db.prayers.count(), 1);
});

test('unchanged responses must match the cached revision', async () => {
  let response = snapshot();
  const store = createGroupStore(db, () => {}, async () => response);
  const group = await store.join(link);
  response = { ...snapshot(), unchanged: true }; delete response.prayers;
  await store.sync(group.id);
  assert.equal(await db.groupPrayers.count(), 1);
  response.revision = 'revision_2';
  await assert.rejects(store.sync(group.id), /complete update/);
});

test('leaving during an in-flight request cannot restore prayers or membership', async () => {
  let release;
  let started;
  const began = new Promise(resolve => { started = resolve; });
  let waiting = false;
  const store = createGroupStore(db, () => {}, async () => {
    if (!waiting) return snapshot();
    started(); return new Promise(resolve => { release = resolve; });
  });
  const group = await store.join(link);
  waiting = true;
  const syncing = store.sync(group.id);
  await began;
  await store.leave(group.id);
  release(snapshot()); await syncing;
  assert.equal(await db.groups.count(), 0);
  assert.equal(await db.groupPrayers.count(), 0);
});

test('an old credential response cannot overwrite a newly joined connection', async () => {
  let release;
  let started;
  const began = new Promise(resolve => { started = resolve; });
  let waiting = false;
  const store = createGroupStore(db, () => {}, async credential => {
    if (waiting && credential.token === invite.token) {
      started(); return new Promise(resolve => { release = resolve; });
    }
    return snapshot();
  });
  const group = await store.join(link);
  waiting = true;
  const syncing = store.sync(group.id); await began;
  await store.join(groupInvitationLink({ ...invite, token: 'N'.repeat(43) }));
  release({ protocol: 'cp-group', version: 1, ok: false, code: 'access-denied' });
  await assert.rejects(syncing);
  assert.equal(await db.groupPrayers.count(), 1);
  assert.equal((await db.groups.get(group.id)).token, 'N'.repeat(43));
});
