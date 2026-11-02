/*
 * Bloco `api:` das páginas de rota: o formato padrão de um endpoint no frontmatter.
 * A partir dele o Rhyla gera a referência da página (parâmetros, corpo, respostas e exemplos
 * de requisição) e o openapi.json. Sem APIs do Node, para poder ir ao navegador depois.
 *
 * api:
 *   method: POST
 *   path: /tasks/:id                # ":id" ou "{id}"
 *   auth: bearer                    # bearer | basic | none | { type: apiKey, in: header, name: X-API-Key }
 *   params:  { id: integer }        # path; mapa nome → tipo ou { type, description, required, example… }, ou lista
 *   query:   { limit: { type: integer, default: 20 } }
 *   headers: { X-Request-Id: string }
 *   body:
 *     content_type: application/json            # padrão
 *     fields: { title: { type: string, required: true }, done: boolean }   # ou schema: (JSON Schema)
 *     example: { title: Comprar pão }
 *   responses:
 *     201: { description: Created, fields: { id: integer }, example: { id: 1 } }
 *     400: Validation error
 */

export const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
const PARAM_SECTIONS = [['params', 'path'], ['query', 'query'], ['headers', 'header'], ['cookies', 'cookie']];
// Chaves de um campo copiadas para o JSON Schema
const FIELD_KEYS = ['title', 'description', 'format', 'enum', 'default', 'example', 'nullable', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems'];
const BODY_KEYS = ['content_type', 'required', 'description', 'schema', 'fields', 'example'];
const RESPONSE_KEYS = ['description', 'content_type', 'schema', 'fields', 'example'];

const JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'null']);
const TYPE_ALIASES = {
  int: { type: 'integer' },
  int32: { type: 'integer', format: 'int32' },
  int64: { type: 'integer', format: 'int64' },
  long: { type: 'integer', format: 'int64' },
  float: { type: 'number', format: 'float' },
  double: { type: 'number', format: 'double' },
  decimal: { type: 'number' },
  bool: { type: 'boolean' },
  str: { type: 'string' },
  text: { type: 'string' },
  date: { type: 'string', format: 'date' },
  'date-time': { type: 'string', format: 'date-time' },
  datetime: { type: 'string', format: 'date-time' },
  email: { type: 'string', format: 'email' },
  uuid: { type: 'string', format: 'uuid' },
  uri: { type: 'string', format: 'uri' },
  url: { type: 'string', format: 'uri' },
  binary: { type: 'string', format: 'binary' },
  file: { type: 'string', format: 'binary' },
  password: { type: 'string', format: 'password' },
  any: {},
};

// Parâmetro no caminho: ":id", ":id(\\d+)", ":id?", "{id}" ou "*slug"
const PATH_PARAM = /:([A-Za-z_]\w*)(?:\([^)]*\))?\??|\{([^}]+)\}|\*([A-Za-z_]\w*)/g;

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Nomes dos parâmetros de um caminho, na ordem em que aparecem. */
export function pathParams(routePath) {
  return [...String(routePath).matchAll(PATH_PARAM)].map((m) => m[1] || m[2] || m[3]);
}

/** "/tasks/:id" → "/tasks/{id}" (formato do OpenAPI). */
export function toOpenApiPath(routePath) {
  return String(routePath).replace(PATH_PARAM, (m, a, b, c) => `{${a || b || c}}`);
}

// "string[]" → array de string; "int" → integer; "User" → qualquer valor com esse título
function typeSchema(type) {
  const t = String(type).trim();
  if (t.endsWith('[]')) return { type: 'array', items: typeSchema(t.slice(0, -2)) };
  const key = t.toLowerCase();
  if (JSON_TYPES.has(key)) return { type: key };
  if (TYPE_ALIASES[key]) return { ...TYPE_ALIASES[key] };
  return { title: t };
}

// Campos: mapa { nome: tipo | { … } } ou lista [{ name, … }]
function fieldEntries(fields) {
  if (Array.isArray(fields)) {
    return fields.filter((f) => isObject(f) && text(f.name)).map((f) => [f.name.trim(), f]);
  }
  return isObject(fields) ? Object.entries(fields) : [];
}

/** Um campo (tipo em texto ou objeto) em JSON Schema. */
export function fieldSchema(spec) {
  if (typeof spec === 'string') return typeSchema(spec);
  if (!isObject(spec)) return {};
  if (isObject(spec.schema)) {
    const description = text(spec.description);
    return description && !spec.schema.description ? { ...spec.schema, description } : { ...spec.schema };
  }
  const schema = spec.type !== undefined ? typeSchema(spec.type) : {};
  for (const key of FIELD_KEYS) if (spec[key] !== undefined) schema[key] = spec[key];
  if (spec.fields !== undefined) {
    // "fields" num array descreve os itens; em qualquer outro tipo, as propriedades do objeto
    if (schema.type === 'array') schema.items = fieldsSchema(spec.fields);
    else Object.assign(schema, fieldsSchema(spec.fields));
  }
  if (spec.items !== undefined) schema.items = fieldSchema(spec.items);
  return schema;
}

/** Campos em um JSON Schema de objeto (com `required`). */
export function fieldsSchema(fields) {
  const properties = {};
  const required = [];
  for (const [name, spec] of fieldEntries(fields)) {
    properties[name] = fieldSchema(spec);
    if (isObject(spec) && spec.required === true) required.push(name);
  }
  return required.length ? { type: 'object', properties, required } : { type: 'object', properties };
}

function normalizeParams(fields, location) {
  return fieldEntries(fields).map(([name, spec]) => {
    const { description, ...schema } = fieldSchema(spec);
    const required = location === 'path' ? true : isObject(spec) && spec.required === true;
    return { name, in: location, required, ...(description ? { description } : {}), schema };
  });
}

function schemaOf(spec) {
  if (isObject(spec.schema)) return spec.schema;
  if (spec.fields !== undefined) return fieldsSchema(spec.fields);
  return null;
}

function normalizeBody(raw, warnings) {
  if (raw === undefined || raw === null || raw === false) return null;
  if (!isObject(raw) || !BODY_KEYS.some((k) => raw[k] !== undefined)) {
    warnings.push('body needs fields, schema or example');
    return null;
  }
  return {
    contentType: text(raw.content_type) || 'application/json',
    required: raw.required !== false,
    description: text(raw.description),
    schema: schemaOf(raw),
    example: raw.example,
  };
}

function normalizeResponses(raw, warnings) {
  if (raw === undefined || raw === null) return [];
  if (!isObject(raw)) {
    warnings.push('responses must map status codes to a description or { description, fields, example }');
    return [];
  }
  const out = [];
  for (const [status, spec] of Object.entries(raw)) {
    if (!/^([1-5]\d\d|[1-5]XX|default)$/i.test(status)) {
      warnings.push(`unknown response status "${status}"`);
      continue;
    }
    if (spec === null || spec === undefined || typeof spec === 'string') {
      out.push({ status, description: text(spec), contentType: 'application/json', schema: null });
      continue;
    }
    if (!isObject(spec) || !RESPONSE_KEYS.some((k) => spec[k] !== undefined)) {
      warnings.push(`response ${status} needs description, fields, schema or example`);
      continue;
    }
    out.push({
      status,
      description: text(spec.description),
      contentType: text(spec.content_type) || 'application/json',
      schema: schemaOf(spec),
      example: spec.example,
    });
  }
  const rank = (s) => (s === 'default' ? 999 : parseInt(s, 10));
  return out.sort((a, b) => rank(a.status) - rank(b.status));
}

function normalizeAuth(raw, warnings) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (raw === false) return { type: 'none' };
  const spec = typeof raw === 'string' ? { type: raw } : raw;
  const type = isObject(spec) ? String(spec.type || '').toLowerCase() : '';
  if (type === 'none') return { type: 'none' };
  if (type === 'bearer' || type === 'jwt' || type === 'oauth2') return { type: 'bearer' };
  if (type === 'basic') return { type: 'basic' };
  if (type === 'apikey' || type === 'api_key') {
    const where = ['header', 'query', 'cookie'].includes(spec.in) ? spec.in : 'header';
    return { type: 'apiKey', in: where, name: text(spec.name) || 'X-API-Key' };
  }
  warnings.push(`unknown auth "${typeof raw === 'string' ? raw : JSON.stringify(raw)}" (use bearer, basic, none or { type: apiKey, in, name })`);
  return null;
}

/**
 * Valida e normaliza o bloco `api:` de uma página.
 * @returns {{ api: object|null, warnings: string[] }} api null quando falta method ou path
 */
export function normalizeApi(raw) {
  const warnings = [];
  if (!isObject(raw)) return { api: null, warnings: ['api must be an object with method and path'] };
  const method = String(raw.method || '').trim().toLowerCase();
  const routePath = String(raw.path || '').trim();
  if (!HTTP_METHODS.includes(method)) warnings.push(raw.method ? `unknown method "${raw.method}"` : 'api needs a method');
  if (!routePath.startsWith('/')) warnings.push(routePath ? `path must start with "/" (${routePath})` : 'api needs a path');
  if (warnings.length) return { api: null, warnings };

  const parameters = PARAM_SECTIONS.flatMap(([key, location]) => normalizeParams(raw[key], location));
  const inPath = pathParams(routePath);
  for (const name of inPath) {
    if (!parameters.some((p) => p.in === 'path' && p.name === name)) {
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' } });
    }
  }
  for (const p of parameters) {
    if (p.in === 'path' && !inPath.includes(p.name)) warnings.push(`params.${p.name} is not in the path ${routePath}`);
  }
  // Ordem: caminho (na ordem do path), query, header, cookie
  const where = ['path', 'query', 'header', 'cookie'];
  parameters.sort((a, b) => where.indexOf(a.in) - where.indexOf(b.in)
    || (a.in === 'path' ? inPath.indexOf(a.name) - inPath.indexOf(b.name) : 0));

  return {
    api: {
      method,
      path: routePath,
      oasPath: toOpenApiPath(routePath),
      summary: text(raw.summary),
      description: text(raw.description),
      operationId: text(raw.operation_id),
      tags: (Array.isArray(raw.tags) ? raw.tags : raw.tags ? [raw.tags] : []).map(String).filter(Boolean),
      deprecated: raw.deprecated === true,
      auth: normalizeAuth(raw.auth, warnings),
      parameters,
      body: normalizeBody(raw.body, warnings),
      responses: normalizeResponses(raw.responses, warnings),
    },
    warnings,
  };
}

/* ---------- Exemplo a partir do esquema ---------- */

const FORMAT_SAMPLES = {
  'date-time': '2026-01-01T12:00:00Z',
  date: '2026-01-01',
  time: '12:00:00',
  email: 'user@example.com',
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  password: '********',
  byte: 'aGVsbG8=',
  binary: '<file>',
};

/** Um valor de exemplo para o esquema (usa example, default e enum quando existem). */
export function sampleFromSchema(schema, depth = 0) {
  if (!isObject(schema) || depth > 6) return null;
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const variants = schema.oneOf || schema.anyOf;
  if (Array.isArray(variants) && variants.length) return sampleFromSchema(variants[0], depth + 1);
  if (Array.isArray(schema.allOf)) {
    return schema.allOf.reduce((acc, part) => {
      const value = sampleFromSchema(part, depth + 1);
      return isObject(acc) && isObject(value) ? { ...acc, ...value } : value ?? acc;
    }, null);
  }
  const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null')
    : schema.type || (schema.properties ? 'object' : schema.items ? 'array' : undefined);
  switch (type) {
    case 'object': {
      const out = {};
      for (const [key, value] of Object.entries(schema.properties || {})) out[key] = sampleFromSchema(value, depth + 1);
      return out;
    }
    case 'array': return schema.items ? [sampleFromSchema(schema.items, depth + 1)] : [];
    case 'integer':
    case 'number': return typeof schema.minimum === 'number' ? schema.minimum : 1;
    case 'boolean': return true;
    case 'string': return FORMAT_SAMPLES[schema.format] || 'string';
    default: return null;
  }
}

/* ---------- Referência da página (Markdown) ---------- */

const LABELS = {
  en: {
    parameters: 'Parameters', name: 'Name', in: 'In', type: 'Type', required: 'Required', description: 'Description',
    field: 'Field', body: 'Request body', responses: 'Responses', example: 'Example', examples: 'Examples',
    yes: 'yes', no: 'no', auth: 'Authentication', deprecated: 'Deprecated: avoid using this endpoint.',
    default: 'Default', oneOf: 'One of', min: 'min', max: 'max', pattern: 'pattern',
    bearer: 'Bearer token (`Authorization: Bearer <token>`)', basic: 'HTTP Basic (`Authorization: Basic <credentials>`)',
    apiKey: (where, name) => `API key in the ${where} \`${name}\``, none: 'None',
  },
  pt: {
    parameters: 'Parâmetros', name: 'Nome', in: 'Onde', type: 'Tipo', required: 'Obrigatório', description: 'Descrição',
    field: 'Campo', body: 'Corpo da requisição', responses: 'Respostas', example: 'Exemplo', examples: 'Exemplos',
    yes: 'sim', no: 'não', auth: 'Autenticação', deprecated: 'Obsoleto: evite usar este endpoint.',
    default: 'Padrão', oneOf: 'Um de', min: 'mín.', max: 'máx.', pattern: 'padrão',
    bearer: 'Token Bearer (`Authorization: Bearer <token>`)', basic: 'HTTP Basic (`Authorization: Basic <credenciais>`)',
    apiKey: (where, name) => `Chave de API no ${where} \`${name}\``, none: 'Nenhuma',
  },
  es: {
    parameters: 'Parámetros', name: 'Nombre', in: 'Dónde', type: 'Tipo', required: 'Obligatorio', description: 'Descripción',
    field: 'Campo', body: 'Cuerpo de la solicitud', responses: 'Respuestas', example: 'Ejemplo', examples: 'Ejemplos',
    yes: 'sí', no: 'no', auth: 'Autenticación', deprecated: 'Obsoleto: evite usar este endpoint.',
    default: 'Por defecto', oneOf: 'Uno de', min: 'mín.', max: 'máx.', pattern: 'patrón',
    bearer: 'Token Bearer (`Authorization: Bearer <token>`)', basic: 'HTTP Basic (`Authorization: Basic <credenciales>`)',
    apiKey: (where, name) => `Clave de API en el ${where} \`${name}\``, none: 'Ninguna',
  },
};

const STATUS_TEXT = {
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 409: 'Conflict',
  410: 'Gone', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests',
  500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout',
};
export const statusText = (status) => STATUS_TEXT[status] || '';

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Idioma das preferências ("Português (Brasil)") → código dos rótulos gerados. */
export function labelLanguage(language) {
  const v = fold(language).trim();
  if (/^(portug|pt\b)/.test(v)) return 'pt';
  if (/^(espan|spanish|es\b)/.test(v)) return 'es';
  return 'en';
}

/** Opções da referência a partir do config.json cru (idioma e exemplos das preferências, api.base_url). */
export function apiRenderOptions(raw = {}) {
  const prefs = isObject(raw.preferences) ? raw.preferences : {};
  const api = isObject(raw.api) ? raw.api : {};
  return {
    lang: labelLanguage(prefs.language),
    examples: Array.isArray(prefs.examples) ? prefs.examples : ['curl'],
    baseUrl: text(api.base_url) ? api.base_url.trim().replace(/\/+$/, '') : null,
  };
}

const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const code = (v) => '`' + String(v).replace(/`/g, "'") + '`';
const inlineJson = (v) => code(typeof v === 'string' ? v : JSON.stringify(v));

function typeLabel(schema) {
  if (!isObject(schema)) return '';
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').pop();
  const variants = schema.oneOf || schema.anyOf;
  if (Array.isArray(variants)) return variants.map(typeLabel).filter(Boolean).join(' | ');
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const main = types.filter((t) => t !== 'null');
  let label;
  if (main[0] === 'array') label = `${typeLabel(schema.items) || 'any'}[]`;
  else if (main.length) label = main.join(' | ') + (schema.format ? ` (${schema.format})` : '');
  else label = schema.properties || schema.allOf ? schema.title || 'object' : schema.title || 'any';
  return schema.nullable || types.includes('null') ? `${label} | null` : label;
}

function describe(schema, L) {
  const parts = [];
  const description = text(schema.description);
  if (description) parts.push(/[.!?:)]$/.test(description) ? description : `${description}.`);
  if (Array.isArray(schema.enum) && schema.enum.length) parts.push(`${L.oneOf}: ${schema.enum.map(inlineJson).join(', ')}.`);
  if (schema.default !== undefined) parts.push(`${L.default}: ${inlineJson(schema.default)}.`);
  const limits = [];
  for (const [min, max] of [['minimum', 'maximum'], ['minLength', 'maxLength'], ['minItems', 'maxItems']]) {
    if (schema[min] !== undefined) limits.push(`${L.min} ${schema[min]}`);
    if (schema[max] !== undefined) limits.push(`${L.max} ${schema[max]}`);
  }
  if (schema.pattern) limits.push(`${L.pattern} ${code(schema.pattern)}`);
  if (limits.length) parts.push(`(${limits.join(', ')})`);
  return parts.join(' ');
}

// Objeto com propriedades (juntando allOf), ou null
function objectOf(schema) {
  if (!isObject(schema)) return null;
  if (Array.isArray(schema.allOf)) {
    const merged = { properties: {}, required: [] };
    for (const part of schema.allOf.map(objectOf).filter(Boolean)) {
      Object.assign(merged.properties, part.properties);
      merged.required.push(...(part.required || []));
    }
    return Object.keys(merged.properties).length ? merged : null;
  }
  return isObject(schema.properties) && Object.keys(schema.properties).length ? schema : null;
}

// Linhas da tabela de campos: objetos aninhados viram "a.b", itens de array "a[].b"
function fieldRows(schema, L, prefix = '', depth = 0, rows = []) {
  const items = isObject(schema) && schema.type === 'array' ? schema.items : null;
  const object = objectOf(items || schema);
  if (!object || depth > 4 || rows.length >= 100) return rows;
  const base = items ? `${prefix}[]` : prefix;
  const required = Array.isArray(object.required) ? object.required : [];
  for (const [name, prop] of Object.entries(object.properties)) {
    const full = base ? `${base}.${name}` : name;
    rows.push(`| ${code(full)} | ${cell(typeLabel(prop))} | ${required.includes(name) ? L.yes : L.no} | ${cell(describe(prop, L))} |`);
    fieldRows(prop, L, full, depth + 1, rows);
  }
  return rows;
}

// Alguma propriedade (em qualquer nível) tem descrição?
function hasDescriptions(schema, depth = 0) {
  const object = objectOf(isObject(schema) && schema.type === 'array' ? schema.items : schema);
  if (!object || depth > 4) return false;
  return Object.values(object.properties).some((prop) => text(prop && prop.description) || hasDescriptions(prop, depth + 1));
}

function fieldsTable(schema, L) {
  const rows = fieldRows(schema, L);
  if (!rows.length) return null;
  return [`| ${L.field} | ${L.type} | ${L.required} | ${L.description} |`, '|---|---|---|---|', ...rows].join('\n');
}

const jsonBlock = (value) => '```json\n' + (typeof value === 'string' ? value : JSON.stringify(value, null, 2)) + '\n```';
const exampleOf = (part) => (part.example !== undefined ? part.example : part.schema ? sampleFromSchema(part.schema) : undefined);

function authLabel(auth, L) {
  if (auth.type === 'none') return L.none;
  if (auth.type === 'apiKey') return L.apiKey(auth.in, auth.name);
  return L[auth.type];
}

/**
 * Referência do endpoint em Markdown: linha do endpoint, autenticação, parâmetros, corpo,
 * respostas e exemplos de requisição.
 * @param {object} api resultado de normalizeApi
 * @param {{ lang?: string, examples?: string[], baseUrl?: string|null, endpoint?: boolean }} opts
 */
export function apiReference(api, opts = {}) {
  const L = LABELS[opts.lang] || LABELS.en;
  const out = [];
  if (opts.endpoint !== false) out.push(code(`${api.method.toUpperCase()} ${api.path}`));
  if (api.deprecated) out.push(`> **${L.deprecated}**`);
  if (api.auth) out.push(`**${L.auth}:** ${authLabel(api.auth, L)}`);

  if (api.parameters.length) {
    const rows = api.parameters.map((p) => `| ${code(p.name)} | ${p.in} | ${cell(typeLabel(p.schema))} | ${p.required ? L.yes : L.no} | ${cell(describe({ ...p.schema, description: p.description }, L))} |`);
    out.push(`## ${L.parameters}`, [`| ${L.name} | ${L.in} | ${L.type} | ${L.required} | ${L.description} |`, '|---|---|---|---|---|', ...rows].join('\n'));
  }

  if (api.body) {
    out.push(`## ${L.body}`);
    out.push(code(api.body.contentType) + (api.body.description ? ` · ${api.body.description}` : ''));
    const table = api.body.schema && fieldsTable(api.body.schema, L);
    if (table) out.push(table);
    const example = exampleOf(api.body);
    if (example !== undefined && example !== null) out.push(jsonBlock(example));
  }

  if (api.responses.length) {
    out.push(`## ${L.responses}`);
    for (const r of api.responses) {
      const reason = statusText(r.status);
      out.push(`### ${r.status}${reason ? ` ${reason}` : ''}`);
      if (r.description && fold(r.description) !== fold(reason)) out.push(r.description);
      // Tabela só quando há algo a explicar além do exemplo
      const table = r.schema && hasDescriptions(r.schema) && fieldsTable(r.schema, L);
      if (table) out.push(table);
      const example = exampleOf(r);
      if (example !== undefined && example !== null) out.push(jsonBlock(example));
    }
  }

  const snippets = requestExamples(api, opts);
  if (snippets.length) out.push(`## ${snippets.length > 1 ? L.examples : L.example}`, ...snippets);
  return out.join('\n\n');
}

/* ---------- Exemplos de requisição (curl, fetch, requests) ---------- */

// Variáveis que o leitor preenche; cada linguagem escreve do seu jeito ($X, ${X}, {X})
const VAR = (name) => `\u0000${name}\u0000`;
const VAR_RE = /\u0000(\w+)\u0000/g;
const HAS_VAR = /\u0000\w+\u0000/;

function requestParts(api, baseUrl) {
  const sampleValue = (p) => (p.schema.example !== undefined ? p.schema.example : p.schema.default !== undefined ? p.schema.default : undefined);
  // Valor conhecido do parâmetro de caminho, ou "{nome}" para o leitor trocar
  const pathValue = (p) => {
    const v = sampleValue(p);
    return v === null || v === undefined ? `{${p.name}}` : encodeURIComponent(String(v));
  };

  let route = api.path;
  for (const p of api.parameters.filter((x) => x.in === 'path')) {
    route = route.replace(PATH_PARAM, (m, a, b, c) => ((a || b || c) === p.name ? pathValue(p) : m));
  }
  const query = [];
  const headers = [];
  for (const p of api.parameters) {
    const known = sampleValue(p);
    if (p.in === 'query' && (p.required || known !== undefined)) {
      query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(known !== undefined ? known : sampleFromSchema(p.schema) ?? '')}`);
    }
    if (p.in === 'header' && (p.required || known !== undefined)) headers.push([p.name, known !== undefined ? String(known) : `<${p.name}>`]);
  }
  const auth = api.auth;
  if (auth && auth.type === 'bearer') headers.unshift(['Authorization', `Bearer ${VAR('TOKEN')}`]);
  if (auth && auth.type === 'basic') headers.unshift(['Authorization', `Basic ${VAR('CREDENTIALS')}`]);
  if (auth && auth.type === 'apiKey' && auth.in === 'header') headers.unshift([auth.name, VAR('API_KEY')]);
  if (auth && auth.type === 'apiKey' && auth.in === 'cookie') headers.unshift(['Cookie', `${auth.name}=${VAR('API_KEY')}`]);
  if (auth && auth.type === 'apiKey' && auth.in === 'query') query.push(`${encodeURIComponent(auth.name)}=${VAR('API_KEY')}`);

  let body = null;
  if (api.body) {
    const example = exampleOf(api.body);
    body = { type: api.body.contentType, value: example === undefined ? null : example };
    if (!/multipart\/form-data/i.test(body.type)) headers.push(['Content-Type', body.type]);
  }
  const url = (baseUrl || VAR('BASE_URL')) + route + (query.length ? `?${query.join('&')}` : '');
  return { method: api.method.toUpperCase(), url, headers, body };
}

const isJson = (type) => /json/i.test(type);
const isForm = (type) => /x-www-form-urlencoded/i.test(type);
const isMultipart = (type) => /multipart\/form-data/i.test(type);
const formEntries = (value) => (isObject(value) ? Object.entries(value) : []);
const flat = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

function curlExample({ method, url, headers, body }) {
  const quote = (s) => '"' + s.replace(/[\\"$`]/g, '\\$&').replace(VAR_RE, '$$$1') + '"';
  const single = (s) => "'" + s.replace(/'/g, "'\\''") + "'";
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} ${quote(url)}`];
  for (const [name, value] of headers) lines.push(`-H ${quote(`${name}: ${value}`)}`);
  if (body && body.value !== null) {
    if (isMultipart(body.type)) {
      for (const [k, v] of formEntries(body.value)) lines.push(`-F ${single(v === '<file>' ? `${k}=@file` : `${k}=${flat(v)}`)}`);
    } else if (isForm(body.type)) {
      for (const [k, v] of formEntries(body.value)) lines.push(`--data-urlencode ${single(`${k}=${flat(v)}`)}`);
    } else {
      lines.push(`-d ${single(isJson(body.type) ? JSON.stringify(body.value) : flat(body.value))}`);
    }
  }
  return '```bash\n' + lines.join(' \\\n  ') + '\n```';
}

function jsString(s) {
  if (!HAS_VAR.test(s)) return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return '`' + s.replace(/[\\`]/g, '\\$&').replace(/\$\{/g, '\\${').replace(VAR_RE, '${$1}') + '`';
}

function jsExample({ method, url, headers, body }) {
  const indent = (s, pad) => s.split('\n').join('\n' + pad);
  const pre = [];
  const options = [`  method: '${method}',`];
  if (headers.length) {
    options.push('  headers: {', ...headers.map(([k, v]) => `    ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${jsString(v)},`), '  },');
  }
  if (body && body.value !== null) {
    if (isMultipart(body.type)) {
      pre.push('const body = new FormData();', ...formEntries(body.value).map(([k, v]) => `body.append('${k}', ${v === '<file>' ? 'file' : jsString(flat(v))});`), '');
      options.push('  body,');
    } else if (isForm(body.type)) {
      options.push(`  body: new URLSearchParams(${indent(JSON.stringify(body.value, null, 2), '  ')}),`);
    } else if (isJson(body.type)) {
      options.push(`  body: JSON.stringify(${indent(JSON.stringify(body.value, null, 2), '  ')}),`);
    } else {
      options.push(`  body: ${jsString(flat(body.value))},`);
    }
  }
  const lines = [...pre, `const response = await fetch(${jsString(url)}, {`, ...options, '});', 'const data = await response.json();'];
  return '```javascript\n' + lines.join('\n') + '\n```';
}

function pyString(s) {
  if (!HAS_VAR.test(s)) return JSON.stringify(s);
  return 'f' + JSON.stringify(s.replace(/[{}]/g, '$&$&').replace(VAR_RE, '{$1}'));
}

function pyValue(value, depth = 1) {
  if (value === null || value === undefined) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (typeof value !== 'object') return typeof value === 'string' ? JSON.stringify(value) : String(value);
  const entries = Array.isArray(value) ? value.map((v) => pyValue(v, depth + 1)) : Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${pyValue(v, depth + 1)}`);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  if (!entries.length) return open + close;
  const inline = open + entries.join(', ') + close;
  if (inline.length <= 60 && !inline.includes('\n')) return inline;
  const pad = '    '.repeat(depth + 1);
  return `${open}\n${entries.map((e) => pad + e).join(',\n')},\n${'    '.repeat(depth)}${close}`;
}

function pythonExample({ method, url, headers, body }) {
  const args = [`    ${pyString(url)},`];
  if (headers.length) {
    const entries = headers.map(([k, v]) => `${JSON.stringify(k)}: ${pyString(v)}`);
    const inline = `{${entries.join(', ')}}`;
    args.push(`    headers=${inline.length <= 60 ? inline : `{\n${entries.map((e) => `        ${e},`).join('\n')}\n    }`},`);
  }
  if (body && body.value !== null) {
    if (isMultipart(body.type)) {
      const entries = formEntries(body.value);
      const files = entries.filter(([, v]) => v === '<file>').map(([k]) => [k, 'open("file", "rb")']);
      const data = entries.filter(([, v]) => v !== '<file>');
      if (data.length) args.push(`    data=${pyValue(Object.fromEntries(data))},`);
      if (files.length) args.push(`    files={${files.map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')}},`);
    } else if (isForm(body.type)) {
      args.push(`    data=${pyValue(body.value)},`);
    } else if (isJson(body.type)) {
      args.push(`    json=${pyValue(body.value)},`);
    } else {
      args.push(`    data=${pyString(flat(body.value))},`);
    }
  }
  const lines = ['import requests', '', `response = requests.${method.toLowerCase()}(`, ...args, ')', 'print(response.json())'];
  return '```python\n' + lines.join('\n') + '\n```';
}

const EXAMPLE_WRITERS = { curl: curlExample, javascript: jsExample, python: pythonExample };

/** Exemplos de requisição nas linguagens pedidas (curl, javascript, python), em blocos de código. */
export function requestExamples(api, { examples = ['curl'], baseUrl = null } = {}) {
  const writers = examples.map((e) => EXAMPLE_WRITERS[String(e).toLowerCase()]).filter(Boolean);
  if (!writers.length) return [];
  const parts = requestParts(api, baseUrl);
  return [...new Set(writers)].map((write) => write(parts));
}

// Linhas "## " fora de blocos de código
function firstSectionLine(lines) {
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const marker = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (marker && !fence) fence = marker[1];
    else if (marker && fence && lines[i].trim().startsWith(fence)) fence = null;
    else if (!fence && /^##\s/.test(lines[i])) return i;
  }
  return -1;
}

/**
 * Insere a referência do bloco `api:` no Markdown da página: depois da introdução
 * (antes da primeira seção "## "), ou no fim. Sem a linha do endpoint se o H1 já for "MÉTODO /caminho".
 */
export function withApiReference(markdown, api, opts = {}) {
  const h1 = (markdown.match(/^#\s+(.+?)\s*#*\s*$/m) || [])[1] || '';
  const heading = fold(h1).replace(/`/g, '').replace(/\s+/g, ' ');
  const endpoint = ![api.path, api.oasPath].some((p) => heading.includes(fold(`${api.method} ${p}`)));
  const reference = apiReference(api, { ...opts, endpoint });
  const lines = markdown.replace(/\s+$/, '').split('\n');
  const at = firstSectionLine(lines);
  if (at === -1) return `${lines.join('\n')}\n\n${reference}\n`;
  return `${lines.slice(0, at).join('\n').replace(/\s+$/, '')}\n\n${reference}\n\n${lines.slice(at).join('\n')}\n`;
}
