# 📚 Documentação do Rhyla

**Rhyla Documentation** é uma ferramenta simples e flexível para criar e organizar documentação rapidamente usando arquivos **Markdown** e templates personalizáveis. A ideia principal é permitir que desenvolvedores mantenham toda a documentação do projeto organizada, navegável e com suporte a temas claro/escuro, sem depender de ferramentas pesadas ou configurações complexas.

---

## 🚀 Motivação
- Tornar fácil a criação de documentação local e estática.
- Usar **Markdown** para que o conteúdo seja simples de escrever e manter.
- Permitir personalização completa do **header**, **footer**, **sidebar** e **temas**.
- Fornecer um fluxo simples de desenvolvimento (`rhyla dev`) e geração estática (`rhyla build`).

---

## 🛠 Uso Básico
1. Instale o projeto globalmente ou use via CLI local.
2. Execute:
	```bash
	rhyla init
	```
	Isso criará a estrutura inicial com:
	- `header.html`
	- `config.yaml`
	- `home.md` (esta página)
	- pasta `body` para seus tópicos

3. Durante o desenvolvimento, use:
	```bash
	rhyla dev
	```
	Isso inicia um servidor local para preview.

4. Para gerar a documentação estática, use:
	```bash
	rhyla build
	```
	Isso produzirá a pasta `dist/` com os arquivos HTML gerados.

---

## ✏️ Personalize!
Recomenda-se editar `home.md` para adaptar ao contexto do seu projeto.

### Como a navegação é construída
A sidebar é gerada automaticamente a partir da árvore de diretórios dentro de `rhyla/body/`:
- Cada PASTA dentro de `body/` funciona como um GRUPO/CATEGORIA.
- Cada arquivo `.md` vira uma página processada (Markdown → HTML).
- Cada arquivo `.html` é incluído diretamente (útil para páginas altamente customizadas).
- O caminho do arquivo define a rota. Ex.: `rhyla/body/guides/install.md` → rota `/guides/install`.
- A ordem padrão é alfabética (pastas e arquivos). Use nomes claros e consistentes.

### Criando grupos e tópicos
Exemplo de estrutura:
```
rhyla/
  body/
	 introduction.md
	 quickstart.md
	 guide/
		install.md
		config.md
	 api/
		auth.md
		users.html
```

Rotas geradas:
```
/introduction
/quickstart
/guide/install
/guide/config
/api/auth
/api/users
```

### Boas práticas de nomeação
- Use letras minúsculas e hífen ou camelCase: `advanced-install.md` ou `advancedInstall.md`.
- Evite espaços e caracteres especiais.
- Prefira nomes curtos, descritivos e estáveis.

### Quando usar .md ou .html
| Situação | Use .md | Use .html |
|----------|--------:|----------:|
| Texto comum, narrativa | ✅ | |
| Código com formatação simples | ✅ | |
| Layout totalmente customizado | | ✅ |
| Componentes HTML prontos | | ✅ |

### Dicas extras
- Comece simples: crie poucos `.md` e verifique a navegação.
- Precisa de uma página especial (landing interna)? Crie um `.html` nessa pasta.
- Remodelando a documentação? Mova/renomeie pastas/arquivos e reinicie o servidor (ou atualize a página) para refletir as mudanças.

---

## ⚠️ Limitações
- A navegação e estrutura dependem do uso de `.md` ou `.html`.
- A sidebar é gerada pela estrutura de pastas, então nomes de arquivo/pasta definem grupos e tópicos.
- O sistema não processa automaticamente links externos no menu.
- Para alterações globais de layout, edite `header.html`, `footer.html` e os estilos do tema.
- Sem suporte a plugins/extensões no momento.

---

## 🔎 Sobre Busca e Indexação
- Todas as páginas de documentação (`.md` e `.html`) são indexadas e usadas na página de busca (`/search`).
- O sistema de busca depende desse índice para resultados rápidos e relevantes.
- Para funcionamento correto, **não remova ou renomeie a página de busca** (`search.html` em `rhyla/body`).

