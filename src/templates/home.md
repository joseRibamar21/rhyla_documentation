# 📚 Rhyla Documentation

**Modern, Fast, and Simple Documentation Generator**

Rhyla is a lightweight, template-driven documentation generator that transforms your Markdown files into beautiful, searchable documentation sites. Write in Markdown, organize in folders, and deploy anywhere.

---

## ✨ Why Rhyla?

- **🚀 Zero Configuration**: Works out of the box with sensible defaults
- **📝 Markdown-First**: Write in Markdown, get HTML automatically
- **🔍 Built-in Search**: Instant search with auto-generated index
- **🎨 Modern Themes**: Beautiful light/dark themes with anti-flicker
- **⚡️ Fast Navigation**: SPA-like experience without page reloads
- **🔒 Password Protection**: Secure your documentation with authentication
- **📱 Responsive Design**: Works perfectly on all devices
- **🌳 Smart Sidebar**: Auto-generated from folder structure
- **🎯 Clean URLs**: `/guide` instead of `/guide.html`
- **📦 Static Output**: Deploy anywhere (GitHub Pages, Vercel, Netlify)

---

## ⚡️ Quick Start

Get started in less than a minute:

### 1. Initialize Your Project
```bash
rhyla init
```
This creates a `rhyla-docs/` folder with everything you need.

### 2. Start Development Server
```bash
rhyla dev
```
Preview at **http://localhost:3333**. Changes reflect instantly!

### 3. Build for Production
```bash
rhyla build
```
Generates a `dist/` folder ready to deploy.

---

## 📁 How It Works

Rhyla automatically creates your documentation site from your file structure:

```
rhyla-docs/
├── body/                    # Your documentation
│   ├── home.md             # Home page
│   ├── quickstart.md       # → /quickstart
│   ├── guide/              # Guide section
│   │   ├── installation.md # → /guide/installation
│   │   └── config.md       # → /guide/config
│   └── api/                # API reference
│       ├── auth.md         # → /api/auth
│       └── users.md        # → /api/users
├── public/                 # Static assets (images, fonts)
├── styles/                 # Themes (light.css, dark.css)
├── config.json            # Configuration
└── header.html            # Header template
```

**That's it!** The sidebar, search index, and navigation are generated automatically.

---

## 🎯 Key Features

### 📑 Smart Sidebar with Groups

Organize your documentation with custom groups:

```json
{
  "sidebar": [
    "home",
    {
      "title": "Getting Started",
      "children": ["installation", "quickstart"]
    },
    {
      "title": "API Reference",
      "children": ["api/auth", "api/users", "api/posts"]
    }
  ]
}
```

Features:
- ✅ Collapsible groups
- ✅ Nested folders
- ✅ Custom titles
- ✅ Active page highlighting

[Learn more about sidebar customization](/config_reference#sidebar)

### 🔍 Instant Search

Built-in search with:
- Real-time results as you type
- Content previews
- Keyword highlighting
- Keyboard navigation (↑↓ arrows)
- Auto-generated index

No configuration needed — just start writing!

### 🔒 Password Protection (New in v1.0.8)

Protect your documentation with password authentication:

```json
{
  "password_doc": {
    "enabled": true,
    "passwords": ["yourPassword123", "anotherPassword"]
  }
}
```

Features:
- ✅ Multiple valid passwords
- ✅ Beautiful login UI
- ✅ 5 failed attempts → 5 minute lockout
- ✅ Session persistence
- ✅ Secure localStorage storage

[View release notes](/releases/release_notes_1.0.8)

### 🎨 Beautiful Themes

Switch between light and dark modes with one click:
- **Light theme**: Clean and modern
- **Dark theme**: Easy on the eyes
- **Anti-flicker**: Theme applied before page renders
- **Persistent**: Choice saved in localStorage

Customize with CSS variables:
```css
[data-theme="light"] {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  --accent: #007acc;
}
```

### 🏷 Smart Tags

Rhyla automatically recognizes special file patterns:

- **HTTP Methods**: `get-users.md` → `GET /users` 🟢
- **Versions**: `api-v2.md` → Shows `v2` badge
- **Status**: `feature-new.md` → Shows `NEW` label

Example:
```
api/
├── get-users.md        → GET tag (green)
├── post-login.md       → POST tag (blue)
├── delete-user.md      → DELETE tag (red)
└── api-v2-new.md       → v2 + NEW badges
```

[Learn more about the tag system](/tag-new)

### ⚡️ SPA Navigation

Page transitions feel instant:
- Only content updates (header/sidebar stay)
- Browser back/forward works
- URL updates correctly
- No page flicker
- Works without JavaScript (progressive enhancement)

---

## 🛠 Commands Reference

| Command | Description |
|---------|-------------|
| `rhyla init` | Initialize a new documentation project |
| `rhyla dev` | Start development server with hot reload |
| `rhyla dev --port 8080` | Start on custom port |
| `rhyla build` | Build static site for production |
| `rhyla serve` | Serve the built files locally |

---

## 📖 Writing Documentation

### Markdown Files (`.md`)

Write natural Markdown and Rhyla handles the rest:

```markdown
# API Authentication

Use JWT tokens for authentication.

## Getting a Token

Send a POST request to `/auth/login`:

\`\`\`json
{
  "username": "user",
  "password": "pass"
}
\`\`\`

## Using the Token

Include in headers:

\`\`\`
Authorization: Bearer <token>
\`\`\`
```

### HTML Files (`.html`)

For custom layouts, use raw HTML:
- Full control over structure
- Include custom scripts
- Embed interactive demos
- Use web components

### Naming Best Practices

✅ **Good**:
- `installation.md`
- `quick-start.md`
- `api-reference.md`
- `get-users.md`

❌ **Avoid**:
- `Installation Guide.md` (spaces)
- `API_Reference.md` (underscores)
- `get users.md` (spaces)

**Pro tip**: Use lowercase with hyphens for consistency and clean URLs.

---

## 🎓 Learn More

### 📚 Documentation

- [How Rhyla Works - Deep Dive](/how-it-works) - Complete technical guide
- [Configuration Reference](/config_reference) - All config options
- [Page Generator](/page_generator) - Creating custom pages
- [Tag System Guide](/tag-new) - HTTP tags and status badges
- [Release Notes v1.0.8](/releases/release_notes_1.0.8) - What's new

### 🔧 Advanced Topics

- **Custom Themes**: Modify CSS variables
- **Programmatic API**: Use Rhyla in Node.js scripts
- **Express Middleware**: Integrate with Express apps
- **Markdown Plugins**: Extend markdown-it
- **Internationalization**: Multi-language support

[Explore the full guide →](/how-it-works)

---

## 🚀 Deployment

Deploy your documentation anywhere:

### GitHub Pages
```bash
rhyla build
# Push dist/ folder to gh-pages branch
```

### Vercel
```bash
rhyla build
vercel deploy dist/
```

### Netlify
```bash
rhyla build
# Point Netlify to dist/ folder
```

### Any Static Host
Just upload the `dist/` folder!

---

## 💡 Tips & Tricks

### Development

- **Hot Reload**: Changes appear instantly in dev mode
- **Console Debugging**: Use `rhylaLogout()` to clear authentication
- **Port Conflicts**: Use `--port` flag to change default port

### Organization

- **Group Related Topics**: Use folders for logical grouping
- **Short File Names**: Keep URLs readable
- **Consistent Naming**: Stick to one convention (kebab-case recommended)

### Performance

- **Optimize Images**: Compress before adding to `public/`
- **Split Large Pages**: Break into smaller focused pages
- **Use Search**: Let users find content quickly

---

## ❓ Common Questions

### Can I customize the header?
Yes! Edit `rhyla-docs/header.html` to customize the header, logo, and navigation.

### How do I change the theme colors?
Modify CSS variables in `styles/light.css` and `styles/dark.css`.

### Can I use custom domains?
Yes! Deploy to any static host and configure your domain DNS.

### Is it SEO-friendly?
Yes! The build generates static HTML with full content — perfect for SEO.

### Can I add custom JavaScript?
Yes! Include scripts in your header or individual pages.

### Does it support code syntax highlighting?
Yes! Code blocks are automatically highlighted with language detection.

---

## 🆕 What's New in v1.0.8

### 🔒 Password Authentication System
- Protect documentation with configurable passwords
- Smart attempt limiting (5 max)
- 5-minute lockout after failures
- Beautiful centered login UI
- Session persistence

### 📑 Enhanced Sidebar Groups
- Custom group titles
- Collapsible sections
- Nested folder support
- Better visual hierarchy

[Read full release notes →](/releases/release_notes_1.0.8)

---

## 🤝 Contributing

Rhyla is open source! Contributions are welcome:

- **GitHub**: [rhyla_documentation](https://github.com/joseRibamar21/rhyla_documentation)
- **Issues**: [Report bugs](https://github.com/joseRibamar21/rhyla_documentation/issues)
- **Website**: [rhyladoc.com](https://rhyladoc.com)

---

## 📄 License

MIT License - Free to use for any project!

---

## 🎉 Get Started Now

```bash
# Install globally
npm install -g rhyla

# Or use with npx
npx rhyla init
```

**Start documenting in seconds. Deploy anywhere in minutes.**

---

*Made with ❤️ by developers, for developers.*

