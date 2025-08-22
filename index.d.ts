// Definições de tipos para o módulo Rhyla
declare module 'rhyla' {

  interface RhylaClient {
    expressConfig: (app: any, base?: string, options?: any) => void;
  }

  // Cliente Rhyla para uso no navegador
  const RhylaClient: RhylaClient;
  export default RhylaClient;

}

