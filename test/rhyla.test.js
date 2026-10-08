import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import init from '../src/commands/init.js';
import build from '../src/commands/build.js';
import dev from '../src/commands/dev.js';
import { createIgnoreMatcher } from '../src/core/ignore.js';
import { createMarkdown, renderFile } from '../src/core/content.js';
import { listPages, resolvePageFile } from '../src/core/pages.js';
import { applyPageMeta, assemblePage } from '../src/core/layout.js';

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-test-'));
  init({ cwd: dir, quiet: true });
  const body = path.join(dir, 'rhyla-docs', 'body');
  fs.mkdirSync(path.join(body, 'zeta'), { recursive: true });
  fs.writeFileSync(path.join(body, 'zeta', 'b-second.md'), '# Second\n');
  fs.writeFileSync(
    path.join(body, 'zeta', 'z-first.md'),
    '---\ntitle: First page\ndescription: Shown first\norder: 1\n---\n\nHello <b>raw</b>\n'
  );
  fs.writeFileSync(path.join(body, 'zeta', 'custom.html'), '<h1>Custom</h1><script>alert(1)</script><p onclick="x()">p</p>');
  return dir;
}

describe('core', () => {
  test('ignore matcher handles names, paths and wildcards', () => {
    const isIgnored = createIgnoreMatcher(['kit_dev_rhyla', 'guide/old', '*.draft.md']);
    assert.equal(isIgnored('kit_dev_rhyla/new_rote.html'), true);
    assert.equal(isIgnored('a/kit_dev_rhyla'), true);
    assert.equal(isIgnored('guide/old/page.md'), true);
    assert.equal(isIgnored('guide/older.md'), false);
    assert.equal(isIgnored('notes.draft.md'), true);
    assert.equal(isIgnored('guide/install.md'), false);
  });

  test('frontmatter is parsed and not rendered', () => {
    const dir = tmpProject();
    const file = path.join(dir, 'rhyla-docs/body/zeta/z-first.md');
    const page = renderFile(file, { md: createMarkdown() });
    assert.equal(page.title, 'First page');
    assert.equal(page.description, 'Shown first');
    assert.match(page.html, /<h1>First page<\/h1>/);
    assert.doesNotMatch(page.html, /order: 1/);
    // raw HTML is escaped unless allow_raw_html is true
    assert.match(page.html, /&lt;b&gt;raw/);
  });

  test('html pages are sanitized unless allowRawHtml', () => {
    const dir = tmpProject();
    const file = path.join(dir, 'rhyla-docs/body/zeta/custom.html');
    const safe = renderFile(file, { md: createMarkdown() });
    assert.doesNotMatch(safe.html, /<script|onclick/);
    const raw = renderFile(file, { md: createMarkdown(), allowRawHtml: true });
    assert.match(raw.html, /<script>/);
  });

  test('pages are ordered by frontmatter order, then name; home first', () => {
    const dir = tmpProject();
    const pages = listPages(path.join(dir, 'rhyla-docs/body'));
    assert.equal(pages[0].route, '/');
    const zeta = pages.filter((p) => p.group === 'zeta').map((p) => p.name);
    assert.deepEqual(zeta, ['z-first', 'b-second', 'custom']);
  });

  test('resolvePageFile blocks path traversal', () => {
    const dir = tmpProject();
    const body = path.join(dir, 'rhyla-docs/body');
    assert.equal(resolvePageFile(body, '/').slug, 'home');
    assert.equal(resolvePageFile(body, '/zeta/z-first.html').group, 'zeta');
    assert.equal(resolvePageFile(body, '/../config'), null);
    assert.equal(resolvePageFile(body, '/..%2f..%2fpackage'), null);
  });

  test('layout sets title/description and closes the document', () => {
    const head = '<html><head><title>Site</title></head><body>';
    const out = applyPageMeta(head, { pageTitle: 'A <b>', description: 'D "q"', markdownHref: '/a.md' });
    assert.match(out, /<title>A &lt;b&gt; · Site<\/title>/);
    assert.match(out, /<meta name="description" content="D &quot;q&quot;">/);
    assert.match(out, /rel="alternate" type="text\/markdown" href="\/a.md"/);
    assert.match(assemblePage(out, '', 'x'), /<\/body>\n<\/html>\n$/);
  });
});

describe('init', () => {
  test('refuses to overwrite an existing project without force', () => {
    const dir = tmpProject();
    assert.throws(() => init({ cwd: dir, quiet: true }), /already exists/);
    init({ cwd: dir, quiet: true, force: true });
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/AGENTS.md')));
  });
});

describe('build', () => {
  let dir;
  let dist;
  before(() => {
    dir = tmpProject();
    build({ cwd: dir, quiet: true });
    dist = path.join(dir, 'dist');
  });

  test('writes html, markdown sources and llms files', () => {
    for (const f of ['index.html', 'index.md', 'zeta/z-first.html', 'zeta/z-first.md', 'llms.txt', 'llms-full.txt', 'search_index.json']) {
      assert.ok(fs.existsSync(path.join(dist, f)), `missing ${f}`);
    }
    // kit_dev_rhyla is always excluded from the build
    assert.ok(!fs.existsSync(path.join(dist, 'kit_dev_rhyla')));
    // .html pages have no .md twin
    assert.ok(!fs.existsSync(path.join(dist, 'zeta/custom.md')));
  });

  test('llms.txt lists pages with descriptions', () => {
    const llms = fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8');
    assert.match(llms, /^# Documentation Standard/);
    assert.match(llms, /- \[First page\]\(\/zeta\/z-first\.md\): Shown first/);
    assert.match(llms, /\(\/zeta\/custom\.html\)/);
    assert.doesNotMatch(llms, /kit_dev_rhyla/);
  });

  test('pages get per-page title and closed html', () => {
    const html = fs.readFileSync(path.join(dist, 'zeta/z-first.html'), 'utf8');
    assert.match(html, /<title>First page · Documentation Standard<\/title>/);
    assert.match(html, /<\/html>\n$/);
    assert.doesNotMatch(html, /title: First page/);
  });

  test('search index is built from the project, not the package folder', () => {
    const index = JSON.parse(fs.readFileSync(path.join(dist, 'search_index.json'), 'utf8'));
    const entry = index.find((e) => e.route === '/zeta/z-first');
    assert.equal(entry.title, 'First page');
    assert.ok(!fs.existsSync(new URL('../src/templates/scripts/search_index.json', import.meta.url)));
  });

  test('no sitemap without site_url', () => {
    assert.ok(!fs.existsSync(path.join(dist, 'sitemap.xml')));
  });

  test('site title is rendered into the header', () => {
    const html = fs.readFileSync(path.join(dist, 'zeta/z-first.html'), 'utf8');
    assert.match(html, /id="rhyla-title"[^>]*>Documentation Standard</);
  });
});

describe('build with base path', () => {
  test('prefixes asset and page URLs exactly once', () => {
    const dir = tmpProject();
    const cfgFile = path.join(dir, 'rhyla-docs/config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
    fs.writeFileSync(cfgFile, JSON.stringify({ ...cfg, base: '/docs/' }));
    build({ cwd: dir, quiet: true });
    const html = fs.readFileSync(path.join(dir, 'dist/zeta/z-first.html'), 'utf8');
    assert.match(html, /href="\/docs\/styles\/global\.css"/);
    assert.match(html, /class="rhyla-brand" href="\/docs\/"/);
    assert.match(html, /href="\/docs\/zeta\/z-first\.md"/);
    assert.doesNotMatch(html, /\/docs\/docs\//);
  });
});

describe('dev server', () => {
  let server;
  let base;
  let dir;
  before(async () => {
    dir = tmpProject();
    server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  test('binds to localhost by default', () => {
    assert.equal(server.address().address, '127.0.0.1');
  });

  test('serves pages, markdown and llms.txt', async () => {
    for (const p of ['/', '/home', '/zeta/z-first', '/zeta/z-first.html']) {
      const res = await fetch(base + p);
      assert.equal(res.status, 200, p);
    }
    const page = await (await fetch(base + '/zeta/z-first')).text();
    assert.match(page, /<title>First page · Documentation Standard<\/title>/);

    const md = await fetch(base + '/zeta/z-first.md');
    assert.match(md.headers.get('content-type'), /text\/markdown/);
    assert.match(await md.text(), /^# First page/);

    const llms = await (await fetch(base + '/llms.txt')).text();
    assert.match(llms, /First page/);

    const index = await (await fetch(base + '/search_index.json')).json();
    assert.ok(index.some((e) => e.route === '/zeta/z-first'));
  });

  test('renders like the build (sanitizes html pages)', async () => {
    const html = await (await fetch(base + '/zeta/custom')).text();
    assert.doesNotMatch(html, /alert\(1\)/);
  });

  test('returns 404 for unknown pages and traversal attempts', async () => {
    assert.equal((await fetch(base + '/nope')).status, 404);
    assert.equal((await fetch(base + '/..%2f..%2fpackage.json')).status, 404);
  });

  test('generate-page writes inside body/ only', async () => {
    const post = (filePath) => fetch(base + '/generate-page', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filePath, content: '# X' }),
    });
    assert.equal((await post('../../evil')).status, 400);
    const ok = await post('/api/post-x');
    assert.equal(ok.status, 200);
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/body/api/post-x.md')));
  });
});
