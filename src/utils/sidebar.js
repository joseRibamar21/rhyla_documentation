import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyDir, activeGroup = null, activeTopic = null) {
  if (!fs.existsSync(bodyDir)) return '<aside class="rhyla-sidebar"><p>Nenhum conteúdo</p></aside>';

  const groups = fs.readdirSync(bodyDir).filter(f => fs.statSync(path.join(bodyDir, f)).isDirectory());

  let sidebarHTML = `<aside class="rhyla-sidebar"><ul>`;
  groups.forEach(group => {
    sidebarHTML += `<li class="group"><strong>${group}</strong><ul>`;
    const topics = fs.readdirSync(path.join(bodyDir, group))
      .filter(f => f.endsWith('.md'))
      .sort();

    topics.forEach(topic => {
      const topicName = topic.replace('.md', '');
      const isActive = group === activeGroup && topicName === activeTopic ? ' class="active"' : '';
      const href = `/${encodeURIComponent(group)}/${encodeURIComponent(topicName)}.html`;
      sidebarHTML += `<li${isActive}><a href="${href}">${topicName}</a></li>`;
    });

    sidebarHTML += `</ul></li>`;
  });
  sidebarHTML += `</ul></aside>`;

  return sidebarHTML;
}
