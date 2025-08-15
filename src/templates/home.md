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

---

## ⏱ Quickstart
1) Initialize a docs workspace
```bash
rhyla init
```
This creates a `rhyla/` folder with templates (`header.html`, `home.md`, `styles/`, `public/`, and `body/`).

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
The sidebar mirrors the folder tree under `rhyla/body/`.

- Folders become groups (with collapsible sections).
- `.md` files render to HTML; `.html` files are included verbatim.
- File path defines the route. Examples:
   - `rhyla/body/get-posts.md` → `/get-posts`
   - `rhyla/body/api/users/create.md` → `/api/users/create`

Naming tips:
- Prefer lowercase and hyphens: `quick-start.md`, `advanced-install.md`.
- Avoid spaces/special characters.
- Keep names short and descriptive.

---

## 🎨 Theming & layout
- Global layout: `styles/global.css`.
- Themes: `styles/light.css` and `styles/dark.css` (variables + colors).
- Header/Footer: edit `header.html` / `footer.html` as needed.
- HTTP verb tags are styled via `.http-tag` classes.

Anti‑flicker: the selected theme is applied before first paint to avoid flashing.

---

## 🔎 Search
Rhyla ships with a content indexer and a special search page.

- Dev: index served from `/search_index.json` and refreshed on changes.
- Build: assets live under `/search/` (`search_index.json` + scripts).
- The search UI highlights matches and links to routes.

Tip: keep `rhyla/body/search.html` in your project (it’s listed first in the sidebar).

---

## ⚙️ SPA‑like navigation
Page transitions only replace the `<main>` content, keeping header and sidebar fixed. Scripts inside pages are re‑executed safely, so special pages (like Search) work when revisiting.

---

## 📦 Project layout (essentials)
```
rhyla/
   body/               # your docs (md/html)
   public/             # static assets served at /public
   styles/             # global + themes
   header.html         # header + theme toggle + SPA runtime
   footer.html         # footer (optional)
```

---

## 🧩 FAQ (short)
- Search shows “Loading index…” forever?
   - Ensure the index exists (dev regenerates automatically; build writes to `/search/`).
   - Keep the Search page file in `rhyla/body/`.
- Can I use plain HTML pages?
   - Yes. Place `.html` files anywhere under `body/`.
- How do I deploy?
   - Run `rhyla build` and upload `dist/` to any static host.

---

## 🤝 Contributing
PRs and issues are welcome: https://github.com/joseRibamar21/rhyla_documentation

