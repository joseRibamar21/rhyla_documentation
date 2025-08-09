import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyDir, activeGroup = null, activeTopic = null) {
  const groups = fs.readdirSync(bodyDir).filter(f => fs.statSync(path.join(bodyDir, f)).isDirectory());

  let sidebarHTML = `<aside class="sidebar"><ul>`;
  groups.forEach(group => {
    sidebarHTML += `<li><strong>${group}</strong><ul>`;
    const topics = fs.readdirSync(path.join(bodyDir, group))
      .filter(f => f.endsWith('.md'));

    topics.forEach(topic => {
      const topicName = topic.replace('.md', '');
      const isActive = group === activeGroup && topicName === activeTopic ? ' class="active"' : '';
      sidebarHTML += `<li${isActive}><a href="/${group}/${topicName}.html">${topicName}</a></li>`;
    });

    sidebarHTML += `</ul></li>`;
  });
  sidebarHTML += `</ul></aside>`;

  return sidebarHTML;
}
