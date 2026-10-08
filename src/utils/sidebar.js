import fs from 'fs';
import path from 'path';
import { createIgnoreMatcher } from '../core/ignore.js';
import { readFrontmatter, escapeHtml } from '../core/content.js';
import { sortByOrder } from '../core/pages.js';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null, options = {}) {
  const INDENT = 20; // px por nível de profundidade
  const isFileTopic = (name) => /\.(md|html)$/i.test(name);
  const isHiddenSpecial = (name) => ['home.md','home.html','notfound.md','notfound.html'].includes(name.toLowerCase());
  const isDir = (full) => fs.existsSync(full) && fs.statSync(full).isDirectory();

  // Suporte a padrões de ignore vindos do build (relativos a body/)
  const shouldIgnorePath = createIgnoreMatcher(Array.isArray(options.ignore) ? options.ignore : []);

  // Ordena por `order` do frontmatter e depois por nome
  const sortFiles = (dirAbs, names) =>
    sortByOrder(names.map((name) => ({ name, order: readFrontmatter(path.join(dirAbs, name)).order })))
      .map((e) => e.name);

  // Rótulo: `title` do frontmatter (escapado) ou o nome do arquivo
  const labelFor = (fileAbs, fallback) => {
    const title = readFrontmatter(fileAbs).title;
    return title ? escapeHtml(title) : String(fallback).replace(/_/g, ' ');
  };

  const rootEntries = fs.readdirSync(bodyPath);
  const rootTopics = rootEntries
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isFile() && isFileTopic(name);
    })
    .filter(name => !isHiddenSpecial(name))
    .filter(name => !shouldIgnorePath(name));

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
  
  // Função para detectar e extrair pós-tags no formato subtag+nome+postag
  const getPostTag = (topic) => {
    // Lista de possíveis pós-tags conhecidas (não versões)
    const knownPostTags = ['new', 'dep'];
    
    // Regex para identificar tags de versão (v1, v2, v3, v1.0.0, etc)
    const versionTagRegex = /-v\d+(\.\d+)*$/;
    
    // Verificar primeiro se é uma tag de versão
    if (versionTagRegex.test(topic)) {
      const match = topic.match(versionTagRegex);
      if (match) {
        const vTag = match[0].substring(1); // remove o hífen inicial
        const baseTopicName = topic.substring(0, topic.length - vTag.length - 1);
        return {
          baseTopic: baseTopicName,
          postTag: vTag,
          tagType: 'v' // indica que é uma tag de versão
        };
      }
    }
    
    // Verifica se o tópico termina com um hífen seguido por uma pós-tag conhecida
    for (const tag of knownPostTags) {
      if (topic.endsWith(`-${tag}`)) {
        const baseTopicName = topic.substring(0, topic.length - tag.length - 1);
        return { 
          baseTopic: baseTopicName, 
          postTag: tag,
          tagType: tag // o tipo é igual à tag para tags não-versão
        };
      }
    }
    
    return { baseTopic: topic, postTag: null, tagType: null };
  };
  
  const tagHTML = (method, label, postTag = null, tagType = null) => {
    const methodHtml = method ? 
      `<span class="http-tag http-tag--${method.toLowerCase()}">${method}</span> ` : 
      '';
      
    let tagClass = postTag;
    
    // Se for uma tag de versão (v1, v2, etc), use a classe 'v'
    if (postTag && (tagType === 'v' || postTag.startsWith('v'))) {
      tagClass = 'v';
    }
    
    const postTagHtml = postTag ? 
      ` <span class="post-tag post-tag--${tagClass}">${postTag}</span>` : 
      '';
      
    return `${methodHtml}${label}${postTagHtml}`;
  };

  let html = `<aside class="rhyla-sidebar"><ul>`;

  // 🏠 Home - usando caminho relativo para evitar duplicação de prefixo
  html += `<li class="item-sidebar ${activeTopic === 'home' ? 'active' : ''}"><a href="./">🏠 Home</a></li>`;

  // Páginas raiz (exceto Search e Home)
  for (const fileName of sortFiles(bodyPath, rootTopics)) {
    const topic = path.basename(fileName, path.extname(fileName));
    if (topic.toLowerCase() === 'search' || topic.toLowerCase() === 'home') continue;
    const isActive = !activeGroup && activeTopic === topic;
    const method = methodOf(topic);
    
    // Processar tópico para extrair pós-tag se houver
    const { baseTopic, postTag } = getPostTag(topic);
    
    let label = baseTopic;
    if (method) {
      const dashIdx = baseTopic.indexOf('-');
      label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
    }
    label = labelFor(path.join(bodyPath, fileName), label);
    
    // Para páginas raiz, não adicionamos o '|'
    const displayContent = tagHTML(method, label, postTag, getPostTag(topic).tagType);
    html += `<li class="item-sidebar ${isActive ? 'active' : ''}"><a href="./${topic}.html">${displayContent}</a></li>`;
  }

  // Render recursivo de diretórios
  function renderDir(dirAbs, relUrl = '', depth = 0) {
    // Arquivos diretos neste diretório
    const entries = fs.readdirSync(dirAbs);
    const files = sortFiles(dirAbs, entries.filter(name => isFileTopic(name) && !isHiddenSpecial(name)));
    const dirs = entries.filter(name => isDir(path.join(dirAbs, name))).sort();

    // Função auxiliar para normalizar caminhos e evitar duplicações
    function normalizePath(inputPath) {
      // Remove duplicações de diretório (ex: guide/guide/file.html -> guide/file.html)
      const parts = inputPath.split('/').filter(Boolean);
      const result = [];
      
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1 && parts[i] === parts[i+1]) {
          continue; // Pula duplicações consecutivas
        }
        result.push(parts[i]);
      }
      
      return result.join('/');
    }

    // Arquivos primeiro (exceto na raiz, que já é renderizada acima)
  if (relUrl) {
      for (const file of files) {
    // ignorar por padrão conforme padrões
    const relForIgnore = relUrl ? `${relUrl}/${file}` : file;
    if (shouldIgnorePath(relForIgnore)) continue;
        const topic = path.basename(file, path.extname(file));
        const relForCompare = relUrl || '';
        const ag = activeGroup || '';
        const isActive = (relForCompare === ag) && (activeTopic === topic);
        const method = methodOf(topic);
        
        // Processar tópico para extrair pós-tag se houver
        const { baseTopic, postTag } = getPostTag(topic);
        
        let label = baseTopic;
        if (method) {
          const dashIdx = baseTopic.indexOf('-');
          label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
        }
        label = labelFor(path.join(dirAbs, file), label);
        
        // Para arquivos em subdiretórios, adicionamos o '|' antes do tópico se não houver método HTTP
        const prefix = method ? 
          tagHTML(method, label, postTag, getPostTag(topic).tagType) : 
          tagHTML(null, '| ' + label, postTag, getPostTag(topic).tagType);
          
        // Construímos caminhos relativos corretos para os tópicos dentro de diretórios
        const normalizedPath = normalizePath(relUrl);
        const href = `./${normalizedPath}/${topic}.html`;
        html += `<li class="item-sidebar ${isActive ? 'active' : ''}"><a href="${href}" data-path="${normalizedPath}">${prefix}</a></li>`;
      }
    }

    // Subdiretórios
    for (const d of dirs) {
      const dirPath = path.join(dirAbs, d);
      const childRel = relUrl ? normalizePath(`${relUrl}/${d}`) : d;
      if (shouldIgnorePath(childRel)) continue;
      const ag = activeGroup || '';
      const isOpen = ag === childRel || ag.startsWith(childRel + '/'); // abre ancestrais
      const padHeader = depth * INDENT; // pasta atual
      const padContent = (depth + 0.3) * INDENT; // conteúdo dentro da pasta
  // Exibir nome da pasta sem underscores (visual apenas)
  const displayDir = String(d).replace(/_/g, ' ');
  // Ícone especial para pasta de desenvolvimento
  const dirIcon = String(d).toLowerCase() === 'kit_dev_rhyla' ? '⚙️' : '📁';
      html += `
        <li class="group ${isOpen ? 'open' : ''}">
          <div class="group-header" style="padding-left:${padHeader}px;" onclick="toggleFolder(this)">
    <span class="dropdown-arrow ${isOpen ? 'open' : ''}">▶</span> ${dirIcon} ${displayDir}
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
    <p style="margin:0;font-size:13px;color:var(--rh-muted);">&copy; ${new Date().getFullYear()} - Made with Rhyla</p>
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
