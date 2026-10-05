// Optional: start a production preview on 127.0.0.1:4174 before running this test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CP_PLAYWRIGHT_PATH || 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.CP_BROWSER_CHANNEL ? { channel: process.env.CP_BROWSER_CHANNEL } : {}) });
const base = 'http://127.0.0.1:4174';
const errors = [];
try {
  const staticContext = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const guide = await staticContext.newPage();
  const response = await guide.goto(`${base}/guides/groups/`);
  assert.equal(response.status(), 200);
  await guide.getByRole('heading', { level: 1, name: 'Church-owned prayer groups (pilot)' }).waitFor();
  assert.equal(await guide.locator('script').count(), 0);
  for (const width of [360, 1280]) {
    await guide.setViewportSize({ width, height: 900 });
    assert.ok(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (process.env.CP_GUIDE_SCREENSHOTS) await guide.screenshot({ path: join(process.env.CP_GUIDE_SCREENSHOTS, `guide-${width}.png`) });
  }
  const anchors = await guide.locator('nav a').evaluateAll(links => links.map(link => link.hash.slice(1)));
  for (const id of anchors) assert.equal(await guide.locator(`[id="${id}"]`).count(), 1);
  for (const [url, file] of [['Code.gs.txt', 'Code.gs'], ['appsscript.json', 'appsscript.json']]) {
    const download = await guide.request.get(`${base}/guides/groups/${url}`);
    assert.equal(download.status(), 200);
    assert.equal(await download.text(), readFileSync(new URL(`../group-service/google-apps-script/${file}`, import.meta.url), 'utf8'));
  }
  await guide.emulateMedia({ media: 'print' });
  assert.equal(await guide.locator('.sidebar').isVisible(), false);
  assert.equal(await guide.locator('article').isVisible(), true);
  await guide.goto(`${base}/guides/groups`);
  await guide.getByRole('heading', { level: 1 }).waitFor();
  await staticContext.close();

  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  await context.addInitScript(origin => {
    if (location.origin === origin) localStorage.setItem('cp:onboarded', '1');
  }, base);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#groups`);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  assert.equal(await page.getByRole('button', { name: 'Create setup code' }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'administrator console' }).getAttribute('href'), 'https://console.closetprayer.com/');
  const popup = await context.newPage();
  await popup.goto(`${base}/guides/groups/`);
  popup.on('pageerror', error => errors.push(error.message));
  await popup.getByRole('heading', { level: 1, name: 'Church-owned prayer groups (pilot)' }).waitFor();
  assert.equal(new URL(popup.url()).pathname, '/guides/groups/');
  await context.setOffline(true);
  await popup.reload();
  await popup.getByRole('heading', { level: 1, name: 'Church-owned prayer groups (pilot)' }).waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS: static guide without JavaScript, mobile/desktop widths, anchors, exact downloads, print layout, console-only creation, and service-worker/offline routing.');
} finally { await browser.close(); }
