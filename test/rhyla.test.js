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
import { createMcpServer } from '../src/commands/mcp.js';
import { buildFlowGraph, layoutFlow, decoratePage } from '../src/core/flows.js';
import { parseBlocks, serializeBlocks } from '../src/core/blocks.js';
import matter from 'gray-matter';

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
    // Os editores existem só no `rhyla dev`
    assert.doesNotMatch(html, /\/__rhyla\/|rh-page-edit|rh-flow-edit/);
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

describe('mcp server', () => {
  let dir;
  let server;
  const call = (name, args = {}) => server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const json = (res) => JSON.parse(res.result.content[0].text);
  before(() => {
    dir = tmpProject();
    server = createMcpServer({ cwd: dir });
  });

  test('initialize negotiates the protocol version', () => {
    const res = server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(res.result.protocolVersion, '2025-06-18');
    assert.ok(res.result.capabilities.tools);
    const future = server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
    assert.equal(future.result.protocolVersion, '2025-11-25');
    assert.equal(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.equal(server.handle({ jsonrpc: '2.0', id: 3, method: 'nope' }).error.code, -32601);
  });

  test('lists the tools, without write_page when read-only', () => {
    const names = server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.map((t) => t.name);
    assert.deepEqual(names, ['list_pages', 'read_page', 'search_docs', 'get_flow', 'get_conventions', 'write_page']);
    const ro = createMcpServer({ cwd: dir, readOnly: true });
    assert.ok(!ro.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).result.tools.some((t) => t.name === 'write_page'));
  });

  test('list_pages, read_page and search_docs', () => {
    const list = json(call('list_pages', { group: 'zeta' }));
    assert.deepEqual(list.pages.map((p) => p.route), ['/zeta/z-first', '/zeta/b-second', '/zeta/custom']);
    assert.ok(!json(call('list_pages')).pages.some((p) => p.route.includes('kit_dev_rhyla')));

    const read = call('read_page', { route: '/zeta/z-first' });
    assert.equal(JSON.parse(read.result.content[0].text).title, 'First page');
    assert.match(read.result.content[1].text, /^---\ntitle: First page/);

    const found = json(call('search_docs', { query: 'FIRST page' }));
    assert.equal(found.results[0].route, '/zeta/z-first');
  });

  test('tool errors are reported as isError results', () => {
    assert.equal(call('read_page', { route: '/missing' }).result.isError, true);
    assert.equal(call('write_page', { path: '../../escape', content: 'x' }).result.isError, true);
    assert.equal(server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } }).error.code, -32602);
  });

  test('write_page creates pages inside body/', () => {
    const res = json(call('write_page', { path: 'api/users/post-create_user', content: '---\ntitle: Create user\n---\n\n# POST /users' }));
    assert.equal(res.action, 'created');
    assert.equal(res.route, '/api/users/post-create_user');
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/body/api/users/post-create_user.md')));
    assert.equal(json(call('write_page', { path: 'api/users/post-create_user.md', content: '# Again' })).action, 'updated');
  });

  test('speaks newline-delimited JSON-RPC over stdio', async () => {
    const { spawn } = await import('node:child_process');
    const cli = new URL('../bin/cli.js', import.meta.url).pathname;
    const child = spawn(process.execPath, [cli, 'mcp', '--dir', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = [];
    let buf = '';
    const done = new Promise((resolve) => {
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); }
        if (lines.length === 2) resolve();
      });
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'search_docs', arguments: { query: 'second' } } }) + '\n');
    await done;
    child.kill();
    assert.equal(lines[0].result.serverInfo.name, 'rhyla');
    assert.equal(lines[1].result.structuredContent.results[0].route, '/zeta/b-second');
  });
});

describe('flows', () => {
  const page = (slug, data = {}, extra = {}) => ({ slug, data, title: data.title || slug, description: '', html: `<h1>${slug}</h1>`, markdown: `# ${slug}`, ...extra });
  const flowPage = (steps, extra = {}) => page('flows/demo', { title: 'Demo', type: 'flow', steps, ...extra });
  const links = { hrefFor: (s) => `/${s}.html`, mdHrefFor: (s) => `/${s}.md` };

  test('builds the graph and reports problems', () => {
    const graph = buildFlowGraph([
      page('a'), page('b'),
      flowPage([
        { id: 'one', page: 'a', next: [{ to: 'two', label: 'ok' }, { to: 'ghost' }] },
        { id: 'two', page: 'missing/page' },
        { id: 'one', title: 'dup' },
      ]),
    ]);
    const [flow] = graph.flows;
    assert.equal(flow.steps.length, 3);
    assert.deepEqual(flow.steps[0].next, [{ to: 'two', label: 'ok' }]);
    assert.ok(flow.steps[1].missingPage);
    assert.equal(graph.warnings.length, 3);
    assert.ok(graph.byPage.get('a'));
  });

  test('connects steps in order when no step uses next', () => {
    const { flows } = buildFlowGraph([page('a'), page('b'), flowPage(['a', 'b'])]);
    assert.deepEqual(flows[0].steps.map((s) => s.next.map((n) => n.to)), [['b'], []]);
  });

  test('layout ranks steps and detects loops', () => {
    const { flows } = buildFlowGraph([flowPage([
      { id: 'a', next: ['b', 'c'] }, { id: 'b', next: 'c' }, { id: 'c', next: 'a' },
    ])]);
    const layout = layoutFlow(flows[0]);
    assert.deepEqual(['a', 'b', 'c'].map((id) => layout.nodes.get(id).rank), [0, 1, 2]);
    assert.deepEqual(layout.backEdges.map((e) => `${e.from}>${e.to}`), ['c>a']);
    assert.ok(layout.edges.find((e) => e.from === 'a' && e.to === 'c').skip);
  });

  test('decorates flow pages and member pages', () => {
    const pages = [page('a'), page('b'), flowPage([{ id: 'x', page: 'a', next: { to: 'y', label: 'go' } }, { id: 'y', page: 'b' }])];
    const graph = buildFlowGraph(pages);
    const flow = decoratePage(pages[2], graph, links);
    assert.match(flow.html, /<svg class="rh-flow-svg"/);
    assert.match(flow.html, /href="\/a\.html"/);
    assert.match(flow.markdown, /## Flow steps/);
    const member = decoratePage(pages[0], graph, links);
    assert.match(member.html, /Part of the flow/);
    assert.match(member.html, /is-current/);
    assert.match(member.markdown, /Next: b \(go\)/);
    assert.equal(decoratePage(page('z'), graph, links).html, '<h1>z</h1>');
  });

  test('build renders the template flow without warnings', () => {
    const dir = tmpProject();
    build({ cwd: dir, quiet: true });
    const flowHtml = fs.readFileSync(path.join(dir, 'dist/flows/publish_docs.html'), 'utf8');
    assert.match(flowHtml, /rh-flow-svg/);
    assert.doesNotMatch(flowHtml, /rh-flow-warnings/);
    const member = fs.readFileSync(path.join(dir, 'dist/clients/express-v1.html'), 'utf8');
    assert.match(member, /Part of the flow/);
    assert.match(fs.readFileSync(path.join(dir, 'dist/flows/publish_docs.md'), 'utf8'), /## Flow steps/);
  });

  test('mcp get_flow lists and reads flows', () => {
    const dir = tmpProject();
    const server = createMcpServer({ cwd: dir });
    const call = (args) => JSON.parse(server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_flow', arguments: args } }).result.content[0].text);
    assert.deepEqual(call({}).flows.map((f) => f.route), ['/flows/publish_docs']);
    const flow = call({ route: '/flows/publish_docs' });
    assert.equal(flow.steps[0].page, '/guide/guide-en');
    assert.deepEqual(flow.steps.find((s) => s.id === 'api').next.map((n) => n.label), ['yes', 'no']);
  });
});

describe('flow editor api (dev)', () => {
  let server;
  let base;
  let dir;
  const api = (p, method = 'GET', body) => fetch(base + '/__rhyla/api' + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  before(async () => {
    dir = tmpProject();
    server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  test('serves the editor and links to it from flow pages', async () => {
    assert.equal((await fetch(base + '/__rhyla/flow-editor')).status, 200);
    assert.equal((await fetch(base + '/__rhyla/editor/flow-editor.js')).status, 200);
    const page = await (await fetch(base + '/flows/publish_docs')).text();
    assert.match(page, /class="rh-flow-edit" href="\/__rhyla\/flow-editor\?flow=flows%2Fpublish_docs"/);
  });

  test('lists pages and loads a flow in editable form', async () => {
    const { pages } = await (await api('/pages')).json();
    assert.ok(pages.some((p) => p.slug === 'flows/publish_docs' && p.type === 'flow'));
    const flow = await (await api('/flow?slug=flows/publish_docs')).json();
    assert.equal(flow.title, 'Publish your docs');
    assert.deepEqual(flow.steps.find((s) => s.id === 'api').next, [{ to: 'generator', label: 'yes' }, { to: 'build', label: 'no' }]);
    assert.match(flow.body, /This is a \*\*flow\*\*/);
    assert.equal((await api('/flow?slug=zeta/z-first')).status, 400);
    assert.equal((await api('/flow?slug=../../etc/passwd')).status, 400);
  });

  test('previews a draft with warnings', async () => {
    const data = await (await api('/flow/preview', 'POST', {
      slug: 'flows/draft', title: 'Draft',
      steps: [{ id: 'a', page: 'zeta/z-first', next: [{ to: 'b', label: 'go' }] }, { id: 'b', page: 'nope/missing', next: [] }],
    })).json();
    assert.match(data.svg, /data-step="a"/);
    assert.deepEqual(data.warnings, ['step "b": page "nope/missing" not found']);
  });

  test('saves a new flow and keeps unknown frontmatter on update', async () => {
    const steps = [{ id: 'a', page: 'zeta/z-first', next: [{ to: 'b' }] }, { id: 'b', title: 'Done', next: [] }];
    let res = await api('/flow', 'PUT', { slug: 'flows/new_one', title: 'New one', steps, body: 'Intro' });
    assert.equal(res.status, 200);
    const file = path.join(dir, 'rhyla-docs/body/flows/new_one.md');
    let text = fs.readFileSync(file, 'utf8');
    assert.match(text, /type: flow/);
    assert.match(text, /- id: a\n {4}page: zeta\/z-first\n {4}next: b/);
    assert.match(text, /\nIntro\n$/);

    fs.writeFileSync(file, text.replace('type: flow', 'type: flow\norder: 3'));
    res = await api('/flow', 'PUT', { slug: 'flows/new_one', title: 'Renamed', steps, body: 'Intro' });
    text = fs.readFileSync(file, 'utf8');
    assert.match(text, /order: 3/);
    assert.match(text, /title: Renamed/);

    assert.equal((await api('/flow', 'PUT', { slug: 'zeta/z-first', title: 'x', steps })).status, 409);
    assert.equal((await api('/flow', 'PUT', { slug: '../escape', title: 'x', steps })).status, 400);
    assert.equal((await api('/flow', 'PUT', { slug: 'flows/x', title: '', steps })).status, 400);
  });

  test('creates stub pages for new steps', async () => {
    const res = await api('/page', 'POST', { slug: 'checkout/review_order' });
    assert.equal(res.status, 200);
    assert.match(fs.readFileSync(path.join(dir, 'rhyla-docs/body/checkout/review_order.md'), 'utf8'), /title: review order/);
    assert.equal((await api('/page', 'POST', { slug: 'checkout/review_order' })).status, 409);
    assert.equal((await api('/page', 'POST', { slug: 'zeta/custom' })).status, 409);
    assert.equal((await api('/flow', 'PUT', { slug: 'zeta/custom', title: 'x', steps: [] })).status, 409);
  });
});

describe('page editor: markdown ⇄ blocks', () => {
  const md = createMarkdown({ allowRawHtml: true });
  const render = (s) => md.render(s).replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  const roundTrip = (s) => serializeBlocks(parseBlocks(s));

  const cases = {
    'nested code inside a numbered item': '1. Install\n2. Run:\n   ```bash\n   rhyla init\n   ```\nThen continue.\n',
    'tab-indented children': '1. Step\n\t```bash\n\trhyla dev\n\t```\n\tMore text\n\t- sub item\n\n2. Next step\n',
    'setext headings': 'Title\n=====\n\nSub\n---\n\ntext\n',
    'ordered list starting at 3': '3. three\n4. four\n',
    'loose list': '- a\n\n- b\n\n- c\n',
    'hard line break': 'line one  \nline two\nsoft\n',
    'table with alignment': '| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n',
    'raw html block': '<div class="x">\n  <b>hi</b>\n</div>\n\nafter\n',
    'paragraph that looks like a list': '\\- not a list\n\n1\\. not numbered\n',
    'todo items': '- [ ] open\n- [x] done\n',
    'quote with formatting': '> **Note:** read `this`\n> second line\n',
    'image': '![Diagram](/public/a.png)\n',
  };
  for (const [name, src] of Object.entries(cases)) {
    test(`round-trip keeps the rendered HTML: ${name}`, () => {
      const out = roundTrip(src);
      assert.equal(render(out), render(src));
      assert.equal(roundTrip(out), out, 'second round-trip must not change the markdown');
    });
  }

  test('every markdown page of the template survives a round-trip', () => {
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p);
    });
    walk(new URL('../src/templates', import.meta.url).pathname);
    files.push(new URL('../README.md', import.meta.url).pathname);
    assert.ok(files.length >= 8);
    for (const f of files) {
      const body = matter(fs.readFileSync(f, 'utf8')).content;
      assert.equal(render(roundTrip(body)), render(body), f);
    }
  });

  test('blocks carry indent, numbers and table alignment', () => {
    const blocks = parseBlocks('2. two\n   - child\n\n| a | b |\n|---|--:|\n| 1 | 2 |\n');
    assert.deepEqual(blocks.map((b) => [b.type, b.indent]), [['numbered', 0], ['bullet', 1], ['table', 0]]);
    assert.equal(blocks[0].number, 2);
    assert.deepEqual(blocks[2].align, ['', 'right']);
  });

  test('task lists render as checkboxes', () => {
    const html = createMarkdown().render('- [ ] open\n- [x] done\n');
    assert.match(html, /<li class="task-item"><input type="checkbox" class="task-check" disabled> open/);
    assert.match(html, /disabled checked> done/);
  });

  test('build output is identical after every page goes through the editor', () => {
    const dir = tmpProject();
    build({ cwd: dir, quiet: true });
    const mains = (root) => {
      const out = {};
      const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.html')) out[path.relative(root, p)] = (fs.readFileSync(p, 'utf8').match(/<main[\s\S]*<\/main>/) || [''])[0].replace(/\s+/g, ' ').replace(/> </g, '><');
      });
      walk(root);
      return out;
    };
    const before = mains(path.join(dir, 'dist'));
    const body = path.join(dir, 'rhyla-docs/body');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) return walk(p);
      if (!e.name.endsWith('.md')) return;
      const { data, content } = matter(fs.readFileSync(p, 'utf8'));
      const out = serializeBlocks(parseBlocks(content));
      fs.writeFileSync(p, Object.keys(data).length ? matter.stringify(`\n${out}`, data) : out);
    });
    walk(body);
    build({ cwd: dir, quiet: true });
    const after = mains(path.join(dir, 'dist'));
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const k of Object.keys(before)) assert.equal(after[k], before[k], k);
  });
});

describe('page editor api (dev)', () => {
  let server;
  let base;
  let dir;
  const api = (p, method = 'GET', body, headers) => fetch(base + '/__rhyla/api' + p, {
    method,
    headers: headers || (body ? { 'content-type': 'application/json' } : undefined),
    body: body && !(body instanceof Uint8Array) ? JSON.stringify(body) : body,
  });
  before(async () => {
    dir = tmpProject();
    server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  test('serves the editor and links to it from markdown pages', async () => {
    assert.equal((await fetch(base + '/__rhyla/page-editor')).status, 200);
    assert.equal((await fetch(base + '/__rhyla/editor/blocks.js')).status, 200);
    assert.match(await (await fetch(base + '/zeta/z-first')).text(), /class="rh-page-edit" href="\/__rhyla\/page-editor\?page=zeta%2Fz-first"/);
    assert.doesNotMatch(await (await fetch(base + '/zeta/custom')).text(), /rh-page-edit/);
  });

  test('loads a page as blocks', async () => {
    const data = await (await api('/page?slug=zeta/z-first')).json();
    assert.equal(data.data.title, 'First page');
    assert.deepEqual(data.blocks.map((b) => b.type), ['paragraph']);
    assert.equal((await api('/page?slug=zeta/custom')).status, 400);
    assert.equal((await api('/page?slug=../../etc/passwd')).status, 400);
  });

  test('saves markdown and edited properties, keeping the rest of the frontmatter', async () => {
    const res = await api('/page', 'PUT', { slug: 'flows/publish_docs', markdown: 'New intro.\n', data: { title: 'Ship docs', description: '', order: '2' } });
    assert.equal(res.status, 200);
    const { data, content } = matter(fs.readFileSync(path.join(dir, 'rhyla-docs/body/flows/publish_docs.md'), 'utf8'));
    assert.equal(data.title, 'Ship docs');
    assert.equal(data.type, 'flow');
    assert.ok(Array.isArray(data.steps) && data.steps.length > 3);
    assert.equal(data.order, 2);
    assert.equal(data.description, undefined);
    assert.equal(content.trim(), 'New intro.');
  });

  test('pages without frontmatter stay without frontmatter', async () => {
    await api('/page', 'PUT', { slug: 'zeta/b-second', markdown: '# Second\n\nMore.\n', data: { title: '', description: '', order: '' } });
    assert.equal(fs.readFileSync(path.join(dir, 'rhyla-docs/body/zeta/b-second.md'), 'utf8'), '# Second\n\nMore.\n');
  });

  test('uploads images into public/uploads', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const res = await api('/upload?name=My Diagram.PNG', 'POST', png, { 'content-type': 'application/octet-stream' });
    const data = await res.json();
    assert.equal(data.src, '/public/uploads/my-diagram.png');
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/public/uploads/my-diagram.png')));
    const again = await (await api('/upload?name=My Diagram.PNG', 'POST', png, { 'content-type': 'application/octet-stream' })).json();
    assert.equal(again.src, '/public/uploads/my-diagram-2.png');
    assert.equal((await api('/upload?name=evil.html', 'POST', png, { 'content-type': 'application/octet-stream' })).status, 400);
  });
});
