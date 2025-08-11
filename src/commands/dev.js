import express from 'express';
import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';

export default function dev() {
  const app = express();
  const md = new markdownIt();
  const rhylaPath = path.join(process.cwd(), 'rhyla');
  const templatesPath = path.join(process.cwd(), 'templates');
  const notFoundPath = path.join(templatesPath, 'notFound.html');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Pasta "rhyla" não encontrada. Execute "rhyla init" primeiro.');
    process.exit(1);
  }

  // Servir CSS e arquivos estáticos
  app.use('/styles', express.static(path.join(rhylaPath, 'styles')));

  // Ler header e footer
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(rhylaPath, 'footer.html'), 'utf8');

  // Rota da home (primeira a ser registrada)
  app.get('/', (req, res) => {
    const homePath = path.join(rhylaPath, 'body', 'home.md');
    if (!fs.existsSync(homePath)) {
      const notFound = fs.readFileSync(notFoundPath, 'utf8');
      return res.status(404).send(notFound);
    }
    const content = md.render(fs.readFileSync(homePath, 'utf8'));
    const sidebar = generateSidebarHTML(path.join(rhylaPath, 'body'), null, 'home');
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // Rota tópicos
  app.get('/:group/:topic.html', (req, res) => {
    const { group, topic } = req.params;
    const fileMd = path.join(rhylaPath, 'body', group, `${topic}.md`);
    const fileHtml = path.join(rhylaPath, 'body', group, `${topic}.html`);

    let content = '';
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, 'utf8'));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, 'utf8');
    } else {
      const notFound = fs.readFileSync(notFoundPath, 'utf8');
      return res.status(404).send(header + notFound + footer);
    }

    const sidebar = generateSidebarHTML(path.join(rhylaPath, 'body'), group, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // Iniciar servidor
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  });
}
