(function () {
    function init() {
        let index = [];
        const resultsDiv = document.getElementById('results');
        const searchBox = document.getElementById('searchBox');
        const meta = document.getElementById('meta');

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
                const meta = document.querySelector('meta[name="rhyla-base"]');
                if (meta && meta.getAttribute('content')) {
                    let base = meta.getAttribute('content');
                    if (!base.endsWith('/')) base += '/';
                    return base;
                }
            } catch (e) {}
            
            // Fallback para método antigo
            return (location.pathname.endsWith('/') ? location.pathname : location.pathname + '/');
        }
        
        const prefix = getPrefix();
        const candidates = [prefix + 'search_index.json', '/search_index.json'];

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
                    results.push({ route: page.route || '#', label: formatLabel(page), snippet: highlight(snippet, q) });
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
                // Corrigir URL para usar prefixo quando necessário
                let routeHref = r.route || '#';
                if (routeHref.startsWith('/') && prefix !== '/') {
                    routeHref = prefix + routeHref.replace(/^\/+/, '');
                }
                div.innerHTML = `<a href="${routeHref}">${r.label}</a><div class="snippet">… ${r.snippet} …</div>`;
                resultsDiv.appendChild(div);
            });
        }

        function debounce(fn, ms) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); }; }
        const onInput = debounce(e => search(e.target.value), 200);
        if (searchBox) searchBox.addEventListener('input', onInput);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();