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
  const rhylaPath = path.join(root, 'rhyla');
  const distPath = path.join(root, 'dist');
  // Corrige para src/templates (relativo a src/commands)
  const templatesPath = path.join(__dirname, '../templates');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Folder "rhyla" not found. Please run "rhyla init" first.');
    process.exit(1);
  }

  const md = new markdownIt();

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

  // Copiar config.json para dist, para o header funcionar no build estático
  const cfgSrc = path.join(rhylaPath, 'config.json');
  const cfgDst = path.join(distPath, 'config.json');
  if (fs.existsSync(cfgSrc)) {
    fs.copyFileSync(cfgSrc, cfgDst);
  }

  // Ler header/footer e notFound da pasta rhyla/body
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const notFoundTemplatePath = path.join(rhylaPath, 'body', 'notFound.html');
  const notFoundHTML = fs.existsSync(notFoundTemplatePath)
    ? fs.readFileSync(notFoundTemplatePath, 'utf8')
    : '<h1>404</h1>';

  const bodyPath = path.join(rhylaPath, 'body');

  function withInlineHeaderRuntime(html) {
    try {
      const runtimePath = path.join(templatesPath, 'scripts', 'header-runtime.js');
      if (!fs.existsSync(runtimePath)) return html;
      const runtime = fs.readFileSync(runtimePath, 'utf8');
      return html.replace(
        /<script\s+src=["']\/scripts\/header-runtime\.js["']><\/script>/i,
        `<script>\n${runtime}\n<\/script>`
      );
    } catch { return html; }
  }

  const headerInline = withInlineHeaderRuntime(header);

  // Gerar home como index.html
  const homePath = path.join(bodyPath, 'home.md');
  if (fs.existsSync(homePath)) {
    const content = md.render(fs.readFileSync(homePath, 'utf8'));
    const sidebar = generateSidebarHTML(bodyPath, null, 'home');
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      headerInline + sidebar + `<main class=\"rhyla-main\">${content}</main>`
    );
  } else {
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      headerInline + sidebar + `<main class=\"rhyla-main\">${notFoundHTML}</main>`
    );
  }

  const EXCLUDE = new Set([
    'home.md', 'home.html',
    'notfound.html', 'notfound.md', 'notfound.htm', 'notfound',
    'search.html', '.search.html', 'search.md', '.search.md'
  ]);

  // Função recursiva para gerar páginas
  function processDir(dir, relPath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      const itemRel = path.join(relPath, item.name);

      if (item.isDirectory()) {
        processDir(itemPath, itemRel);
        continue;
      }

      const lower = item.name.toLowerCase();
      if (!(item.name.endsWith('.md') || item.name.endsWith('.html'))) continue;
      if (EXCLUDE.has(lower)) continue;

      const topic = path.basename(item.name, path.extname(item.name));
      // group = caminho relativo completo do diretório (para suportar subpastas aninhadas)
      const group = relPath ? relPath.split(path.sep).join('/') : null;

      let content = '';
      if (item.name.endsWith('.md')) {
        content = md.render(fs.readFileSync(itemPath, 'utf8'));
      } else {
        content = fs.readFileSync(itemPath, 'utf8');
      }

      const sidebar = generateSidebarHTML(bodyPath, group, topic);

      const outDir = path.join(distPath, relPath);
      fs.mkdirSync(outDir, { recursive: true });

  const pageHTML = headerInline + sidebar + `<main class="rhyla-main">${content}</main>`;

      // Salva como topic.html (mantém padrão de links existentes)
      fs.writeFileSync(path.join(outDir, `${topic}.html`), pageHTML);

      // Se estiver no nível raiz (relPath === '') gerar também /topic/index.html para URL limpa /topic/
      if (!relPath) {
        const cleanDir = path.join(distPath, topic);
        fs.mkdirSync(cleanDir, { recursive: true });
        fs.writeFileSync(path.join(cleanDir, 'index.html'), pageHTML);
      }
    }
  }

  processDir(bodyPath);

  // Página de busca (suporta search.html e .search.html)
  const searchVisible = path.join(bodyPath, 'search.html');
  const searchHidden = path.join(bodyPath, '.search.html');
  const searchPage = fs.existsSync(searchVisible)
    ? searchVisible
    : (fs.existsSync(searchHidden) ? searchHidden : null);

  if (searchPage) {
    let content = fs.readFileSync(searchPage, 'utf8');
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    const outDir = path.join(distPath, 'search');
    fs.mkdirSync(outDir, { recursive: true });

    // Copiar índices para dentro de dist/search
    const searchIndexJsonSrc = path.join(scriptsSrc, 'search_index.json');
    const searchIndexJsSrc = path.join(scriptsSrc, 'search_index.js');
    if (fs.existsSync(searchIndexJsonSrc)) {
      fs.copyFileSync(searchIndexJsonSrc, path.join(outDir, 'search_index.json'));
    }
    if (fs.existsSync(searchIndexJsSrc)) {
      fs.copyFileSync(searchIndexJsSrc, path.join(outDir, 'search_index.js'));
    }

    // Manter apenas conteúdo do body + estilos, evitando HTML/HEAD/BODY aninhado
    const styleTags = [];
    content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) => { styleTags.push(m); return ''; });
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let pageInner = bodyMatch ? bodyMatch[1] : content;
    let normalized = `${styleTags.join('\n')}\n${pageInner}`;


    const inlineMatch = normalized.match(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/i);
    const externalTagRe = /<script\s+src=["']\s*\/scripts\/search[-_]runtime\.js\s*["']\s*><\/script>/i;
    const hasExternal = externalTagRe.test(normalized);

    if (inlineMatch) {
      let scriptCode = inlineMatch[1];
      const urlPrelude = `const __basePath = (location.pathname.endsWith('/') ? location.pathname : location.pathname + '/');\nconst __searchIndexUrl = __basePath + 'search_index.json';\n`;
      scriptCode = scriptCode
        .replace(/fetch\(\s*(['"])\.?\/??search_index\.json\1\s*\)/g, 'fetch(__searchIndexUrl)')
        .replace(/fetch\(\s*(['"])\/search_index\.json\1\s*\)/g, 'fetch(__searchIndexUrl)')
        .replace(/fetch\(\s*(['"])\/search\/search_index\.json\1\s*\)/g, 'fetch(__searchIndexUrl)');
      scriptCode = scriptCode.replace(
        /(const\s+meta\s*=\s*document\.getElementById\(['"]meta['"]\)\s*;?)/,
        `$1\n    if (Array.isArray(window.__SEARCH_INDEX__)) { index = window.__SEARCH_INDEX__; if (meta) { meta.textContent = (index.length ? index.length + ' páginas indexadas' : 'Nenhuma página indexada'); } }\n`
      );
      const wrapped = `(() => { const run = () => { ${urlPrelude}${scriptCode}\n }; if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', run); } else { run(); } })();`;
      fs.writeFileSync(path.join(outDir, 'script_search.js'), wrapped, 'utf8');
      normalized = normalized.replace(inlineMatch[0], '<script src="/search/search_index.js"></script>\n<script src="/search/script_search.js"></script>');
    } else if (hasExternal) {
      // Lê o runtime externo e escreve como script_search.js no build
      const runtimeUnderscore = path.join(templatesPath, 'scripts', 'search_runtime.js');
      const runtimeDash = path.join(templatesPath, 'scripts', 'search-runtime.js');
      const runtimePath = fs.existsSync(runtimeUnderscore) ? runtimeUnderscore : runtimeDash;
      if (runtimePath && fs.existsSync(runtimePath)) {
        const runtimeCode = fs.readFileSync(runtimePath, 'utf8');
        // Envelopa para garantir idempotência
        const wrapped = `(function(){${runtimeCode}\n})();`;
        fs.writeFileSync(path.join(outDir, 'script_search.js'), wrapped, 'utf8');
        // Substitui a tag externa por referências aos assets em /search/
        normalized = normalized.replace(externalTagRe, '<script src="/search/search_index.js"></script>\n<script src="/search/script_search.js"></script>');
      } else {
        // Se por algum motivo não existir, apenas remove a tag para não quebrar
        normalized = normalized.replace(externalTagRe, '');
      }
    }

    // Ajustar também referências diretas no HTML, caso existam
    normalized = normalized.replace(/\/search_index\.json/g, './search_index.json');

  fs.writeFileSync(path.join(outDir, 'index.html'), headerInline + sidebar + `<main class="rhyla-main">${normalized}</main>`);
  }

  // 404 com sidebar
  const sidebar404 = generateSidebarHTML(bodyPath, null, null);
  fs.writeFileSync(
    path.join(distPath, '404.html'),
  headerInline + sidebar404 + `<main class="rhyla-main">${notFoundHTML}</main>`
  );

  console.log('✅ Build completed successfully.');
}
