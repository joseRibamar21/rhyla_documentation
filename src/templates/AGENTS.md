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

## Flows

A **flow** connects pages into a process (user journeys, API call sequences, troubleshooting trees). It is a normal Markdown page with `type: flow` and a `steps` list in the frontmatter:

```markdown
---
title: Checkout
description: From the cart to a confirmed order.
type: flow
steps:
  - id: cart                       # unique id inside the flow
    page: api/cart/get-cart        # page path inside body/, without extension
    next: pay                      # one step id…
  - id: pay
    page: api/payments/post-pay
    next:                          # …or several, with labels for branches
      - { to: done, label: approved }
      - { to: declined, label: declined }
  - id: done
    page: checkout/confirmation    # no `next`: end of the flow
  - id: declined
    title: Payment declined        # a step without `page` is a text/decision node
    note: show reason, try again   # short subtitle (defaults to the page description)
    next: { to: pay, label: retry }  # loops are allowed
---

Free text about the flow.
```

- If no step has `next`, steps are connected in the order they are listed.
- Rhyla draws the diagram, adds "previous / next" navigation to every page in the flow and warns about unknown pages or step ids.
- Keep flows in a `flows/` folder so they are grouped in the sidebar.

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

If the `rhyla` MCP server is connected (`rhyla mcp`), prefer its tools: `search_docs` / `list_pages` to find pages, `read_page` to read, `get_flow` to read flows, `write_page` to create or update.

## Machine-readable output

The build (and the dev server) also publishes, for AI agents and tools:

- `/llms.txt` — index of every page with links ([llmstxt.org](https://llmstxt.org))
- `/llms-full.txt` — all pages concatenated as Markdown
- `/<route>.md` — Markdown source of each `.md` page (home is `/index.md`)
- `/search_index.json` — `[{ route, title, content }]`
