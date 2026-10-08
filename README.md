# 📚 Rhyla Documentation

**Rhyla** is a simple CLI that turns a folder of **Markdown** files into a documentation site with a folder-based sidebar, search, light/dark themes and a static build. It also publishes your docs in formats **AI agents** can read directly (`llms.txt`, per-page `.md`).

---

## 🛠 Usage

```bash
npx rhyla init    # creates rhyla-docs/
npx rhyla dev     # preview at http://localhost:3333
npx rhyla build   # static site in dist/
npx rhyla serve   # build + serve dist/ under the configured base path
```

| Command | Options |
|---------|---------|
| `init`  | `-f, --force` overwrite template files if `rhyla-docs/` already exists |
| `dev`   | `-p, --port <port>` (default `3333`), `-H, --host <host>` (default `127.0.0.1`) |
| `serve` | `-b, --base <base>`, `-p, --port <port>`, `-d, --dir <dir>`, `--no-build` |

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

To let a coding agent **write** docs, point it at `rhyla-docs/AGENTS.md`, which documents the layout, frontmatter and naming conventions.

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

## Contributing

Contributions are welcome! Open issues or pull requests on [GitHub](https://github.com/joseRibamar21/rhyla_documentation).

<div align="left">
  <a href="https://github.com/joseRibamar21" target="_blank">
    <img src="https://github.com/joseRibamar21.png" width="64" height="64" alt="joseRibamar21" style="border-radius:50%;margin-top:8px;" />
  </a>
</div>

## 📄 License

MIT. See [LICENCE](LICENCE).
