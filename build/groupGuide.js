import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const GUIDE_PATH = '/guides/groups/';
const downloads = {
  '../group-service/google-apps-script/Code.gs': { path: 'Code.gs.txt', name: 'Code.gs' },
  '../group-service/google-apps-script/appsscript.json': { path: 'appsscript.json', name: 'appsscript.json' },
};

function headingText(node) {
  return node.type === 'text' ? node.value : (node.children || []).map(headingText).join('');
}

export async function renderGroupGuide(markdown) {
  // Vite 4 loads this project's config as CommonJS; these dependencies are ESM-only.
  const { default: ReactMarkdown } = await import('react-markdown');
  const { default: remarkGfm } = await import('remark-gfm');
  const headings = [];
  const ids = new Map();
  const content = renderToStaticMarkup(h(ReactMarkdown, {
    remarkPlugins: [remarkGfm], skipHtml: true,
    components: {
      h2({ node, children }) {
        const title = headingText(node);
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        const count = (ids.get(slug) || 0) + 1;
        ids.set(slug, count);
        const id = count === 1 ? slug : `${slug}-${count}`;
        headings.push({ title, id });
        return h('h2', { id, tabIndex: -1 }, children);
      },
      a({ href, children }) {
        const download = downloads[href];
        if (download) return h('a', { href: GUIDE_PATH + download.path, download: download.name }, children);
        return h('a', { href, ...(/^https?:\/\//.test(href || '') ? { target: '_blank', rel: 'noreferrer' } : {}) }, children);
      },
    },
  }, markdown));
  const navigation = renderToStaticMarkup(h('ul', null, headings.map(({ title, id }) =>
    h('li', { key: id }, h('a', { href: `#${id}` }, title)))));

  // The guide is static HTML: no app boot, database access, or group synchronization.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Set up a church-owned prayer group with Google Sheets. Step-by-step installation, moderation, privacy guidance, and setup downloads for Closet Prayer.">
  <meta name="theme-color" content="#111827">
  <title>Google Sheets Group Setup | Closet Prayer</title>
  <link rel="canonical" href="https://closetprayer.com/guides/groups/">
  <link rel="stylesheet" href="${GUIDE_PATH}guide.css">
</head>
<body>
  <a class="skip-link" href="#guide">Skip to the guide</a>
  <header class="site-header">
    <a class="brand" href="/">Closet Prayer<span>Guides &amp; resources</span></a>
    <a class="back-link" href="/#groups">Back to prayer groups <span aria-hidden="true">&rarr;</span></a>
  </header>
  <div class="layout">
    <aside class="sidebar">
      <nav aria-label="On this page"><h2>On this page</h2>${navigation}</nav>
      <section class="downloads" aria-labelledby="downloads-title">
        <h2 id="downloads-title">Setup files</h2>
        <p>Install these in your church's Apps Script project as described in the guide.</p>
        <a href="${GUIDE_PATH}Code.gs.txt" download="Code.gs">Download Code.gs</a>
        <a href="${GUIDE_PATH}appsscript.json" download="appsscript.json">Download appsscript.json</a>
      </section>
    </aside>
    <main id="guide" tabindex="-1">
      <p class="eyebrow">Google Sheets setup guide</p>
      <article>${content}</article>
      <footer class="guide-footer">Closet Prayer &middot; Church-owned data, direct connections.<br>This guide does not access your saved prayers.</footer>
    </main>
  </div>
</body>
</html>`;
}

export async function createGroupGuideAssets(root) {
  const read = path => readFileSync(resolve(root, path), 'utf8');
  return [
    { fileName: 'guides/groups/index.html', source: await renderGroupGuide(read('docs/groups.md')), type: 'text/html; charset=utf-8' },
    { fileName: 'guides/groups/guide.css', source: read('docs/group-guide.css'), type: 'text/css; charset=utf-8' },
    { fileName: 'guides/groups/Code.gs.txt', source: read('group-service/google-apps-script/Code.gs'), type: 'text/plain; charset=utf-8' },
    { fileName: 'guides/groups/appsscript.json', source: read('group-service/google-apps-script/appsscript.json'), type: 'application/json; charset=utf-8' },
  ];
}

export function groupGuidePlugin() {
  let root;
  return {
    name: 'closet-prayer-group-guide',
    configResolved(config) { root = config.root; },
    async generateBundle() {
      for (const { fileName, source } of await createGroupGuideAssets(root)) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!['GET', 'HEAD'].includes(request.method)) return next();
        const path = (request.url || '').split('?')[0];
        if (path === GUIDE_PATH.slice(0, -1)) {
          response.writeHead(302, { Location: GUIDE_PATH });
          return response.end();
        }
        if (!path.startsWith(GUIDE_PATH)) return next();
        try {
          const fileName = path === GUIDE_PATH ? `${GUIDE_PATH}index.html` : path;
          const asset = (await createGroupGuideAssets(root)).find(item => `/${item.fileName}` === fileName);
          if (!asset) { response.writeHead(404); return response.end('Guide file not found.'); }
          response.writeHead(200, { 'Content-Type': asset.type });
          response.end(request.method === 'HEAD' ? undefined : asset.source);
        } catch (error) { next(error); }
      });
    },
  };
}
