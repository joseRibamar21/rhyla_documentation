/**
 * generatePages.js
 * Funções para construir e gerar páginas de documentação da API
 */

/**
 * Constrói o caminho do arquivo com base no caminho da rota, método HTTP e tags
 * @param {string} routePathValue - O caminho da rota (ex: /api/users)
 * @param {string} selectedMethod - O método HTTP selecionado (ex: GET, POST)
 * @param {string[]} selectedTags - As tags selecionadas (ex: ['new', 'v1'])
 * @returns {string} - O caminho completo do arquivo
 */
export function buildFilePath(routePathValue, selectedMethod, selectedTags) {
    // 1. Garantir que o caminho da rota está definido
    routePathValue = routePathValue || '/api/endpoint';
    
    // 2. Garantir que começa com barra
    if (!routePathValue.startsWith('/')) {
        routePathValue = '/' + routePathValue;
    }

    // 3. Remover a última barra se existir
    if (routePathValue.endsWith('/')) {
        routePathValue = routePathValue.slice(0, -1);
    }
    
    // 4. Extrair diretório e nome do arquivo
    const pathSegments = routePathValue.split('/').filter(segment => segment.trim() !== '');
    let fileName = pathSegments.pop() || 'endpoint';
    
    // 5. Substituir espaços por underscores no nome do arquivo
    fileName = fileName.replace(/\s+/g, '_');
    
    // 6. Aplicar método HTTP como prefixo (deve estar antes do nome conforme especificado)
    fileName = selectedMethod.toLowerCase() + '-' + fileName;
    
    // 7. Adicionar tags se houver (vão após o nome, conforme especificado)
    if (selectedTags && selectedTags.length > 0) {
        // Adiciona cada tag com um hífen, conforme a convenção
        selectedTags.forEach(tag => {
            fileName += `-${tag}`;
        });
    }
    
    // 8. Construir o caminho final
    let finalPath = '/';
    if (pathSegments.length > 0) {
        finalPath += pathSegments.join('/') + '/';
    }
    finalPath += fileName;
    
    console.log('Caminho final do arquivo:', finalPath);
    return finalPath;
}

/**
 * Função para uso do cliente que será injetada no navegador
 * Esta função envia uma requisição para o servidor local em execução
 * @param {string} filePath - O caminho do arquivo a ser gerado
 * @param {string} content - O conteúdo markdown do arquivo
 * @returns {Promise} - Uma promessa que resolve com o resultado da criação do arquivo
 */
export async function generateMDFile(filePath, content) {
    const response = await fetch('/generate-page', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            filePath: filePath,
            content: content
        })
    });
    if (!response.ok) {
        throw new Error('Erro ao gerar arquivo: ' + response.statusText);
    }
    return await response.json();
}
