import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null) {
  // Grupos (pastas)
  const groups = fs.readdirSync(bodyPath)
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isDirectory();
    });

  // Arquivos de nível raiz (páginas diretamente dentro de body/)
  const rootTopics = fs.readdirSync(bodyPath)
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isFile() && /\.(md|html)$/i.test(name);
    })
    .filter(name => !['home.md','home.html','notfound.md','notfound.html','notfound.html','notFound.html'].includes(name.toLowerCase()))
    .map(f => path.basename(f, path.extname(f)));

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // Home no topo
  html += `<li class="${activeTopic === 'home' ? 'active' : ''}"><a href="/">🏠 Home</a></li>`;

  // Páginas raiz (sem pasta)
  for (const topic of rootTopics.sort()) {
    const isActive = !activeGroup && activeTopic === topic;
    html += `<li class="${isActive ? 'active' : ''}"><a href="/${topic}.html">📄 ${topic}</a></li>`;
  }

  // Pastas / grupos
  for (const group of groups.sort()) {
    html += `<li class="group"><strong style="padding-left: 2px">📁 ${group}</strong><ul>`;
    const groupDir = path.join(bodyPath, group);
    const topics = fs.readdirSync(groupDir)
      .filter(f => (f.endsWith('.md') || f.endsWith('.html')) && !['notfound.md','notfound.html','home.md','home.html'].includes(f.toLowerCase()))
      .map(f => path.basename(f, path.extname(f)))
      .sort();

    for (const topic of topics) {
      const isActive = group === activeGroup && topic === activeTopic;
      // Link: mantém padrão existente (.html) se for build estático; ajustar se rota dinâmica aceitar sem .html
      html += `<li 
      style="margin-left: 1em;"
      class="${isActive ? 'active' : ''}"><a href="/${group}/${topic}.html">📄 ${topic}</a></li>`;
    }
    html += `</ul></li>`;
  }

  html += `</ul></aside>`;
  return html;
}
