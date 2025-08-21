(function () {
  // Usa prefixo definido no header (document.write) para suportar subpaths
  const PREFIX = (typeof window !== 'undefined' && window.__rhyla_prefix__) || '/';

  function onReady(cb){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
    else cb();
  }

  let themeToggle, themeLink;
  onReady(() => {
    themeToggle = document.getElementById('theme-toggle');
    themeLink = document.getElementById('theme-style');
  });

  function setTheme(theme) {
    if (!themeLink) themeLink = document.getElementById('theme-style');
    if (themeLink) themeLink.href = PREFIX + 'styles/' + theme + '.css';
    localStorage.setItem('rhyla-theme', theme);
    if (!themeToggle) themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
  }

  const saved = localStorage.getItem('rhyla-theme') || 'light';
  onReady(() => {
    setTheme(saved);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => {
      const cur = localStorage.getItem('rhyla-theme') || 'light';
      setTheme(cur === 'light' ? 'dark' : 'light');
    });
  });

  // Estado de configuração
  let RHYLA_CFG = { side_topics: false };

  // Carrega config usando candidatos com e sem prefixo
  fetch(PREFIX + 'config.json')
    .then(r => r.ok ? r.json() : null)
    .then(cfg => {
      if (cfg) {
        RHYLA_CFG = cfg;
        if (cfg.title) {
          const t = document.getElementById('rhyla-title');
          if (t) t.textContent = cfg.title;
        }
      }
      // Inicializa TOC se habilitado na config
      if (RHYLA_CFG.side_topics) {
        document.body.classList.add('has-right-toc');
        generateRightTOC();
      }
    });

  // Navegação SPA leve: intercepta links internos e troca apenas o <main>
  function isInternalNavigable(a) {
    if (!a || a.target === '_blank') return false;
    const url = new URL(a.href, location.origin);
    if (url.origin !== location.origin) return false;
    const p = url.pathname;
  const excludes = [/\.(css|js|json|png|jpe?g|svg|gif|webp|ico|pdf|zip)(\?|#|$)/i, /^\/public\//, /^\/styles\//, /^\/scripts\//];
    if (excludes.some(rx => rx.test(p))) return false;
    return true;
  }

  function executeScripts(container) {
    const nodes = Array.from(container.querySelectorAll('script'));
    for (const old of nodes) {
      const s = document.createElement('script');
      if (old.src) {
        // Recarrega scripts externos
        s.src = old.src;
      } else {
        // Evita redeclaração de let/const no escopo global
        const code = String(old.textContent || '');
        s.textContent = `(function(){\n${code}\n})();`;
      }
      if (old.type) s.type = old.type;
      old.replaceWith(s);
    }
  }

  function updateActiveSidebar(pathname) {
    try {
      const sb = document.querySelector('.rhyla-sidebar');
      if (!sb) return;
      // Normaliza: remove query e hash
      let pathOnly = typeof pathname === 'string' && pathname ? pathname : location.pathname;
      try { pathOnly = new URL(pathOnly, location.origin).pathname; } catch(_) { pathOnly = location.pathname; }
      // Remove trailing slash (exceto raiz)
      if (pathOnly.length > 1 && pathOnly.endsWith('/')) pathOnly = pathOnly.replace(/\/+$/,'');
      sb.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));
      const link = sb.querySelector(`a[href='${pathOnly}'], a[href='${pathOnly}.html']`);
      if (link) {
        const li = link.closest('li');
        if (li) li.classList.add('active');
        const group = link.closest('.group');
        if (group) {
          group.classList.add('open');
          const content = group.querySelector('.group-content');
          if (content) content.style.maxHeight = content.scrollHeight + 'px';
          const arrow = group.querySelector('.dropdown-arrow');
          if (arrow) arrow.classList.add('open');
        }
      }
    } catch (_) { }
  }

  // Reescreve hrefs da sidebar para respeitar o PREFIX quando hospedado em subpath
  function fixSidebarLinks() {
    try {
      const sb = document.querySelector('.rhyla-sidebar');
      if (!sb) return;
      const as = sb.querySelectorAll('a[href]');
      as.forEach(a => {
        const raw = a.getAttribute('href') || '';
        if (!raw || raw.startsWith('#') || /^(https?:)?\/\//i.test(raw) || raw.startsWith('mailto:')) return;
        let newHref = raw;
        if (raw.startsWith('/')) {
          newHref = PREFIX + raw.replace(/^\/+/, '');
        } else {
          // relativo → torna relativo à raiz do site (PREFIX)
          newHref = PREFIX + raw.replace(/^\.?\/?/, '');
        }
        a.setAttribute('href', newHref);
      });
    } catch(_) { /* noop */ }
  }

  function swapMainFromHTML(html, newUrl, doPush) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main.rhyla-main');
    const main = document.querySelector('main.rhyla-main');
    if (!newMain || !main) return false;
    main.innerHTML = newMain.innerHTML;
    executeScripts(main);
  if (newUrl && doPush) history.pushState({}, '', newUrl);
  fixSidebarLinks();
  updateActiveSidebar(newUrl || location.pathname);
    main.scrollTop = 0;
  // Regerar TOC após navegação SPA e rolar para a query, se houver
  if (RHYLA_CFG.side_topics) generateRightTOC();
  scrollToQueryIfAny();
    return true;
  }

  async function navigate(href, doPush = true) {
    try {
      const res = await fetch(href, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (!swapMainFromHTML(html, href, doPush)) location.assign(href);
    } catch (err) { location.assign(href); }
  }

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const a = e.target.closest('a');
    if (!a) return;
    const rawHref = a.getAttribute('href') || '';
    if (rawHref.startsWith('#')) return; // permitir âncoras
    if (!isInternalNavigable(a)) return;
    e.preventDefault();
    navigate(rawHref, true);
  });

  window.addEventListener('popstate', () => {
  navigate(location.pathname + location.search + location.hash, false);
  setTimeout(scrollToQueryIfAny, 0);
  });

  // ===== Global Search Overlay =====
  let overlay, openBtn, closeBtn, input, meta, resultsDiv;
  onReady(() => {
    overlay = document.getElementById('search-overlay');
    openBtn = document.getElementById('search-open');
    closeBtn = document.getElementById('search-close');
    input = document.getElementById('search-input');
    meta = document.getElementById('search-meta');
    resultsDiv = document.getElementById('search-results');
  });

  let searchIndex = Array.isArray(window.__SEARCH_INDEX__) ? window.__SEARCH_INDEX__ : [];
  if (!searchIndex.length && meta) meta.textContent = 'Loading index…';

  async function ensureIndexLoaded() {
    if (searchIndex.length) return;
  const basePath = location.pathname.endsWith('/') ? location.pathname : (location.pathname.replace(/[^\/]*$/, ''));
  const candidates = [PREFIX + 'search_index.json', basePath + 'search_index.json'];
    for (const url of candidates) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data)) {
          // Basic sanitize of indexed content to avoid rendering raw HTML in snippets
          searchIndex = data.map(p => ({ ...p, content: String(p.content || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '') }));
          break;
        }
      } catch (_) { /* next */ }
    }
    if (meta) meta.textContent = searchIndex.length ? `${searchIndex.length} pages indexed` : 'No pages indexed';
  }

  function highlight(text, query) {
    const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + esc + ')', 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  function formatLabel(page) {
    if (page.title && page.title.trim()) return page.title;
    return (page.route || '').replace(/^\//, '') || 'Untitled';
  }

  function buildRouteWithQuery(route, query) {
    try {
      const parts = String(route || '#').split('#');
      const path = parts[0];
      const hash = parts[1] ? ('#' + parts[1]) : '';
      const sep = path.includes('?') ? '&' : '?';
      return path + sep + 'query=' + encodeURIComponent(query) + hash;
    } catch (_) {
      return route;
    }
  }

  function doSearch(query) {
    const q = (query || '').trim();
    if (!q) { resultsDiv.innerHTML = ''; if (meta) meta.textContent = searchIndex.length ? `${searchIndex.length} pages indexed` : 'No pages indexed'; return; }
    const ql = q.toLowerCase();
    const results = [];
    for (const page of searchIndex) {
      if (!page || !page.content) continue;
      const hay = String(page.content).toLowerCase();
      const matchIndex = hay.indexOf(ql);
      if (matchIndex !== -1) {
        const raw = String(page.content);
        const start = Math.max(0, matchIndex - 40);
        const end = Math.min(raw.length, matchIndex + 40);
        const snippet = raw.slice(start, end);
        results.push({ route: page.route || '#', label: formatLabel(page), snippet: highlight(snippet, q) });
      }
    }
    resultsDiv.innerHTML = '';
    if (!results.length) { if (meta) meta.textContent = 'Nenhum resultado encontrado'; return; }
    if (meta) meta.textContent = `${results.length} resultado(s)`;
    // Escapa HTML para prevenir XSS em snippets/resultados
    function escapeHtml(s){
      return String(s || '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }

    results.forEach(r => {
      const div = document.createElement('div');
      div.className = 'result';
      const href = buildRouteWithQuery(r.route, q);
      const a = document.createElement('a');
      a.setAttribute('href', href);
      a.textContent = r.label;
      const sn = document.createElement('div');
      sn.className = 'snippet';
      // highlight() returns HTML with <mark>; allow marks only by escaping then replacing safe tags
      const safeSnippet = escapeHtml(r.snippet).replace(/&lt;mark&gt;(.*?)&lt;\/mark&gt;/gi, '<mark>$1</mark>');
      sn.innerHTML = '… ' + safeSnippet + ' …';
      div.appendChild(a);
      div.appendChild(sn);
      resultsDiv.appendChild(div);
    });
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; };
  const onInput = debounce(e => doSearch(e.target.value), 150);

  function openOverlay() {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    ensureIndexLoaded().then(() => { try { input && input.focus(); } catch(_) {} });
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (input) input.value = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
  }

  onReady(() => {
    if (openBtn) openBtn.addEventListener('click', openOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target && e.target.hasAttribute('data-close-overlay')) closeOverlay(); });
    if (input) input.addEventListener('input', onInput);
  });
  // Fecha o overlay ao clicar em um resultado (antes do handler global de navegação)
  if (resultsDiv) resultsDiv.addEventListener('click', (e) => {
    const a = e.target && e.target.closest && e.target.closest('a');
    if (a) closeOverlay();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeOverlay();
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openOverlay(); }
  });

  // ===== Right side Topics (TOC) =====
  function ensureTocContainer() {
    let toc = document.getElementById('rhyla-right-toc');
    if (!toc) {
      toc = document.createElement('aside');
      toc.id = 'rhyla-right-toc';
      toc.className = 'rhyla-right-toc';
      toc.setAttribute('aria-label', 'Table of contents');
      document.body.appendChild(toc);
    }
    return toc;
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  function collectHeadings() {
    const main = document.querySelector('main.rhyla-main');
    if (!main) return [];
    const hs = Array.from(main.querySelectorAll('h1, h2, h3, h4'));
    return hs.map(h => {
      let id = h.id;
      if (!id) {
        id = slugify(h.textContent || h.innerText || 'section');
        // Evita ids duplicados
        let unique = id, i = 2;
        while (document.getElementById(unique)) unique = id + '-' + i++;
        h.id = unique; id = unique;
      }
      const level = Number(h.tagName.substring(1));
      return { id, level, text: h.textContent || h.innerText || ('H' + level) };
    });
  }

  function buildTocTree(items) {
    const root = { children: [] };
    const stack = [ { level: 0, node: root } ];
    for (const it of items) {
      const node = { ...it, children: [] };
      while (stack.length && it.level <= stack[stack.length - 1].level) stack.pop();
      stack[stack.length - 1].node.children.push(node);
      stack.push({ level: it.level, node });
    }
    return root.children;
  }

  function renderToc(nodes) {
    if (!nodes || !nodes.length) return '<div class="rh-toc-empty">No topics</div>';
    let html = '<ul class="rh-toc">';
    for (const n of nodes) {
      html += `<li><a href="#${n.id}">${n.text}</a>`;
      if (n.children && n.children.length) html += renderToc(n.children);
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  function generateRightTOC() {
    const headings = collectHeadings();
    const tree = buildTocTree(headings);
    const toc = ensureTocContainer();
    toc.innerHTML = `
      <div class="rh-toc-header">On this page</div>
      <nav class="rh-toc-wrap">${renderToc(tree)}</nav>
    `;

    // Navegação suave para âncoras do TOC
    const main = document.querySelector('main.rhyla-main');
    if (toc && main) {
      toc.addEventListener('click', (e) => {
        const a = e.target && e.target.closest('a');
        if (!a) return;
        const id = a.getAttribute('href') || '';
        if (!id.startsWith('#')) return;
        e.preventDefault();
        const el = main.querySelector(id);
        if (el) {
          try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch(_) { el.scrollIntoView(); }
          if (history && history.pushState) {
            const url = new URL(location.href);
            url.hash = id;
            history.pushState({}, '', url.toString());
          } else {
            location.hash = id;
          }
        }
      });
    }
  }

  // ===== Query based smooth scroll =====
  function readQueryParam() {
    try {
      const url = new URL(location.href);
      let q = url.searchParams.get('query');
      if (!q) return '';
      q = q.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      return q.trim();
    } catch (_) { return ''; }
  }

  function normalizeText(s) {
    try { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    catch(_) { return String(s || '').toLowerCase(); }
  }

  function findFirstMatchElement(q) {
    if (!q) return null;
    const main = document.querySelector('main.rhyla-main');
    if (!main) return null;
    const sel = 'h1,h2,h3,h4,p,li,pre,code,td,th,blockquote';
    const nodes = Array.from(main.querySelectorAll(sel));
    const ql = normalizeText(q);
    for (const n of nodes) {
      const txt = normalizeText(n.textContent || '');
      if (txt.includes(ql)) return n;
    }
    return null;
  }

  function scrollToQueryIfAny() {
    const q = readQueryParam();
    if (!q) return;
    let el = findFirstMatchElement(q);
    if (el) {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) { el.scrollIntoView(); }
      el.classList.add('rh-scroll-highlight');
      setTimeout(() => el.classList.remove('rh-scroll-highlight'), 1800);
    } else {
      // Tenta novamente após um pequeno atraso (conteído assíncrono ou imagens afetando layout)
      setTimeout(() => {
        const el2 = findFirstMatchElement(q);
        if (el2) {
          try { el2.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch(_) { el2.scrollIntoView(); }
          el2.classList.add('rh-scroll-highlight');
          setTimeout(() => el2.classList.remove('rh-scroll-highlight'), 1800);
        }
      }, 120);
    }
  }

  // Scroll inicial quando a página carrega
  onReady(() => {
    updateActiveSidebar(location.pathname);
  fixSidebarLinks();
    scrollToQueryIfAny();
  });
})();
