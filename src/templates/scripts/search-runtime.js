(function () {
    // Função global para normalizar URLs - consistente com o resto do sistema
    function normalizeSearchUrl(href) {
        if (!href || href === '#') return href;
        
        // Primeiro normaliza o path removendo duplicações
        const urlObj = new URL(href, location.origin);
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
    
    function init() {
        let index = [];
        const resultsDiv = document.getElementById('search-results'); // Corrigindo para o ID correto
        const searchBox = document.getElementById('search-input');    // Corrigindo para o ID correto
        const meta = document.getElementById('search-meta');         // Corrigindo para o ID correto

        // Se já existir índice em memória (build), usa como fallback imediato
        if (Array.isArray(window.__SEARCH_INDEX__)) {
            index = window.__SEARCH_INDEX__;
            if (meta) meta.textContent = index.length ? `${index.length} pages indexed` : 'No pages indexed';
        } else if (meta) {
            meta.innerHTML = 'Loading index<span class="dots"></span>';
        }

        // Tenta obter o prefixo a partir da meta tag rhyla-base
        function getPrefix() {
            try {
                // 1. Verificar meta tag rhyla-base
                const meta = document.querySelector('meta[name="rhyla-base"]');
                if (meta && meta.getAttribute('content')) {
                    let base = meta.getAttribute('content');
                    if (!base.endsWith('/')) base += '/';
                    return base;
                }
                
                // 2. Verificar se existe uma variável global definida pelo header-runtime
                if (typeof window !== 'undefined' && window.__rhyla_prefix__) {
                    return window.__rhyla_prefix__;
                }
            } catch (e) {}
            
            // Fallback para método antigo - determina base pelo caminho atual
            return (location.pathname.endsWith('/') ? location.pathname : location.pathname + '/');
        }
        
        const prefix = getPrefix();
        console.log('Prefix detectado para busca:', prefix);
        
        // Primeiro tenta buscar pelo prefixo, depois tenta na raiz
        const candidates = [
            prefix + 'search_index.json', 
            '/search_index.json'
        ];

        (async () => {
            for (const url of candidates) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    index = Array.isArray(data) ? data : [];
                    if (meta) meta.textContent = index.length ? `${index.length} pages indexed` : 'No pages indexed';
                    break;
                } catch (_) { /* tenta próxima URL */ }
            }
            if (!index.length && !Array.isArray(window.__SEARCH_INDEX__) && meta) {
                meta.textContent = 'Failed to load index';
            }
        })();

        function highlight(text, query) {
            const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp('(' + esc + ')', 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        }

        function formatLabel(page) {
            if (page.title && page.title.trim()) return page.title;
            return (page.route || '').replace(/^\//, '') || 'Untitled';
        }

        function search(query) {
            const q = query.trim();
            if (!q) { if (resultsDiv) resultsDiv.innerHTML = ''; if (meta) meta.textContent = index.length ? `${index.length} pages indexed` : 'No pages indexed'; return; }
            const results = [];
            const ql = q.toLowerCase();
            index.forEach(page => {
                if (!page || !page.content) return;
                const hay = String(page.content).toLowerCase();
                const matchIndex = hay.indexOf(ql);
                if (matchIndex !== -1) {
                    const snippetRaw = String(page.content);
                    const start = Math.max(0, matchIndex - 40);
                    const end = Math.min(snippetRaw.length, matchIndex + 40);
                    const snippet = snippetRaw.slice(start, end);
                    
                    // Normaliza a rota para evitar problemas
                    let route = page.route || '#';
                    
                    // Converte rotas absolutas para relativas se for o caso
                    if (route.startsWith('/')) {
                        // Remove barras duplicadas e limpa o caminho
                        route = '/' + route.split('/').filter(Boolean).join('/');
                    }
                    
                    results.push({ 
                        route: route, 
                        label: formatLabel(page), 
                        snippet: highlight(snippet, q) 
                    });
                }
            });
            displayResults(results);
        }

        function displayResults(results) {
            if (!resultsDiv) return;
            resultsDiv.innerHTML = '';
            if (!results.length) { if (meta) meta.textContent = 'Nenhum resultado encontrado'; return; }
            if (meta) meta.textContent = `${results.length} resultado(s)`;
            results.forEach((r, i) => {
                const div = document.createElement('div');
                div.className = 'result';
                div.style.setProperty('--delay', (i * 0.02) + 's');
                // Corrigir URL para usar prefixo e normalizar duplicações
                let routeHref = r.route || '#';
                
                // Função para normalizar caminhos e evitar duplicações
                function normalizeUrl(href) {
                    if (!href || href === '#') return href;
                    
                    // 1. Normalizar prefixo
                    let result = href;
                    
                    // 2. Normalizar caminhos duplicados (ex: guide/guide/file.html -> guide/file.html)
                    const parts = result.split('/').filter(Boolean);
                    const dedupedParts = [];
                    
                    for (let i = 0; i < parts.length; i++) {
                        if (i < parts.length - 1 && parts[i] === parts[i+1]) {
                            continue; // Pula duplicações consecutivas
                        }
                        dedupedParts.push(parts[i]);
                    }
                    
                    result = '/' + dedupedParts.join('/');
                    
                    // Verifica se já tem o prefixo para não duplicar
                    if (prefix && prefix !== '/') {
                        const cleanPrefix = prefix.replace(/^\/|\/$/g, '');
                        const prefixPattern = new RegExp(`^\\/?${cleanPrefix}\\/`, 'i');
                        
                        if (!prefixPattern.test(result)) {
                            result = prefix + result.replace(/^\/+/, '');
                        }
                    }
                    
                    return result;
                }
                
                routeHref = normalizeUrl(routeHref);
                div.innerHTML = `<a href="${routeHref}">${r.label}</a><div class="snippet">… ${r.snippet} …</div>`;
                resultsDiv.appendChild(div);
            });
        }

        function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); }; }
        const onInput = debounce(e => search(e.target.value), 200);
        if (searchBox) searchBox.addEventListener('input', onInput);
        
        // Configurar interações do overlay de busca, caso ainda não tenha sido configurado pelo header-runtime
        const overlay = document.getElementById('search-overlay');
        const openBtn = document.getElementById('search-open');
        const closeBtn = document.getElementById('search-close');
        
        function openOverlay() {
            if (!overlay) return;
            overlay.classList.add('open');
            overlay.setAttribute('aria-hidden', 'false');
            if (searchBox) {
                searchBox.value = '';
                setTimeout(() => searchBox.focus(), 50);
            }
        }
        
        function closeOverlay() {
            if (!overlay) return;
            overlay.classList.remove('open');
            overlay.setAttribute('aria-hidden', 'true');
            if (searchBox) searchBox.blur();
        }
        
        // Configurar eventos apenas se não tiverem sido configurados pelo header-runtime
        if (openBtn && !openBtn.hasSearchEventListener) {
            openBtn.addEventListener('click', openOverlay);
            openBtn.hasSearchEventListener = true;
        }
        
        if (closeBtn && !closeBtn.hasSearchEventListener) {
            closeBtn.addEventListener('click', closeOverlay);
            closeBtn.hasSearchEventListener = true;
        }
        
        if (overlay && !overlay.hasSearchEventListener) {
            const backdrop = overlay.querySelector('.rh-search-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', closeOverlay);
            }
            overlay.hasSearchEventListener = true;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();