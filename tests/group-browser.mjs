// Optional browser smoke test. Start Vite preview on 127.0.0.1:4174 first.
// This test uses fake group data and never contacts a real Google deployment.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { groupInvitationLink } from '../src/utils/groupProtocol.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CP_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CP_BROWSER_CHANNEL ? { channel: process.env.CP_BROWSER_CHANNEL } : {}) });
const base = 'http://127.0.0.1:4174';
const invitation = { version: 1, scope: 'member', endpoint: `https://script.google.com/macros/s/${'A'.repeat(60)}/exec`,
  groupId: '01d930ae-1234-4567-89ab-ccddeeff0011', token: 'M'.repeat(43) };
const link = groupInvitationLink(invitation).replace('https://closetprayer.com', base);
const submitLink = groupInvitationLink({ ...invitation, scope: 'submit', token: 'S'.repeat(43) }).replace('https://closetprayer.com', base);
const group = { id: invitation.groupId, name: 'Test Church' };
let rows = [{ id: '12d930ae-1234-4567-89ab-ccddeeff0011', name: 'Group-only prayer',
  description: 'This prayer should fill the width of its card on mobile, with comfortable padding and room for the whole description.',
  requestor: 'Member', requestedAt: '2026-09-20T12:00:00Z', status: 'requested', visibility: 'group-only' },
{ id: '23d930ae-1234-4567-89ab-ccddeeff0011', name: 'Shareable prayer',
  description: 'Approved for sharing.', requestor: 'Member', requestedAt: '2026-09-20T12:00:00Z', status: 'requested', visibility: 'shareable' }];
const traffic = [];
const errors = [];
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
await context.addInitScript(() => localStorage.setItem('cp:onboarded', '1'));
async function groupResponse(route) {
  assert.equal(route.request().method(), 'POST', 'Group requests must not require a preflight.');
  const body = route.request().postDataJSON();
  traffic.push(body);
  const payload = { protocol: 'cp-group', version: 1, ok: true, group };
  if (body.action === 'sync') Object.assign(payload, { complete: true, revision: 'browser_revision', prayers: rows });
  if (body.action === 'submit') Object.assign(payload, { accepted: true });
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(payload) });
}
await context.route('https://script.google.com/**', groupResponse);
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));

async function widthCheck() {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow horizontally.');
}

try {
  await page.goto(link);
  await page.getByRole('heading', { name: 'Prayer groups', exact: true }).waitFor();
  assert.equal(traffic.length, 0, 'Opening an invitation must not contact the group before consent.');
  assert.equal(new URL(page.url()).hash, '#groups', 'Private invitation must leave the address bar.');
  await page.getByRole('checkbox', { name: /I trust/ }).check();
  await page.getByRole('button', { name: 'Join group', exact: true }).click();
  await page.getByRole('heading', { name: 'Test Church' }).waitFor();
  assert.equal(traffic[0].token, invitation.token);
  assert.ok(!('data' in traffic[0]));
  await widthCheck();

  // A personal prayer makes the backup-isolation assertion meaningful.
  await page.evaluate(async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('PrayerJournalDB');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('prayers', 'readwrite');
      transaction.objectStore('prayers').add({ name: 'Personal prayer', description: 'Device only', status: 'requested' });
      transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.getByRole('navigation').getByRole('button', { name: 'Daily', exact: true }).click();
  await page.getByRole('heading', { name: 'Group-only prayer', exact: true }).waitFor();
  const privateCard = page.locator('li').filter({ has: page.getByRole('heading', { name: 'Group-only prayer', exact: true }) });
  assert.equal(await privateCard.getByRole('button').count(), 0);
  await widthCheck();
  if (process.env.CP_SCREENSHOT_PATH) await page.screenshot({ path: process.env.CP_SCREENSHOT_PATH, fullPage: true });
  await page.getByRole('button', { name: 'Add to Security', exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Security', exact: true }).click();
  await page.getByRole('heading', { name: 'Shareable prayer', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Group-only prayer', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Share QR', exact: true }).click();
  await page.getByRole('dialog', { name: 'Share group prayer' }).waitFor();
  assert.ok(await page.getByRole('dialog').locator('svg').isVisible());
  assert.ok(await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight - 20)?.closest('[role="dialog"]')),
    'The QR dialog must cover the bottom navigation.');
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  const prayerDownloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const prayerStream = await (await prayerDownloaded).createReadStream();
  let shared = ''; for await (const chunk of prayerStream) shared += chunk;
  assert.ok(shared.includes('Shareable prayer'));
  for (const secret of ['Group-only prayer', invitation.token, '"contact"']) assert.ok(!shared.includes(secret));

  await page.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  let backup = ''; for await (const chunk of stream) backup += chunk;
  assert.ok(backup.includes('Personal prayer'));
  for (const secret of ['Group-only prayer', 'Shareable prayer', invitation.token, invitation.groupId]) assert.ok(!backup.includes(secret));

  await page.getByRole('button', { name: 'Manage groups', exact: true }).click();
  assert.equal(await page.getByLabel('Member invitation link or connection code').inputValue(), '');
  rows = [{ ...rows[1], visibility: 'group-only' }];
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await page.getByRole('button', { name: 'Sync now', exact: true }).waitFor();
  await page.getByRole('navigation').getByRole('button', { name: 'Security', exact: true }).click();
  await page.waitForFunction(async () => {
    const database = await new Promise(resolve => { const r = indexedDB.open('PrayerJournalDB'); r.onsuccess = () => resolve(r.result); });
    const result = await new Promise(resolve => { const r = database.transaction('groupPrayers').objectStore('groupPrayers').getAll(); r.onsuccess = () => resolve(r.result); });
    database.close(); return result.length === 1 && result[0].security === false;
  });
  assert.equal(await page.getByRole('heading', { name: 'Shareable prayer', exact: true }).count(), 0);
  await context.setOffline(true);
  await page.getByRole('navigation').getByRole('button', { name: 'Daily', exact: true }).click();
  await page.getByRole('heading', { name: 'Shareable prayer', exact: true }).waitFor();
  await context.setOffline(false);

  await page.goto(submitLink);
  await page.getByText('Test Church', { exact: true }).waitFor();
  assert.equal(await page.getByRole('navigation').count(), 0, 'The embedded form should not contain app navigation.');
  await page.getByLabel('Prayer title', { exact: true }).fill('Submitted prayer');
  await page.getByLabel('Prayer request', { exact: true }).fill('Please pray for this test.');
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'sent to the group administrator' }).waitFor();
  const submitted = traffic.find(request => request.action === 'submit');
  assert.equal(submitted.submission.visibility, 'group-only');
  assert.equal(submitted.token, 'S'.repeat(43));
  await widthCheck();
  assert.deepEqual(errors, []);
  const embeddedContext = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  try {
    await embeddedContext.route('https://script.google.com/**', groupResponse);
    // Use two fake public origins to avoid browser local-network-access rules
    // interfering with the embedding test. Serve the real build through our preview.
    const parent = 'https://church.example.invalid/embed';
    const embeddedLink = submitLink.replace(base, 'https://form.example.invalid');
    await embeddedContext.route('https://form.example.invalid/**', async route => {
      const target = new URL(route.request().url());
      const response = await fetch(base + target.pathname + target.search);
      await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') || 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) });
    });
    await embeddedContext.route(parent, route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><h1>Church test page</h1><iframe src="${embeddedLink}" title="Submit a prayer request" width="100%" height="950" style="border:0" referrerpolicy="no-referrer"></iframe>` }));
    const church = await embeddedContext.newPage();
    church.on('pageerror', error => errors.push(error.message));
    await church.goto(parent);
    const form = church.frameLocator('iframe');
    await form.getByText('Test Church', { exact: true }).waitFor();
    assert.equal(await form.getByRole('navigation').count(), 0);
    await form.getByLabel('Prayer title', { exact: true }).fill('Embedded submission');
    await form.getByLabel('Prayer request', { exact: true }).fill('Fictional iframe test');
    await form.getByRole('checkbox', { name: /I agree/ }).check();
    await form.getByRole('button', { name: 'Send for review', exact: true }).click();
    await form.getByRole('status').filter({ hasText: 'sent to the group administrator' }).waitFor();
    const request = traffic.filter(request => request.action === 'submit').at(-1);
    assert.equal(request.submission.name, 'Embedded submission');
    assert.equal(request.submission.visibility, 'group-only');
    assert.equal(request.token, 'S'.repeat(43));
    assert.equal(await form.locator('html').evaluate(root => root.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
  } finally { await embeddedContext.close(); }
  console.log('PASS: mobile invitations, consent, direct fetch, privacy, QR display, backup isolation, withdrawal, offline reading, public submission, cross-origin iframe in a fresh session, and no horizontal overflow.');
} finally { await context.close(); await browser.close(); }
