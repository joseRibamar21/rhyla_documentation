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

        // Função para extrair uma âncora de texto para rolagem
        function extractAnchorFromText(text, query) {
            // Procura por cabeçalhos no texto que contenham a consulta
            const headingRegex = /#{1,6}\s+(.*?)\s*(?:\n|$)/g;
            const headings = [];
            let match;
            
            // Normaliza para comparação insensível a acentos e maiúsculas
            function normalizeText(s) {
                return String(s || '').normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase();
            }
            
            // Função para criar um ID de âncora do texto do cabeçalho (mesma lógica usada no header-runtime.js)
            function slugify(text) {
                return String(text || '')
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-');
            }
            
            const normalizedQuery = normalizeText(query);
            
            // Extrai todos os cabeçalhos do texto
            while ((match = headingRegex.exec(text)) !== null) {
                const headingText = match[1];
                const normalizedHeading = normalizeText(headingText);
                
                if (normalizedHeading.includes(normalizedQuery)) {
                    // Usa a mesma função de slugify do header-runtime para compatibilidade
                    const anchor = slugify(headingText);
                    headings.push(anchor);
                }
            }
            
            // Procura também por cabeçalhos em HTML (h1-h6) com o texto
            const htmlHeadingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
            while ((match = htmlHeadingRegex.exec(text)) !== null) {
                const headingText = match[2].replace(/<[^>]+>/g, ''); // Remove tags HTML internas
                const normalizedHeading = normalizeText(headingText);
                
                if (normalizedHeading.includes(normalizedQuery)) {
                    const anchor = slugify(headingText);
                    headings.push(anchor);
                }
            }
            
            // Retorna a primeira âncora encontrada ou vazio
            return headings.length > 0 ? headings[0] : '';
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
                    // Extrai trecho para exibição
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
                    
                    // Tenta encontrar uma âncora para rolagem
                    const headingId = extractAnchorFromText(page.content, q);
                    
                    // Cria um objeto de resultado enriquecido com informações para rolagem
                    const resultItem = { 
                        route: route, 
                        label: formatLabel(page), 
                        snippet: highlight(snippet, q),
                        matchText: q  // Sempre inclui o texto da busca para rolagem
                    };
                    
                    // Adiciona ID de cabeçalho se encontrou
                    if (headingId) {
                        resultItem.headingId = headingId;
                    }
                    
                    results.push(resultItem);
                }
            });
            displayResults(results);
        }

        function displayResults(results) {
            if (!resultsDiv) return;
            resultsDiv.innerHTML = '';
            if (!results.length) { if (meta) meta.textContent = 'Nenhum resultado encontrado'; return; }
            if (meta) meta.textContent = `${results.length} resultado(s)`;
            
            // Função para normalizar caminhos e evitar duplicações
            function normalizeUrl(href) {
                if (!href || href === '#') return href;
                
                // 1. Normalizar prefixo
                let result = href;
                
                // 2. Normalizar caminhos duplicados (ex: guide/guide/file.html -> guide/file.html)
                const urlParts = href.split('#'); // Preserva o fragmento/âncora
                const pathPart = urlParts[0];
                const fragmentPart = urlParts.length > 1 ? '#' + urlParts[1] : '';
                
                // Divide somente o caminho para deduplicar
                const queryPartMatch = pathPart.match(/^([^?]*)(\?.*)$/);
                const queryPart = queryPartMatch ? queryPartMatch[2] : '';
                const cleanPath = queryPartMatch ? queryPartMatch[1] : pathPart;
                
                const parts = cleanPath.split('/').filter(Boolean);
                const dedupedParts = [];
                
                for (let i = 0; i < parts.length; i++) {
                    if (i < parts.length - 1 && parts[i] === parts[i+1]) {
                        continue; // Pula duplicações consecutivas
                    }
                    dedupedParts.push(parts[i]);
                }
                
                result = '/' + dedupedParts.join('/') + queryPart + fragmentPart;
                
                // Verifica se já tem o prefixo para não duplicar
                if (prefix && prefix !== '/') {
                    const cleanPrefix = prefix.replace(/^\/|\/$/g, '');
                    const prefixPattern = new RegExp(`^\\/?${cleanPrefix}\\/`, 'i');
                    
                    if (!prefixPattern.test(result)) {
                        const resultWithoutPrefix = result.replace(/^\/+/, '');
                        result = prefix + resultWithoutPrefix;
                    }
                }
                
                return result;
            }
            
            results.forEach((r, i) => {
                const div = document.createElement('div');
                div.className = 'result';
                div.style.setProperty('--delay', (i * 0.02) + 's');
                
                // Prepara a URL base para a navegação
                let routeHref = r.route || '#';
                
                // Adiciona .html à rota se não for a home (/) e não tiver extensão ou fragmento
                if (routeHref !== '/' && !routeHref.includes('.') && !routeHref.includes('#')) {
                    routeHref = routeHref + '.html';
                }
                
                // Adiciona fragmento ou query string conforme disponibilidade
                if (r.headingId) {
                    // Se temos um ID de cabeçalho específico, adiciona como fragmento
                    if (!routeHref.includes('#')) {
                        routeHref = routeHref + '#' + r.headingId;
                    }
                } else if (r.matchText) {
                    // Se não temos cabeçalho mas temos texto para buscar, usa query string
                    const hasQueryChar = routeHref.includes('?');
                    const queryPrefix = hasQueryChar ? '&' : '?';
                    routeHref = routeHref + queryPrefix + 'query=' + encodeURIComponent(r.matchText);
                }
                
                // Normaliza a URL final para evitar duplicações de caminhos
                const finalUrl = normalizeUrl(routeHref);
                
                // Cria elementos do resultado
                const a = document.createElement('a');
                a.href = finalUrl;
                a.textContent = r.label;
                
                const snippet = document.createElement('div');
                snippet.className = 'snippet';
                snippet.innerHTML = '… ' + r.snippet + ' …';
                
                div.appendChild(a);
                div.appendChild(snippet);
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