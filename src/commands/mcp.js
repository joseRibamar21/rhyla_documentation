import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { DOCS_DIR, loadConfig } from '../core/config.js';
import { createIgnoreMatcher } from '../core/ignore.js';
import { createMarkdown, renderFile, stripHtml } from '../core/content.js';
import { listPages, loadPage, resolvePageFile } from '../core/pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = createRequire(import.meta.url)('../../package.json');

// Versões do protocolo MCP suportadas (a primeira é a preferida)
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

// Igual ao build: o kit de desenvolvimento não é documentação
const DEFAULT_IGNORE = ['kit_dev_rhyla'];

const INSTRUCTIONS = `Rhyla documentation for this project lives in ${DOCS_DIR}/body as Markdown files; the file path is the route.
Use search_docs or list_pages to find pages and read_page to read one.
Before writing, call get_conventions once (frontmatter, naming, API page format), then use write_page.`;

class ToolError extends Error {}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Cria o servidor MCP (sem transporte). `handle(message)` recebe uma mensagem JSON-RPC
 * e devolve a resposta, ou null para notificações.
 *
 * @param {{ cwd?: string, readOnly?: boolean }} opts
 */
export function createMcpServer(opts = {}) {
  const rhylaPath = path.join(opts.cwd || process.cwd(), DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  const readOnly = Boolean(opts.readOnly);

  function requireProject() {
    if (!fs.existsSync(bodyPath)) {
      throw new ToolError(`No Rhyla project found (missing ${DOCS_DIR}/body). Run "rhyla init" in the project root.`);
    }
  }

  // Lido a cada chamada: o agente pode estar editando os arquivos
  function context() {
    const config = loadConfig(rhylaPath);
    return {
      config,
      md: createMarkdown({ allowRawHtml: config.allowRawHtml }),
      allowRawHtml: config.allowRawHtml,
      isIgnored: createIgnoreMatcher([...DEFAULT_IGNORE, ...config.buildIgnore]),
    };
  }

  const relFile = (file) => path.relative(rhylaPath, file).split(path.sep).join('/');

  function summarize(page) {
    return {
      route: page.route,
      title: page.title,
      description: page.description || undefined,
      file: relFile(page.file),
    };
  }

  const tools = [
    {
      name: 'list_pages',
      title: 'List documentation pages',
      description: 'List every page of the documentation with its route, title, description and source file, in sidebar order.',
      inputSchema: {
        type: 'object',
        properties: {
          group: { type: 'string', description: 'Only pages inside this folder, e.g. "guide" or "api/users".' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run({ group }) {
        requireProject();
        const ctx = context();
        const prefix = group ? String(group).replace(/^\/+|\/+$/g, '') : '';
        const pages = listPages(bodyPath, { isIgnored: ctx.isIgnored })
          .filter((p) => !prefix || p.group === prefix || p.group.startsWith(prefix + '/'))
          .map((p) => summarize(loadPage(p, ctx)));
        return { data: { site: ctx.config.title || undefined, count: pages.length, pages } };
      },
    },
    {
      name: 'read_page',
      title: 'Read a documentation page',
      description: 'Read the source of one page (Markdown with frontmatter, or HTML) by route, e.g. "/guide/install" or "/" for home.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Page route ("/guide/install"), also accepts "guide/install.md".' },
        },
        required: ['route'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run({ route }) {
        requireProject();
        const resolved = resolvePageFile(bodyPath, String(route || '/').replace(/\.md$/i, ''));
        if (!resolved) throw new ToolError(`Page not found: ${route}. Use list_pages or search_docs to find valid routes.`);
        const ctx = context();
        const page = renderFile(resolved.file, ctx);
        return {
          text: fs.readFileSync(resolved.file, 'utf8'),
          data: {
            route: resolved.slug === 'home' ? '/' : `/${resolved.slug}`,
            title: page.title,
            file: relFile(resolved.file),
          },
        };
      },
    },
    {
      name: 'search_docs',
      title: 'Search the documentation',
      description: 'Full-text search over titles and content (case and accent insensitive). Returns matching pages with a snippet, best matches first.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words or phrase to look for.' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Maximum results (default 10).' },
        },
        required: ['query'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run({ query, limit = 10 }) {
        requireProject();
        const q = fold(String(query || '').trim());
        if (!q) throw new ToolError('query must not be empty');
        const ctx = context();
        const terms = q.split(/\s+/).filter(Boolean);
        const results = [];
        for (const p of listPages(bodyPath, { isIgnored: ctx.isIgnored })) {
          const page = loadPage(p, ctx);
          const text = page.markdown !== null ? page.markdown : stripHtml(page.html);
          const title = fold(page.title);
          const body = fold(text);
          // Todas as palavras precisam aparecer (no título ou no conteúdo)
          if (!terms.every((t) => title.includes(t) || body.includes(t))) continue;
          const score = (title.includes(q) ? 10 : 0) + terms.filter((t) => title.includes(t)).length * 3
            + (body.includes(q) ? 2 : 0) + terms.reduce((n, t) => n + Math.min(body.split(t).length - 1, 5), 0) * 0.1;
          const at = Math.max(body.indexOf(q), body.indexOf(terms[0]));
          const from = Math.max(0, at - 80);
          const snippet = text.slice(from, from + 240).replace(/\s+/g, ' ').trim();
          results.push({ ...summarize(page), score: Math.round(score * 10) / 10, snippet: (from > 0 ? '…' : '') + snippet + '…' });
        }
        results.sort((a, b) => b.score - a.score);
        const top = results.slice(0, Math.min(Math.max(Number(limit) || 10, 1), 50));
        return { data: { query, total: results.length, results: top } };
      },
    },
    {
      name: 'get_conventions',
      title: 'Documentation conventions',
      description: 'How pages are organized and written in this project (folders, frontmatter, file naming, API endpoint pages). Read before writing pages.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run() {
        const local = path.join(rhylaPath, 'AGENTS.md');
        const file = fs.existsSync(local) ? local : path.join(__dirname, '../templates/AGENTS.md');
        return { text: fs.readFileSync(file, 'utf8') };
      },
    },
    {
      name: 'write_page',
      title: 'Create or update a page',
      description: 'Create or overwrite a Markdown page under rhyla-docs/body. Missing folders are created. Follow get_conventions (frontmatter, naming).',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Route or file path inside body/, e.g. "guide/install" or "api/users/post-create_user.md".' },
          content: { type: 'string', description: 'Full Markdown content, optionally starting with YAML frontmatter.' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ path: target, content }) {
        requireProject();
        if (typeof content !== 'string' || !content.trim()) throw new ToolError('content must not be empty');
        let rel = String(target || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '');
        if (!rel) throw new ToolError('path must not be empty');
        if (!rel.toLowerCase().endsWith('.md')) rel += '.md';
        const root = path.resolve(bodyPath);
        const file = path.resolve(root, rel);
        if (!file.startsWith(root + path.sep)) throw new ToolError('path must stay inside rhyla-docs/body');
        if (/(^|\/)(notfound|\.?search)\.md$/i.test(rel)) throw new ToolError(`"${rel}" is a reserved file name`);

        const existed = fs.existsSync(file);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content.endsWith('\n') ? content : content + '\n', 'utf8');
        const slug = rel.replace(/\.md$/i, '');
        const route = slug.toLowerCase() === 'home' ? '/' : `/${slug}`;
        return {
          data: {
            action: existed ? 'updated' : 'created',
            route,
            file: relFile(file),
            title: renderFile(file, context()).title,
          },
        };
      },
    },
  ];

  const available = tools.filter((t) => !(readOnly && t.writes));

  // Só dados → JSON + structuredContent; só texto → texto; ambos → metadados JSON + texto (sem structuredContent)
  function toolResult({ text, data }) {
    if (text === undefined) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
    if (data === undefined) return { content: [{ type: 'text', text }] };
    return { content: [{ type: 'text', text: JSON.stringify(data) }, { type: 'text', text }] };
  }

  function callTool(params = {}) {
    const tool = available.find((t) => t.name === params.name);
    if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params.name}` } };
    try {
      return { result: toolResult(tool.run(params.arguments || {})) };
    } catch (err) {
      // Erros de execução vão no resultado (isError) para o modelo poder se corrigir
      const message = err instanceof ToolError ? err.message : `Unexpected error: ${err.message}`;
      return { result: { content: [{ type: 'text', text: message }], isError: true } };
    }
  }

  function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }
    const isNotification = msg.id === undefined || msg.id === null;
    const reply = (body) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, ...body });

    switch (msg.method) {
      case 'initialize': {
        const requested = msg.params && msg.params.protocolVersion;
        return reply({
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'rhyla', title: 'Rhyla Docs', version },
            instructions: INSTRUCTIONS,
          },
        });
      }
      case 'ping':
        return reply({ result: {} });
      case 'tools/list':
        return reply({
          result: { tools: available.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) },
        });
      case 'tools/call':
        return reply(callTool(msg.params));
      default:
        if (isNotification) return null; // ex.: notifications/initialized, notifications/cancelled
        return reply({ error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  }

  return { handle, tools: available };
}

/**
 * `rhyla mcp`: servidor MCP via stdio (uma mensagem JSON-RPC por linha).
 * stdout é reservado ao protocolo; logs vão para stderr.
 */
export default function mcp(opts = {}) {
  const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const server = createMcpServer({ cwd, readOnly: opts.readOnly });
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const messages = Array.isArray(msg) ? msg : [msg];
    const replies = messages.map((m) => server.handle(m)).filter(Boolean);
    if (Array.isArray(msg)) { if (replies.length) send(replies); }
    else if (replies[0]) send(replies[0]);
  });
  rl.on('close', () => process.exit(0));

  console.error(`rhyla MCP server ready (${path.join(cwd, DOCS_DIR)}${opts.readOnly ? ', read-only' : ''})`);
}
