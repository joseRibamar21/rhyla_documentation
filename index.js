/**
 * Rhyla - Sistema de documentação simples
 * 
 * Este é o arquivo principal de exportação do Rhyla.
 * Permite importações simplificadas como: import RhylaClient from 'rhyla'
 */

// Importa o cliente principal e funções úteis
import RhylaClient, { withBase } from './src/client/index.js';

// Garante que o RhylaClient seja exportado corretamente com apenas expressConfig
const EnhancedRhylaClient = {
  expressConfig: RhylaClient.expressConfig,
  // Não inclui mais middleware, apenas expressConfig
};

// Exporta o cliente principal
export default EnhancedRhylaClient;

// Re-exporta funções úteis
export { withBase };

// Exporta utilitários de sidebar para facilitar o uso direto
import { generateSidebarHTML } from './src/utils/sidebar.js';
export { generateSidebarHTML }; // Exporta com o nome correto
export { generateSideTopics } from './src/utils/sidetopic.js';
