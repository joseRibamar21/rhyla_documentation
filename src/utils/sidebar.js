import fs from 'fs';
import path from 'path';

export function generateSidebarHTML(bodyPath, activeGroup = null, activeTopic = null, options = {}) {
  const INDENT = 20; // px por nível de profundidade
  const isFileTopic = (name) => /\.(md|html)$/i.test(name);
  const isHiddenSpecial = (name) => ['home.md','home.html','notfound.md','notfound.html'].includes(name.toLowerCase());
  const isDir = (full) => fs.existsSync(full) && fs.statSync(full).isDirectory();

  // Suporte a padrões de ignore vindos do build (relativos a body/)
  const inputIgnore = Array.isArray(options.ignore) ? options.ignore.slice() : [];
  const ignorePatterns = inputIgnore
    .map((p) => String(p).replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .map((p) => p.toLowerCase());

  function patternToRegex(pat) {
    const escaped = pat
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$', 'i');
  }

  const ignoreRegexes = ignorePatterns
    .filter((p) => p.includes('*') || p.includes('/'))
    .map((p) => patternToRegex(p));

  const ignoreNames = new Set(
    ignorePatterns.filter((p) => !p.includes('/') && !p.includes('*'))
  );

  function shouldIgnorePath(relPosix) {
    if (!relPosix) return false;
    const relLower = relPosix.toLowerCase();
    const baseName = relLower.split('/').pop();
    if (ignoreNames.has(baseName)) return true;
    // diretório/prefixo sem '*'
    for (const pat of ignorePatterns) {
      if (!pat.includes('*')) {
        const dirPat = pat.replace(/\/$/, '');
        if (relLower === dirPat || relLower.startsWith(dirPat + '/')) return true;
      }
    }
    for (const rx of ignoreRegexes) {
      if (rx.test(relLower)) return true;
    }
    return false;
  }

  // Obtém lista de arquivos e diretórios no bodyPath
  const rootEntries = fs.readdirSync(bodyPath);
  
  // Arquivos na raiz (excluindo os especiais como home.md e notfound.html)
  const rootTopics = rootEntries
    .filter(name => {
      const full = path.join(bodyPath, name);
      return fs.statSync(full).isFile() && isFileTopic(name);
    })
    .filter(name => !isHiddenSpecial(name))
    .filter(name => !shouldIgnorePath(name))
    .map(f => path.basename(f, path.extname(f)));

  // Diretórios na raiz
  const rootDirs = rootEntries
    .filter(name => isDir(path.join(bodyPath, name)))
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

  // Carrega o arquivo de configuração para ler a estrutura da sidebar
  let sidebarConfig = [];
  try {
    const configPath = path.join(bodyPath, '..', 'config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (Array.isArray(config.sidebar)) {
        sidebarConfig = config.sidebar;
      }
    }
  } catch (error) {
    console.error('Erro ao ler configuração da sidebar:', error);
  }

  // Rastreia itens já renderizados para não duplicá-los
  const renderedItems = new Set();

  // Início do HTML da sidebar
  let html = `<aside class="rhyla-sidebar"><ul>`;

  // Sempre adiciona Home primeiro
  html += `<li class="item-sidebar ${activeTopic === 'home' ? 'active' : ''}"><a href="./">🏠 Home</a></li>`;
  renderedItems.add('home');

  // Função para gerar link para um tópico
  function generateTopicLink(topic, relPath = '', isActive = false) {
    // Marca este item como renderizado
    renderedItems.add(topic.toLowerCase());
    
    const method = methodOf(topic);
    const { baseTopic, postTag, tagType } = getPostTag(topic);
    
    let label = baseTopic;
    if (method) {
      const dashIdx = baseTopic.indexOf('-');
      label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
    }
    // Substituir '_' por ' ' para visualização
    label = String(label).replace(/_/g, ' ');
    
    // Construção do display HTML com tags
    const displayContent = tagHTML(method, label, postTag, tagType);
    
    // Caminho do arquivo
    let href = '';
    if (relPath) {
      href = `./${relPath}/${topic}.html`;
    } else {
      href = `./${topic}.html`;
    }
    
    return `<li class="item-sidebar ${isActive ? 'active' : ''}"><a href="${href}">${displayContent}</a></li>`;
  }

  // Função para renderizar um grupo de itens
  function renderGroup(title, children, depth = 0) {
    // Estilos para o título do grupo
    const titleStyle = `
      font-weight: bold;
      color: var(--rh-muted);
      padding: 16px 0 6px 0;
      margin-top: ${depth > 0 ? '16px' : '0'};
      border-bottom: 1px solid rgba(0,0,0,0.1);
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    
    // Começa com o cabeçalho do grupo
    let groupHtml = `
      <li class="group-title" style="${titleStyle}">
        ${title}
      </li>
    `;
    
    // Processar filhos do grupo
    for (const child of children) {
      if (typeof child === 'string') {
        // Item simples
        if (child.toLowerCase() === 'home') continue; // Home já foi adicionado
        
        const childLower = child.toLowerCase();
        
        // Verificar se é um diretório
        if (rootDirs.some(dir => dir.toLowerCase() === childLower)) {
          // É um diretório - processar como pasta expansível
          const dirName = rootDirs.find(dir => dir.toLowerCase() === childLower);
          const dirPath = path.join(bodyPath, dirName);
          
          // Criar HTML para diretório expansível
          const files = fs.readdirSync(dirPath)
            .filter(name => isFileTopic(name) && !isHiddenSpecial(name))
            .filter(name => !shouldIgnorePath(`${dirName}/${name}`))
            .sort();
          
          const subDirs = fs.readdirSync(dirPath)
            .filter(name => isDir(path.join(dirPath, name)))
            .filter(name => !shouldIgnorePath(`${dirName}/${name}`))
            .sort();
          
          renderedItems.add(dirName.toLowerCase());
          
          const isOpen = activeGroup === dirName || (activeGroup && activeGroup.startsWith(dirName + '/'));
          
          groupHtml += `
            <li class="group ${isOpen ? 'open' : ''}">
              <div class="group-header" onclick="toggleFolder(this)">
                <span class="dropdown-arrow ${isOpen ? 'open' : ''}">▶</span> 📁 ${dirName.replace(/_/g, ' ')}
              </div>
              <ul class="group-content" style="${isOpen ? 'max-height:none;' : 'max-height:0;'}">
          `;
          
          // Adicionar arquivos
          for (const file of files) {
            const topic = path.basename(file, path.extname(file));
            const isItemActive = activeGroup === dirName && activeTopic === topic;
            const method = methodOf(topic);
            const { baseTopic, postTag, tagType } = getPostTag(topic);
            
            let label = baseTopic;
            if (method) {
              const dashIdx = baseTopic.indexOf('-');
              label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
            }
            
            label = String(label).replace(/_/g, ' ');
            const prefix = method ? 
              tagHTML(method, label, postTag, tagType) : 
              tagHTML(null, '| ' + label, postTag, tagType);
              
            groupHtml += `<li class="item-sidebar ${isItemActive ? 'active' : ''}">
              <a href="./${dirName}/${topic}.html">${prefix}</a>
            </li>`;
          }
          
          // Processar subdiretórios recursivamente
          for (const subDir of subDirs) {
            const subDirPath = path.join(dirPath, subDir);
            const fullSubDirName = `${dirName}/${subDir}`;
            
            // Processo similar para subdiretório
            const subFiles = fs.readdirSync(subDirPath)
              .filter(name => isFileTopic(name) && !isHiddenSpecial(name))
              .filter(name => !shouldIgnorePath(`${fullSubDirName}/${name}`))
              .sort();
            
            const subSubDirs = fs.readdirSync(subDirPath)
              .filter(name => isDir(path.join(subDirPath, name)))
              .filter(name => !shouldIgnorePath(`${fullSubDirName}/${name}`))
              .sort();
              
            renderedItems.add(fullSubDirName.toLowerCase());
            
            const isSubOpen = activeGroup === fullSubDirName || (activeGroup && activeGroup.startsWith(fullSubDirName + '/'));
            
            groupHtml += `
              <li class="group ${isSubOpen ? 'open' : ''}">
                <div class="group-header" onclick="toggleFolder(this)" style="padding-left: 16px;">
                  <span class="dropdown-arrow ${isSubOpen ? 'open' : ''}">▶</span> 📁 ${subDir.replace(/_/g, ' ')}
                </div>
                <ul class="group-content" style="${isSubOpen ? 'max-height:none;' : 'max-height:0;'}">
            `;
            
            // Adicionar arquivos do subdiretório
            for (const file of subFiles) {
              const topic = path.basename(file, path.extname(file));
              const isItemActive = activeGroup === fullSubDirName && activeTopic === topic;
              const method = methodOf(topic);
              const { baseTopic, postTag, tagType } = getPostTag(topic);
              
              let label = baseTopic;
              if (method) {
                const dashIdx = baseTopic.indexOf('-');
                label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
              }
              
              label = String(label).replace(/_/g, ' ');
              const prefix = method ? 
                tagHTML(method, label, postTag, tagType) : 
                tagHTML(null, '| ' + label, postTag, tagType);
                
              groupHtml += `<li class="item-sidebar ${isItemActive ? 'active' : ''}">
                <a href="./${fullSubDirName}/${topic}.html">${prefix}</a>
              </li>`;
            }
            
            // Aqui seria possível adicionar recursão para mais níveis, mas limitamos a 2 para simplicidade
            
            groupHtml += `</ul></li>`;
          }
          
          groupHtml += `</ul></li>`;
        } 
        // Verificar se é um arquivo
        else if (rootTopics.some(topic => topic.toLowerCase() === childLower)) {
          const topicName = rootTopics.find(topic => topic.toLowerCase() === childLower);
          const isActive = !activeGroup && activeTopic === topicName;
          groupHtml += generateTopicLink(topicName, '', isActive);
        }
      } else if (typeof child === 'object' && child !== null) {
        // Subgrupo
        if (child.title && Array.isArray(child.children)) {
          groupHtml += renderGroup(child.title, child.children, depth + 1);
        }
      }
    }
    
    return groupHtml;
  }
  
  // Função para processar um diretório como uma pasta expansível
  function processDirectoryAsExpandable(dirName, dirPath, depth = 0) {
    const padding = depth * INDENT;
    renderedItems.add(dirName.toLowerCase());
    
    // Listar arquivos e subdiretórios
    const files = fs.readdirSync(dirPath)
      .filter(name => isFileTopic(name) && !isHiddenSpecial(name))
      .filter(name => !shouldIgnorePath(`${dirName}/${name}`))
      .sort();
    
    const subDirs = fs.readdirSync(dirPath)
      .filter(name => isDir(path.join(dirPath, name)))
      .filter(name => !shouldIgnorePath(`${dirName}/${name}`))
      .sort();
    
    // Verificar se este diretório está ativo ou qualquer subdiretório está ativo
    const isActive = activeGroup === dirName || (activeGroup && activeGroup.startsWith(dirName + '/'));
    
    // Criar elemento de pasta expansível
    html += `
      <li class="group ${isActive ? 'open' : ''}">
        <div class="group-header" onclick="toggleFolder(this)">
          <span class="dropdown-arrow ${isActive ? 'open' : ''}">▶</span> 📁 ${dirName.split('/').pop().replace(/_/g, ' ')}
        </div>
        <ul class="group-content" style="${isActive ? 'max-height:none;' : 'max-height:0;'}">
    `;
    
    // Adicionar arquivos do diretório
    for (const file of files) {
      const topic = path.basename(file, path.extname(file));
      const isItemActive = activeGroup === dirName && activeTopic === topic;
      const method = methodOf(topic);
      const { baseTopic, postTag, tagType } = getPostTag(topic);
      
      let label = baseTopic;
      if (method) {
        const dashIdx = baseTopic.indexOf('-');
        label = dashIdx !== -1 ? baseTopic.slice(dashIdx + 1) : baseTopic;
      }
      
      label = String(label).replace(/_/g, ' ');
      const prefix = method ? 
        tagHTML(method, label, postTag, tagType) : 
        tagHTML(null, '| ' + label, postTag, tagType);
        
      html += `<li class="item-sidebar ${isItemActive ? 'active' : ''}">
        <a href="./${dirName}/${topic}.html">${prefix}</a>
      </li>`;
    }
    
    // Processar subdiretórios recursivamente
    for (const subDir of subDirs) {
      const subDirPath = path.join(dirPath, subDir);
      const fullSubDirName = `${dirName}/${subDir}`;
      processDirectoryAsExpandable(fullSubDirName, subDirPath, depth + 1);
    }
    
    // Fechar a pasta expansível
    html += `</ul></li>`;
  }
  
  // Renderiza a sidebar conforme a configuração
  for (const item of sidebarConfig) {
    if (typeof item === 'string') {
      // Item simples
      if (item.toLowerCase() === 'home') continue; // Home já foi adicionado
      
      const itemLower = item.toLowerCase();
      
      // Verificar se é um diretório ou arquivo e adicionar diretamente (não em um grupo)
      if (rootDirs.some(dir => dir.toLowerCase() === itemLower)) {
        const dirName = rootDirs.find(dir => dir.toLowerCase() === itemLower);
        const dirPath = path.join(bodyPath, dirName);
        // Processar diretório como pasta expansível
        processDirectoryAsExpandable(dirName, dirPath);
      } 
      else if (rootTopics.some(topic => topic.toLowerCase() === itemLower)) {
        const topicName = rootTopics.find(topic => topic.toLowerCase() === itemLower);
        const isActive = !activeGroup && activeTopic === topicName;
        html += generateTopicLink(topicName, '', isActive);
      }
    } else if (typeof item === 'object' && item !== null) {
      // Grupo com título e filhos
      if (item.title && Array.isArray(item.children)) {
        html += renderGroup(item.title, item.children);
      }
    }
  }
  
  // Verifica se há itens não configurados para adicionar no final
  const unconfiguredTopics = rootTopics.filter(topic => 
    !renderedItems.has(topic.toLowerCase()) && 
    topic.toLowerCase() !== 'search' && 
    topic.toLowerCase() !== 'home'
  );
  
  const unconfiguredDirs = rootDirs.filter(dir => 
    !renderedItems.has(dir.toLowerCase()) && 
    !shouldIgnorePath(dir)
  );
  
  // Adicionar itens não configurados diretamente sem título de grupo
  if (unconfiguredTopics.length > 0 || unconfiguredDirs.length > 0) {
    // Adicionar diretórios não configurados primeiro
    for (const dir of unconfiguredDirs) {
      const dirPath = path.join(bodyPath, dir);
      processDirectoryAsExpandable(dir, dirPath);
    }
    
    // Adicionar tópicos não configurados depois
    for (const topic of unconfiguredTopics) {
      const isActive = !activeGroup && activeTopic === topic;
      html += generateTopicLink(topic, '', isActive);
    }
  }

  // Footer estático no final da sidebar
  const footer = `
  <footer class="rhyla-footer">
    <p style="margin:0;font-size:13px;color:var(--rh-muted);">&copy; 2025 - Made with Rhyla</p>
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
