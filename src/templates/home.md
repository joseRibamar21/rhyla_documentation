# 📚 Rhyla Documentation

O **Rhyla Documentation** é uma ferramenta simples e flexível para criar e organizar documentações de forma rápida, utilizando arquivos **Markdown** e templates personalizáveis.  
A ideia central é permitir que o desenvolvedor mantenha toda a documentação de um projeto organizada, navegável e com suporte a temas claros e escuros, sem depender de ferramentas pesadas ou configurações complexas.

---

## 🚀 Motivações
- Facilitar a criação de documentações locais e estáticas.
- Usar **Markdown** para que o conteúdo seja fácil de escrever e manter.
- Permitir customização total de **header**, **footer**, **sidebar** e **temas**.
- Ter um fluxo simples de desenvolvimento (`rhyla dev`) e geração (`rhyla build`).

---

## 🛠 Uso básico
1. Instale o projeto globalmente ou use via CLI local.
2. Execute:
   ```bash
   rhyla init
    ```
Isso criará a estrutura inicial com:
- header.html
- footer.html
- config.yaml
- home.md (esta página)
- Pasta body para os tópicos

3. Durante o desenvolvimento, use:
   ```bash
   rhyla dev
   ```
Isso iniciará um servidor local em `http://localhost:3000` para pré-visualização.

4. Para gerar a documentação estática, use:
   ```bash
   rhyla build
   ```
Isso criará a pasta `rhyla/` com os arquivos HTML gerados.

---

## ✏️ Comece personalizando!
A primeira ação recomendada é adaptar este `home.md` para o contexto do seu projeto.

### Como a navegação é formada
A sidebar é construída automaticamente a partir da árvore de diretórios dentro de `rhyla/body/`:
- Cada PASTA dentro de `body/` funciona como um GRUPO / CATEGORIA.
- Cada ARQUIVO `.md` vira uma página processada (Markdown → HTML).
- Cada ARQUIVO `.html` é incluído como está (útil para páginas altamente customizadas).
- O caminho do arquivo define a rota. Ex: `rhyla/body/guias/instalacao.md` → rota `/guias/instalacao`.
- A ordem padrão é alfabética (nomes de pastas e arquivos). Use nomes claros e consistentes.

### Criando grupos e tópicos
Estrutura de exemplo:
```
rhyla/
  body/
    introducao.md
    guiadeuso.md
    guia/
      instalacao.md
      configuracao.md
    api/
      autenticacao.md
      usuarios.html
```
Rotas geradas:
```
/introducao
/guiadeuso
/guia/instalacao
/guia/configuracao
/api/autenticacao
/api/usuarios
```

### Boas práticas de nomes
- Use letras minúsculas e hifens ou nada: `instalacao-avancada.md` ou `instalacaoAvancada.md`.
- Evite espaços e caracteres especiais.
- Escolha nomes curtos, descritivos e estáveis.

### Quando usar .md ou .html
| Situação | Use .md | Use .html |
|----------|--------|-----------|
| Texto comum, documentação narrativa | ✅ | |
| Código com formatação simples | ✅ | |
| Layout totalmente customizado | | ✅ |
| Componentes HTML prontos | | ✅ |

### Dicas extras
- Comece simples: crie só alguns arquivos `.md` e verifique a navegação.
- Se precisar de uma página especial (landing interna), crie um `.html` naquela pasta.
- Reestruturar? Apenas mova/renomeie pastas/arquivos e reinicie o servidor (ou recarregue) para refletir.

--- 

## ⚠️ Limitações
- Navegação e estrutura dependem do uso de arquivos .md ou .html.

- A sidebar é gerada com base na estrutura de pastas, portanto nomes de pastas e arquivos definem grupos e tópicos.
- O sistema não processa links externos automaticamente no menu.
- Para mudanças no layout global, é necessário alterar os arquivos header.html, footer.html e os estilos de tema.
- Não há suporte a plugins ou extensões no momento.

--- 

## 📄 Licença
Este projeto está licenciado sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

--- 

## 🔗 Link do projeto
[https://github.com/joseRibamar21/rhyla_documentation](https://github.com/joseRibamar21/rhyla_documentation)