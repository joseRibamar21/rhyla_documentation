# AGENTS.md — writing docs with Rhyla

This folder is a [Rhyla](https://rhyladoc.com/) documentation workspace. These are the conventions to follow when adding or editing pages here.

## Layout

```
rhyla-docs/
  config.json     # site settings (title, description, site_url, base, build_ignore, allow_raw_html)
  header.html     # shared <head> + top bar (edit with care)
  styles/         # global.css, light.css, dark.css
  public/         # static assets, served at /public/...
  body/           # ALL documentation pages live here
    home.md       # required: the landing page (route "/")
    notFound.html # 404 page
    guide/        # each folder becomes a sidebar group
      install.md  # → route /guide/install
```

- The **file path is the route**: `body/api/auth.md` → `/api/auth`.
- **Folders are groups** in the sidebar. Nesting is allowed.
- Prefer `.md`. Use `.html` only for fully custom layouts (scripts and `on*` attributes are stripped unless `allow_raw_html` is `true`).
- Use lowercase file names with `-` or `_` (`_` is shown as a space in the sidebar). No spaces.
- Do not delete `body/home.md` or `body/notFound.html`.
- `body/kit_dev_rhyla/` is a dev-only tool and is never built.

## Frontmatter

Every page may start with YAML frontmatter. All fields are optional.

```markdown
---
title: Install            # sidebar label, <title> and search title (default: first "# H1", then file name)
description: How to install the CLI   # <meta description> and llms.txt summary
order: 1                  # sidebar order inside its folder (lower first; pages without order go last, A→Z)
---

# Install

Content…
```

If `title` is set and the page has no `# H1`, Rhyla renders the title as the H1.

## API endpoint pages

The file name carries the HTTP method and optional tags, shown as badges in the sidebar:

```
<method>-<name>[-<tag>].md
```

- Methods: `get-`, `post-`, `put-`, `patch-`, `delete-`
- Tags (suffix): `-new`, `-dep` (deprecated), `-v1`, `-v2`, `-v1.2.0`…
- Example: `body/users/post-create_user-new.md` → sidebar shows `POST create user [new]`.

Suggested body for an endpoint page:

````markdown
---
title: Create user
description: Creates a new user account.
---

# POST /api/users

Creates a new user account.

## Headers
| Name | Value | Required |
|------|-------|----------|
| Authorization | Bearer <token> | yes |

## Body
```json
{ "name": "Ana", "email": "ana@example.com" }
```

## Responses
### 201 Created
```json
{ "id": "u_123", "name": "Ana" }
```

## Example
```bash
curl -X POST https://api.example.com/api/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ana","email":"ana@example.com"}'
```
````

## Commands

```bash
npx rhyla dev     # preview at http://localhost:3333 (re-reads files on every request)
npx rhyla build   # static site in dist/
```

## MCP

If the `rhyla` MCP server is connected (`rhyla mcp`), prefer its tools: `search_docs` / `list_pages` to find pages, `read_page` to read, `write_page` to create or update.

## Machine-readable output

The build (and the dev server) also publishes, for AI agents and tools:

- `/llms.txt` — index of every page with links ([llmstxt.org](https://llmstxt.org))
- `/llms-full.txt` — all pages concatenated as Markdown
- `/<route>.md` — Markdown source of each `.md` page (home is `/index.md`)
- `/search_index.json` — `[{ route, title, content }]`
