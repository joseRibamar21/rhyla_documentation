# 📦 How to import Rhyla (Express client)

## ⚡ JavaScript — Quick start

Importing and using the Rhyla Express helper is straightforward:

```javascript
// Import the main client
import express from 'express';
import RhylaClient from 'rhyla';

const app = express();

// Serve the built documentation at the /docs path
RhylaClient.expressConfig(app, '/docs');
```

---

## ✅ Prerequisites

- You must build the static documentation before serving it. Run the CLI build command in your project root:

```
rhyla build
```

- The server serves the files produced by that build. By default Rhyla writes output to `./dist`.

---

## 📁 Using a custom output directory (distDir)

If you changed the build output directory, pass the same path to `expressConfig` using the `distDir` option. Note: `distDir` must point to the *built* output — pointing to source files or templates will not work.

```javascript
// Example: the build was configured to write to './public/docs'
RhylaClient.expressConfig(app, '/docs', { distDir: './public/docs' });
```

`expressConfig` will also try to read `config.json` inside the build output to detect any base path defined at build time. If a base is present in the built `config.json`, `expressConfig` will prefer the explicit base you pass as first argument when present.

---

## ⚠️ Important note about base path

## ℹ️ Notes

- By default Rhyla's built site uses a base of `/` (unless you configured a different base before running the build). The build process generates routes and asset paths according to that base.

- Important: for the server to serve the built files correctly, the base that was used at build-time (the `base` in the generated `config.json`) and the mount path you pass as the second argument to `expressConfig` must match exactly. In other words, if the built site expects `/` you must mount it at `/`; if the built site expects `/docs` you must mount it at `/docs`.

- If they do not match (for example you build with the default `/` but call `RhylaClient.expressConfig(app, '/docs')`), the paths prepared by the build will not align with the server mount, causing broken asset URLs and routing problems.

Example:

```javascript
// Build-time: config.base is '/' (default)
// Wrong — this will likely break paths because the build expects '/'
RhylaClient.expressConfig(app, '/docs');

// Correct — mount at the same base the site was built with
RhylaClient.expressConfig(app, '/');
```

Recommendation: set the intended base in your Rhyla config before running `rhyla build`, or mount the built site using the same base you built it with.

- Mount the docs at the same path you expect users to visit (for example `/docs`).
- `expressConfig` injects a small HTML meta tag so client-side scripts can read the effective base path at runtime.
- Make sure you run `rhyla build` each time you update documentation content so the served files are up to date.


