import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';

export default function build() {
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla');
  const templatesPath = path.join(root, 'templates');
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

  // Ler header/footer
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(rhylaPath, 'footer.html'), 'utf8');
  const notFoundHTML = fs.readFileSync(path.join(templatesPath, 'notFound.html'), 'utf8');

  const bodyPath = path.join(rhylaPath, 'body');

  // Gerar home como index.html
  const homePath = path.join(bodyPath, 'home.md');
  if (fs.existsSync(homePath)) {
    const content = md.render(fs.readFileSync(homePath, 'utf8'));
    const sidebar = generateSidebarHTML(bodyPath, null, 'home');
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      header + sidebar + `<main class="rhyla-main">${content}</main>` + footer
    );
  } else {
    // Se não tiver home, usar notFound
    fs.writeFileSync(
      path.join(distPath, 'index.html'),
      header + notFoundHTML + footer
    );
  }

  // Função recursiva para gerar páginas
  function processDir(dir, relPath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const itemPath = path.join(dir, item.name);
      const itemRel = path.join(relPath, item.name);

      if (item.isDirectory()) {
        processDir(itemPath, itemRel);
      } else if ((item.name.endsWith('.md') || item.name.endsWith('.html')) &&
                 item.name !== 'home.md' &&
                 item.name !== 'notFound.html') {

        const group = relPath.split(path.sep)[0] || null;
        const topic = path.basename(item.name, path.extname(item.name));

        let content = '';
        if (item.name.endsWith('.md')) {
          content = md.render(fs.readFileSync(itemPath, 'utf8'));
        } else {
          content = fs.readFileSync(itemPath, 'utf8');
        }

        const sidebar = generateSidebarHTML(bodyPath, group, topic);

        // Criar diretório no dist
        const outDir = path.join(distPath, relPath);
        fs.mkdirSync(outDir, { recursive: true });

        // Salvar página
        fs.writeFileSync(
          path.join(outDir, `${topic}.html`),
          header + sidebar + `<main class="rhyla-main">${content}</main>` + footer
        );
      }
    }
  }

  processDir(bodyPath);

  // Criar notFound.html no dist (página de erro padrão)
  fs.writeFileSync(path.join(distPath, '404.html'), header + notFoundHTML + footer);

  console.log('✅ Build concluído com sucesso.');
}
