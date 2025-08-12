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
    .filter(name => !['home.md','home.html','notfound.md','notfound.html'].includes(name.toLowerCase()))
    .map(f => path.basename(f, path.extname(f)));

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // 🔍 Search primeiro
  const hasSearch = rootTopics.includes('search');
  if (hasSearch) {
    const isActiveSearch = !activeGroup && activeTopic === 'search';
    html += `<li class="${isActiveSearch ? 'active' : ''}"><a href="/search.html">🔍 Search</a></li>`;
    // Divider
    html += `<li><hr style="border:none; border-top:1px solid #ccc; margin:8px 0;"></li>`;
  }

  // 🏠 Home
  html += `<li class="${activeTopic === 'home' ? 'active' : ''}"><a href="/">🏠 Home</a></li>`;

  // Páginas raiz (exceto Search e Home)
  for (const topic of rootTopics.sort()) {
    if (topic.toLowerCase() === 'search' || topic.toLowerCase() === 'home') continue;
    const isActive = !activeGroup && activeTopic === topic;
    html += `<li class="${isActive ? 'active' : ''}"><a href="/${topic}.html">📄 ${topic}</a></li>`;
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
