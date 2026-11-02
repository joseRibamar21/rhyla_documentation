import { EDITOR_BASE } from './dev-editor.js';
import { HTTP_METHODS } from '../core/api.js';
import { isLoopback, trySettings } from '../core/try.js';

// Respostas maiores são cortadas (o painel é para conferir a rota, não para baixar arquivos)
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;
// Cabeçalhos que o fetch do Node monta sozinho ou que não podem ir adiante
const SKIP_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'expect', 'te', 'trailer', 'proxy-connection']);
const TEXT_TYPE = /^text\/|json|xml|javascript|x-www-form-urlencoded|graphql|yaml|csv/i;

/**
 * Proxy do painel "Testar" (só no `rhyla dev`): o navegador manda a requisição para cá e o
 * servidor chama a API, sem problema de CORS. Só sai para a própria máquina ou para as URLs
 * de `api.base_url` / `api.environments` no config.json. Cookies de sessão ficam em memória,
 * por origem, enquanto o dev roda.
 *
 * POST   /__rhyla/try           { method, url, headers: [[nome, valor]], body }
 * GET    /__rhyla/try/cookies?origin=http://localhost:3000
 * DELETE /__rhyla/try/cookies?origin=…   (sem origin: todos)
 *
 * @param {import('express').Express} app
 * @param {{ context: () => { config: { raw: object } }, log: Function }} deps
 */
export function registerTryRoutes(app, { context, log }) {
  const jars = new Map(); // origem → Map(nome → valor)

  // Só a própria página do dev pode usar o proxy: Host local (sem DNS rebinding) e o cabeçalho
  // X-Rhyla-Try, que um site de fora não consegue mandar sem um preflight que o dev não aceita
  const guard = (req, res, next) => {
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (!isLoopback(host)) return res.status(403).json({ error: 'The test proxy only answers on localhost.' });
    if (req.get('x-rhyla-try') !== '1') return res.status(403).json({ error: 'Missing X-Rhyla-Try header.' });
    next();
  };

  app.get(`${EDITOR_BASE}/try/cookies`, guard, (req, res) => {
    const jar = jars.get(String(req.query.origin || ''));
    res.json({ cookies: jar ? [...jar.keys()] : [] });
  });

  app.delete(`${EDITOR_BASE}/try/cookies`, guard, (req, res) => {
    if (req.query.origin) jars.delete(String(req.query.origin));
    else jars.clear();
    res.json({ ok: true });
  });

  app.post(`${EDITOR_BASE}/try`, guard, async (req, res) => {
    const { method: rawMethod, url: rawUrl, headers: rawHeaders, body } = req.body || {};
    const method = String(rawMethod || '').toUpperCase();
    if (!HTTP_METHODS.includes(method.toLowerCase())) return res.status(400).json({ error: `Unknown method "${rawMethod}".` });

    let url;
    try {
      url = new URL(String(rawUrl || ''));
    } catch {
      return res.status(400).json({ error: `Invalid URL "${rawUrl}". Use the full address, e.g. http://localhost:3000/tasks.` });
    }
    if (!/^https?:$/.test(url.protocol)) return res.status(400).json({ error: 'Only http and https URLs can be tested.' });
    const { servers } = trySettings(context().config.raw);
    const configured = servers.some((s) => {
      try { return new URL(s.url).origin === url.origin; } catch { return false; }
    });
    if (!isLoopback(url.hostname) && !configured) {
      return res.status(403).json({
        error: `${url.origin} is not a configured server. Add it to rhyla-docs/config.json as "api": { "base_url": "${url.origin}" } or in "api.environments".`,
        code: 'not_configured',
      });
    }

    const headers = new Headers();
    for (const pair of Array.isArray(rawHeaders) ? rawHeaders : []) {
      if (!Array.isArray(pair) || typeof pair[0] !== 'string' || !pair[0].trim()) continue;
      const name = pair[0].trim();
      if (SKIP_HEADERS.has(name.toLowerCase())) continue;
      try { headers.append(name, String(pair[1] ?? '')); } catch { return res.status(400).json({ error: `Invalid header "${name}".` }); }
    }
    const jar = jars.get(url.origin);
    if (jar && jar.size && !headers.has('cookie')) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));

    const hasBody = !['GET', 'HEAD'].includes(method) && typeof body === 'string' && body !== '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = performance.now();
    let response;
    try {
      response = await fetch(url, { method, headers, body: hasBody ? body : undefined, redirect: 'manual', signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const reason = err.name === 'AbortError' ? `no answer after ${TIMEOUT_MS / 1000} s` : (err.cause && err.cause.code) || err.message;
      log(`🧪 ${method} ${url.href} → failed (${reason})`);
      return res.status(502).json({ error: `Could not reach ${url.origin} (${reason}). Is the API running?`, code: 'unreachable' });
    }

    // Corpo: texto até o limite; binário só pelo tamanho
    const chunks = [];
    let size = 0;
    let truncated = false;
    try {
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) { truncated = true; controller.abort(); break; }
          chunks.push(chunk);
        }
      }
    } catch (err) {
      if (!truncated) {
        clearTimeout(timer);
        return res.status(502).json({ error: `The response from ${url.origin} was interrupted (${err.message}).`, code: 'unreachable' });
      }
    }
    clearTimeout(timer);
    const time = Math.round(performance.now() - started);

    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    if (setCookies.length) {
      const next = jars.get(url.origin) || new Map();
      for (const line of setCookies) {
        const [pair, ...attrs] = line.split(';');
        const at = pair.indexOf('=');
        if (at < 1) continue;
        const name = pair.slice(0, at).trim();
        const expired = attrs.some((a) => /^\s*max-age\s*=\s*(0|-\d+)\s*$/i.test(a))
          || attrs.some((a) => /^\s*expires\s*=/i.test(a) && Date.parse(a.split('=').slice(1).join('=')) < Date.now());
        if (expired) next.delete(name);
        else next.set(name, pair.slice(at + 1).trim());
      }
      if (next.size) jars.set(url.origin, next);
      else jars.delete(url.origin);
    }

    const type = response.headers.get('content-type') || '';
    const buffer = Buffer.concat(chunks);
    const binary = Boolean(buffer.length) && !TEXT_TYPE.test(type) && buffer.subarray(0, 512).includes(0);
    log(`🧪 ${method} ${url.href} → ${response.status} (${time} ms)`);
    res.json({
      status: response.status,
      statusText: response.statusText,
      headers: [...response.headers],
      body: binary ? null : buffer.toString('utf8'),
      binary,
      size,
      truncated,
      time,
      cookies: [...(jars.get(url.origin) || new Map()).keys()],
    });
  });
}
