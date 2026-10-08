# 📚 Rhyla Documentation

**Rhyla** is a simple CLI that turns a folder of **Markdown** files into a documentation site with a folder-based sidebar, search, light/dark themes and a static build. It also publishes your docs in formats **AI agents** can read directly (`llms.txt`, per-page `.md`).

---

## 🛠 Usage

```bash
npx rhyla init    # creates rhyla-docs/
npx rhyla dev     # preview at http://localhost:3333
npx rhyla build   # static site in dist/
npx rhyla serve   # build + serve dist/ under the configured base path
npx rhyla mcp     # MCP server for AI agents (stdio)
```

| Command | Options |
|---------|---------|
| `init`  | `-f, --force` overwrite template files if `rhyla-docs/` already exists |
| `dev`   | `-p, --port <port>` (default `3333`), `-H, --host <host>` (default `127.0.0.1`) |
| `serve` | `-b, --base <base>`, `-p, --port <port>`, `-d, --dir <dir>`, `--no-build` |
| `mcp`   | `-d, --dir <dir>` project root, `--read-only` |

`rhyla init` creates:

```
rhyla-docs/
  config.json     # site settings
  header.html     # shared <head> and top bar
  AGENTS.md       # authoring conventions for AI coding agents
  styles/         # global.css, light.css, dark.css
  public/         # static assets served at /public
  body/           # your pages
    home.md       # landing page (required)
    notFound.html # 404 page
```

---

## ✏️ Writing pages

- Each **folder** in `body/` is a sidebar group; each **`.md`/`.html` file** is a page.
- The file path is the route: `body/guide/install.md` → `/guide/install`.
- `.md` is rendered from Markdown; `.html` is included as-is (scripts and `on*` attributes are stripped unless `allow_raw_html` is `true`).

### Frontmatter

```markdown
---
title: Install                       # sidebar label, <title>, search and llms.txt
description: How to install the CLI  # <meta description> and llms.txt summary
order: 1                             # sidebar order inside the folder (lower first)
---
```

All fields are optional. Without `title`, the first `# H1` is used, then the file name. Without `order`, pages are sorted alphabetically after the ordered ones.

### Flows

A flow connects pages into a process (user journeys, API call sequences, troubleshooting trees). It is a page with `type: flow` and a list of `steps`:

```markdown
---
title: Checkout
type: flow
steps:
  - { id: cart, page: api/cart/get-cart, next: pay }
  - id: pay
    page: api/payments/post-pay
    next:
      - { to: done, label: approved }
      - { to: declined, label: declined }
  - { id: done, page: checkout/confirmation }
  - { id: declined, title: Payment declined, next: { to: pay, label: retry } }
---
```

Rhyla draws the diagram (clickable steps, branches and loops), adds previous/next navigation and a mini-map to every page in the flow, and lists the steps in the `.md` output for agents. Steps without `page` are text or decision nodes. `rhyla init` includes an example in `body/flows/`.

### API pages

The file name can carry an HTTP method and tags, rendered as badges in the sidebar: `post-create_user-new.md` → **POST** create user **new**. Methods: `get-`, `post-`, `put-`, `patch-`, `delete-`. Tags: `-new`, `-dep`, `-v1`, `-v1.2.0`…

In `rhyla dev`, the **API Page Generator** at `/kit_dev_rhyla/new_rote` builds these pages from a form (it is never included in the build).

---

## ⚙️ config.json

```json
{
  "title": "My Docs",
  "description": "What this documentation is about",
  "site_url": "https://docs.example.com",
  "base": "/",
  "side_topics": true,
  "allow_raw_html": false,
  "build_ignore": ["drafts", "*.draft.md"]
}
```

| Key | Purpose |
|-----|---------|
| `title`, `description` | Site name and summary (page `<title>`, `llms.txt`) |
| `site_url` | Public URL. Enables `sitemap.xml`, `robots.txt`, canonical links and absolute URLs in `llms.txt` |
| `base` | Sub-path when hosted under a prefix, e.g. `/docs/` |
| `side_topics` | "On this page" table of contents |
| `allow_raw_html` | Allow raw HTML in `.md` and scripts in `.html` pages |
| `build_ignore` | Names, paths or `*` patterns (relative to `body/`) left out of the build |

---

## 🤖 For AI agents

`rhyla build` (and `rhyla dev`) publish, next to the HTML:

| Path | Content |
|------|---------|
| `/llms.txt` | Index of every page with links and descriptions ([llmstxt.org](https://llmstxt.org)) |
| `/llms-full.txt` | All pages concatenated as Markdown |
| `/<route>.md` | Markdown source of each `.md` page (home is `/index.md`) |
| `/search_index.json` | `[{ route, title, content }]` |

Every HTML page also links its Markdown version with `<link rel="alternate" type="text/markdown">`.

### MCP server

`rhyla mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so agents (Claude Code, Cursor, VS Code…) can work with the docs directly:

| Tool | What it does |
|------|--------------|
| `list_pages` | All pages (route, title, description, file), optionally filtered by folder |
| `search_docs` | Full-text search, case and accent insensitive |
| `read_page` | Source of a page (Markdown with frontmatter) |
| `get_flow` | Lists flows, or the steps and transitions of one flow |
| `get_conventions` | The project's `AGENTS.md` (layout, frontmatter, naming) |
| `write_page` | Create or update a Markdown page inside `rhyla-docs/body` |

Claude Code:

```bash
claude mcp add rhyla -- npx rhyla mcp
```

Other clients (`.mcp.json`, Cursor, VS Code):

```json
{
  "mcpServers": {
    "rhyla": { "command": "npx", "args": ["rhyla", "mcp"] }
  }
}
```

Options: `--dir <path>` (project root, default: current directory) and `--read-only` (no `write_page`).

Agents that only edit files can follow `rhyla-docs/AGENTS.md`, which documents the layout, frontmatter and naming conventions.

---

## 🚀 Serving under Express

```js
import express from 'express';
import RhylaClient from 'rhyla';

const app = express();
RhylaClient.expressConfig(app, '/docs'); // serves ./dist under /docs
app.listen(3000);
```

---

## 🧪 Development

```bash
npm install
npm test
```

---

## 🗺️ Roadmap

Flow editor, Notion-like page editor and more: see [ROADMAP.md](ROADMAP.md).

---

## Contributing

Contributions are welcome! Open issues or pull requests on [GitHub](https://github.com/joseRibamar21/rhyla_documentation).

<div align="left">
  <a href="https://github.com/joseRibamar21" target="_blank">
    <img src="https://github.com/joseRibamar21.png" width="64" height="64" alt="joseRibamar21" style="border-radius:50%;margin-top:8px;" />
  </a>
</div>

## 📄 License

MIT. See [LICENCE](LICENCE).
