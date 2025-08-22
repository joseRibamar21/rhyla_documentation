// Script de teste para verificar as importações e funcionalidades do Rhyla
import RhylaClient, { withBase } from './index.js';

console.log('=== Teste de importação do Rhyla ===');

// Verifica se o RhylaClient é um objeto válido
console.log('RhylaClient é um objeto?', typeof RhylaClient === 'object' && RhylaClient !== null);
console.log('RhylaClient:', Object.keys(RhylaClient));

// Verifica se os métodos específicos existem
console.log('\n=== Verificação de métodos do RhylaClient ===');
console.log('expressConfig é uma função?', typeof RhylaClient.expressConfig === 'function');
console.log('middleware foi removido para simplificação da API');

// Verifica a função utilitária withBase
console.log('\n=== Teste da função withBase ===');
console.log('withBase é uma função?', typeof withBase === 'function');
console.log('withBase("/docs", "/guide") =', withBase('/docs', '/guide'));

// Teste do expressConfig (substituição do teste de middleware)
console.log('\n=== Teste de expressConfig ===');
try {
    const mockApp = { use: () => {}, get: () => {} };
    RhylaClient.expressConfig(mockApp, '/docs');
    console.log('expressConfig executado com sucesso');
} catch (error) {
    console.error('Erro ao usar expressConfig:', error);
}

console.log('\n=== Teste concluído ===');
