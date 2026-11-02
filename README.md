# 📚 Rhyla Documentation

**Rhyla** is a simple CLI that turns a folder of **Markdown** files into a documentation site with a folder-based sidebar, search, light/dark themes and a static build. It also publishes your docs in formats **AI agents** can read directly (`llms.txt`, per-page `.md`) and, for APIs, an `openapi.json` built from the route pages.

---

## 🛠 Usage

```bash
npx rhyla init    # creates rhyla-docs/
npx rhyla dev     # preview at http://localhost:3333
npx rhyla build   # static site in dist/
npx rhyla serve   # build + serve dist/ under the configured base path
npx rhyla mcp     # MCP server for AI agents (stdio)
npx rhyla import openapi.yaml           # route pages from an OpenAPI / Swagger spec or a Postman collection
npx rhyla openapi export                # openapi.json from the route pages
npx rhyla check   # route pages vs. routes in the code, for CI
```

| Command | Options |
|---------|---------|
| `init`  | `-f, --force` overwrite template files if `rhyla-docs/` already exists, `--blank` only the structure, without the sample pages, `--import <file\|url>` also write the route pages from a spec or a Postman collection |
| `dev`   | `-p, --port <port>` (default `3333`), `-H, --host <host>` (default `127.0.0.1`) |
| `serve` | `-b, --base <base>`, `-p, --port <port>`, `-d, --dir <dir>`, `--no-build` |
| `mcp`   | `-d, --dir <dir>` project root, `--read-only` |
| `import <file\|url>` | `--dry-run` only show what would change, `--no-update` leave existing route pages untouched (`openapi import` is the same command) |
| `openapi export` | `-o, --output <file>` (default `openapi.json`, `-` for stdout) |
| `check` | `--ignore <patterns...>` routes to leave out, `--strict` warnings also fail, `--json` |

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

**Flow editor.** While `rhyla dev` is running, open `http://localhost:3333/__rhyla/flow-editor` (or click **Edit flow** on any flow page) to build flows visually: add steps by searching pages (or create a page on the spot), connect them on the canvas, label branches, undo/redo, and save. It writes the same frontmatter shown above, so flows stay editable by hand and by AI agents.

### Page editor

While `rhyla dev` is running, every Markdown page has an **Edit page** button (or open `http://localhost:3333/__rhyla/page-editor?page=guide/install`). It is a block editor in the style of Notion, built into Rhyla with no external libraries:

- Blocks: text, headings, bulleted/numbered/to-do lists (with nesting), quotes, code, tables, images, dividers and raw HTML
- `/` menu to insert or turn blocks into another type; Markdown shortcuts while typing (`#`, `-`, `1.`, `[]`, `>`, ```` ``` ````, `---`)
- Drag handle to reorder blocks; block menu to duplicate, move, indent or delete
- Inline formatting with the floating toolbar, shortcuts (Ctrl+B/I/E/K) or by typing `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`
- Title, description and order edited as page properties (the rest of the frontmatter is kept)
- Paste Markdown to create blocks; paste or drop images (saved to `public/uploads/`)
- Autosave to the `.md` file. Pages are saved as plain Markdown and produce the same `dist/` output; the **Markdown** button shows exactly what will be written.

### API pages

The file name can carry an HTTP method and tags, rendered as badges in the sidebar: `post-create_user-new.md` → **POST** create user **new**. Methods: `get-`, `post-`, `put-`, `patch-`, `delete-`. Tags: `-new`, `-dep`, `-v1`, `-v1.2.0`…

Describe the endpoint in an `api` block in the frontmatter. Rhyla renders the reference from it (endpoint, authentication, parameters, request body, responses and request examples in curl, JavaScript or Python) and adds it to `openapi.json`, so the text of the page only has to explain what the block cannot:

```markdown
---
title: Create task
api:
  method: POST
  path: /lists/:listId/tasks
  auth: bearer
  params:
    listId: integer
  body:
    fields:
      title: { type: string, required: true, description: What to do }
      done: { type: boolean, default: false }
    example: { title: Buy bread }
  responses:
    201: { description: Created, fields: { id: integer }, example: { id: 1 } }
    400: title is missing or empty
---

# Create task

Tasks are created at the end of the list. The id is generated by the server.
```

The full format is in `rhyla-docs/AGENTS.md`. The generated headings follow the language chosen in the preferences (English, Portuguese or Spanish), and the reference goes after the introduction, before the first `## ` section.

#### Importing OpenAPI, Swagger or Postman

`rhyla import <file|url>` writes one route page per operation, without AI. The format is detected from the content, and the same works in the first step of the setup wizard and with `rhyla init --import <file|url>`.

- **OpenAPI 3 / Swagger 2**, in JSON or YAML (or a URL such as `http://localhost:3000/docs/json`): `$ref`s are resolved and simple schemas become `fields`. The spec's server becomes `api.base_url`.
- **Postman collections** (v2.0 / v2.1, exported with ⋯ → Export): folders become sidebar folders, `{{baseUrl}}` becomes `api.base_url`, `:id` and `{{id}}` in the path become parameters, and the auth (inherited from the folder or the collection) becomes `auth`. Saved example responses become the responses, with their fields read from the JSON. A test script that saves the token (`pm.environment.set("token", …)`) marks the login route for the Try it panel. Requests that repeat an endpoint are merged into the first one.
- **Secrets stay out**, because the docs get published: values of `Authorization`, cookies, auth, API keys, passwords and tokens are replaced by placeholders (`<password>`, `<token>`), and the import says how many it left out.
- Importing again only replaces the `api` block of the pages that already document an operation; their text and the rest of the frontmatter stay.
- **Export**: `rhyla build` writes `dist/openapi.json` (OpenAPI 3.0) when some page has an `api` block, and `rhyla dev` serves it at `/openapi.json`. `rhyla openapi export` writes it anywhere, for Postman, client generators or CI. Endpoint pages without a block are listed, so you know what is missing.

In `rhyla dev`, the **API Page Generator** at `/kit_dev_rhyla/new_rote` builds these pages from a form (it is never included in the build).

#### Trying the routes

Every route page (an `api` block, a `# METHOD /path` heading or a method in the file name) gets a **Try it** button in the bottom-right corner while `rhyla dev` runs. The panel comes filled from the block: server, path, query and header parameters, body example and authentication. It shows the status, time, headers and body of the response, and copies the request as curl.

- **Servers**: `api.base_url` and `api.environments` in `config.json`, or any address on your machine. Requests go through `rhyla dev`, so the API needs no CORS; sending a write method to a host that is not `localhost` asks first.
- **Login**: mark the login route with `login: { token: token }` in its `api` block (the path of the token in the response). Calling it from the panel saves the token, and the routes with `auth: bearer` send it, with its expiry next to the field. On other routes, a token in a response is offered too, and you can paste one. The token lives only in the tab's `sessionStorage`, never on disk or in the build. Cookie sessions are kept by `rhyla dev` while it runs.
- **Published site**: the panel is off in `rhyla build`. With `"api": { "try_it": true }` it is included and calls the API straight from the browser, so the API must allow CORS from the docs site. `"try_it": false` turns it off in `rhyla dev` too.

### Checking the docs in CI

`rhyla check` compares the route pages with the HTTP routes Rhyla finds in the code (the same scanner as `find_routes`), without AI, in seconds:

| Errors (exit code 1) | Warnings |
|----------------------|----------|
| Routes in the code without a page | Route pages without an `api` block |
| Pages of routes that are no longer in the code | Routes documented in more than one page |
| Invalid `api` blocks | Flows with broken steps, links to pages that do not exist |

A route page is one with an `api` block, or with a `# METHOD /path` heading (the older format). Paths match regardless of parameter names (`:id` and `{taskId}` are the same), and also when only a prefix differs (a mount the scanner could not follow). Catch-all routes (`*`) are left out. Routes that should not be documented go in `config.json`:

```json
{ "check": { "ignore": ["GET /health", "/internal/*", "* /admin/*"] } }
```

In GitHub Actions, the problems also show up as annotations on the pull request:

```yaml
- run: npx rhyla check
```

---

## ⚙️ config.json

```json
{
  "title": "My Docs",
  "description": "What this documentation is about",
  "logo": "/public/logo.svg",
  "site_url": "https://docs.example.com",
  "base": "/",
  "side_topics": true,
  "allow_raw_html": false,
  "build_ignore": ["drafts", "*.draft.md"],
  "api": { "base_url": "https://api.example.com", "version": "2.1.0" },
  "check": { "ignore": ["GET /health"] }
}
```

| Key | Purpose |
|-----|---------|
| `title`, `description` | Site name and summary (page `<title>`, `llms.txt`) |
| `logo` | Image in `public/` shown in the header instead of the default mark |
| `site_url` | Public URL. Enables `sitemap.xml`, `robots.txt`, canonical links and absolute URLs in `llms.txt` |
| `base` | Sub-path when hosted under a prefix, e.g. `/docs/` |
| `side_topics` | "On this page" table of contents |
| `allow_raw_html` | Allow raw HTML in `.md` and scripts in `.html` pages |
| `build_ignore` | Names, paths or `*` patterns (relative to `body/`) left out of the build |
| `api.base_url` | API server used in the request examples, in `openapi.json` and in the Try it panel |
| `api.environments` | More servers for the Try it panel: `{ "Staging": "https://staging.example.com" }` |
| `api.try_it` | `true` includes the Try it panel in `rhyla build` (the API needs CORS); `false` turns it off in `rhyla dev` too |
| `api.version` | Version in `openapi.json` (default: the project's `package.json` version) |
| `check.ignore` | Routes `rhyla check` leaves out: `"GET /health"`, `"/internal/*"`, `"* /admin/*"` |

---

## 🤖 For AI agents

`rhyla build` (and `rhyla dev`) publish, next to the HTML:

| Path | Content |
|------|---------|
| `/llms.txt` | Index of every page with links and descriptions ([llmstxt.org](https://llmstxt.org)) |
| `/llms-full.txt` | All pages concatenated as Markdown |
| `/<route>.md` | Markdown source of each `.md` page (home is `/index.md`) |
| `/search_index.json` | `[{ route, title, content }]` |
| `/openapi.json` | OpenAPI 3.0 spec built from the `api` blocks (only when some page has one) |

Every HTML page also links its Markdown version with `<link rel="alternate" type="text/markdown">`.

### MCP server

`rhyla mcp` starts a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio, so agents (Claude Code, Cursor, VS Code…) can write and maintain the docs for you.

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

Options: `--dir <path>` (project root, default: current directory) and `--read-only` (only the read tools, the preview and `/rhyla:preview`).

#### Commands

The server also brings ready-made workflows (MCP prompts). In Claude Code they show up as slash commands:

| Command | What the agent does |
|---------|---------------------|
| `/rhyla:init [language]` | Opens a setup wizard in your browser (language, mode, flowcharts), writes the documentation site from the source code and shows the progress live. Removes Rhyla's untouched sample pages; keeps pages you wrote |
| `/rhyla:sync` | Updates, creates and deletes pages for the code that changed since the last sync (git), then opens the preview |
| `/rhyla:page <path>` | Documents one file or module, e.g. `/rhyla:page src/routes/users.js` |
| `/rhyla:flow [process]` | Follows a multi-step process in the code and creates its flow page, e.g. `/rhyla:flow checkout` |
| `/rhyla:preview` | Serves the site on a local port and gives you the URL |
| `/rhyla:clear` | Deletes every page and leaves a blank site (asks for confirmation first) |

Arguments are separated by spaces, e.g. `/rhyla:init Portuguese`. Other clients list the same prompts by name (`init`, `sync`…). The preview stops when the agent session ends; run `npx rhyla dev` to keep it up.

**The setup wizard.** `/rhyla:init` starts the local site and opens `/__rhyla/setup` in your browser (in Portuguese, English or Spanish). First you can import the API from an OpenAPI / Swagger spec or a Postman collection: the ones found in the project are listed with their routes, or you upload a file or give a URL, and a preview shows the pages it will create. The route pages then come from the file, and the agent only writes what the file does not say. Then you give the site a title and a logo (both optional: left empty, the agent picks them from the project), and choose the language of the docs, the mode and whether to include flowcharts of multi-step processes:

| Mode | The agent reads | The agent writes |
|------|-----------------|------------------|
| **Essential** (routes only) | Only the route files and their validation schemas | One page per route (method, path, parameters, body, responses, examples) and a home page with the route index. The fastest and cheapest |
| **Balanced** (routes with context) | The routes and the handlers, services and models they use | The same, plus business rules, errors, authentication and a getting-started guide |
| **Complete** (the whole project) | All the code | Everything above, plus architecture, modules, configuration and deployment |

While you answer, the agent already looks at the project; once you submit, the same page lists the pages being written and links to the docs when they are ready. Without a browser, the agent asks the same questions (as a form in Claude Code, or in the chat).

Rhyla finds the HTTP routes itself (`find_routes`: Express, Fastify, Koa, Hono, Nest, Next.js), so the agent does not have to explore the project to find them. If the project already has an OpenAPI spec, `find_routes` points to it and the agent imports it (`import_openapi`) instead of writing the route pages by hand. Route pages carry the `api` block, so the agent writes the contract once and Rhyla renders the tables and request examples. Your answers are saved in `rhyla-docs/config.json` (`preferences`), so `sync`, `page` and `flow` follow them without asking again; run `init` again to change them. `init` and `sync` record the last synced commit in `rhyla-docs/sync.json`; commit both with the docs so the next sync only looks at newer changes.

#### Tools

| Tool | What it does |
|------|--------------|
| `init_docs` | Create `rhyla-docs/` (blank by default) with the site title and description |
| `setup_wizard` | Open the setup wizard in the browser and wait for the answers |
| `set_plan` | Tell the wizard which pages are about to be written, to show the progress |
| `set_site` | Set the site title and the logo (an image from the project, copied to `rhyla-docs/public/`) |
| `find_routes` | The HTTP routes in the code (method, full path, file, line), found by pattern matching, plus OpenAPI spec files and generators |
| `import_openapi` | Route pages from an OpenAPI 3 / Swagger 2 spec (project file or URL), without reading the code |
| `check_docs` | Same report as `rhyla check`; `init` and `sync` call it before finishing |
| `ask_preferences` | The wizard's questions without a browser (a form when the client supports it) |
| `save_preferences` | Save the language, mode, flowcharts, audience and request examples chosen for the docs |
| `list_pages` | All pages (route, title, description, file), optionally filtered by folder |
| `search_docs` | Full-text search, case and accent insensitive |
| `read_page` | Source of a page (Markdown with frontmatter) |
| `get_flow` | Lists flows, or the steps and transitions of one flow |
| `get_conventions` | The project's `AGENTS.md` (layout, frontmatter, naming) plus the saved preferences; the flow format comes with `topic: "flows"` |
| `write_page` | Create or overwrite Markdown pages inside `rhyla-docs/body`, one or several per call (problems in the `api` block come back as `api_warnings`) |
| `edit_page` | Replace an exact piece of text in a page, without resending the whole page |
| `delete_page` | Delete a page (not the home or 404 pages) |
| `clear_docs` | Delete every page and leave a blank home page |
| `get_changes` / `mark_synced` | Code files changed since the last sync / record the sync |
| `start_preview` / `stop_preview` | Serve the site locally (same server as `rhyla dev`, port 3333 or the next free one) and return its URL |

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
