// Definições de tipos para o módulo Rhyla
declare module 'rhyla' {
  interface RhylaConfig {
    title?: string;
    port?: number;
    host?: string;
    base?: string;
    side_topics?: boolean;
    [key: string]: any;
  }

  interface RhylaClient {
    expressConfig: (app: any, base?: string, options?: any) => void;
  }

  // Cliente Rhyla para uso no navegador
  const RhylaClient: RhylaClient;
  export default RhylaClient;

  // Exportações adicionais
  export function withBase(base: string, path: string): string;
}

// Versão renomeada exportada pelo arquivo principal
declare module 'rhyla' {
  export function generateSidebar(options?: any): string;
}

declare module 'rhyla/src/utils/sidetopic.js' {
  export function generateSideTopics(options?: any): string;
}
