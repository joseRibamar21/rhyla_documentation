import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { execFileSync, spawn } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { DOCS_DIR, loadConfig, updateConfig } from '../core/config.js';
import { createIgnoreMatcher } from '../core/ignore.js';
import { createMarkdown, renderFile, stripHtml } from '../core/content.js';
import { listPages, loadPage, resolvePageFile } from '../core/pages.js';
import { buildFlowGraph } from '../core/flows.js';
import { apiRenderOptions, normalizeApi } from '../core/api.js';
import { AUDIENCES, EXAMPLES, LANGUAGES, MODE_KEYS, defaultPreferences, formatPreferences, matchLanguage, readPreferences, savePreferences as storePreferences } from '../core/preferences.js';
import { findRoutes } from '../core/routes.js';
import { checkDocs } from '../core/check.js';
import { LOGO_MAX_BYTES, createSetup, formatSiteTodo, writeLogo } from '../core/setup.js';
import init, { SAMPLE_PAGES, TEMPLATES_DIR, blankHome } from './init.js';
import { importSpec } from './openapi.js';
import dev from './dev.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version } = createRequire(import.meta.url)('../../package.json');

// Versões do protocolo MCP suportadas (a primeira é a preferida)
const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];

// Igual ao build: o kit de desenvolvimento não é documentação
const DEFAULT_IGNORE = ['kit_dev_rhyla'];

// Se a porta pedida estiver ocupada, tenta as seguintes
const PREVIEW_PORT = 3333;
const PORT_ATTEMPTS = 10;
// Cada chamada de setup_wizard com wait espera no máximo isso (o Claude Code manda para
// segundo plano chamadas de mais de 2 minutos)
const SETUP_WAIT_MS = 90_000;

// Commit e data da última sincronização docs ⇄ código (versionado junto com as docs)
const SYNC_FILE = 'sync.json';
// Saídas do próprio Rhyla não contam como mudança de código
const NOT_CODE = [`${DOCS_DIR}/`, 'dist/'];
const MAX_CHANGES = 300;
const GIT_STATUS = { A: 'added', M: 'modified', D: 'deleted', R: 'renamed', C: 'copied', T: 'modified' };

const INSTRUCTIONS = `Rhyla documentation for this project lives in ${DOCS_DIR}/body as Markdown files; the file path is the route.
If there is no ${DOCS_DIR}/ yet, call init_docs first.
Use search_docs or list_pages to find pages and read_page to read one. Flows (type: flow) connect pages into processes; read them with get_flow.
Before writing, call get_conventions once (frontmatter, naming, API page format; topic "flows" for flow pages). Create pages with write_page, change them with edit_page, remove them with delete_page.
Call start_preview to serve the site locally and give the user its URL. find_routes lists the HTTP routes in the code without reading every file; if the project has an OpenAPI spec, import_openapi writes the route pages from it.
Route pages describe their endpoint in an api block in the frontmatter (see get_conventions): Rhyla renders the parameters, body, responses and request examples from it, and publishes openapi.json. check_docs compares the route pages with the routes in the code.
To document a whole project from its source code, follow the init prompt; after code changes, the sync prompt (get_changes, then mark_synced).`;

class ToolError extends Error {}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Seções "## " do AGENTS.md, ignorando "## " dentro de blocos de código
function splitSections(md) {
  const sections = [{ heading: '', text: '' }];
  let fence = null;
  for (const line of md.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker && !fence) fence = marker[1];
    else if (marker && fence && line.trim().startsWith(fence) && /^[`~]+$/.test(line.trim())) fence = null;
    else if (!fence && line.startsWith('## ')) sections.push({ heading: line.slice(3).trim(), text: '' });
    const current = sections[sections.length - 1];
    current.text += (current.text ? '\n' : '') + line;
  }
  return sections;
}

// Seções do AGENTS.md que um agente usando o MCP não precisa por padrão
const FLOW_SECTION = 'flows';
const API_SECTION = 'api endpoint pages';
const NOT_FOR_MCP = ['commands', 'mcp', 'machine-readable output'];
const isSection = (section, name) => fold(section.heading) === name;

// Arquivos (relativos a body/) de uma entrada de SAMPLE_PAGES no template
function sampleFiles(item) {
  const from = path.join(TEMPLATES_DIR, item);
  if (!fs.statSync(from).isDirectory()) return [item];
  return fs.readdirSync(from, { recursive: true })
    .map((f) => `${item}/${String(f).split(path.sep).join('/')}`)
    .filter((f) => /\.(md|html)$/i.test(f));
}

// Em clientes sem `/rhyla:<nome>`, o usuário escolhe o prompt pelo nome
const cmd = (name) => `the ${name} prompt (/rhyla:${name} in Claude Code)`;

const SHOW = 'Call start_preview and give the user the URL.';
const SAME_LANGUAGE = 'Follow the preferences returned by get_conventions (language, mode, flowcharts, audience, request examples) and the style of the existing pages.';

// As perguntas do wizard, para quando não há navegador: formulário (elicitation) ou chat, com as mesmas opções
const OTHER_LANGUAGE = 'Other (write it in Notes)';
const MODE_TITLES = {
  essential: 'Essential: routes only (cheapest)',
  balanced: 'Balanced: routes with context',
  complete: 'Complete: the whole project',
};

// Respostas sugeridas (ou salvas) → valores iniciais de cada pergunta
function questionDefaults(suggested) {
  const language = matchLanguage(suggested.language);
  const mode = MODE_KEYS.includes(suggested.mode) ? suggested.mode : 'balanced';
  const base = defaultPreferences(mode);
  return {
    language: language || (suggested.language ? OTHER_LANGUAGE : null),
    mode,
    flows: typeof suggested.flows === 'boolean' ? suggested.flows : base.flows,
    audience: AUDIENCES.includes(suggested.audience) ? suggested.audience : base.audience,
    examples: Array.isArray(suggested.examples) ? suggested.examples.filter((e) => EXAMPLES.some(([key]) => key === e)) : base.examples,
    notes: suggested.language && !language ? `Language: ${suggested.language}` : '',
  };
}

function preferenceForm(defaults, { hasApi }) {
  const properties = {
    language: { type: 'string', title: 'Language', description: 'Language the docs are written in.', enum: [...LANGUAGES.map(([name]) => name), OTHER_LANGUAGE] },
    mode: { type: 'string', title: 'Mode', description: 'How much of the project the docs cover, and how much time and tokens they cost.', enum: MODE_KEYS, enumNames: MODE_KEYS.map((key) => MODE_TITLES[key]), default: defaults.mode },
    flows: { type: 'boolean', title: 'Flowcharts', description: 'Diagrams of multi-step processes, such as sign-up or checkout.', default: defaults.flows },
    audience: { type: 'string', title: 'Audience', description: 'Who will read the docs.', enum: AUDIENCES, default: defaults.audience },
  };
  if (hasApi) {
    for (const [key, title] of EXAMPLES) {
      properties[`example_${key}`] = { type: 'boolean', title: `Examples: ${title}`, description: 'Request examples on the API pages.', default: defaults.examples.includes(key) };
    }
  }
  properties.notes = { type: 'string', title: 'Notes', description: 'Optional: another language, tone, what to leave out…' };
  if (defaults.language) properties.language.default = defaults.language;
  if (defaults.notes) properties.notes.default = defaults.notes;
  return { type: 'object', properties, required: ['language', 'mode'] };
}

function preferencesFromForm(content, { hasApi }) {
  const notes = typeof content.notes === 'string' ? content.notes.trim() : '';
  return {
    language: content.language === OTHER_LANGUAGE ? 'Other (see notes)' : content.language,
    mode: content.mode,
    flows: content.flows === true,
    audience: content.audience,
    examples: hasApi ? EXAMPLES.map(([key]) => key).filter((key) => content[`example_${key}`] === true) : [],
    ...(notes ? { notes } : {}),
  };
}

function preferenceQuestions(defaults, { hasApi }) {
  const questions = [
    { id: 'language', question: 'Which language should the docs be written in?', multiple: false, options: LANGUAGES.map(([name]) => name), suggested: defaults.language },
    {
      id: 'mode',
      question: 'How much should the docs cover?',
      multiple: false,
      options: [
        { value: 'essential', label: 'Essential', description: 'Routes only: one page per route. The fastest and cheapest.' },
        { value: 'balanced', label: 'Balanced', description: 'Routes with context: business rules, errors, authentication, and a getting-started guide.' },
        { value: 'complete', label: 'Complete', description: 'The whole project: also architecture, modules, configuration and deployment.' },
      ],
      suggested: defaults.mode,
    },
    { id: 'flows', question: 'Include flowcharts of multi-step processes?', multiple: false, options: [{ value: true, label: 'Yes' }, { value: false, label: 'No' }], suggested: defaults.flows },
  ];
  if (hasApi) {
    questions.push({ id: 'examples', question: 'Which request examples should the API pages have?', multiple: true, options: EXAMPLES.map(([value, label]) => ({ value, label })), suggested: defaults.examples });
  }
  return questions;
}

// Tenta abrir o navegador do usuário (sem esperar: se falhar, o agente mostra o link)
function openBrowser(url) {
  if (process.env.RHYLA_NO_BROWSER) return false;
  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) return false;
  const [command, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function packageInfo(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return { name: typeof pkg.name === 'string' ? pkg.name : '', description: typeof pkg.description === 'string' ? pkg.description : '' };
  } catch {
    return { name: '', description: '' };
  }
}

const PROMPT_TEXT = {
  init({ language, hasDocs, samples, homeIsSample }) {
    const existing = [];
    if (hasDocs) {
      existing.push(`${DOCS_DIR}/ already exists: call list_pages and keep what is there. Update pages instead of creating duplicates, and never delete pages someone wrote for this project.`);
    }
    if (samples.length) {
      existing.push(`These pages are Rhyla's untouched sample pages and describe Rhyla, not this project: ${samples.join(', ')}. Delete them with delete_page.`);
    }
    if (homeIsSample) existing.push('body/home.md is still the Rhyla sample home page: rewrite it for this project.');

    return `Generate the documentation site for this project with Rhyla, then show it to the user.

1. Open the setup wizard: call setup_wizard${language ? ` with language: "${language}"` : ''}. It creates ${DOCS_DIR}/ if needed, starts the local site and opens the wizard in the user's browser, where they choose the language, the mode (Essential, Balanced or Complete) and whether to include flowcharts. Tell the user in one line that the wizard is open, with its URL.
   If the wizard cannot be used (no browser, or the user prefers to answer here), call ask_preferences instead and follow its result.

2. While the user answers, look around: call find_routes and read the README and the package manifest. Do not write pages yet.
   If find_routes reports openapi_files, the API is already described: in step 7, write the route pages with import_openapi instead of by hand (no code reading, no tokens), then add only what the spec does not say.
${existing.length ? `   ${existing.join('\n   ')}\n` : ''}
3. Call setup_wizard with wait: true, again while it returns status "waiting" (each call waits up to 90 seconds). When it returns "saved", follow the preferences it returns, above all the instructions of the chosen mode: they say what to read and what to write. If it also returns site_todo, do it (the user left the title or the logo to you).

4. Call get_conventions once (and with topic "flows" if the user wants flowcharts).

5. Read what the mode asks for, and nothing more. Document only what the code shows; when something is unclear, say so on the page instead of guessing.

6. Plan the pages and call set_plan with them (path and title), so the wizard shows the progress. With an OpenAPI spec, import_openapi with dry_run: true lists the route pages it will create; include them in the plan.

7. Write the pages with write_page, several per call (pages: [...]), in the chosen language and for the chosen audience. Give each page a title and a description, use order so the sidebar reads in a sensible sequence, and link pages to each other with root-relative links (/api/users/get-list).

8. Call check_docs and fix its errors: write the pages of the routes it lists as undocumented and fix the invalid api blocks. Pages of routes it says are not in the code are usually a wrong path or method; check the code before changing them.

9. Call mark_synced: the wizard shows that the docs are ready, and ${cmd('sync')} later only looks at what changed.

10. Tell the user the docs are ready at the preview URL (the wizard links to them too). Summarize the pages and list anything you could not confirm from the code, plus the check_docs warnings you left.`;
  },

  sync() {
    return `Bring the Rhyla documentation of this project up to date with the code, then show it to the user.

1. Call get_changes. It lists the files changed since the last sync, including uncommitted ones.
   - If it reports no changes, skip step 3: the code is the same, but check_docs may still find route pages written before the api block existed.
   - If the project was never synced or is not a git repository, compare the whole code base with the docs instead.
   - If there is no Rhyla project yet, tell the user to run ${cmd('init')} and stop.

2. Call get_conventions once and list_pages to see what is documented.

3. For each changed file, read it (and its diff, if you can run git) and find the pages that cover it with search_docs (file names, routes, function and option names). Then:
   - fix what no longer matches the code with edit_page, changing only the parts that are out of date (read the page first); use write_page only when most of a page has to change;
   - create pages for new things: endpoints, modules, configuration options, commands;
   - delete pages about things that were removed, with delete_page (if a page mixes removed and current content, edit out the removed parts instead);
   - fix flows whose steps point to changed or removed pages (get_flow reports warnings; get_conventions with topic "flows" has the format).
   Leave pages unrelated to the changes alone. ${SAME_LANGUAGE} Document only what the code shows.

4. Call check_docs and fix its errors (routes without a page, pages of routes that are no longer in the code, invalid api blocks).
   Then add the api block to the route pages it warns have none (no_api_block): read the route in the code (find_routes gives the file and line) and add the block to the frontmatter with edit_page, in the format of get_conventions. Take out of the text the parameter tables, field lists and request examples the block now generates; keep the rest of the text.

5. Call mark_synced.

6. If nothing had to change, tell the user the docs are up to date. Otherwise: ${SHOW} Then list the pages you updated, created and deleted, and anything you could not confirm from the code.`;
  },

  clear() {
    return `Reset the Rhyla documentation of this project to a blank site.

1. Call list_pages and tell the user exactly what will be deleted: the number of pages and the folders. config.json, the theme (header.html, styles/) and the files in public/ are kept.

2. Ask the user to confirm. Do not continue without an explicit yes.

3. Call clear_docs with confirm: true.

4. Tell the user it is done and that ${cmd('init')} writes the documentation again from the code.`;
  },

  preview() {
    return `Show the Rhyla documentation of this project to the user. ${SHOW} Do not change any file. If there is no Rhyla project yet, suggest ${cmd('init')}.`;
  },

  page({ path: target }) {
    return `Document ${target ? `\`${target}\`` : 'the file or module the user names (ask for it if they did not)'} in the Rhyla documentation of this project.

1. If there is no Rhyla project yet, call init_docs first. Call get_conventions once.

2. Read the file and whatever it depends on that is needed to understand it (imported modules, schemas, configuration). Document only what the code shows.

3. Call search_docs and list_pages to find the pages that already cover it. Update them instead of creating duplicates, with edit_page for the parts that changed.

4. Write new pages with write_page, in the folder that fits the existing structure. An HTTP route file gets one page per endpoint (api/<resource>/<method>-<name>.md) with the api block in the frontmatter (method, path, auth, parameters, body, responses: see get_conventions) and, in the text, only what the block cannot say: what the route is for, rules, errors, links. Other modules get one page with their purpose, public functions or options, and an example. Link the new pages from related pages. ${SAME_LANGUAGE}

5. ${SHOW} Point to the pages you wrote.`;
  },

  flow({ process: name }) {
    return `Create a flow page in the Rhyla documentation of this project for ${name ? `the "${name}" process` : 'the main multi-step processes in the code, such as a sign-up, checkout or job pipeline (ask the user which one if there are several)'}.

1. If there is no Rhyla project yet, call init_docs first. Call get_conventions once with topic "all" (pages and the flow format) and get_flow to see the flows that already exist.

2. Follow the process in the code from start to end: the calls, decisions, error paths and retries. Each step is a page (an endpoint or a module); decisions and outcomes without a page are text steps. Label the branches.

3. Make sure every step page exists: find it with search_docs, or create it with write_page.

4. Write the flow with write_page in flows/, with type: flow and its steps in the frontmatter, plus a short text about the process. Then call get_flow with its route and fix every warning (unknown pages or step ids) with edit_page. ${SAME_LANGUAGE}

5. ${SHOW} Point to the flow page.`;
  },
};

/**
 * Cria o servidor MCP (sem transporte). `handle(message)` recebe uma mensagem JSON-RPC
 * e resolve com a resposta, ou null para notificações.
 *
 * `send` envia mensagens do servidor ao cliente (pedidos como elicitation/create); `close()`
 * cancela os pedidos que ainda esperam resposta.
 *
 * @param {{ cwd?: string, readOnly?: boolean, send?: (message: object) => void }} opts
 */
export function createMcpServer(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const rhylaPath = path.join(cwd, DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  const readOnly = Boolean(opts.readOnly);
  // Dev server iniciado por start_preview ou setup_wizard (vive enquanto o processo do MCP viver)
  let preview = null;
  // Estado do wizard de configuração, compartilhado com o dev server do preview
  const setup = createSetup({ cwd, agent: true });
  // Capacidades do cliente (initialize) e pedidos do servidor ao cliente (ex.: elicitation) aguardando resposta
  let clientCapabilities = {};
  const outgoing = new Map();
  let nextRequestId = 1;

  function request(method, params) {
    if (!opts.send) return Promise.reject(new Error('No transport to send requests to the client'));
    const id = `rhyla-${nextRequestId++}`;
    return new Promise((resolve, reject) => {
      outgoing.set(id, { resolve, reject });
      opts.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  // `elicitation: {}` (sem modos) também vale como modo form
  function canShowForms() {
    const e = clientCapabilities.elicitation;
    return Boolean(e) && typeof e === 'object' && (!Object.keys(e).length || 'form' in e);
  }

  function close() {
    for (const { reject } of outgoing.values()) reject(new Error('The connection was closed'));
    outgoing.clear();
    setup.cancel();
  }

  function requireProject() {
    if (!fs.existsSync(bodyPath)) {
      throw new ToolError(`No Rhyla project found (missing ${DOCS_DIR}/body). Call init_docs to create it.`);
    }
  }

  function listen(port) {
    return new Promise((resolve, reject) => {
      const server = dev({ cwd, port, quiet: true, setup });
      server.once('error', reject);
      server.once('listening', () => {
        server.off('error', reject);
        resolve(server);
      });
    });
  }

  // Saída do git, ou null se o comando falhar (sem git, fora de um repositório, commit inexistente…)
  function git(args) {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  }

  const syncFile = () => path.join(rhylaPath, SYNC_FILE);
  function readSync() {
    try {
      return JSON.parse(fs.readFileSync(syncFile(), 'utf8'));
    } catch {
      return null;
    }
  }

  // Arquivos alterados desde o commit da última sincronização, incluindo os não commitados
  function changesSinceSync() {
    const sync = readSync();
    const lastSync = (sync && sync.synced_at) || null;
    const compareAll = (note) => ({ last_sync: lastSync, since: null, files: null, note: `${note}: compare the whole code base with the docs.` });
    if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') return { git: false, ...compareAll('Not a git repository') };
    const head = git(['rev-parse', 'HEAD']);
    if (!sync || !sync.commit) return { git: true, head, ...compareAll('Never synced') };
    if (git(['cat-file', '-e', `${sync.commit}^{commit}`]) === null) {
      return { git: true, head, ...compareAll(`The last synced commit ${sync.commit} is no longer in this repository`) };
    }

    const files = [];
    for (const line of (git(['diff', '--name-status', '--relative', sync.commit]) || '').split('\n').filter(Boolean)) {
      const [code, a, b] = line.split('\t');
      const status = GIT_STATUS[code[0]] || 'modified';
      files.push(b ? { status, file: b, from: a } : { status, file: a });
    }
    for (const file of (git(['ls-files', '--others', '--exclude-standard']) || '').split('\n').filter(Boolean)) {
      files.push({ status: 'added', file });
    }
    const code = files.filter((f) => !NOT_CODE.some((dir) => f.file.startsWith(dir)));
    return {
      git: true,
      head,
      last_sync: lastSync,
      since: sync.commit,
      total: code.length,
      files: code.slice(0, MAX_CHANGES),
      truncated: code.length > MAX_CHANGES || undefined,
    };
  }

  function savePreferences(update) {
    try {
      return storePreferences(rhylaPath, update);
    } catch (err) {
      throw new ToolError(err.message);
    }
  }

  async function startPreview(port = PREVIEW_PORT) {
    if (preview) return { status: 'running', url: preview.url };
    const first = Number(port);
    for (let attempt = 0; attempt < PORT_ATTEMPTS; attempt++) {
      try {
        const server = await listen(first === 0 ? 0 : first + attempt);
        preview = { server, url: `http://127.0.0.1:${server.address().port}` };
        return { status: 'started', url: preview.url };
      } catch (err) {
        if (err.code !== 'EADDRINUSE' || first === 0) throw err;
      }
    }
    throw new ToolError(`Ports ${first}-${first + PORT_ATTEMPTS - 1} are busy. Call start_preview with another port.`);
  }

  // Valida um caminho de página para escrita: arquivo .md dentro de body/
  function pageTarget(target, content) {
    if (typeof content !== 'string' || !content.trim()) throw new ToolError(`content must not be empty (${target || 'no path'})`);
    let rel = String(target || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '');
    if (!rel) throw new ToolError('path must not be empty');
    if (!rel.toLowerCase().endsWith('.md')) rel += '.md';
    const root = path.resolve(bodyPath);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) throw new ToolError(`path must stay inside rhyla-docs/body (${target})`);
    if (/(^|\/)(notfound|\.?search)\.md$/i.test(rel)) throw new ToolError(`"${rel}" is a reserved file name`);
    return { rel, file, content };
  }

  // Páginas de exemplo do template que continuam idênticas às originais
  function untouchedSamples() {
    const same = (rel) => {
      const file = path.join(bodyPath, rel);
      return fs.existsSync(file) && fs.readFileSync(file).equals(fs.readFileSync(path.join(TEMPLATES_DIR, rel)));
    };
    const routes = SAMPLE_PAGES.filter((item) => item !== 'home.md')
      .flatMap(sampleFiles)
      .filter(same)
      .map((rel) => '/' + rel.replace(/\.(md|html)$/i, ''));
    return { routes, home: same('home.md') };
  }

  // Lido a cada chamada: o agente pode estar editando os arquivos
  function context() {
    const config = loadConfig(rhylaPath);
    return {
      config,
      md: createMarkdown({ allowRawHtml: config.allowRawHtml }),
      allowRawHtml: config.allowRawHtml,
      api: apiRenderOptions(config.raw),
      isIgnored: createIgnoreMatcher([...DEFAULT_IGNORE, ...config.buildIgnore]),
    };
  }

  const relFile = (file) => path.relative(rhylaPath, file).split(path.sep).join('/');

  function summarize(page) {
    return {
      route: page.route,
      title: page.title,
      description: page.description || undefined,
      type: page.data && page.data.type === 'flow' ? 'flow' : undefined,
      file: relFile(page.file),
    };
  }

  const routeOf = (slug) => (slug === 'home' ? '/' : `/${slug}`);

  // Problemas no bloco `api:` de uma página, para o agente corrigir na hora
  const apiWarnings = (data) => {
    const warnings = data && data.api !== undefined ? normalizeApi(data.api).warnings : [];
    return warnings.length ? { api_warnings: warnings } : {};
  };

  const tools = [
    {
      name: 'init_docs',
      title: 'Create the documentation workspace',
      description: `Create ${DOCS_DIR}/ (config, theme, home and 404 pages) when other tools report there is no Rhyla project. Does nothing if it exists.`,
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Site title, usually the project name.' },
          description: { type: 'string', description: 'One sentence about the project.' },
          template: { type: 'string', enum: ['blank', 'demo'], description: '"blank" (default); "demo" adds sample pages about Rhyla itself.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ title, description, template = 'blank' }) {
        if (fs.existsSync(rhylaPath)) {
          return { data: { status: 'exists', root: DOCS_DIR, next: 'Call list_pages to see the existing pages.' } };
        }
        init({ cwd, quiet: true, blank: template !== 'demo', title, description });
        const ctx = context();
        return {
          data: {
            status: 'created',
            root: DOCS_DIR,
            pages: listPages(bodyPath, { isIgnored: ctx.isIgnored }).map((p) => p.route),
            next: 'Call get_conventions, then create pages with write_page.',
          },
        };
      },
    },
    {
      name: 'setup_wizard',
      title: 'Open the setup wizard',
      description: "Open the docs setup wizard in the user's browser (language, mode, flowcharts), on the local preview; creates rhyla-docs/ if needed. Then call it with wait: true until it returns status \"saved\" with the user's choices (each call waits up to 90 s).",
      inputSchema: {
        type: 'object',
        properties: {
          wait: { type: 'boolean', description: 'true: wait for the answers.' },
          language: { type: 'string', description: 'Language to preselect, if the user named one.' },
          open: { type: 'boolean', description: 'false: only return the URL, without opening the browser.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      async run({ wait, language, open = true }) {
        if (wait) {
          if (setup.status().phase === 'idle') throw new ToolError('Open the wizard first: call setup_wizard without wait.');
          const result = await setup.wait(opts.setupWaitMs ?? SETUP_WAIT_MS);
          if (result.status === 'waiting') {
            return { data: { status: 'waiting', url: `${preview ? preview.url : ''}/__rhyla/setup`, next: 'The user has not finished the wizard yet. Call setup_wizard with wait: true again.' } };
          }
          const siteTodo = formatSiteTodo(result.siteTodo);
          return { data: { status: 'saved', preferences: formatPreferences(result.preferences), ...(siteTodo ? { site_todo: siteTodo } : {}) } };
        }
        if (!fs.existsSync(bodyPath)) {
          const pkg = packageInfo(cwd);
          init({ cwd, quiet: true, blank: true, title: pkg.name || path.basename(cwd), description: pkg.description });
        }
        setup.open(language ? { language: matchLanguage(language) || language } : {});
        const { url } = await startPreview();
        const wizard = `${url}/__rhyla/setup`;
        return {
          data: {
            status: 'open',
            url: wizard,
            opened: open !== false && openBrowser(wizard),
            next: 'Tell the user the wizard is open (with the URL). While they answer, call find_routes and read the README; then call setup_wizard with wait: true.',
          },
        };
      },
    },
    {
      name: 'set_plan',
      title: 'Share the page plan',
      description: 'List the pages you are about to write, so the setup wizard shows the user the progress. Call once, before writing.',
      inputSchema: {
        type: 'object',
        properties: {
          pages: {
            type: 'array',
            items: { type: 'object', properties: { path: { type: 'string' }, title: { type: 'string' } }, required: ['path'], additionalProperties: false },
          },
        },
        required: ['pages'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ pages }) {
        return { data: { planned: setup.setPlan(Array.isArray(pages) ? pages : []) } };
      },
    },
    {
      name: 'set_site',
      title: 'Set the site title and logo',
      description: 'Set the title and/or the logo shown at the top of every page. logo_file is an image inside the project; it is copied to rhyla-docs/public/.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          logo_file: { type: 'string', description: 'Project path of the image, e.g. "public/logo.svg".' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ title, logo_file: logoFile }) {
        requireProject();
        const patch = {};
        if (typeof title === 'string' && title.trim()) patch.title = title.trim();
        if (typeof logoFile === 'string' && logoFile.trim()) {
          const root = path.resolve(cwd);
          const file = path.resolve(root, logoFile);
          if (!file.startsWith(root + path.sep)) throw new ToolError('logo_file must be inside the project');
          if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new ToolError(`No file at ${logoFile}`);
          if (fs.statSync(file).size > LOGO_MAX_BYTES) throw new ToolError('The logo is larger than 2 MB.');
          try {
            patch.logo = writeLogo(path.join(rhylaPath, 'public'), file, fs.readFileSync(file));
          } catch (err) {
            throw new ToolError(err.message);
          }
        }
        if (!Object.keys(patch).length) throw new ToolError('Pass title, logo_file or both.');
        try {
          updateConfig(rhylaPath, patch);
        } catch (err) {
          throw new ToolError(err.message);
        }
        return { data: { title: patch.title, logo: patch.logo } };
      },
    },
    {
      name: 'find_routes',
      title: 'Find the HTTP routes',
      description: 'List the HTTP routes in the code (Express, Fastify, Koa, Hono, Nest, Next.js…) by pattern matching, without reading files yourself: method, full path, file and line, plus the files to read. Check unresolved_mounts.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run() {
        return { data: findRoutes(cwd) };
      },
    },
    {
      name: 'check_docs',
      title: 'Check the docs against the code',
      description: 'Compare the route pages with the HTTP routes in the code, without reading files yourself (same as `rhyla check`). Errors: routes without a page, pages of routes that are not in the code, invalid api blocks. Warnings: route pages without an api block, routes documented twice, broken flows, links to pages that do not exist.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run() {
        requireProject();
        return { data: checkDocs(cwd) };
      },
    },
    {
      name: 'import_openapi',
      title: 'Import an OpenAPI spec',
      description: 'Write one route page per operation of an OpenAPI 3 or Swagger 2 spec (JSON or YAML file in the project, or an http(s) URL), with the api block filled in from the spec, without reading the code. Pages that already document the same method and path only get their api block replaced; their text stays.',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Project path ("openapi.yaml") or URL ("http://localhost:3000/docs/json").' },
          update: { type: 'boolean', description: 'false: leave pages that already document an operation untouched (default true).' },
          dry_run: { type: 'boolean', description: 'true: only report the pages it would create or update.' },
        },
        required: ['source'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      writes: true,
      async run({ source, update = true, dry_run: dryRun = false }) {
        requireProject();
        const src = String(source || '').trim();
        if (!src) throw new ToolError('source must not be empty');
        if (!/^https?:\/\//i.test(src)) {
          const root = path.resolve(cwd);
          if (!path.resolve(root, src).startsWith(root + path.sep)) throw new ToolError('source must be a file inside the project or an http(s) URL');
        }
        let result;
        try {
          result = await importSpec({ cwd, source: src, update: update !== false, dryRun: dryRun === true });
        } catch (err) {
          throw new ToolError(`Could not import ${src}: ${err.message}`);
        }
        return {
          data: {
            ...(dryRun ? { dry_run: true } : {}),
            ...result,
            next: dryRun
              ? 'Call import_openapi again without dry_run to write the pages.'
              : 'The route pages are written. Add what the spec does not say (what each route is for, business rules, errors, links) with edit_page, without repeating the api block in the text.',
          },
        };
      },
    },
    {
      name: 'save_preferences',
      title: 'Save the documentation preferences',
      description: `Save the user's answers about the docs in ${DOCS_DIR}/config.json; only the fields passed change. get_conventions returns them.`,
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          mode: { type: 'string', enum: MODE_KEYS },
          flows: { type: 'boolean', description: 'Flowcharts of multi-step processes.' },
          audience: { type: 'string', description: 'Who reads the docs.' },
          examples: { type: 'array', items: { type: 'string' }, description: 'Request example languages, e.g. ["curl"]; [] for none.' },
          notes: { type: 'string', description: 'Anything else the user asked for (tone, what to leave out).' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      run(update) {
        requireProject();
        return { data: { preferences: savePreferences(update), file: `${DOCS_DIR}/config.json` } };
      },
    },
    {
      name: 'ask_preferences',
      title: 'Ask the user how to write the docs',
      description: "The setup wizard's questions (language, mode, flowcharts, request examples) without a browser, with fixed options; the arguments are your suggested answers, preselected. Shows a form and saves the answers; if the client has no forms, returns the questions for you to ask, then save_preferences.",
      inputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string' },
          mode: { type: 'string', enum: MODE_KEYS },
          flows: { type: 'boolean' },
          audience: { type: 'string', enum: AUDIENCES },
          examples: { type: 'array', items: { type: 'string', enum: EXAMPLES.map(([key]) => key) } },
          has_api: { type: 'boolean', description: 'false leaves out the API questions.' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      writes: true,
      async run(args) {
        requireProject();
        const scope = { hasApi: args.has_api !== false };
        // Sem sugestão, parte do que já está salvo
        const defaults = questionDefaults({ ...readPreferences(rhylaPath), ...args });
        const ask = (note) => ({
          data: { status: 'ask', note, questions: preferenceQuestions(defaults, scope), then: 'Call save_preferences with the answers.' },
        });

        if (!canShowForms()) {
          return ask('This client cannot show forms. Ask the user exactly these questions with exactly these options, all at once (with a multiple-choice question tool if you have one; the user can always type another answer). Preselect the suggested answers.');
        }
        let result;
        try {
          result = await request('elicitation/create', {
            message: 'How should Rhyla write the documentation for this project?',
            requestedSchema: preferenceForm(defaults, scope),
          });
        } catch (err) {
          if (/closed/.test(err.message)) throw new ToolError('The connection was closed before the user answered.');
          return ask(`The form could not be shown (${err.message}). Ask the user exactly these questions with exactly these options, all at once.`);
        }
        if (!result || result.action !== 'accept') {
          return { data: { status: result && result.action === 'decline' ? 'declined' : 'cancelled', note: 'The user did not answer the form. Ask whether to go on with your suggestions.' } };
        }
        const preferences = savePreferences(preferencesFromForm(result.content || {}, scope));
        return { data: { status: 'saved', preferences: formatPreferences(preferences) } };
      },
    },
    {
      name: 'list_pages',
      title: 'List documentation pages',
      description: 'Every page (route, title, description, file), in sidebar order.',
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
      description: 'Source of one page (Markdown with frontmatter, or HTML).',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: '"/guide/install", "/" for home; "guide/install.md" also works.' },
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
      description: 'Full-text search over titles and content (case and accent insensitive); best matches first, with a snippet.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10.' },
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
      name: 'get_flow',
      title: 'Read a flow',
      description: 'Flows connect pages into a process. Without a route, lists the flows; with one, returns its steps, their pages, transitions and warnings.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'e.g. "/flows/checkout".' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run({ route }) {
        requireProject();
        const ctx = context();
        const pages = listPages(bodyPath, { isIgnored: ctx.isIgnored }).map((p) => loadPage(p, ctx));
        const graph = buildFlowGraph(pages);
        if (!route) {
          return {
            data: {
              count: graph.flows.length,
              flows: graph.flows.map((f) => ({ route: routeOf(f.slug), title: f.title, steps: f.steps.length })),
            },
          };
        }
        const slug = String(route).replace(/^\/+|\/+$/g, '').replace(/\.(md|html)$/i, '') || 'home';
        const flow = graph.flows.find((f) => f.slug === slug);
        if (!flow) throw new ToolError(`No flow at ${route}. Call get_flow without arguments to list flows.`);
        return {
          data: {
            route: routeOf(flow.slug),
            title: flow.title,
            start: flow.start,
            steps: flow.steps.map((st) => ({
              id: st.id,
              title: st.title,
              page: st.slug ? routeOf(st.slug) : null,
              note: st.note || undefined,
              next: st.next,
            })),
            warnings: flow.warnings.length ? flow.warnings : undefined,
          },
        };
      },
    },
    {
      name: 'get_conventions',
      title: 'Documentation conventions',
      description: "How to write pages in this project (folders, frontmatter, naming, API endpoint pages) and the user's preferences. Read before writing.",
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['pages', 'flows', 'all'], description: '"pages" (default); "flows" for the flow page format, before writing or fixing a flow; "all".' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run({ topic = 'pages' }) {
        const local = path.join(rhylaPath, 'AGENTS.md');
        const template = path.join(TEMPLATES_DIR, 'AGENTS.md');
        let text = fs.readFileSync(fs.existsSync(local) ? local : template, 'utf8');
        // AGENTS.md copiado antes do bloco `api:`: a seção de páginas de API vem do template
        const oldApi = splitSections(text).find((sec) => isSection(sec, API_SECTION) && !/^api:/m.test(sec.text));
        if (oldApi) {
          const current = splitSections(fs.readFileSync(template, 'utf8')).find((sec) => isSection(sec, API_SECTION));
          text = text.replace(oldApi.text, () => current.text.trimEnd());
        }
        if (topic === 'flows') {
          // Se o projeto apagou a seção do AGENTS.md, usa a do template
          const flows = splitSections(text).find((sec) => isSection(sec, FLOW_SECTION))
            || splitSections(fs.readFileSync(template, 'utf8')).find((sec) => isSection(sec, FLOW_SECTION));
          return { text: flows.text.trim() + '\n' };
        }
        let out = text.trimEnd();
        if (topic !== 'all') {
          // Seções próprias do projeto continuam; só o que um agente via MCP não usa sai
          out = splitSections(text)
            .filter((sec) => !isSection(sec, FLOW_SECTION) && !NOT_FOR_MCP.some((name) => isSection(sec, name)))
            .map((sec) => sec.text.trimEnd())
            .join('\n\n');
          out += '\n\n## Flows\n\nFlow pages (type: flow) have their own format: call get_conventions with topic "flows" before writing or fixing one.';
        }
        const saved = formatPreferences(context().config.raw.preferences || {});
        if (saved) out += `\n\n## Preferences for this project\n\nChosen by the user (config.json → preferences). Follow them in every page you write.\n\n${saved}`;
        return { text: out + '\n' };
      },
    },
    {
      name: 'write_page',
      title: 'Create or update pages',
      description: 'Create Markdown pages in rhyla-docs/body, or overwrite them (for small changes use edit_page): path + content, or pages: [{ path, content }] to write several in one call. Follow get_conventions.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path inside body/, e.g. "guide/install" or "api/users/post-create_user.md".' },
          content: { type: 'string', description: 'Full Markdown, optionally with YAML frontmatter.' },
          pages: {
            type: 'array',
            items: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'], additionalProperties: false },
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ path: target, content, pages }) {
        requireProject();
        const batch = Array.isArray(pages);
        if (batch && !pages.length) throw new ToolError('pages must not be empty');
        // Valida tudo antes de escrever: um caminho inválido não deixa o lote pela metade
        const targets = (batch ? pages : [{ path: target, content }]).map((p) => pageTarget(p && p.path, p && p.content));
        const results = targets.map(({ rel, file, content: text }) => {
          const existed = fs.existsSync(file);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, text.endsWith('\n') ? text : text + '\n', 'utf8');
          const slug = rel.replace(/\.md$/i, '');
          const page = renderFile(file, context());
          return {
            action: existed ? 'updated' : 'created',
            route: slug.toLowerCase() === 'home' ? '/' : `/${slug}`,
            file: relFile(file),
            title: page.title,
            ...apiWarnings(page.data),
          };
        });
        return { data: batch ? { written: results } : results[0] };
      },
    },
    {
      name: 'edit_page',
      title: 'Edit part of a page',
      description: 'Replace an exact piece of text in a page (frontmatter included) without resending the whole page. Read the page first; old_text must match exactly once, unless replace_all is true.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'Page route, e.g. "/api/users/post-create_user".' },
          old_text: { type: 'string', description: 'Exact text to replace, copied from read_page.' },
          new_text: { type: 'string', description: 'Replacement ("" deletes old_text).' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence.' },
        },
        required: ['route', 'old_text', 'new_text'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      writes: true,
      run({ route, old_text: oldText, new_text: newText, replace_all: replaceAll }) {
        requireProject();
        const resolved = resolvePageFile(bodyPath, String(route || '/').replace(/\.md$/i, ''));
        if (!resolved) throw new ToolError(`Page not found: ${route}. Use list_pages or search_docs to find valid routes.`);
        if (typeof oldText !== 'string' || !oldText) throw new ToolError('old_text must not be empty');
        if (typeof newText !== 'string') throw new ToolError('new_text must be a string');
        const source = fs.readFileSync(resolved.file, 'utf8');
        const count = source.split(oldText).length - 1;
        const where = routeOf(resolved.slug);
        if (!count) throw new ToolError(`old_text was not found in ${where}. Read the page with read_page and copy the text exactly, line breaks included.`);
        if (count > 1 && !replaceAll) {
          throw new ToolError(`old_text appears ${count} times in ${where}. Include more of the surrounding text to make it unique, or set replace_all.`);
        }
        const updated = replaceAll ? source.split(oldText).join(newText) : source.replace(oldText, () => newText);
        fs.writeFileSync(resolved.file, updated, 'utf8');
        const edited = { action: 'edited', route: where, file: relFile(resolved.file), replacements: replaceAll ? count : 1 };
        return { data: { ...edited, ...apiWarnings(renderFile(resolved.file, context()).data) } };
      },
    },
    {
      name: 'delete_page',
      title: 'Delete a page',
      description: 'Delete a page (not the home or 404 page); folders left empty are removed.',
      inputSchema: {
        type: 'object',
        properties: {
          route: { type: 'string', description: 'e.g. "/guide/old-page".' },
        },
        required: ['route'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ route }) {
        requireProject();
        const resolved = resolvePageFile(bodyPath, String(route || '').replace(/\.md$/i, ''));
        if (!resolved) throw new ToolError(`Page not found: ${route}. Use list_pages to find valid routes.`);
        if (resolved.slug === 'home' || /^notfound$/i.test(resolved.topic)) {
          throw new ToolError(`${routeOf(resolved.slug)} cannot be deleted; rewrite it with write_page instead.`);
        }
        fs.rmSync(resolved.file);
        const root = path.resolve(bodyPath);
        for (let dir = path.dirname(resolved.file); dir !== root && !fs.readdirSync(dir).length; dir = path.dirname(dir)) {
          fs.rmdirSync(dir);
        }
        return { data: { action: 'deleted', route: routeOf(resolved.slug), file: relFile(resolved.file) } };
      },
    },
    {
      name: 'clear_docs',
      title: 'Reset the documentation',
      description: 'Delete every page and leave a blank home page (config, theme and public/ are kept). Only after the user explicitly confirmed.',
      inputSchema: {
        type: 'object',
        properties: {
          confirm: { type: 'boolean', description: 'true once the user confirmed.' },
        },
        required: ['confirm'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      writes: true,
      run({ confirm }) {
        requireProject();
        if (confirm !== true) throw new ToolError('Ask the user to confirm the reset, then call clear_docs with confirm: true.');
        const deleted = listPages(bodyPath).length;
        for (const entry of fs.readdirSync(bodyPath)) {
          if (!/^notfound\.(md|html?)$/i.test(entry)) fs.rmSync(path.join(bodyPath, entry), { recursive: true, force: true });
        }
        const { config } = context();
        fs.writeFileSync(path.join(bodyPath, 'home.md'), blankHome(config.title, config.description), 'utf8');
        fs.rmSync(syncFile(), { force: true });
        return { data: { action: 'cleared', deleted, kept: ['config.json', 'header.html', 'styles/', 'public/', 'body/notFound.html'] } };
      },
    },
    {
      name: 'get_changes',
      title: 'Code changes since the last sync',
      description: 'Code files changed since the last mark_synced, uncommitted ones included (git). Without git or a previous sync, says to compare the whole code base.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false },
      run() {
        requireProject();
        return { data: changesSinceSync() };
      },
    },
    {
      name: 'mark_synced',
      title: 'Mark the docs as synced',
      description: `Record that the docs match the code (git commit and date in ${DOCS_DIR}/${SYNC_FILE}), after documenting or syncing.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      writes: true,
      run() {
        requireProject();
        const data = { commit: git(['rev-parse', 'HEAD']), synced_at: new Date().toISOString() };
        fs.writeFileSync(syncFile(), JSON.stringify(data, null, 2) + '\n', 'utf8');
        setup.finish();
        return { data: { ...data, file: `${DOCS_DIR}/${SYNC_FILE}` } };
      },
    },
    {
      name: 'start_preview',
      title: 'Start the local preview',
      description: 'Serve the site locally (like "rhyla dev") and return the URL for the user. Edits show up on reload; it stops when this session ends.',
      inputSchema: {
        type: 'object',
        properties: {
          port: { type: 'integer', minimum: 0, maximum: 65535, description: `Default ${PREVIEW_PORT}; the next free one is used if busy.` },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async run({ port = PREVIEW_PORT }) {
        requireProject();
        return { data: await startPreview(port) };
      },
    },
    {
      name: 'stop_preview',
      title: 'Stop the local preview',
      description: 'Stop the server started by start_preview.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      async run() {
        if (!preview) return { data: { status: 'not_running' } };
        const { server, url } = preview;
        preview = null;
        await new Promise((resolve) => server.close(resolve));
        return { data: { status: 'stopped', url } };
      },
    },
  ];

  const prompts = [
    {
      name: 'init',
      title: 'Document this project',
      description: 'Open a setup wizard in the browser (language, mode, flowcharts), then write the documentation site from the code and show it.',
      arguments: [{ name: 'language', description: 'Language to write the docs in, e.g. Portuguese (default: the language of the README).', required: false }],
      writes: true,
      text({ language }) {
        const hasDocs = fs.existsSync(bodyPath);
        const samples = hasDocs ? untouchedSamples() : { routes: [], home: false };
        return PROMPT_TEXT.init({ language, hasDocs, samples: samples.routes, homeIsSample: samples.home });
      },
    },
    {
      name: 'sync',
      title: 'Update the docs after code changes',
      description: 'Update, create and delete pages for the code that changed since the last sync, then open the preview.',
      arguments: [],
      writes: true,
      text: PROMPT_TEXT.sync,
    },
    {
      name: 'clear',
      title: 'Reset the documentation',
      description: 'Delete every page and leave a blank site (asks for confirmation first).',
      arguments: [],
      writes: true,
      text: PROMPT_TEXT.clear,
    },
    {
      name: 'preview',
      title: 'Open the docs preview',
      description: 'Serve the documentation site on a local port and return its URL, without changing files.',
      arguments: [],
      text: PROMPT_TEXT.preview,
    },
    {
      name: 'page',
      title: 'Document one file',
      description: 'Write or update the pages for one file or module, e.g. src/routes/users.js.',
      arguments: [{ name: 'path', description: 'File or folder to document, e.g. src/routes/users.js.', required: true }],
      writes: true,
      text: PROMPT_TEXT.page,
    },
    {
      name: 'flow',
      title: 'Map a process as a flow',
      description: 'Follow a multi-step process in the code and create its flow page with the diagram.',
      arguments: [{ name: 'process', description: 'Process to map, e.g. checkout (default: find the main ones).', required: false }],
      writes: true,
      text: PROMPT_TEXT.flow,
    },
  ];

  const available = tools.filter((t) => !(readOnly && t.writes));
  const availablePrompts = prompts.filter((p) => !(readOnly && p.writes));

  // Só dados → JSON + structuredContent; só texto → texto; ambos → metadados JSON + texto (sem structuredContent)
  function toolResult({ text, data }) {
    if (text === undefined) return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data };
    if (data === undefined) return { content: [{ type: 'text', text }] };
    return { content: [{ type: 'text', text: JSON.stringify(data) }, { type: 'text', text }] };
  }

  async function callTool(params = {}) {
    const tool = available.find((t) => t.name === params.name);
    if (!tool) return { error: { code: -32602, message: `Unknown tool: ${params.name}` } };
    try {
      return { result: toolResult(await tool.run(params.arguments || {})) };
    } catch (err) {
      // Erros de execução vão no resultado (isError) para o modelo poder se corrigir
      const message = err instanceof ToolError ? err.message : `Unexpected error: ${err.message}`;
      return { result: { content: [{ type: 'text', text: message }], isError: true } };
    }
  }

  function getPrompt(params = {}) {
    const prompt = availablePrompts.find((p) => p.name === params.name);
    if (!prompt) return { error: { code: -32602, message: `Unknown prompt: ${params.name}` } };
    const text = prompt.text(params.arguments || {});
    return { result: { description: prompt.description, messages: [{ role: 'user', content: { type: 'text', text } }] } };
  }

  async function handle(msg) {
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0') {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
    }
    // Resposta do cliente a um pedido do servidor
    if (msg.method === undefined && ('result' in msg || 'error' in msg)) {
      const waiting = outgoing.get(msg.id);
      if (waiting) {
        outgoing.delete(msg.id);
        if (msg.error) waiting.reject(new Error(msg.error.message || 'Client error'));
        else waiting.resolve(msg.result);
      }
      return null;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    const reply = (body) => (isNotification ? null : { jsonrpc: '2.0', id: msg.id, ...body });

    switch (msg.method) {
      case 'initialize': {
        const requested = msg.params && msg.params.protocolVersion;
        clientCapabilities = (msg.params && msg.params.capabilities) || {};
        return reply({
          result: {
            protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
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
        return reply(await callTool(msg.params));
      case 'prompts/list':
        return reply({
          result: { prompts: availablePrompts.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })) },
        });
      case 'prompts/get':
        return reply(getPrompt(msg.params));
      default:
        if (isNotification) return null; // ex.: notifications/initialized, notifications/cancelled
        return reply({ error: { code: -32601, message: `Method not found: ${msg.method}` } });
    }
  }

  return { handle, close, tools: available };
}

/**
 * `rhyla mcp`: servidor MCP via stdio (uma mensagem JSON-RPC por linha).
 * stdout é reservado ao protocolo; logs vão para stderr.
 */
export default function mcp(opts = {}) {
  const cwd = opts.dir ? path.resolve(opts.dir) : process.cwd();
  const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
  const server = createMcpServer({ cwd, readOnly: opts.readOnly, send });
  // Qualquer console.log (ex.: do dev server do preview) corromperia o protocolo
  console.log = console.info = console.error;

  async function processLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
    const messages = Array.isArray(msg) ? msg : [msg];
    const replies = (await Promise.all(messages.map((m) => server.handle(m)))).filter(Boolean);
    if (Array.isArray(msg)) { if (replies.length) send(replies); }
    else if (replies[0]) send(replies[0]);
  }

  // Respostas em andamento são enviadas antes de sair (o preview acaba junto com o processo)
  const pending = new Set();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const job = processLine(line).finally(() => pending.delete(job));
    pending.add(job);
  });
  rl.on('close', async () => {
    server.close();
    await Promise.allSettled(pending);
    process.exit(0);
  });

  console.error(`rhyla MCP server ready (${path.join(cwd, DOCS_DIR)}${opts.readOnly ? ', read-only' : ''})`);
}
