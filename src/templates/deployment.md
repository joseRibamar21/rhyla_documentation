# Deployment Guide

Deploy your Rhyla documentation to the web in minutes! This guide covers the most popular hosting platforms.

## Before You Deploy

### Build Your Site

Always build your site before deploying:

```bash
rhyla build
```

This creates a `dist/` folder containing your complete static site.

### What Gets Deployed

The `dist/` folder contains:
- Static HTML files
- CSS stylesheets
- JavaScript files
- Images and assets
- Configuration files

No server-side code is needed - it's 100% static! 🎉

## Deployment Options

Choose the platform that best fits your needs:

## 1. Vercel (Recommended) ⚡

**Best for:** Quick deployment, automatic previews, custom domains

### Via Vercel CLI

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
rhyla build
vercel --prod
```

### Via GitHub Integration

1. Push your code to GitHub
2. Visit [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your repository
5. Configure build settings:
   - **Build Command:** `rhyla build`
   - **Output Directory:** `dist`
6. Click "Deploy"

### Custom Domain on Vercel

1. Go to your project settings
2. Navigate to "Domains"
3. Add your custom domain
4. Update your DNS records as instructed

**Vercel Configuration (`vercel.json`):**

```json
{
  "buildCommand": "rhyla build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "trailingSlash": false
}
```

---

## 2. Netlify 🌐

**Best for:** Continuous deployment, form handling, serverless functions

### Via Netlify CLI

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Deploy:
```bash
rhyla build
netlify deploy --prod --dir=dist
```

### Via Drag & Drop

1. Build your site: `rhyla build`
2. Visit [app.netlify.com/drop](https://app.netlify.com/drop)
3. Drag the `dist` folder onto the page
4. Done! 🎉

### Via GitHub Integration

1. Push your code to GitHub
2. Visit [netlify.com](https://netlify.com)
3. Click "New site from Git"
4. Choose your repository
5. Configure build settings:
   - **Build command:** `rhyla build`
   - **Publish directory:** `dist`
6. Click "Deploy site"

**Netlify Configuration (`netlify.toml`):**

```toml
[build]
  command = "rhyla build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

## 3. GitHub Pages 📄

**Best for:** Open source projects, free hosting

### Via GitHub Actions (Automated)

1. Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install -g rhyla
      
      - name: Build
        run: rhyla build
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
```

2. Push to GitHub
3. Enable GitHub Pages in repository settings
4. Select `gh-pages` branch as source

### Manual Deployment

```bash
# Build your site
rhyla build

# Install gh-pages
npm install -g gh-pages

# Deploy
gh-pages -d dist
```

**Base Path Configuration:**

If deploying to `username.github.io/repo-name`, update `config.json`:

```json
{
  "base": "/repo-name/"
}
```

---

## 4. Cloudflare Pages ☁️

**Best for:** Global CDN, great performance, unlimited bandwidth

### Via Cloudflare Dashboard

1. Visit [pages.cloudflare.com](https://pages.cloudflare.com)
2. Click "Create a project"
3. Connect your Git repository
4. Configure build settings:
   - **Build command:** `npm install -g rhyla && rhyla build`
   - **Build output directory:** `dist`
5. Click "Save and Deploy"

**Cloudflare Configuration (`_headers`):**

Create `public/_headers`:

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

---

## 5. AWS S3 + CloudFront 🚀

**Best for:** Enterprise deployments, full AWS integration

### Setup S3 Bucket

```bash
# Install AWS CLI
brew install awscli  # macOS
# or
choco install awscli  # Windows

# Configure AWS
aws configure

# Create bucket
aws s3 mb s3://my-docs-bucket

# Enable static website hosting
aws s3 website s3://my-docs-bucket \
  --index-document index.html \
  --error-document index.html
```

### Deploy to S3

```bash
# Build
rhyla build

# Sync to S3
aws s3 sync dist/ s3://my-docs-bucket --delete

# Make public
aws s3api put-bucket-policy \
  --bucket my-docs-bucket \
  --policy file://bucket-policy.json
```

**Bucket Policy (`bucket-policy.json`):**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-docs-bucket/*"
  }]
}
```

### Add CloudFront CDN

1. Create CloudFront distribution
2. Set origin to S3 bucket
3. Configure custom domain (optional)
4. Update DNS to CloudFront URL

---

## 6. Azure Static Web Apps 💙

**Best for:** Microsoft ecosystem, enterprise features

### Via Azure CLI

```bash
# Install Azure CLI
brew install azure-cli  # macOS

# Login
az login

# Create static web app
az staticwebapp create \
  --name my-docs \
  --resource-group my-resource-group \
  --source https://github.com/username/repo \
  --location "East US 2" \
  --branch main \
  --app-location "/" \
  --output-location "dist"
```

**Azure Configuration (`staticwebapp.config.json`):**

```json
{
  "routes": [
    {
      "route": "/*",
      "serve": "/index.html",
      "statusCode": 200
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  }
}
```

---

## 7. Self-Hosted Server 🖥️

**Best for:** Full control, internal documentation

### Using Nginx

1. Build your site:
```bash
rhyla build
```

2. Copy to web server:
```bash
scp -r dist/* user@server:/var/www/docs/
```

3. Configure Nginx (`/etc/nginx/sites-available/docs`):

```nginx
server {
    listen 80;
    server_name docs.example.com;
    
    root /var/www/docs;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

4. Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/docs /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Using Apache

Configure `.htaccess` in `dist/`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## Custom Domain Setup

### DNS Configuration

Add these records to your DNS provider:

**For root domain (example.com):**
```
A     @     <your-host-ip>
```

**For subdomain (docs.example.com):**
```
CNAME docs   <your-host-url>
```

### SSL/HTTPS

Most platforms provide free SSL certificates:

- **Vercel/Netlify:** Automatic SSL
- **Cloudflare:** Free SSL included
- **Let's Encrypt (self-hosted):**

```bash
sudo certbot --nginx -d docs.example.com
```

---

## Environment-Specific Configuration

### Development

```json
{
  "title": "My Docs (Dev)",
  "base": "/",
  "password_doc": {
    "enabled": false
  }
}
```

### Production

```json
{
  "title": "My Docs",
  "base": "/",
  "site_url": "https://docs.example.com/",
  "password_doc": {
    "enabled": true,
    "passwords": ["prodPassword123"]
  }
}
```

---

## Deployment Checklist

Before deploying to production:

- [ ] Test locally with `rhyla serve`
- [ ] Update `site_url` in `config.json`
- [ ] Set correct `base` path if deploying to subdirectory
- [ ] Enable password protection (if needed)
- [ ] Optimize images in `public/` folder
- [ ] Review `build_ignore` settings
- [ ] Test on multiple browsers
- [ ] Verify mobile responsiveness
- [ ] Check all internal links
- [ ] Set up custom domain (optional)
- [ ] Configure SSL certificate
- [ ] Set up analytics (optional)

---

## CI/CD Automation

### GitHub Actions Example

```yaml
name: Deploy Documentation

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Rhyla
        run: npm install -g rhyla
      
      - name: Build
        run: rhyla build
      
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          working-directory: ./dist
```

---

## Performance Optimization

### Enable Caching

Add cache headers for static assets:

**Vercel (`vercel.json`):**
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### Compress Assets

Most platforms compress automatically, but you can pre-compress:

```bash
# Install compression tools
npm install -g gzip-cli

# Compress after build
rhyla build
find dist -type f \( -name '*.html' -o -name '*.css' -o -name '*.js' \) -exec gzip -k {} \;
```

---

## Troubleshooting Deployment

### 404 Errors on Refresh

**Cause:** SPA routing not configured

**Solution:** Add redirect rules (see platform-specific configs above)

### Assets Not Loading

**Cause:** Incorrect base path

**Solution:** Set correct `base` in `config.json`:
```json
{
  "base": "/your-subdirectory/"
}
```

### Password Auth Not Working

**Cause:** `config.json` not deployed

**Solution:** Ensure `config.json` is in `dist/` root after build

---

## Need Help?

- 📖 [Configuration Reference](config_reference)
- 🚀 [Quick Start Guide](quick-start)
- ❓ [Troubleshooting](troubleshooting)

Happy deploying! 🚀✨
