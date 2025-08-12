import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';
import { spawnSync } from 'child_process';
import os from 'os';

export default function build() {
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla');
  const distPath = path.join(root, 'dist');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Pasta "rhyla" não encontrada. Execute "rhyla init" primeiro.');
    process.exit(1);
  }

  const md = new markdownIt();

  // Limpar dist e recriar
  if (fs.existsSync(distPath)) fs.rmSync(distPath, { recursive: true });
  fs.mkdirSync(distPath);

  // Copiar estilos
  fs.mkdirSync(path.join(distPath, 'styles'), { recursive: true });
  fs.cpSync(path.join(rhylaPath, 'styles'), path.join(distPath, 'styles'), { recursive: true });

  // Detectar pasta de scripts (oculta no Unix)
  const isWindows = os.platform() === 'win32';
  const scriptsFolderName = isWindows ? 'scripts' : '.scripts';
  const scriptsFolderPath = path.join(rhylaPath, scriptsFolderName);

  // Gerar índice de busca (usa o script do projeto)
  const searchScript = path.join(scriptsFolderPath, 'generateSearchIndex.js');
  if (fs.existsSync(searchScript)) {
    console.log('🔍 Gerando índice de busca...');
    const res = spawnSync(process.execPath, [searchScript], { cwd: rhylaPath, stdio: 'inherit' });
    if (res.status !== 0) {
      console.warn('⚠️ Falha ao gerar índice de busca. Continuando build sem índice.');
    }
  }

  // Copiar scripts (inclui search_index.js/json se existirem)
  const scriptsDst = path.join(distPath, 'scripts');
  if (fs.existsSync(scriptsFolderPath)) {
    fs.mkdirSync(scriptsDst, { recursive: true });
    fs.cpSync(scriptsFolderPath, scriptsDst, { recursive: true });
  }

  // Copiar o JSON do índice também para a raiz do dist (compat)
  const searchJsonSrc = path.join(scriptsFolderPath, 'search_index.json');
  const searchJsonDst = path.join(distPath, 'search_index.json');
  if (fs.existsSync(searchJsonSrc)) {
    fs.copyFileSync(searchJsonSrc, searchJsonDst);
  }

  // Ler header/footer e notFound da pasta rhyla/body
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(rhylaPath, 'footer.html'), 'utf8');
  const notFoundTemplatePath = path.join(rhylaPath, 'body', 'notFound.html');
  const notFoundHTML = fs.existsSync(notFoundTemplatePath)
    ? fs.readFileSync(notFoundTemplatePath, 'utf8')
    : '<h1>404</h1>';

  const bodyPath = path.join(rhylaPath, 'body');

  // Gerar home como index.html
  const homePath = path.join(bodyPath, 'home.md');
  if (fs.existsSync(homePath)) {
    const content = md.render(fs.readFileSync(homePath, 'utf8'));
    const sidebar = generateSidebarHTML(bodyPath, null, 'home');
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      header + sidebar + `<main class="rhyla-main">${content}</main>`
    );
  } else {
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      header + sidebar + `<main class="rhyla-main">${notFoundHTML}</main>`
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
      // group = primeiro segmento se houver subdiretório
      const group = relPath ? relPath.split(path.sep)[0] : null;

      let content = '';
      if (item.name.endsWith('.md')) {
        content = md.render(fs.readFileSync(itemPath, 'utf8'));
      } else {
        content = fs.readFileSync(itemPath, 'utf8');
      }

      const sidebar = generateSidebarHTML(bodyPath, group, topic);

      const outDir = path.join(distPath, relPath);
      fs.mkdirSync(outDir, { recursive: true });

      const pageHTML = header + sidebar + `<main class=\"rhyla-main\">${content}</main>`;

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

  // Página de busca estática em /buscar (suporta search.html e .search.html)
  const searchVisible = path.join(bodyPath, 'search.html');
  const searchHidden = path.join(bodyPath, '.search.html');
  const searchPage = fs.existsSync(searchVisible)
    ? searchVisible
    : (fs.existsSync(searchHidden) ? searchHidden : null);

  if (searchPage) {
    const content = fs.readFileSync(searchPage, 'utf8');
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    const outDir = path.join(distPath, 'buscar');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), header + sidebar + `<main class=\"rhyla-main\">${content}</main>`);
  }

  // 404 com sidebar
  const sidebar404 = generateSidebarHTML(bodyPath, null, null);
  fs.writeFileSync(
    path.join(distPath, '404.html'),
    header + sidebar404 + `<main class=\"rhyla-main\">${notFoundHTML}</main>`
  );

  console.log('✅ Build concluído com sucesso.');
}
