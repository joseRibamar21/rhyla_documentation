# How Rhyla Works

A deep dive into Rhyla's architecture, internals, and how it transforms your Markdown into beautiful documentation.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Command System](#command-system)
- [Build Process](#build-process)
- [Development Server](#development-server)
- [Search System](#search-system)
- [Theme System](#theme-system)
- [SPA Navigation](#spa-navigation)
- [Password Authentication](#password-authentication)

---

## Overview

Rhyla is a static documentation generator built with Node.js that converts Markdown files into a fully-functional documentation website. It follows a simple philosophy:

1. **Write** - Create Markdown files in the `body/` folder
2. **Preview** - Use `rhyla dev` to see changes in real-time
3. **Build** - Generate static HTML with `rhyla build`
4. **Deploy** - Upload the `dist/` folder anywhere

---

## Architecture

### Project Structure

```
your-project/
├── rhyla-docs/           # Your documentation workspace
│   ├── body/            # Markdown content
│   ├── public/          # Static assets
│   ├── styles/          # CSS themes
│   ├── header.html      # Header template
│   └── config.json      # Configuration
├── dist/                # Generated static site (after build)
└── node_modules/        # Dependencies
```

### Technology Stack

- **Node.js** - Runtime environment
- **Express** - Development server
- **markdown-it** - Markdown parser
- **cross-spawn** - Cross-platform process spawning
- **commander** - CLI framework

---

## Command System

Rhyla provides four main commands:

### `rhyla init`

**Purpose:** Initialize a new documentation project

**What it does:**
1. Creates `rhyla-docs/` directory structure
2. Copies templates (header, home, styles)
3. Sets up default configuration
4. Creates placeholder assets

**Source:** `/src/commands/init.js`

### `rhyla dev`

**Purpose:** Start development server with hot reload

**What it does:**
1. Starts Express server on port 3000 (configurable)
2. Watches files for changes
3. Regenerates search index on change
4. Serves files with live reload

**Source:** `/src/commands/dev.js`

### `rhyla build`

**Purpose:** Generate production-ready static site

**What it does:**
1. Clears `dist/` folder
2. Copies styles and assets
3. Processes all Markdown files
4. Generates HTML pages
5. Creates search index
6. Generates sitemap and robots.txt

**Source:** `/src/commands/build.js`

### `rhyla serve`

**Purpose:** Serve production build locally

**What it does:**
1. Optionally runs build first
2. Serves `dist/` folder
3. Respects configured base path

**Source:** `/src/commands/serve.js`

---

## Build Process

The build process is the heart of Rhyla. Here's how it works:

### Step 1: Initialization

```javascript
const rhylaPath = path.join(process.cwd(), 'rhyla-docs');
const distPath = path.join(process.cwd(), 'dist');
```

- Locates source files in `rhyla-docs/`
- Creates clean `dist/` folder

### Step 2: Copy Static Assets

```javascript
fs.cpSync(path.join(rhylaPath, 'styles'), path.join(distPath, 'styles'));
fs.cpSync(path.join(rhylaPath, 'public'), path.join(distPath, 'public'));
```

- Copies CSS files
- Copies images, favicons, etc.

### Step 3: Process Markdown

For each `.md` file in `body/`:

1. **Read** the file content
2. **Parse** with markdown-it
3. **Generate** HTML with header and sidebar
4. **Apply** base path rewrites
5. **Write** to `dist/` with clean URLs

```javascript
const content = md.render(fs.readFileSync(filePath, 'utf8'));
const html = header + sidebar + `<main>${content}</main>`;
fs.writeFileSync(outputPath, html);
```

### Step 4: Generate Search Index

```javascript
const index = files.map(file => ({
  title: extractTitle(file),
  path: getPath(file),
  content: stripMarkdown(file)
}));
fs.writeFileSync('dist/scripts/search_index.json', JSON.stringify(index));
```

### Step 5: Create Sitemap

If `site_url` is configured:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/page</loc>
  </url>
</urlset>
```

---

## Development Server

The dev server provides a fast development experience:

### Hot Reload Implementation

1. **File Watcher** - Monitors `body/`, `styles/`, `public/` for changes
2. **Auto Rebuild** - Regenerates affected pages
3. **Search Update** - Rebuilds search index
4. **Browser Refresh** - Sends reload signal

### Express Routes

```javascript
app.get('/', (req, res) => {
  // Serve home page
});

app.get('/:page', (req, res) => {
  // Serve other pages
});

app.get('/public/*', (req, res) => {
  // Serve static assets
});
```

---

## Search System

Rhyla includes a built-in search system:

### Index Generation

```javascript
// Extract content
const files = getAllMarkdownFiles('body/');
const index = files.map(file => ({
  title: getTitle(file),
  path: getPath(file),
  content: stripHtml(stripMarkdown(file))
}));

// Save to JSON
fs.writeFileSync('search_index.json', JSON.stringify(index));
```

### Client-Side Search

```javascript
// Load index
const index = await fetch('/scripts/search_index.json').then(r => r.json());

// Search function
function search(query) {
  return index.filter(item => 
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.content.toLowerCase().includes(query.toLowerCase())
  );
}
```

---

## Theme System

Rhyla supports light and dark themes:

### CSS Variables

```css
:root {
  --bg-primary: #ffffff;
  --text-primary: #1a1a1a;
  --accent: #667eea;
}

[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #f5f5f5;
  --accent: #818cf8;
}
```

### Theme Toggle

```javascript
function toggleTheme() {
  const current = localStorage.getItem('rhyla-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  
  document.documentElement.setAttribute('data-theme', next);
  document.getElementById('theme-style').href = `/styles/${next}.css`;
  localStorage.setItem('rhyla-theme', next);
}
```

### Anti-Flicker

Themes are loaded before page render to prevent flash:

```html
<script>
(function() {
  const theme = localStorage.getItem('rhyla-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
})();
</script>
```

---

## SPA Navigation

Rhyla provides SPA-like navigation without a framework:

### Link Interception

```javascript
document.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link || link.target === '_blank') return;
  
  if (link.href.startsWith(window.location.origin)) {
    e.preventDefault();
    navigateTo(link.href);
  }
});
```

### Page Loading

```javascript
async function navigateTo(url) {
  const html = await fetch(url).then(r => r.text());
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Update main content
  document.querySelector('.rhyla-main').innerHTML = 
    doc.querySelector('.rhyla-main').innerHTML;
  
  // Update URL
  history.pushState({}, '', url);
}
```

---

## Password Authentication

Rhyla includes optional password protection:

### Configuration

```json
{
  "password_doc": {
    "enabled": true,
    "passwords": ["myPassword123"]
  }
}
```

### Implementation

1. **Check localStorage** for auth token
2. **Show overlay** if not authenticated
3. **Validate password** against config
4. **Track attempts** (max 5)
5. **Block access** for 5 minutes after 5 failed attempts
6. **Store token** on success

```javascript
function checkAuth() {
  const token = localStorage.getItem('rhyla_auth_token');
  if (token === 'authenticated') return true;
  
  showAuthOverlay();
  return false;
}
```

---

## Sidebar Generation

The sidebar is auto-generated from file structure:

### Algorithm

```javascript
function generateSidebar(dir, depth = 0) {
  const items = fs.readdirSync(dir);
  let html = '<ul>';
  
  for (const item of items) {
    if (isDirectory(item)) {
      html += `<li class="folder">
        <span>${item}</span>
        ${generateSidebar(path.join(dir, item), depth + 1)}
      </li>`;
    } else {
      html += `<li><a href="/${item}">${formatTitle(item)}</a></li>`;
    }
  }
  
  html += '</ul>';
  return html;
}
```

### Features

- **Collapsible folders** - Click to expand/collapse
- **Active highlighting** - Current page highlighted
- **Custom groups** - Define in `config.json`
- **Auto tags** - HTTP methods, versions, status

---

## Performance Optimizations

### Build Optimizations

1. **Parallel processing** - Process multiple files at once
2. **Incremental builds** - Only rebuild changed files (dev mode)
3. **Minification** - Compress HTML/CSS (optional)
4. **Caching** - Cache parsed markdown

### Runtime Optimizations

1. **Lazy loading** - Load images on scroll
2. **Code splitting** - Separate scripts
3. **CSS optimization** - Remove unused styles
4. **Compression** - Gzip static assets

---

## Extensibility

### Custom Scripts

Add custom JavaScript:

```html
<!-- In header.html -->
<script src="/public/custom.js"></script>
```

### Custom Styles

Add custom CSS:

```css
/* In styles/global.css */
.my-custom-class {
  color: var(--accent);
}
```

### Plugins (Future)

Planned plugin system:

```javascript
// rhyla.config.js
export default {
  plugins: [
    mermaidPlugin(),
    analyticsPlugin(),
    customThemePlugin()
  ]
};
```

---

## Internals Reference

### Key Files

- `/src/commands/init.js` - Project initialization
- `/src/commands/dev.js` - Development server
- `/src/commands/build.js` - Static site generator
- `/src/commands/serve.js` - Production server
- `/src/utils/sidebar.js` - Sidebar generation
- `/src/templates/scripts/password-auth.js` - Authentication

### Configuration Schema

```typescript
interface Config {
  title: string;
  description: string;
  site_url?: string;
  base: string;
  side_topics: boolean;
  allow_raw_html: boolean;
  password_doc?: {
    enabled: boolean;
    passwords: string[];
  };
  build_ignore: string[];
  sidebar: Array<string | SidebarGroup>;
}
```

---

## Best Practices

### Content Organization

1. Use clear folder names
2. Group related content
3. Keep hierarchy shallow (max 3 levels)
4. Use descriptive file names

### Performance

1. Optimize images before adding
2. Minimize custom scripts
3. Use CSS variables for theming
4. Enable compression on server

### Security

1. Don't commit passwords in config
2. Use environment variables
3. Enable HTTPS in production
4. Sanitize user-generated content

---

## Troubleshooting Development

### Debug Mode

Enable verbose logging:

```bash
DEBUG=* rhyla dev
```

### Common Issues

**Build fails:**
- Check JSON syntax in `config.json`
- Verify all referenced files exist
- Check markdown syntax

**Dev server not reloading:**
- Restart server
- Check file permissions
- Clear browser cache

**Search not working:**
- Rebuild search index
- Check console for errors
- Verify search_index.json exists

---

## Further Reading

- [Quick Start Guide](quick-start) - Get started quickly
- [Configuration Reference](config_reference) - All config options
- [CLI Reference](cli-reference) - Command documentation
- [Deployment Guide](deployment) - Deploy your site

---

**Built with Rhyla** 💜

For questions and contributions, visit: https://github.com/joseRibamar21/rhyla_documentation
