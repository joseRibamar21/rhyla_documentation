(function () {
  function getPrefix() {
    try {
      const meta = document.querySelector('meta[name="rhyla-base"]');
      if (meta && meta.getAttribute('content')) {
        let base = meta.getAttribute('content');
        if (!base.endsWith('/')) base += '/';
        return base;
      }
    } catch (e) {}
    
    if (typeof window !== 'undefined' && window.__rhyla_prefix__) {
      return window.__rhyla_prefix__;
    }
    
    return '/';
  }
  
  // Usar PREFIX já definido no header para consistência
  const PREFIX = window.__rhyla_prefix__ || getPrefix();
  
  // Garantir que PREFIX esteja disponível globalmente para outros scripts
  window.__rhyla_prefix__ = PREFIX;
  
  // Corrigir imediatamente qualquer URL do CSS antes de continuar
  (function fixCssPathsImmediate() {
    // Corrigir todos os links CSS
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const href = link.getAttribute('href');
      
      if (href) {
        // Garantir que caminhos para pasta styles sejam absolutos
        if (href.includes('styles/') && !href.includes(PREFIX)) {
          // Extrair o nome do arquivo CSS
          const parts = href.split('/');
          const filename = parts[parts.length - 1];
          
          // Reconstruir URL com prefixo correto
          link.href = PREFIX + 'styles/' + filename;
        } 
        // Para qualquer outro CSS com caminho relativo
        else if (!href.startsWith('/') && !href.startsWith('http')) {
          link.href = PREFIX + href.replace(/^\.\//, '');
        }
      }
    }
    
    // Garantir que o tema esteja correto
    const themeCss = document.getElementById('theme-style');
    if (themeCss) themeCss.href = PREFIX + 'styles/' + getTheme() + '.css';
  })();

  function onReady(cb){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb);
    else cb();
  }

  // ===== Tema =====
  // Escolha salva (botão) > tema já aplicado pelo header > preferência do sistema
  function getTheme() {
    let saved = null;
    try { saved = localStorage.getItem('rhyla-theme'); } catch (_) {}
    if (saved === 'dark' || saved === 'light') return saved;
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function setTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeLink = document.getElementById('theme-style');
    if (themeLink) themeLink.href = PREFIX + 'styles/' + theme + '.css';
    if (persist) { try { localStorage.setItem('rhyla-theme', theme); } catch (_) {} }
    const btn = document.getElementById('theme-toggle');
    // Headers novos usam ícones (data-icon); headers antigos usam texto
    if (btn && !btn.hasAttribute('data-icon')) btn.textContent = theme === 'light' ? '🌙 Dark' : '☀️ Light';
    if (btn) btn.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  onReady(() => {
    setTheme(getTheme(), false);
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', () => setTheme(getTheme() === 'dark' ? 'light' : 'dark', true));
  });

  // ===== Menu lateral no mobile =====
  function setNavOpen(open) {
    document.body.classList.toggle('rh-nav-open', open);
    const sb = document.querySelector('.rhyla-sidebar');
    if (sb) sb.classList.toggle('open', open);
    const btn = document.getElementById('menu-toggle');
    if (btn) btn.setAttribute('aria-expanded', String(open));
  }
  onReady(() => {
    const btn = document.getElementById('menu-toggle');
    if (btn) btn.addEventListener('click', () => setNavOpen(!document.body.classList.contains('rh-nav-open')));
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-close-nav]')) setNavOpen(false);
    });
  });

  // ===== Botão de copiar nos blocos de código =====
  function addCopyButtons(root) {
    (root || document).querySelectorAll('main.rhyla-main pre').forEach((pre) => {
      if (pre.querySelector('.rh-copy-btn')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rh-copy-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code') || pre;
        try {
          await navigator.clipboard.writeText(code.innerText.replace(/\n$/, ''));
          btn.textContent = 'Copied';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
        } catch (_) { btn.textContent = 'Failed'; }
      });
      pre.appendChild(btn);
    });
  }
  onReady(() => addCopyButtons(document));

  // Diagramas de fluxo: destaca as conexões do passo (ou da linha) sob o mouse
  function focusFlow(svg, target) {
    svg.querySelectorAll('.is-related').forEach((n) => n.classList.remove('is-related'));
    if (!target) { svg.classList.remove('is-focusing'); return; }
    svg.classList.add('is-focusing');
    const mark = (sel) => svg.querySelectorAll(sel).forEach((n) => n.classList.add('is-related'));
    const q = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : v);
    const step = target.getAttribute('data-step');
    if (step) {
      target.classList.add('is-related');
      svg.querySelectorAll(`.rh-flow-link[data-from="${q(step)}"], .rh-flow-link[data-to="${q(step)}"]`).forEach((l) => {
        l.classList.add('is-related');
        mark(`.rh-flow-pill[data-edge="${q(l.getAttribute('data-edge'))}"]`);
        mark(`[data-step="${q(l.getAttribute('data-from'))}"], [data-step="${q(l.getAttribute('data-to'))}"]`);
      });
    } else {
      const edge = target.getAttribute('data-edge');
      mark(`.rh-flow-link[data-edge="${q(edge)}"], .rh-flow-pill[data-edge="${q(edge)}"]`);
      mark(`[data-step="${q(target.getAttribute('data-from') || edge.split('>')[0])}"], [data-step="${q(target.getAttribute('data-to') || edge.split('>')[1])}"]`);
    }
  }
  document.addEventListener('mouseover', (e) => {
    const svg = e.target.closest && e.target.closest('.rh-flow-svg');
    if (!svg) return;
    focusFlow(svg, e.target.closest('[data-step], .rh-flow-link, .rh-flow-pill'));
  });
  document.addEventListener('mouseout', (e) => {
    const svg = e.target.closest && e.target.closest('.rh-flow-svg');
    if (svg && !svg.contains(e.relatedTarget)) focusFlow(svg, null);
  });

  // Diagramas de fluxo mais largos que a tela abrem centralizados
  function centerFlows(root) {
    (root || document).querySelectorAll('.rh-flow').forEach((el) => {
      if (el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    });
  }
  onReady(() => centerFlows(document));

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
    if (!a || a.getAttribute('target') === '_blank' || a.hasAttribute('data-no-spa')) return false;
    // getAttribute funciona também em <a> dentro de SVG (diagramas de fluxo)
    const url = new URL(a.getAttribute('href') || '', location.href);
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
      
      // Remove duplicações de diretórios no caminho
      const pathParts = pathOnly.split('/').filter(Boolean);
      const dedupedParts = [];
      for (let i = 0; i < pathParts.length; i++) {
        if (i < pathParts.length - 1 && pathParts[i] === pathParts[i+1]) {
          continue; // Pula duplicações consecutivas
        }
        dedupedParts.push(pathParts[i]);
      }
      pathOnly = '/' + dedupedParts.join('/');
      
      // Remove o prefixo para comparação
      if (PREFIX && PREFIX !== '/') {
        const cleanPrefix = PREFIX.replace(/^\/|\/$/g, '');
        const prefixRegex = new RegExp(`^\\/?${cleanPrefix}\\/`, 'i');
        pathOnly = pathOnly.replace(prefixRegex, '');
        
        // Se remover o prefixo deixa a string vazia, usamos a raiz
        if (!pathOnly) pathOnly = '/';
        if (!pathOnly.startsWith('/')) pathOnly = '/' + pathOnly;
      }
      
      // Remove trailing slash (exceto raiz)
      if (pathOnly.length > 1 && pathOnly.endsWith('/')) pathOnly = pathOnly.replace(/\/+$/,'');
      
      sb.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));
      
      // Obtém o nome do arquivo/página atual
      const fileName = pathOnly.split('/').pop();
      const fileNameWithoutExt = fileName.replace(/\.html$/, '');
      
      // Estratégias de busca para encontrar o link correto
      let link = null;
      
      // 1. Tenta com o caminho completo
      link = sb.querySelector(`a[href='${pathOnly}'], a[href='${pathOnly}.html']`);
      
      // 2. Tenta com caminhos relativos simples
      if (!link) {
        link = sb.querySelector(`a[href='./${fileNameWithoutExt}.html']`);
      }
      
      // 3. Tenta com data-path (atributo personalizado que adicionamos)
      if (!link && dedupedParts.length > 1) {
        const groupPath = dedupedParts.slice(0, -1).join('/');
        const links = Array.from(sb.querySelectorAll('a[data-path]'));
        link = links.find(a => {
          const dataPath = a.getAttribute('data-path');
          return dataPath === groupPath && 
                 a.getAttribute('href').endsWith(`${fileNameWithoutExt}.html`);
        });
      }
      
      // 4. Tenta com qualquer link que termine com o nome do arquivo
      if (!link) {
        const allLinks = Array.from(sb.querySelectorAll('a[href]'));
        link = allLinks.find(a => {
          const href = a.getAttribute('href');
          return href.endsWith(`/${fileNameWithoutExt}.html`) || 
                 href.endsWith(`/${fileNameWithoutExt}`);
        });
      }
      
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
        
        // Primeiro normaliza o caminho para remover possíveis duplicações
        let normalizedHref = raw;
        
        // Verifica se precisa adicionar prefixo
        if (PREFIX && PREFIX !== '/') {
          // Identifica se já tem o prefixo
          const cleanPrefix = PREFIX.replace(/^\/|\/$/g, '');
          const prefixPattern = new RegExp(`^(\\.?\\/)?${cleanPrefix}\\/`, 'i');
          
          if (!prefixPattern.test(normalizedHref)) {
            if (normalizedHref.startsWith('/')) {
              // URLs absolutas são prefixadas com o PREFIX
              normalizedHref = PREFIX + normalizedHref.replace(/^\/+/, '');
            } else {
              // URLs relativas também são prefixadas com PREFIX para garantir consistência
              normalizedHref = PREFIX + normalizedHref.replace(/^\.?\/?/, '');
            }
          }
        }
        
        // Normaliza para remover possíveis duplicações de diretórios
        const finalHref = normalizeUrl(normalizedHref);
        a.setAttribute('href', finalHref);
      });
      
      // Também consertar links na busca, se existir
      const searchResults = document.getElementById('search-results');
      if (searchResults) {
        const searchLinks = searchResults.querySelectorAll('a[href]');
        searchLinks.forEach(a => {
          const raw = a.getAttribute('href') || '';
          if (!raw || raw.startsWith('#') || /^(https?:)?\/\//i.test(raw) || raw.startsWith('mailto:')) return;
          
          // Aplica normalização para evitar duplicações
          let normalizedHref = raw;
          
          // Verifica se precisa adicionar prefixo
          if (PREFIX && PREFIX !== '/') {
            const cleanPrefix = PREFIX.replace(/^\/|\/$/g, '');
            const prefixPattern = new RegExp(`^(\\.?\\/)?${cleanPrefix}\\/`, 'i');
            
            if (!prefixPattern.test(normalizedHref)) {
              if (normalizedHref.startsWith('/')) {
                normalizedHref = PREFIX + normalizedHref.replace(/^\/+/, '');
              } else {
                normalizedHref = PREFIX + normalizedHref.replace(/^\.?\/?/, '');
              }
            }
          }
          
          // Normaliza duplicações de diretórios
          const finalHref = normalizeUrl(normalizedHref);
          a.setAttribute('href', finalHref);
        });
      }
    } catch(_) { /* noop */ }
  }

  function swapMainFromHTML(html, newUrl, doPush) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.querySelector('main.rhyla-main');
    const main = document.querySelector('main.rhyla-main');
    if (!newMain || !main) return false;
    main.innerHTML = newMain.innerHTML;
    if (doc.title) document.title = doc.title;
    executeScripts(main);
    
    // Extrair o hash da URL (âncora) e o parâmetro de consulta
    let hash = '';
    let hasQuery = false;
    try {
      const url = new URL(newUrl, location.origin);
      hash = url.hash;
      hasQuery = url.searchParams.has('query');
    } catch (e) {
      // Fallback para extração básica se URL não for válida
      hash = newUrl.includes('#') ? '#' + newUrl.split('#')[1] : '';
      hasQuery = newUrl.includes('?query=');
    }
    
    // Atualiza o histórico, sidebar e TOC
    if (newUrl && doPush) history.pushState({}, '', newUrl);
    setNavOpen(false);
    addCopyButtons(main);
    centerFlows(main);
    fixSidebarLinks();
    updateActiveSidebar(newUrl || location.pathname);
    
    // Regenera TOC após navegação SPA
    if (RHYLA_CFG.side_topics) generateRightTOC();
    
    // Sistema de rolagem aprimorado com múltiplos atrasos para garantir que o DOM esteja pronto
    const scrollToTarget = (attempt = 1) => {
      // Prioridade de rolagem:
      // 1. Se tem hash/âncora, rola para o elemento
      if (hash) {
        try {
          const el = document.querySelector(hash);
          if (el) {
            try { 
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch (_) { 
              el.scrollIntoView();
            }
            // Destaca o elemento
            el.classList.add('rh-scroll-highlight');
            setTimeout(() => el.classList.remove('rh-scroll-highlight'), 1800);
            return true;
          }
        } catch (e) {
          console.error('Erro ao rolar para âncora:', e);
        }
      }
      
      // 2. Se tem query string, usa scrollToQueryIfAny para encontrar o texto
      if (hasQuery) {
        setTimeout(() => scrollToQueryIfAny(), 10);
        return true;
      }
      
      // 3. Se nenhum dos acima, ou se houve falha, rola para o topo
      if (attempt === 1) {
        main.scrollTop = 0;
        window.scrollTo(0, 0);
      }
      
      return false;
    };
    
    // Tenta rolar imediatamente
    const success = scrollToTarget();
    
    // Se não teve sucesso ou precisamos garantir, tenta novamente após um atraso
    if (!success || hash || hasQuery) {
      // Primeira tentativa após DOM ser atualizado
      setTimeout(() => {
        if (!scrollToTarget(2) && (hash || hasQuery)) {
          // Segunda tentativa se ainda não encontrou elemento
          setTimeout(() => {
            scrollToTarget(3);
          }, 250);
        }
      }, 50);
    }
    
    return true;
  }

  // Função para normalizar URLs e evitar duplicação de prefixo e caminhos
  function normalizeUrl(href) {
    if (!href) return href;
    
    // 1. Normalizar prefixo
    let result = href;
    if (PREFIX && PREFIX !== '/') {
      const cleanPrefix = PREFIX.replace(/^\/|\/$/g, '');
      const prefixPattern = new RegExp(`^(\\/?)(${cleanPrefix}\\/)+(${cleanPrefix}\\/)`, 'i');
      result = result.replace(prefixPattern, '$1$2');
    }
    
    // 2. Normalizar caminhos duplicados (ex: guide/guide/file.html -> guide/file.html)
    const urlObj = new URL(result, location.origin);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    
    // Deduplica partes consecutivas idênticas do caminho
    const dedupedParts = [];
    for (let i = 0; i < pathParts.length; i++) {
      if (i < pathParts.length - 1 && pathParts[i] === pathParts[i+1]) {
        continue; // Pula duplicações consecutivas
      }
      dedupedParts.push(pathParts[i]);
    }
    
    // Reconstrói a URL com o caminho normalizado
    urlObj.pathname = '/' + dedupedParts.join('/');
    
    // Se for URL relativa ao site atual, retorna apenas o pathname
    if (urlObj.origin === location.origin) {
      return urlObj.pathname + urlObj.search + urlObj.hash;
    }
    
    return urlObj.toString();
  }
  
  async function navigate(href, doPush = true) {
    try {
      // Normaliza a URL antes de navegar para evitar duplicações
      const normalizedHref = normalizeUrl(href);
      
      // Verifica se existe duplicação de diretórios no caminho
      const urlObj = new URL(normalizedHref, location.origin);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      let hasDuplication = false;
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (pathParts[i] === pathParts[i+1]) {
          hasDuplication = true;
          break;
        }
      }
      
      // Se encontrou duplicação, normaliza novamente
      const finalHref = hasDuplication ? normalizeUrl(normalizedHref) : normalizedHref;
      
      const res = await fetch(finalHref, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      if (!swapMainFromHTML(html, finalHref, doPush)) location.assign(finalHref);
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
    // Quando voltar/avançar no histórico, manter navegação relativa correta
    const currentPath = location.pathname + location.search + location.hash;
    navigate(currentPath, false);
    // O scrollToQueryIfAny será chamado por swapMainFromHTML quando necessário
  });

  // ===== Busca (diálogo global) =====
  let overlay, input, meta, resultsDiv;
  let searchIndex = Array.isArray(window.__SEARCH_INDEX__) ? window.__SEARCH_INDEX__ : [];
  let indexPromise = null;
  let selected = -1;
  const MAX_RESULTS = 20;

  onReady(() => {
    overlay = document.getElementById('search-overlay');
    input = document.getElementById('search-input');
    meta = document.getElementById('search-meta');
    resultsDiv = document.getElementById('search-results');

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    document.querySelectorAll('[data-shortcut]').forEach((k) => { k.textContent = isMac ? '⌘ K' : 'Ctrl K'; });

    const openBtn = document.getElementById('search-open');
    const closeBtn = document.getElementById('search-close');
    if (openBtn) openBtn.addEventListener('click', openOverlay);
    if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target && e.target.hasAttribute('data-close-overlay')) closeOverlay(); });
    if (input) {
      input.addEventListener('input', debounce((e) => doSearch(e.target.value), 80));
      input.addEventListener('keydown', onSearchKeydown);
    }
    if (resultsDiv) resultsDiv.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('a')) closeOverlay();
    }, true);
  });

  function ensureIndexLoaded() {
    if (searchIndex.length) return Promise.resolve();
    if (indexPromise) return indexPromise;
    const basePath = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^\/]*$/, '');
    const candidates = [PREFIX + 'search_index.json', basePath + 'search_index.json'];
    indexPromise = (async () => {
      for (const url of candidates) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const data = await res.json();
          if (Array.isArray(data)) { searchIndex = data; break; }
        } catch (_) { /* tenta a próxima */ }
      }
      indexPromise = null;
    })();
    return indexPromise;
  }

  const fold = (s) => {
    try { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    catch (_) { return String(s || '').toLowerCase(); }
  };
  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Destaca o trecho [start, start+len) do texto original, escapando o resto
  function markRange(text, start, len) {
    return escapeHtml(text.slice(0, start)) + '<mark>' + escapeHtml(text.slice(start, start + len)) + '</mark>' + escapeHtml(text.slice(start + len));
  }

  function snippetFor(content, idx, len) {
    const from = Math.max(0, idx - 60);
    const to = Math.min(content.length, idx + len + 100);
    const text = content.slice(from, to);
    return (from > 0 ? '… ' : '') + markRange(text, idx - from, len) + (to < content.length ? ' …' : '');
  }

  function buildRouteWithQuery(route, query) {
    const sep = String(route).includes('?') ? '&' : '?';
    return route + sep + 'query=' + encodeURIComponent(query);
  }

  // "/guide/install" → "<prefix>guide/install.html" (funciona em qualquer host estático)
  function routeHref(route) {
    const r = String(route || '/').replace(/^\/+/, '');
    return PREFIX + (r ? r + '.html' : '');
  }

  function setMeta(text) { if (meta) meta.textContent = text; }

  function doSearch(query) {
    const q = (query || '').trim();
    selected = -1;
    if (!resultsDiv) return;
    if (!q) {
      resultsDiv.innerHTML = '';
      setMeta(searchIndex.length ? `${searchIndex.length} pages` : '');
      return;
    }
    const fq = fold(q);
    const scored = [];
    for (const page of searchIndex) {
      if (!page) continue;
      const title = String(page.title || page.route || 'Untitled');
      const content = String(page.content || '');
      const ft = fold(title);
      const fc = fold(content);
      const inTitle = ft.indexOf(fq);
      const inContent = fc.indexOf(fq);
      if (inTitle === -1 && inContent === -1) continue;
      // Título que começa com o termo > título que contém > só no conteúdo
      const score = inTitle === 0 ? 0 : inTitle > 0 ? 1 : 2;
      scored.push({ page, title, content, inTitle, inContent, score });
    }
    scored.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));

    resultsDiv.innerHTML = '';
    if (!scored.length) {
      setMeta('');
      resultsDiv.innerHTML = `<div class="rh-search-empty">No results for “${escapeHtml(q)}”</div>`;
      return;
    }
    setMeta(scored.length === 1 ? '1 result' : `${scored.length} results`);

    for (const r of scored.slice(0, MAX_RESULTS)) {
      const a = document.createElement('a');
      a.className = 'result';
      a.setAttribute('role', 'option');
      a.href = buildRouteWithQuery(routeHref(r.page.route), q);
      const titleHtml = r.inTitle >= 0 ? markRange(r.title, r.inTitle, q.length) : escapeHtml(r.title);
      const path = r.page.route && r.page.route !== '/' ? r.page.route : '/';
      const snippet = r.inContent >= 0 ? snippetFor(r.content, r.inContent, q.length) : escapeHtml(r.content.slice(0, 140));
      a.innerHTML = `<div class="result-title"><span>${titleHtml}</span><span class="result-path">${escapeHtml(path)}</span></div>` +
        (snippet ? `<div class="snippet">${snippet}</div>` : '');
      resultsDiv.appendChild(a);
    }
    select(0);
  }

  function select(i) {
    const items = resultsDiv ? Array.from(resultsDiv.querySelectorAll('.result')) : [];
    if (!items.length) { selected = -1; return; }
    selected = (i + items.length) % items.length;
    items.forEach((el, k) => {
      el.classList.toggle('selected', k === selected);
      el.setAttribute('aria-selected', String(k === selected));
    });
    items[selected].scrollIntoView({ block: 'nearest' });
  }

  function onSearchKeydown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); select(selected + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); select(selected - 1); }
    else if (e.key === 'Enter') {
      const items = resultsDiv ? resultsDiv.querySelectorAll('.result') : [];
      const target = items[selected >= 0 ? selected : 0];
      if (target) { e.preventDefault(); closeOverlay(); navigate(target.getAttribute('href'), true); }
    }
  }

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

  function openOverlay() {
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (input) input.focus();
    if (!searchIndex.length) setMeta('Loading…');
    ensureIndexLoaded().then(() => doSearch(input ? input.value : ''));
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (input) input.value = '';
    if (resultsDiv) resultsDiv.innerHTML = '';
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeOverlay(); setNavOpen(false); }
    const typing = /^(input|textarea|select)$/i.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openOverlay(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); openOverlay(); }
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
      // Anchors (#) são relativos ao documento atual, então não precisa ajustar com PREFIX
      html += `<li><a href="#${n.id}">${escapeHtml(n.text)}</a>`;
      if (n.children && n.children.length) html += renderToc(n.children);
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  let tocObserver = null;

  // Destaca no TOC a seção visível
  function watchActiveHeading(toc, headings) {
    if (tocObserver) tocObserver.disconnect();
    if (!('IntersectionObserver' in window) || !headings.length) return;
    const links = new Map(Array.from(toc.querySelectorAll('a')).map((a) => [a.getAttribute('href').slice(1), a]));
    const visible = new Set();
    tocObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) visible.add(en.target.id); else visible.delete(en.target.id); });
      const current = headings.find((h) => visible.has(h.id)) || null;
      if (!current) return;
      links.forEach((a, id) => a.classList.toggle('active', id === current.id));
    }, { rootMargin: '-70px 0px -65% 0px' });
    headings.forEach((h) => { const el = document.getElementById(h.id); if (el) tocObserver.observe(el); });
  }

  function generateRightTOC() {
    // Todos os títulos ganham id (âncoras), mas o TOC mostra só h2/h3
    const headings = collectHeadings().filter((h) => h.level === 2 || h.level === 3);
    const toc = ensureTocContainer();
    if (headings.length < 2) {
      toc.style.display = 'none';
      document.body.classList.remove('has-right-toc');
      return;
    }
    toc.style.display = '';
    document.body.classList.add('has-right-toc');
    const tree = buildTocTree(headings);
    toc.innerHTML = `
      <div class="rh-toc-header">On this page</div>
      <nav class="rh-toc-wrap">${renderToc(tree)}</nav>
    `;
    watchActiveHeading(toc, headings);

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
    // Primeiro verifica se tem hash (âncora específica) na URL
    if (location.hash) {
      const id = location.hash.substring(1);
      const el = document.getElementById(id);
      if (el) {
        setTimeout(() => {
          try { 
            el.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
          } catch(_) { 
            el.scrollIntoView(); 
          }
          
          // Destaca visualmente o elemento
          el.classList.add('rh-scroll-highlight');
          setTimeout(() => el.classList.remove('rh-scroll-highlight'), 1800);
        }, 50);
        
        return; // Se encontrou por âncora, não precisa procurar por query
      }
    }
    
    // Se não encontrou por âncora, tenta por query parameter
    const q = readQueryParam();
    if (!q) return;
    
    // Função para destacar e rolar para um elemento
    const highlightAndScroll = (element) => {
      if (!element) return false;
      
      try { 
        // Rola suavemente para o elemento e o centraliza
        element.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        }); 
      } catch(e) { 
        // Fallback para navegadores que não suportam opções
        element.scrollIntoView(); 
      }
      
      // Adiciona uma classe de destaque temporariamente
      element.classList.add('rh-scroll-highlight');
      setTimeout(() => element.classList.remove('rh-scroll-highlight'), 1800);
      
      return true;
    };
    
    // Primeiro tenta encontrar um título (h1-h6) com texto que contenha a consulta
    const headings = Array.from(document.querySelectorAll('main.rhyla-main h1, main.rhyla-main h2, main.rhyla-main h3, main.rhyla-main h4, main.rhyla-main h5, main.rhyla-main h6'));
    const queryNormalized = normalizeText(q);
    
    // Procura por cabeçalho que corresponda à consulta
    for (const heading of headings) {
      const headingText = normalizeText(heading.textContent || heading.innerText);
      if (headingText.includes(queryNormalized)) {
        if (highlightAndScroll(heading)) return;
        break;
      }
    }
    
    // Se não achou cabeçalho, procura por qualquer elemento com o texto
    let el = findFirstMatchElement(q);
    if (el) {
      highlightAndScroll(el);
    } else {
      // Tenta novamente após um pequeno atraso (conteúdo assíncrono ou imagens afetando layout)
      setTimeout(() => {
        const el2 = findFirstMatchElement(q);
        if (el2) {
          highlightAndScroll(el2);
        } else {
          // Tenta uma última vez com um atraso maior se ainda não encontrou
          setTimeout(() => {
            const el3 = findFirstMatchElement(q);
            if (el3) highlightAndScroll(el3);
          }, 300);
        }
      }, 150);
    }
  }

  // Scroll inicial quando a página carrega
  onReady(() => {
    updateActiveSidebar(location.pathname);
  fixSidebarLinks();
    scrollToQueryIfAny();
  });
})();
