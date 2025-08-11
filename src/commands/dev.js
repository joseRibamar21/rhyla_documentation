import express from 'express';
import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';

export default function dev() {
  const app = express();
  const md = new markdownIt();
  const rhylaPath = path.join(process.cwd(), 'rhyla');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Pasta "rhyla" não encontrada. Execute "rhyla init" primeiro.');
    process.exit(1);
  }

  // Servir CSS e arquivos estáticos de rhyla/styles
  app.use('/styles', express.static(path.join(rhylaPath, 'styles')));

  // Ler header e footer
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(rhylaPath, 'footer.html'), 'utf8');

  // Página inicial
  app.get('/', (req, res) => {
    const homeHTML = fs.readFileSync(path.join(rhylaPath, 'home.html'), 'utf8');
    const sidebar = generateSidebarHTML(path.join(rhylaPath, 'body')); // sem seleção

    res.send(`
    ${header}
    ${sidebar}
    <main class="rhyla-main">
      ${homeHTML}
    </main>
    ${footer}
  `);
  });

  // Página de tópico
  app.get('/:group/:topic.html', (req, res) => {
    const { group, topic } = req.params;
    const filePath = path.join(rhylaPath, 'body', group, `${topic}.md`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('❌ Página não encontrada.');
    }

    const content = md.render(fs.readFileSync(filePath, 'utf8'));
    const sidebar = generateSidebarHTML(path.join(rhylaPath, 'body'), group, topic);

    res.send(`
    ${header}
    ${sidebar}
    <main class="rhyla-main">
      ${content}
    </main>
    ${footer}
  `);
  });
  // Iniciar servidor
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Servidor de documentação rodando em http://localhost:${port}`);
  });
}
