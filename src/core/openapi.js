import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { HTTP_METHODS, normalizeApi, statusText, toOpenApiPath } from './api.js';
import { readFrontmatter } from './content.js';
import { listPages } from './pages.js';

/*
 * OpenAPI ⇄ blocos `api:`.
 * Exportar: as páginas com bloco `api:` viram um openapi.json (3.0, o que Postman e os geradores
 * de cliente leem melhor). Importar: cada operação de uma especificação OpenAPI 3 ou Swagger 2
 * (JSON ou YAML) vira uma página com o bloco preenchido, sem IA.
 */

const OPENAPI_VERSION = '3.0.3';
// noRefs: esquemas repetidos são escritos por inteiro, sem âncoras YAML (&ref / *ref)
const YAML_OPTIONS = { noRefs: true, lineWidth: 120, skipInvalid: true };
// Até onde os $ref são expandidos (esquemas recursivos param aqui)
const MAX_REF_DEPTH = 8;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- Exportar ---------- */

// Esquema no formato do OpenAPI 3.0: `type: [x, "null"]` vira nullable, `const` vira enum
function toOas30(schema) {
  if (Array.isArray(schema)) return schema.map(toOas30);
  if (!isObject(schema)) return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && Array.isArray(value)) {
      const types = value.filter((t) => t !== 'null');
      if (types.length === 1) out.type = types[0];
      else if (types.length > 1) out.anyOf = types.map((type) => ({ type }));
      if (types.length !== value.length) out.nullable = true;
    } else if (key === 'const') {
      out.enum = [value];
    } else if (key === 'examples' && Array.isArray(value)) {
      if (value.length && schema.example === undefined) out.example = value[0];
    } else if (key === 'properties' && isObject(value)) {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, s]) => [name, toOas30(s)]));
    } else if (['items', 'additionalProperties', 'not', 'allOf', 'anyOf', 'oneOf'].includes(key)) {
      out[key] = toOas30(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const prettyTag = (group) => group.split('/').pop().replace(/[_-]+/g, ' ');

// "post-criar_tarefa-new" → "postCriarTarefa"
function operationIdFor(page, api) {
  const name = String(page.name || '')
    .replace(/-(new|dep|v\d+(\.\d+)*)$/i, '')
    .replace(new RegExp(`^(${HTTP_METHODS.join('|')})-`, 'i'), '');
  const words = fold(`${api.method} ${name}`).split(/[^a-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('');
}

function securityScheme(auth) {
  if (auth.type === 'bearer') return ['bearerAuth', { type: 'http', scheme: 'bearer' }];
  if (auth.type === 'basic') return ['basicAuth', { type: 'http', scheme: 'basic' }];
  return [`apiKey_${auth.name.replace(/[^\w.-]/g, '_')}`, { type: 'apiKey', in: auth.in, name: auth.name }];
}

function media(contentType, schema, example) {
  const content = {};
  if (schema) content.schema = toOas30(schema);
  if (example !== undefined) content.example = example;
  return { [contentType]: content };
}

/**
 * Monta a especificação OpenAPI a partir das páginas com bloco `api:`.
 * @param {Array<{ route: string, name: string, group: string, title: string, description: string, data: object }>} pages
 * @param {{ title?: string, description?: string, version?: string, baseUrl?: string|null, pageUrl?: (page) => string|null }} opts
 * @returns {{ spec: object, operations: number, warnings: string[], withoutApi: string[] }} withoutApi: páginas
 *   com nome de endpoint ("post-…") e sem bloco `api:`, que ficam de fora
 */
export function buildOpenApi(pages, opts = {}) {
  const warnings = [];
  const withoutApi = [];
  const paths = {};
  const tags = [];
  const schemes = {};
  const ids = new Set();
  let operations = 0;

  for (const page of pages) {
    if (!page.data || page.data.api === undefined) {
      if (new RegExp(`^(${HTTP_METHODS.join('|')})-`, 'i').test(page.name || '')) withoutApi.push(page.route);
      continue;
    }
    const { api, warnings: problems } = normalizeApi(page.data.api);
    for (const w of problems) warnings.push(`${page.route}: ${w}`);
    if (!api) continue;
    const item = paths[api.oasPath] || (paths[api.oasPath] = {});
    if (item[api.method]) {
      warnings.push(`${page.route}: ${api.method.toUpperCase()} ${api.oasPath} is already documented in ${item[api.method]['x-rhyla-page']}; left out`);
      continue;
    }

    const op = {};
    const opTags = api.tags.length ? api.tags : page.group ? [prettyTag(page.group)] : [];
    if (opTags.length) {
      op.tags = opTags;
      for (const tag of opTags) if (!tags.includes(tag)) tags.push(tag);
    }
    op.summary = api.summary || page.title;
    const description = api.description || page.description;
    if (description) op.description = description;
    let id = api.operationId || operationIdFor(page, api);
    if (ids.has(id)) {
      let n = 2;
      while (ids.has(`${id}${n}`)) n++;
      id = `${id}${n}`;
    }
    ids.add(id);
    op.operationId = id;

    if (api.parameters.length) {
      op.parameters = api.parameters.map((p) => ({
        name: p.name,
        in: p.in,
        ...(p.description ? { description: p.description } : {}),
        ...(p.required ? { required: true } : {}),
        schema: toOas30(p.schema),
      }));
    }
    if (api.body) {
      op.requestBody = {
        ...(api.body.description ? { description: api.body.description } : {}),
        required: api.body.required,
        content: media(api.body.contentType, api.body.schema, api.body.example),
      };
    }
    op.responses = {};
    for (const r of api.responses) {
      op.responses[r.status] = { description: r.description || statusText(r.status) || 'Response' };
      if (r.schema || r.example !== undefined) op.responses[r.status].content = media(r.contentType, r.schema, r.example);
    }
    if (!api.responses.length) op.responses.default = { description: 'Response' };
    if (api.auth && api.auth.type === 'none') op.security = [];
    else if (api.auth) {
      const [name, scheme] = securityScheme(api.auth);
      schemes[name] = scheme;
      op.security = [{ [name]: [] }];
    }
    if (api.deprecated || /-dep$/i.test(page.name || '')) op.deprecated = true;
    const url = opts.pageUrl ? opts.pageUrl(page) : null;
    if (url) op.externalDocs = { url };
    op['x-rhyla-page'] = page.route;

    item[api.method] = op;
    operations++;
  }

  const spec = {
    openapi: OPENAPI_VERSION,
    info: {
      title: opts.title || 'API',
      version: opts.version || '1.0.0',
      ...(opts.description ? { description: opts.description } : {}),
    },
  };
  if (opts.baseUrl) spec.servers = [{ url: opts.baseUrl }];
  if (tags.length) spec.tags = tags.map((name) => ({ name }));
  spec.paths = paths;
  if (Object.keys(schemes).length) spec.components = { securitySchemes: schemes };
  return { spec, operations, warnings, withoutApi };
}

/**
 * Título, descrição, versão e servidor da especificação: config.json (title, description,
 * api.version, api.base_url), com a versão do package.json do projeto como alternativa.
 * @param {ReturnType<import('./config.js').loadConfig>} config
 */
export function openApiInfo(config, projectRoot) {
  const api = isObject(config.raw.api) ? config.raw.api : {};
  let version = api.version !== undefined ? String(api.version) : undefined;
  if (!version) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      if (typeof pkg.version === 'string') version = pkg.version;
    } catch {
      // sem package.json: versão padrão
    }
  }
  return {
    title: config.title,
    description: config.description,
    version,
    baseUrl: typeof api.base_url === 'string' && api.base_url.trim() ? api.base_url.trim().replace(/\/+$/, '') : null,
  };
}

/* ---------- Importar ---------- */

/** Texto JSON ou YAML → objeto. */
export function parseSpec(source) {
  const trimmed = String(source).replace(/^\uFEFF/, '').trim();
  const doc = trimmed.startsWith('{') ? JSON.parse(trimmed) : matter.engines.yaml.parse(trimmed);
  if (!isObject(doc)) throw new Error('The file is not a JSON or YAML object');
  return doc;
}

/** Lê uma especificação de um arquivo (relativo a cwd) ou de uma URL http(s). */
export async function readSpec(source, { cwd = process.cwd() } = {}) {
  if (/^https?:\/\//i.test(source)) {
    const res = await fetch(source, { headers: { accept: 'application/json, application/yaml;q=0.9, */*;q=0.8' } });
    if (!res.ok) throw new Error(`${source} answered ${res.status}`);
    return parseSpec(await res.text());
  }
  const file = path.resolve(cwd, source);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`No file at ${source}`);
  return parseSpec(fs.readFileSync(file, 'utf8'));
}

// Expande os $ref locais ("#/components/schemas/User"); esquemas nomeados ganham o nome como título
function createResolver(doc, warnings) {
  const lookup = (ref) => ref.slice(2).split('/')
    .map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), doc);

  // `props`: node é um mapa de propriedades (todos os valores são esquemas, mesmo com nome "default")
  function deref(node, stack = [], props = false) {
    if (Array.isArray(node)) return node.map((n) => deref(n, stack));
    if (!isObject(node)) return node;
    if (typeof node.$ref === 'string') {
      const { $ref: ref, ...siblings } = node;
      const name = ref.split('/').pop();
      if (!ref.startsWith('#/')) {
        if (!warnings.includes(`external $ref not followed: ${ref}`)) warnings.push(`external $ref not followed: ${ref}`);
        return { title: name };
      }
      if (stack.includes(ref) || stack.length >= MAX_REF_DEPTH) return { type: 'object', title: name };
      const target = lookup(ref);
      if (target === undefined) {
        if (!warnings.includes(`unresolved $ref: ${ref}`)) warnings.push(`unresolved $ref: ${ref}`);
        return { title: name };
      }
      const resolved = deref(target, [...stack, ref]);
      if (!isObject(resolved)) return resolved;
      const named = /\/(schemas|definitions)\//.test(ref) && !resolved.title ? { title: name } : {};
      return { ...named, ...resolved, ...deref(siblings, stack) };
    }
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      // Exemplos e valores são dados, não esquemas: ficam como estão
      const data = !props && (key === 'example' || key === 'default' || key === 'enum' || (key === 'examples' && Array.isArray(value)));
      out[key] = data ? value : deref(value, stack, key === 'properties' && !props);
    }
    return out;
  }
  return deref;
}

const FIELD_SCHEMA_KEYS = new Set(['type', 'title', 'description', 'format', 'enum', 'default', 'example', 'nullable', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'items', 'properties', 'required']);
// Só fazem sentido para XML ou links externos: não impedem a forma de campos
const IGNORED_KEYS = ['xml', 'externalDocs'];
const FIELD_COPY = ['title', 'description', 'format', 'enum', 'default', 'example', 'nullable', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems'];

const SIMPLE_OBJECT_KEYS = ['type', 'properties', 'required', 'title', 'description'];
const isSimpleObject = (s) => isObject(s) && (s.type === undefined || s.type === 'object')
  && Object.keys(s).every((k) => SIMPLE_OBJECT_KEYS.includes(k) || IGNORED_KEYS.includes(k));

// allOf só de objetos simples (o "extends" mais comum) vira um objeto com as propriedades somadas
function flattenAllOf(schema) {
  if (!isObject(schema) || !Array.isArray(schema.allOf)) return schema;
  const { allOf, ...rest } = schema;
  const parts = allOf.map(flattenAllOf);
  if (!isSimpleObject(rest) || !parts.every(isSimpleObject)) return schema;
  const merged = { type: 'object', ...(rest.title ? { title: rest.title } : {}), ...(rest.description ? { description: rest.description } : {}), properties: {} };
  const required = [];
  for (const part of [...parts, rest]) {
    Object.assign(merged.properties, part.properties);
    for (const name of Array.isArray(part.required) ? part.required : []) if (!required.includes(name)) required.push(name);
  }
  if (required.length) merged.required = required;
  return merged;
}

// Esquema → campo do bloco (texto "integer" ou objeto); null se o formato de campos não o representa
function toField(raw, required) {
  const schema = flattenAllOf(raw);
  if (!isObject(schema) || Object.keys(schema).some((k) => !FIELD_SCHEMA_KEYS.has(k) && !IGNORED_KEYS.includes(k))) return null;
  if (schema.type !== undefined && typeof schema.type !== 'string') return null;
  const field = {};
  if (schema.type === 'array') {
    if (schema.items === undefined) field.type = 'array';
    else {
      const item = toField(schema.items, false);
      if (item === null) return null;
      if (typeof item === 'string') field.type = `${item}[]`;
      else if (Object.keys(item).every((k) => k === 'type' || k === 'fields') && item.fields) Object.assign(field, { type: 'array', fields: item.fields });
      else Object.assign(field, { type: 'array', items: item });
    }
  } else if (schema.properties !== undefined) {
    if ((schema.type !== undefined && schema.type !== 'object') || !isObject(schema.properties)) return null;
    const fields = toFields(schema);
    if (fields === null) return null;
    Object.assign(field, { type: 'object', fields });
  } else if (schema.required !== undefined) {
    return null;
  } else if (schema.type !== undefined) {
    field.type = schema.type;
  }
  for (const key of FIELD_COPY) if (schema[key] !== undefined) field[key] = schema[key];
  if (required) field.required = true;
  const keys = Object.keys(field);
  return keys.length === 1 && keys[0] === 'type' ? field.type : field;
}

function toFields(schema) {
  const required = Array.isArray(schema.required) ? schema.required : [];
  const fields = {};
  for (const [name, prop] of Object.entries(schema.properties || {})) {
    const field = toField(prop, required.includes(name));
    if (field === null) return null;
    fields[name] = field;
  }
  return fields;
}

// Corpo ou resposta: `fields` quando o esquema é um objeto simples, senão o `schema` inteiro
function schemaSpec(raw) {
  if (!isObject(raw) || !Object.keys(raw).length) return {};
  const schema = flattenAllOf(raw);
  const fields = isSimpleObject(schema) && isObject(schema.properties) && Object.keys(schema.properties).length ? toFields(schema) : null;
  return fields ? { fields } : { schema: raw };
}

const pickType = (types) => types.find((t) => t === 'application/json') || types.find((t) => /json/i.test(t)) || types[0];

function mediaExample(m) {
  if (!isObject(m)) return undefined;
  if (m.example !== undefined) return m.example;
  const first = isObject(m.examples) ? Object.values(m.examples)[0] : undefined;
  return isObject(first) && first.value !== undefined ? first.value : undefined;
}

// Parâmetro do Swagger 2 (type, format, items… no próprio parâmetro) → JSON Schema
function v2Schema(param) {
  if (param.type === 'file') return { type: 'string', format: 'binary' };
  const schema = {};
  for (const key of ['type', 'format', 'items', 'enum', 'default', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems']) {
    if (param[key] !== undefined) schema[key] = key === 'items' ? v2Schema(param.items) : param[key];
  }
  return schema;
}

function paramField(param, v2) {
  const content = isObject(param.content) ? Object.values(param.content)[0] : null;
  const schema = (v2 ? v2Schema(param) : param.schema || (content && content.schema)) || {};
  let field = toField(schema, false);
  if (field === null) field = { schema: { ...schema } };
  else if (typeof field === 'string') field = { type: field };
  if (param.description) field.description = param.description;
  if (param.in !== 'path' && param.required === true) field.required = true;
  if (param.example !== undefined) {
    if (field.schema) field.schema.example = param.example;
    else field.example = param.example;
  }
  const keys = Object.keys(field);
  return keys.length === 1 && keys[0] === 'type' ? field.type : field;
}

function authFor(op, doc, schemes) {
  const requirements = op.security !== undefined ? op.security : doc.security;
  if (!Array.isArray(requirements)) return undefined;
  const first = requirements.find((r) => isObject(r) && Object.keys(r).length);
  if (!first) return 'none';
  const scheme = schemes[Object.keys(first)[0]];
  if (!isObject(scheme)) return undefined;
  if (scheme.type === 'basic' || (scheme.type === 'http' && fold(scheme.scheme) === 'basic')) return 'basic';
  if (scheme.type === 'http' || scheme.type === 'oauth2' || scheme.type === 'openIdConnect') return 'bearer';
  if (scheme.type === 'apiKey') return { type: 'apiKey', in: scheme.in || 'header', name: scheme.name || 'X-API-Key' };
  return undefined;
}

export function slugify(s, max = 60) {
  return fold(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max).replace(/_+$/, '');
}
const snake = (id) => String(id).replace(/([a-z0-9])([A-Z])/g, '$1_$2');
export const humanize = (s) => {
  const t = snake(s).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function firstSentence(markdown) {
  const plain = String(markdown || '').replace(/[`*_#>[\]]/g, '').replace(/\(([^)]*)\)/g, '').replace(/\s+/g, ' ').trim();
  const m = plain.match(/^(.{10,200}?[.!?])(\s|$)/);
  return m ? m[1] : plain.length <= 200 ? plain : '';
}

function serverUrl(doc, v2, source) {
  let url = null;
  if (v2) {
    if (doc.host) url = `${(Array.isArray(doc.schemes) && doc.schemes[0]) || 'https'}://${doc.host}${doc.basePath || ''}`;
    else if (doc.basePath) url = doc.basePath;
  } else if (Array.isArray(doc.servers) && isObject(doc.servers[0]) && typeof doc.servers[0].url === 'string') {
    const vars = isObject(doc.servers[0].variables) ? doc.servers[0].variables : {};
    url = doc.servers[0].url.replace(/\{(\w+)\}/g, (m, name) => (isObject(vars[name]) && vars[name].default !== undefined ? vars[name].default : m));
  }
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    if (!/^https?:\/\//i.test(source || '')) return null;
    url = new URL(url, source).href;
  }
  return url.replace(/\/+$/, '');
}

/**
 * Converte uma especificação OpenAPI 3 ou Swagger 2 em páginas com bloco `api:`.
 * @param {object} doc especificação já lida (parseSpec/readSpec)
 * @param {{ source?: string }} opts source: de onde veio (resolve servidores relativos)
 * @returns {{ info: { title?: string, description?: string, summary?: string, version?: string, baseUrl: string|null }, pages: Array<{ method: string, path: string, file: string, data: object, body: string }>, warnings: string[] }}
 */
export function importOpenApi(doc, opts = {}) {
  const v2 = String(doc.swagger || '').startsWith('2');
  if (!v2 && !/^3\./.test(String(doc.openapi || ''))) {
    throw new Error('Not an OpenAPI 3 or Swagger 2 document (no "openapi: 3.x" or "swagger: 2.0" field)');
  }
  const warnings = [];
  const deref = createResolver(doc, warnings);
  const schemes = (v2 ? doc.securityDefinitions : doc.components && doc.components.securitySchemes) || {};
  const consumes = (op) => (Array.isArray(op.consumes) ? op.consumes : Array.isArray(doc.consumes) ? doc.consumes : []);
  const produces = (op) => (Array.isArray(op.produces) ? op.produces : Array.isArray(doc.produces) ? doc.produces : []);
  const order = new Map();
  const pages = [];

  for (const [routePath, rawItem] of Object.entries(isObject(doc.paths) ? doc.paths : {})) {
    const item = deref(rawItem);
    if (!isObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op)) continue;

      // Parâmetros do caminho e da operação (a operação vence)
      const params = new Map();
      for (const p of [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        if (isObject(p) && p.name && p.in) params.set(`${p.in}:${p.name}`, p);
      }
      const api = { method: method.toUpperCase(), path: routePath };
      if (op.operationId) api.operation_id = String(op.operationId);
      if (Array.isArray(op.tags) && op.tags.length) api.tags = op.tags.map(String);
      if (op.deprecated === true) api.deprecated = true;
      const auth = authFor(op, doc, schemes);
      if (auth !== undefined) api.auth = auth;
      for (const [key, location] of [['params', 'path'], ['query', 'query'], ['headers', 'header'], ['cookies', 'cookie']]) {
        const list = [...params.values()].filter((p) => p.in === location);
        if (list.length) api[key] = Object.fromEntries(list.map((p) => [p.name, paramField(p, v2)]));
      }

      // Corpo
      let body = null;
      if (v2) {
        const bodyParam = [...params.values()].find((p) => p.in === 'body');
        const form = [...params.values()].filter((p) => p.in === 'formData');
        const types = consumes(op);
        if (bodyParam) {
          body = { ...(pickType(types) && pickType(types) !== 'application/json' ? { content_type: pickType(types) } : {}) };
          if (bodyParam.required !== true) body.required = false;
          if (bodyParam.description) body.description = bodyParam.description;
          Object.assign(body, schemaSpec(bodyParam.schema));
        } else if (form.length) {
          const multipart = form.some((p) => p.type === 'file') || types.some((t) => /multipart/i.test(t));
          body = { content_type: multipart ? 'multipart/form-data' : 'application/x-www-form-urlencoded' };
          body.fields = Object.fromEntries(form.map((p) => {
            const field = paramField({ ...p, in: 'body' }, true);
            return [p.name, p.required === true ? { ...(typeof field === 'string' ? { type: field } : field), required: true } : field];
          }));
        }
      } else if (isObject(op.requestBody)) {
        const requestBody = deref(op.requestBody);
        const content = isObject(requestBody.content) ? requestBody.content : {};
        const type = pickType(Object.keys(content));
        body = {};
        if (type && type !== 'application/json') body.content_type = type;
        if (requestBody.required !== true) body.required = false;
        if (requestBody.description) body.description = requestBody.description;
        Object.assign(body, schemaSpec(type && content[type].schema));
        const example = mediaExample(type && content[type]);
        if (example !== undefined) body.example = example;
      }
      if (body) {
        if (!['fields', 'schema', 'example', 'content_type', 'description'].some((k) => body[k] !== undefined)) body.content_type = 'application/json';
        api.body = body;
      }

      // Respostas
      const responses = {};
      for (const [status, rawResponse] of Object.entries(isObject(op.responses) ? op.responses : {})) {
        const r = deref(rawResponse);
        if (!isObject(r)) continue;
        const spec = {};
        if (r.description) spec.description = String(r.description);
        if (v2) {
          const type = pickType(produces(op));
          if (type && type !== 'application/json' && (r.schema || r.examples)) spec.content_type = type;
          Object.assign(spec, schemaSpec(r.schema));
          const examples = isObject(r.examples) ? r.examples : {};
          const example = examples[type] !== undefined ? examples[type] : Object.values(examples)[0];
          if (example !== undefined) spec.example = example;
        } else {
          const content = isObject(r.content) ? r.content : {};
          const type = pickType(Object.keys(content));
          if (type && type !== 'application/json') spec.content_type = type;
          Object.assign(spec, schemaSpec(type && content[type].schema));
          const example = mediaExample(type && content[type]);
          if (example !== undefined) spec.example = example;
        }
        const keys = Object.keys(spec);
        responses[status] = !keys.length ? statusText(status) || null : keys.length === 1 && keys[0] === 'description' ? spec.description : spec;
      }
      if (Object.keys(responses).length) api.responses = responses;

      // Página: pasta pela primeira tag (ou primeiro trecho do caminho), nome pelo resumo ou operationId
      const segments = routePath.split('/').filter((s) => s && !/[{:*]/.test(s) && !/^(api|v\d+)$/i.test(s));
      const folder = slugify((api.tags && api.tags[0]) || segments[0] || '') || 'api';
      const summary = typeof op.summary === 'string' ? op.summary.trim() : '';
      const title = summary || (op.operationId ? humanize(op.operationId) : `${api.method} ${routePath}`);
      // operationId em camelCase ("getTask") dá nomes curtos; os gerados ("TasksController_findAll") não
      const cleanId = /^[a-z][a-zA-Z0-9]*$/.test(op.operationId || '') ? slugify(snake(op.operationId)) : '';
      let name = cleanId || (summary.length <= 60 && slugify(summary)) || (op.operationId && slugify(snake(op.operationId))) || slugify(segments.join('_')) || 'root';
      if (name.startsWith(`${method}_`) && name.length > method.length + 1) name = name.slice(method.length + 1);
      const file = `${folder}/${method}-${name}${api.deprecated ? '-dep' : ''}.md`;

      const description = typeof op.description === 'string' ? op.description.trim() : '';
      const short = firstSentence(description);
      order.set(folder, (order.get(folder) || 0) + 1);
      const data = { title, ...(short && short !== title ? { description: short } : {}), order: order.get(folder), api };
      pages.push({ method, path: routePath, file, data, body: `\n# ${title}\n${description ? `\n${description}\n` : ''}` });
    }
  }

  const info = isObject(doc.info) ? doc.info : {};
  return {
    info: {
      title: typeof info.title === 'string' ? info.title : undefined,
      description: typeof info.description === 'string' ? info.description : undefined,
      summary: firstSentence(info.description) || undefined,
      version: info.version !== undefined ? String(info.version) : undefined,
      baseUrl: serverUrl(doc, v2, opts.source),
    },
    pages,
    warnings,
  };
}

/** Página em Markdown com frontmatter YAML. */
export function stringifyPage(content, data) {
  return matter.stringify(content, data, YAML_OPTIONS);
}

/**
 * Escreve as páginas importadas em body/. Uma página que já documenta o mesmo método e caminho
 * só tem o bloco `api` atualizado (o texto e o resto do frontmatter ficam); as outras são criadas.
 * @param {string} bodyPath
 * @param {ReturnType<typeof importOpenApi>} imported
 * @param {{ update?: boolean, dryRun?: boolean }} opts
 */
export function applyImport(bodyPath, imported, { update = true, dryRun = false } = {}) {
  const existing = new Map();
  for (const page of listPages(bodyPath)) {
    if (page.ext !== '.md') continue;
    const data = readFrontmatter(page.file);
    if (data.api === undefined) continue;
    const { api } = normalizeApi(data.api);
    const key = api && `${api.method} ${api.oasPath}`;
    if (key && !existing.has(key)) existing.set(key, page);
  }

  const result = { created: [], updated: [], unchanged: [], skipped: [], not_in_spec: [] };
  const seen = new Set();
  const taken = new Set();
  for (const op of imported.pages) {
    const key = `${op.method} ${toOpenApiPath(op.path)}`;
    seen.add(key);
    const page = existing.get(key);
    if (page) {
      const parsed = matter(fs.readFileSync(page.file, 'utf8'));
      // `login` não existe no OpenAPI: a marcação que a página já tem fica (o Postman pode trazer uma)
      const { login: kept, ...current } = parsed.data.api;
      const { login: fresh, ...next } = op.data.api;
      const login = kept !== undefined ? kept : fresh;
      const api = login !== undefined ? { ...next, login } : next;
      if (JSON.stringify(current) === JSON.stringify(next) && (kept !== undefined || fresh === undefined)) result.unchanged.push(page.route);
      else if (!update) result.skipped.push(page.route);
      else {
        if (!dryRun) fs.writeFileSync(page.file, stringifyPage(parsed.content, { ...parsed.data, api }), 'utf8');
        result.updated.push(page.route);
      }
      continue;
    }
    let rel = op.file;
    for (let n = 2; taken.has(rel) || fs.existsSync(path.join(bodyPath, rel)); n++) rel = op.file.replace(/(-dep)?\.md$/, `_${n}$1.md`);
    taken.add(rel);
    if (!dryRun) {
      const file = path.join(bodyPath, rel);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, stringifyPage(op.body, op.data), 'utf8');
    }
    result.created.push('/' + rel.replace(/\.md$/, ''));
  }
  for (const [key, page] of existing) if (!seen.has(key)) result.not_in_spec.push(page.route);
  return result;
}
