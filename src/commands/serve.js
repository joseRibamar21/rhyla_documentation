import express from 'express';
import path from 'path';
import fs from 'fs';
import build from './build.js';
import { DOCS_DIR, loadConfig, normalizeBase } from '../core/config.js';

export default async function serve(opts = {}) {
  const root = process.cwd();
  const rhylaPath = path.join(root, DOCS_DIR);
  const distDir = path.join(root, opts.dir || 'dist');

  // Base path: --base CLI > rhyla-docs/config.json base > '/'
  const base = typeof opts.base === 'string' && opts.base !== '/'
    ? normalizeBase(opts.base)
    : loadConfig(rhylaPath).base;

  // Build (unless disabled with --no-build)
  if (opts.build !== false) {
    await build();
  } else if (!fs.existsSync(distDir)) {
    throw new Error('dist not found. Run `rhyla build` or omit --no-build.');
  }

  const app = express();

  // Serve dist under base prefix
  app.use(base, express.static(distDir, { extensions: ['html'] }));

  // Optional: health route
  app.get(base.replace(/\/$/, '') + '/_health', (_req, res) => res.json({ ok: true }));

  const port = Number(opts.port || process.env.PORT || 3333);
  app.listen(port, () => {
    const url = `http://localhost:${port}${base}`;
    console.log(`🚀 Rhyla serve online em ${url}`);
    console.log('Base:', base, '| Dir:', distDir);
  });
}
