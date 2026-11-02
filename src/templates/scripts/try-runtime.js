/*
 * Rhyla — painel "Testar" das páginas de rota, no canto inferior direito.
 *
 * Os dados do endpoint vêm de <script id="rh-try-data"> (src/core/try.js). No `rhyla dev` as
 * requisições passam pelo proxy do servidor (sem CORS, cookies de sessão em memória); no site
 * publicado (api.try_it: true) vão direto para a API.
 *
 * O token fica só no sessionStorage desta aba, por servidor: nunca em disco nem no build.
 * A navegação SPA troca o <main> e executa este script de novo; os atalhos de teclado são
 * instalados uma vez e agem sobre o painel atual.
 */
(function () {
  var dataEl = document.getElementById('rh-try-data');
  if (!dataEl) return;
  var data;
  try { data = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var LABELS = {
    pt: {
      open: 'Testar', title: 'Testar a rota', close: 'Fechar', wide: 'Alargar', reset: 'Voltar aos valores de exemplo',
      server: 'Servidor', other: 'Outro…', path: 'Caminho', pathHint: 'Esta página não tem bloco api: confira o caminho.',
      pathParams: 'Parâmetros do caminho', query: 'Query', headers: 'Cabeçalhos', addHeader: 'Adicionar cabeçalho',
      name: 'nome', value: 'valor', remove: 'Remover', body: 'Corpo', format: 'Formatar', invalidJson: 'JSON inválido',
      auth: 'Autenticação', token: 'Token', tokenPlaceholder: 'Cole o token ou chame a rota de login',
      user: 'Usuário', password: 'Senha', apiKey: 'Chave de API', logout: 'Sair', sendToken: 'Enviar o token salvo',
      expiresIn: 'expira em ', expiredAt: 'expirou', noExpiry: 'sem validade', saved: 'salvo nesta aba',
      send: 'Enviar', sending: 'Enviando…', copyCurl: 'Copiar curl', copied: 'Copiado', copy: 'Copiar',
      response: 'Resposta', responseBody: 'Corpo', responseHeaders: 'Cabeçalhos', empty: 'Resposta sem corpo.',
      binary: 'Resposta binária', truncated: 'Resposta cortada em 2 MB.',
      loginSaved: 'Token salvo: as próximas requisições usam ele.', loginMissing: 'Não achei o token na resposta',
      tokenFound: 'Esta resposta trouxe um token', useToken: 'Usar nas próximas', ignore: 'Ignorar',
      cookies: 'Sessão por cookie', clear: 'Limpar', required: 'obrigatório', missing: 'Preencha: ',
      serverMissing: 'Informe o servidor da API (ex.: http://localhost:3000).',
      confirmWrite: function (m, h) { return 'Enviar ' + m + ' para ' + h + '?\n\nNão é localhost: a requisição pode alterar dados de verdade.'; },
      network: 'Sem resposta', cors: 'Sem resposta da API. No site publicado ela precisa aceitar CORS deste endereço, e precisa estar no ar.',
      direct: 'Requisições direto para a API (ela precisa aceitar CORS).', shortcut: 'Ctrl + Enter envia',
      login: 'Rota de login',
    },
    en: {
      open: 'Try it', title: 'Try this route', close: 'Close', wide: 'Widen', reset: 'Back to the example values',
      server: 'Server', other: 'Other…', path: 'Path', pathHint: 'This page has no api block: check the path.',
      pathParams: 'Path parameters', query: 'Query', headers: 'Headers', addHeader: 'Add header',
      name: 'name', value: 'value', remove: 'Remove', body: 'Body', format: 'Format', invalidJson: 'Invalid JSON',
      auth: 'Authentication', token: 'Token', tokenPlaceholder: 'Paste a token or call the login route',
      user: 'User', password: 'Password', apiKey: 'API key', logout: 'Log out', sendToken: 'Send the saved token',
      expiresIn: 'expires in ', expiredAt: 'expired', noExpiry: 'no expiry', saved: 'saved in this tab',
      send: 'Send', sending: 'Sending…', copyCurl: 'Copy curl', copied: 'Copied', copy: 'Copy',
      response: 'Response', responseBody: 'Body', responseHeaders: 'Headers', empty: 'Empty response.',
      binary: 'Binary response', truncated: 'Response cut at 2 MB.',
      loginSaved: 'Token saved: the next requests use it.', loginMissing: 'No token found in the response',
      tokenFound: 'This response has a token', useToken: 'Use it next', ignore: 'Ignore',
      cookies: 'Cookie session', clear: 'Clear', required: 'required', missing: 'Fill in: ',
      serverMissing: 'Enter the API server (e.g. http://localhost:3000).',
      confirmWrite: function (m, h) { return 'Send ' + m + ' to ' + h + '?\n\nThis is not localhost: the request may change real data.'; },
      network: 'No response', cors: 'No response from the API. On the published site it must allow CORS from this address, and be online.',
      direct: 'Requests go straight to the API (it must allow CORS).', shortcut: 'Ctrl + Enter sends',
      login: 'Login route',
    },
    es: {
      open: 'Probar', title: 'Probar la ruta', close: 'Cerrar', wide: 'Ensanchar', reset: 'Volver a los valores de ejemplo',
      server: 'Servidor', other: 'Otro…', path: 'Ruta', pathHint: 'Esta página no tiene bloque api: revise la ruta.',
      pathParams: 'Parámetros de ruta', query: 'Query', headers: 'Cabeceras', addHeader: 'Añadir cabecera',
      name: 'nombre', value: 'valor', remove: 'Quitar', body: 'Cuerpo', format: 'Formatear', invalidJson: 'JSON inválido',
      auth: 'Autenticación', token: 'Token', tokenPlaceholder: 'Pegue un token o llame a la ruta de login',
      user: 'Usuario', password: 'Contraseña', apiKey: 'Clave de API', logout: 'Salir', sendToken: 'Enviar el token guardado',
      expiresIn: 'vence en ', expiredAt: 'vencido', noExpiry: 'sin vencimiento', saved: 'guardado en esta pestaña',
      send: 'Enviar', sending: 'Enviando…', copyCurl: 'Copiar curl', copied: 'Copiado', copy: 'Copiar',
      response: 'Respuesta', responseBody: 'Cuerpo', responseHeaders: 'Cabeceras', empty: 'Respuesta sin cuerpo.',
      binary: 'Respuesta binaria', truncated: 'Respuesta cortada en 2 MB.',
      loginSaved: 'Token guardado: las próximas solicitudes lo usan.', loginMissing: 'No encontré el token en la respuesta',
      tokenFound: 'Esta respuesta trae un token', useToken: 'Usarlo', ignore: 'Ignorar',
      cookies: 'Sesión por cookie', clear: 'Limpiar', required: 'obligatorio', missing: 'Complete: ',
      serverMissing: 'Indique el servidor de la API (ej.: http://localhost:3000).',
      confirmWrite: function (m, h) { return '¿Enviar ' + m + ' a ' + h + '?\n\nNo es localhost: la solicitud puede cambiar datos reales.'; },
      network: 'Sin respuesta', cors: 'Sin respuesta de la API. En el sitio publicado debe aceptar CORS de esta dirección, y estar en línea.',
      direct: 'Solicitudes directas a la API (debe aceptar CORS).', shortcut: 'Ctrl + Enter envía',
      login: 'Ruta de login',
    },
  };
  var L = LABELS[data.lang] || LABELS.en;

  var METHOD = data.method;
  var HAS_BODY = !/^(GET|HEAD)$/.test(METHOD);
  var SAFE = /^(GET|HEAD|OPTIONS)$/.test(METHOD);
  var PATH_PARAM = /:([A-Za-z_]\w*)(?:\([^)]*\))?\??|\{([^}]+)\}|\*([A-Za-z_]\w*)/g;
  var LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1|[^.]+\.localhost)$/i;
  var TOKEN_KEYS = /^(access_?token|accesstoken|id_?token|idtoken|auth_?token|authtoken|token|jwt|bearer)$/i;
  var JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*$/;

  /* ---------- Armazenamento (pode falhar em aba privada: o painel segue sem lembrar) ---------- */

  function store(kind) {
    var s = null;
    try { s = window[kind]; } catch (e) {}
    return {
      get: function (k) { try { var v = s && s.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
      set: function (k, v) { try { if (s) s.setItem(k, JSON.stringify(v)); } catch (e) {} },
      del: function (k) { try { if (s) s.removeItem(k); } catch (e) {} },
    };
  }
  var session = store('sessionStorage');
  var local = store('localStorage');
  var authKey = function (server) { return 'rhyla-try:auth:' + server; };
  var formKey = 'rhyla-try:form:' + data.page;

  /* ---------- DOM ---------- */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }
  var ICONS = {
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    wide: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
    reset: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    key: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M16 7l3 3M18 5l2 2"/></svg>',
  };
  function iconButton(icon, label, onclick, cls) {
    var b = el('button', { type: 'button', class: 'rh-try-icon' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label, onclick: onclick });
    b.innerHTML = ICONS[icon];
    return b;
  }

  /* ---------- Token ---------- */

  function decodeJwt(token) {
    var parts = String(token || '').replace(/^Bearer\s+/i, '').split('.');
    if (parts.length !== 3) return null;
    try {
      var b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var json = decodeURIComponent(atob(b64).split('').map(function (c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join(''));
      var payload = JSON.parse(json);
      return payload && typeof payload === 'object' ? payload : null;
    } catch (e) { return null; }
  }
  function tokenStatus(token) {
    var payload = decodeJwt(token);
    if (!payload || typeof payload.exp !== 'number') return { text: L.saved, expired: false };
    var ms = payload.exp * 1000 - Date.now();
    if (ms <= 0) return { text: L.expiredAt, expired: true };
    var min = Math.round(ms / 60000);
    var span = min < 90 ? min + ' min' : min < 60 * 48 ? Math.round(min / 60) + ' h' : Math.round(min / 1440) + ' d';
    return { text: L.expiresIn + span, expired: false };
  }
  function getPath(obj, path) {
    return String(path).split('.').reduce(function (cur, key) {
      if (cur === null || cur === undefined) return undefined;
      return cur[/^\d+$/.test(key) ? Number(key) : key];
    }, obj);
  }
  // Um token na resposta: chaves conhecidas (token, access_token, accessToken…) ou um JWT, até 4 níveis
  function findToken(value, path, depth) {
    path = path || '';
    depth = depth || 0;
    if (!value || typeof value !== 'object' || depth > 4) return null;
    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      var v = value[keys[i]];
      if (typeof v === 'string' && v.length >= 16 && (TOKEN_KEYS.test(keys[i]) || JWT.test(v))) return { path: path + keys[i], value: v };
    }
    for (var j = 0; j < keys.length; j++) {
      var found = findToken(value[keys[j]], path + keys[j] + '.', depth + 1);
      if (found) return found;
    }
    return null;
  }

  /* ---------- Estado inicial ---------- */

  var servers = Array.isArray(data.servers) ? data.servers : [];
  function initialServer() {
    var saved = local.get('rhyla-try:server');
    if (typeof saved === 'string' && saved) return saved;
    return servers.length ? servers[0].url : '';
  }
  var exampleState = function () {
    return {
      path: data.path || '/',
      params: data.params.reduce(function (acc, p) { acc[p.in + ':' + p.name] = p.value; return acc; }, {}),
      on: data.params.reduce(function (acc, p) { acc[p.in + ':' + p.name] = p.required || p.value !== ''; return acc; }, {}),
      custom: [],
      body: data.body ? data.body.value : '',
      bodyType: data.body ? data.body.type : 'application/json',
    };
  };

  /* ---------- Painel ---------- */

  var old = document.querySelector('.rh-try');
  if (old) old.remove();

  var root = el('div', { class: 'rh-try' });
  var fab = el('button', { type: 'button', class: 'rh-try-fab rh-try-fab--' + METHOD.toLowerCase(), 'aria-expanded': 'false', 'aria-controls': 'rh-try-panel' });
  fab.innerHTML = ICONS.play + '<span>' + L.open + '</span><span class="rh-try-fab-key" hidden>' + ICONS.key + '</span>';
  var panel = el('section', { id: 'rh-try-panel', class: 'rh-try-panel', role: 'dialog', 'aria-label': L.title, hidden: true });
  root.appendChild(panel);
  root.appendChild(fab);
  dataEl.parentNode.insertBefore(root, dataEl);

  var state = Object.assign(exampleState(), session.get(formKey) || {});
  var server = initialServer();
  var lastResponse = null;

  function auth() { return session.get(authKey(server)) || {}; }
  function setAuth(patch) {
    var next = Object.assign({}, auth(), patch);
    Object.keys(next).forEach(function (k) { if (next[k] === '' || next[k] === null || next[k] === undefined) delete next[k]; });
    if (Object.keys(next).length) session.set(authKey(server), next);
    else session.del(authKey(server));
    renderAuth();
    updateFab();
  }
  var saveForm = (function () {
    var t;
    return function () { clearTimeout(t); t = setTimeout(function () { session.set(formKey, state); }, 200); };
  })();

  function updateFab() {
    var a = auth();
    var key = fab.querySelector('.rh-try-fab-key');
    var has = Boolean(a.token || a.apiKey || a.user);
    key.hidden = !has;
    key.classList.toggle('is-expired', has && a.token ? tokenStatus(a.token).expired : false);
    key.title = has ? (a.token ? tokenStatus(a.token).text : L.saved) : '';
  }

  // Cabeçalho
  var methodTag = el('span', { class: 'http-tag http-tag--' + METHOD.toLowerCase(), text: METHOD });
  var headPath = el('code', { class: 'rh-try-route', text: data.path || '/' });
  var head = el('header', { class: 'rh-try-head' }, [
    methodTag, headPath,
    data.login ? el('span', { class: 'rh-try-chip', text: L.login }) : null,
    el('span', { class: 'rh-try-spacer' }),
    iconButton('reset', L.reset, function () { state = exampleState(); session.del(formKey); renderForm(); }),
    iconButton('wide', L.wide, function () { root.classList.toggle('is-wide'); }, 'rh-try-wide-btn'),
    iconButton('close', L.close, function () { setOpen(false); fab.focus(); }),
  ]);

  var scroll = el('div', { class: 'rh-try-scroll' });
  var urlLine = el('div', { class: 'rh-try-url' });
  var errorBox = el('div', { class: 'rh-try-error', role: 'alert', hidden: true });
  var sendBtn = el('button', { type: 'button', class: 'rh-try-send', onclick: function () { send(); } }, [L.send]);
  var curlBtn = el('button', { type: 'button', class: 'rh-try-secondary', onclick: function () { copyText(curl(buildRequest().request), curlBtn, L.copyCurl); } }, [L.copyCurl]);
  var foot = el('footer', { class: 'rh-try-foot' }, [
    el('span', { class: 'rh-try-hint', text: data.mode === 'direct' ? L.direct : L.shortcut }),
    curlBtn, sendBtn,
  ]);
  var formArea = el('div', { class: 'rh-try-form' });
  var authArea = el('div');
  var responseArea = el('div', { class: 'rh-try-response', 'aria-live': 'polite' });
  scroll.appendChild(formArea);
  scroll.appendChild(responseArea);
  panel.appendChild(head);
  panel.appendChild(scroll);
  panel.appendChild(foot);

  function section(title, children, extra) {
    return el('div', { class: 'rh-try-section' }, [el('div', { class: 'rh-try-label' }, [title, extra || null])].concat(children));
  }
  function field(label, input, hint) {
    return el('label', { class: 'rh-try-field' }, [el('span', { class: 'rh-try-field-name', text: label }), input, hint ? el('span', { class: 'rh-try-field-hint', text: hint }) : null]);
  }

  function renderServer() {
    var wrap = el('div', { class: 'rh-try-server' });
    var input = el('input', { type: 'url', class: 'rh-try-input', placeholder: 'http://localhost:3000', value: server, spellcheck: 'false', 'aria-label': L.server });
    input.addEventListener('input', function () {
      server = input.value.trim().replace(/\/+$/, '');
      local.set('rhyla-try:server', server);
      updateUrl(); renderAuth(); updateFab();
    });
    if (servers.length) {
      var select = el('select', { class: 'rh-try-input', 'aria-label': L.server });
      var known = false;
      servers.forEach(function (s) {
        var o = el('option', { value: s.url, text: s.name === s.url ? s.url : s.name + ' — ' + s.url });
        if (s.url === server) { o.selected = true; known = true; }
        select.appendChild(o);
      });
      select.appendChild(el('option', { value: '', text: L.other, selected: !known }));
      input.hidden = known;
      select.addEventListener('change', function () {
        input.hidden = Boolean(select.value);
        server = select.value || input.value.trim().replace(/\/+$/, '');
        if (!select.value) input.focus();
        local.set('rhyla-try:server', server);
        updateUrl(); renderAuth(); updateFab();
      });
      wrap.appendChild(select);
    }
    wrap.appendChild(input);
    return section(L.server, [wrap]);
  }

  function paramInput(p) {
    var key = p.in + ':' + p.name;
    var input;
    if (p.enum && p.enum.length) {
      input = el('select', { class: 'rh-try-input' });
      (p.required ? [] : ['']).concat(p.enum).forEach(function (v) { input.appendChild(el('option', { value: v, text: v, selected: state.params[key] === v })); });
    } else {
      input = el('input', { class: 'rh-try-input', value: state.params[key] || '', placeholder: p.type || '', spellcheck: 'false' });
    }
    input.dataset.param = key;
    input.addEventListener('input', function () {
      state.params[key] = input.value;
      if (p.in !== 'path' && input.value !== '') { state.on[key] = true; var cb = input.closest('.rh-try-row').querySelector('input[type=checkbox]'); if (cb) cb.checked = true; }
      saveForm(); updateUrl();
    });
    input.addEventListener('change', function () { state.params[key] = input.value; saveForm(); updateUrl(); });
    return input;
  }
  function paramRow(p) {
    var key = p.in + ':' + p.name;
    var name = el('span', { class: 'rh-try-pname' }, [el('code', { text: p.name }), p.required ? el('span', { class: 'rh-try-req', title: L.required, text: '*' }) : null]);
    var check = p.in === 'path' ? null : el('input', { type: 'checkbox', checked: p.required || Boolean(state.on[key]), 'aria-label': p.name, disabled: p.required });
    if (check) check.addEventListener('change', function () { state.on[key] = check.checked; saveForm(); updateUrl(); });
    return el('div', { class: 'rh-try-row', title: p.description || '' }, [check || el('span', { class: 'rh-try-check-gap' }), name, paramInput(p)]);
  }

  function customRow(item, index) {
    var name = el('input', { class: 'rh-try-input', value: item[0], placeholder: L.name, spellcheck: 'false' });
    var value = el('input', { class: 'rh-try-input', value: item[1], placeholder: L.value, spellcheck: 'false' });
    name.addEventListener('input', function () { state.custom[index][0] = name.value; saveForm(); });
    value.addEventListener('input', function () { state.custom[index][1] = value.value; saveForm(); });
    return el('div', { class: 'rh-try-row rh-try-row--custom' }, [
      name, value,
      iconButton('close', L.remove, function () { state.custom.splice(index, 1); saveForm(); renderForm(); }, 'rh-try-icon--small'),
    ]);
  }

  // Rota sem autenticação declarada: o token salvo vai por padrão; com auth: none, só se o leitor marcar
  function sendsSaved(type) { return type === 'none' ? state.sendToken === true : state.sendToken !== false; }
  var showToken = false;

  function renderAuth() {
    authArea.textContent = '';
    var a = auth();
    var type = data.auth ? data.auth.type : null;
    var saved = Boolean(a.token || a.apiKey || a.user || a.pass);
    if (type === 'none' && !saved) return;
    if (!type && !saved && !showToken) {
      authArea.appendChild(el('button', { type: 'button', class: 'rh-try-link rh-try-add-token', text: '+ ' + L.token, onclick: function () {
        showToken = true;
        renderAuth();
        var input = authArea.querySelector('input');
        if (input) input.focus();
      } }));
      return;
    }

    var children = [];
    if (type === 'basic') {
      var user = el('input', { class: 'rh-try-input', value: a.user || '', autocomplete: 'off', spellcheck: 'false' });
      var pass = el('input', { class: 'rh-try-input', type: 'password', value: a.pass || '', autocomplete: 'off' });
      user.addEventListener('change', function () { setAuth({ user: user.value }); });
      pass.addEventListener('change', function () { setAuth({ pass: pass.value }); });
      children.push(el('div', { class: 'rh-try-grid' }, [field(L.user, user), field(L.password, pass)]));
    } else if (type === 'apiKey') {
      var keyInput = el('input', { class: 'rh-try-input', type: 'password', value: a.apiKey || '', autocomplete: 'off', placeholder: data.auth.name });
      keyInput.addEventListener('change', function () { setAuth({ apiKey: keyInput.value.trim() }); });
      children.push(field(L.apiKey + ' (' + data.auth.in + ' ' + data.auth.name + ')', keyInput));
    } else if (type !== 'none') {
      var tokenInput = el('input', { class: 'rh-try-input rh-try-mono', type: 'password', value: a.token || '', autocomplete: 'off', spellcheck: 'false', placeholder: L.tokenPlaceholder });
      tokenInput.addEventListener('focus', function () { tokenInput.type = 'text'; });
      tokenInput.addEventListener('blur', function () { tokenInput.type = 'password'; });
      tokenInput.addEventListener('change', function () { setAuth({ token: tokenInput.value.trim().replace(/^Bearer\s+/i, '') }); });
      children.push(field(L.token + ' (Bearer)', tokenInput));
    }

    if (saved) {
      var status = a.token ? tokenStatus(a.token) : { text: L.saved, expired: false };
      var optional = !type || type === 'none';
      var toggle = null;
      if (optional) {
        var check = el('input', { type: 'checkbox', checked: sendsSaved(type) });
        check.addEventListener('change', function () { state.sendToken = check.checked; saveForm(); updateUrl(); });
        toggle = el('label', { class: 'rh-try-inline' }, [check, L.sendToken]);
      }
      children.push(el('div', { class: 'rh-try-auth-status' }, [
        toggle || el('span', { class: 'rh-try-dot' + (status.expired ? ' is-expired' : '') }),
        el('span', { class: optional ? 'rh-try-muted' : (status.expired ? 'is-error' : ''), text: (optional ? '· ' : '') + status.text }),
        el('span', { class: 'rh-try-spacer' }),
        el('button', { type: 'button', class: 'rh-try-link', text: L.logout, onclick: function () { showToken = false; session.del(authKey(server)); renderAuth(); updateFab(); } }),
      ]));
    }
    authArea.appendChild(section(L.auth, children));
  }

  function renderForm() {
    formArea.textContent = '';
    formArea.appendChild(renderServer());

    if (!data.path) {
      var pathInput = el('input', { class: 'rh-try-input rh-try-mono', value: state.path, spellcheck: 'false' });
      pathInput.addEventListener('input', function () { state.path = pathInput.value; headPath.textContent = state.path || '/'; saveForm(); updateUrl(); });
      formArea.appendChild(section(L.path, [pathInput, el('p', { class: 'rh-try-note', text: L.pathHint })]));
      headPath.textContent = state.path || '/';
    }

    formArea.appendChild(authArea);
    renderAuth();

    var groups = [['path', L.pathParams], ['query', L.query], ['header', L.headers], ['cookie', 'Cookies']];
    groups.forEach(function (g) {
      var list = data.params.filter(function (p) { return p.in === g[0]; });
      if (g[0] === 'header') {
        var rows = list.map(paramRow).concat(state.custom.map(customRow));
        var add = el('button', { type: 'button', class: 'rh-try-link', text: '+ ' + L.addHeader, onclick: function () { state.custom.push(['', '']); saveForm(); renderForm(); } });
        formArea.appendChild(section(g[1], rows.concat([add])));
        return;
      }
      if (list.length) formArea.appendChild(section(g[1], list.map(paramRow)));
    });

    if (HAS_BODY) {
      var type = el('input', { class: 'rh-try-input rh-try-type', value: state.bodyType, spellcheck: 'false', 'aria-label': 'Content-Type' });
      type.addEventListener('input', function () { state.bodyType = type.value; saveForm(); });
      var area = el('textarea', { class: 'rh-try-input rh-try-body', rows: '8', spellcheck: 'false' });
      area.value = state.body;
      var bodyError = el('span', { class: 'rh-try-field-hint is-error', hidden: true, text: L.invalidJson });
      area.addEventListener('input', function () { state.body = area.value; bodyError.hidden = true; saveForm(); });
      area.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); var s = area.selectionStart; area.setRangeText('  ', s, area.selectionEnd, 'end'); state.body = area.value; saveForm(); }
      });
      var format = el('button', { type: 'button', class: 'rh-try-link', text: L.format, onclick: function () {
        try { area.value = JSON.stringify(JSON.parse(area.value), null, 2); state.body = area.value; saveForm(); bodyError.hidden = true; } catch (e) { bodyError.hidden = false; }
      } });
      formArea.appendChild(section(L.body, [type, area, bodyError], /json/i.test(state.bodyType) ? format : null));
    }

    formArea.appendChild(urlLine);
    formArea.appendChild(errorBox);
    updateUrl();
  }

  /* ---------- Requisição ---------- */

  function buildRequest() {
    var missing = [];
    var route = data.path || state.path || '/';
    if (route.charAt(0) !== '/') route = '/' + route;
    data.params.forEach(function (p) {
      var v = state.params[p.in + ':' + p.name];
      if (p.in === 'path') {
        if (!v) missing.push(p.name);
        route = route.replace(PATH_PARAM, function (m, a, b, c) { return (a || b || c) === p.name ? (v ? encodeURIComponent(v) : m) : m; });
      }
    });
    var on = function (p) { var k = p.in + ':' + p.name; return p.required || state.on[k]; };
    var query = [];
    var headers = [];
    data.params.forEach(function (p) {
      var v = state.params[p.in + ':' + p.name] || '';
      if (p.in === 'query' && on(p)) {
        if (p.required && v === '') missing.push(p.name);
        query.push(encodeURIComponent(p.name) + '=' + encodeURIComponent(v));
      }
      if (p.in === 'header' && on(p)) {
        if (p.required && v === '') missing.push(p.name);
        if (v !== '') headers.push([p.name, v]);
      }
      if (p.in === 'cookie' && on(p) && v !== '') headers.push(['Cookie', p.name + '=' + v]);
    });
    state.custom.forEach(function (h) { if (h[0] && h[0].trim()) headers.push([h[0].trim(), h[1] || '']); });

    var a = auth();
    var type = data.auth ? data.auth.type : null;
    var sendSaved = sendsSaved(type);
    if (type === 'basic' && (a.user || a.pass)) {
      headers.unshift(['Authorization', 'Basic ' + btoa(unescape(encodeURIComponent((a.user || '') + ':' + (a.pass || ''))))]);
    } else if (type === 'apiKey' && a.apiKey) {
      if (data.auth.in === 'header') headers.unshift([data.auth.name, a.apiKey]);
      if (data.auth.in === 'query') query.push(encodeURIComponent(data.auth.name) + '=' + encodeURIComponent(a.apiKey));
      if (data.auth.in === 'cookie') headers.unshift(['Cookie', data.auth.name + '=' + a.apiKey]);
    } else if (a.token && (type === 'bearer' || sendSaved)) {
      headers.unshift(['Authorization', 'Bearer ' + a.token]);
    }
    // Vários Cookie viram um só
    var cookies = headers.filter(function (h) { return /^cookie$/i.test(h[0]); });
    if (cookies.length > 1) {
      headers = headers.filter(function (h) { return !/^cookie$/i.test(h[0]); });
      headers.push(['Cookie', cookies.map(function (h) { return h[1]; }).join('; ')]);
    }

    var body = null;
    if (HAS_BODY && state.body && state.body.trim()) {
      body = state.body;
      if (state.bodyType && !headers.some(function (h) { return /^content-type$/i.test(h[0]); })) headers.push(['Content-Type', state.bodyType]);
    }
    var url = server + route + (query.length ? '?' + query.join('&') : '');
    return { request: { method: METHOD, url: url, headers: headers, body: body }, missing: missing };
  }

  function updateUrl() {
    var r = buildRequest().request;
    urlLine.textContent = '';
    urlLine.appendChild(el('span', { class: 'http-tag http-tag--' + METHOD.toLowerCase(), text: METHOD }));
    urlLine.appendChild(el('span', { class: 'rh-try-url-text', text: r.url || '/' }));
  }

  function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  function curl(r) {
    var lines = ['curl -X ' + r.method + ' ' + shellQuote(r.url)];
    r.headers.forEach(function (h) { lines.push('  -H ' + shellQuote(h[0] + ': ' + h[1])); });
    if (r.body !== null) lines.push('  --data-raw ' + shellQuote(r.body));
    return lines.join(' \\\n');
  }
  function copyText(text, button, label) {
    var done = function () { button.textContent = L.copied; setTimeout(function () { button.textContent = label; }, 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
    else {
      var t = el('textarea', {}); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      t.remove();
    }
  }

  function showError(message) {
    errorBox.textContent = message || '';
    errorBox.hidden = !message;
  }

  var busy = false;
  async function send() {
    if (busy) return;
    showError('');
    if (!/^https?:\/\/[^/]+/i.test(server)) { showError(L.serverMissing); return; }
    var built = buildRequest();
    if (built.missing.length) { showError(L.missing + built.missing.join(', ')); return; }
    var r = built.request;
    var host = '';
    try { host = new URL(r.url).hostname; } catch (e) { showError(L.serverMissing); return; }
    if (!SAFE && !LOOPBACK.test(host) && !window.confirm(L.confirmWrite(METHOD, host))) return;

    busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = L.sending;
    try {
      lastResponse = data.mode === 'proxy' ? await viaProxy(r) : await direct(r);
      renderResponse(lastResponse);
      if (lastResponse.ok !== false) afterResponse(lastResponse);
    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = L.send;
    }
  }

  async function viaProxy(r) {
    var res;
    try {
      res = await fetch(data.proxy, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Rhyla-Try': '1' }, body: JSON.stringify(r) });
    } catch (e) {
      return { ok: false, error: L.network + ': ' + (e && e.message) };
    }
    var json = null;
    try { json = await res.json(); } catch (e) {}
    if (!res.ok || !json || json.error) return { ok: false, error: (json && json.error) || (L.network + ' (' + res.status + ')') };
    return json;
  }

  async function direct(r) {
    var headers = new Headers();
    r.headers.forEach(function (h) { try { headers.append(h[0], h[1]); } catch (e) {} });
    var started = performance.now();
    var res;
    try {
      res = await fetch(r.url, { method: r.method, headers: headers, body: r.body === null ? undefined : r.body });
    } catch (e) {
      return { ok: false, error: L.cors };
    }
    var text = '';
    try { text = await res.text(); } catch (e) {}
    var list = [];
    res.headers.forEach(function (v, k) { list.push([k, v]); });
    return { status: res.status, statusText: res.statusText, headers: list, body: text, size: new Blob([text]).size, time: Math.round(performance.now() - started) };
  }

  function formatSize(n) {
    if (!n) return '0 B';
    return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  }
  function headerValue(res, name) {
    var h = (res.headers || []).filter(function (x) { return x[0].toLowerCase() === name; })[0];
    return h ? h[1] : '';
  }
  function parseJson(res) {
    if (!res.body) return undefined;
    if (!/json/i.test(headerValue(res, 'content-type')) && !/^\s*[[{]/.test(res.body)) return undefined;
    try { return JSON.parse(res.body); } catch (e) { return undefined; }
  }

  function renderResponse(res) {
    responseArea.textContent = '';
    if (res.ok === false) { showError(res.error); return; }
    var range = String(res.status).charAt(0);
    var status = el('span', { class: 'rh-try-status rh-try-status--' + range + 'xx', text: res.status + (res.statusText ? ' ' + res.statusText : '') });
    var meta = el('span', { class: 'rh-try-meta', text: res.time + ' ms · ' + formatSize(res.size) });
    var json = parseJson(res);
    var bodyText = json !== undefined ? JSON.stringify(json, null, 2) : res.body || '';

    var tabBody = el('button', { type: 'button', class: 'rh-try-tab is-active', role: 'tab', 'aria-selected': 'true', text: L.responseBody });
    var tabHeaders = el('button', { type: 'button', class: 'rh-try-tab', role: 'tab', 'aria-selected': 'false', text: L.responseHeaders + ' (' + (res.headers || []).length + ')' });
    var copyBtn = el('button', { type: 'button', class: 'rh-try-link', text: L.copy });
    copyBtn.addEventListener('click', function () { copyText(bodyText, copyBtn, L.copy); });

    var bodyView = el('pre', { class: 'rh-try-pre' });
    if (res.binary) bodyView.textContent = L.binary + ' (' + formatSize(res.size) + ')';
    else bodyView.textContent = bodyText || L.empty;
    var headersView = el('div', { class: 'rh-try-headers', hidden: true });
    (res.headers || []).forEach(function (h) {
      headersView.appendChild(el('div', { class: 'rh-try-header-row' }, [el('span', { class: 'rh-try-header-name', text: h[0] }), el('span', { text: h[1] })]));
    });
    var select = function (showBody) {
      tabBody.classList.toggle('is-active', showBody); tabBody.setAttribute('aria-selected', String(showBody));
      tabHeaders.classList.toggle('is-active', !showBody); tabHeaders.setAttribute('aria-selected', String(!showBody));
      bodyView.hidden = !showBody; headersView.hidden = showBody; copyBtn.hidden = !showBody;
    };
    tabBody.addEventListener('click', function () { select(true); });
    tabHeaders.addEventListener('click', function () { select(false); });

    responseArea.appendChild(el('div', { class: 'rh-try-section' }, [
      el('div', { class: 'rh-try-label' }, [L.response]),
      el('div', { class: 'rh-try-status-row' }, [status, meta]),
      el('div', { class: 'rh-try-tabs', role: 'tablist' }, [tabBody, tabHeaders, el('span', { class: 'rh-try-spacer' }), copyBtn]),
      bodyView, headersView,
      res.truncated ? el('p', { class: 'rh-try-note', text: L.truncated }) : null,
    ]));
    if (Array.isArray(res.cookies) && res.cookies.length) renderCookies(res.cookies);
    responseArea.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderCookies(names) {
    var origin = '';
    try { origin = new URL(server).origin; } catch (e) { return; }
    var row = el('div', { class: 'rh-try-banner' }, [
      el('span', { text: L.cookies + ': ' + names.join(', ') }),
      el('span', { class: 'rh-try-spacer' }),
      el('button', { type: 'button', class: 'rh-try-link', text: L.clear, onclick: function () {
        fetch(data.proxy + '/cookies?origin=' + encodeURIComponent(origin), { method: 'DELETE', headers: { 'X-Rhyla-Try': '1' } }).then(function () { row.remove(); }, function () {});
      } }),
    ]);
    responseArea.appendChild(row);
  }

  // Rota de login: guarda o token; nas outras, oferece o token que aparecer na resposta
  function afterResponse(res) {
    if (res.status < 200 || res.status >= 300) return;
    var json = parseJson(res);
    var fromHeader = headerValue(res, 'authorization').replace(/^Bearer\s+/i, '');
    var found = null;
    if (json !== undefined && data.login && data.login.token) {
      var v = getPath(json, data.login.token);
      if (typeof v === 'string' && v) found = { path: data.login.token, value: v };
    }
    if (!found && json !== undefined) found = findToken(json);
    if (!found && fromHeader) found = { path: 'Authorization', value: fromHeader };
    if (!found) {
      if (data.login) responseArea.appendChild(el('div', { class: 'rh-try-banner is-warn', text: L.loginMissing + (data.login.token ? ' (' + data.login.token + ').' : '.') }));
      return;
    }
    if (found.value === auth().token) return;
    if (data.login) {
      setAuth({ token: found.value });
      responseArea.appendChild(el('div', { class: 'rh-try-banner is-ok', text: L.loginSaved }));
      return;
    }
    var banner = el('div', { class: 'rh-try-banner' }, [
      el('span', {}, [L.tokenFound + ' ', el('code', { text: found.path }), '.']),
      el('span', { class: 'rh-try-spacer' }),
      el('button', { type: 'button', class: 'rh-try-link', text: L.ignore, onclick: function () { banner.remove(); } }),
      el('button', { type: 'button', class: 'rh-try-chip-btn', text: L.useToken, onclick: function () { setAuth({ token: found.value }); banner.className = 'rh-try-banner is-ok'; banner.textContent = L.loginSaved; } }),
    ]);
    responseArea.appendChild(banner);
  }

  /* ---------- Abrir e fechar ---------- */

  function setOpen(open) {
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    fab.setAttribute('aria-expanded', String(open));
    session.set('rhyla-try:open', open);
    if (open) {
      var first = panel.querySelector('input:not([type=checkbox]):not([hidden]), select, textarea');
      if (first) setTimeout(function () { first.focus({ preventScroll: true }); }, 0);
    }
  }
  fab.addEventListener('click', function () { setOpen(panel.hidden); });

  renderForm();
  updateFab();
  if (session.get('rhyla-try:open') === true) setOpen(true);

  // Atalhos instalados uma vez por documento; agem no painel da página atual
  var api = { root: root, isOpen: function () { return !panel.hidden; }, close: function () { setOpen(false); fab.focus(); }, send: send };
  window.__rhylaTry = api;
  if (!window.__rhylaTryKeys) {
    window.__rhylaTryKeys = true;
    document.addEventListener('keydown', function (e) {
      var cur = window.__rhylaTry;
      if (!cur || !cur.root.isConnected || !cur.isOpen()) return;
      var search = document.getElementById('search-overlay');
      if (search && search.getAttribute('aria-hidden') === 'false') return;
      if (e.key === 'Escape') { cur.close(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && cur.root.contains(document.activeElement)) { e.preventDefault(); cur.send(); }
    });
  }
})();
