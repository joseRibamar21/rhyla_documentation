import fs from 'fs';
import path from 'path';
import { renderFile, readFrontmatter } from './content.js';

// Arquivos de body/ que nunca viram páginas de conteúdo
const SPECIAL = new Set([
  'notfound.md', 'notfound.html', 'notfound.htm',
  'search.md', 'search.html', '.search.md', '.search.html',
]);

const isPageFile = (name) => /\.(md|html)$/i.test(name);

/**
 * Ordena entradas pelo `order` do frontmatter (menor primeiro) e depois pelo nome.
 * Entradas sem `order` vão para o fim, em ordem alfabética.
 * @param {{ name: string, order?: number }[]} entries
 */
export function sortByOrder(entries) {
  const key = (e) => (typeof e.order === 'number' && Number.isFinite(e.order) ? e.order : Infinity);
  return entries.sort((a, b) => key(a) - key(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Percorre body/ e devolve a lista de páginas, já ordenada (raiz primeiro, depois pastas).
 * Não renderiza nada: use `loadPage` quando precisar do conteúdo.
 *
 * @param {string} bodyPath
 * @param {{ isIgnored?: (relPosix: string) => boolean }} options
 */
export function listPages(bodyPath, { isIgnored = () => false } = {}) {
  const pages = [];

  function walk(dirAbs, relDir) {
    const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    const files = [];
    const dirs = [];
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (isIgnored(rel)) continue;
      if (entry.isDirectory()) dirs.push(entry.name);
      else if (isPageFile(entry.name) && !SPECIAL.has(entry.name.toLowerCase())) {
        const file = path.join(dirAbs, entry.name);
        files.push({ name: entry.name, file, order: readFrontmatter(file).order });
      }
    }

    for (const { name, file } of sortByOrder(files)) {
      const ext = path.extname(name).toLowerCase();
      const base = path.basename(name, path.extname(name));
      const slug = relDir ? `${relDir}/${base}` : base;
      const isHome = !relDir && base.toLowerCase() === 'home';
      pages.push({
        file,
        ext,
        slug, // "guide/install" (sem extensão)
        group: relDir, // "guide" ou "" na raiz
        name: base,
        isHome,
        route: isHome ? '/' : `/${slug}`,
      });
    }
    for (const d of dirs.sort()) walk(path.join(dirAbs, d), relDir ? `${relDir}/${d}` : d);
  }

  if (fs.existsSync(bodyPath)) walk(bodyPath, '');
  // Home sempre primeiro
  return pages.sort((a, b) => Number(b.isHome) - Number(a.isHome));
}

/**
 * Renderiza uma página da lista (título, descrição, html e markdown limpo).
 */
export function loadPage(page, { md, allowRawHtml }) {
  return { ...page, ...renderFile(page.file, { md, allowRawHtml }) };
}

/**
 * Atalho: lista e renderiza todas as páginas.
 */
export function collectPages(bodyPath, { md, allowRawHtml, isIgnored }) {
  return listPages(bodyPath, { isIgnored }).map((p) => loadPage(p, { md, allowRawHtml }));
}

/**
 * Resolve um caminho de URL ("/guide/install", "/guide/install.html", "/") para um arquivo em body/.
 * Garante que o arquivo resolvido está dentro de body/ (sem path traversal).
 * @returns {{ file: string, slug: string, group: string|null, topic: string } | null}
 */
export function resolvePageFile(bodyPath, urlPath) {
  let p = urlPath;
  try { p = decodeURIComponent(p); } catch { return null; }
  p = p.replace(/^\/+|\/+$/g, '').replace(/\.html$/i, '');
  if (p === '' || p.toLowerCase() === 'home' || p.toLowerCase() === 'index') p = 'home';

  const root = path.resolve(bodyPath);
  for (const ext of ['.md', '.html']) {
    const file = path.resolve(root, p + ext);
    if (!file.startsWith(root + path.sep)) return null;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const parts = p.split('/');
      const topic = parts.pop();
      const group = parts.join('/') || null;
      return { file, slug: p, group, topic };
    }
  }
  return null;
}
