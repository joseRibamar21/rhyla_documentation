import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null) {
  const groups = fs.readdirSync(bodyPath)
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isDirectory();
    });

  const rootTopics = fs.readdirSync(bodyPath)
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isFile() && /\.(md|html)$/i.test(name);
    })
    .filter(name => !['home.md','home.html','notfound.md','notfound.html','notfound.html','notFound.html'].includes(name.toLowerCase()))
    .map(f => path.basename(f, path.extname(f)));

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // Home
  html += `<li class="${activeTopic === 'home' ? 'active' : ''}"><a href="/">🏠 Home</a></li>`;

  // Páginas raiz
  for (const topic of rootTopics.sort()) {
    const isActive = !activeGroup && activeTopic === topic;
    let icon = '📄';
    if (topic.toLowerCase() === 'search') icon = '🔍';
    html += `<li class="${isActive ? 'active' : ''}"><a href="/${topic}.html">${icon} ${topic}</a></li>`;
  }

  // Pastas / grupos com colapso
  for (const group of groups.sort()) {
    const isOpen = activeGroup === group; // Abre se for a pasta ativa
    html += `
      <li class="group ${isOpen ? 'open' : ''}">
        <div class="group-header" onclick="toggleFolder(this)">
          <span class="dropdown-arrow ${isOpen ? 'open' : ''}">▶</span> 📁 ${group}
        </div>
        <ul class="group-content" style="max-height:${isOpen ? '500px' : '0'};">
    `;

    const groupDir = path.join(bodyPath, group);
    const topics = fs.readdirSync(groupDir)
      .filter(f => (f.endsWith('.md') || f.endsWith('.html')) && !['notfound.md','notfound.html','home.md','home.html'].includes(f.toLowerCase()))
      .map(f => path.basename(f, path.extname(f)))
      .sort();

    for (const topic of topics) {
      const isActive = group === activeGroup && topic === activeTopic;
      html += `<li class="${isActive ? 'active' : ''}"><a href="/${group}/${topic}.html">📄 ${topic}</a></li>`;
    }

    html += `</ul></li>`;
  }

  html += `</ul></aside>`;

  // Script de controle (injetado no final)
  html += `
    <script>
      function toggleFolder(header) {
        const li = header.parentElement;
        const arrow = header.querySelector('.dropdown-arrow');
        const content = li.querySelector('.group-content');
        li.classList.toggle('open');
        arrow.classList.toggle('open');
        if (li.classList.contains('open')) {
          content.style.maxHeight = content.scrollHeight + 'px';
        } else {
          content.style.maxHeight = '0';
        }
      }
    </script>
  `;

  return html;
}
