import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null) {
  const INDENT = 20; // px por nível de profundidade
  const isFileTopic = (name) => /\.(md|html)$/i.test(name);
  const isHiddenSpecial = (name) => ['home.md','home.html','notfound.md','notfound.html'].includes(name.toLowerCase());
  const isDir = (full) => fs.existsSync(full) && fs.statSync(full).isDirectory();

  const rootTopics = fs.readdirSync(bodyPath)
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isFile() && isFileTopic(name);
    })
    .filter(name => !isHiddenSpecial(name))
    .map(f => path.basename(f, path.extname(f)));

  const methodOf = (topic) => {
    const m = String(topic).toLowerCase();
    if (m.startsWith('get-')) return 'GET';
    if (m.startsWith('put-')) return 'PUT';
    if (m.startsWith('delete-')) return 'DELETE';
    if (m.startsWith('path-')) return 'PATH';
    if (m.startsWith('patch-')) return 'PATCH';
    if (m.startsWith('post-')) return 'POST';
    return null;
  };
  const tagHTML = (method, label) => `<span class="http-tag http-tag--${method.toLowerCase()}">${method}</span> ${label}`;

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // 🏠 Home
  html += `<li class="item-sidebar ${activeTopic === 'home' ? 'active' : ''}"><a href="/">🏠 Home</a></li>`;

  // Páginas raiz (exceto Search e Home)
  for (const topic of rootTopics.sort()) {
    if (topic.toLowerCase() === 'search' || topic.toLowerCase() === 'home') continue;
    const isActive = !activeGroup && activeTopic === topic;
    const method = methodOf(topic);
    let label = topic;
    if (method) {
      const dashIdx = topic.indexOf('-');
      label = dashIdx !== -1 ? topic.slice(dashIdx + 1).replace(/_/g, ' ') : topic;
    }
    const prefix = method ? tagHTML(method, label) : '| ' + topic;
    html += `<li class="item-sidebar ${isActive ? 'active' : ''}"><a href="${topic}.html">${prefix}</a></li>`;
  }

  // Render recursivo de diretórios
  function renderDir(dirAbs, relUrl = '', depth = 0) {
    // Arquivos diretos neste diretório
    const entries = fs.readdirSync(dirAbs);
    const files = entries.filter(name => isFileTopic(name) && !isHiddenSpecial(name)).sort();
    const dirs = entries.filter(name => isDir(path.join(dirAbs, name))).sort();

    // Arquivos primeiro (exceto na raiz, que já é renderizada acima)
    if (relUrl) {
      for (const file of files) {
        const topic = path.basename(file, path.extname(file));
        const relForCompare = relUrl || '';
        const ag = activeGroup || '';
        const isActive = (relForCompare === ag) && (activeTopic === topic);
        const method = methodOf(topic);
        let label = topic;
        if (method) {
          const dashIdx = topic.indexOf('-');
          label = dashIdx !== -1 ? topic.slice(dashIdx + 1).replace(/_/g, ' ') : topic;
        }
        const prefix = method ? tagHTML(method, label) : '| ' + topic;
      const href = `${relUrl ? relUrl + '/' : ''}${topic}.html`;
        html += `<li class="item-sidebar ${isActive ? 'active' : ''}"><a href="${href}">${prefix}</a></li>`;
      }
    }

    // Subdiretórios
    for (const d of dirs) {
      const dirPath = path.join(dirAbs, d);
      const childRel = relUrl ? `${relUrl}/${d}` : d;
      const ag = activeGroup || '';
      const isOpen = ag === childRel || ag.startsWith(childRel + '/'); // abre ancestrais
      const padHeader = depth * INDENT; // pasta atual
      const padContent = (depth + 0.3) * INDENT; // conteúdo dentro da pasta
      html += `
        <li class="group ${isOpen ? 'open' : ''}">
          <div class="group-header" style="padding-left:${padHeader}px;" onclick="toggleFolder(this)">
            <span class="dropdown-arrow ${isOpen ? 'open' : ''}">▶</span> 📁 ${d}
          </div>
          <ul class="group-content" style="max-height:0; padding-left:${padContent}px;">
      `;
      renderDir(dirPath, childRel, depth + 0.3);
      html += `</ul></li>`;
    }
  }

  // Render a partir da raiz do body
  renderDir(bodyPath, '');

  // Footer estático no final da sidebar
  const footer = `
  <footer class="rhyla-footer">
    <p style="margin:0;font-size:13px;color:var(--rh-muted);">&copy; 2025 - Made by Rhyla</p>
  </footer>`;

  html += `</ul>${footer}</aside>`;

  // Script de controle (injetado no final)
  html += `
    <script>
      function adjustAncestorHeights(el){
        let p = el && el.parentElement;
        const limit = 10; let i=0;
        while (p && i++ < limit){
          if (p.classList && p.classList.contains('group-content')){
            const parentLi = p.parentElement;
            if (parentLi && parentLi.classList.contains('open')){
              // Deixe aberto com altura automática após a transição
              p.style.maxHeight = 'none';
            }
          }
          p = p.parentElement;
        }
      }

      function toggleFolder(header) {
        const li = header.parentElement;
        const arrow = header.querySelector('.dropdown-arrow');
        const content = li.querySelector('.group-content');
        if (!content) return;
        const isOpen = li.classList.contains('open');
        if (isOpen) {
          // Fechar: se estiver 'none', re-medimos antes de animar para 0
          const computed = getComputedStyle(content).maxHeight;
          if (computed === 'none' || content.style.maxHeight === 'none' || !content.style.maxHeight) {
            content.style.maxHeight = content.scrollHeight + 'px';
            // força reflow
            void content.offsetHeight;
          }
          requestAnimationFrame(() => { content.style.maxHeight = '0'; });
          li.classList.remove('open');
          arrow.classList.remove('open');
          content.addEventListener('transitionend', function onEnd(){
            content.removeEventListener('transitionend', onEnd);
            // após fechar, mantenha em 0
            content.style.maxHeight = '0';
            adjustAncestorHeights(content);
          }, { once: true });
        } else {
          // Abrir: anima até a altura total e depois fixa em 'none' (auto)
          li.classList.add('open');
          arrow.classList.add('open');
          content.style.maxHeight = content.scrollHeight + 'px';
          content.addEventListener('transitionend', function onEnd(){
            content.removeEventListener('transitionend', onEnd);
            content.style.maxHeight = 'none';
            adjustAncestorHeights(content);
            try { content.scrollIntoView({ block: 'nearest' }); } catch(_) {}
          }, { once: true });
        }
      }

      // Ao carregar, garanta que grupos marcados como .open tenham a altura correta
      (function initOpenHeights(){
        if (document.readyState === 'loading'){
          document.addEventListener('DOMContentLoaded', initOpenHeights);
          return;
        }
        document.querySelectorAll('.rhyla-sidebar .group.open > .group-content').forEach(ul => {
          // grupos abertos começam com altura auto
          ul.style.maxHeight = 'none';
        });
      })();
    </script>
  `;

  return html;
}
