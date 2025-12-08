# Troubleshooting

Common issues and solutions when working with Rhyla. If you're experiencing problems, check this guide first!

## Installation Issues

### "command not found: rhyla"

**Problem:** Rhyla CLI is not accessible after installation.

**Solutions:**

1. **Verify installation:**
   ```bash
   npm list -g rhyla
   ```

2. **Reinstall globally:**
   ```bash
   npm uninstall -g rhyla
   npm install -g rhyla
   ```

3. **Check npm global path:**
   ```bash
   npm config get prefix
   ```
   
   Add to your PATH if needed:
   ```bash
   # macOS/Linux (.zshrc or .bashrc)
   export PATH="$PATH:$(npm config get prefix)/bin"
   
   # Windows (PowerShell as Admin)
   $env:Path += ";$(npm config get prefix)"
   ```

4. **Use npx as alternative:**
   ```bash
   npx rhyla dev
   ```

---

### Node.js Version Error

**Problem:** "Error: Requires Node.js version 14 or higher"

**Solution:**

1. Check your Node.js version:
   ```bash
   node --version
   ```

2. Update Node.js:
   - Visit [nodejs.org](https://nodejs.org) and install the latest LTS version
   - Or use nvm:
     ```bash
     nvm install --lts
     nvm use --lts
     ```

---

## Development Server Issues

### Port Already in Use

**Problem:** "Error: Port 3000 is already in use"

**Solutions:**

1. **Kill the process using the port:**
   ```bash
   # macOS/Linux
   lsof -ti:3000 | xargs kill
   
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

2. **Use a different port:**
   ```bash
   PORT=3001 rhyla dev
   ```

---

### Hot Reload Not Working

**Problem:** Changes to files don't trigger page reload.

**Solutions:**

1. **Restart dev server:**
   ```bash
   # Stop with Ctrl+C, then:
   rhyla dev
   ```

2. **Check file paths:**
   - Ensure files are in `body/`, `styles/`, or `public/`
   - File names should not contain special characters

3. **Clear browser cache:**
   - Hard reload: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

4. **Check console for errors:**
   - Open browser DevTools (F12)
   - Look for errors in Console tab

---

### Blank Page on Dev Server

**Problem:** `http://localhost:3000` shows a blank page.

**Solutions:**

1. **Check for errors:**
   ```bash
   rhyla dev
   # Look for error messages in terminal
   ```

2. **Verify project structure:**
   ```bash
   ls -la
   # Should show: config.json, body/, styles/, public/
   ```

3. **Check config.json syntax:**
   - Validate JSON at [jsonlint.com](https://jsonlint.com)
   - Look for missing commas, brackets, quotes

4. **Ensure home.md exists:**
   ```bash
   ls body/home.md
   ```

---

## Build Issues

### Build Fails with Errors

**Problem:** `rhyla build` command fails.

**Solutions:**

1. **Check error message:**
   - Read the full error in terminal
   - Common errors: invalid JSON, missing files, syntax errors

2. **Validate config.json:**
   ```bash
   cat config.json | python -m json.tool
   ```

3. **Check markdown syntax:**
   - Ensure all code blocks are properly closed
   - Look for unclosed HTML tags (if `allow_raw_html` is enabled)

4. **Clear and rebuild:**
   ```bash
   rm -rf dist
   rhyla build
   ```

---

### Missing Files in dist/

**Problem:** Some files are missing from the `dist/` folder after build.

**Solutions:**

1. **Check build_ignore:**
   ```json
   {
     "build_ignore": ["drafts", "private"]
   }
   ```
   Remove paths you want to include.

2. **Verify file locations:**
   - Files must be in `body/`, `public/`, or `styles/`
   - Check for typos in file names

3. **Check sidebar config:**
   - Files must be referenced in sidebar to be built
   - Or ensure they're in a folder that's referenced

---

## Sidebar Issues

### Sidebar Not Showing Pages

**Problem:** Pages don't appear in the sidebar.

**Solutions:**

1. **Check config.json:**
   ```json
   {
     "sidebar": [
       "home",
       "getting-started"  // Must match file name without extension
     ]
   }
   ```

2. **Verify file exists:**
   ```bash
   ls body/getting-started.md
   ```

3. **Check file path:**
   - Use relative path from `body/` folder
   - For nested files: `"folder/filename"`

4. **Restart dev server:**
   ```bash
   # Ctrl+C to stop, then:
   rhyla dev
   ```

---

### Sidebar Groups Not Collapsing

**Problem:** Sidebar groups don't expand/collapse.

**Solutions:**

1. **Check JavaScript errors:**
   - Open browser DevTools (F12)
   - Look for errors in Console

2. **Verify config.json structure:**
   ```json
   {
     "sidebar": [
       {
         "title": "Group Name",
         "children": ["page1", "page2"]
       }
     ]
   }
   ```

3. **Clear browser cache:**
   - Hard reload: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

---

## Password Authentication Issues

### Password Not Working

**Problem:** Correct password is rejected.

**Solutions:**

1. **Check config.json:**
   ```json
   {
     "password_doc": {
       "enabled": true,
       "passwords": ["yourPassword"]  // Case-sensitive!
     }
   }
   ```

2. **Clear localStorage:**
   ```javascript
   // In browser console (F12):
   localStorage.clear();
   location.reload();
   ```

3. **Use logout command:**
   ```javascript
   // In browser console:
   rhylaLogout();
   ```

4. **Check for typos:**
   - Passwords are case-sensitive
   - No extra spaces in config.json

---

### Blocked After 5 Attempts

**Problem:** "Access Blocked" message appears.

**Solutions:**

1. **Wait 5 minutes:**
   - Automatic unlock after timeout

2. **Clear localStorage:**
   ```javascript
   // In browser console (F12):
   localStorage.clear();
   location.reload();
   ```

3. **Use rhylaLogout():**
   ```javascript
   // In browser console:
   rhylaLogout();
   ```

---

### Password Protection Not Enabled

**Problem:** Site is accessible without password.

**Solutions:**

1. **Check enabled flag:**
   ```json
   {
     "password_doc": {
       "enabled": true,  // Must be true!
       "passwords": ["password123"]
     }
   }
   ```

2. **Verify config.json is deployed:**
   - Check `dist/config.json` exists
   - Ensure it's uploaded to server

3. **Clear browser cache:**
   - Password auth script may be cached

---

## Styling Issues

### Custom Styles Not Applied

**Problem:** Changes to CSS files don't show up.

**Solutions:**

1. **Hard reload browser:**
   - Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)

2. **Check file location:**
   - CSS must be in `styles/` folder
   - Files: `global.css`, `dark.css`, `light.css`

3. **Verify CSS syntax:**
   - Look for missing semicolons, brackets
   - Use browser DevTools to check for CSS errors

4. **Rebuild project:**
   ```bash
   rhyla build
   rhyla serve
   ```

---

### Theme Switcher Not Working

**Problem:** Can't switch between light/dark themes.

**Solutions:**

1. **Check browser console:**
   - Open DevTools (F12)
   - Look for JavaScript errors

2. **Clear localStorage:**
   ```javascript
   localStorage.removeItem('theme');
   location.reload();
   ```

3. **Verify CSS files exist:**
   ```bash
   ls styles/dark.css styles/light.css
   ```

---

## Search Issues

### Search Not Finding Pages

**Problem:** Search returns no results for pages that exist.

**Solutions:**

1. **Rebuild search index:**
   ```bash
   rhyla build
   ```

2. **Check search_index.json:**
   ```bash
   cat dist/scripts/search_index.json
   ```

3. **Verify page is in sidebar:**
   - Only pages in sidebar are indexed

4. **Check page content:**
   - Empty pages won't be indexed
   - Add meaningful content to pages

---

## Deployment Issues

### 404 on Page Refresh

**Problem:** Refreshing page shows 404 error.

**Solutions:**

**Vercel:**
Create `vercel.json`:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Netlify:**
Create `netlify.toml`:
```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**Nginx:**
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

---

### Assets Not Loading

**Problem:** Images, CSS, or JS files return 404.

**Solutions:**

1. **Check base path:**
   ```json
   {
     "base": "/your-subdirectory/"  // Include trailing slash!
   }
   ```

2. **Verify file paths:**
   - Use absolute paths: `/public/logo.png`
   - Not relative: `./public/logo.png`

3. **Check deployment folder:**
   - Ensure `dist/` folder is deployed
   - Not the root project folder

---

### Custom Domain Not Working

**Problem:** Custom domain shows error or doesn't resolve.

**Solutions:**

1. **Check DNS records:**
   ```
   # For root domain:
   A     @     your-host-ip
   
   # For subdomain:
   CNAME docs   your-host-url
   ```

2. **Wait for propagation:**
   - DNS changes take 24-48 hours
   - Check status: [whatsmydns.net](https://whatsmydns.net)

3. **Verify SSL certificate:**
   - Most platforms auto-provision SSL
   - Check platform documentation

---

## Performance Issues

### Slow Page Load

**Problem:** Pages take long to load.

**Solutions:**

1. **Optimize images:**
   - Compress images before adding to `public/`
   - Use WebP format when possible
   - Recommended max size: 500KB per image

2. **Minimize custom CSS:**
   - Remove unused styles
   - Combine multiple CSS files

3. **Reduce page size:**
   - Split large pages into multiple smaller pages
   - Use pagination for long lists

4. **Enable caching:**
   - Configure cache headers on hosting platform

---

### Large Build Size

**Problem:** `dist/` folder is very large.

**Solutions:**

1. **Use build_ignore:**
   ```json
   {
     "build_ignore": ["drafts", "examples", "assets/raw"]
   }
   ```

2. **Optimize assets:**
   - Compress images
   - Remove unused fonts
   - Minimize custom scripts

3. **Clean before build:**
   ```bash
   rm -rf dist
   rhyla build
   ```

---

## Common Error Messages

### "Cannot read property of undefined"

**Cause:** Invalid config.json or missing required fields.

**Fix:**
```json
{
  "title": "My Docs",
  "description": "Description",
  "sidebar": []  // Must be present
}
```

---

### "ENOENT: no such file or directory"

**Cause:** Referenced file doesn't exist.

**Fix:**
1. Check file path in error message
2. Verify file exists in `body/` folder
3. Check for typos in config.json

---

### "SyntaxError: Unexpected token"

**Cause:** Invalid JSON in config.json.

**Fix:**
1. Validate at [jsonlint.com](https://jsonlint.com)
2. Check for:
   - Missing commas
   - Extra commas
   - Unclosed brackets
   - Unquoted keys

---

## Getting More Help

If your issue isn't covered here:

1. **Check documentation:**
   - [Quick Start Guide](quick-start)
   - [Configuration Reference](config_reference)
   - [How Rhyla Works](how-it-works)

2. **Enable verbose logging:**
   ```bash
   DEBUG=* rhyla dev
   ```

3. **Check browser console:**
   - Press F12
   - Look for error messages
   - Copy full error text

4. **Verify project structure:**
   ```bash
   tree -L 2
   ```

5. **Create minimal reproduction:**
   - Start with `rhyla init`
   - Add minimal changes to reproduce issue

---

## Debug Checklist

When troubleshooting, check:

- [ ] Node.js version (14+)
- [ ] Valid config.json syntax
- [ ] All referenced files exist
- [ ] Correct file paths in sidebar
- [ ] Browser console for errors
- [ ] Terminal output for errors
- [ ] Latest version of Rhyla
- [ ] Clear browser cache
- [ ] Restart dev server

---

## Still Having Issues?

- 📖 [Documentation](home)
- 🚀 [Quick Start](quick-start)
- ⚙️ [Configuration](config_reference)
- 🎨 [Customization](customization)

Need support? Check the GitHub repository for issues and discussions! 💬
