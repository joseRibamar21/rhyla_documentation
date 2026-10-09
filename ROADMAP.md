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
- [x] Layered layout with crossing reduction: long edges get their own path, separate ports per connection, curved lines and label pills
- [x] Hover a step or a line to highlight its connections
- [ ] Collapsible branches for very large flows

### Flow editor

A visual editor in `rhyla dev` to build flows without writing YAML. It saves the same `type: flow` frontmatter, so flows stay editable by hand and by AI agents.

- [x] Canvas with the same layout as the published diagram (`/__rhyla/flow-editor`)
- [x] Add steps by searching existing pages, or create a new page right from the editor
- [x] Connect steps from the canvas (select, press C, click the target) or from the side panel; label branches
- [x] Decision/text steps, loops, start step, page text
- [x] Live validation (missing pages, unknown ids), undo/redo, keyboard shortcuts
- [x] "Edit flow" button on flow pages while running `rhyla dev`
- [x] Drag the dot under a step onto another step to connect (or onto empty space to add a connected step)
- [x] Select a line to edit its label, reverse it, delete it or insert a step in the middle
- [x] Pan by dragging the background, Ctrl + scroll to zoom
- [ ] Manual positioning for large flows (today the layout is automatic)

### Page editor (Notion-like)

A block editor in `rhyla dev` for writing pages visually, saving clean Markdown back to `rhyla-docs/body`. Built into Rhyla, no external libraries.

- [x] Blocks: headings, paragraphs, lists (nested), to-dos, quotes, tables, code (with language), images, dividers, raw HTML
- [x] `/` slash menu to insert blocks; drag handle to reorder; block menu (turn into, duplicate, move, indent, delete)
- [x] Inline toolbar and shortcuts for bold, italic, code, strikethrough and links; Markdown typed inline is formatted on the fly
- [x] Page properties at the top for the frontmatter (title, description, order); other fields preserved
- [x] Paste Markdown or text; paste or drop images into `public/uploads/`
- [x] Autosave with Markdown round-trip tested against the build output (same `dist/`)
- [x] "Edit page" button on every Markdown page while running `rhyla dev`; create new pages from the editor
- [x] To-do items render as checkboxes in the published site
- [ ] Link to other pages with `@` / `[[` mentions, with autocomplete over the docs
- [ ] Callout blocks
- [ ] API endpoint block (method, path, headers, body, responses), replacing today's API Page Generator form
- [ ] Create pages from the sidebar while running `rhyla dev`

## 💡 Later

- Core rewrite (2.0): single layout template, one base-path strategy, fewer moving parts in the browser runtime
- Syntax highlighting for code blocks
- Versioned docs (v1, v2) and i18n
- Publishing through npm Trusted Publishing (no long-lived tokens)
