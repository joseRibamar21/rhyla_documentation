/**
 * Rhyla - Sistema de documentação simples
 * 
 * Este é o arquivo principal de exportação do Rhyla.
 * Permite importações simplificadas como: import RhylaClient from 'rhyla'
 */

// Importa o cliente principal e funções úteis
import RhylaClient from './src/client/index.js';

// Garante que o RhylaClient seja exportado corretamente com apenas expressConfig
const EnhancedRhylaClient = {
  expressConfig: RhylaClient.expressConfig,
  // Não inclui mais middleware, apenas expressConfig
};

// Exporta o cliente principal
export default EnhancedRhylaClient;

