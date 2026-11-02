import fs from 'fs';
import path from 'path';
import { DOCS_DIR, normalizeBase } from './config.js';

/*
 * dist/rhyla.json: o que o `rhyla build` gerou (base path, versão, quando) e o estado das fontes
 * em rhyla-docs/ naquele momento. Com ele, o handler que serve o dist/ dentro da API
 * (rhyla/serve), o `rhyla dev` e o agente sabem se o dist/ ficou para trás.
 * Só usa fs e path: o rhyla/serve roda em produção sem as dependências do resto do Rhyla.
 */

export const MANIFEST = 'rhyla.json';
// Arquivos de rhyla-docs/ que não mudam o site
const NOT_SOURCES = new Set(['sync.json']);

// Arquivos de rhyla-docs/ com a data de modificação
function sourceFiles(rhylaPath) {
  const files = [];
  const walk = (dir, rel) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relPath);
      else if (!(rel === '' && NOT_SOURCES.has(entry.name))) files.push({ file: relPath, mtime: fs.statSync(path.join(dir, entry.name)).mtimeMs });
    }
  };
  walk(rhylaPath, '');
  return files;
}

/** Quantos arquivos e a modificação mais recente em rhyla-docs/. */
export function sourceSnapshot(rhylaPath) {
  const files = sourceFiles(rhylaPath);
  return { files: files.length, latest: files.reduce((max, f) => Math.max(max, f.mtime), 0) };
}

export function writeManifest(distPath, { base, version, rhylaPath, pages, operations }) {
  const manifest = {
    generator: 'rhyla',
    version,
    base: normalizeBase(base),
    built_at: new Date().toISOString(),
    pages,
    operations,
    sources: sourceSnapshot(rhylaPath),
  };
  fs.writeFileSync(path.join(distPath, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return manifest;
}

export function readManifest(distPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(distPath, MANIFEST), 'utf8'));
    return manifest && typeof manifest === 'object' ? manifest : null;
  } catch {
    return null;
  }
}

/** Base path de um dist/: do manifesto ou, num build antigo, da meta rhyla-base do index.html. */
export function distBase(distPath) {
  const manifest = readManifest(distPath);
  if (manifest && typeof manifest.base === 'string') return normalizeBase(manifest.base);
  try {
    const html = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    const m = html.match(/<meta\s+name=["']rhyla-base["']\s+content=["']([^"']*)["']/i);
    return m ? normalizeBase(m[1]) : null;
  } catch {
    return null;
  }
}

/**
 * O dist/ está em dia com rhyla-docs/ (e com esta versão do Rhyla, se `version` vier)?
 * @returns {{ built: boolean, base: string|null, builtAt: string|null, stale: boolean, changed: number, builtWith?: string }}
 *   changed: arquivos alterados depois do build (ou -1 quando só o número de arquivos mudou);
 *   builtWith: a versão do Rhyla do build, quando é outra
 */
export function distStatus(root, { distDir = 'dist', version } = {}) {
  const distPath = path.resolve(root, distDir);
  const manifest = readManifest(distPath);
  if (!manifest) {
    const built = fs.existsSync(path.join(distPath, 'index.html'));
    return { built, base: built ? distBase(distPath) : null, builtAt: null, stale: false, changed: 0 };
  }
  const rhylaPath = path.join(root, DOCS_DIR);
  const sources = manifest.sources || {};
  let changed = 0;
  let stale = false;
  if (fs.existsSync(rhylaPath)) {
    const files = sourceFiles(rhylaPath);
    changed = files.filter((f) => f.mtime > (sources.latest || 0)).length;
    stale = changed > 0 || files.length !== sources.files;
    if (stale && !changed) changed = -1;
  }
  const builtWith = version && manifest.version && manifest.version !== version ? manifest.version : undefined;
  return { built: true, base: normalizeBase(manifest.base), builtAt: manifest.built_at || null, stale, changed, ...(builtWith ? { builtWith } : {}) };
}

/**
 * Texto do aviso de dist/ desatualizado, com o comando que resolve. Com `configBase` igual ao
 * caminho servido, basta o `rhyla build`; sem ele (ou diferente), diz como acertar o base.
 */
export function staleMessage(status, base, version, configBase) {
  if (!status.stale && status.builtWith) {
    return `dist/ was built with Rhyla ${status.builtWith}${version ? ` and this is ${version}` : ''}: run "npx rhyla build" so the site gets the new scripts and styles.`;
  }
  const what = status.changed > 0 ? `${status.changed} file${status.changed > 1 ? 's' : ''} in ${DOCS_DIR}/ changed` : `pages were added or removed in ${DOCS_DIR}/`;
  const short = base ? base.replace(/\/$/, '') : '';
  const flag = short && (!configBase || normalizeBase(configBase) !== normalizeBase(base)) ? ` (with "base": "${short}" in ${DOCS_DIR}/config.json, or --base ${short})` : '';
  return `dist/ is out of date: ${what} after the last build. Run "npx rhyla build"${flag}.`;
}
