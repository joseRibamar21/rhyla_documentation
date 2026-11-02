import fs from 'fs';
import path from 'path';
import { DOCS_DIR, loadConfig } from '../core/config.js';
import { createIgnoreMatcher } from '../core/ignore.js';
import { createMarkdown } from '../core/content.js';
import { collectPages } from '../core/pages.js';
import { buildOpenApi, openApiInfo } from '../core/openapi.js';
import { formatName, importIntoProject, readSource } from '../core/import.js';
import init, { blankHome } from './init.js';

// Igual ao build: o kit de desenvolvimento não é documentação
const DEFAULT_IGNORE = ['kit_dev_rhyla'];
const MAX_LISTED = 10;

function project(cwd) {
  const rhylaPath = path.join(cwd, DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  if (!fs.existsSync(bodyPath)) throw new Error(`Folder "${DOCS_DIR}" not found. Run "rhyla init" first.`);
  return { rhylaPath, bodyPath };
}

/** Especificação gerada das páginas com bloco `api:` (a mesma do build). */
export function exportSpec({ cwd = process.cwd() } = {}) {
  const { rhylaPath, bodyPath } = project(cwd);
  const config = loadConfig(rhylaPath);
  const pages = collectPages(bodyPath, {
    md: createMarkdown({ allowRawHtml: config.allowRawHtml }),
    allowRawHtml: config.allowRawHtml,
    isIgnored: createIgnoreMatcher([...DEFAULT_IGNORE, ...config.buildIgnore]),
  });
  return buildOpenApi(pages, openApiInfo(config, cwd));
}

/**
 * Importa uma especificação OpenAPI 3, Swagger 2 ou uma coleção do Postman para rhyla-docs/body
 * (CLI, MCP e wizard). O formato é detectado pelo conteúdo; veja src/core/import.js.
 * @param {{ cwd?: string, source: string, update?: boolean, dryRun?: boolean }} opts
 */
export async function importSpec({ cwd = process.cwd(), source, update = true, dryRun = false }) {
  project(cwd);
  const doc = await readSource(source, { cwd });
  return importIntoProject({ cwd, doc, source, update, dryRun });
}

const listed = (routes) => routes.slice(0, MAX_LISTED).join(', ') + (routes.length > MAX_LISTED ? `, +${routes.length - MAX_LISTED}` : '');

/** `rhyla import <source>` (e o nome antigo, `rhyla openapi import <source>`) */
export async function openapiImport(source, opts = {}) {
  const log = opts.quiet ? () => {} : console.log;
  const dryRun = Boolean(opts.dryRun);
  const result = await importSpec({ cwd: opts.cwd, source, update: opts.update !== false, dryRun });
  result.warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  log(`📥 ${result.operations} ${result.format === 'postman' ? 'requests' : 'operations'} in ${source} (${formatName(result.format)})${dryRun ? ' (dry run: nothing was written)' : ''}`);
  const lines = [
    ['created', result.created],
    ['api block updated (text kept)', result.updated],
    ['unchanged', result.unchanged],
    ['left untouched (--no-update)', result.skipped],
    ['documented but not in the spec', result.not_in_spec],
  ];
  for (const [label, routes] of lines) if (routes.length) log(`   ${routes.length} ${label}: ${listed(routes)}`);
  if (result.base_url) log(`   api.base_url${dryRun ? ' would be' : ''} set to ${result.base_url} in ${DOCS_DIR}/config.json`);
  if (result.site_title) log(`   Site title${dryRun ? ' would be' : ''} set to "${result.site_title}"`);
  return result;
}

/** `rhyla openapi export [-o file]` ("-" escreve no stdout) */
export function openapiExport(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const toStdout = opts.output === '-';
  // Com stdout, as mensagens vão para o stderr para o JSON sair limpo
  const log = opts.quiet ? () => {} : toStdout ? console.error : console.log;
  const { spec, operations, warnings, withoutApi } = exportSpec({ cwd });
  warnings.forEach((w) => console.warn(`⚠️  ${w}`));
  if (!operations) {
    throw new Error(`No page has an api block. Add one to the route pages (see ${DOCS_DIR}/AGENTS.md) or import a spec with "rhyla import <openapi.yaml | collection.json>".`);
  }
  const json = JSON.stringify(spec, null, 2) + '\n';
  let file = null;
  if (toStdout) process.stdout.write(json);
  else {
    file = path.resolve(cwd, opts.output || 'openapi.json');
    fs.writeFileSync(file, json, 'utf8');
    log(`✅ ${operations} operations → ${path.relative(cwd, file) || file}`);
  }
  if (withoutApi.length) log(`ℹ️  ${withoutApi.length} endpoint pages have no api block and were left out: ${listed(withoutApi)}`);
  return { spec, operations, warnings, withoutApi, file };
}

/**
 * `rhyla init --import <source>`: estrutura em branco, as páginas de rota da especificação e uma
 * home com o título e a descrição dela.
 */
export async function initWithImport(source, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  init({ ...opts, cwd, blank: true });
  const result = await openapiImport(source, { ...opts, cwd });
  const home = path.join(cwd, DOCS_DIR, 'body', 'home.md');
  if (result.title && fs.existsSync(home) && fs.readFileSync(home, 'utf8') === blankHome()) {
    fs.writeFileSync(home, blankHome(result.title, result.summary), 'utf8');
  }
  return result;
}
