# Quick Start Guide

Get your documentation site up and running in less than 5 minutes! ⚡

## Prerequisites

Before you begin, make sure you have:

- **Node.js** (version 14 or higher)
- **npm** or **yarn** package manager
- A terminal/command line

Check your Node.js version:
```bash
node --version
```

## Installation

Install Rhyla globally using npm:

```bash
npm install -g rhyla
```

Or with yarn:
```bash
yarn global add rhyla
```

Verify the installation:
```bash
rhyla --version
```

## Create Your First Documentation Site

### Step 1: Initialize a New Project

Create a new directory for your documentation:

```bash
mkdir my-docs
cd my-docs
```

Initialize a Rhyla project:

```bash
rhyla init
```

This will create the following structure:

```
my-docs/
├── config.json          # Site configuration
├── header.html          # Custom header (optional)
├── body/                # Your documentation content
│   └── home.md         # Homepage
├── public/              # Static assets (images, favicon, etc.)
│   ├── favicon.ico
│   └── logo.png
└── styles/              # Custom stylesheets
    ├── dark.css
    ├── light.css
    └── global.css
```

### Step 2: Start Development Server

Launch the development server with hot reload:

```bash
rhyla dev
```

Your documentation will be available at:
```
http://localhost:3000
```

The dev server automatically reloads when you make changes to your files! 🔥

### Step 3: Create Your First Page

Create a new markdown file in the `body/` directory:

```bash
# On macOS/Linux
echo "# Getting Started\n\nWelcome to my documentation!" > body/getting-started.md

# On Windows
echo # Getting Started > body\getting-started.md
echo. >> body\getting-started.md
echo Welcome to my documentation! >> body\getting-started.md
```

Or create it manually with your favorite editor.

### Step 4: Configure Sidebar

Edit `config.json` to add your new page to the sidebar:

```json
{
  "title": "My Documentation",
  "sidebar": [
    "home",
    "getting-started"
  ]
}
```

Save the file and check your browser - the new page appears in the sidebar automatically! ✨

## Your First Organized Documentation

Let's create a more structured documentation:

### Create Multiple Pages

```bash
# Create a guides folder
mkdir body/guides

# Create guide files
echo "# Basic Tutorial\n\nLearn the basics..." > body/guides/basic.md
echo "# Advanced Tutorial\n\nAdvanced concepts..." > body/guides/advanced.md

# Create API documentation
mkdir body/api
echo "# Authentication\n\nAPI authentication..." > body/api/authentication.md
```

### Update Sidebar with Groups

Edit `config.json`:

```json
{
  "title": "My Documentation",
  "description": "Awesome project documentation",
  "sidebar": [
    "home",
    "getting-started",
    {
      "title": "Guides",
      "children": [
        "guides/basic",
        "guides/advanced"
      ]
    },
    {
      "title": "API Reference",
      "children": [
        "api/authentication"
      ]
    }
  ]
}
```

## Build for Production

When you're ready to deploy:

```bash
rhyla build
```

This creates a `dist/` folder with your static site:

```
dist/
├── index.html
├── config.json
├── styles/
├── scripts/
├── public/
└── pages/
```

## Serve Production Build

Test your production build locally:

```bash
rhyla serve
```

Your site will be available at `http://localhost:8080`

## Next Steps

Now that you have a basic site running, explore these features:

### 🎨 Customize Your Theme

Edit files in the `styles/` folder:
- `global.css` - Base styles
- `dark.css` - Dark theme
- `light.css` - Light theme

### 🔒 Add Password Protection

Enable authentication in `config.json`:

```json
{
  "password_doc": {
    "enabled": true,
    "passwords": ["mySecurePassword123"]
  }
}
```

### 🏷️ Use Smart Tags

Rename your files to get automatic tags:
- `get-users.md` → Shows **GET** tag
- `post-login.md` → Shows **POST** tag
- `feature-new.md` → Shows **NEW** badge

### 📁 Organize with Folders

Create nested folders for better organization:

```
body/
├── home.md
├── getting-started.md
├── guides/
│   ├── installation.md
│   ├── configuration.md
│   └── deployment.md
├── api/
│   ├── authentication.md
│   ├── endpoints/
│   │   ├── get-users.md
│   │   └── post-login.md
└── releases/
    └── v1.0.0.md
```

## Common Commands Reference

| Command | Description |
|---------|-------------|
| `rhyla init` | Initialize a new project |
| `rhyla dev` | Start development server |
| `rhyla build` | Build for production |
| `rhyla serve` | Serve production build |

## Tips for Success

1. **Write in Markdown** - Use standard markdown syntax for all content
2. **Use Descriptive Names** - Clear file names make navigation easier
3. **Organize with Folders** - Group related content together
4. **Test Locally First** - Always test with `rhyla dev` before building
5. **Version Control** - Use Git to track changes to your documentation

## Need Help?

- 📖 Read the [Complete Documentation](how-it-works)
- ⚙️ Check [Configuration Reference](config_reference)
- 🚀 Learn about [Deployment Options](deployment)
- 🎨 Explore [Customization Guide](customization)
- ❓ See [Troubleshooting](troubleshooting)

## What's Next?

You're all set! Here are some suggestions:

1. **Add more content** - Create pages for your project
2. **Customize the theme** - Make it match your brand
3. **Configure features** - Enable password protection, adjust sidebar
4. **Deploy your site** - Share your documentation with the world

Happy documenting! 📚✨
