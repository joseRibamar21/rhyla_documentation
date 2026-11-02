/*
 * Painel "Testar" das páginas de rota: os dados do endpoint que o navegador usa para montar
 * a requisição (src/templates/scripts/try-runtime.js) e os servidores configurados.
 *
 * config.json:
 *   "api": {
 *     "base_url": "http://localhost:3000",
 *     "environments": { "Staging": "https://staging.example.com" },   // ou [{ "name", "url" }]
 *     "try_it": true          // no build: desligado por padrão (chama a API direto, ela precisa de CORS)
 *   }
 */
import { HTTP_METHODS, labelLanguage, normalizeApi, sampleFromSchema } from './api.js';

const METHODS = HTTP_METHODS.join('|');
// "post-criar_tarefa.md"; "path-" é o apelido antigo de PATCH que a sidebar aceita
const ENDPOINT_FILE = new RegExp(`^(${METHODS}|path)-`, 'i');
const ENDPOINT_HEADING = new RegExp(`^(${METHODS})\\s+(\\/\\S*)$`, 'i');
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1|[^.]+\.localhost)$/i;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** O host é a própria máquina (localhost, 127.x, ::1, *.localhost). */
export const isLoopback = (hostname) => LOOPBACK.test(String(hostname || ''));

function firstHeading(markdown) {
  const m = String(markdown || '').match(/^#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].replace(/`/g, '').trim() : '';
}

/**
 * O endpoint de uma página de rota: do bloco `api:`, de um H1 "MÉTODO /caminho" ou só do
 * método no nome do arquivo (o caminho fica para o leitor preencher).
 * @param {{ data?: object, markdown?: string|null, name?: string }} page
 * @returns {{ api: object, source: 'block'|'heading'|'file' } | null}
 */
export function routeEndpoint({ data = {}, markdown = null, name = '' }) {
  if (markdown === null) return null;
  if (data.api !== undefined) {
    const { api } = normalizeApi(data.api);
    if (api) return { api, source: 'block' };
  }
  const heading = firstHeading(markdown).match(ENDPOINT_HEADING);
  if (heading) {
    const { api } = normalizeApi({ method: heading[1], path: heading[2] });
    if (api) return { api, source: 'heading' };
  }
  const file = String(name).match(ENDPOINT_FILE);
  if (file) {
    const method = file[1].toLowerCase() === 'path' ? 'patch' : file[1].toLowerCase();
    return { api: { method, path: null, auth: null, login: null, parameters: [], body: null }, source: 'file' };
  }
  return null;
}

/**
 * Servidores e liga/desliga do painel, a partir do config.json cru.
 * @returns {{ servers: { name: string, url: string }[], dev: boolean, build: boolean }}
 */
export function trySettings(raw = {}) {
  const api = isObject(raw.api) ? raw.api : {};
  const servers = [];
  const add = (name, url) => {
    const clean = text(url) && url.trim().replace(/\/+$/, '');
    if (clean && /^https?:\/\//i.test(clean) && !servers.some((s) => s.url === clean)) servers.push({ name: text(name) || clean, url: clean });
  };
  add(null, api.base_url);
  if (isObject(api.environments)) for (const [name, url] of Object.entries(api.environments)) add(name, url);
  if (Array.isArray(api.environments)) for (const env of api.environments) if (isObject(env)) add(env.name, env.url);
  return { servers, dev: api.try_it !== false, build: api.try_it === true };
}

const stringValue = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v));

function bodyValue(body) {
  const example = body.example !== undefined ? body.example : body.schema ? sampleFromSchema(body.schema) : undefined;
  if (example === undefined || example === null) return /json/i.test(body.contentType) ? '{}' : '';
  return typeof example === 'string' ? example : JSON.stringify(example, null, 2);
}

/**
 * Os dados do painel para o navegador: método, caminho, autenticação, parâmetros e corpo já
 * com os valores de exemplo, e por onde a requisição sai (proxy do `rhyla dev` ou direto).
 */
export function tryData(endpoint, { page, language, servers = [], mode = 'proxy', proxy = '/__rhyla/try' } = {}) {
  const { api, source } = endpoint;
  const example = (p) => (p.schema && p.schema.example !== undefined ? p.schema.example : p.schema && p.schema.default !== undefined ? p.schema.default : undefined);
  return {
    v: 1,
    page,
    lang: labelLanguage(language),
    mode,
    ...(mode === 'proxy' ? { proxy } : {}),
    source,
    method: api.method.toUpperCase(),
    path: api.path,
    auth: api.auth || null,
    login: api.login || null,
    params: api.parameters.map((p) => ({
      name: p.name,
      in: p.in,
      required: Boolean(p.required),
      type: (p.schema && (Array.isArray(p.schema.type) ? p.schema.type.join(' | ') : p.schema.type)) || '',
      ...(p.description ? { description: p.description } : {}),
      ...(p.schema && Array.isArray(p.schema.enum) ? { enum: p.schema.enum.map(stringValue) } : {}),
      value: stringValue(example(p)),
    })),
    body: api.body ? { type: api.body.contentType, value: bodyValue(api.body) } : null,
    servers,
  };
}

// JSON dentro de <script>: sem "</script>" nem "<!--" quebrando o HTML
const scriptJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);

/** O HTML do painel, colocado no fim do conteúdo da página. */
export function tryPanelHtml(data) {
  return [
    '<link rel="stylesheet" href="/scripts/try-runtime.css">',
    `<script type="application/json" id="rh-try-data">${scriptJson(data)}</script>`,
    '<script src="/scripts/try-runtime.js"></script>',
  ].join('\n');
}
