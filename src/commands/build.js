import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSidebarHTML } from '../utils/sidebar.js';
import { DOCS_DIR, loadConfig } from '../core/config.js';
import { createIgnoreMatcher } from '../core/ignore.js';
import { createMarkdown, sanitizeHtml } from '../core/content.js';
import { collectPages } from '../core/pages.js';
import { buildSearchIndex, buildLlmsTxt, buildLlmsFullTxt } from '../core/artifacts.js';
import { applyPageMeta, assemblePage } from '../core/layout.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pastas sempre ignoradas no build (kit de desenvolvimento só faz sentido no `rhyla dev`)
const DEFAULT_IGNORE = ['kit_dev_rhyla'];

/**
 * Gera o site estático em dist/.
 * @param {{ cwd?: string, quiet?: boolean }} opts
 * @returns {{ distPath: string, pages: number }}
 */
export default function build(opts = {}) {
  const root = opts.cwd || process.cwd();
  const rhylaPath = path.join(root, DOCS_DIR);
  const distPath = path.join(root, 'dist');
  const templatesPath = path.join(__dirname, '../templates');
  const log = opts.quiet ? () => {} : console.log;

  if (!fs.existsSync(rhylaPath)) {
    throw new Error(`Folder "${DOCS_DIR}" not found. Run "rhyla init" first.`);
  }

  const config = loadConfig(rhylaPath);
  const basePath = config.base;
  const siteUrl = config.siteUrl;
  const allowRawHtml = config.allowRawHtml;
  const ignorePatterns = [...new Set([...DEFAULT_IGNORE, ...config.buildIgnore])];
  const isIgnored = createIgnoreMatcher(ignorePatterns);
  const md = createMarkdown({ allowRawHtml });

  // Limpar dist e recriar
  if (fs.existsSync(distPath)) fs.rmSync(distPath, { recursive: true });
  fs.mkdirSync(distPath);

  // Copiar estilos
  fs.mkdirSync(path.join(distPath, 'styles'), { recursive: true });
  fs.cpSync(path.join(rhylaPath, 'styles'), path.join(distPath, 'styles'), { recursive: true });

  // Copiar assets públicos do usuário (imagens, fontes, logo, etc.)
  const publicSrc = path.join(rhylaPath, 'public');
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, path.join(distPath, 'public'), { recursive: true });
  }

  // Copiar scripts de runtime do navegador
  const scriptsSrc = path.join(templatesPath, 'scripts');
  const scriptsDst = path.join(distPath, 'scripts');
  fs.cpSync(scriptsSrc, scriptsDst, { recursive: true });

  // Copiar config.json (lido pelo header-runtime no navegador)
  if (fs.existsSync(config.file)) fs.copyFileSync(config.file, path.join(distPath, 'config.json'));

  // Ler header e ajustar caminhos de recursos para o basePath
  let header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  
  // Garantir que todos os caminhos de recursos usem o basePath correto
  // Caminhos relativos viram absolutos; o prefixo do basePath é aplicado uma única vez em rewriteForBase
  header = header.replace(/href=["']\.\/styles\//g, 'href="/styles/')
              .replace(/src=["']\.\/public\//g, 'src="/public/')
              .replace(/src=["']\.\/scripts\//g, 'src="/scripts/');
  
  // Garantir que os links CSS tenham IDs para que possam ser manipulados via script
  if (!/id=["']theme-style["']/i.test(header)) {
    header = header.replace(/(<link[^>]*href=["'][^"']*\/light\.css["'][^>]*)/i, '$1 id="theme-style"');
  }
  
  // Injeta meta com base configurada (usado pelo prefix writer do header)
  if (!/meta\s+name=["']rhyla-base["']/i.test(header)) {
    const metaTag = `\n  <meta name="rhyla-base" content="${basePath}">\n`;
    if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(header)) {
      header = header.replace(/(<meta[^>]+name=["']viewport["'][^>]*>)/i, `$1${metaTag}`);
    } else if (/<head[^>]*>/i.test(header)) {
      header = header.replace(/<head[^>]*>/i, (m) => m + metaTag);
    }
  }
  // Garante uma meta robots padrão caso o usuário não tenha incluído (index,follow)
  if (!/meta\s+name=["']robots["']/i.test(header)) {
    const robotsMeta = `\n  <meta name="robots" content="index,follow">\n`;
    if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(header)) {
      header = header.replace(/(<meta[^>]+name=["']viewport["'][^>]*>)/i, `$1${robotsMeta}`);
    } else if (/<head[^>]*>/i.test(header)) {
      header = header.replace(/<head[^>]*>/i, (m) => m + robotsMeta);
    }
  }

  const bodyPath = path.join(rhylaPath, 'body');
  const notFoundPath = path.join(bodyPath, 'notFound.html');
  const notFoundHTML = fs.existsSync(notFoundPath)
    ? (allowRawHtml ? fs.readFileSync(notFoundPath, 'utf8') : sanitizeHtml(fs.readFileSync(notFoundPath, 'utf8')))
    : '<h1>404</h1>';

  function withInlineHeaderRuntime(html) {
    try {
      // Criar script que resolve problemas de CSS em todas as páginas
      const cssFixScript = `
<script>
(function(){
  // Importante: executar antes de qualquer renderização para evitar FOUC
  function fixCssPathsImmediately() {
    try {
      // 1. Determinar o prefixo base correto
      var base = "${basePath}";
      if (typeof window !== 'undefined') {
        // Para URLs limpas e navegação em subdiretórios
        var pathname = window.location.pathname;
        var depth = 0;
        
        // Se não estamos na home, calculamos a profundidade para ajustar caminhos relativos
        if (pathname && pathname !== '/' && !pathname.endsWith('index.html')) {
          depth = pathname.split('/').filter(Boolean).length;
        }

        // Armazenar prefixo para outros scripts
        window.__rhyla_prefix__ = base;
      }

      // 2. Consertar todos os links CSS imediatamente
      var links = document.querySelectorAll('link[rel="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        var href = links[i].getAttribute('href');
        // Caminhos já com o prefixo (ou externos) estão corretos
        if (!href || href.indexOf(base) === 0 || /^(https?:)?\/\//.test(href)) continue;
        // Substituir links relativos ou absolutos incompletos pelo prefixo correto
        if (href) {
          // Primeiro, remover qualquer prefixo atual
          href = href.replace(/^\\/+/, '').replace(/^styles\\//, 'styles/');
          
          // Depois, verificar se é um caminho para CSS
          if (href.indexOf('styles/') === 0 || href.endsWith('.css')) {
            // Garantir que comece com /styles/ se for um CSS em styles/
            if (href.indexOf('styles/') === 0) {
              links[i].href = base + href;
            } else {
              // Outros CSS também recebem caminho absoluto
              links[i].href = base + href;
            }
          }
        }
      }
      
      // 3. Garantir que o tema seja preservado
      var savedTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('rhyla-theme') || 'light';
      var themeLink = document.getElementById('theme-style');
      if (themeLink) {
        themeLink.href = base + 'styles/' + savedTheme + '.css';
      }
    } catch (e) {
      console.error('Erro ao ajustar caminhos CSS:', e);
    }
  }
  
  // Executar imediatamente para evitar flash de conteúdo sem estilo
  fixCssPathsImmediately();
  
  // Estabelecer variáveis globais para outros scripts
  window.__rhyla_prefix__ = "${basePath}";
  
  // Também executar após carregamento para garantir que tudo esteja correto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixCssPathsImmediately);
  } else {
    setTimeout(fixCssPathsImmediately, 0);
  }
})();
</script>`;

      // Verificar e incorporar o runtime
      let processedHtml = html;
      
      // Caminho para os scripts runtime
      const headerRuntimePath = path.join(templatesPath, 'scripts', 'header-runtime.js');
      const searchRuntimePath = path.join(templatesPath, 'scripts', 'search-runtime.js');
      
      // Incorporar header-runtime.js se existir
      if (fs.existsSync(headerRuntimePath)) {
        const headerRuntimeContent = fs.readFileSync(headerRuntimePath, 'utf8')
                                      .replace(/<\/script>/gi, '<\\/script>');
        
        // Substituir referência externa pelo código inline
        processedHtml = processedHtml.replace(
          /<script[^>]*src=["'](?:\/?|[^"']*)scripts\/header-runtime\.js["'][^>]*><\/script>/i, 
          `<script>\n${headerRuntimeContent}\n</script>`
        );
      }
      
      // Incorporar search-runtime.js se existir
      if (fs.existsSync(searchRuntimePath)) {
        const searchRuntimeContent = fs.readFileSync(searchRuntimePath, 'utf8')
                                      .replace(/<\/script>/gi, '<\\/script>');
        
        // Substituir referência externa pelo código inline
        processedHtml = processedHtml.replace(
          /<script[^>]*src=["'](?:\/?|[^"']*)scripts\/search-runtime\.js["'][^>]*><\/script>/i, 
          `<script>\n${searchRuntimeContent}\n</script>`
        );
      }
      
      // Adicionar o script de correção de CSS antes do fechamento do head
      processedHtml = processedHtml.replace(/<\/head>/i, `${cssFixScript}\n</head>`);
      
      return processedHtml;
    } catch {
      return html;
    }
  }

  const headerInline = withInlineHeaderRuntime(header);

  // Util para injetar canonical/meta por página
  function injectCanonical(html, canonicalUrl) {
    try {
      let out = html;
      if (canonicalUrl && !/rel=["']canonical["']/i.test(out)) {
        out = out.replace(/<\/head>/i, `  <link rel="canonical" href="${canonicalUrl}" />\n</head>`);
      }
      if (!/meta\s+name=["']robots["']/i.test(out)) {
        out = out.replace(/<\/head>/i, `  <meta name="robots" content="index,follow" />\n</head>`);
      }
      return out;
    } catch { return html; }
  }

  // Normaliza siteUrl/base para montar URLs absolutas
  function getBaseUrl() {
    if (!siteUrl) return null;
    let s = siteUrl.replace(/\/$/, '');
    let b = basePath;
    if (!b.startsWith('/')) b = '/' + b;
    if (!b.endsWith('/')) b += '/';
    return s + b; // ex.: https://docs.ex.com + /docs/ → https://docs.ex.com/docs/
  }
  const absoluteBaseUrl = getBaseUrl();

  // Função para reescrever URLs para considerar o basePath
  function rewriteForBase(html, base) {
    if (!base || base === '/') return html;
    
    // Reescreve URLs absolutas para incluir o basePath
    // 1. src="/path" → src="/base/path"
    // 2. href="/path" → href="/base/path"
    // 3. url(/path) → url(/base/path) (em CSS inline)
    // Não reescreve URLs externas (http://, https://, //)
    return html.replace(
      /\s(src|href)=["'](?!(?:https?:|\/\/))\/([^"']*)["']/gi,
      function(match, attr, path) {
        const cleanBase = base.replace(/^\/|\/$/g, '');
        return ` ${attr}="/${cleanBase}/${path}"`;
      }
    ).replace(
      /(url\s*\(\s*["']?)(?!(?:https?:|\/\/))(\/[^"')]+)(['"]?\s*\))/gi,
      function(match, pre, path, post) {
        const cleanBase = base.replace(/^\/|\/$/g, '');
        return `${pre}/${cleanBase}${path}${post}`;
      }
    );
  }

  // URL absoluta (se site_url existir) ou relativa ao basePath, para llms.txt
  const urlFor = (rel) => (absoluteBaseUrl || basePath) + rel.replace(/^\//, '');

  const writeFile = (rel, content) => {
    const out = path.join(distPath, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content, 'utf8');
  };

  const pages = collectPages(bodyPath, { md, allowRawHtml, isIgnored });
  // Caminhos relativos com .html, para o sitemap
  const sitemapPaths = [];

  for (const page of pages) {
    const markdownRel = page.markdown !== null ? (page.isHome ? 'index.md' : `${page.slug}.md`) : null;
    const pageHeader = applyPageMeta(headerInline, {
      pageTitle: page.isHome ? '' : page.title,
      siteTitle: config.title,
      description: page.description || (page.isHome ? config.description : ''),
      markdownHref: markdownRel ? '/' + markdownRel : null,
    });
    const sidebar = page.isHome
      ? generateSidebarHTML(bodyPath, null, 'home', { ignore: ignorePatterns })
      : generateSidebarHTML(bodyPath, page.group || null, page.name, { ignore: ignorePatterns });
    const html = rewriteForBase(assemblePage(pageHeader, sidebar, page.html), basePath);

    if (page.isHome) {
      const homeHtml = injectCanonical(html, absoluteBaseUrl);
      writeFile('index.html', homeHtml);
      // Aliases: /home.html e /home/ (URLs limpas)
      writeFile('home.html', homeHtml);
      writeFile('home/index.html', homeHtml);
      sitemapPaths.push('index.html');
    } else {
      const rel = `${page.slug}.html`;
      writeFile(rel, injectCanonical(html, absoluteBaseUrl ? absoluteBaseUrl + rel : null));
      sitemapPaths.push(rel);
      // Se existir uma pasta com o mesmo nome (ex.: guide.md + guide/), /guide/ também abre a página
      if (fs.existsSync(path.join(bodyPath, page.slug))) {
        writeFile(`${page.slug}/index.html`, injectCanonical(html, absoluteBaseUrl ? absoluteBaseUrl + rel : null));
      }
    }

    // Versão markdown da página, para agentes de IA e ferramentas
    if (markdownRel) writeFile(markdownRel, page.markdown);
  }

  if (!pages.some((p) => p.isHome)) {
    const sidebar = generateSidebarHTML(bodyPath, null, null, { ignore: ignorePatterns });
    writeFile('index.html', injectCanonical(
      rewriteForBase(assemblePage(applyPageMeta(headerInline, { siteTitle: config.title }), sidebar, notFoundHTML), basePath),
      absoluteBaseUrl
    ));
    sitemapPaths.push('index.html');
  }

  // 404 com sidebar
  const sidebar404 = generateSidebarHTML(bodyPath, null, null, { ignore: ignorePatterns });
  writeFile('404.html', rewriteForBase(
    assemblePage(applyPageMeta(headerInline, { pageTitle: 'Not found', siteTitle: config.title }), sidebar404, notFoundHTML),
    basePath
  ));

  // Índice de busca (consumido pelo search-runtime no navegador)
  const searchIndex = buildSearchIndex(pages);
  writeFile('search_index.json', JSON.stringify(searchIndex));
  writeFile('scripts/search_index.json', JSON.stringify(searchIndex));
  writeFile('scripts/search_index.js', `window.__SEARCH_INDEX__ = ${JSON.stringify(searchIndex)};`);

  // llms.txt + llms-full.txt (https://llmstxt.org)
  const llmsOptions = { title: config.title, description: config.description, urlFor };
  writeFile('llms.txt', buildLlmsTxt(pages, llmsOptions));
  writeFile('llms-full.txt', buildLlmsFullTxt(pages, llmsOptions));

  // sitemap.xml e robots.txt (precisam de site_url)
  if (absoluteBaseUrl) {
    const today = new Date().toISOString().split('T')[0];
    const entries = sitemapPaths.sort().map((rel) =>
      `  <url>\n    <loc>${absoluteBaseUrl + rel}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${rel === 'index.html' ? '1.0' : '0.5'}</priority>\n  </url>`
    ).join('\n');
    writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`);
    writeFile('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${absoluteBaseUrl}sitemap.xml\n`);
  } else {
    log(`ℹ️  site_url missing in ${DOCS_DIR}/config.json. Set "site_url" to generate sitemap.xml, robots.txt and absolute URLs.`);
  }

  log(`✅ Build completed: ${pages.length} pages → dist/ (search index, llms.txt, llms-full.txt, .md sources)`);
  return { distPath, pages: pages.length };
}
