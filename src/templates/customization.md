# Customization Guide

Make your Rhyla documentation site truly yours! This guide covers themes, styling, branding, and advanced customization options.

## Theme System

Rhyla includes a built-in theme system with dark and light modes that users can toggle.

### Available Themes

- **Light Mode** - Clean, bright interface
- **Dark Mode** - Eye-friendly dark theme

Users can toggle between themes using the theme switcher in the header. Their preference is saved in localStorage.

---

## Custom Styling

### Style Files

Rhyla provides three CSS files you can customize:

```
styles/
├── global.css      # Base styles for all themes
├── dark.css        # Dark theme specific styles
└── light.css       # Light theme specific styles
```

### Global Styles (`global.css`)

Edit theme-independent styles:

```css
/* Custom font */
:root {
  --font-family: 'Inter', -apple-system, sans-serif;
}

/* Custom container width */
.main-content {
  max-width: 1200px;
}

/* Custom code block styling */
pre {
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Custom link colors */
a {
  color: #667eea;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s;
}

a:hover {
  border-bottom-color: #667eea;
}
```

### Light Theme (`light.css`)

Customize light mode colors:

```css
[data-theme="light"] {
  /* Background colors */
  --bg-primary: #ffffff;
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #e9ecef;
  
  /* Text colors */
  --text-primary: #1a1a1a;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;
  
  /* Accent colors */
  --accent-primary: #667eea;
  --accent-secondary: #764ba2;
  
  /* Border colors */
  --border-color: #e5e7eb;
  
  /* Shadow */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Dark Theme (`dark.css`)

Customize dark mode colors:

```css
[data-theme="dark"] {
  /* Background colors */
  --bg-primary: #1a1a1a;
  --bg-secondary: #2d2d2d;
  --bg-tertiary: #3d3d3d;
  
  /* Text colors */
  --text-primary: #f5f5f5;
  --text-secondary: #d1d5db;
  --text-tertiary: #9ca3af;
  
  /* Accent colors */
  --accent-primary: #818cf8;
  --accent-secondary: #a78bfa;
  
  /* Border colors */
  --border-color: #404040;
  
  /* Shadow */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5);
}
```

---

## Custom Header

### Edit Header HTML

Customize `header.html` to match your branding:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}}</title>
  <meta name="description" content="{{description}}">
  
  <!-- Custom favicon -->
  <link rel="icon" href="/public/favicon.ico">
  
  <!-- Custom fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  
  <!-- Stylesheets -->
  <link rel="stylesheet" href="/styles/global.css">
  <link rel="stylesheet" href="/styles/light.css">
  <link rel="stylesheet" href="/styles/dark.css">
</head>
<body>
  <!-- Custom header -->
  <header class="site-header">
    <div class="header-container">
      <div class="logo">
        <img src="/public/logo.png" alt="Logo" width="32">
        <span class="site-title">{{title}}</span>
      </div>
      
      <nav class="header-nav">
        <a href="https://github.com/yourusername/project">GitHub</a>
        <a href="https://twitter.com/yourhandle">Twitter</a>
        <button id="theme-toggle" aria-label="Toggle theme">
          🌙
        </button>
      </nav>
    </div>
  </header>
```

### Header Variables

Available template variables:

- `{{title}}` - Site title from `config.json`
- `{{description}}` - Site description from `config.json`
- `{{base}}` - Base path from `config.json`

---

## Custom Logo and Favicon

### Add Your Logo

1. Place your logo in `public/logo.png`
2. Reference it in `header.html`:

```html
<img src="/public/logo.png" alt="Your Logo" width="40">
```

### Custom Favicon

Replace `public/favicon.ico` with your own favicon.

For multiple sizes/formats:

```html
<link rel="icon" type="image/png" sizes="32x32" href="/public/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/public/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/public/apple-touch-icon.png">
```

---

## Typography

### Custom Fonts

#### Google Fonts

Add to `header.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
```

Use in `global.css`:

```css
:root {
  --font-family: 'Poppins', sans-serif;
}

body {
  font-family: var(--font-family);
}
```

#### Self-Hosted Fonts

1. Add font files to `public/fonts/`
2. Define in `global.css`:

```css
@font-face {
  font-family: 'CustomFont';
  src: url('/public/fonts/CustomFont-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap;
}

@font-face {
  font-family: 'CustomFont';
  src: url('/public/fonts/CustomFont-Bold.woff2') format('woff2');
  font-weight: 700;
  font-display: swap;
}

:root {
  --font-family: 'CustomFont', sans-serif;
}
```

### Font Sizes

Customize typography scale in `global.css`:

```css
:root {
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
}

h1 { font-size: var(--text-4xl); }
h2 { font-size: var(--text-3xl); }
h3 { font-size: var(--text-2xl); }
```

---

## Color Schemes

### Brand Colors

Define your brand colors:

```css
:root {
  /* Primary brand color */
  --brand-primary: #667eea;
  --brand-primary-hover: #5568d3;
  --brand-primary-light: #818cf8;
  
  /* Secondary brand color */
  --brand-secondary: #764ba2;
  --brand-secondary-hover: #6a4391;
  
  /* Success, warning, error */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
}
```

Use throughout your styles:

```css
.button-primary {
  background: var(--brand-primary);
  color: white;
}

.button-primary:hover {
  background: var(--brand-primary-hover);
}
```

### Gradient Backgrounds

Create beautiful gradients:

```css
.hero-section {
  background: linear-gradient(135deg, var(--brand-primary) 0%, var(--brand-secondary) 100%);
}

.card {
  background: linear-gradient(to bottom, #f8f9fa, #ffffff);
}
```

---

## Sidebar Customization

### Sidebar Styling

Customize sidebar appearance in `global.css`:

```css
/* Sidebar container */
.sidebar {
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  width: 280px;
}

/* Sidebar links */
.sidebar a {
  padding: 10px 16px;
  border-radius: 8px;
  color: var(--text-primary);
  transition: all 0.2s;
}

.sidebar a:hover {
  background: var(--bg-tertiary);
  color: var(--brand-primary);
}

/* Active link */
.sidebar a.active {
  background: var(--brand-primary);
  color: white;
  font-weight: 600;
}

/* Folder icons */
.sidebar .folder-icon {
  color: var(--brand-primary);
}
```

### Sidebar Width

Adjust sidebar width:

```css
:root {
  --sidebar-width: 280px; /* Default */
}

.sidebar {
  width: var(--sidebar-width);
}

.main-content {
  margin-left: var(--sidebar-width);
}
```

---

## Code Block Styling

### Custom Code Themes

Style code blocks:

```css
/* Code block container */
pre {
  background: #1e1e1e;
  border-radius: 12px;
  padding: 20px;
  overflow-x: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* Inline code */
code {
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Fira Code', monospace;
  font-size: 0.9em;
}

/* Syntax highlighting */
.hljs-keyword { color: #c678dd; }
.hljs-string { color: #98c379; }
.hljs-function { color: #61afef; }
.hljs-number { color: #d19a66; }
.hljs-comment { color: #5c6370; font-style: italic; }
```

### Code Font

Use a monospace font for code:

```html
<!-- In header.html -->
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
```

```css
/* In global.css */
code, pre {
  font-family: 'Fira Code', 'Courier New', monospace;
}
```

---

## Custom Components

### Alert Boxes

Create reusable alert styles:

```css
.alert {
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
  border-left: 4px solid;
}

.alert-info {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1e40af;
}

.alert-warning {
  background: #fef3c7;
  border-color: #f59e0b;
  color: #92400e;
}

.alert-error {
  background: #fef2f2;
  border-color: #ef4444;
  color: #991b1b;
}

.alert-success {
  background: #ecfdf5;
  border-color: #10b981;
  color: #065f46;
}
```

Use in markdown:

```html
<div class="alert alert-info">
  <strong>ℹ️ Info:</strong> This is helpful information.
</div>
```

### Button Styles

```css
.btn {
  display: inline-block;
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-secondary));
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: white;
  color: var(--brand-primary);
  border: 2px solid var(--brand-primary);
}
```

---

## Responsive Design

### Mobile Optimization

Ensure your customizations work on mobile:

```css
/* Desktop */
.sidebar {
  width: 280px;
}

/* Tablet */
@media (max-width: 768px) {
  .sidebar {
    width: 240px;
  }
}

/* Mobile */
@media (max-width: 640px) {
  .sidebar {
    position: fixed;
    transform: translateX(-100%);
    transition: transform 0.3s;
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .main-content {
    margin-left: 0;
    padding: 16px;
  }
}
```

---

## Advanced Customization

### Custom JavaScript

Add custom behavior by creating `public/custom.js`:

```javascript
// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    target?.scrollIntoView({ behavior: 'smooth' });
  });
});

// Copy code button
document.querySelectorAll('pre').forEach(pre => {
  const button = document.createElement('button');
  button.textContent = 'Copy';
  button.className = 'copy-btn';
  button.onclick = () => {
    navigator.clipboard.writeText(pre.textContent);
    button.textContent = 'Copied!';
    setTimeout(() => button.textContent = 'Copy', 2000);
  };
  pre.appendChild(button);
});
```

Reference in `header.html`:

```html
<script src="/public/custom.js"></script>
```

### Analytics Integration

Add Google Analytics:

```html
<!-- In header.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## Examples

### Minimal Clean Theme

```css
/* global.css */
:root {
  --font-family: system-ui, sans-serif;
}

body {
  font-family: var(--font-family);
  line-height: 1.6;
}

.main-content {
  max-width: 720px;
  margin: 0 auto;
  padding: 40px 20px;
}

h1, h2, h3 {
  line-height: 1.2;
  margin-top: 2em;
  margin-bottom: 0.5em;
}
```

### Vibrant Modern Theme

```css
/* global.css */
:root {
  --gradient-primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --gradient-secondary: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.site-header {
  background: var(--gradient-primary);
  color: white;
  padding: 20px;
}

.sidebar a.active {
  background: var(--gradient-primary);
  color: white;
}

code {
  background: var(--gradient-secondary);
  color: white;
}
```

---

## Best Practices

1. **Use CSS Variables** - Makes theme switching easier
2. **Test Both Themes** - Ensure customizations work in light and dark mode
3. **Maintain Accessibility** - Ensure sufficient color contrast
4. **Keep It Simple** - Don't over-customize
5. **Mobile First** - Test on mobile devices
6. **Performance** - Optimize fonts and images

---

## Need Help?

- 📖 [Configuration Reference](config_reference)
- 🎨 [Markdown Features](markdown-features)
- 🚀 [Quick Start Guide](quick-start)
- ❓ [Troubleshooting](troubleshooting)

Make it yours! 🎨✨
