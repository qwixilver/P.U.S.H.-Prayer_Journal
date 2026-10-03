import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createGroupGuideAssets, groupGuidePlugin, renderGroupGuide } from '../build/groupGuide.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('the group guide renders the canonical markdown as a standalone document', async () => {
  const assets = await createGroupGuideAssets(root);
  const html = assets.find(asset => asset.fileName.endsWith('index.html')).source;
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<h1>Church-owned prayer groups \(pilot\)<\/h1>/);
  assert.match(html, /id="set-up-a-group"/);
  assert.match(html, /href="#set-up-a-group"/);
  assert.match(html, /id="local-data-sync-and-privacy"/);
  assert.match(html, /href="\/guides\/groups\/Code.gs.txt" download="Code.gs"/);
  assert.ok(!html.includes('../group-service/'));
  assert.ok(!html.includes('<script'));
  for (const asset of assets.filter(asset => !asset.fileName.endsWith('index.html'))) {
    assert.ok(html.includes('/' + asset.fileName));
  }
});

test('setup downloads stay identical to the maintained service templates', async () => {
  const assets = await createGroupGuideAssets(root);
  for (const name of ['Code.gs', 'appsscript.json']) {
    const asset = assets.find(item => item.fileName.endsWith(name === 'Code.gs' ? 'Code.gs.txt' : name));
    assert.equal(asset.source, readFileSync(new URL(`../group-service/google-apps-script/${name}`, import.meta.url), 'utf8'));
  }
});

test('headings have unique anchors and raw HTML cannot become executable guide content', async () => {
  const html = await renderGroupGuide('# Guide\n\n## Setup\n\n## Setup\n\n<script>alert(1)</script>\n\n[Unsafe](javascript:alert)');
  assert.match(html, /id="setup"/);
  assert.match(html, /id="setup-2"/);
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('href="javascript:'));
});

test('the development guide serves the same page and handles directory URLs and missing files', async () => {
  const plugin = groupGuidePlugin();
  plugin.configResolved({ root });
  let middleware;
  plugin.configureServer({ middlewares: { use(handler) { middleware = handler; } } });
  async function request(url, method = 'GET') {
    const result = {};
    await middleware({ url, method }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); },
      end(body) { result.body = body; },
    }, error => { if (error) throw error; result.next = true; });
    return result;
  }
  const page = await request('/guides/groups/?test=1');
  assert.equal(page.status, 200);
  assert.equal(page.body, (await createGroupGuideAssets(root))[0].source);
  assert.equal((await request('/guides/groups')).headers.Location, '/guides/groups/');
  assert.equal((await request('/guides/groups/', 'HEAD')).body, undefined);
  assert.equal((await request('/guides/groups/missing.txt')).status, 404);
  assert.equal((await request('/')).next, true);
});
