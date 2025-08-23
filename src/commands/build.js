import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export default function build() {

  
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla-docs'); // Alterado para rhyla-docs para evitar conflito
  const distPath = path.join(root, 'dist');
  const templatesPath = path.join(__dirname, '../templates');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Folder "rhyla" not found. Please run "rhyla init" first.');
    process.exit(1);
  }

  // markdown-it will be instantiated after reading config so we can control html option

  // Limpar dist e recriar
  if (fs.existsSync(distPath)) fs.rmSync(distPath, { recursive: true });
  fs.mkdirSync(distPath);

  // Copiar estilos
  fs.mkdirSync(path.join(distPath, 'styles'), { recursive: true });
  fs.cpSync(path.join(rhylaPath, 'styles'), path.join(distPath, 'styles'), { recursive: true });

  // Copiar assets públicos do usuário (imagens, fontes, logo, etc.)
  const publicSrc = path.join(rhylaPath, 'public');
  const publicDst = path.join(distPath, 'public');
  if (fs.existsSync(publicSrc)) {
    fs.mkdirSync(publicDst, { recursive: true });
    fs.cpSync(publicSrc, publicDst, { recursive: true });
  }

  // Pasta de scripts agora é templates/scripts
  const scriptsSrc = path.join(templatesPath, 'scripts');
  const searchScript = path.join(scriptsSrc, 'generateSearchIndex.js');

  // Copiar scripts para o build (necessário para header-runtime.js em produção)
  const scriptsDst = path.join(distPath, 'scripts');
  if (fs.existsSync(scriptsSrc)) {
    fs.mkdirSync(scriptsDst, { recursive: true });
    fs.cpSync(scriptsSrc, scriptsDst, { recursive: true });
  }

  // Gerar índice de busca
  if (fs.existsSync(searchScript)) {
    console.log('🔍 Gerando índice de busca...');
    const res = spawnSync(process.execPath, [searchScript], { cwd: rhylaPath, stdio: 'inherit' });
    if (res.status !== 0) {
      console.warn('⚠️ Fail to generate search index. Continuing build without index.');
    }
  }

  // Copiar o JSON do índice também para a raiz do dist (compat)
  const searchJsonSrc = path.join(scriptsSrc, 'search_index.json');
  const searchJsonDst = path.join(distPath, 'search_index.json');
  if (fs.existsSync(searchJsonSrc)) {
    fs.copyFileSync(searchJsonSrc, searchJsonDst);
  }

  // Copiar config.json para dist e ler basePath se definido
  const cfgSrc = path.join(rhylaPath, 'config.json');
  const cfgDst = path.join(distPath, 'config.json');
  let basePath = '/';
  // Lista de ignorados configurável
  /** @type {string[]} */
  let buildIgnore = [];
  if (fs.existsSync(cfgSrc)) {
    fs.copyFileSync(cfgSrc, cfgDst);
    try {
      const cfgObj = JSON.parse(fs.readFileSync(cfgSrc, 'utf8'));
      if (cfgObj && typeof cfgObj.base === 'string' && cfgObj.base.trim()) {
        basePath = cfgObj.base.trim();
      }
      // Lê lista de arquivos/pastas a ignorar durante o build
      if (cfgObj && Array.isArray(cfgObj.build_ignore)) {
        buildIgnore = cfgObj.build_ignore.filter((s) => typeof s === 'string');
      }
    } catch (_) { /* ignore parse errors */ }
  }
  // Normaliza basePath
  if (!basePath.startsWith('/')) basePath = '/' + basePath;
  if (!basePath.endsWith('/')) basePath += '/';

  // Ler opção de segurança: permitir HTML cru em .md/.html por configuração
  let allowRawHtml = false;
  try {
    if (fs.existsSync(cfgSrc)) {
      const cfgObj = JSON.parse(fs.readFileSync(cfgSrc, 'utf8'));
      if (cfgObj && cfgObj.allow_raw_html === true) allowRawHtml = true;
    }
  } catch (_) { /* ignore */ }

  // Instancia markdown-it com html controlado (desabilita por padrão)
  const md = new markdownIt({ html: Boolean(allowRawHtml) });

  // Ler header/footer e notFound da pasta rhyla/body
  let header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  
  // Garantir que todos os caminhos de recursos usem o basePath correto
  header = header.replace(/href=["']\.\/styles\//g, `href="${basePath}styles/`)
              .replace(/src=["']\.\/public\//g, `src="${basePath}public/`)
              .replace(/href=["']\/styles\//g, `href="${basePath}styles/`)
              .replace(/src=["']\/public\//g, `src="${basePath}public/`)
              .replace(/src=["']\.\/scripts\//g, `src="${basePath}scripts/`)
              .replace(/src=["']\/scripts\//g, `src="${basePath}scripts/`);
  
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
  const notFoundTemplatePath = path.join(rhylaPath, 'body', 'notFound.html');
  const notFoundHTML = fs.existsSync(notFoundTemplatePath)
    ? fs.readFileSync(notFoundTemplatePath, 'utf8')
    : '<h1>404</h1>';

  const bodyPath = path.join(rhylaPath, 'body');

  // Excluídos fixos e padrões configuráveis de ignore (antes do primeiro uso)
  const EXCLUDE = new Set([
    'notfound.html', 'notfound.md', 'notfound.htm', 'notfound',
    'search.html', '.search.html', 'search.md', '.search.md', 
    // Arquivos a serem excluídos independentemente da pasta
    'page-generator.css', 'generatePages.js', 'generatepages.js',
    'header-runtime.js', 'search-runtime.js', 'search_runtime.js',
    'search_index.js', 'search_index.json', 'generateSearchIndex.js',
  ]);

  // Normaliza padrões de ignore vindos do config e adiciona defaults
  const defaultIgnore = ['kit_dev_rhyla'];
  const ignorePatterns = [...new Set([...defaultIgnore, ...buildIgnore])]
    .map((p) => p.replace(/^\/+|\/+$/g, '')) // remove barras extras
    .filter(Boolean)
    .map((p) => p.toLowerCase());

  function toPosix(relPath) {
    return relPath ? relPath.split(path.sep).join('/') : '';
  }

  // Transforma um padrão tipo 'a/b/*.md' em regex
  function patternToRegex(pat) {
    const escaped = pat
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$', 'i');
  }

  const ignoreRegexes = ignorePatterns
    .filter((p) => p.includes('*') || p.includes('/'))
    .map((p) => patternToRegex(p.endsWith('/*') ? p : p));

  const ignoreNames = new Set(
    ignorePatterns.filter((p) => !p.includes('/') && !p.includes('*'))
  );

  function shouldIgnore(itemName, itemRelPosix) {
    const nameLower = itemName.toLowerCase();
    const relLower = (itemRelPosix || '').toLowerCase();

    if (ignoreNames.has(nameLower)) return true;
    if (EXCLUDE.has(nameLower)) return true; // mantêm exclusões internas

    if (relLower) {
      // 1) Diretórios listados sem '*' devem ignorar tudo que esteja dentro
      for (const pat of ignorePatterns) {
        if (!pat.includes('*')) {
          const dirPat = pat.replace(/\/$/, '');
          if (relLower === dirPat || relLower.startsWith(dirPat + '/')) {
            return true;
          }
        }
      }

      // 2) Padrões com '*' ou caminhos específicos
      for (const rx of ignoreRegexes) {
        if (rx.test(relLower)) return true;
        // Se o padrão representa um diretório (termina com /*), já está coberto pelo regex acima
        // Para padrões de diretório sem '/*', ignorar tudo que comece com "dir/"
      }
    }
    return false;
  }

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
      var savedTheme = localStorage.getItem('rhyla-theme') || 'light';
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

  // Função para reescrever URLs para considerar o basePath
  function rewriteForBase(html, base) {
    if (!base || base === '/') return html;
    
    // Reescreve URLs absolutas para incluir o basePath
    // 1. src="/path" → src="/base/path"
    // 2. href="/path" → href="/base/path"
    // 3. url(/path) → url(/base/path) (em CSS inline)
    // Não reescreve URLs externas (http://, https://, //)
    return html.replace(
      /\s(src|href)=["'](?!(?:https?:|\/\/))\/([^"']+)["']/gi,
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

  // Gerar home como index.html (aceita home.md ou home.html)
  const homeMdPath = path.join(bodyPath, 'home.md');
  const homeHtmlPath = path.join(bodyPath, 'home.html');
  if (fs.existsSync(homeMdPath) || fs.existsSync(homeHtmlPath)) {
    const content = fs.existsSync(homeMdPath)
      ? md.render(fs.readFileSync(homeMdPath, 'utf8'))
      : fs.readFileSync(homeHtmlPath, 'utf8');
  const sidebar = generateSidebarHTML(bodyPath, null, 'home', { ignore: ignorePatterns });
    const pageHTML = rewriteForBase(headerInline + sidebar + `<main class=\"rhyla-main\">${content}</main>`, basePath);
    fs.writeFileSync(path.join(distPath, 'index.html'), pageHTML);
    // Alias home.html na raiz
    fs.writeFileSync(path.join(distPath, 'home.html'), pageHTML);
    // Alias /home/index.html para URLs limpas
    const homeDir = path.join(distPath, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'index.html'), pageHTML);
  } else {
  const sidebar = generateSidebarHTML(bodyPath, null, null, { ignore: ignorePatterns });
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      rewriteForBase(headerInline + sidebar + `<main class=\"rhyla-main\">${notFoundHTML}</main>`, basePath)
    );
  }


  // Função recursiva para gerar páginas a partir de rhyla/body (sem página de busca)
  function processDir(dir, relPath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      const itemRel = path.join(relPath, item.name);
      const itemRelPosix = toPosix(itemRel);

      console.log('itemPath:', itemPath);

      if (item.isDirectory()) {
        // Respeita a lista de ignorados (nomes/paths/padrões)
        if (shouldIgnore(item.name, itemRelPosix)) {
          console.log('Skipping directory (ignored):', itemRelPosix);
          continue;
        }
        console.log('Processing directory:', itemRelPosix);
        processDir(itemPath, itemRel);
        continue;
      }

      const lower = item.name.toLowerCase();
      if (!(item.name.endsWith('.md') || item.name.endsWith('.html'))) continue;
      // Respeita ignorados
      if (shouldIgnore(item.name, itemRelPosix)) continue;

      const topic = path.basename(item.name, path.extname(item.name));
      const group = relPath ? relPath.split(path.sep).join('/') : null;

      let content = '';
      if (item.name.endsWith('.md')) {
        content = md.render(fs.readFileSync(itemPath, 'utf8'));
      } else {
        content = fs.readFileSync(itemPath, 'utf8');
      }

      // Sanitize included raw HTML files unless allowRawHtml is true
      if (!allowRawHtml && item.name.endsWith('.html')) {
        // Very small sanitizer: remove <script> blocks and on* attributes
        content = content.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
        content = content.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      }

  const sidebar = generateSidebarHTML(bodyPath, group, topic, { ignore: ignorePatterns });

      const outDir = path.join(distPath, relPath);
      fs.mkdirSync(outDir, { recursive: true });

      const pageHTML = rewriteForBase(headerInline + sidebar + `<main class="rhyla-main">${content}</main>`, basePath);

      fs.writeFileSync(path.join(outDir, `${topic}.html`), pageHTML);

      if (!relPath) {
        const cleanDir = path.join(distPath, topic);
        fs.mkdirSync(cleanDir, { recursive: true });
        fs.writeFileSync(path.join(cleanDir, 'index.html'), pageHTML);
      }
    }
  }

  processDir(bodyPath);

  // 404 com sidebar
  const sidebar404 = generateSidebarHTML(bodyPath, null, null, { ignore: ignorePatterns });
  fs.writeFileSync(
    path.join(distPath, '404.html'),
    rewriteForBase(headerInline + sidebar404 + `<main class="rhyla-main">${notFoundHTML}</main>`, basePath)
  );

  console.log('✅ Build completed successfully.');
}
