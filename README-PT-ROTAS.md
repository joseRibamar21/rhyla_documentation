# Rhyla - Sistema de Navegação por Rotas Relativas

Este documento explica as alterações feitas para implementar navegação por rotas relativas no sistema Rhyla, considerando tanto a URL base quanto a configuração de `base` no arquivo `config.json`.

## Visão Geral das Alterações

Foram feitas alterações em vários arquivos para garantir que o sistema Rhyla funcione corretamente com:

1. Rotas relativas em todo o código
2. Suporte a basePath configurable via `config.json` ou `RhylaClient.expressConfig()`
3. Consistência na navegação por sidebar, search e TOC

## Detalhes das Alterações

### 1. `src/templates/scripts/header-runtime.js`

- Adicionada função `getPrefix()` que obtém o prefixo (basePath) na seguinte ordem de prioridade:
  1. Meta tag `rhyla-base` (definida no build)
  2. `window.__rhyla_prefix__` (definida pelo script inline)
  3. Fallback para '/'
- Melhorada a função `fixSidebarLinks()` para garantir que links da sidebar usem o prefixo correto
- Adicionado suporte para corrigir links na busca

### 2. `src/templates/header.html`

- Modificado para usar rotas relativas em vez de absolutas
- Adicionado script para determinar o prefixo base a partir da meta tag ou calcular com base no contexto
- Logo agora usa caminhos relativos baseados no PREFIX

### 3. `src/commands/build.js`

- Adicionada função `rewriteForBase()` para reescrever URLs absolutas em HTML estático:
  - `src="/path"` → `src="/base/path"`
  - `href="/path"` → `href="/base/path"`
  - `url(/path)` → `url(/base/path)` (em CSS inline)
- Todas as páginas geradas agora passam pela função `rewriteForBase()` antes de serem escritas

### 4. `src/client/index.js`

- Refatorado `RhylaClient.expressConfig()` para:
  - Normalizar o caminho base
  - Verificar e usar `base` do config.json quando não especificado explicitamente
  - Adicionar middleware para injetar basePath em respostas HTML
  - Implementar função `withBase()` para evitar duplicação de prefixos
  - Corrigir rotas de fallback SPA para trabalhar com basePath

### 5. `src/templates/scripts/search-runtime.js`

- Atualizado para usar o prefixo definido na meta tag `rhyla-base`
- Modificado para corrigir URLs nos resultados de busca, adicionando o prefixo quando necessário

## Como Funciona

O sistema agora usa uma abordagem consistente para lidar com rotas:

1. **No build time**:
   - O valor de `base` de `config.json` é lido e normalizado
   - Uma meta tag `rhyla-base` é injetada no HTML
   - Todas as URLs absolutas são reescritas para incluir o basePath

2. **No runtime**:
   - O script determina o prefixo correto pela meta tag `rhyla-base` ou outros meios
   - Links da sidebar são corrigidos para usar o prefixo
   - A navegação SPA respeita o prefixo
   - Os resultados da busca usam URLs corrigidas

3. **No Express (servidor)**:
   - O cliente Express reescreve respostas HTML para incluir o basePath
   - As rotas são configuradas para servir arquivos sob o basePath
   - O fallback SPA é configurado para funcionar com basePath

## Como Usar

### Com Build Estático

1. Defina a propriedade `base` em `config.json`:

```json
{
  "title": "Minha Documentação",
  "base": "/docs"
}
```

2. Execute o build:

```bash
npx rhyla build
```

### Com Express

```javascript
import express from 'express';
import { RhylaClient } from 'rhyla';

const app = express();

// O basePath pode ser definido aqui
RhylaClient.expressConfig(app, '/docs', {
  distDir: './dist' // opcional
});

app.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000/docs');
});
```

## Observações

- O sistema prioriza o basePath na ordem: argumento do cliente > config.json > fallback '/'
- As URLs absolutas são automaticamente prefixadas com o basePath
- O basePath é normalizado para sempre começar com `/` e não terminar com `/`
- As âncoras internas (#) são mantidas relativas ao documento atual
