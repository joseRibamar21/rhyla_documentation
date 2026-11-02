import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOCS_DIR, loadConfig, updateConfig } from './config.js';
import { applyImport, importOpenApi, parseSpec } from './openapi.js';
import { importPostman, postmanKind } from './postman.js';

/*
 * Importar uma especificação para as páginas de rota: OpenAPI 3, Swagger 2 ou uma coleção do
 * Postman, detectada pelo conteúdo. Usado pelo `rhyla import`, pelo `rhyla init --import`, pelo
 * MCP (import_openapi) e pelo wizard.
 */

const TEMPLATE_CONFIG = path.join(path.dirname(fileURLToPath(import.meta.url)), '../templates/config.json');
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const FORMAT_NAMES = { openapi: 'OpenAPI 3', swagger: 'Swagger 2', postman: 'Postman' };

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** O formato de um documento já lido: openapi, swagger ou postman (null se nenhum). */
export function detectFormat(doc) {
  if (!isObject(doc)) return null;
  if (/^3\./.test(String(doc.openapi || ''))) return 'openapi';
  if (String(doc.swagger || '').startsWith('2')) return 'swagger';
  if (postmanKind(doc)) return 'postman';
  return null;
}

export const formatName = (format) => FORMAT_NAMES[format] || format;

/** Texto (JSON ou YAML) → documento; uma página HTML ganha uma mensagem que diz o que fazer. */
export function parseSource(text, label = 'The file') {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (/^<(!doctype|html|head|body)\b/i.test(trimmed)) {
    throw new Error(`${label} is an HTML page, not a spec. If it is the Swagger UI, use the address of its JSON (often /openapi.json, /swagger.json, /v3/api-docs or /docs/json).`);
  }
  return parseSpec(trimmed);
}

/** Lê um arquivo do projeto (relativo a cwd) ou uma URL http(s). */
export async function readSource(source, { cwd = process.cwd() } = {}) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { headers: { accept: 'application/json, application/yaml;q=0.9, */*;q=0.8' } });
    if (!res.ok) throw new Error(`${source} answered ${res.status}`);
    return parseSource(await res.text(), source);
  }
  const file = path.resolve(cwd, source);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`No file at ${source}`);
  if (fs.statSync(file).size > MAX_SOURCE_BYTES) throw new Error(`${source} is larger than 10 MB.`);
  return parseSource(fs.readFileSync(file, 'utf8'), source);
}

/** Documento → páginas (mesmo formato para os três tipos). */
export function importDocument(doc, { source } = {}) {
  const format = detectFormat(doc);
  // Coleção v1 e environment também caem no Postman, que explica o que exportar
  if (format === 'postman') return { format, ...importPostman(doc) };
  if (format === 'openapi' || format === 'swagger') return { format, ...importOpenApi(doc, { source }) };
  throw new Error('Not an OpenAPI 3, Swagger 2 or Postman collection (v2.0 / v2.1) file.');
}

/**
 * Grava as páginas de um documento em rhyla-docs/body. No config.json, o servidor vira
 * api.base_url (se ainda não houver um) e o título e a descrição do site vêm da especificação
 * enquanto forem os do template.
 * @param {{ cwd: string, doc: object, source?: string, update?: boolean, dryRun?: boolean }} opts
 */
export function importIntoProject({ cwd, doc, source, update = true, dryRun = false }) {
  const rhylaPath = path.join(cwd, DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  if (!fs.existsSync(bodyPath)) throw new Error(`Folder "${DOCS_DIR}" not found. Run "rhyla init" first.`);
  const imported = importDocument(doc, { source });
  const result = applyImport(bodyPath, imported, { update, dryRun });

  const config = loadConfig(rhylaPath);
  const template = JSON.parse(fs.readFileSync(TEMPLATE_CONFIG, 'utf8'));
  const unset = (key) => !config[key] || config[key] === template[key];
  const api = isObject(config.raw.api) ? config.raw.api : {};
  const patch = {};
  if (imported.info.baseUrl && !api.base_url) patch.api = { ...api, base_url: imported.info.baseUrl };
  if (imported.info.title && unset('title')) patch.title = imported.info.title;
  if (imported.info.summary && unset('description')) patch.description = imported.info.summary;
  if (!dryRun && Object.keys(patch).length) updateConfig(rhylaPath, patch);

  // Pastas e quantas páginas cada uma recebe, para as prévias
  const folders = new Map();
  for (const page of imported.pages) {
    const folder = page.file.split('/').slice(0, -1).join('/') || '.';
    folders.set(folder, (folders.get(folder) || 0) + 1);
  }
  return {
    format: imported.format,
    title: imported.info.title,
    summary: imported.info.summary,
    operations: imported.pages.length,
    folders: [...folders].map(([folder, count]) => ({ folder, count })),
    ...result,
    ...(patch.api ? { base_url: patch.api.base_url } : {}),
    ...(patch.title ? { site_title: patch.title } : {}),
    warnings: imported.warnings,
  };
}
