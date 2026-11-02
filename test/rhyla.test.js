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
import { buildFlowGraph, layoutFlow, decoratePage, renderFlowDiagram } from '../src/core/flows.js';
import { parseBlocks, serializeBlocks } from '../src/core/blocks.js';
import { findRoutes, projectStats } from '../src/core/routes.js';
import { findLogoCandidates } from '../src/core/setup.js';
import { normalizeApi, withApiReference } from '../src/core/api.js';
import { buildOpenApi, importOpenApi, parseSpec } from '../src/core/openapi.js';
import { exportSpec, importSpec, initWithImport, openapiExport } from '../src/commands/openapi.js';
import { detectFormat, importDocument, parseSource } from '../src/core/import.js';
import { checkDocs, createRouteMatcher } from '../src/core/check.js';
import check, { githubAnnotation } from '../src/commands/check.js';
import { routeEndpoint, tryData, tryPanelHtml, trySettings } from '../src/core/try.js';
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
  const json = async (res) => JSON.parse((await res).result.content[0].text);
  before(() => {
    dir = tmpProject();
    server = createMcpServer({ cwd: dir });
  });

  test('initialize negotiates the protocol version', async () => {
    const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(res.result.protocolVersion, '2025-06-18');
    assert.ok(res.result.capabilities.tools);
    assert.ok(res.result.capabilities.prompts);
    const future = await server.handle({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '2099-01-01' } });
    assert.equal(future.result.protocolVersion, '2025-11-25');
    assert.equal(await server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 3, method: 'nope' })).error.code, -32601);
  });

  test('lists the tools, without the writing ones when read-only', async () => {
    const names = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map((t) => t.name);
    assert.deepEqual(names, [
      'init_docs', 'setup_wizard', 'set_plan', 'set_site', 'find_routes', 'check_docs', 'import_openapi', 'save_preferences', 'ask_preferences', 'list_pages', 'read_page', 'search_docs', 'get_flow',
      'get_conventions', 'write_page', 'edit_page', 'delete_page', 'clear_docs', 'get_changes', 'mark_synced', 'start_preview', 'stop_preview',
    ]);
    const ro = createMcpServer({ cwd: dir, readOnly: true });
    const roNames = (await ro.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map((t) => t.name);
    assert.deepEqual(roNames, ['find_routes', 'check_docs', 'list_pages', 'read_page', 'search_docs', 'get_flow', 'get_conventions', 'get_changes', 'start_preview', 'stop_preview']);
    assert.deepEqual((await ro.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/list' })).result.prompts.map((p) => p.name), ['preview']);
  });

  test('list_pages, read_page and search_docs', async () => {
    const list = await json(call('list_pages', { group: 'zeta' }));
    assert.deepEqual(list.pages.map((p) => p.route), ['/zeta/z-first', '/zeta/b-second', '/zeta/custom']);
    assert.ok(!(await json(call('list_pages'))).pages.some((p) => p.route.includes('kit_dev_rhyla')));

    const read = await call('read_page', { route: '/zeta/z-first' });
    assert.equal(JSON.parse(read.result.content[0].text).title, 'First page');
    assert.match(read.result.content[1].text, /^---\ntitle: First page/);

    const found = await json(call('search_docs', { query: 'FIRST page' }));
    assert.equal(found.results[0].route, '/zeta/z-first');
  });

  test('tool errors are reported as isError results', async () => {
    assert.equal((await call('read_page', { route: '/missing' })).result.isError, true);
    assert.equal((await call('write_page', { path: '../../escape', content: 'x' })).result.isError, true);
    assert.equal((await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })).error.code, -32602);
  });

  test('write_page creates pages inside body/', async () => {
    const res = await json(call('write_page', { path: 'api/users/post-create_user', content: '---\ntitle: Create user\n---\n\n# POST /users' }));
    assert.equal(res.action, 'created');
    assert.equal(res.route, '/api/users/post-create_user');
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/body/api/users/post-create_user.md')));
    assert.equal((await json(call('write_page', { path: 'api/users/post-create_user.md', content: '# Again' }))).action, 'updated');
  });

  test('init_docs creates a blank workspace that builds', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-test-'));
    const fresh = createMcpServer({ cwd: empty });
    const call2 = (name, args = {}) => json(fresh.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));
    assert.match((await fresh.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_pages', arguments: {} } })).result.content[0].text, /init_docs/);

    const created = await call2('init_docs', { title: 'Tasks API', description: 'A small task list API.' });
    assert.equal(created.status, 'created');
    assert.deepEqual(created.pages, ['/']);
    const config = JSON.parse(fs.readFileSync(path.join(empty, 'rhyla-docs/config.json'), 'utf8'));
    assert.equal(config.title, 'Tasks API');
    assert.equal(config.description, 'A small task list API.');
    assert.equal(fs.readFileSync(path.join(empty, 'rhyla-docs/body/home.md'), 'utf8'), '# Tasks API\n\nA small task list API.\n');
    assert.ok(!fs.existsSync(path.join(empty, 'rhyla-docs/body/guide')));
    assert.equal((await call2('init_docs')).status, 'exists');

    build({ cwd: empty, quiet: true });
    assert.match(fs.readFileSync(path.join(empty, 'dist/index.html'), 'utf8'), /<h1>Tasks API<\/h1>/);
    assert.ok(fs.existsSync(path.join(empty, 'dist/404.html')));
  });

  test('edit_page replaces an exact piece of text', async () => {
    await call('write_page', { path: 'edit/target', content: '---\ntitle: Old title\n---\n\nPrice: $1.\nSee also: x.\nSee also: x.\n' });
    const file = path.join(dir, 'rhyla-docs/body/edit/target.md');
    const res = await json(call('edit_page', { route: '/edit/target', old_text: 'title: Old title', new_text: 'title: New title' }));
    assert.deepEqual(res, { action: 'edited', route: '/edit/target', file: 'body/edit/target.md', replacements: 1 });
    // "$" no texto novo não é tratado como padrão de substituição
    await call('edit_page', { route: '/edit/target', old_text: 'Price: $1.', new_text: 'Price: $& $1 $$.' });
    assert.match(fs.readFileSync(file, 'utf8'), /^---\ntitle: New title\n---\n\nPrice: \$& \$1 \$\$\.\n/);

    const twice = await call('edit_page', { route: '/edit/target', old_text: 'See also: x.', new_text: 'See also: y.' });
    assert.equal(twice.result.isError, true);
    assert.match(twice.result.content[0].text, /appears 2 times/);
    assert.equal((await json(call('edit_page', { route: '/edit/target', old_text: 'See also: x.\n', new_text: '', replace_all: true }))).replacements, 2);
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /See also/);

    assert.match((await call('edit_page', { route: '/edit/target', old_text: 'missing', new_text: 'x' })).result.content[0].text, /was not found/);
    assert.equal((await call('edit_page', { route: '/nope', old_text: 'a', new_text: 'b' })).result.isError, true);
    assert.equal((await call('edit_page', { route: '/edit/target', old_text: '', new_text: 'b' })).result.isError, true);
  });

  test('get_conventions leaves the flow format for its own topic and keeps custom sections', async () => {
    const project = tmpProject();
    const srv = createMcpServer({ cwd: project });
    const get = async (args) => (await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_conventions', arguments: args } })).result.content[0].text;
    const agents = path.join(project, 'rhyla-docs/AGENTS.md');
    fs.appendFileSync(agents, '\n## Team rules\n\nAlways link the ticket.\n');

    const pages = await get({});
    const headings = (text) => text.split('\n').filter((l) => /^## /.test(l));
    assert.ok(headings(pages).includes('## Team rules'));
    assert.ok(headings(pages).includes('## API endpoint pages'));
    assert.match(pages, /Always link the ticket\.\n\n## Flows\n\nFlow pages \(type: flow\) have their own format: call get_conventions with topic "flows"/);
    for (const gone of ['type: flow\nsteps:', '## Commands', '## MCP', '## Machine-readable output']) assert.ok(!pages.includes(gone), gone);
    // Os "## " dentro do exemplo de página de API continuam no bloco de código
    assert.match(pages, /\napi:\n  method: POST[\s\S]*## Business rules[\s\S]*````/);

    const flows = await get({ topic: 'flows' });
    assert.match(flows, /^## Flows\n[\s\S]*type: flow\nsteps:/);
    assert.ok(!flows.includes('## Layout'));
    assert.equal(await get({ topic: 'all' }), fs.readFileSync(agents, 'utf8').trimEnd() + '\n');

    // Sem a seção no AGENTS.md do projeto, o formato vem do template
    fs.writeFileSync(agents, '# Custom\n\n## Layout\n\nOur own layout.\n');
    assert.match(await get({ topic: 'flows' }), /type: flow\nsteps:/);
  });

  test('delete_page removes pages and empty folders, but not home or 404', async () => {
    await call('write_page', { path: 'tmp/nested/gone', content: '# Gone' });
    const res = await json(call('delete_page', { route: '/tmp/nested/gone' }));
    assert.equal(res.action, 'deleted');
    assert.ok(!fs.existsSync(path.join(dir, 'rhyla-docs/body/tmp')));
    assert.ok(fs.existsSync(path.join(dir, 'rhyla-docs/body/zeta/custom.html')));
    assert.equal((await json(call('delete_page', { route: '/zeta/custom' }))).file, 'body/zeta/custom.html');
    assert.equal((await call('delete_page', { route: '/' })).result.isError, true);
    assert.equal((await call('delete_page', { route: '/notFound' })).result.isError, true);
    assert.equal((await call('delete_page', { route: '/missing' })).result.isError, true);
  });

  test('start_preview serves the site and stop_preview stops it', async () => {
    const started = await json(call('start_preview', { port: 0 }));
    assert.equal(started.status, 'started');
    assert.match(await (await fetch(started.url + '/zeta/z-first')).text(), /<h1>First page<\/h1>/);
    assert.deepEqual(await json(call('start_preview', { port: 0 })), { status: 'running', url: started.url });
    assert.equal((await json(call('stop_preview'))).status, 'stopped');
    await assert.rejects(fetch(started.url));
    assert.equal((await json(call('stop_preview'))).status, 'not_running');
  });

  test('start_preview moves to the next port when the first is busy', async () => {
    const busy = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => busy.once('listening', r));
    const port = busy.address().port;
    try {
      const started = await json(call('start_preview', { port }));
      assert.notEqual(new URL(started.url).port, String(port));
      assert.equal((await fetch(started.url)).status, 200);
    } finally {
      await json(call('stop_preview'));
      busy.close();
    }
  });

  test('prompts: init opens the wizard and adapts to the project state', async () => {
    const prompt = async (srv, name, args = {}) => (await srv.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name, arguments: args } })).result.messages[0].content.text;
    const list = (await server.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/list' })).result.prompts;
    assert.deepEqual(list.map((p) => p.name), ['init', 'sync', 'clear', 'preview', 'page', 'flow']);
    assert.deepEqual(list.find((p) => p.name === 'page').arguments, [{ name: 'path', description: 'File or folder to document, e.g. src/routes/users.js.', required: true }]);

    const empty = createMcpServer({ cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-test-')) });
    const first = await prompt(empty, 'init', { language: 'Portuguese' });
    assert.match(first, /call setup_wizard with language: "Portuguese"/);
    assert.match(first, /setup_wizard[\s\S]*find_routes[\s\S]*wait: true[\s\S]*set_plan[\s\S]*pages: \[\.\.\.\][\s\S]*mark_synced/);
    assert.match(first, /ask_preferences instead/);
    assert.doesNotMatch(first, /already exists/);
    assert.doesNotMatch(await prompt(empty, 'init'), /with language:/);

    // Projeto com o template de exemplo: só as páginas de exemplo intactas são listadas para remoção
    const demo = tmpProject();
    fs.appendFileSync(path.join(demo, 'rhyla-docs/body/guide/guide-pt.md'), '\nEditado para este projeto.\n');
    const text = await prompt(createMcpServer({ cwd: demo }), 'init');
    assert.match(text, /already exists/);
    assert.match(text, /\/guide\/guide-en/);
    assert.match(text, /\/flows\/publish_docs/);
    assert.doesNotMatch(text, /\/guide\/guide-pt/);
    assert.match(text, /home\.md is still the Rhyla sample home page/);

    assert.match(await prompt(server, 'sync'), /get_changes[\s\S]*Follow the preferences returned by get_conventions \(language, mode[\s\S]*mark_synced/);
    assert.match(await prompt(server, 'clear'), /Do not continue without an explicit yes[\s\S]*clear_docs/);
    assert.match(await prompt(server, 'preview'), /Do not change any file/);
    assert.match(await prompt(server, 'page', { path: 'src/routes/tasks.js' }), /^Document `src\/routes\/tasks\.js`/);
    assert.match(await prompt(server, 'flow', { process: 'checkout' }), /the "checkout" process/);
    assert.match(await prompt(server, 'flow'), /ask the user which one/);

    assert.equal((await server.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'nope' } })).error.code, -32602);
  });

  test('save_preferences merges into config.json and get_conventions explains the mode', async () => {
    const project = tmpProject();
    const srv = createMcpServer({ cwd: project });
    const call2 = (name, args = {}) => srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    assert.doesNotMatch((await call2('get_conventions')).result.content[0].text, /Preferences for this project/);

    await call2('save_preferences', { language: 'Portuguese', mode: 'essential', flows: true, examples: ['curl', ' javascript '] });
    const saved = await json(call2('save_preferences', { examples: [] }));
    assert.deepEqual(saved.preferences, { language: 'Portuguese', mode: 'essential', flows: true, examples: [] });
    assert.match((await call2('save_preferences', { mode: 'huge' })).result.content[0].text, /mode must be one of: essential, balanced, complete/);
    const config = JSON.parse(fs.readFileSync(path.join(project, 'rhyla-docs/config.json'), 'utf8'));
    assert.equal(config.title, 'Documentation Standard');
    assert.equal(config.preferences.mode, 'essential');

    const conventions = (await call2('get_conventions')).result.content[0].text;
    assert.match(conventions, /## Preferences for this project[\s\S]*- Language: Portuguese\n- Mode: Essential \(routes only\)\. The cheapest mode\. Read only the route files[\s\S]*find_routes[\s\S]*\n- Flowcharts: yes\. Add a flow page[\s\S]*\n- Request examples: none/);
    await call2('save_preferences', { mode: 'complete', flows: false });
    assert.match((await call2('get_conventions')).result.content[0].text, /- Mode: Complete \(the whole project\)\. Read the whole code base[\s\S]*- Flowcharts: no\. Do not create flow pages\./);
    build({ cwd: project, quiet: true });
  });

  test('ask_preferences shows a form with fixed options and saves the answers', async () => {
    const project = tmpProject();
    const sent = [];
    let answer = { action: 'accept', content: { language: 'Português (Brasil)', mode: 'essential', flows: true, audience: 'Both', example_curl: true, example_python: true, notes: ' tom informal ' } };
    const srv = createMcpServer({
      cwd: project,
      send: (m) => { sent.push(m); setImmediate(() => srv.handle({ jsonrpc: '2.0', id: m.id, ...(answer.error ? { error: answer.error } : { result: answer }) })); },
    });
    await srv.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: {} } } });
    const ask = (args = {}) => json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_preferences', arguments: args } }));

    const res = await ask({ language: 'Portuguese', mode: 'essential' });
    assert.equal(sent[0].method, 'elicitation/create');
    const schema = sent[0].params.requestedSchema;
    assert.deepEqual(schema.properties.language.enum, ['Português (Brasil)', 'English', 'Español', 'Other (write it in Notes)']);
    assert.equal(schema.properties.language.default, 'Português (Brasil)');
    assert.deepEqual(schema.properties.mode.enum, ['essential', 'balanced', 'complete']);
    assert.equal(schema.properties.mode.default, 'essential');
    assert.equal(schema.properties.flows.default, false);
    assert.equal(schema.properties.audience.default, 'Developers who use the API or library');
    assert.equal(schema.properties.example_curl.default, true);
    assert.ok(Object.values(schema.properties).every((p) => ['string', 'boolean'].includes(p.type)));

    assert.equal(res.status, 'saved');
    assert.match(res.preferences, /- Mode: Essential/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, 'rhyla-docs/config.json'), 'utf8')).preferences, {
      language: 'Português (Brasil)', mode: 'essential', flows: true, audience: 'Both', examples: ['curl', 'python'], notes: 'tom informal',
    });

    // Sem API HTTP: nada de exemplos; o que já foi salvo vira o padrão
    await ask({ has_api: false });
    const noApi = sent[1].params.requestedSchema.properties;
    assert.ok(!('example_curl' in noApi));
    assert.equal(noApi.mode.default, 'essential');
    assert.equal(noApi.flows.default, true);

    answer = { action: 'decline' };
    assert.equal((await ask()).status, 'declined');
    answer = { error: { code: -32603, message: 'boom' } };
    assert.equal((await ask()).status, 'ask');
  });

  test('ask_preferences returns the same questions when the client has no forms', async () => {
    const srv = createMcpServer({ cwd: tmpProject(), send: () => assert.fail('nothing should be sent') });
    await srv.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
    const res = await json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_preferences', arguments: { language: 'English' } } }));
    assert.equal(res.status, 'ask');
    assert.deepEqual(res.questions.map((q) => q.id), ['language', 'mode', 'flows', 'examples']);
    assert.ok(res.questions.every((q) => q.options.length >= 2 && q.options.length <= 4));
    assert.equal(res.questions[0].suggested, 'English');
    assert.deepEqual(res.questions[1].options.map((o) => o.value), ['essential', 'balanced', 'complete']);
    assert.equal(res.questions[1].suggested, 'balanced');
    assert.equal(res.questions[2].suggested, false);
  });

  test('the form goes out and its answer comes back over stdio', async () => {
    const { spawn } = await import('node:child_process');
    const project = tmpProject();
    const cli = new URL('../bin/cli.js', import.meta.url).pathname;
    const child = spawn(process.execPath, [cli, 'mcp', '--dir', project], { stdio: ['pipe', 'pipe', 'pipe'] });
    const write = (m) => child.stdin.write(JSON.stringify(m) + '\n');
    let buf = '';
    const result = new Promise((resolve) => {
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const msg = JSON.parse(buf.slice(0, i));
          buf = buf.slice(i + 1);
          if (msg.method === 'elicitation/create') {
            write({ jsonrpc: '2.0', id: msg.id, result: { action: 'accept', content: { language: 'English', mode: 'complete', flows: false, audience: 'Both' } } });
          } else if (msg.id === 2) resolve(msg);
        }
      });
    });
    write({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: { elicitation: { form: {}, url: {} } } } });
    write({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'ask_preferences', arguments: {} } });
    const res = await result;
    child.kill();
    assert.equal(res.result.structuredContent.status, 'saved');
    assert.match(res.result.structuredContent.preferences, /- Language: English\n- Mode: Complete/);
  });

  test('write_page writes several pages in one call, or none if one path is invalid', async () => {
    const res = await json(call('write_page', { pages: [
      { path: 'batch/one', content: '---\ntitle: One\n---\n\nFirst.' },
      { path: 'batch/two.md', content: '# Two' },
    ] }));
    assert.deepEqual(res.written.map((w) => [w.action, w.route, w.title]), [['created', '/batch/one', 'One'], ['created', '/batch/two', 'Two']]);
    const bad = await call('write_page', { pages: [{ path: 'batch/three', content: '# Three' }, { path: '../../escape', content: 'x' }] });
    assert.equal(bad.result.isError, true);
    assert.ok(!fs.existsSync(path.join(dir, 'rhyla-docs/body/batch/three.md')));
    assert.equal((await call('write_page', { pages: [] })).result.isError, true);
  });

  test('setup_wizard opens the wizard, waits for the answers and shows the progress', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-test-'));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'tasks-api', description: 'Tasks over HTTP.', dependencies: { fastify: '5' } }));
    fs.mkdirSync(path.join(project, 'src/routes'), { recursive: true });
    fs.writeFileSync(path.join(project, 'src/app.js'), "import tasks from './routes/tasks.js';\napp.register(tasks, { prefix: '/tasks' });\n");
    fs.writeFileSync(path.join(project, 'src/routes/tasks.js'), "export default async function (app) {\n  app.get('/', list);\n  app.post('/', create);\n}\n");
    const srv = createMcpServer({ cwd: project, setupWaitMs: 50 });
    const call2 = (name, args = {}) => json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));

    assert.match((await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'setup_wizard', arguments: { wait: true } } })).result.content[0].text, /Open the wizard first/);

    const opened = await call2('setup_wizard', { open: false, language: 'Portuguese' });
    assert.equal(opened.status, 'open');
    assert.equal(opened.opened, false);
    assert.match(opened.url, /^http:\/\/127\.0\.0\.1:\d+\/__rhyla\/setup$/);
    // Cria rhyla-docs/ em branco, com o nome e a descrição do package.json
    assert.equal(fs.readFileSync(path.join(project, 'rhyla-docs/body/home.md'), 'utf8'), '# tasks-api\n\nTasks over HTTP.\n');
    const base = opened.url.replace('/__rhyla/setup', '');
    try {
      assert.match(await (await fetch(opened.url)).text(), /setup\.js/);
      const info = await (await fetch(`${base}/__rhyla/api/setup`)).json();
      assert.equal(info.agent, true);
      assert.deepEqual(info.project, {
        name: 'tasks-api', sources: [], codeFiles: 2, lines: 6, routes: 2, routeFiles: 2,
        routeList: [{ method: 'GET', path: '/tasks' }, { method: 'POST', path: '/tasks' }],
      });
      assert.equal(info.preferences.language, 'Português (Brasil)');

      assert.equal((await call2('setup_wizard', { wait: true })).status, 'waiting');
      const waiting = call2('setup_wizard', { wait: true });
      const bad = await fetch(`${base}/__rhyla/api/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ language: 'English', mode: 'nope' }) });
      assert.equal(bad.status, 400);
      const ok = await fetch(`${base}/__rhyla/api/setup`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ language: 'Português (Brasil)', mode: 'essential', flows: false, audience: 'Both', examples: ['curl'] }),
      });
      assert.equal(ok.status, 200);
      const saved = await waiting;
      assert.equal(saved.status, 'saved');
      assert.match(saved.preferences, /- Mode: Essential \(routes only\)/);
      // Título e logo em branco ficam para o agente
      assert.match(saved.site_todo, /- Site title: the user left it to you[\s\S]*- Logo: the user left it to you, and no logo file was found/);

      const status = async () => (await fetch(`${base}/__rhyla/api/setup/status`)).json();
      assert.equal((await status()).phase, 'saved');
      assert.equal((await call2('set_plan', { pages: [{ path: 'home', title: 'Home' }, { path: 'api/tasks/get-list', title: 'List tasks' }] })).planned, 2);
      await call2('write_page', { path: 'api/tasks/get-list', content: '# List tasks' });
      const building = await status();
      assert.equal(building.phase, 'building');
      // A home criada pelo wizard só conta depois que o agente a reescreve
      assert.deepEqual(building.pages.map((p) => [p.slug, p.written]), [['home', false], ['api/tasks/get-list', true]]);
      await new Promise((r) => setTimeout(r, 20));
      await call2('write_page', { path: 'home', content: '# Tasks API' });
      assert.deepEqual((await status()).pages.map((p) => p.written), [true, true]);
      await call2('mark_synced');
      const finished = await status();
      assert.equal(finished.phase, 'done');
      // O tempo total para quando o agente termina
      assert.equal(typeof finished.elapsed, 'number');
      await new Promise((r) => setTimeout(r, 20));
      assert.equal((await status()).elapsed, finished.elapsed);
    } finally {
      await call2('stop_preview');
    }
  });

  test('the wizard saves the title and the uploaded logo, and the site shows them', async () => {
    const project = tmpProject();
    const server2 = dev({ cwd: project, port: 0, quiet: true });
    await new Promise((r) => server2.once('listening', r));
    const base = `http://127.0.0.1:${server2.address().port}/__rhyla/api/setup`;
    try {
      assert.equal((await (await fetch(base)).json()).site.title, '');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
      assert.equal((await fetch(`${base}/logo?name=notes.txt`, { method: 'POST', body: 'x' })).status, 400);
      const up = await (await fetch(`${base}/logo?name=Brand.SVG`, { method: 'POST', body: svg })).json();
      assert.equal(up.src, '/public/logo.svg');
      // A logo de exemplo do template (logo.png) dá lugar à nova
      assert.ok(!fs.existsSync(path.join(project, 'rhyla-docs/public/logo.png')));
      const res = await fetch(base, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: '  Tasks API ', logo: up.src, language: 'English', mode: 'balanced' }),
      });
      assert.equal(res.status, 200);
      const config = JSON.parse(fs.readFileSync(path.join(project, 'rhyla-docs/config.json'), 'utf8'));
      assert.equal(config.title, 'Tasks API');
      assert.equal(config.logo, '/public/logo.svg');
      const page = await (await fetch(base.replace('/__rhyla/api/setup', '/zeta/z-first'))).text();
      assert.match(page, /<img class="rh-brand-logo" src="\/public\/logo\.svg" alt="">/);
      assert.doesNotMatch(page, /rh-brand-mark/);
    } finally {
      server2.close();
    }
    const cfgFile = path.join(project, 'rhyla-docs/config.json');
    fs.writeFileSync(cfgFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(cfgFile, 'utf8')), base: '/docs/' }));
    build({ cwd: project, quiet: true });
    const html = fs.readFileSync(path.join(project, 'dist/zeta/z-first.html'), 'utf8');
    assert.match(html, /<img class="rh-brand-logo" src="\/docs\/public\/logo\.svg" alt="">/);
    assert.match(html, /id="rhyla-title"[^>]*>Tasks API</);
    assert.ok(fs.existsSync(path.join(project, 'dist/public/logo.svg')));
  });

  test('set_site sets the title and copies a logo from the project', async () => {
    const project = tmpProject();
    fs.mkdirSync(path.join(project, 'assets/img'), { recursive: true });
    fs.writeFileSync(path.join(project, 'assets/img/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(project, 'assets/favicon.ico'), 'ico');
    fs.writeFileSync(path.join(project, 'notes.txt'), 'x');
    const srv = createMcpServer({ cwd: project });
    const call2 = (name, args = {}) => srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });

    assert.deepEqual(findLogoCandidates(project), ['assets/img/logo.png', 'assets/favicon.ico']);
    assert.deepEqual(await json(call2('set_site', { title: 'Tasks', logo_file: 'assets/img/logo.png' })), { title: 'Tasks', logo: '/public/logo.png' });
    assert.deepEqual(fs.readFileSync(path.join(project, 'rhyla-docs/public/logo.png')), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'rhyla-docs/config.json'), 'utf8')).logo, '/public/logo.png');
    assert.match((await call2('set_site', { logo_file: '../outside.png' })).result.content[0].text, /inside the project/);
    assert.match((await call2('set_site', { logo_file: 'notes.txt' })).result.content[0].text, /must be an image/);
    assert.equal((await call2('set_site', {})).result.isError, true);
  });

  test('find_routes lists the routes with their prefixes', async () => {
    const found = await json(call('find_routes'));
    assert.equal(found.count, 0);
    assert.match(found.note, /pattern matching/);
  });

  test('a form still open when the connection closes does not hang', async () => {
    const srv = createMcpServer({ cwd: tmpProject(), send: () => {} });
    await srv.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { capabilities: { elicitation: { form: {} } } } });
    const pending = srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_preferences', arguments: {} } });
    setImmediate(() => srv.close());
    const res = await pending;
    assert.equal(res.result.isError, true);
    assert.match(res.result.content[0].text, /closed before the user answered/);
  });

  test('clear_docs needs confirmation and leaves a blank site that builds', async () => {
    const project = tmpProject();
    const srv = createMcpServer({ cwd: project });
    const call2 = (name, args = {}) => srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    await call2('mark_synced');
    assert.equal((await call2('clear_docs', { confirm: false })).result.isError, true);
    assert.ok(fs.existsSync(path.join(project, 'rhyla-docs/body/guide')));

    const res = await json(call2('clear_docs', { confirm: true }));
    assert.equal(res.action, 'cleared');
    assert.ok(res.deleted > 5);
    assert.deepEqual(fs.readdirSync(path.join(project, 'rhyla-docs/body')).sort(), ['home.md', 'notFound.html']);
    assert.equal(fs.readFileSync(path.join(project, 'rhyla-docs/body/home.md'), 'utf8'), '# Documentation Standard\n\nGenerated with Rhyla\n');
    assert.ok(!fs.existsSync(path.join(project, 'rhyla-docs/sync.json')));
    assert.ok(fs.existsSync(path.join(project, 'rhyla-docs/styles')));

    build({ cwd: project, quiet: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, 'dist/search_index.json'), 'utf8')).map((e) => e.route), ['/']);
  });

  test('get_changes lists code changes since mark_synced', async () => {
    const { execFileSync } = await import('node:child_process');
    const project = tmpProject();
    const srv = createMcpServer({ cwd: project });
    const changes = () => json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_changes', arguments: {} } }));
    const sync = () => json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'mark_synced', arguments: {} } }));
    const run = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: project, stdio: 'ignore' });

    // Sem git: compara tudo
    const noGit = await changes();
    assert.equal(noGit.git, false);
    assert.equal(noGit.files, null);

    fs.mkdirSync(path.join(project, 'src'));
    fs.writeFileSync(path.join(project, 'src/app.js'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(project, 'src/old.js'), 'export const old = 1;\n');
    run('init', '-q');
    run('add', '-A');
    run('commit', '-q', '-m', 'first');
    assert.match((await changes()).note, /Never synced/);

    const marked = await sync();
    assert.match(marked.commit, /^[0-9a-f]{40}$/);
    assert.deepEqual((await changes()).files, []);

    // Commit novo + mudança não commitada + arquivo novo; mudanças nas docs e no dist não contam
    run('mv', 'src/old.js', 'src/renamed.js');
    run('commit', '-q', '-m', 'rename');
    fs.appendFileSync(path.join(project, 'src/app.js'), 'export const b = 2;\n');
    fs.writeFileSync(path.join(project, 'src/new.js'), 'export const n = 1;\n');
    fs.writeFileSync(path.join(project, 'rhyla-docs/body/zeta/b-second.md'), '# Changed\n');
    fs.mkdirSync(path.join(project, 'dist'));
    fs.writeFileSync(path.join(project, 'dist/index.html'), 'x');

    const after = await changes();
    assert.equal(after.since, marked.commit);
    assert.deepEqual(after.files.sort((x, y) => x.file.localeCompare(y.file)), [
      { status: 'modified', file: 'src/app.js' },
      { status: 'added', file: 'src/new.js' },
      { status: 'renamed', file: 'src/renamed.js', from: 'src/old.js' },
    ]);
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

describe('route scanner', () => {
  function project(files, deps = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-routes-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: deps }));
    for (const [rel, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
  }
  const list = (result) => result.routes.map((r) => `${r.method} ${r.path}`);

  test('express routers mounted with use(), including require() and middleware', () => {
    const root = project({
      'src/server.js': "const express = require('express');\nconst users = require('./routes/users');\nconst app = express();\napp.use('/api/users', auth, users);\napp.use('/orders', require('./routes/orders'));\napp.use(express.static('public'));\napp.get('/health', (req, res) => res.send('ok'));\n",
      'src/routes/users.js': "const router = require('express').Router();\nrouter.get('/', list);\nrouter.get('/:id', show);\nrouter.delete('/:id', remove);\nmodule.exports = router;\n",
      'src/routes/orders.js': "const r = require('express').Router();\nr.post('/', create);\nmodule.exports = r;\n",
      // Cliente HTTP e testes não são rotas
      'src/services/api.js': "import axios from 'axios';\nexport const getUser = (id) => axios.get('/users/' + id);\nexport const all = () => client.post('/users');\n",
      'test/users.test.js': "app.get('/should-not-appear', h);\n",
    }, { express: '4' });
    const result = findRoutes(root);
    assert.deepEqual(result.frameworks, ['express']);
    assert.deepEqual(list(result), ['GET /api/users', 'DELETE /api/users/:id', 'GET /api/users/:id', 'GET /health', 'POST /orders']);
    assert.equal(result.routes.find((r) => r.path === '/api/users/:id' && r.method === 'GET').prefix_from, 'src/server.js:4');
    assert.deepEqual(result.files, ['src/routes/orders.js', 'src/routes/users.js', 'src/server.js']);
  });

  test('fastify plugins, route objects and unresolved mounts', () => {
    const root = project({
      'src/app.ts': "import Fastify from 'fastify';\nimport tasks from './routes/tasks.js';\nconst app = Fastify();\napp.register(tasks, { prefix: '/v1/tasks' });\napp.register(somePlugin, { prefix: '/x' });\napp.route({\n  method: ['GET', 'HEAD'],\n  url: '/status',\n  handler,\n});\n",
      'src/routes/tasks.ts': "export default async function (app) {\n  app.get('/', list);\n  app.patch('/:id', update);\n}\n",
    }, { fastify: '5' });
    const result = findRoutes(root);
    assert.deepEqual(list(result), ['GET /status', 'HEAD /status', 'GET /v1/tasks', 'PATCH /v1/tasks/:id']);
    assert.deepEqual(result.unresolved_mounts, [{ prefix: '/x', file: 'src/app.ts', line: 5, ident: 'somePlugin' }]);
  });

  test('nest controllers, next.js route handlers, hono and koa', () => {
    const root = project({
      'src/main.ts': "const app = await NestFactory.create(AppModule);\napp.setGlobalPrefix('api');\n",
      'src/users/users.controller.ts': "@Controller('users')\nexport class UsersController {\n  @Get()\n  list() {}\n  @Get(':id')\n  one() {}\n  @Post()\n  create() {}\n}\n",
      'app/(shop)/items/[id]/route.ts': "export async function GET() {}\nexport const DELETE = async () => {};\n",
      'pages/api/legacy/[slug].ts': 'export default function handler(req, res) {}\n',
      'server/hono.ts': "import { Hono } from 'hono';\nimport admin from './admin';\nconst app = new Hono();\napp.route('/admin', admin);\n",
      'server/admin.ts': "import { Hono } from 'hono';\nconst admin = new Hono();\nadmin.get('/stats', h);\nexport default admin;\n",
      'server/koa.js': "const Router = require('@koa/router');\nconst router = new Router({ prefix: '/k' });\nrouter.get('/ping', h);\n",
    }, { '@nestjs/core': '10', next: '14', hono: '4', '@koa/router': '12' });
    assert.deepEqual(list(findRoutes(root)), [
      'GET /admin/stats', 'ANY /api/legacy/:slug', 'GET /api/users', 'POST /api/users', 'GET /api/users/:id',
      'DELETE /items/:id', 'GET /items/:id', 'GET /k/ping',
    ]);
  });

  test('project stats count code files and lines, outside node_modules', () => {
    const root = project({ 'a.js': 'one\ntwo\n', 'b.py': 'x', 'README.md': '# not code\n', 'node_modules/dep/index.js': 'ignored\n' });
    assert.deepEqual(projectStats(root), { codeFiles: 2, lines: 3 });
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

  test('layout routes long edges through their own path, without crossings or shared ports', () => {
    // Cenário real: uma decisão nova ligada a passos de várias camadas
    const { flows } = buildFlowGraph([flowPage([
      { id: 'login', next: [{ to: 'cart', label: 'yes' }, { to: 'create', label: 'no' }] },
      { id: 'create', next: 'cart' },
      { id: 'cart', next: 'pay' },
      { id: 'pay', next: [{ to: 'done', label: 'ok' }, { to: 'declined', label: 'declined' }] },
      { id: 'done' },
      { id: 'declined', next: { to: 'pay', label: 'retry' } },
      { id: 'decision', next: ['cart', 'pay', 'list'] },
      { id: 'list' },
    ])]);
    const layout = layoutFlow(flows[0]);
    assert.equal(layout.crossings, 0);
    const real = [...layout.nodes.values()].filter((n) => !n.dummy);
    // Nenhum nó se sobrepõe
    for (const a of real) for (const b of real) {
      if (a === b || a.rank !== b.rank) continue;
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, `${a.id} overlaps ${b.id}`);
    }
    // Arestas longas passam por pontos próprios entre as camadas (sem faixa lateral)
    const long = layout.edges.find((e) => e.from === 'decision' && e.to === 'pay');
    assert.ok(long.skip && long.points.length > 2);
    const left = Math.min(...real.map((n) => n.x));
    assert.ok(long.points.every((p) => p.x >= left), 'long edges stay inside the diagram');
    // Arestas que chegam ao mesmo passo entram por pontos diferentes
    const into = layout.edges.filter((e) => e.to === 'cart').map((e) => e.in);
    assert.equal(new Set(into).size, into.length);
    assert.deepEqual(layout.backEdges.map((e) => `${e.from}>${e.to}`), ['declined>pay']);
  });

  test('diagram exposes steps and connections for highlighting and the editor', () => {
    const pages = [page('a'), page('b'), flowPage([{ id: 'x', page: 'a', next: { to: 'y', label: 'go' } }, { id: 'y', page: 'b', next: 'x' }])];
    const svg = renderFlowDiagram(buildFlowGraph(pages).flows[0], links);
    assert.match(svg, /class="rh-flow-link" data-from="x" data-to="y" data-edge="x&gt;y"/);
    assert.match(svg, /class="rh-flow-link is-back" data-from="y" data-to="x"/);
    assert.match(svg, /class="rh-flow-pill" data-edge="x&gt;y">.*<text[^>]*>go<\/text>/);
    assert.match(svg, /class="rh-flow-hit"/);
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

  test('mcp get_flow lists and reads flows', async () => {
    const dir = tmpProject();
    const server = createMcpServer({ cwd: dir });
    const call = async (args) => JSON.parse((await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_flow', arguments: args } })).result.content[0].text);
    assert.deepEqual((await call({})).flows.map((f) => f.route), ['/flows/publish_docs']);
    const flow = await call({ route: '/flows/publish_docs' });
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

describe('api block and openapi', () => {
  // Projeto em branco com páginas de rota (bloco `api:`) e preferências em português
  function apiProject(preferences = { language: 'Português (Brasil)', examples: ['curl'] }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-api-'));
    init({ cwd: dir, quiet: true, blank: true, title: 'Tasks', description: 'Task API' });
    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), preferences }, null, 2));
    const body = path.join(dir, 'rhyla-docs/body');
    fs.mkdirSync(path.join(body, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(body, 'tasks/post-create_task.md'), `---
title: Criar tarefa
description: Cria uma tarefa.
api:
  method: POST
  path: /tasks/:listId
  auth: bearer
  params:
    listId: { type: integer, description: Lista da tarefa, example: 7 }
  body:
    fields:
      title: { type: string, required: true, minLength: 1, description: O que fazer }
      done: { type: boolean, default: false }
    example: { title: Comprar pão }
  responses:
    201:
      description: Created
      fields: { id: integer, title: string }
      example: { id: 1, title: Comprar pão }
    400: title ausente ou vazio
---

# Criar tarefa

Cria uma tarefa na lista.

## Regras

O servidor gera o id.
`);
    fs.writeFileSync(path.join(body, 'tasks/get-list_tasks.md'), `---
title: Listar tarefas
api:
  method: GET
  path: /tasks
  auth: none
  query:
    - { name: limit, type: int, default: 20, maximum: 100 }
  responses:
    200: { schema: { type: array, items: { type: object, properties: { id: { type: integer } } } } }
---

# GET /tasks

Lista as tarefas.
`);
    fs.writeFileSync(path.join(body, 'tasks/delete-old_task.md'), '# Sem bloco api\n');
    return dir;
  }

  const SPEC = `
openapi: 3.0.3
info: { title: Tasks API, version: 2.1.0 }
servers: [{ url: 'https://api.example.com/v1' }]
security: [{ bearerAuth: [] }]
paths:
  /tasks:
    post:
      tags: [Tasks]
      summary: Create task
      description: Creates a task. The id is generated.
      operationId: createTask
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/NewTask' }
            example: { title: Buy bread }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Task' }
        '400': { $ref: '#/components/responses/BadRequest' }
  /tasks/{id}:
    parameters:
      - $ref: '#/components/parameters/TaskId'
    get:
      tags: [Tasks]
      summary: Get a task
      operationId: getTask
      parameters:
        - { name: expand, in: query, schema: { type: string, enum: [owner] } }
      responses:
        '200':
          description: The task
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Task' }
        '404': { description: Not found }
    delete:
      tags: [Tasks]
      operationId: deleteTask
      deprecated: true
      responses:
        '204': { description: No Content }
  /health:
    get:
      summary: Health check
      security: []
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { oneOf: [{ type: string }, { type: object }] }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer }
  parameters:
    TaskId: { name: id, in: path, required: true, schema: { type: integer }, description: Task id }
  responses:
    BadRequest:
      description: Validation error
      content:
        application/json:
          schema: { type: object, properties: { message: { type: string } } }
  schemas:
    NewTask:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1, description: What to do }
        done: { type: boolean, default: false }
    Task:
      allOf:
        - $ref: '#/components/schemas/NewTask'
        - type: object
          properties:
            id: { type: integer }
            parent: { $ref: '#/components/schemas/Task' }
`;

  const readPage = (dir, rel) => matter(fs.readFileSync(path.join(dir, 'rhyla-docs/body', rel), 'utf8'));

  test('normalizes fields, adds undeclared path parameters and reports problems', () => {
    const { api, warnings } = normalizeApi({
      method: 'patch',
      path: '/lists/{listId}/tasks/:id',
      query: [{ name: 'q', type: 'string', required: true }],
      headers: { 'X-Trace': 'uuid' },
      body: { fields: { tags: 'string[]', owner: { fields: { name: { type: 'string', required: true } } } } },
      responses: { 200: 'OK', 299: 'x', 'not-a-status': 'x' },
    });
    assert.deepEqual(warnings, ['unknown response status "not-a-status"']);
    assert.equal(api.oasPath, '/lists/{listId}/tasks/{id}');
    assert.deepEqual(api.parameters.map((p) => `${p.in}:${p.name}:${p.required}`), ['path:listId:true', 'path:id:true', 'query:q:true', 'header:X-Trace:false']);
    assert.deepEqual(api.parameters[3].schema, { type: 'string', format: 'uuid' });
    assert.deepEqual(api.body.schema, {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' } }, owner: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
    });

    assert.deepEqual(normalizeApi({ method: 'FETCH', path: 'tasks' }).warnings, ['unknown method "FETCH"', 'path must start with "/" (tasks)']);
    assert.equal(normalizeApi({ method: 'FETCH', path: '/t' }).api, null);
    assert.deepEqual(normalizeApi({ method: 'get', path: '/t', params: { id: 'int' }, body: { title: 'x' }, auth: 'magic' }).warnings, [
      'params.id is not in the path /t',
      'unknown auth "magic" (use bearer, basic, none or { type: apiKey, in, name })',
      'body needs fields, schema or example',
    ]);
  });

  test('the api example in AGENTS.md is valid', () => {
    const agents = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../src/templates/AGENTS.md'), 'utf8');
    const example = agents.match(/````markdown\n(---\ntitle: Create user[\s\S]*?)````/)[1];
    const { data, content } = matter(example);
    const { api, warnings } = normalizeApi(data.api);
    assert.deepEqual(warnings, []);
    assert.deepEqual(api.parameters.map((p) => p.name), ['teamId', 'notify', 'Idempotency-Key']);
    const markdown = withApiReference(content, api, {});
    assert.match(markdown, /`POST \/api\/users\/:teamId`[\s\S]*## Parameters[\s\S]*## Request body[\s\S]*`address\.city`[\s\S]*### 409 Conflict\n\nThe email is already in use[\s\S]*## Example\n\n```bash\ncurl -X POST "\$BASE_URL\/api\/users\/\{teamId\}\?notify=true"[\s\S]*## Business rules/);
  });

  test('route pages render the reference from the block, in the chosen language', () => {
    const dir = apiProject();
    build({ cwd: dir, quiet: true });
    const html = fs.readFileSync(path.join(dir, 'dist/tasks/post-create_task.html'), 'utf8');
    const md = fs.readFileSync(path.join(dir, 'dist/tasks/post-create_task.md'), 'utf8');
    // Depois da introdução, antes da primeira seção da página
    assert.match(md, /Cria uma tarefa na lista\.\n\n`POST \/tasks\/:listId`\n\n\*\*Autenticação:\*\* Token Bearer[\s\S]*## Parâmetros[\s\S]*\| `listId` \| path \| integer \| sim \| Lista da tarefa\. \|[\s\S]*## Corpo da requisição[\s\S]*\| `title` \| string \| sim \| O que fazer\. \(mín\. 1\) \|[\s\S]*## Respostas\n\n### 201 Created\n\n```json[\s\S]*### 400 Bad Request\n\ntitle ausente ou vazio\n\n## Exemplo\n\n```bash\ncurl -X POST "\$BASE_URL\/tasks\/7" \\\n  -H "Authorization: Bearer \$TOKEN" \\\n  -H "Content-Type: application\/json" \\\n  -d '\{"title":"Comprar pão"\}'\n```\n\n## Regras/);
    assert.match(html, /<h2>Parâmetros<\/h2>/);
    assert.match(html, /<code>listId<\/code>/);
    // H1 já é "GET /tasks": sem linha de endpoint repetida
    const list = fs.readFileSync(path.join(dir, 'dist/tasks/get-list_tasks.md'), 'utf8');
    assert.doesNotMatch(list, /`GET \/tasks`/);
    assert.match(list, /\*\*Autenticação:\*\* Nenhuma/);
    // Resposta sem descrições: só o exemplo, gerado do esquema
    assert.match(list, /### 200 OK\n\n```json\n\[\n  \{\n    "id": 1\n  \}\n\]\n```/);
    assert.match(list, /curl "\$BASE_URL\/tasks\?limit=20"\n```/);
    // Busca e llms-full também enxergam a referência
    assert.match(fs.readFileSync(path.join(dir, 'dist/llms-full.txt'), 'utf8'), /## Parâmetros/);
  });

  test('request examples follow the preferences and api.base_url', () => {
    const dir = apiProject({ language: 'English', examples: ['javascript', 'python'] });
    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), api: { base_url: 'https://api.example.com/' } }));
    const page = renderFile(path.join(dir, 'rhyla-docs/body/tasks/post-create_task.md'), { md: createMarkdown(), api: { lang: 'en', examples: ['javascript', 'python'], baseUrl: 'https://api.example.com' } });
    assert.match(page.markdown, /## Examples\n\n```javascript\nconst response = await fetch\('https:\/\/api\.example\.com\/tasks\/7', \{\n  method: 'POST',\n  headers: \{\n    Authorization: `Bearer \$\{TOKEN\}`,/);
    assert.match(page.markdown, /```python\nimport requests\n\nresponse = requests\.post\(\n    "https:\/\/api\.example\.com\/tasks\/7",\n    headers=\{\n        "Authorization": f"Bearer \{TOKEN\}",/);
    assert.doesNotMatch(page.markdown, /```bash/);
    const none = renderFile(path.join(dir, 'rhyla-docs/body/tasks/post-create_task.md'), { md: createMarkdown(), api: { examples: [] } });
    assert.doesNotMatch(none.markdown, /## Example/);
  });

  test('build and dev publish openapi.json from the blocks', async () => {
    const dir = apiProject();
    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), site_url: 'https://docs.example.com', api: { base_url: 'https://api.example.com', version: '3.0.0' } }));
    const result = build({ cwd: dir, quiet: true });
    assert.equal(result.operations, 2);
    const spec = JSON.parse(fs.readFileSync(path.join(dir, 'dist/openapi.json'), 'utf8'));
    assert.equal(spec.openapi, '3.0.3');
    assert.deepEqual(spec.info, { title: 'Tasks', version: '3.0.0', description: 'Task API' });
    assert.deepEqual(spec.servers, [{ url: 'https://api.example.com' }]);
    assert.deepEqual(spec.tags, [{ name: 'tasks' }]);
    const create = spec.paths['/tasks/{listId}'].post;
    assert.equal(create.operationId, 'postCreateTask');
    assert.equal(create.summary, 'Criar tarefa');
    assert.deepEqual(create.parameters, [{ name: 'listId', in: 'path', description: 'Lista da tarefa', required: true, schema: { type: 'integer', example: 7 } }]);
    assert.deepEqual(create.requestBody.content['application/json'].example, { title: 'Comprar pão' });
    assert.deepEqual(create.requestBody.content['application/json'].schema.required, ['title']);
    assert.deepEqual(Object.keys(create.responses), ['201', '400']);
    assert.equal(create.responses['400'].description, 'title ausente ou vazio');
    assert.deepEqual(create.security, [{ bearerAuth: [] }]);
    assert.deepEqual(spec.components.securitySchemes, { bearerAuth: { type: 'http', scheme: 'bearer' } });
    assert.deepEqual(create.externalDocs, { url: 'https://docs.example.com/tasks/post-create_task.html' });
    assert.equal(create['x-rhyla-page'], '/tasks/post-create_task');
    assert.deepEqual(spec.paths['/tasks'].get.security, []);
    assert.match(fs.readFileSync(path.join(dir, 'dist/llms.txt'), 'utf8'), /OpenAPI at https:\/\/docs\.example\.com\/openapi\.json/);

    // Sem páginas de rota com bloco, não há openapi.json
    const plain = tmpProject();
    build({ cwd: plain, quiet: true });
    assert.equal(fs.existsSync(path.join(plain, 'dist/openapi.json')), false);
    assert.doesNotMatch(fs.readFileSync(path.join(plain, 'dist/llms.txt'), 'utf8'), /OpenAPI/);

    const server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const served = await (await fetch(`${base}/openapi.json`)).json();
      assert.deepEqual(Object.keys(served.paths), ['/tasks', '/tasks/{listId}']);
      assert.match(await (await fetch(`${base}/tasks/post-create_task.md`)).text(), /## Parâmetros/);
    } finally {
      server.close();
    }

    // CLI
    const out = path.join(dir, 'spec.json');
    const exported = openapiExport({ cwd: dir, output: out, quiet: true });
    assert.deepEqual(exported.withoutApi, ['/tasks/delete-old_task']);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(out, 'utf8')).paths), ['/tasks', '/tasks/{listId}']);
    assert.throws(() => openapiExport({ cwd: plain, quiet: true }), /No page has an api block/);
  });

  test('imports an OpenAPI 3 spec: one page per operation, $refs resolved', async () => {
    const dir = apiProject();
    fs.writeFileSync(path.join(dir, 'openapi.yaml'), SPEC);

    const dry = await importSpec({ cwd: dir, source: 'openapi.yaml', dryRun: true });
    assert.deepEqual(dry.created, ['/tasks/post-create_task_2', '/tasks/get-task', '/tasks/delete-task-dep', '/health/get-health_check']);
    assert.equal(fs.existsSync(path.join(dir, 'rhyla-docs/body/tasks/get-task.md')), false);

    const result = await importSpec({ cwd: dir, source: 'openapi.yaml' });
    assert.equal(result.operations, 4);
    assert.deepEqual(result.not_in_spec, ['/tasks/get-list_tasks', '/tasks/post-create_task']);
    assert.equal(result.base_url, 'https://api.example.com/v1');
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'rhyla-docs/config.json'), 'utf8'));
    assert.equal(config.api.base_url, 'https://api.example.com/v1');
    // O título escolhido no init fica; num projeto com o título do template, vem da especificação
    assert.equal(config.title, 'Tasks');
    assert.equal(result.site_title, undefined);
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-api-'));
    init({ cwd: fresh, quiet: true, blank: true });
    fs.writeFileSync(path.join(fresh, 'openapi.yaml'), SPEC.replace('info: { title: Tasks API, version: 2.1.0 }', 'info: { title: Tasks API, version: 2.1.0, description: "Manage tasks. More text here." }'));
    assert.equal((await importSpec({ cwd: fresh, source: 'openapi.yaml' })).site_title, 'Tasks API');
    const freshConfig = JSON.parse(fs.readFileSync(path.join(fresh, 'rhyla-docs/config.json'), 'utf8'));
    assert.deepEqual([freshConfig.title, freshConfig.description], ['Tasks API', 'Manage tasks.']);

    const created = readPage(dir, 'tasks/post-create_task_2.md');
    assert.equal(created.data.title, 'Create task');
    assert.equal(created.data.description, 'Creates a task.');
    assert.match(created.content, /^\n# Create task\n\nCreates a task\. The id is generated\.\n$/);
    assert.deepEqual(created.data.api.body, {
      fields: { title: { type: 'string', description: 'What to do', minLength: 1, required: true }, done: { type: 'boolean', default: false } },
      example: { title: 'Buy bread' },
    });
    // allOf de objetos vira um objeto só; o $ref recursivo para no nome do esquema
    assert.deepEqual(Object.keys(created.data.api.responses['201'].fields), ['title', 'done', 'id', 'parent']);
    assert.deepEqual(created.data.api.responses['201'].fields.parent, { type: 'object', title: 'Task' });
    assert.deepEqual(created.data.api.responses['400'], { description: 'Validation error', fields: { message: 'string' } });
    assert.equal(created.data.api.auth, 'bearer');

    const get = readPage(dir, 'tasks/get-task.md').data.api;
    assert.deepEqual(get.params, { id: { type: 'integer', description: 'Task id' } });
    assert.deepEqual(get.query, { expand: { type: 'string', enum: ['owner'] } });
    assert.equal(get.responses['404'], 'Not found');
    const health = readPage(dir, 'health/get-health_check.md').data.api;
    assert.equal(health.auth, 'none');
    assert.deepEqual(health.responses['200'].schema, { oneOf: [{ type: 'string' }, { type: 'object' }] });
    assert.equal(readPage(dir, 'tasks/delete-task-dep.md').data.api.deprecated, true);

    // As páginas importadas constroem e voltam ao mesmo contrato no openapi.json
    const { spec, warnings } = exportSpec({ cwd: dir });
    assert.deepEqual(warnings, []);
    const original = parseSpec(SPEC);
    for (const [route, item] of Object.entries(original.paths)) {
      for (const method of Object.keys(item).filter((k) => k !== 'parameters')) {
        const op = spec.paths[route][method];
        assert.ok(op, `${method} ${route}`);
        if (item[method].operationId) assert.equal(op.operationId, item[method].operationId);
        assert.deepEqual(Object.keys(op.responses), Object.keys(item[method].responses));
      }
    }
    assert.deepEqual(spec.paths['/tasks/{id}'].get.parameters.map((p) => `${p.in}:${p.name}`), ['path:id', 'query:expand']);
    assert.equal(spec.paths['/tasks'].post.requestBody.required, true);
    assert.equal(spec.paths['/tasks/{id}'].delete.deprecated, true);
    build({ cwd: dir, quiet: true });
  });

  test('importing again replaces only the api block and keeps the text', async () => {
    const dir = apiProject();
    fs.writeFileSync(path.join(dir, 'openapi.yaml'), SPEC);
    await importSpec({ cwd: dir, source: 'openapi.yaml' });
    const file = path.join(dir, 'rhyla-docs/body/tasks/get-task.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('# Get a task\n', '# Get a task\n\nWritten by a person.\n').replace('order: 2', 'order: 9'));

    const same = await importSpec({ cwd: dir, source: 'openapi.yaml' });
    assert.deepEqual(same.created, []);
    assert.equal(same.unchanged.length, 4);
    assert.equal(same.base_url, undefined);

    fs.writeFileSync(path.join(dir, 'openapi.yaml'), SPEC.replace('description: Task id', 'description: The task id'));
    const kept = await importSpec({ cwd: dir, source: 'openapi.yaml', update: false });
    assert.deepEqual(kept.skipped, ['/tasks/get-task', '/tasks/delete-task-dep']);
    const changed = await importSpec({ cwd: dir, source: 'openapi.yaml' });
    assert.deepEqual(changed.updated, ['/tasks/get-task', '/tasks/delete-task-dep']);
    const page = readPage(dir, 'tasks/get-task.md');
    assert.equal(page.data.api.params.id.description, 'The task id');
    assert.equal(page.data.order, 9);
    assert.match(page.content, /Written by a person\./);
  });

  test('imports Swagger 2: body and form parameters, api keys, host', () => {
    const imported = importOpenApi(parseSpec(JSON.stringify({
      swagger: '2.0',
      info: { title: 'Pets', version: '1' },
      host: 'pets.example.com',
      basePath: '/v2',
      schemes: ['https'],
      securityDefinitions: { key: { type: 'apiKey', in: 'header', name: 'X-Key' } },
      security: [{ key: [] }],
      definitions: { Pet: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } },
      paths: {
        '/pets': {
          post: {
            operationId: 'addPet',
            parameters: [{ in: 'body', name: 'pet', required: true, schema: { $ref: '#/definitions/Pet' } }],
            responses: { 200: { description: 'OK', schema: { $ref: '#/definitions/Pet' }, examples: { 'application/json': { name: 'Rex' } } } },
          },
        },
        '/pets/{id}/photo': {
          post: {
            operationId: 'uploadPhoto',
            consumes: ['multipart/form-data'],
            parameters: [
              { in: 'path', name: 'id', required: true, type: 'integer' },
              { in: 'formData', name: 'file', type: 'file', required: true },
              { in: 'formData', name: 'caption', type: 'string' },
            ],
            responses: { 204: { description: 'Stored' } },
          },
        },
      },
    })));
    assert.equal(imported.info.baseUrl, 'https://pets.example.com/v2');
    const [add, upload] = imported.pages;
    assert.equal(add.file, 'pets/post-add_pet.md');
    assert.deepEqual(add.data.api.auth, { type: 'apiKey', in: 'header', name: 'X-Key' });
    assert.deepEqual(add.data.api.body, { fields: { name: { type: 'string', required: true } } });
    assert.deepEqual(add.data.api.responses['200'], { description: 'OK', fields: { name: { type: 'string', required: true } }, example: { name: 'Rex' } });
    assert.deepEqual(upload.data.api.params, { id: 'integer' });
    assert.deepEqual(upload.data.api.body, { content_type: 'multipart/form-data', fields: { file: { type: 'string', format: 'binary', required: true }, caption: 'string' } });
    const { api } = normalizeApi(upload.data.api);
    assert.match(withApiReference('# Upload', api, {}), /-H "X-Key: \$API_KEY" \\\n  -F 'file=@file' \\\n  -F 'caption=string'/);
    assert.throws(() => importOpenApi({ info: {} }), /Not an OpenAPI 3 or Swagger 2 document/);
  });

  test('mcp: find_routes points to the spec, import_openapi writes the pages, write_page checks the block', async () => {
    const dir = apiProject();
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { fastify: '5', '@fastify/swagger': '9' } }));
    fs.mkdirSync(path.join(dir, 'docs'));
    fs.writeFileSync(path.join(dir, 'docs/openapi.yaml'), SPEC);
    fs.writeFileSync(path.join(dir, 'docs/swagger-notes.json'), '{"notes": true}');
    const srv = createMcpServer({ cwd: dir });
    const call = async (name, args = {}) => (await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
    const data = async (name, args) => JSON.parse((await call(name, args)).content[0].text);

    const found = await data('find_routes');
    assert.deepEqual(found.openapi_files, ['docs/openapi.yaml']);
    assert.deepEqual(found.openapi_generators, ['@fastify/swagger']);
    assert.match(found.note, /import_openapi/);

    assert.match((await call('import_openapi', { source: '../outside.yaml' })).content[0].text, /inside the project/);
    assert.match((await call('import_openapi', { source: 'missing.yaml' })).content[0].text, /Could not import missing\.yaml: No file/);
    const dry = await data('import_openapi', { source: 'docs/openapi.yaml', dry_run: true });
    assert.equal(dry.dry_run, true);
    assert.equal(dry.created.length, 4);
    const done = await data('import_openapi', { source: 'docs/openapi.yaml' });
    assert.equal(done.created.length, 4);
    assert.match(done.next, /edit_page/);
    assert.match((await call('read_page', { route: '/tasks/get-task' })).content[1].text, /operation_id: getTask/);
    assert.match((await data('search_docs', { query: 'expand' })).results[0].route, /\/tasks\/get-task/);

    const written = await data('write_page', { path: 'tasks/put-x', content: '---\napi:\n  method: PUT\n  path: /x\n  responses: { ok: yes }\n---\n# X\n' });
    assert.deepEqual(written.api_warnings, ['unknown response status "ok"']);
    const fine = await data('write_page', { path: 'tasks/put-y', content: '---\napi: { method: PUT, path: /y }\n---\n# Y\n' });
    assert.equal(fine.api_warnings, undefined);
    const edited = await data('edit_page', { route: '/tasks/put-y', old_text: 'path: /y', new_text: 'path: y' });
    assert.deepEqual(edited.api_warnings, ['path must start with "/" (y)']);
  });

  test('get_conventions brings the api block to projects with an older AGENTS.md', async () => {
    const dir = apiProject();
    const agents = path.join(dir, 'rhyla-docs/AGENTS.md');
    const text = fs.readFileSync(agents, 'utf8');
    const start = text.indexOf('## API endpoint pages');
    fs.writeFileSync(agents, `${text.slice(0, start)}## API endpoint pages\n\nOld format with a curl example.\n\n${text.slice(text.indexOf('## Commands'))}`);
    const srv = createMcpServer({ cwd: dir });
    const conventions = (await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_conventions', arguments: {} } })).result.content[0].text;
    assert.doesNotMatch(conventions, /Old format/);
    assert.match(conventions, /## API endpoint pages[\s\S]*\napi:\n  method: POST/);
  });

  test('buildOpenApi reports duplicated endpoints and keeps operation ids unique', () => {
    const page = (route, name, api) => ({ route, name, group: '', title: name, description: '', data: { api } });
    const { spec, warnings, operations } = buildOpenApi([
      page('/a', 'get-item', { method: 'GET', path: '/items/:id' }),
      page('/b', 'get-item', { method: 'GET', path: '/items/{id}' }),
      page('/c', 'get-item', { method: 'GET', path: '/other' }),
      page('/d', 'post-bad', { path: '/x' }),
    ]);
    assert.equal(operations, 2);
    assert.deepEqual(warnings, ['/b: GET /items/{id} is already documented in /a; left out', '/d: api needs a method']);
    assert.deepEqual([spec.paths['/items/{id}'].get.operationId, spec.paths['/other'].get.operationId], ['getItem', 'getItem2']);
    assert.deepEqual(spec.paths['/other'].get.responses, { default: { description: 'Response' } });
  });
});

describe('rhyla check', () => {
  // API Express com um router montado em /api e docs com cada tipo de problema
  function checkProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-check-'));
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), text);
    };
    write('package.json', JSON.stringify({ name: 'api', dependencies: { express: '4' } }));
    write('src/app.js', `const express = require('express');
const app = express();
app.get('/health', (req, res) => res.send('ok'));
app.use('/api', require('./routes/tasks'));
app.get('*', (req, res) => res.sendFile('index.html'));
app.listen(3000);
`);
    write('src/routes/tasks.js', `const router = require('express').Router();
router.get('/tasks', list);
router.post('/tasks', create);
router.get('/tasks/:id', show);
router.delete('/tasks/:id', remove);
router.get('/admin/stats', stats);
module.exports = router;
`);
    init({ cwd: dir, quiet: true, blank: true });
    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), check: { ignore: ['/api/admin/*'] } }));
    write('rhyla-docs/body/tasks/get-list.md', '---\napi: { method: GET, path: /api/tasks, responses: { ok: x } }\n---\n# List\n');
    write('rhyla-docs/body/tasks/get-again.md', '---\napi: { method: GET, path: /api/tasks }\n---\n# List again\n');
    write('rhyla-docs/body/tasks/post-create.md', '# POST /api/tasks\n\nCreates a task.\n');
    write('rhyla-docs/body/tasks/get-one.md', '---\napi: { method: GET, path: "/tasks/{taskId}" }\n---\n# One\n');
    write('rhyla-docs/body/tasks/put-old.md', '---\napi: { method: PUT, path: /api/tasks/:id }\n---\n# Old\n');
    write('rhyla-docs/body/tasks/patch-bad.md', '---\napi: { path: /api/tasks/:id }\n---\n# Bad\n');
    write('rhyla-docs/body/tasks/get-mystery.md', '# Mystery\n');
    write('rhyla-docs/body/guide/intro.md', '# Intro\n\n[ok](/tasks/get-list) [twin](/tasks/get-list.md) [anchor](/tasks/get-list#x) [llms](/llms.txt) [gone](/tasks/nowhere) [external](https://example.com) ![logo](/public/logo.png) ![missing](/public/missing.png)\n');
    write('rhyla-docs/body/flows/broken.md', '---\ntype: flow\nsteps:\n  - { id: a, page: tasks/get-list, next: b }\n  - { id: b, page: tasks/removed }\n---\n# Broken\n');
    return dir;
  }

  test('compares the route pages with the routes in the code', () => {
    const report = checkDocs(checkProject(), { ignore: ['GET /health'] });
    const by = (list, type) => list.filter((i) => i.type === type).map((i) => i.message);

    assert.equal(report.ok, false);
    assert.deepEqual(report.frameworks, ['express']);
    // /health e /api/admin/* ignorados, o catch-all fica de fora
    assert.equal(report.routes, 4);
    assert.equal(report.documented, 3);
    assert.deepEqual(by(report.errors, 'undocumented'), ['DELETE /api/tasks/:id (src/routes/tasks.js:5) has no page']);
    assert.deepEqual(report.errors.find((e) => e.type === 'undocumented').line, 5);
    assert.deepEqual(by(report.errors, 'stale'), ['/tasks/put-old: PUT /api/tasks/:id is not in the code']);
    assert.deepEqual(by(report.errors, 'invalid_api'), ['/tasks/patch-bad: invalid api block (api needs a method)']);
    assert.equal(report.errors.find((e) => e.type === 'stale').file, 'rhyla-docs/body/tasks/put-old.md');

    assert.deepEqual(by(report.warnings, 'api_block'), ['/tasks/get-list: unknown response status "ok"']);
    assert.deepEqual(by(report.warnings, 'duplicate'), ['GET /api/tasks is documented in 2 pages: /tasks/get-again, /tasks/get-list']);
    assert.deepEqual(by(report.warnings, 'no_api_block'), [
      '/tasks/get-mystery: no api block and no "METHOD /path" heading, so it cannot be matched to a route',
      '/tasks/post-create: POST /api/tasks has no api block',
    ]);
    assert.equal(by(report.warnings, 'flow').length, 1);
    assert.match(by(report.warnings, 'flow')[0], /tasks\/removed/);
    assert.deepEqual(by(report.warnings, 'broken_link'), ['/guide/intro: link to /tasks/nowhere, which does not exist', '/guide/intro: link to /public/missing.png, which does not exist']);
    // GET /tasks/{taskId} só bate com GET /api/tasks/:id ignorando o prefixo
    assert.match(report.notes.join('\n'), /1 route matched a page only when ignoring a path prefix/);
    assert.match(report.notes.join('\n'), /1 catch-all route \(\*\) left out/);
  });

  test('without routes in the code, only the docs are checked', () => {
    const dir = tmpProject();
    const report = checkDocs(dir);
    assert.equal(report.ok, true);
    assert.equal(report.routes, 0);
    assert.match(report.notes[0], /No HTTP routes were found/);
    assert.throws(() => checkDocs(fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-none-'))), /rhyla init/);
  });

  test('ignore patterns take a method, a path and wildcards', () => {
    const skip = createRouteMatcher(['GET /health', '/internal/*', '* /admin/*', 'DELETE /tasks/:id']);
    assert.equal(skip('GET', '/health'), true);
    assert.equal(skip('POST', '/health'), false);
    assert.equal(skip('PATCH', '/internal/jobs/run'), true);
    assert.equal(skip('GET', '/admin/x'), true);
    assert.equal(skip('DELETE', '/tasks/{taskId}'), true);
    assert.equal(skip('GET', '/tasks/1x'), false);
  });

  test('the command fails on errors, and on warnings with --strict', () => {
    const dir = checkProject();
    assert.equal(check({ cwd: dir, quiet: true }).passed, false);
    // Sem os erros, só avisos: passa, a menos que seja --strict
    for (const rel of ['tasks/put-old.md', 'tasks/patch-bad.md']) fs.rmSync(path.join(dir, 'rhyla-docs/body', rel));
    const ignore = ['GET /health', 'DELETE /api/tasks/:id'];
    assert.equal(check({ cwd: dir, quiet: true, ignore }).passed, true);
    assert.equal(check({ cwd: dir, quiet: true, ignore, strict: true }).passed, false);

    assert.equal(
      githubAnnotation('error', { type: 'undocumented', file: 'src/a,b.js', line: 5, message: 'GET /x has no page\n100%' }),
      '::error file=src/a%2Cb.js,line=5,title=Routes in the code without a page::GET /x has no page%0A100%25'
    );
    assert.equal(githubAnnotation('warning', { type: 'flow', message: 'm' }), '::warning title=Flows with broken steps::m');
  });

  test('mcp check_docs returns the same report', async () => {
    const dir = checkProject();
    const srv = createMcpServer({ cwd: dir, readOnly: true });
    const res = await srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'check_docs', arguments: {} } });
    const data = JSON.parse(res.result.content[0].text);
    assert.deepEqual(data, JSON.parse(JSON.stringify(checkDocs(dir))));
    // init e sync conferem as docs antes de terminar
    const full = createMcpServer({ cwd: dir });
    for (const name of ['init', 'sync']) {
      const prompt = await full.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name, arguments: {} } });
      assert.match(prompt.result.messages[0].content.text, /Call check_docs and fix its errors[\s\S]*Call mark_synced/);
    }
    // sync sem mudanças no código ainda passa pelo check_docs, e dá o bloco api às páginas antigas
    const sync = (await full.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'sync', arguments: {} } })).result.messages[0].content.text;
    assert.match(sync, /no changes, skip step 3/);
    assert.doesNotMatch(sync, /up to date and stop/);
    assert.match(sync, /check_docs[\s\S]*no_api_block[\s\S]*edit_page[\s\S]*Call mark_synced/);
  });
});

describe('try it panel', () => {
  // Projeto com uma rota de login, uma rota com bloco e páginas de rota sem bloco
  function tryProject(api = { base_url: 'http://127.0.0.1:1' }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-try-'));
    init({ cwd: dir, quiet: true, blank: true, title: 'Tasks' });
    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), api, preferences: { language: 'Português' } }, null, 2));
    const body = path.join(dir, 'rhyla-docs/body');
    fs.mkdirSync(path.join(body, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(body, 'tasks/post-create_task.md'), `---
title: Criar tarefa
api:
  method: POST
  path: /lists/:listId/tasks
  auth: bearer
  params: { listId: { type: integer, example: 7 } }
  query: { notify: { type: boolean, default: true }, mode: { type: string, enum: [fast, safe] } }
  headers: { X-Trace: string }
  body:
    fields: { title: { type: string, required: true }, done: boolean }
---

# Criar tarefa

Texto com </script> no meio.
`);
    fs.writeFileSync(path.join(body, 'tasks/post-login.md'), '---\napi:\n  method: POST\n  path: /login\n  auth: none\n  login: { token: data.token }\n  body: { example: { user: ana } }\n---\n\n# Login\n');
    fs.writeFileSync(path.join(body, 'tasks/get-old_style.md'), '# GET /tasks/:id\n\nSem bloco.\n');
    fs.writeFileSync(path.join(body, 'tasks/path-legacy.md'), '# Legacy\n');
    fs.writeFileSync(path.join(body, 'tasks/notes.md'), '# Notes\n\nCall GET /tasks first.\n');
    return dir;
  }
  const panelData = (html) => {
    const m = html.match(/<script type="application\/json" id="rh-try-data">([\s\S]*?)<\/script>/);
    return m ? JSON.parse(m[1]) : null;
  };

  test('the endpoint comes from the block, a "METHOD /path" heading or the file name', () => {
    const block = routeEndpoint({ name: 'post-create_task', markdown: '# X', data: { api: { method: 'post', path: '/a/:id' } } });
    assert.equal(block.source, 'block');
    assert.equal(block.api.parameters[0].name, 'id');
    const heading = routeEndpoint({ name: 'whatever', markdown: '# `GET /tasks/{id}`\n', data: {} });
    assert.deepEqual([heading.source, heading.api.method, heading.api.path], ['heading', 'get', '/tasks/{id}']);
    const file = routeEndpoint({ name: 'path-update_thing-new', markdown: '# Update thing', data: {} });
    assert.deepEqual([file.source, file.api.method, file.api.path], ['file', 'patch', null]);
    // Bloco inválido cai para o H1; .html e páginas comuns não têm painel
    assert.equal(routeEndpoint({ name: 'x', markdown: '# DELETE /x', data: { api: { method: 'nope' } } }).source, 'heading');
    assert.equal(routeEndpoint({ name: 'get-page', markdown: null, data: {} }), null);
    assert.equal(routeEndpoint({ name: 'notes', markdown: '# Notes', data: {} }), null);
  });

  test('servers, login and example values for the browser', () => {
    assert.deepEqual(trySettings({ api: { base_url: 'http://localhost:3000/', environments: { Staging: 'https://stg.example.com', Bad: 'ftp://x', Dup: 'http://localhost:3000' } } }), {
      servers: [{ name: 'http://localhost:3000', url: 'http://localhost:3000' }, { name: 'Staging', url: 'https://stg.example.com' }],
      dev: true,
      build: false,
    });
    assert.deepEqual(trySettings({ api: { environments: [{ name: 'Prod', url: 'https://api.example.com' }], try_it: true } }).servers, [{ name: 'Prod', url: 'https://api.example.com' }]);
    assert.deepEqual([trySettings({ api: { try_it: true } }).build, trySettings({ api: { try_it: false } }).dev], [true, false]);

    assert.deepEqual(normalizeApi({ method: 'post', path: '/login', login: true }).api.login, { token: null });
    assert.deepEqual(normalizeApi({ method: 'post', path: '/login', login: 'access_token' }).api.login, { token: 'access_token' });
    assert.equal(normalizeApi({ method: 'post', path: '/x' }).api.login, null);
    assert.match(normalizeApi({ method: 'post', path: '/login', login: 3 }).warnings[0], /login must be true/);

    const { api } = normalizeApi({
      method: 'post', path: '/lists/:listId', auth: 'bearer',
      params: { listId: { type: integer(), example: 7 } },
      query: { mode: { type: 'string', enum: ['fast', 'safe'] }, limit: { type: 'integer', default: 20 } },
      body: { fields: { title: { type: 'string', required: true }, tags: 'string[]' } },
    });
    function integer() { return 'integer'; }
    const data = tryData({ api, source: 'block' }, { page: 'tasks/x', language: 'Español', servers: [] });
    assert.equal(data.lang, 'es');
    assert.equal(data.mode, 'proxy');
    assert.equal(data.method, 'POST');
    assert.deepEqual(data.params.map((p) => [p.in, p.name, p.value, p.required]), [['path', 'listId', '7', true], ['query', 'mode', '', false], ['query', 'limit', '20', false]]);
    assert.deepEqual(data.params[1].enum, ['fast', 'safe']);
    assert.deepEqual(JSON.parse(data.body.value), { title: 'string', tags: ['string'] });
    assert.equal(tryData({ api, source: 'block' }, { mode: 'direct' }).proxy, undefined);
    assert.doesNotMatch(tryPanelHtml({ text: '</script><!--' }), /<\/script><!--/);
  });

  test('dev shows the panel on route pages only, with the configured servers', async () => {
    const dir = tryProject();
    const server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const page = async (route) => (await fetch(base + route)).text();
      const create = panelData(await page('/tasks/post-create_task'));
      assert.equal(create.method, 'POST');
      assert.equal(create.path, '/lists/:listId/tasks');
      assert.equal(create.proxy, '/__rhyla/try');
      assert.equal(create.lang, 'pt');
      assert.deepEqual(create.servers, [{ name: 'http://127.0.0.1:1', url: 'http://127.0.0.1:1' }]);
      assert.deepEqual(create.auth, { type: 'bearer' });
      assert.match(await page('/tasks/post-create_task'), /<script src="\/scripts\/try-runtime\.js"><\/script>/);
      assert.deepEqual(panelData(await page('/tasks/post-login')).login, { token: 'data.token' });
      assert.equal(panelData(await page('/tasks/get-old_style')).source, 'heading');
      assert.equal(panelData(await page('/tasks/path-legacy')).method, 'PATCH');
      assert.equal(panelData(await page('/tasks/notes')), null);
      assert.equal((await fetch(base + '/scripts/try-runtime.js')).status, 200);
      assert.equal((await fetch(base + '/scripts/try-runtime.css')).status, 200);

      const config = path.join(dir, 'rhyla-docs/config.json');
      fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), api: { try_it: false } }));
      assert.equal(panelData(await page('/tasks/post-create_task')), null);
    } finally {
      server.close();
    }
  });

  test('the dev proxy calls the API, keeps cookie sessions and only goes to allowed hosts', async () => {
    const http = await import('node:http');
    // API de teste: devolve o que recebeu; /login abre uma sessão por cookie
    const api = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        if (req.url === '/login') res.setHeader('Set-Cookie', ['sid=abc123; Path=/; HttpOnly', 'old=1; Max-Age=0']);
        if (req.url === '/logout') res.setHeader('Set-Cookie', 'sid=; Max-Age=0');
        res.writeHead(req.url === '/missing' ? 404 : 200, { 'Content-Type': 'application/json', 'X-Api': 'yes' });
        res.end(JSON.stringify({ method: req.method, url: req.url, auth: req.headers.authorization || null, cookie: req.headers.cookie || null, type: req.headers['content-type'] || null, body }));
      });
    });
    await new Promise((r) => api.listen(0, '127.0.0.1', r));
    const apiUrl = `http://127.0.0.1:${api.address().port}`;
    const dir = tryProject({ base_url: 'http://api.invalid' });
    const server = dev({ cwd: dir, port: 0, quiet: true });
    await new Promise((r) => server.once('listening', r));
    const proxy = `http://127.0.0.1:${server.address().port}/__rhyla/try`;
    const call = async (request, headers = { 'X-Rhyla-Try': '1' }) => {
      const res = await fetch(proxy, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(request) });
      return { status: res.status, json: await res.json() };
    };
    try {
      const sent = await call({ method: 'POST', url: `${apiUrl}/tasks?x=1`, headers: [['Authorization', 'Bearer t0k'], ['Content-Type', 'application/json'], ['Host', 'evil'], ['', 'skip']], body: '{"title":"A"}' });
      assert.equal(sent.status, 200);
      assert.equal(sent.json.status, 200);
      assert.equal(typeof sent.json.time, 'number');
      assert.ok(sent.json.headers.some(([k, v]) => k === 'x-api' && v === 'yes'));
      assert.deepEqual(JSON.parse(sent.json.body), { method: 'POST', url: '/tasks?x=1', auth: 'Bearer t0k', cookie: null, type: 'application/json', body: '{"title":"A"}' });
      assert.equal((await call({ method: 'GET', url: `${apiUrl}/missing`, headers: [], body: 'ignored' })).json.status, 404);
      assert.equal(JSON.parse((await call({ method: 'GET', url: `${apiUrl}/q`, headers: [], body: 'ignored' })).json.body).body, '');

      // Cookie de sessão guardado em memória e mandado nas próximas
      assert.deepEqual((await call({ method: 'POST', url: `${apiUrl}/login`, headers: [] })).json.cookies, ['sid']);
      assert.equal(JSON.parse((await call({ method: 'GET', url: `${apiUrl}/me`, headers: [] })).json.body).cookie, 'sid=abc123');
      const cookies = await fetch(`${proxy}/cookies?origin=${encodeURIComponent(apiUrl)}`, { headers: { 'X-Rhyla-Try': '1' } });
      assert.deepEqual(await cookies.json(), { cookies: ['sid'] });
      assert.deepEqual((await call({ method: 'POST', url: `${apiUrl}/logout`, headers: [] })).json.cookies, []);
      await call({ method: 'POST', url: `${apiUrl}/login`, headers: [] });
      await fetch(`${proxy}/cookies?origin=${encodeURIComponent(apiUrl)}`, { method: 'DELETE', headers: { 'X-Rhyla-Try': '1' } });
      assert.equal(JSON.parse((await call({ method: 'GET', url: `${apiUrl}/me`, headers: [] })).json.body).cookie, null);

      // Só a própria página do dev, só hosts locais ou configurados
      assert.equal((await call({ method: 'GET', url: `${apiUrl}/x` }, {})).status, 403);
      const external = await call({ method: 'GET', url: 'https://example.com/x' });
      assert.equal(external.status, 403);
      assert.equal(external.json.code, 'not_configured');
      assert.match(external.json.error, /api": \{ "base_url": "https:\/\/example\.com" \}/);
      assert.equal((await call({ method: 'GET', url: 'http://api.invalid/x' })).json.code, 'unreachable');
      assert.equal((await call({ method: 'GET', url: 'http://127.0.0.1:1/x' })).json.code, 'unreachable');
      assert.equal((await call({ method: 'BREW', url: `${apiUrl}/x` })).status, 400);
      assert.equal((await call({ method: 'GET', url: 'file:///etc/passwd' })).status, 400);
      assert.equal((await call({ method: 'GET', url: 'not a url' })).status, 400);
      const rebound = await new Promise((resolve) => {
        const req = http.request(proxy, { method: 'POST', headers: { Host: 'attacker.example', 'Content-Type': 'application/json', 'X-Rhyla-Try': '1' } }, (res) => resolve(res.statusCode));
        req.end(JSON.stringify({ method: 'GET', url: `${apiUrl}/x` }));
      });
      assert.equal(rebound, 403);
    } finally {
      server.close();
      api.close();
    }
  });

  test('build includes the panel only with api.try_it, calling the API directly', () => {
    const dir = tryProject();
    build({ cwd: dir, quiet: true });
    const html = (rel) => fs.readFileSync(path.join(dir, 'dist', rel), 'utf8');
    assert.equal(panelData(html('tasks/post-create_task.html')), null);
    assert.ok(fs.existsSync(path.join(dir, 'dist/scripts/try-runtime.js')));

    const config = path.join(dir, 'rhyla-docs/config.json');
    fs.writeFileSync(config, JSON.stringify({ ...JSON.parse(fs.readFileSync(config, 'utf8')), api: { base_url: 'https://api.example.com', try_it: true } }));
    build({ cwd: dir, quiet: true });
    const data = panelData(html('tasks/post-create_task.html'));
    assert.equal(data.mode, 'direct');
    assert.equal(data.proxy, undefined);
    assert.deepEqual(data.servers, [{ name: 'https://api.example.com', url: 'https://api.example.com' }]);
    assert.equal(panelData(html('tasks/notes.html')), null);
    assert.ok(fs.existsSync(path.join(dir, 'dist/scripts/try-runtime.css')));
  });

  test('find_routes flags login candidates and import keeps the login mark', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-routes-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: { express: '4' } }));
    fs.writeFileSync(path.join(root, 'app.js'), "const app = require('express')();\napp.post('/auth/login', h);\napp.get('/auth/me', h);\napp.post('/oauth/token', h);\napp.post('/users', h);\n");
    const found = findRoutes(root);
    assert.deepEqual(found.routes.filter((r) => r.login).map((r) => r.path), ['/auth/login', '/oauth/token']);
    assert.match(found.login_hint, /login: \{ token:/);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-try-'));
    init({ cwd: dir, quiet: true, blank: true });
    const spec = (description) => JSON.stringify({ openapi: '3.0.3', info: { title: 'A', version: '1' }, paths: { '/login': { post: { summary: 'Log in', responses: { 200: { description } } } } } });
    fs.writeFileSync(path.join(dir, 'spec.json'), spec('The token'));
    const first = await importSpec({ cwd: dir, source: 'spec.json' });
    const file = path.join(dir, 'rhyla-docs/body', first.created[0].slice(1) + '.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('  method: POST\n', '  method: POST\n  login:\n    token: token\n'));
    assert.deepEqual((await importSpec({ cwd: dir, source: 'spec.json' })).unchanged, first.created);
    fs.writeFileSync(path.join(dir, 'spec.json'), spec('The session token'));
    assert.deepEqual((await importSpec({ cwd: dir, source: 'spec.json' })).updated, first.created);
    const updated = matter(fs.readFileSync(file, 'utf8')).data.api;
    assert.deepEqual(updated.login, { token: 'token' });
    assert.equal(updated.responses[200], 'The session token');
  });
});

describe('import: postman collections and the wizard', () => {
  const json = async (res) => JSON.parse((await res).result.content[0].text);
  const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.realsignature123';
  // Coleção com pastas, {{baseUrl}}, bearer herdado, script de login, variações e segredos
  const collection = () => ({
    info: { name: 'Task Manager', description: 'Tasks over HTTP. Log in first.', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}' }] },
    variable: [{ key: 'baseUrl', value: 'http://localhost:3000/api' }, { key: 'listId', value: '7' }, { key: 'token', value: JWT }],
    item: [
      { name: 'Auth', auth: { type: 'noauth' }, item: [
        {
          name: 'Log in',
          event: [{ listen: 'test', script: { exec: ['const json = pm.response.json();', 'pm.collectionVariables.set("token", json.data.access_token);'] } }],
          request: {
            method: 'POST',
            header: [{ key: 'Content-Type', value: 'application/json' }],
            body: { mode: 'raw', raw: '{\n  "email": "ana@example.com",\n  "password": "hunter2"\n}', options: { raw: { language: 'json' } } },
            url: { raw: '{{baseUrl}}/auth/login', host: ['{{baseUrl}}'], path: ['auth', 'login'] },
            description: 'Trades the email and password for a token. Valid for one hour.',
          },
          response: [
            { name: 'Logged in', code: 200, header: [{ key: 'Content-Type', value: 'application/json' }], body: JSON.stringify({ data: { access_token: JWT, expires_in: 3600 } }) },
            { name: 'Wrong password', code: 401, body: '{"error":"Unauthorized"}' },
          ],
        },
      ] },
      { name: 'Tasks', item: [
        {
          name: 'List tasks',
          request: {
            method: 'GET',
            header: [{ key: 'Authorization', value: `Bearer ${JWT}` }, { key: 'X-Trace', value: 'abc' }, { key: 'Cookie', value: 'sid=secret' }],
            url: { raw: '{{baseUrl}}/tasks?done=false&limit=20', host: ['{{baseUrl}}'], path: ['tasks'], query: [{ key: 'done', value: 'false', description: 'Only open tasks' }, { key: 'limit', value: '20' }, { key: 'q', value: '', disabled: true }] },
          },
          response: [{ name: 'Tasks', code: 200, header: [{ key: 'Content-Type', value: 'application/json' }], body: '[{"id":1,"title":"Buy bread","createdAt":"2026-10-29T12:00:00.000Z"}]' }],
        },
        { name: 'List done tasks', request: { method: 'GET', url: '{{baseUrl}}/tasks?done=true&page=2' }, response: [{ name: 'Nothing', code: 404, body: '' }] },
        { name: 'Get task', request: { method: 'GET', url: { raw: '{{baseUrl}}/tasks/:id', host: ['{{baseUrl}}'], path: ['tasks', ':id'], variable: [{ key: 'id', value: '1', description: 'Task id' }] } } },
        { name: 'Create task', request: { method: 'POST', body: { mode: 'raw', raw: '{\n  // required\n  "title": "Buy bread",\n  "listId": {{listId}},\n  "owner": {{ownerId}}\n}', options: { raw: { language: 'json' } } }, url: '{{baseUrl}}/lists/{{listId}}/tasks' } },
        {
          name: 'Upload attachment',
          request: {
            method: 'POST',
            auth: { type: 'apikey', apikey: [{ key: 'key', value: 'X-Api-Key' }, { key: 'value', value: 'sk_live_123' }, { key: 'in', value: 'header' }] },
            body: { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: '/home/x.png' }, { key: 'name', value: 'photo', type: 'text' }] },
            url: '{{baseUrl}}/tasks/:id/attachments',
          },
        },
        { name: 'Purge', request: { method: 'PURGE', url: '{{baseUrl}}/cache' } },
      ] },
    ],
  });

  test('a Postman collection becomes route pages, without its secrets', () => {
    const imported = importDocument(collection());
    assert.equal(imported.format, 'postman');
    assert.equal(imported.info.title, 'Task Manager');
    assert.equal(imported.info.summary, 'Tasks over HTTP.');
    assert.equal(imported.info.baseUrl, 'http://localhost:3000/api');
    const page = (file) => imported.pages.find((p) => p.file === file);
    assert.deepEqual(imported.pages.map((p) => p.file), [
      'auth/post-log_in.md', 'tasks/get-list_tasks.md', 'tasks/get-task.md', 'tasks/post-create_task.md', 'tasks/post-upload_attachment.md',
    ]);

    // Login: sem auth (pasta), token pelo script de teste, senha e token fora dos exemplos
    const login = page('auth/post-log_in.md');
    assert.equal(login.data.title, 'Log in');
    assert.equal(login.data.description, 'Trades the email and password for a token.');
    assert.match(login.body, /Valid for one hour/);
    assert.deepEqual(login.data.api.login, { token: 'data.access_token' });
    assert.equal(login.data.api.auth, 'none');
    assert.deepEqual(login.data.api.body, { fields: { email: 'email', password: 'string' }, example: { email: 'ana@example.com', password: '<password>' } });
    assert.deepEqual(login.data.api.responses[200].example, { data: { access_token: '<access_token>', expires_in: 3600 } });
    assert.deepEqual(login.data.api.responses[200].fields, { data: { type: 'object', fields: { access_token: 'string', expires_in: 'integer' } } });
    assert.equal(login.data.api.responses[401].description, 'Wrong password');

    // Bearer herdado da coleção; Authorization e Cookie de verdade não entram; variações fundidas
    const list = page('tasks/get-list_tasks.md').data.api;
    assert.equal(list.auth, 'bearer');
    assert.deepEqual(Object.keys(list.query), ['done', 'limit', 'q', 'page']);
    assert.deepEqual(list.query.done, { type: 'boolean', description: 'Only open tasks', example: false });
    assert.deepEqual(list.query.limit, { type: 'integer', example: 20 });
    assert.deepEqual(list.headers, { 'X-Trace': { type: 'string', example: 'abc' } });
    assert.equal(list.responses[200].schema.type, 'array');
    assert.equal(list.responses[200].schema.items.properties.createdAt.format, 'date-time');
    assert.equal(list.responses[404], 'Nothing');

    assert.deepEqual(page('tasks/get-task.md').data.api.params, { id: { type: 'integer', description: 'Task id', example: 1 } });
    // {{listId}} no meio do caminho vira parâmetro; fora de aspas no corpo, o valor da variável
    const create = page('tasks/post-create_task.md').data.api;
    assert.equal(create.path, '/lists/:listId/tasks');
    assert.deepEqual(create.params, { listId: { type: 'integer', example: 7 } });
    assert.deepEqual(create.body.example, { title: 'Buy bread', listId: 7, owner: '<ownerId>' });
    const upload = page('tasks/post-upload_attachment.md').data.api;
    assert.deepEqual(upload.auth, { type: 'apiKey', in: 'header', name: 'X-Api-Key' });
    assert.deepEqual(upload.body, { content_type: 'multipart/form-data', fields: { file: 'binary', name: 'string' }, example: { file: '<file>', name: 'photo' } });

    // Nada de segredo em lugar nenhum; os avisos dizem o que ficou de fora
    const all = JSON.stringify(imported.pages);
    for (const secret of ['hunter2', 'realsignature', 'sk_live_123', 'sid=secret']) assert.ok(!all.includes(secret), secret);
    assert.ok(imported.warnings.some((w) => /PURGE/.test(w)));
    assert.ok(imported.warnings.some((w) => /1 request repeats an endpoint/.test(w)));
    assert.ok(imported.warnings.some((w) => /secret-looking values were left out/.test(w)));
    // Os blocos importados são válidos
    for (const p of imported.pages) assert.deepEqual(normalizeApi(p.data.api).warnings, [], p.file);
  });

  test('formats are detected, and the wrong files say what to export', () => {
    assert.equal(detectFormat({ openapi: '3.1.0' }), 'openapi');
    assert.equal(detectFormat({ swagger: '2.0' }), 'swagger');
    assert.equal(detectFormat(collection()), 'postman');
    assert.equal(detectFormat({ info: { name: 'x' }, item: [] }), 'postman');
    assert.equal(detectFormat({ name: 'x' }), null);
    assert.throws(() => importDocument({ id: 'x', name: 'Old', requests: [], order: [] }), /Postman collection v1[\s\S]*Collection v2\.1/);
    assert.throws(() => importDocument({ id: 'e', name: 'Local', values: [{ key: 'baseUrl', value: 'http://x' }], _postman_variable_scope: 'environment' }), /environment[\s\S]*export the collection/);
    assert.throws(() => importDocument({ hello: 'world' }), /Not an OpenAPI 3, Swagger 2 or Postman/);
    assert.throws(() => parseSource('<!DOCTYPE html><html></html>', 'http://x/docs'), /HTML page[\s\S]*Swagger UI/);
    // {{baseUrl}} definido só num environment: o servidor fica para o usuário
    const doc = collection();
    doc.variable = [];
    const imported = importDocument(doc);
    assert.equal(imported.info.baseUrl, null);
    assert.ok(imported.warnings.some((w) => /\{\{baseUrl\}\}[\s\S]*"base_url"/.test(w)));
  });

  test('rhyla import and init --import write the pages from a Postman file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-import-'));
    fs.writeFileSync(path.join(dir, 'tasks.postman_collection.json'), JSON.stringify(collection()));
    const result = await initWithImport('tasks.postman_collection.json', { cwd: dir, quiet: true });
    assert.equal(result.format, 'postman');
    assert.equal(result.created.length, 5);
    assert.equal(fs.readFileSync(path.join(dir, 'rhyla-docs/body/home.md'), 'utf8'), '# Task Manager\n\nTasks over HTTP.\n');
    const config = JSON.parse(fs.readFileSync(path.join(dir, 'rhyla-docs/config.json'), 'utf8'));
    assert.equal(config.api.base_url, 'http://localhost:3000/api');
    assert.equal(config.title, 'Task Manager');
    assert.ok(!fs.existsSync(path.join(dir, 'rhyla-docs/body/guide')));
    // Importar de novo não duplica; o texto escrito depois fica
    const file = path.join(dir, 'rhyla-docs/body/tasks/get-task.md');
    fs.appendFileSync(file, '\nWritten by a person.\n');
    const again = await importSpec({ cwd: dir, source: 'tasks.postman_collection.json' });
    assert.deepEqual([again.created.length, again.unchanged.length], [0, 5]);
    assert.match(fs.readFileSync(file, 'utf8'), /Written by a person/);
    // O build sai com as páginas e o openapi.json
    build({ cwd: dir, quiet: true });
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'dist/openapi.json'), 'utf8')).paths).length, 5);
  });

  // Projeto com uma coleção e um OpenAPI, para o wizard e o MCP
  function specProject() {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rhyla-wizard-'));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'tasks-api', dependencies: { express: '4' } }));
    fs.mkdirSync(path.join(project, 'docs'));
    fs.writeFileSync(path.join(project, 'docs/tasks.postman_collection.json'), JSON.stringify(collection(), null, 2));
    fs.writeFileSync(path.join(project, 'openapi.yaml'), 'openapi: 3.0.3\ninfo: { title: Spec, version: "1" }\npaths:\n  /health:\n    get: { summary: Health, responses: { 200: { description: ok } } }\n');
    fs.writeFileSync(path.join(project, 'collection-notes.json'), '{"not": "postman"}');
    return project;
  }

  test('find_routes points to Postman collections', () => {
    const found = findRoutes(specProject());
    assert.deepEqual(found.openapi_files, ['openapi.yaml']);
    assert.deepEqual(found.postman_files, ['docs/tasks.postman_collection.json']);
    assert.match(found.note, /postman_files/);
  });

  test('the wizard offers the specs of the project and imports the chosen one', async () => {
    const project = specProject();
    const srv = createMcpServer({ cwd: project, setupWaitMs: 2000 });
    const call = (name, args = {}) => json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }));
    const opened = await call('setup_wizard', { open: false });
    const base = opened.url.replace('/__rhyla/setup', '');
    const post = (route, body, type = 'application/json') => fetch(`${base}/__rhyla/api/setup${route}`, { method: 'POST', headers: { 'content-type': type }, body });
    try {
      const info = await (await fetch(`${base}/__rhyla/api/setup`)).json();
      assert.deepEqual(info.project.sources, [
        { path: 'openapi.yaml', format: 'openapi', formatName: 'OpenAPI 3', title: 'Spec', operations: 1 },
        { path: 'docs/tasks.postman_collection.json', format: 'postman', formatName: 'Postman', title: 'Task Manager', operations: 5 },
      ]);

      const preview = await (await post('/source', JSON.stringify({ kind: 'file', path: 'docs/tasks.postman_collection.json' }))).json();
      assert.deepEqual([preview.format, preview.operations, preview.created, preview.updated], ['postman', 5, 5, 0]);
      assert.deepEqual(preview.folders, [{ folder: 'auth', count: 1 }, { folder: 'tasks', count: 4 }]);
      assert.equal(preview.base_url, 'http://localhost:3000/api');
      // A prévia não grava nada
      assert.ok(!fs.existsSync(path.join(project, 'rhyla-docs/body/tasks')));
      assert.equal((await post('/source', JSON.stringify({ kind: 'file', path: '../outside.json' }))).status, 400);
      assert.equal((await post('/source', JSON.stringify({ kind: 'url', url: 'ftp://x' }))).status, 400);
      const bad = await post('/source/upload?name=page.html', '<!doctype html><p>hi</p>', 'text/html');
      assert.match((await bad.json()).error, /HTML page/);
      const uploaded = await (await post('/source/upload?name=mine.json', JSON.stringify(collection()), 'application/octet-stream')).json();
      assert.deepEqual([uploaded.source, uploaded.operations], ['mine.json', 5]);

      // Envia o wizard com o arquivo enviado: as páginas são gravadas e o agente fica sabendo
      const waiting = call('setup_wizard', { wait: true });
      const ok = await post('', JSON.stringify({ source: { kind: 'upload', name: 'mine.json' }, language: 'English', mode: 'essential', flows: false, examples: ['curl'] }));
      assert.equal(ok.status, 200);
      const saved = await waiting;
      assert.equal(saved.status, 'saved');
      assert.equal(saved.imported.source, 'mine.json');
      assert.equal(saved.imported.format, 'Postman');
      assert.equal(saved.imported.pages, 5);
      assert.ok(saved.imported.routes.includes('/auth/post-log_in'));
      assert.match(saved.imported.next, /Do not rewrite them/);
      // O título veio da coleção: não fica para o agente
      assert.doesNotMatch(saved.site_todo || '', /Site title/);
      assert.ok(fs.existsSync(path.join(project, 'rhyla-docs/body/tasks/get-task.md')));
      assert.equal(JSON.parse(fs.readFileSync(path.join(project, 'rhyla-docs/config.json'), 'utf8')).title, 'Task Manager');

      // O prompt init deixa a escolha para o usuário e respeita a importação
      const init = (await srv.handle({ jsonrpc: '2.0', id: 1, method: 'prompts/get', params: { name: 'init', arguments: {} } })).result.messages[0].content.text;
      assert.match(init, /first step lets the user import an OpenAPI \/ Swagger spec or a Postman collection/);
      assert.match(init, /do not import a spec yourself/);
      assert.match(init, /If it returns imported, the route pages are already written/);
    } finally {
      await call('stop_preview');
    }
  });

  test('without a browser, ask_preferences offers the specs too', async () => {
    const srv = createMcpServer({ cwd: (() => { const p = specProject(); init({ cwd: p, quiet: true, blank: true }); return p; })() });
    await srv.handle({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
    const res = await json(srv.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'ask_preferences', arguments: {} } }));
    assert.equal(res.questions[0].id, 'spec');
    assert.deepEqual(res.questions[0].options, ['openapi.yaml', 'docs/tasks.postman_collection.json', 'No, read the code']);
    assert.match(res.then, /call import_openapi/);
  });
});
