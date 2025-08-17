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
  // Protege contra fechamentos prematuros de </script> no conteúdo
  const runtimeRaw = fs.readFileSync(runtimePath, 'utf8');
  const runtime = runtimeRaw.replace(/<\/script>/gi, '<\\/script>');
      // Use uma função de substituição para impedir que tokens como $& sejam processados pelo String.replace
      return html.replace(
        /<script\s+src=["']\/scripts\/header-runtime\.js["']><\/script>/i,
        () => `<script>\n${runtime}\n<\/script>`
      );
    } catch { return html; }
  }

  const headerInline = withInlineHeaderRuntime(header);

  // Gerar home como index.html (aceita home.md ou home.html)
  const homeMdPath = path.join(bodyPath, 'home.md');
  const homeHtmlPath = path.join(bodyPath, 'home.html');
  if (fs.existsSync(homeMdPath) || fs.existsSync(homeHtmlPath)) {
    const content = fs.existsSync(homeMdPath)
      ? md.render(fs.readFileSync(homeMdPath, 'utf8'))
      : fs.readFileSync(homeHtmlPath, 'utf8');
    const sidebar = generateSidebarHTML(bodyPath, null, 'home');
    const pageHTML = headerInline + sidebar + `<main class=\"rhyla-main\">${content}</main>`;
    fs.writeFileSync(path.join(distPath, 'index.html'), pageHTML);
    // Alias home.html na raiz
    fs.writeFileSync(path.join(distPath, 'home.html'), pageHTML);
    // Alias /home/index.html para URLs limpas
    const homeDir = path.join(distPath, 'home');
    fs.mkdirSync(homeDir, { recursive: true });
    fs.writeFileSync(path.join(homeDir, 'index.html'), pageHTML);
  } else {
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      headerInline + sidebar + `<main class=\"rhyla-main\">${notFoundHTML}</main>`
    );
  }

  const EXCLUDE = new Set([
    'notfound.html', 'notfound.md', 'notfound.htm', 'notfound',
    'search.html', '.search.html', 'search.md', '.search.md'
  ]);

  // Função recursiva para gerar páginas a partir de rhyla/body (sem página de busca)
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
  const sidebar404 = generateSidebarHTML(bodyPath, null, null);
  fs.writeFileSync(
    path.join(distPath, '404.html'),
  headerInline + sidebar404 + `<main class="rhyla-main">${notFoundHTML}</main>`
  );

  console.log('✅ Build completed successfully.');
}
