# Rhyla

Gerador simples de documentação estática a partir de arquivos Markdown.

## ✨ Funcionalidades
- Geração de documentação estática em HTML
- Visualização local com servidor Express
- Suporte a temas claro e escuro (Light/Dark)
- Estrutura de templates customizáveis

## 🚀 Instalação

```bash
npm install
```

## 🛠️ Comandos

- `rhyla init`  
  Cria a estrutura base de documentação na pasta `rhyla/`.

- `rhyla dev`  
  Inicia um servidor local para pré-visualização em `http://localhost:3000`.

- `rhyla build`  
  Gera HTML estático na pasta `docs/`.

## 📁 Estrutura Gerada

```
rhyla/
  body/           # Páginas em Markdown
  styles/         # Temas CSS (light/dark)
  header.html     # Cabeçalho HTML
  footer.html     # Rodapé HTML
  home.html       # Página inicial
  config.yaml     # Configurações do projeto
```

## 👨‍💻 Como usar

1. Inicialize o projeto:
   ```bash
   rhyla init
   ```
2. Edite os arquivos Markdown em `rhyla/body/` para criar suas páginas.
3. Visualize localmente:
   ```bash
   rhyla dev
   ```
4. Gere a documentação estática:
   ```bash
   rhyla build
   ```
5. O resultado estará em `docs/`.

## 🌗 Troca de Tema

Clique no botão no topo da página para alternar entre tema claro e escuro. A escolha é salva no navegador.

## 📄 Licença
MIT
