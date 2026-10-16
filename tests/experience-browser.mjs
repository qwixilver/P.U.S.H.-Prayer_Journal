// Isolated browser checks; no real journal, Google account, or OS notifications.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import steps from '../src/utils/tutorialSlides.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CP_PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url)), base = 'http://127.0.0.1:4174';
const server = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { cwd: root, windowsHide: true, stdio: 'pipe' });
let serverLog = ''; server.stderr.on('data', bytes => { serverLog += bytes; }); server.stdout.on('data', () => {});
let browser;
const output = process.env.CP_EXPERIENCE_SCREENSHOTS;
if (output) await mkdir(output, { recursive: true });
async function capture(page, name) { if (output) await page.screenshot({ path: resolve(output, name + '.png'), fullPage: false }); }
async function snapshot(page) {
  return page.evaluate(async () => {
    const { db } = await import('/src/db.js');
    return Object.fromEntries(await Promise.all(['categories', 'requestors', 'prayers', 'events', 'journalEntries', 'groups', 'groupPrayers'].map(async name => [name, await db[name].toArray()])));
  });
}
async function layout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Horizontal overflow');
  const box = await page.locator('.tutorial-coach').boundingBox();
  const size = page.viewportSize();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, 'Coach outside viewport: ' + JSON.stringify({ step: await page.locator('.tutorial-coach').getAttribute('data-tour-step'), box, size }));
}
try {
  for (let n = 0; n < 80; n++) {
    if (server.exitCode != null) throw new Error(serverLog);
    try { if ((await fetch(base)).ok) break; } catch { /* Wait for our development server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: process.env.CP_BROWSER_CHANNEL || 'msedge' });
  const fresh = await browser.newContext({ viewport: { width: Number(process.env.CP_TOUR_WIDTH || 390), height: Number(process.env.CP_TOUR_HEIGHT || 844) }, serviceWorkers: 'block' });
  const errors = [], external = [];
  await fresh.route('https://**/*', route => { external.push(route.request().url()); return route.abort(); });
  const page = await fresh.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.locator('[data-tour-step="welcome"]').waitFor();
  const empty = await snapshot(page);
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    await page.locator(`[data-tour-step="${step.id}"]`).waitFor({ timeout: 10000 });
    await page.waitForFunction(() => !document.querySelector('.tutorial-recovery'));
    await layout(page);
    if (['welcome', 'people', 'prayer-form', 'context', 'event-form', 'sharing', 'backup'].includes(step.id)) await capture(page, 'tour-' + step.id);
    if (step.id === 'people') {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.locator('[data-tour-step="categories"]').waitFor();
      await page.locator('[data-tour="nav-categories"]').click();
      await page.locator('[data-tour-step="people"]').waitFor();
    }
    if (step.id === 'context') {
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page.locator('[data-tour-step="focus"]').waitFor();
      await page.locator('[data-tour="prayer-focus"]').first().click();
      await page.locator('[data-tour-step="context"]').waitFor();
      assert.match(await page.locator('[data-tour="focus-context"]').innerText(), /Requestor: Alex/);
      assert.match(await page.locator('[data-tour="focus-context"]').innerText(), /Category: Family/);
      for (const width of [320, 768, 1280, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.waitForTimeout(60); await layout(page);
      }
    }
    if (step.action === 'write') {
      const form = page.locator(step.target);
      if (step.table === 'prayers') {
        const category = await form.locator('select').first().boundingBox();
        const coach = await page.locator('.tutorial-coach').boundingBox();
        assert.ok(category.y >= coach.y + coach.height, 'Coach must not cover the category selector');
        await form.locator('input').first().fill('An edited practice prayer');
        const previousSize = page.viewportSize();
        await page.setViewportSize({ width: previousSize.width, height: 320 });
        await page.waitForTimeout(80);
        assert.equal(await form.locator('input').first().evaluate(input => input === document.activeElement), true, 'Shrinking the viewport must not steal text-field focus');
        await layout(page);
        await page.setViewportSize(previousSize);
        await page.waitForTimeout(80);
        await form.getByRole('button', { name: 'Add Prayer', exact: true }).click();
      } else await form.getByRole('button', { name: 'Save Event', exact: true }).click();
    } else if (step.action === 'inspect') await page.getByRole('button', { name: 'Continue: ' + step.title, exact: true }).click();
    else if (step.target) await page.locator(step.target).first().click();
    else await page.getByRole('button', { name: step.cta, exact: true }).click();
  }
  await page.locator('[data-tutorial-workspace]').waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(page), empty);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  await page.reload(); assert.equal(await page.locator('[data-tutorial-overlay]').count(), 0);
  await fresh.close();
  console.log('PASS: complete first-run tour, actual form saves, Back, mobile/desktop spotlight alignment, sample cleanup, zero group/network activity');

  const context = await browser.newContext({ viewport: { width: 360, height: 800 }, serviceWorkers: 'block' });
  await context.addInitScript(() => {
    localStorage.setItem('cp:onboarded', '1');
    window.testNotifications = []; window.permissionRequests = 0;
    class TestNotification { static permission = 'granted'; static async requestPermission() { window.permissionRequests++; return 'granted'; } }
    Object.defineProperty(window, 'Notification', { configurable: true, value: TestNotification });
    const registration = { active: {}, getNotifications: async () => [], showNotification: async (title, options) => window.testNotifications.push({ title, options }) };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(registration), getRegistration: async () => registration } });
  });
  const saved = await context.newPage(); saved.on('pageerror', error => errors.push(error.message));
  await saved.goto(base + '/#settings');
  await saved.evaluate(async () => {
    const { db } = await import('/src/db.js');
    await db.categories.add({ id: 10, name: 'My real category', showSingle: 1 });
    await db.requestors.add({ id: 10, name: 'My real requestor', categoryId: 10 });
    await db.prayers.add({ id: 10, requestorId: 10, name: 'My real prayer', description: 'Untouched', status: 'requested', requestedAt: '2026-10-01' });
    await db.journalEntries.add({ title: 'My real entry', text: 'My own words', createdAt: '2026-10-01' });
  });
  const original = await snapshot(saved);
  await saved.getByRole('button', { name: 'Show tutorial', exact: true }).click();
  await saved.getByRole('button', { name: 'Start the walkthrough', exact: true }).click();
  for (let n = 0; n < 9; n++) {
    await saved.keyboard.press('Tab');
    assert.ok(await saved.evaluate(() => Boolean(document.activeElement.closest('[data-tutorial-overlay]')) || document.activeElement.matches('[data-tour="nav-categories"]')));
  }
  await saved.keyboard.press('Escape');
  await saved.locator('[data-tutorial-workspace]').waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(saved), original);
  assert.equal(await saved.evaluate(() => window.permissionRequests), 0);
  await saved.getByRole('button', { name: 'Test now', exact: true }).click();
  await saved.waitForFunction(() => window.testNotifications.length === 1);
  const sent = await saved.evaluate(() => window.testNotifications[0]);
  assert.equal(sent.options.icon, '/assets/icons/icon-192x192.png');
  assert.equal(sent.options.badge, '/assets/icons/notification-badge.png');
  assert.equal(sent.options.data.hash, '#settings');
  await saved.clock.install();
  await saved.evaluate(async () => {
    const { scheduleNotifications } = await import('/src/utils/notifications.js');
    await scheduleNotifications({ mode: 'simple', scheduleType: 'interval', intervalMinutes: 5 });
  });
  await saved.clock.fastForward(300001);
  await saved.waitForFunction(() => window.testNotifications.length === 2);
  assert.equal(await saved.evaluate(() => window.testNotifications[1].options.badge), '/assets/icons/notification-badge.png');
  await saved.evaluate(async () => (await import('/src/utils/notifications.js')).clearScheduledNotifications());
  await saved.clock.resume();
  await saved.getByRole('navigation').getByRole('button', { name: 'Focus', exact: true }).click();
  await saved.getByRole('heading', { name: 'My real prayer', exact: true }).waitFor();
  assert.match(await saved.locator('[data-tour="focus-context"]').innerText(), /My real requestor/);
  assert.match(await saved.locator('[data-tour="focus-context"]').innerText(), /My real category/);
  await saved.evaluate(async () => { const { db, emitDbChanged } = await import('/src/db.js'); await db.requestors.update(10, { name: 'Updated requestor' }); await db.categories.update(10, { name: 'Updated category' }); emitDbChanged(); });
  await saved.getByText('Updated requestor', { exact: true }).waitFor();
  await saved.getByText('Updated category', { exact: true }).waitFor();
  const beforeSkip = await snapshot(saved);
  await saved.getByRole('navigation').getByRole('button', { name: 'Settings', exact: true }).click();
  await saved.getByRole('button', { name: 'Show tutorial', exact: true }).click();
  await saved.getByRole('button', { name: 'Skip walkthrough', exact: true }).click();
  await saved.locator('[data-tutorial-workspace]').waitFor({ state: 'hidden' });
  assert.deepEqual(await snapshot(saved), beforeSkip);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: replay/Skip/Escape preserve existing data, keyboard stays within allowed controls, test and timed reminders use service-worker icons, Focus refreshes renamed relations');
} finally { await browser?.close(); server.kill(); }
