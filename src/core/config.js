import fs from 'fs';
import path from 'path';

// Pasta de trabalho criada pelo `rhyla init` na raiz do projeto do usuário
export const DOCS_DIR = 'rhyla-docs';

/**
 * Normaliza um base path para o formato "/x/" (ou "/").
 * @param {string} base
 */
export function normalizeBase(base) {
  let b = typeof base === 'string' && base.trim() ? base.trim() : '/';
  if (!b.startsWith('/')) b = '/' + b;
  if (!b.endsWith('/')) b += '/';
  return b;
}

/**
 * Lê rhyla-docs/config.json e devolve uma configuração normalizada.
 * Erros de parse não derrubam o processo: são reportados e os defaults são usados.
 * @param {string} rhylaPath
 */
export function loadConfig(rhylaPath) {
  const file = path.join(rhylaPath, 'config.json');
  let raw = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch (e) {
      console.warn(`⚠️  Invalid ${DOCS_DIR}/config.json: ${e.message}. Using defaults.`);
    }
  }
  return {
    raw,
    file,
    title: typeof raw.title === 'string' ? raw.title : '',
    // Logo do site (ex.: "/public/logo.png"); sem ela, o header mostra a marca padrão
    logo: typeof raw.logo === 'string' && raw.logo.trim() ? raw.logo.trim() : null,
    description: typeof raw.description === 'string' ? raw.description : '',
    siteUrl: typeof raw.site_url === 'string' && raw.site_url.trim() ? raw.site_url.trim() : null,
    base: normalizeBase(raw.base),
    allowRawHtml: raw.allow_raw_html === true,
    buildIgnore: Array.isArray(raw.build_ignore) ? raw.build_ignore.filter((s) => typeof s === 'string') : [],
  };
}

/**
 * Altera campos do rhyla-docs/config.json, preservando os demais. `undefined` não mexe; `null` remove.
 * @throws {Error} se o arquivo existir e não for JSON válido
 */
export function updateConfig(rhylaPath, patch) {
  const file = path.join(rhylaPath, 'config.json');
  let raw = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    } catch {
      throw new Error(`${DOCS_DIR}/config.json is not valid JSON. Fix it, then try again.`);
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete raw[key];
    else raw[key] = value;
  }
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n', 'utf8');
  return raw;
}
