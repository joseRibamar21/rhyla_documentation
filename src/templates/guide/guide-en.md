# 📚 Rhyla Documentation

**Rhyla Documentation** is a simple and flexible tool to quickly create and organize documentation using **Markdown** files and customizable templates.  
The main idea is to allow developers to keep all project documentation organized, navigable, and with support for light and dark themes, without relying on heavy tools or complex configurations.

---

## 🚀 Motivation
- Make it easy to create local and static documentation.
- Use **Markdown** so content is easy to write and maintain.
- Allow full customization of **header**, **footer**, **sidebar**, and **themes**.
- Provide a simple development (`rhyla dev`) and build (`rhyla build`) workflow.

---

## 🛠 Basic Usage
1. Install the project globally or use it via local CLI.
2. Run:
   ```bash
   rhyla init
   ```
This will create the initial structure with:
- header.html
- config.yaml
- home.md (this page)
- body folder for your topics

1. During development, use:
   ```bash
   rhyla dev
   ```
This will start a local server at `http://localhost:3000` for preview.

1. To generate static documentation, use:
   ```bash
   rhyla build
   ```
This will create the `rhyla/` folder with the generated HTML files.

---

## ✏️ Start customizing!
The first recommended action is to adapt this `home.md` to your project's context.

### How navigation is built
The sidebar is automatically generated from the directory tree inside `rhyla/body/`:
- Each FOLDER inside `body/` works as a GROUP / CATEGORY.
- Each `.md` FILE becomes a processed page (Markdown → HTML).
- Each `.html` FILE is included as-is (useful for highly customized pages).
- The file path defines the route. Example: `rhyla/body/guides/install.md` → route `/guides/install`.
- The default order is alphabetical (folder and file names). Use clear and consistent names.

### Creating groups and topics
Example structure:
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
Generated routes:
```
/introduction
/quickstart
/guide/install
/guide/config
/api/auth
/api/users
```

### Naming best practices
- Use lowercase and hyphens or camelCase: `advanced-install.md` or `advancedInstall.md`.
- Avoid spaces and special characters.
- Choose short, descriptive, and stable names.

### When to use .md or .html
| Situation | Use .md | Use .html |
|-----------|---------|-----------|
| Common text, narrative docs | ✅ | |
| Code with simple formatting | ✅ | |
| Fully custom layout | | ✅ |
| Ready-made HTML components | | ✅ |

### Extra tips
- Start simple: create just a few `.md` files and check the navigation.
- Need a special page (internal landing)? Create a `.html` in that folder.
- Restructuring? Just move/rename folders/files and restart the server (or reload) to reflect changes.

--- 

## ⚠️ Limitations
- Navigation and structure depend on using .md or .html files.
- The sidebar is generated based on the folder structure, so folder and file names define groups and topics.
- The system does not automatically process external links in the menu.
- For global layout changes, you need to edit header.html, footer.html, and theme styles.
- No plugin or extension support at the moment.

---

## 🔎 About Search and Indexing
- All documentation pages (`.md` and `.html`) are automatically indexed and used in the search page (`/buscar`).
- The search system relies on this index to provide fast and relevant results.
- For correct operation, **do not delete or rename the search page** (`search.html` in `rhyla/body`).
- The `home.md` file is required and must not be deleted, as it is the main entry page of your documentation. You should edit it to fit your project, but never remove it.

