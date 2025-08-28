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
        // Verifica e aplica o tema atual do localStorage
        function applyTheme() {
            const currentTheme = localStorage.getItem('rhyla-theme') || 'light';
            document.documentElement.setAttribute('data-theme', currentTheme);
        }
        
        // Aplica o tema imediatamente
        applyTheme();
        
        // Observa mudanças no localStorage para atualizar o tema
        window.addEventListener('storage', (event) => {
            if (event.key === 'rhyla-theme') {
                applyTheme();
            }
        });
        
        // Adiciona estilos CSS para melhorar a visualização dos resultados
        const styleEl = document.createElement('style');
        styleEl.textContent = `
            /* Melhorias no painel de busca */
            .rh-search-panel {
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
            }
            
            /* Estilo personalizado para o botão de fechar */
            #search-close {
                background: transparent;
                border: none;
                border-radius: 50%;
                color: var(--rh-muted, #6b7280);
                font-size: 18px;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                padding: 0;
                cursor: pointer;
            }
            
            #search-close:hover {
                background-color: rgba(0, 0, 0, 0.08);
                color: var(--rh-accent, #0066cc);
            }
            
            html[data-theme="dark"] #search-close:hover {
                background-color: rgba(255, 255, 255, 0.1);
                color: var(--rh-accent, #60a5fa);
            }
            
            .rh-search-input-wrap {
                border-bottom: 2px solid var(--rh-search-border-color, rgba(0, 0, 0, 0.1));
                padding: 16px 20px;
            }
            
            .rh-search-input-wrap input {
                font-size: 1.1em;
                padding: 8px 12px;
                transition: all 0.2s ease;
                border: none;
                background: transparent;
            }
            
            .rh-search-input-wrap input:focus {
                outline: none;
                box-shadow: none;
            }
            
            /* Melhorando a aparência do contador de resultados */
            .rh-search-meta {
                padding: 12px 20px;
                font-size: 0.9em;
                opacity: 0.7;
                border-bottom: 1px solid var(--rh-search-border-color, rgba(0, 0, 0, 0.1));
                font-style: italic;
                letter-spacing: 0.2px;
            }
            
            .rh-search-results {
                padding: 12px 20px;
                max-height: 50vh;
                overflow-y: auto;
                scrollbar-width: thin;
            }
            
            /* Estiliza o painel de busca com base nas variáveis de tema */
            .rh-search-panel {
                background-color: var(--rh-search-panel-bg, #ffffff);
                overflow: hidden; /* Garante que os cantos arredondados funcionem corretamente */
            }
            
            .rh-search-results .result {
                padding: 12px;
                margin-bottom: 14px;
                border-radius: 8px;
                background-color: var(--rh-search-result-bg, rgba(0, 0, 0, 0.05));
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                transition: transform 0.2s ease, box-shadow 0.2s ease;
            }
            
            .rh-search-results .result:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            
            .rh-search-results .result-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-weight: 600;
                font-size: 1.1em;
                margin-bottom: 8px;
                padding-bottom: 6px;
                color: var(--rh-search-title-color, inherit);
                border-bottom: 1px solid var(--rh-search-border-color, rgba(0, 0, 0, 0.1));
                text-decoration: none;
                position: relative;
            }
            
            .rh-search-results .result-title span {
                flex: 1;
            }
            
            .rh-search-results .result-title .result-arrow {
                font-size: 18px;
                opacity: 0;
                transform: translateX(-10px);
                transition: all 0.2s ease;
            }
            
            .rh-search-results .result:hover .result-title .result-arrow {
                opacity: 1;
                transform: translateX(0);
            }
            
            .rh-search-results .result-title:hover {
                color: var(--rh-search-title-hover, #0066cc);
            }
            
            .rh-search-results .snippet {
                font-size: 0.95em;
                opacity: 0.85;
                line-height: 1.4;
            }
            
            .rh-search-results .snippet mark {
                background-color: var(--rh-search-highlight-bg, rgba(255, 240, 0, 0.4));
                padding: 0 2px;
                border-radius: 2px;
            }
            
            .rh-search-results .no-results {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                text-align: center;
                opacity: 0.7;
            }
            
            .rh-search-results .no-results svg {
                margin-bottom: 16px;
                opacity: 0.6;
            }
            
            .rh-search-results .no-results p {
                font-size: 0.95em;
                line-height: 1.5;
            }
            
            /* Animações de entrada para os resultados */
            .rh-search-results .result {
                animation: fadeSlideIn 0.3s ease forwards;
                opacity: 0;
                transform: translateY(10px);
                animation-delay: var(--delay, 0s);
            }
            
            @keyframes fadeSlideIn {
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            /* Estilização dos scrollbars para os resultados */
            .rh-search-results::-webkit-scrollbar {
                width: 6px;
                background: var(--rh-search-scrollbar-bg, rgba(0, 0, 0, 0.05));
            }
            
            .rh-search-results::-webkit-scrollbar-thumb {
                background: var(--rh-search-scrollbar-thumb, rgba(0, 0, 0, 0.2));
                border-radius: 3px;
            }
            
            .rh-search-results::-webkit-scrollbar-thumb:hover {
                background: var(--rh-search-scrollbar-thumb-hover, rgba(0, 0, 0, 0.3));
            }
            
            /* Quando o tema escuro é ativado através de localStorage */
            html[data-theme="dark"] .rh-search-results .result {
                background-color: var(--rh-search-result-bg-dark, rgba(255, 255, 255, 0.08));
            }
            
            html[data-theme="dark"] .rh-search-results .result-title {
                border-bottom-color: var(--rh-search-border-color-dark, rgba(255, 255, 255, 0.1));
            }
            
            html[data-theme="dark"] .rh-search-results .result-title:hover {
                color: var(--rh-search-title-hover-dark, #66b0ff);
            }
            
            html[data-theme="dark"] .rh-search-results .snippet mark {
                background-color: var(--rh-search-highlight-bg-dark, rgba(255, 220, 0, 0.3));
                color: var(--rh-search-highlight-text-dark, inherit);
            }
            
            html[data-theme="dark"] .rh-search-results::-webkit-scrollbar {
                background: rgba(255, 255, 255, 0.05);
            }
            
            html[data-theme="dark"] .rh-search-results::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
            }
            
            html[data-theme="dark"] .rh-search-results::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.25);
            }
            
            /* Mantenha a compatibilidade com prefers-color-scheme para usuários sem JavaScript */
            @media (prefers-color-scheme: dark) {
                .rh-search-results .result {
                    background-color: var(--rh-search-result-bg-dark, rgba(255, 255, 255, 0.08));
                }
                
                .rh-search-results .result-title {
                    border-bottom-color: var(--rh-search-border-color-dark, rgba(255, 255, 255, 0.1));
                }
                
                .rh-search-results .result-title:hover {
                    color: var(--rh-search-title-hover-dark, #66b0ff);
                }
                
                .rh-search-results .snippet mark {
                    background-color: var(--rh-search-highlight-bg-dark, rgba(255, 220, 0, 0.3));
                    color: var(--rh-search-highlight-text-dark, inherit);
                }
                
                .rh-search-results::-webkit-scrollbar {
                    background: rgba(255, 255, 255, 0.05);
                }
                
                .rh-search-results::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                }
                
                .rh-search-results::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.25);
                }
            }
        `;
        document.head.appendChild(styleEl);
        
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
            if (!results.length) { 
                if (meta) meta.textContent = 'Nenhum resultado encontrado'; 
                
                // Mostra uma mensagem visualmente melhor quando não há resultados
                const noResults = document.createElement('div');
                noResults.className = 'no-results';
                noResults.innerHTML = `
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        <line x1="8" y1="11" x2="14" y2="11" stroke-width="1.5"></line>
                    </svg>
                    <p>No results found.<br>Try different search terms.</p>
                `;
                resultsDiv.appendChild(noResults);
                return; 
            }
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
                
                // Cria elementos do resultado com design melhorado
                const a = document.createElement('a');
                a.href = finalUrl;
                a.className = 'result-title';
                a.innerHTML = '<span>' + r.label + '</span>';
                
                // Cria um indicador visual para mostrar que o item é clicável
                const arrow = document.createElement('div');
                arrow.className = 'result-arrow';
                arrow.innerHTML = '→';
                a.appendChild(arrow);
                
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