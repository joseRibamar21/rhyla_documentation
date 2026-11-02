import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { DOCS_DIR, loadConfig, normalizeBase } from '../core/config.js';
import { distBase, distStatus, staleMessage } from '../core/dist.js';

/*
 * rhyla/serve: o site do `rhyla build` (dist/) dentro da sua API, como o Swagger UI em /docs.
 * Só lê arquivos: nada de editores, wizard ou proxy (esses são do `rhyla dev`), e nenhuma
 * dependência além do Node.
 *
 *   app.use('/docs', rhyla());                                        // Express, Connect, Nest
 *   await app.register(fastifyRhyla, { prefix: '/docs' });            // Fastify
 *   app.get('/docs/*', (c) => docs(c.req.raw));  // docs = rhylaFetch({ base: '/docs' })  (Hono, Next, Bun)
 *
 * O dist/ precisa ter sido gerado para o mesmo caminho: "base": "/docs" no config.json, ou
 * `rhyla build --base /docs`. Quando não foi (ou falta o build), /docs explica o que rodar.
 */

const { version: VERSION } = createRequire(import.meta.url)('../../package.json');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};
// Páginas e dados mudam a cada build: o navegador confere (ETag); o resto pode ficar em cache
const REVALIDATE = /\.(html|json|md|txt|xml)$/i;

/**
 * O núcleo: resolve um caminho dentro de dist/ e diz o que responder.
 * @param {{ dir?: string, cwd?: string, quiet?: boolean, log?: (msg: string) => void }} opts
 */
export function createDocs(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const distPath = path.resolve(cwd, opts.dir || 'dist');
  const warn = opts.quiet ? () => {} : opts.log || ((msg) => console.warn(`⚠️  Rhyla: ${msg}`));
  const warned = new Set();
  const warnOnce = (key, msg) => { if (!warned.has(key)) { warned.add(key); warn(msg); } };
  let checked = null;

  // Uma vez por caminho de montagem: o build existe e é para esse caminho? Está em dia?
  function problemFor(base) {
    if (checked && checked.base === base) return checked.problem;
    let problem = null;
    const short = base.replace(/\/$/, '') || '/';
    if (!fs.existsSync(path.join(distPath, 'index.html'))) {
      problem = `the docs are not built yet. Run "npx rhyla build${base !== '/' ? ` --base ${short}` : ''}" before starting the server.`;
    } else {
      const built = distBase(distPath);
      if (built && built !== base) {
        problem = `dist/ was built for "${built}", but it is served at "${base}". Set "base": "${short}" in ${DOCS_DIR}/config.json and run "npx rhyla build" (or "npx rhyla build --base ${short}").`;
      }
    }
    if (problem) warnOnce(`problem:${base}`, problem);
    else {
      const status = distStatus(cwd, { distDir: path.relative(cwd, distPath) || '.', version: VERSION });
      if (status.stale || status.builtWith) {
        const rhylaPath = path.join(cwd, DOCS_DIR);
        warnOnce('stale', staleMessage(status, base, VERSION, fs.existsSync(rhylaPath) ? loadConfig(rhylaPath).base : null));
      }
    }
    checked = { base, problem };
    return problem;
  }

  /**
   * @param {string} base caminho onde o site está montado ("/docs/")
   * @param {string} urlPath caminho pedido, relativo ao base ("/tarefas/get-x", "/styles/global.css")
   * @returns {{ status: number, file?: string, body?: string, type: string, problem?: boolean }}
   */
  function resolve(base, urlPath) {
    const mount = normalizeBase(base);
    const problem = problemFor(mount);
    if (problem) {
      const html = `<!doctype html><meta charset="utf-8"><title>Docs not available</title><body style="font:15px/1.6 system-ui,sans-serif;max-width:640px;margin:15vh auto;padding:0 20px"><h1 style="font-size:22px">The docs are not available here yet</h1><p>${escapeHtml(problem)}</p></body>`;
      return { status: 503, body: html, type: TYPES['.html'], problem: true };
    }
    let rel;
    try { rel = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]); } catch { rel = '/'; }
    rel = rel.replace(/\\/g, '/').replace(/^\/+/, '');
    const root = distPath + path.sep;
    const inside = (p) => p === distPath || p.startsWith(root);
    const candidates = rel === '' || rel.endsWith('/')
      ? [path.join(rel, 'index.html')]
      : [rel, `${rel}.html`, path.join(rel, 'index.html')];
    for (const candidate of candidates) {
      const file = path.resolve(distPath, candidate);
      if (!inside(file)) break;
      try {
        if (fs.statSync(file).isFile()) return { status: 200, file, type: typeOf(file) };
      } catch {}
    }
    const notFound = path.join(distPath, '404.html');
    return fs.existsSync(notFound)
      ? { status: 404, file: notFound, type: TYPES['.html'] }
      : { status: 404, body: 'Not found', type: TYPES['.txt'] };
  }

  return { distPath, resolve };
}

const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Cabeçalhos de cache de um arquivo (ETag fraco pelo tamanho e pela data)
function fileHeaders(file, type) {
  const stat = fs.statSync(file);
  return {
    stat,
    headers: {
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'Last-Modified': stat.mtime.toUTCString(),
      ETag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
      'Cache-Control': REVALIDATE.test(file) ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

// Caminho de montagem: o que o framework tirou da URL (Express: baseUrl; Connect: originalUrl − url)
function mountOf(req, fallback) {
  if (fallback) return fallback;
  if (typeof req.baseUrl === 'string') return req.baseUrl || '/';
  const original = String(req.originalUrl || req.url || '').split('?')[0];
  const current = String(req.url || '').split('?')[0];
  return original.endsWith(current) ? original.slice(0, original.length - current.length) || '/' : '/';
}

/** Responde com um resultado de resolve() num http.ServerResponse. */
function send(req, res, result) {
  const head = req.method === 'HEAD';
  if (result.body !== undefined) {
    const body = Buffer.from(result.body);
    res.writeHead(result.status, { 'Content-Type': result.type, 'Content-Length': String(body.length), 'Cache-Control': 'no-cache' });
    res.end(head ? undefined : body);
    return;
  }
  const { headers } = fileHeaders(result.file, result.type);
  if (result.status === 200 && req.headers['if-none-match'] === headers.ETag) {
    res.writeHead(304, { ETag: headers.ETag, 'Cache-Control': headers['Cache-Control'] });
    res.end();
    return;
  }
  res.writeHead(result.status, headers);
  if (head) { res.end(); return; }
  fs.createReadStream(result.file).on('error', () => res.destroy()).pipe(res);
}

/**
 * Middleware Node (Express, Connect, Nest com Express): `app.use('/docs', rhyla())`.
 * @param {{ dir?: string, cwd?: string, base?: string, quiet?: boolean }} opts
 *   dir: o dist/ (padrão "dist", relativo a cwd); base: só se o framework não informar onde montou
 */
export function rhyla(opts = {}) {
  const docs = createDocs(opts);
  return function rhylaDocs(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next ? next() : (res.writeHead(405, { Allow: 'GET, HEAD' }), res.end());
    const base = mountOf(req, opts.base);
    // /docs sem barra: as páginas usam caminhos absolutos, então serve a home direto
    send(req, res, docs.resolve(base, String(req.url || '/')));
  };
}

/**
 * Plugin do Fastify: `await app.register(fastifyRhyla, { prefix: '/docs' })`.
 * @param {import('fastify').FastifyInstance} fastify
 */
export function fastifyRhyla(fastify, opts, done) {
  const docs = createDocs(opts);
  const prefix = fastify.prefix || opts.prefix || opts.base || '/';
  const handler = (request, reply) => {
    const raw = request.raw;
    const url = String(raw.url || '/');
    const rel = url.startsWith(prefix) ? url.slice(prefix.length) || '/' : url;
    reply.hijack();
    send(raw, reply.raw, docs.resolve(prefix, rel));
  };
  fastify.get('/', handler);
  fastify.get('/*', handler);
  if (typeof done === 'function') done();
}

/**
 * Handler Request → Response (Hono, Next.js route handlers, Bun, Deno, workers com fs).
 * @param {{ base?: string, dir?: string, cwd?: string, quiet?: boolean }} opts base: padrão "/docs"
 * @returns {(request: Request) => Promise<Response>}
 */
export function rhylaFetch(opts = {}) {
  const docs = createDocs(opts);
  const base = normalizeBase(opts.base || '/docs');
  return async function rhylaDocs(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    const pathname = new URL(request.url).pathname;
    const mount = base.replace(/\/$/, '');
    const rel = pathname === mount ? '/' : pathname.startsWith(base) ? pathname.slice(mount.length) : pathname;
    const result = docs.resolve(base, rel);
    const head = request.method === 'HEAD';
    if (result.body !== undefined) return new Response(head ? null : result.body, { status: result.status, headers: { 'Content-Type': result.type, 'Cache-Control': 'no-cache' } });
    const { headers } = fileHeaders(result.file, result.type);
    if (result.status === 200 && request.headers.get('if-none-match') === headers.ETag) return new Response(null, { status: 304, headers: { ETag: headers.ETag } });
    return new Response(head ? null : await fs.promises.readFile(result.file), { status: result.status, headers });
  };
}

export default rhyla;
