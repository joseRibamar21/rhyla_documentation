import fs from 'fs';
import path from 'path';
import markdownIt from 'markdown-it';
import { generateSidebarHTML } from '../utils/sidebar.js';

export default function build() {
  const md = new markdownIt();
  const rhylaPath = path.join(process.cwd(), 'rhyla');
  const distPath = path.join(process.cwd(), 'docs');

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Pasta "rhyla" não encontrada. Execute "rhyla init" primeiro.');
    return;
  }

  // Criar pasta docs
  fs.mkdirSync(distPath, { recursive: true });

  // Copiar estilos
  fs.mkdirSync(path.join(distPath, 'styles'), { recursive: true });
  ['light.css', 'dark.css'].forEach(file => {
    fs.copyFileSync(
      path.join(rhylaPath, 'styles', file),
      path.join(distPath, 'styles', file)
    );
  });

  // Ler header e footer
  const header = fs.readFileSync(path.join(rhylaPath, 'header.html'), 'utf8');
  const footer = fs.readFileSync(path.join(rhylaPath, 'footer.html'), 'utf8');

  // 1️⃣ Página inicial (sem destaque)
  const homeHTML = fs.readFileSync(path.join(rhylaPath, 'home.html'), 'utf8');
  const sidebarHome = generateSidebarHTML(path.join(rhylaPath, 'body'));
  fs.writeFileSync(
    path.join(distPath, 'index.html'),
    header + `<div class="container">${sidebarHome}<div class="content">${homeHTML}</div></div>` + footer
  );

  // 2️⃣ Grupos e tópicos
  const groups = fs.readdirSync(path.join(rhylaPath, 'body'))
    .filter(f => fs.statSync(path.join(rhylaPath, 'body', f)).isDirectory());

  groups.forEach(group => {
    const groupDir = path.join(rhylaPath, 'body', group);
    const topics = fs.readdirSync(groupDir).filter(f => f.endsWith('.md'));

    // Criar pasta do grupo em docs
    fs.mkdirSync(path.join(distPath, group), { recursive: true });

    topics.forEach(topic => {
      const topicName = topic.replace('.md', '');
      const topicContent = fs.readFileSync(path.join(groupDir, topic), 'utf8');
      const htmlContent = md.render(topicContent);

      const sidebar = generateSidebarHTML(path.join(rhylaPath, 'body'), group, topicName);

      fs.writeFileSync(
        path.join(distPath, group, topicName + '.html'),
        header + `<div class="container">${sidebar}<div class="content">${htmlContent}</div></div>` + footer
      );
    });
  });

  console.log('✅ Documentação compilada em /docs');
}
