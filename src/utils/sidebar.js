import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null) {
  const groups = fs.readdirSync(bodyPath).filter(g => fs.statSync(path.join(bodyPath, g)).isDirectory());

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // Home no topo
  html += `<li class="${activeTopic === 'home' ? 'active' : ''}">
             <a href="/">Home</a>
           </li>`;

  for (const group of groups) {
    html += `<li class="group">${group}<ul>`;
    const topics = fs.readdirSync(path.join(bodyPath, group))
      .filter(f => (f.endsWith('.md') || f.endsWith('.html')) && f !== 'notFound.html' && f !== 'home.md')
      .map(f => path.basename(f, path.extname(f)));

    for (const topic of topics) {
      const isActive = group === activeGroup && topic === activeTopic;
      html += `<li class="${isActive ? 'active' : ''}">
                 <a href="/${group}/${topic}.html">${topic}</a>
               </li>`;
    }
    html += `</ul></li>`;
  }

  html += `</ul></aside>`;
  return html;
}
