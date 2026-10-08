# 📚 Rhyla Documentation — Markdown‑first docs, zero friction

Rhyla is a lightweight, template‑driven documentation generator. Write in Markdown, drop files into folders, and get a clean docs site with a smart sidebar, instant search, light/dark themes, and a static build ready to deploy.

— Minimal setup. No lock‑in. Fast authoring.

---

## ✨ Highlights
- Markdown‑first: `.md` pages are rendered automatically; `.html` pages are kept as‑is.
- Auto sidebar from folders: nested groups with smooth animations and active state.
- Built‑in search: index generated from your docs; resilient loading in dev and build.
- SPA‑like navigation: header and sidebar stay; only content swaps for snappy UX.
- Theming: light/dark with anti‑flicker first‑paint, easy to customize.
- Clean URLs: `/topic` and `/group/topic` in dev and build.
- Static build: one `dist/` folder, drop on any static host (GitHub Pages, Vercel, Netlify).
- Public assets: serve from `/public` (images, fonts, etc.).
- Smart tagging system: with HTTP method tags and version indicators ([learn more](/tag-new)).

---

## ⏱ Quickstart
1) Initialize a docs workspace
```bash
rhyla init
```
This creates a `rhyla-docs/` folder with templates (`header.html`, `config.json`, `AGENTS.md`, `styles/`, `public/`, and `body/`).

2) Start developing
```bash
rhyla dev
```
Preview at http://localhost:3333. The sidebar and search update as you add/edit files.

3) Build for production
```bash
rhyla build
```
Outputs a static site to `dist/`.

---

## 📁 Authoring model
The sidebar mirrors the folder tree under `rhyla-docs/body/`.

- Folders become groups (with collapsible sections).
- `.md` files render to HTML; `.html` files are included verbatim.
- File path defines the route. Examples:
   - `rhyla-docs/body/get-posts.md` → `/get-posts`
   - `rhyla-docs/body/api/users/create.md` → `/api/users/create`

Naming tips:
- Prefer lowercase and hyphens: `quick-start.md`, `advanced-install.md`.
- Use HTTP method prefixes for API docs: `get-users.md`, `post-login.md`.
- Add version or status tags at the end: `post-login-new.md`, `get-users-v1.md`.
- Avoid spaces/special characters.
- Keep names short and descriptive.
- Check out the [tag system guide](/tag-new) for more details.

---

## 🔀 Flows
Connect pages into processes: a page with `type: flow` and a list of `steps` becomes a clickable diagram, and every page in it gets previous/next navigation. See the example in [Publish your docs](/flows/publish_docs).

---

## 🎨 Theming & layout
- Design tokens (colors, fonts, sizes) live in `styles/global.css` as CSS variables, for light and dark (`html[data-theme="dark"]`).
- Override any token in `styles/light.css` or `styles/dark.css`, e.g. `:root { --rh-accent: #0f766e; }`.
- Header: edit `header.html` (swap the brand mark for `<img src="/public/logo.png">` to use your logo).
- The theme follows the OS preference until the reader picks one with the toggle.

---

## 🔎 Search
Rhyla ships with a content indexer and a special search page.

- Dev: index served from `/search_index.json`, always built from the current files.
- Build: written to `dist/search_index.json`.
- The search UI highlights matches and links to routes.

---

## ⚙️ SPA‑like navigation
Page transitions only replace the `<main>` content, keeping header and sidebar fixed. Scripts inside pages are re‑executed safely, so special pages (like Search) work when revisiting.

---

## 📦 Project layout (essentials)
```
rhyla-docs/
   body/               # your docs (md/html)
   public/             # static assets served at /public
   styles/             # global + themes
   header.html         # header + theme toggle + SPA runtime
```

---

## 🧩 FAQ (short)
- Search shows “Loading index…” forever?
   - Check that `/search_index.json` loads (in a build it is `dist/search_index.json`).
- Can I use plain HTML pages?
   - Yes. Place `.html` files anywhere under `body/`.
- How do I deploy?
   - Run `rhyla build` and upload `dist/` to any static host.

---

## 🤝 Contributing
PRs and issues are welcome: https://github.com/joseRibamar21/rhyla_documentation

