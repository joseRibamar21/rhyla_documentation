import { HTTP_METHODS, fieldsSchema, pathParams } from './api.js';
import { firstSentence, slugify } from './openapi.js';

/*
 * Coleções do Postman (v2.0 e v2.1) → páginas de rota com o bloco `api:`, no mesmo formato do
 * importador de OpenAPI (importOpenApi), para usar a mesma gravação (applyImport).
 *
 * Pastas viram pastas da sidebar; {{baseUrl}} vira api.base_url; os exemplos de resposta salvos
 * viram as respostas, com os campos deduzidos do JSON; o script de teste que guarda o token
 * (pm.environment.set("token", …)) marca a rota de login.
 *
 * Segredos ficam de fora, porque as docs são publicadas: valores de Authorization, cookies, auth,
 * chaves, senhas e tokens não são copiados; só o tipo da autenticação entra no bloco.
 */

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const VARIABLE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const WHOLE_VARIABLE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
// Nomes de campo cujo valor é segredo (password, newPassword, access_token, apiKey, sessionId…)
const SECRET_KEY = /(pass(word|wd)?([-_]?confirm(ation)?)?|secret|token|api[-_]?key|apikey|access[-_]?key|private[-_]?key|credentials?|session([-_]?(id|token))?|cookie|signature|otp|jwt)$/i;
const JWT_VALUE = /^(Bearer\s+)?eyJ[\w-]+\.[\w-]+\.[\w-]*$/;
// Cabeçalhos que não entram no bloco (o corpo, a autenticação e o cliente cuidam deles)
const SKIP_HEADERS = /^(content-type|content-length|host|user-agent|accept-encoding|connection|postman-token|cache-control|cookie|authorization)$/i;
const API_KEY_HEADER = /^x-(api|auth|access)[-_]?(key|token)$|^(api[-_]?key|apikey)$/i;
const LOGIN_PATH = /\/(log-?in|sign-?in|sessions?|tokens?|authenticate|auth)\/?$/i;
const TOKEN_FIELD = /^(access_?token|accesstoken|id_?token|idtoken|auth_?token|authtoken|token|jwt)$/i;
const MAX_EXAMPLE = 20000;
const RAW_TYPES = { json: 'application/json', xml: 'application/xml', html: 'text/html', text: 'text/plain', javascript: 'application/javascript', graphql: 'application/json' };

const description = (v) => (typeof v === 'string' ? v.trim() : isObject(v) && typeof v.content === 'string' ? v.content.trim() : '');
const variableName = (v) => (typeof v === 'string' && (v.trim().match(WHOLE_VARIABLE) || [])[1]) || null;
const paramName = (name) => String(name).trim().replace(/[^\w]+/g, '_');

/** Que tipo de arquivo do Postman é este (ou null se não for do Postman). */
export function postmanKind(doc) {
  if (!isObject(doc)) return null;
  const schema = isObject(doc.info) ? String(doc.info.schema || '') : '';
  if (/getpostman\.com\/json\/collection\/v2/i.test(schema)) return 'collection';
  if (Array.isArray(doc.requests) && (Array.isArray(doc.order) || Array.isArray(doc.folders))) return 'collection-v1';
  if (/^(environment|globals)$/.test(String(doc._postman_variable_scope || '')) || (Array.isArray(doc.values) && typeof doc.name === 'string' && !doc.item)) return 'environment';
  if (isObject(doc.info) && Array.isArray(doc.item) && !doc.openapi && !doc.swagger) return 'collection';
  return null;
}

/* ---------- Valores e segredos ---------- */

function makeCleaner(warnings) {
  let masked = 0;
  // Um valor de exemplo sem segredos: {{email}} → <email>, JWT → <token>, password → <password>
  const value = (v, key) => {
    if (typeof v !== 'string') return v;
    const variable = variableName(v);
    if (key && SECRET_KEY.test(key)) {
      if (!variable && v !== '') masked++;
      return `<${variable || key}>`;
    }
    if (JWT_VALUE.test(v.trim())) { masked++; return '<token>'; }
    return v.replace(VARIABLE, (m, name) => `<${name.trim()}>`);
  };
  const example = (v, key) => {
    if (Array.isArray(v)) return v.map((item) => example(item, key));
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, example(item, k)]));
    return value(v, key);
  };
  return { value, example, done: () => { if (masked) warnings.push(`${masked} secret-looking value${masked > 1 ? 's were' : ' was'} left out of the examples (passwords, tokens, keys): the docs get published.`); } };
}

// JSON do Postman: aceita comentários e {{variáveis}} fora de aspas ("listId": {{listId}}), que
// voltam com o valor da variável da coleção (ou <listId>)
const UNQUOTED = '\u0000var:';
function parseLoose(raw, variables = new Map()) {
  const textValue = String(raw || '').trim();
  if (!textValue) return undefined;
  try { return JSON.parse(textValue); } catch {}
  const cleaned = textValue
    .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str || '')
    .replace(/("(?:[^"\\]|\\.)*")|\{\{\s*([^{}]+?)\s*\}\}/g, (m, str, name) => str || JSON.stringify(UNQUOTED + name));
  let value;
  try { value = JSON.parse(cleaned); } catch { return undefined; }
  const restore = (v) => {
    if (Array.isArray(v)) return v.map(restore);
    if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, restore(item)]));
    if (typeof v !== 'string' || !v.startsWith(UNQUOTED)) return v;
    const name = v.slice(UNQUOTED.length);
    const known = variables.get(name);
    if (known === undefined || known === '') return `<${name}>`;
    try { return JSON.parse(known); } catch { return known; }
  };
  return restore(value);
}
const looksJson = (raw) => /^\s*[[{]/.test(String(raw || ''));

/* ---------- Campos deduzidos de um exemplo ---------- */

function stringType(v) {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return 'date-time';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  if (/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(v)) return 'email';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return 'uuid';
  if (/^https?:\/\/\S+$/i.test(v)) return 'uri';
  return 'string';
}

function fieldOf(value, depth) {
  if (value === null || value === undefined) return { nullable: true };
  if (Array.isArray(value)) {
    const first = value.find((v) => v !== null && v !== undefined);
    if (first === undefined) return 'array';
    if (isObject(first)) {
      const fields = depth < 5 ? fieldsOf(first, depth + 1) : {};
      return Object.keys(fields).length ? { type: 'array', fields } : 'array';
    }
    const inner = fieldOf(first, depth + 1);
    return typeof inner === 'string' && !inner.endsWith('[]') ? `${inner}[]` : 'array';
  }
  if (isObject(value)) {
    const fields = depth < 5 ? fieldsOf(value, depth + 1) : {};
    return Object.keys(fields).length ? { type: 'object', fields } : 'object';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return stringType(String(value));
}

function fieldsOf(obj, depth = 0) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) fields[key] = fieldOf(value, depth);
  return fields;
}

// `fields` para um objeto; `schema` para uma lista de objetos; nada para o resto
function shapeOf(json) {
  if (isObject(json) && Object.keys(json).length) return { fields: fieldsOf(json) };
  const first = Array.isArray(json) ? json.find(isObject) : null;
  if (first && Object.keys(first).length) return { schema: { type: 'array', items: fieldsSchema(fieldsOf(first)) } };
  return {};
}

const scalarType = (v) => {
  const s = String(v ?? '');
  if (/^-?\d+$/.test(s)) return 'integer';
  if (/^-?\d+\.\d+$/.test(s)) return 'number';
  if (/^(true|false)$/.test(s)) return 'boolean';
  return 'string';
};
// "20" → 20 e "false" → false, conforme o tipo deduzido
const typed = (v, type) => (type === 'integer' || type === 'number' ? Number(v) : type === 'boolean' ? v === 'true' : v);
// Campo de um parâmetro (query, caminho, form): tipo do valor, descrição e exemplo sem segredos
function scalarField(name, value, desc, clean) {
  const usable = value !== '' && !variableName(value);
  const example = usable ? clean.value(value, name) : undefined;
  const type = usable && example === value ? scalarType(value) : 'string';
  return compact({ type, description: desc, example: example === undefined ? undefined : typed(example, type) });
}
// Campo compacto: só o tipo vira texto ("integer"); com descrição ou exemplo, objeto
function compact(field) {
  const keys = Object.keys(field).filter((k) => field[k] !== undefined && field[k] !== '');
  const out = Object.fromEntries(keys.map((k) => [k, field[k]]));
  return keys.length === 1 && keys[0] === 'type' ? out.type : out;
}

/* ---------- Autenticação ---------- */

// v2.1: [{ key, value }]; v2.0: { key: value }
function authEntries(spec) {
  if (Array.isArray(spec)) return new Map(spec.filter((e) => isObject(e) && e.key).map((e) => [String(e.key), e.value]));
  return new Map(isObject(spec) ? Object.entries(spec) : []);
}

/** O bloco `auth` de uma autenticação do Postman, e a variável que guarda o token (se houver). */
function authOf(auth, warnings) {
  if (!isObject(auth) || !auth.type) return null; // herda da pasta ou da coleção
  const type = String(auth.type).toLowerCase();
  if (type === 'inherit') return null;
  if (type === 'noauth') return { auth: 'none', tokenVar: null };
  const entries = authEntries(auth[type]);
  if (type === 'bearer') return { auth: 'bearer', tokenVar: variableName(entries.get('token')) };
  if (type === 'jwt' || type === 'oauth2') return { auth: 'bearer', tokenVar: variableName(entries.get('accessToken') || entries.get('token')) };
  if (type === 'basic') return { auth: 'basic', tokenVar: null };
  if (type === 'apikey') {
    const where = String(entries.get('in') || 'header').toLowerCase() === 'query' ? 'query' : 'header';
    const name = typeof entries.get('key') === 'string' && entries.get('key').trim() && !variableName(entries.get('key')) ? entries.get('key').trim() : 'X-API-Key';
    return { auth: { type: 'apiKey', in: where, name }, tokenVar: null };
  }
  warnings.add(`Postman auth "${type}" has no equivalent in the api block; the routes that use it have no auth.`);
  return { auth: undefined, tokenVar: null };
}

/* ---------- Login ---------- */

// pm.environment.set("token", pm.response.json().data.token) → { variable: 'token', path: 'data.token' }
function tokenFromScripts(events) {
  const code = (Array.isArray(events) ? events : [])
    .filter((e) => isObject(e) && e.listen === 'test' && isObject(e.script))
    .map((e) => (Array.isArray(e.script.exec) ? e.script.exec.join('\n') : String(e.script.exec || '')))
    .join('\n');
  if (!code) return [];
  const found = [];
  const setters = [
    /pm\.(?:environment|collectionVariables|globals|variables)\.set\(\s*["'`]([^"'`]+)["'`]\s*,\s*([^;\n]+?)\s*\)\s*;?\s*$/gm,
    /postman\.set(?:Environment|Global)Variable\(\s*["']([^"']+)["']\s*,\s*([^;\n]+?)\s*\)\s*;?\s*$/gm,
  ];
  for (const re of setters) {
    for (let m; (m = re.exec(code));) {
      const expr = m[2].trim();
      const access = expr.match(/(?:\.json\(\)|\)|\b[A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*|\[\s*(?:\d+|["'][^"']+["'])\s*\])+)$/);
      if (!access) continue;
      const tokenPath = access[1].replace(/\[\s*["']([^"']+)["']\s*\]/g, '.$1').replace(/\[\s*(\d+)\s*\]/g, '.$1').replace(/^\./, '');
      if (tokenPath) found.push({ variable: m[1], path: tokenPath });
    }
  }
  return found;
}

// Caminho de um token num exemplo de resposta: token, access_token, accessToken… (até 3 níveis)
function tokenPathIn(value, prefix = '', depth = 0) {
  if (!isObject(value) || depth > 3) return null;
  for (const [key, v] of Object.entries(value)) if (typeof v === 'string' && TOKEN_FIELD.test(key)) return prefix + key;
  for (const [key, v] of Object.entries(value)) {
    const inner = tokenPathIn(v, `${prefix}${key}.`, depth + 1);
    if (inner) return inner;
  }
  return null;
}

/* ---------- URL ---------- */

function rawUrl(url) {
  if (typeof url === 'string') return url;
  if (!isObject(url)) return '';
  if (typeof url.raw === 'string' && url.raw.trim()) return url.raw;
  const host = Array.isArray(url.host) ? url.host.join('.') : String(url.host || '');
  const port = url.port ? `:${url.port}` : '';
  const segments = Array.isArray(url.path) ? url.path.map((s) => (isObject(s) ? s.value || '' : String(s))) : url.path ? [String(url.path)] : [];
  const protocol = url.protocol ? `${url.protocol}://` : '';
  return `${protocol}${host}${port}${segments.length ? '/' + segments.join('/').replace(/^\/+/, '') : ''}`;
}

function splitUrl(url) {
  const raw = rawUrl(url).trim().split('#')[0];
  const at = raw.indexOf('?');
  const base = at >= 0 ? raw.slice(0, at) : raw;
  let query = isObject(url) && Array.isArray(url.query) ? url.query : [];
  if (!query.length && at >= 0) {
    query = raw.slice(at + 1).split('&').filter(Boolean).map((pair) => {
      const [key, ...rest] = pair.split('=');
      return { key: decodeSafe(key), value: decodeSafe(rest.join('=')) };
    });
  }
  let origin = null;
  let rest = base;
  let m;
  if ((m = base.match(/^(\{\{[^{}]+\}\})(.*)$/))) [, origin, rest] = m;
  else if ((m = base.match(/^(https?:\/\/[^/]+)(.*)$/i))) [, origin, rest] = m;
  else if ((m = base.match(/^((?:localhost|[\w-]+(?:\.[\w-]+)+)(?::\d+)?)(\/.*)?$/i))) { origin = `http://${m[1]}`; rest = m[2] || ''; }
  return { origin, rest, query, variables: isObject(url) && Array.isArray(url.variable) ? url.variable : [] };
}

function decodeSafe(s) {
  try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch { return String(s); }
}

/* ---------- Importar ---------- */

/**
 * Importa uma coleção do Postman (v2.0 / v2.1).
 * @returns {{ info: object, pages: Array<{ method, path, file, data, body }>, warnings: string[] }}
 */
export function importPostman(doc) {
  const kind = postmanKind(doc);
  if (kind === 'collection-v1') throw new Error('This is a Postman collection v1. In Postman, export it again as "Collection v2.1" (⋯ → Export).');
  if (kind === 'environment') throw new Error('This is a Postman environment (variables only), not a collection. In Postman, export the collection (⋯ → Export → Collection v2.1).');
  if (kind !== 'collection') throw new Error('Not a Postman collection (no "info" and "item")');

  const warnings = [];
  const notes = new Set();
  const clean = makeCleaner(warnings);
  const variables = new Map((Array.isArray(doc.variable) ? doc.variable : [])
    .filter((v) => isObject(v) && v.key && v.disabled !== true)
    .map((v) => [String(v.key), v.value === undefined || v.value === null ? '' : String(v.value)]));

  // Servidor: {{baseUrl}} resolvido pelas variáveis da coleção, ou a URL escrita na requisição
  const serverOf = (origin) => {
    if (!origin) return null;
    const name = variableName(origin);
    if (!name) return origin.replace(/\/+$/, '');
    const value = (variables.get(name) || '').trim();
    if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
    if (/^(localhost|[\w-]+(\.[\w-]+)+)(:\d+)?(\/|$)/i.test(value)) return `http://${value.replace(/\/+$/, '')}`;
    return { unresolved: name };
  };

  // Primeira passada: variáveis que guardam o token das rotas com bearer
  const bearerVars = new Set();
  const collectAuth = (auth) => {
    const a = authOf(auth, new Set());
    if (a && a.tokenVar) bearerVars.add(a.tokenVar);
  };
  collectAuth(doc.auth);
  (function walk(items) {
    for (const item of Array.isArray(items) ? items : []) {
      if (!isObject(item)) continue;
      collectAuth(item.auth);
      if (isObject(item.request)) {
        collectAuth(item.request.auth);
        for (const h of Array.isArray(item.request.header) ? item.request.header : []) {
          const m = isObject(h) && /^authorization$/i.test(String(h.key || '')) && String(h.value || '').match(/^Bearer\s+\{\{\s*([^{}]+?)\s*\}\}$/i);
          if (m) bearerVars.add(m[1]);
        }
      }
      if (Array.isArray(item.item)) walk(item.item);
    }
  })(doc.item);

  const pages = [];
  const byEndpoint = new Map();
  const order = new Map();
  const servers = new Map();
  const unresolved = new Set();
  let merged = 0;

  const visit = (items, folders, inherited) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!isObject(item)) continue;
      // Pasta: a autenticação dela vale para o que está dentro
      if (Array.isArray(item.item)) {
        const auth = authOf(item.auth, notes) || inherited;
        visit(item.item, [...folders, String(item.name || 'folder')], auth);
        continue;
      }
      const request = typeof item.request === 'string' ? { method: 'GET', url: item.request } : item.request;
      if (!isObject(request)) continue;
      const method = String(request.method || 'GET').toLowerCase();
      if (!HTTP_METHODS.includes(method)) {
        warnings.push(`"${item.name}": method ${request.method} has no equivalent in OpenAPI; left out.`);
        continue;
      }

      const { origin, rest, query, variables: urlVariables } = splitUrl(request.url);
      const server = serverOf(origin);
      if (server && typeof server === 'object') unresolved.add(server.unresolved);
      else if (server) servers.set(server, (servers.get(server) || 0) + 1);

      // Caminho: {{id}} num trecho inteiro é parâmetro (:id); no meio de um trecho, o valor da variável
      let routePath = String(rest || '/').replace(/\/{2,}/g, '/').split('/').map((segment) => {
        const whole = segment.match(WHOLE_VARIABLE);
        if (whole) return `:${paramName(whole[1])}`;
        return segment.replace(VARIABLE, (m, name) => {
          const v = variables.get(name.trim());
          return v && !/[/?#{}]/.test(v) ? v : `{${paramName(name)}}`;
        });
      }).join('/');
      if (!routePath.startsWith('/')) routePath = `/${routePath}`;
      if (routePath.length > 1) routePath = routePath.replace(/\/+$/, '');

      const api = { method: method.toUpperCase(), path: routePath };

      // Autenticação: a da requisição, senão a da pasta, senão a da coleção
      const ownAuth = authOf(request.auth !== undefined && request.auth !== null ? request.auth : item.auth, notes);
      let auth = ownAuth || inherited;
      const headerList = Array.isArray(request.header) ? request.header
        : typeof request.header === 'string' ? request.header.split('\n').map((line) => { const [key, ...v] = line.split(':'); return { key, value: v.join(':').trim() }; }) : [];
      const headers = {};
      let contentType = null;
      for (const h of headerList) {
        if (!isObject(h) || !h.key || h.disabled === true) continue;
        const name = String(h.key).trim();
        const value = h.value === undefined || h.value === null ? '' : String(h.value);
        if (/^authorization$/i.test(name)) {
          if (!ownAuth) auth = { auth: /^basic\s/i.test(value) ? 'basic' : 'bearer', tokenVar: null };
          continue;
        }
        if (/^content-type$/i.test(name)) { contentType = value.split(';')[0].trim() || null; continue; }
        if (SKIP_HEADERS.test(name)) continue;
        if (API_KEY_HEADER.test(name) || SECRET_KEY.test(name)) {
          if (!ownAuth && (!auth || auth.auth === undefined)) auth = { auth: { type: 'apiKey', in: 'header', name }, tokenVar: null };
          continue;
        }
        headers[name] = compact({ type: 'string', description: description(h.description), example: value && !variableName(value) ? clean.value(value, name) : undefined });
      }
      if (auth && auth.auth !== undefined) api.auth = auth.auth;

      // Parâmetros do caminho, com descrição e exemplo de url.variable
      const params = {};
      for (const name of pathParams(routePath)) {
        const v = urlVariables.find((x) => isObject(x) && paramName(x.key || '') === name) || {};
        const value = v.value !== undefined && v.value !== null && v.value !== '' ? String(v.value) : variables.get(name) || '';
        params[name] = scalarField(name, value, description(v.description), clean);
      }
      const queryFields = {};
      for (const q of query) {
        if (!isObject(q) || !q.key) continue;
        const name = String(q.key);
        const value = q.value === undefined || q.value === null ? '' : String(q.value);
        if (api.auth && typeof api.auth === 'object' && api.auth.in === 'query' && api.auth.name === name) continue;
        if (queryFields[name]) {
          // ?tag=a&tag=b
          const prev = typeof queryFields[name] === 'string' ? { type: queryFields[name] } : queryFields[name];
          queryFields[name] = compact({ ...prev, type: `${String(prev.type || 'string').replace(/\[\]$/, '')}[]`, example: undefined });
          continue;
        }
        queryFields[name] = scalarField(name, value, description(q.description), clean);
      }

      const body = bodyOf(request.body, contentType, clean, warnings, item.name, variables);
      const responses = {};
      let tokenInExample = null;
      for (const r of Array.isArray(item.response) ? item.response : []) {
        if (!isObject(r)) continue;
        const code = Number(r.code);
        if (!Number.isInteger(code) || code < 100 || code > 599 || responses[code] !== undefined) continue;
        const type = headerValue(r.header, 'content-type');
        const label = String(r.name || '').trim();
        const desc = label && label !== item.name ? label : String(r.status || '').trim() || undefined;
        const raw = typeof r.body === 'string' ? r.body : '';
        const json = raw && raw.length <= MAX_EXAMPLE && (/json/i.test(type || '') || looksJson(raw)) ? parseLoose(raw, variables) : undefined;
        if (json !== undefined && !tokenInExample) tokenInExample = tokenPathIn(json);
        if (json !== undefined) {
          responses[code] = { ...(desc ? { description: desc } : {}), ...shapeOf(json), example: clean.example(json) };
        } else if (raw && raw.length <= MAX_EXAMPLE) {
          responses[code] = { ...(desc ? { description: desc } : {}), content_type: (type || 'text/plain').split(';')[0], example: clean.value(raw) };
        } else {
          responses[code] = desc || null;
        }
      }

      // Rota de login: o script de teste guarda o token que as rotas com bearer usam
      const scripts = tokenFromScripts(item.event);
      const setter = scripts.find((s) => bearerVars.has(s.variable)) || scripts.find((s) => /token|jwt|access/i.test(s.variable));
      if (setter) api.login = { token: setter.path };
      else if (method === 'post' && LOGIN_PATH.test(routePath) && tokenInExample) api.login = { token: tokenInExample };

      if (Object.keys(params).length) api.params = params;
      if (Object.keys(queryFields).length) api.query = queryFields;
      if (Object.keys(headers).length) api.headers = headers;
      if (body) api.body = body;
      if (Object.keys(responses).length) api.responses = responses;

      // O mesmo endpoint em várias requisições (variações): fica a primeira, com as respostas e a query das outras
      const key = `${api.method} ${routePath.replace(/:[\w]+|\{[^}]+\}/g, '{}')}`;
      const first = byEndpoint.get(key);
      if (first) {
        merged++;
        for (const part of ['responses', 'query']) {
          if (!api[part]) continue;
          first[part] = first[part] || {};
          for (const [k, v] of Object.entries(api[part])) if (!(k in first[part])) first[part][k] = v;
        }
        if (api.login && !first.login) first.login = api.login;
        continue;
      }
      byEndpoint.set(key, api);

      // Página: pasta pelas pastas do Postman (ou o primeiro trecho do caminho), nome pelo nome da requisição
      const segments = routePath.split('/').filter((s) => s && !/[{:*]/.test(s) && !/^(api|v\d+)$/i.test(s));
      const folder = folders.length ? folders.map((f) => slugify(f) || 'folder').join('/') : slugify(segments[0] || '') || 'api';
      const title = String(item.name || `${api.method} ${routePath}`).trim();
      const withoutMethod = title.replace(new RegExp(`^${method}\\b[\\s:_-]*`, 'i'), '');
      const name = slugify(withoutMethod) || slugify(segments.join('_')) || 'root';
      const text = description(item.description) || description(request.description);
      const short = firstSentence(text);
      order.set(folder, (order.get(folder) || 0) + 1);
      const data = { title, ...(short && short !== title ? { description: short } : {}), order: order.get(folder), api };
      pages.push({ method, path: routePath, file: `${folder}/${method}-${name}.md`, data, body: `\n# ${title}\n${text ? `\n${text}\n` : ''}` });
    }
  };
  visit(doc.item, [], authOf(doc.auth, notes));

  if (merged) warnings.push(`${merged} request${merged > 1 ? 's repeat' : ' repeats'} an endpoint already imported (variations of the same route); their responses and query parameters were merged into the first one.`);
  for (const name of unresolved) {
    warnings.push(`The server is the Postman variable {{${name}}}, which is not defined in the collection (it is probably in an environment): set "api": { "base_url": "…" } in rhyla-docs/config.json.`);
  }
  warnings.push(...notes);
  clean.done();

  const info = isObject(doc.info) ? doc.info : {};
  const about = description(info.description);
  const version = typeof info.version === 'string' ? info.version
    : isObject(info.version) ? [info.version.major, info.version.minor, info.version.patch].filter((n) => n !== undefined).join('.') : undefined;
  const baseUrl = [...servers].sort((a, b) => b[1] - a[1])[0];
  return {
    info: {
      title: typeof info.name === 'string' ? info.name : undefined,
      description: about || undefined,
      summary: firstSentence(about) || undefined,
      version: version || undefined,
      baseUrl: baseUrl ? baseUrl[0] : null,
    },
    pages,
    warnings,
  };
}

function headerValue(headers, name) {
  const list = Array.isArray(headers) ? headers : [];
  const h = list.find((x) => isObject(x) && String(x.key || '').toLowerCase() === name);
  return h && h.value ? String(h.value) : null;
}

// Corpo da requisição: raw (JSON, XML, texto), urlencoded, form-data, GraphQL ou arquivo
function bodyOf(body, contentType, clean, warnings, itemName, variables) {
  if (!isObject(body) || body.disabled === true || !body.mode) return null;
  const mode = String(body.mode);
  if (mode === 'raw') {
    const raw = String(body.raw || '');
    if (!raw.trim()) return null;
    const language = isObject(body.options) && isObject(body.options.raw) ? String(body.options.raw.language || '') : '';
    const type = contentType || RAW_TYPES[language] || (looksJson(raw) ? 'application/json' : 'text/plain');
    if (/json/i.test(type)) {
      const json = raw.length <= MAX_EXAMPLE ? parseLoose(raw, variables) : undefined;
      if (json === undefined) {
        warnings.push(`"${itemName}": the JSON body could not be read; left out.`);
        return null;
      }
      return { ...(type !== 'application/json' ? { content_type: type } : {}), ...shapeOf(json), example: clean.example(json) };
    }
    return { content_type: type, example: raw.length <= MAX_EXAMPLE ? clean.value(raw) : undefined, ...(raw.length > MAX_EXAMPLE ? { schema: { type: 'string' } } : {}) };
  }
  if (mode === 'urlencoded' || mode === 'formdata') {
    const entries = (Array.isArray(body[mode]) ? body[mode] : []).filter((e) => isObject(e) && e.key && e.disabled !== true);
    if (!entries.length) return null;
    const fields = {};
    const example = {};
    for (const e of entries) {
      const file = e.type === 'file';
      const value = e.value === undefined || e.value === null ? '' : String(e.value);
      fields[e.key] = compact({ type: file ? 'binary' : 'string', description: description(e.description) });
      example[e.key] = file ? '<file>' : clean.value(value, e.key);
    }
    return { content_type: mode === 'urlencoded' ? 'application/x-www-form-urlencoded' : 'multipart/form-data', fields, example };
  }
  if (mode === 'graphql' && isObject(body.graphql)) {
    const graphqlVars = parseLoose(body.graphql.variables, variables);
    return {
      fields: { query: { type: 'string', required: true }, variables: 'object' },
      example: { query: String(body.graphql.query || ''), ...(graphqlVars !== undefined ? { variables: clean.example(graphqlVars) } : {}) },
    };
  }
  if (mode === 'file') return { content_type: contentType || 'application/octet-stream', schema: { type: 'string', format: 'binary' } };
  return null;
}
