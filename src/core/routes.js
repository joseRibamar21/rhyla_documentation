import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

/*
 * Encontra as rotas HTTP de um projeto por padrões no código (sem executá-lo e sem IA):
 * Express, Fastify, Koa, Hono e parecidos (`app.get('/x')`), objetos de rota (`.route({ method, url })`),
 * Nest (decorators) e Next.js (app/**\/route.ts, pages/api). Prefixos montados em outro arquivo
 * (`register(x, { prefix })`, `use('/api', router)`, `route('/x', app)`) são resolvidos um nível.
 */

// Pastas que nunca são código do projeto
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'vendor', 'rhyla-docs', 'tmp']);
const JS_FILE = /\.(m|c)?(j|t)sx?$/i;
const SOURCE_FILE = /\.((m|c)?(j|t)sx?|py|rb|go|java|kt|php|cs|rs|swift|scala|ex|exs|vue|svelte|astro|dart|sql|graphql|prisma)$/i;
const TEST_FILE = /(^|\/)(__tests__|__mocks__|tests?|e2e|cypress|fixtures)\/|\.(test|spec|e2e)\.[^/]+$/i;
const MAX_FILES = 5000;
const MAX_FILE_SIZE = 512 * 1024;
const MAX_ROUTES = 400;

const HTTP_METHODS = 'get|post|put|patch|delete|head|options|all';
// POST /login, /auth/signin, /sessions, /oauth/token, /auth…
const LOGIN_PATH = /\/(log-?in|sign-?in|sessions?|tokens?|authenticate|auth)\/?$/i;
// Especificações OpenAPI no repositório e bibliotecas que geram uma com o servidor rodando
const SPEC_FILE = /(^|\/)[^/]*(openapi|swagger)[^/]*\.(json|ya?ml)$/i;
// "Tasks.postman_collection.json", "postman/api.json", "collection.json"
const POSTMAN_FILE = /\.postman_collection\.json$|(^|\/)[^/]*(postman|collection)[^/]*\.json$/i;
const SPEC_GENERATORS = /^(@fastify\/swagger|@nestjs\/swagger|swagger-jsdoc|swagger-autogen|express-openapi|express-oas-generator|tsoa|@hono\/zod-openapi|hono-openapi|@asteasolutions\/zod-to-openapi|@elysiajs\/swagger|@ts-rest\/open-api)$/;
// Objetos que fazem requisições (clientes HTTP, testes) ou só têm get/set, não declaram rotas
const NOT_A_SERVER = /^(axios|https?|got|ky|superagent|request|req|res|reply|ctx|client|apiclient|httpclient|fetcher|instance|agent|supertest|\$http|\$axios|cy|page|browser|map|cache|store|redis|params|query|headers|searchparams|url|config|env|process|window|document|storage|localstorage|sessionstorage|object|reflect|weakmap|response)$/i;
const SERVER_HINT = /(express|fastify|koa|hono|restify|@hapi|polka|elysia|itty-router|@nestjs|h3|nitro)/;

const posix = (p) => p.split(path.sep).join('/');

/** Arquivos do projeto (relativos, com "/"): os que o git conhece, ou uma varredura das pastas. */
export function listProjectFiles(root) {
  let files = null;
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024,
    });
    files = out.split('\n').filter(Boolean);
  } catch {
    files = [];
    const walk = (dir, rel) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (files.length >= MAX_FILES) return;
        if (entry.name.startsWith('.') && entry.name !== '.') continue;
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), relPath); }
        else files.push(relPath);
      }
    };
    walk(root, '');
  }
  return files
    .filter((f) => !f.split('/').some((part) => SKIP_DIRS.has(part)))
    .filter((f) => fs.existsSync(path.join(root, f)))
    .slice(0, MAX_FILES);
}

function readSmall(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && stat.size <= MAX_FILE_SIZE ? fs.readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}

// Só o começo do arquivo: basta para reconhecer uma especificação, mesmo grande
function readHead(file, bytes = 4096) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(bytes);
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, bytes, 0)).toString('utf8');
  } catch {
    return '';
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Tamanho do projeto: arquivos de código e linhas (para o wizard mostrar o custo de cada modo). */
export function projectStats(root, files = listProjectFiles(root)) {
  let codeFiles = 0;
  let lines = 0;
  for (const rel of files) {
    if (!SOURCE_FILE.test(rel)) continue;
    const text = readSmall(path.join(root, rel));
    if (text === null) continue;
    codeFiles++;
    if (text) lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  }
  return { codeFiles, lines };
}

function dependencies(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies });
  } catch {
    return [];
  }
}

// "/a/" + "/b" → "/a/b"; nunca termina com "/" (exceto a raiz)
export function joinRoute(...parts) {
  const joined = '/' + parts.map((p) => String(p || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
  return joined;
}

function lineAt(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Arquivo importado por `ident` (import/require relativos), resolvido a partir de `fromFile`
function importOf(root, fromFile, text, ident) {
  const id = ident.replace(/\$/g, '\\$');
  const patterns = [
    new RegExp(`import\\s+(?:type\\s+)?(?:\\*\\s+as\\s+)?${id}\\b[^'"\\n;]*from\\s*['"]([^'"]+)['"]`),
    new RegExp(`import\\s*(?:[\\w$]+\\s*,\\s*)?\\{[^}]*\\b${id}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`),
    new RegExp(`(?:const|let|var)\\s+${id}\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`),
    new RegExp(`(?:const|let|var)\\s*\\{[^}]*\\b${id}\\b[^}]*\\}\\s*=\\s*require\\(\\s*['"]([^'"]+)['"]\\s*\\)`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return resolveModule(root, fromFile, m[1]);
  }
  return null;
}

function resolveModule(root, fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(root, path.dirname(fromFile), spec);
  const noJs = base.replace(/\.(m|c)?js$/i, '');
  const candidates = [base, ...['.js', '.ts', '.mjs', '.cjs', '.jsx', '.tsx', '.mts'].map((e) => noJs + e), ...['index.js', 'index.ts'].map((i) => path.join(base, i))];
  const found = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  return found ? posix(path.relative(root, found)) : null;
}

function nextRoutePath(rel) {
  const m = rel.match(/(?:^|\/)app\/((?:.*\/)?)route\.(m|c)?(j|t)sx?$/i);
  if (!m) return null;
  const segments = m[1].split('/').filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'))
    .map((s) => s.replace(/^\[\[?\.\.\.(.+?)\]\]?$/, '*$1').replace(/^\[(.+)\]$/, ':$1'));
  return joinRoute(...segments);
}

function nextPagesApiPath(rel) {
  const m = rel.match(/(?:^|\/)pages\/api\/(.+)\.(m|c)?(j|t)sx?$/i);
  if (!m) return null;
  const segments = m[1].split('/').map((s) => s.replace(/^\[\.\.\.(.+)\]$/, '*$1').replace(/^\[(.+)\]$/, ':$1'));
  if (segments[segments.length - 1] === 'index') segments.pop();
  return joinRoute('api', ...segments);
}

/**
 * Arquivos de especificação OpenAPI / Swagger do projeto (o conteúdo é conferido) e
 * dependências que geram uma em tempo de execução.
 */
export function findOpenApi(root, files = listProjectFiles(root), deps = dependencies(root)) {
  const candidates = files.filter((f) => !/(^|\/)(node_modules|test|tests|__tests__|fixtures)\//i.test(f));
  const head = (f) => readHead(path.join(root, f));
  const specs = candidates.filter((f) => SPEC_FILE.test(f) && /["']?(openapi|swagger)["']?\s*:\s*["']?[23]\./.test(head(f)));
  const postman = candidates.filter((f) => POSTMAN_FILE.test(f) && !specs.includes(f) && /getpostman\.com\/json\/collection\/v2|"_postman_id"/.test(head(f)));
  return { files: specs, postman, generators: deps.filter((d) => SPEC_GENERATORS.test(d)) };
}

/**
 * @param {string} root raiz do projeto
 * @param {string[]} files arquivos do projeto (padrão: listProjectFiles)
 * @param {{ max?: number }} opts max: quantas rotas devolver (o `rhyla check` pede todas)
 * @returns {{ frameworks: string[], count: number, routes: object[], files: string[], unresolved_mounts: object[], openapi_files?: string[], postman_files?: string[], openapi_generators?: string[], truncated?: boolean, login_hint?: string, note: string }}
 */
export function findRoutes(root, files = listProjectFiles(root), { max = MAX_ROUTES } = {}) {
  const deps = dependencies(root);
  const frameworks = deps.filter((d) => /^(express|fastify|koa|@koa\/router|koa-router|hono|@nestjs\/core|next|restify|@hapi\/hapi|polka|elysia|h3)$/.test(d));
  const usesNext = deps.includes('next');

  const found = []; // { method, path, file, line }
  const mounts = []; // { prefix, file, line, target (arquivo) | ident }
  let nestGlobalPrefix = '';

  const sources = files.filter((f) => JS_FILE.test(f) && !TEST_FILE.test(f) && !/\.d\.ts$/.test(f));
  for (const rel of sources) {
    const text = readSmall(path.join(root, rel));
    if (text === null) continue;
    const line = lineAt(text);
    const add = (method, routePath, index) => found.push({ method: method.toUpperCase(), path: routePath, file: rel, line: line(index) });

    // Next.js
    const appRoute = nextRoutePath(rel);
    if (appRoute !== null) {
      const re = /export\s+(?:async\s+)?(?:function\s+|(?:const|let)\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
      for (let m; (m = re.exec(text));) add(m[1], appRoute, m.index);
      continue;
    }
    if (usesNext) {
      const pagesApi = nextPagesApiPath(rel);
      if (pagesApi !== null) { add('ANY', pagesApi, 0); continue; }
    }

    // Nest: @Controller('users') + @Get(':id')
    const globalPrefix = text.match(/setGlobalPrefix\(\s*['"`]([^'"`]+)['"`]/);
    if (globalPrefix) nestGlobalPrefix = globalPrefix[1];
    if (/@Controller\s*\(/.test(text)) {
      const re = /@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*?path\s*:\s*['"`]([^'"`]*)['"`][^}]*\})?\s*\)|@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
      let controller = '';
      for (let m; (m = re.exec(text));) {
        if (m[3] === undefined) controller = m[1] || m[2] || '';
        else found.push({ method: m[3].toUpperCase(), path: joinRoute(controller, m[4]), file: rel, line: line(m.index), nest: true });
      }
      continue;
    }

    const looksLikeServer = SERVER_HINT.test(text) || /(^|\/)(routes?|routers?|controllers?|api|handlers?|endpoints?)(\/|\.|$)/i.test(rel) || /(^|\/)(app|server|index|main)\.(m|c)?(j|t)sx?$/i.test(rel);
    if (!looksLikeServer) continue;

    // Koa-router com prefixo no construtor: vale para o arquivo inteiro
    const filePrefix = (text.match(/new\s+[\w$]*Router\s*\(\s*\{[^}]*prefix\s*:\s*['"`]([^'"`]+)['"`]/) || [])[1] || '';

    // app.get('/x', …), router.post('/x', …)
    const call = new RegExp(`([A-Za-z_$][\\w$]*)\\s*\\.\\s*(${HTTP_METHODS})\\s*\\(\\s*(['"\`])(\\/[^'"\`]*|\\*)\\3`, 'g');
    for (let m; (m = call.exec(text));) {
      if (NOT_A_SERVER.test(m[1])) continue;
      add(m[2] === 'all' ? 'ALL' : m[2], joinRoute(filePrefix, m[4]), m.index);
    }

    // fastify.route({ method, url }) e server.route({ method, path }) (hapi)
    const routeObject = /\.route\s*\(\s*\{/g;
    for (let m; (m = routeObject.exec(text));) {
      const chunk = text.slice(m.index, m.index + 600);
      const urlMatch = chunk.match(/\b(?:url|path)\s*:\s*['"`]([^'"`]+)['"`]/);
      const methodMatch = chunk.match(/\bmethod\s*:\s*(\[[^\]]*\]|['"`]\w+['"`])/);
      if (!urlMatch || !methodMatch) continue;
      const methods = methodMatch[1].match(/\w+/g) || [];
      for (const method of methods) add(method, joinRoute(filePrefix, urlMatch[1]), m.index);
    }

    // Montagens: register(x, { prefix }), use('/p', router), route('/p', app)
    const mountPatterns = [
      [/\.register\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*\{[^}]*?prefix\s*:\s*['"`]([^'"`]*)['"`]/g, (m) => ({ ident: m[1], prefix: m[2] })],
      [/\.register\s*\(\s*(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)\s*,\s*\{[^}]*?prefix\s*:\s*['"`]([^'"`]*)['"`]/g, (m) => ({ spec: m[1], prefix: m[2] })],
      [/\.use\s*\(\s*['"`](\/[^'"`]*)['"`]\s*,([^;]*?)\)\s*(?:;|\n)/g, (m) => {
        const args = m[2].trim();
        const required = args.match(/require\(\s*['"]([^'"]+)['"]\s*\)\s*$/);
        if (required) return { spec: required[1], prefix: m[1] };
        const ident = args.match(/([A-Za-z_$][\w$]*)(?:\.routes\(\))?\s*$/);
        return ident ? { ident: ident[1], prefix: m[1] } : null;
      }],
      [/\.route\s*\(\s*['"`](\/[^'"`]*)['"`]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g, (m) => ({ ident: m[2], prefix: m[1] })],
    ];
    for (const [re, read] of mountPatterns) {
      for (let m; (m = re.exec(text));) {
        const mount = read(m);
        if (!mount) continue;
        const target = mount.spec ? resolveModule(root, rel, mount.spec) : importOf(root, rel, text, mount.ident);
        mounts.push({ prefix: mount.prefix, file: rel, line: line(m.index), target, ident: mount.ident || mount.spec });
      }
    }
  }

  // Aplica os prefixos: rotas de um arquivo montado ganham o prefixo de cada montagem
  const routes = [];
  for (const route of found) {
    if (route.nest) {
      routes.push({ method: route.method, path: joinRoute(nestGlobalPrefix, route.path), file: route.file, line: route.line });
      continue;
    }
    const here = mounts.filter((m) => m.target === route.file);
    if (!here.length) { routes.push({ method: route.method, path: route.path, file: route.file, line: route.line }); continue; }
    for (const mount of here) {
      routes.push({ method: route.method, path: joinRoute(mount.prefix, route.path), file: route.file, line: route.line, prefix_from: `${mount.file}:${mount.line}` });
    }
  }
  routes.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : a.method > b.method ? 1 : 0));
  // Candidatas a rota de login (o agente confere no código e marca `login` no bloco api)
  for (const r of routes) if (r.method === 'POST' && LOGIN_PATH.test(r.path)) r.login = true;

  const openapi = findOpenApi(root, files, deps);
  const routeFiles = [...new Set(routes.map((r) => r.file))];
  const mountFiles = [...new Set(mounts.filter((m) => m.target && routeFiles.includes(m.target)).map((m) => m.file))];
  return {
    frameworks,
    count: routes.length,
    routes: routes.slice(0, max),
    files: [...new Set([...routeFiles, ...mountFiles])].sort(),
    unresolved_mounts: mounts.filter((m) => !m.target).map(({ prefix, file, line, ident }) => ({ prefix, file, line, ident })),
    ...(openapi.files.length ? { openapi_files: openapi.files } : {}),
    ...(openapi.postman.length ? { postman_files: openapi.postman } : {}),
    ...(openapi.generators.length ? { openapi_generators: openapi.generators } : {}),
    ...(routes.length > max ? { truncated: true } : {}),
    ...(routes.some((r) => r.login) ? { login_hint: 'Routes with login: true look like the login route. If the code confirms it returns a token, add login: { token: <path of the token in the response> } to its api block: the "Try it" panel then keeps the token for the other routes.' } : {}),
    note: 'Found by pattern matching, without running the code. Prefixes mounted in another file are resolved one level deep; check unresolved_mounts and any path that looks incomplete. Routes built dynamically (loops, config files) are not listed.'
      + (openapi.files.length ? ' openapi_files: the API is already described in an OpenAPI spec; import_openapi turns it into route pages without reading the code.' : '')
      + (openapi.postman.length ? ' postman_files: Postman collections of this API; import_openapi turns them into route pages too.' : '')
      + (openapi.generators.length && !openapi.files.length ? ' openapi_generators: the server builds an OpenAPI spec at runtime; if it is running, import_openapi can read it from its JSON URL (ask the user for it).' : ''),
  };
}
