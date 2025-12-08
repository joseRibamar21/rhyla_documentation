# CLI Reference

Complete reference for all Rhyla command-line interface (CLI) commands.

## Installation

Install Rhyla globally to use the CLI:

```bash
npm install -g rhyla
```

Verify installation:

```bash
rhyla --version
```

---

## Commands Overview

| Command | Description |
|---------|-------------|
| `rhyla init` | Initialize a new project |
| `rhyla dev` | Start development server |
| `rhyla build` | Build for production |
| `rhyla serve` | Serve production build |
| `rhyla --version` | Show version number |
| `rhyla --help` | Show help information |

---

## rhyla init

Initialize a new Rhyla documentation project.

### Usage

```bash
rhyla init [directory]
```

### Arguments

- `directory` (optional) - Directory name for the project. Defaults to current directory.

### Examples

**Create in current directory:**
```bash
rhyla init
```

**Create in new directory:**
```bash
rhyla init my-docs
```

**Create with specific name:**
```bash
mkdir project-docs
cd project-docs
rhyla init
```

### What It Creates

```
project/
├── config.json          # Site configuration
├── header.html          # Custom header template
├── body/                # Documentation content
│   └── home.md         # Homepage
├── public/              # Static assets
│   ├── favicon.ico
│   └── logo.png
└── styles/              # Stylesheets
    ├── dark.css        # Dark theme
    ├── light.css       # Light theme
    └── global.css      # Global styles
```

### Default Configuration

Creates `config.json` with:

```json
{
  "title": "Documentation",
  "description": "Generated with Rhyla",
  "sidebar": ["home"],
  "side_topics": true,
  "allow_raw_html": false,
  "base": "/",
  "build_ignore": ["kit_dev_rhyla"]
}
```

### Options

Currently `rhyla init` doesn't accept options, but you can modify the generated files afterward.

---

## rhyla dev

Start a development server with hot reload.

### Usage

```bash
rhyla dev [options]
```

### Options

- None currently supported (uses port 3000 by default)

### Environment Variables

- `PORT` - Custom port number (default: 3000)

### Examples

**Start with default port:**
```bash
rhyla dev
```

**Start with custom port:**
```bash
PORT=3001 rhyla dev
```

**Start with environment variable (macOS/Linux):**
```bash
PORT=8080 rhyla dev
```

**Start with environment variable (Windows CMD):**
```cmd
set PORT=8080 && rhyla dev
```

**Start with environment variable (Windows PowerShell):**
```powershell
$env:PORT=8080; rhyla dev
```

### Features

- **Hot Reload** - Automatically reloads browser on file changes
- **Live Updates** - Watches for changes in:
  - `body/` - Markdown files
  - `styles/` - CSS files
  - `public/` - Static assets
  - `config.json` - Configuration
  - `header.html` - Header template
- **Error Reporting** - Shows build errors in terminal
- **Fast Builds** - Optimized for quick iteration

### Output

```
[Rhyla Dev Server]
Server running at http://localhost:3000
Watching for changes...
```

### Stopping the Server

Press `Ctrl+C` in the terminal.

---

## rhyla build

Build your documentation for production deployment.

### Usage

```bash
rhyla build [options]
```

### Options

- None currently supported

### Examples

**Standard build:**
```bash
rhyla build
```

**Build and check output:**
```bash
rhyla build && ls -la dist/
```

**Build with error checking:**
```bash
rhyla build || echo "Build failed!"
```

### Output Directory

Creates a `dist/` folder with:

```
dist/
├── index.html              # Main HTML file
├── config.json             # Site configuration
├── styles/                 # Compiled stylesheets
│   ├── global.css
│   ├── dark.css
│   └── light.css
├── scripts/                # Generated JavaScript
│   ├── header-runtime.js
│   ├── search-runtime.js
│   ├── search_index.js
│   ├── search_index.json
│   ├── generatePages.js
│   └── password-auth.js
├── public/                 # Static assets
│   ├── favicon.ico
│   └── logo.png
└── pages/                  # Generated page content
    ├── home.json
    └── [other-pages].json
```

### Build Process

1. **Reads Configuration** - Parses `config.json`
2. **Processes Markdown** - Converts `.md` files to HTML
3. **Generates Search Index** - Creates searchable content index
4. **Copies Assets** - Copies `public/` files
5. **Minifies Styles** - Optimizes CSS files
6. **Creates Output** - Writes to `dist/` folder

### Build Ignore

Files/folders specified in `config.json` are excluded:

```json
{
  "build_ignore": [
    "drafts",
    "private",
    "kit_dev_rhyla"
  ]
}
```

### Build Errors

Common errors and fixes:

**Invalid config.json:**
```
Error: Invalid JSON in config.json
```
Fix: Validate JSON syntax

**Missing files:**
```
Error: Cannot find file 'body/missing.md'
```
Fix: Check sidebar references and file paths

**Markdown syntax errors:**
```
Error: Unexpected token in body/page.md
```
Fix: Check markdown syntax, close code blocks

---

## rhyla serve

Serve the production build locally for testing.

### Usage

```bash
rhyla serve [options]
```

### Options

- None currently supported (uses port 8080 by default)

### Examples

**Start server:**
```bash
rhyla serve
```

**Serve after building:**
```bash
rhyla build && rhyla serve
```

### Features

- **Production Testing** - Test the built site locally
- **Static File Serving** - Serves files from `dist/`
- **Default Port** - Runs on port 8080

### Output

```
[Rhyla Serve]
Serving production build at http://localhost:8080
Press Ctrl+C to stop
```

### Use Cases

1. **Pre-deployment Testing**
   ```bash
   rhyla build
   rhyla serve
   # Test at http://localhost:8080
   ```

2. **Quality Assurance**
   - Test production build before deploying
   - Verify all links work
   - Check responsive design

3. **Demo/Preview**
   - Show stakeholders the production version
   - Share local preview

### Stopping the Server

Press `Ctrl+C` in the terminal.

---

## rhyla --version

Display the installed Rhyla version.

### Usage

```bash
rhyla --version
```

### Aliases

```bash
rhyla -v
rhyla version
```

### Output

```
1.0.8
```

### Use Cases

- **Check Installation** - Verify Rhyla is installed
- **Version Comparison** - Check if update is needed
- **Bug Reports** - Include version in issue reports

---

## rhyla --help

Display help information and available commands.

### Usage

```bash
rhyla --help
```

### Aliases

```bash
rhyla -h
rhyla help
```

### Output

```
Rhyla - Documentation Generator

Commands:
  rhyla init [dir]     Initialize a new project
  rhyla dev            Start development server
  rhyla build          Build for production
  rhyla serve          Serve production build

Options:
  --version, -v        Show version number
  --help, -h           Show help

Examples:
  rhyla init my-docs   Create new project
  rhyla dev            Start dev server
  rhyla build          Build site
  rhyla serve          Serve built site

Documentation: https://rhyladoc.com
```

---

## Command Workflows

### Initial Setup Workflow

```bash
# 1. Create new project
rhyla init my-docs

# 2. Navigate to project
cd my-docs

# 3. Start development
rhyla dev

# 4. Edit files in body/, styles/, etc.
# (Dev server auto-reloads)

# 5. Build for production
rhyla build

# 6. Test production build
rhyla serve
```

### Development Workflow

```bash
# 1. Start dev server
rhyla dev

# 2. Edit content
# - Add/edit files in body/
# - Update config.json
# - Customize styles/

# 3. Preview changes
# Open http://localhost:3000

# 4. Build when ready
# Ctrl+C to stop dev server
rhyla build
```

### Deployment Workflow

```bash
# 1. Build project
rhyla build

# 2. Test locally
rhyla serve

# 3. Deploy dist/ folder
# - Upload to hosting
# - Push to Git (for Vercel/Netlify)
# - Run CI/CD pipeline
```

---

## Environment Variables

### PORT (dev/serve)

Set custom port for dev or serve commands:

```bash
# macOS/Linux
PORT=3001 rhyla dev
PORT=9000 rhyla serve

# Windows CMD
set PORT=3001 && rhyla dev
set PORT=9000 && rhyla serve

# Windows PowerShell
$env:PORT=3001; rhyla dev
$env:PORT=9000; rhyla serve
```

### DEBUG

Enable debug output:

```bash
DEBUG=* rhyla dev
DEBUG=* rhyla build
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error occurred |

### Examples

```bash
# Check if build succeeded
rhyla build
if [ $? -eq 0 ]; then
  echo "Build successful!"
else
  echo "Build failed!"
fi
```

```bash
# Build and deploy on success
rhyla build && vercel --prod
```

---

## NPX Usage

Run Rhyla without global installation:

```bash
# Initialize project
npx rhyla init

# Development
npx rhyla dev

# Build
npx rhyla build

# Serve
npx rhyla serve
```

---

## Package.json Scripts

Add Rhyla commands to your `package.json`:

```json
{
  "scripts": {
    "dev": "rhyla dev",
    "build": "rhyla build",
    "serve": "rhyla serve",
    "start": "rhyla dev"
  }
}
```

Then run:

```bash
npm run dev
npm run build
npm run serve
npm start
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Build Documentation
  run: |
    npm install -g rhyla
    rhyla build
```

### GitLab CI

```yaml
build:
  script:
    - npm install -g rhyla
    - rhyla build
  artifacts:
    paths:
      - dist/
```

### Jenkins

```groovy
stage('Build') {
  steps {
    sh 'npm install -g rhyla'
    sh 'rhyla build'
  }
}
```

---

## Troubleshooting Commands

### Clear and Rebuild

```bash
rm -rf dist node_modules
npm install -g rhyla
rhyla build
```

### Verbose Output

```bash
DEBUG=* rhyla build
```

### Check Installation

```bash
which rhyla
rhyla --version
```

### Reinstall

```bash
npm uninstall -g rhyla
npm install -g rhyla
```

---

## Advanced Usage

### Custom Build Directory

Currently not supported, but you can copy dist:

```bash
rhyla build
cp -r dist/ custom-output/
```

### Multiple Environments

Use different config files:

```bash
# Development
cp config.dev.json config.json
rhyla dev

# Production
cp config.prod.json config.json
rhyla build
```

### Automated Builds

```bash
#!/bin/bash
# build.sh

echo "Building documentation..."
rhyla build

if [ $? -eq 0 ]; then
  echo "✅ Build successful!"
  rhyla serve
else
  echo "❌ Build failed!"
  exit 1
fi
```

Make executable and run:

```bash
chmod +x build.sh
./build.sh
```

---

## Tips and Best Practices

1. **Use npm scripts** - Standardize commands across team
2. **Test before deploying** - Always run `rhyla serve` after build
3. **Version control** - Commit before major changes
4. **Clean builds** - Remove `dist/` before building
5. **Check errors** - Read terminal output carefully
6. **Use latest version** - Keep Rhyla updated

---

## Quick Reference

```bash
# Setup
npm install -g rhyla
rhyla init my-docs
cd my-docs

# Development
rhyla dev                    # Start dev server (port 3000)
PORT=8080 rhyla dev         # Custom port

# Production
rhyla build                  # Build to dist/
rhyla serve                  # Serve dist/ (port 8080)

# Utilities
rhyla --version             # Show version
rhyla --help                # Show help
```

---

## Need More Help?

- 📖 [Quick Start Guide](quick-start)
- ⚙️ [Configuration Reference](config_reference)
- ❓ [Troubleshooting](troubleshooting)
- 🚀 [Deployment Guide](deployment)

Master the CLI! 💻✨
