import fs from 'fs';
import path from 'path';
import { DOCS_DIR, loadConfig } from './config.js';
import { createIgnoreMatcher } from './ignore.js';
import { createMarkdown } from './content.js';
import { collectPages, resolvePageFile } from './pages.js';
import { buildFlowGraph } from './flows.js';
import { HTTP_METHODS, normalizeApi, toOpenApiPath } from './api.js';
import { findRoutes } from './routes.js';

/*
 * `rhyla check`: confere as docs com o código, sem IA. Rotas do código (find_routes) sem página,
 * páginas de rotas que não existem mais e blocos `api:` inválidos são erros; páginas de rota sem
 * bloco, rotas documentadas duas vezes, fluxos com passos quebrados e links internos para páginas
 * que não existem são avisos.
 */

// Igual ao build: o kit de desenvolvimento não é documentação
const DEFAULT_IGNORE = ['kit_dev_rhyla'];
// Arquivos que o site publica além das páginas
const SITE_FILES = /^\/(llms\.txt|llms-full\.txt|openapi\.json|search_index\.json|config\.json|sitemap\.xml|robots\.txt|404\.html|index\.md)$/i;
const ENDPOINT_FILE = new RegExp(`^(${HTTP_METHODS.join('|')})-`, 'i');
const ENDPOINT_HEADING = new RegExp(`^(${HTTP_METHODS.join('|')})\\s+(\\/\\S*)$`, 'i');

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// Forma do caminho para comparar código e docs: "/tasks/:id" e "/tasks/{taskId}" são o mesmo
const shape = (routePath) => toOpenApiPath(routePath).replace(/\{[^}]+\}/g, '{}').replace(/\/+$/, '') || '/';
// `longer` termina com `shorter` (que começa com "/"): o mesmo caminho com um prefixo a mais
const endsWith = (longer, shorter) => shorter !== '/' && longer.length > shorter.length && longer.endsWith(shorter);
// Catch-alls ("*", "/api/*") são middlewares ou o fallback de uma SPA, não endpoints
const isCatchAll = (routePath) => /(^|\/)\*(\/|$)/.test(routePath);
// ALL (app.all) e ANY (Next.js pages/api) aceitam qualquer método
const sameMethod = (code, doc) => code === 'ALL' || code === 'ANY' || code === doc;

/**
 * Padrões de `check.ignore` (config.json) e `--ignore`: "GET /health", "/internal/*", "* /admin/*".
 * @returns {(method: string, routePath: string) => boolean}
 */
export function createRouteMatcher(patterns) {
  const rules = patterns.filter((p) => typeof p === 'string' && p.trim()).map((p) => {
    const [first, second] = p.trim().split(/\s+/);
    const [method, routePath] = second === undefined ? ['*', first] : [first.toUpperCase(), second];
    const re = new RegExp(`^${shape(routePath).split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return { method, re };
  });
  return (method, routePath) => rules.some((r) => (r.method === '*' || r.method === method) && r.re.test(shape(routePath)));
}

function firstHeading(markdown) {
  const m = String(markdown || '').match(/^#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].replace(/`/g, '').trim() : '';
}

/**
 * @param {string} root raiz do projeto (com rhyla-docs/)
 * @param {{ ignore?: string[] }} opts padrões de rotas ignoradas, além dos de config.json → check.ignore
 */
export function checkDocs(root, { ignore = [] } = {}) {
  const rhylaPath = path.join(root, DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  if (!fs.existsSync(bodyPath)) throw new Error(`Folder "${DOCS_DIR}" not found. Run "rhyla init" first.`);

  const config = loadConfig(rhylaPath);
  const settings = isObject(config.raw.check) ? config.raw.check : {};
  const skipped = createRouteMatcher([...(Array.isArray(settings.ignore) ? settings.ignore : []), ...ignore]);
  const isIgnored = createIgnoreMatcher([...DEFAULT_IGNORE, ...config.buildIgnore]);
  const pages = collectPages(bodyPath, { md: createMarkdown({ allowRawHtml: config.allowRawHtml }), allowRawHtml: config.allowRawHtml, isIgnored });
  const fileOf = (page) => path.relative(root, page.file).split(path.sep).join('/');

  const errors = [];
  const warnings = [];
  const notes = [];

  // Endpoints documentados: bloco `api:` ou, no formato antigo, um H1 "MÉTODO /caminho"
  const endpoints = [];
  for (const page of pages) {
    const file = fileOf(page);
    if (page.data && page.data.api !== undefined) {
      const { api, warnings: problems } = normalizeApi(page.data.api);
      if (!api) {
        errors.push({ type: 'invalid_api', page: page.route, file, message: `${page.route}: invalid api block (${problems.join('; ')})` });
        continue;
      }
      for (const problem of problems) warnings.push({ type: 'api_block', page: page.route, file, message: `${page.route}: ${problem}` });
      endpoints.push({ method: api.method.toUpperCase(), path: api.path, page: page.route, file });
      continue;
    }
    if (page.markdown === null) continue;
    const heading = firstHeading(page.markdown).match(ENDPOINT_HEADING);
    if (heading) {
      endpoints.push({ method: heading[1].toUpperCase(), path: heading[2], page: page.route, file });
      warnings.push({ type: 'no_api_block', page: page.route, file, message: `${page.route}: ${heading[1].toUpperCase()} ${heading[2]} has no api block` });
    } else if (ENDPOINT_FILE.test(page.name)) {
      warnings.push({ type: 'no_api_block', page: page.route, file, message: `${page.route}: no api block and no "METHOD /path" heading, so it cannot be matched to a route` });
    }
  }
  const documented = endpoints.filter((e) => !skipped(e.method, e.path)).map((e) => ({ ...e, shape: shape(e.path) }));

  // Mesmo endpoint em mais de uma página
  const byKey = new Map();
  for (const e of documented) {
    const key = `${e.method} ${e.shape}`;
    byKey.set(key, [...(byKey.get(key) || []), e]);
  }
  for (const [key, list] of byKey) {
    if (list.length > 1) warnings.push({ type: 'duplicate', page: list[1].page, file: list[1].file, message: `${key} is documented in ${list.length} pages: ${list.map((e) => e.page).join(', ')}` });
  }

  // Código ⇄ docs
  const found = findRoutes(root, undefined, { max: Infinity });
  const catchAlls = found.routes.filter((r) => isCatchAll(r.path)).length;
  const routes = found.routes.filter((r) => !isCatchAll(r.path) && !skipped(r.method, r.path)).map((r) => ({ ...r, shape: shape(r.path) }));
  let byPrefix = 0;
  let covered = 0;
  if (!found.routes.length) {
    notes.push('No HTTP routes were found in the code (supported: Express, Fastify, Koa, Hono, Nest, Next.js), so routes were not compared with the pages.');
  } else {
    // Exato primeiro; depois ignorando um prefixo (montagens que o find_routes não resolve)
    const match = (r, e) => sameMethod(r.method, e.method) && r.shape === e.shape;
    const loose = (r, e) => sameMethod(r.method, e.method) && (endsWith(r.shape, e.shape) || endsWith(e.shape, r.shape));
    for (const r of routes) {
      if (documented.some((e) => match(r, e))) { covered++; continue; }
      if (documented.some((e) => loose(r, e))) { covered++; byPrefix++; continue; }
      errors.push({ type: 'undocumented', method: r.method, path: r.path, file: r.file, line: r.line, message: `${r.method} ${r.path} (${r.file}:${r.line}) has no page` });
    }
    for (const e of documented) {
      if (routes.some((r) => match(r, e) || loose(r, e))) continue;
      errors.push({ type: 'stale', page: e.page, file: e.file, message: `${e.page}: ${e.method} ${e.path} is not in the code` });
    }
    if (byPrefix) notes.push(`${byPrefix} route${byPrefix > 1 ? 's' : ''} matched a page only when ignoring a path prefix (a mount find_routes could not resolve, or a prefix in api.base_url).`);
    if (catchAlls) notes.push(`${catchAlls} catch-all route${catchAlls > 1 ? 's' : ''} (*) left out: middleware or fallbacks, not endpoints.`);
    if (found.unresolved_mounts.length) notes.push(`${found.unresolved_mounts.length} route prefix${found.unresolved_mounts.length > 1 ? 'es' : ''} mounted in another file could not be resolved; the paths of those routes may be incomplete.`);
  }

  // Fluxos com passos que apontam para páginas ou ids inexistentes
  for (const message of buildFlowGraph(pages).warnings) warnings.push({ type: 'flow', message });

  // Links internos ("/guia/instalar") e imagens ("/public/x.png") que não levam a nada
  const exists = (href) => {
    const target = href.replace(/[?#].*$/, '');
    if (target === '' || target === '/' || SITE_FILES.test(target)) return true;
    if (target.startsWith('/public/')) {
      try {
        return fs.existsSync(path.join(rhylaPath, decodeURIComponent(target)));
      } catch {
        return false;
      }
    }
    const resolved = resolvePageFile(bodyPath, target.replace(/\.md$/i, ''));
    return Boolean(resolved) && !isIgnored(path.relative(bodyPath, resolved.file).split(path.sep).join('/'));
  };
  for (const page of pages) {
    const seen = new Set();
    for (const [, href] of page.html.matchAll(/\s(?:href|src)="(\/(?!\/)[^"]*)"/g)) {
      const target = href.replace(/&amp;/g, '&');
      if (seen.has(target) || exists(target)) continue;
      seen.add(target);
      warnings.push({ type: 'broken_link', page: page.route, file: fileOf(page), message: `${page.route}: link to ${target}, which does not exist` });
    }
  }

  return {
    ok: !errors.length,
    routes: routes.length,
    documented: covered,
    endpoints: documented.length,
    pages: pages.length,
    frameworks: found.frameworks,
    errors,
    warnings,
    notes,
  };
}
