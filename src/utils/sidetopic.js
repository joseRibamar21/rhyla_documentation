/**
 * Utilitários para geração de tópicos laterais (TOC - Table of Contents)
 * Atualmente, o TOC é gerado principalmente no lado do cliente pelo header-runtime.js
 */

/**
 * Gera o HTML para o painel lateral de tópicos
 * @param {object} options - Opções para geração do TOC
 * @param {string} [options.content] - Conteúdo HTML/Markdown para extrair cabeçalhos
 * @param {string} [options.contentPath] - Caminho do arquivo para ler conteúdo
 * @param {boolean} [options.includeH1=true] - Se deve incluir cabeçalhos H1
 * @returns {string} HTML do painel de tópicos lateral
 */
export function generateSideTopics(options = {}) {
    // Esta função pode ser expandida para gerar TOC no servidor
    // Por enquanto, retorna apenas o container base que será preenchido pelo cliente
    return `<aside id="rhyla-right-toc" class="rhyla-right-toc" aria-label="Table of contents">
    <div class="rh-toc-header">On this page</div>
    <nav class="rh-toc-wrap">
      <div class="rh-toc-loading">Loading topics...</div>
    </nav>
  </aside>`;
}
