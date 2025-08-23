import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import build from './build.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function serve(opts = {}) {
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla-docs'); // Alterado para rhyla-docs para evitar conflito
  const distDir = path.join(root, opts.dir || 'dist');

  // Base path: --base CLI > rhyla/config.json base > '/'
  let base = typeof opts.base === 'string' ? opts.base : '/';
  try {
    const cfgPath = path.join(rhylaPath, 'config.json');
    if ((!base || base === '/' ) && fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg && typeof cfg.base === 'string' && cfg.base.trim()) base = cfg.base.trim();
    }
  } catch { /* ignore */ }
  if (!base.startsWith('/')) base = '/' + base;
  if (!base.endsWith('/')) base += '/';

  // Build (unless disabled with --no-build)
  if (opts.build !== false) {
    await build();
  } else if (!fs.existsSync(distDir)) {
    console.error('❌ dist not found. Run `rhyla build` or omit --no-build.');
    process.exit(1);
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
