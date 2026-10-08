# Roadmap

What is shipped, what is being built and what comes next. Ideas and feedback are welcome in [issues](https://github.com/joseRibamar21/rhyla_documentation/issues).

## ✅ Shipped — 1.1.0

- Shared render pipeline for `dev` and `build` (frontmatter, sanitization, base path)
- Frontmatter: `title`, `description`, `order`
- New UI: theme tokens (light/dark following the OS), search dialog (Ctrl/⌘ K), mobile menu, copy buttons, active "On this page" section
- AI-ready output: `llms.txt`, `llms-full.txt`, a `.md` twin of every page, `AGENTS.md`
- `rhyla mcp`: MCP server with `list_pages`, `search_docs`, `read_page`, `get_conventions`, `write_page`

## 🚧 In progress

### Flows

Pages connected into processes (user journeys, API call sequences, troubleshooting trees).

- [x] `type: flow` pages with `steps` in the frontmatter: branches with labels, decision/text steps, loops
- [x] Generated diagram with clickable steps
- [x] Previous/next navigation and mini-map on every page that belongs to a flow
- [x] Flow steps in the `.md` output and `get_flow` MCP tool
- [ ] Overview map: every page and every flow connection in one navigable tree/graph
- [ ] Better layout for large flows (crossing reduction, zoom and pan, collapsible branches)

## 🔜 Next

### Flow editor

A visual editor in `rhyla dev` to build flows without writing YAML. It saves the same `type: flow` frontmatter, so flows stay editable by hand and by AI agents.

- Canvas with the same layout as the published diagram
- Add steps by searching existing pages, or create a new page right from the canvas
- Connect steps by dragging; label branches inline
- Decision/text steps, loops and end steps
- Live validation (missing pages, unreachable steps, unknown ids)
- "Edit flow" button on flow pages while running `rhyla dev`
- Implementation note: evaluate building on the current SVG layout vs. a canvas library such as xyflow

### Page editor (Notion-like)

A block editor in `rhyla dev` for writing pages visually, saving clean Markdown back to `rhyla-docs/body`.

- Blocks: headings, paragraphs, lists, to-dos, quotes, callouts, tables, code (with language), images, dividers
- `/` slash menu to insert blocks; drag handle to reorder; inline toolbar for bold, italic, code and links
- Page properties panel at the top for the frontmatter (title, description, order, flow membership)
- Link to other pages with `@` / `[[` mentions, with autocomplete over the docs
- Paste Markdown or rich text; drag and drop images into `public/`
- Autosave to the `.md` file, with reliable Markdown round-trip (no noise in diffs)
- "Edit" button on every page while running `rhyla dev`; create new pages from the sidebar
- API endpoint template as a block (method, path, headers, body, responses), replacing today's API Page Generator form
- Implementation note: evaluate BlockNote, TipTap (ProseMirror) and Milkdown for Markdown fidelity and bundle size

## 💡 Later

- Core rewrite (2.0): single layout template, one base-path strategy, fewer moving parts in the browser runtime
- Syntax highlighting for code blocks
- Versioned docs (v1, v2) and i18n
- Publishing through npm Trusted Publishing (no long-lived tokens)
