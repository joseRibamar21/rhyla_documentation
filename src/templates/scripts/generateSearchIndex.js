import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Agora podemos importar diretamente da raiz do pacote
// import RhylaClient from 'rhyla';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ');
}

function stripMarkdown(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^\)]*\)/g, ' ')
    .replace(/\[[^\]]*\]\([^\)]*\)/g, (_m) => ' ')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_~`>#-]/g, ' ');
}

function firstHeading(htmlOrMd) {
  const h1 = htmlOrMd.match(/^#\s+(.+)$/m) || htmlOrMd.match(/^<h1[^>]*>(.*?)<\/h1>/i);
  if (!h1) return null;
  const val = Array.isArray(h1) ? (h1[1] || h1[0]) : h1;
  return String(val).replace(/<[^>]+>/g, '').trim();
}

async function main() {
  const cwd = process.cwd();
  const bodyDir = path.join(cwd, 'body');
  if (!fs.existsSync(bodyDir)) {
    console.error('Body folder not found:', bodyDir);
    process.exit(0);
  }

  const IGNORE = new Set([
    'notfound', 'notfound.html', 'notfound.md', '404.html', '404.md',
    'header.html', 'footer.html', 'config.yaml', 'config.json',
    'index.html', 'index.md', 'search.html', '.search.html'
  ]);

  const files = walk(bodyDir).filter(f => /\.(md|html)$/i.test(f));

  const entries = files
    .filter(f => !IGNORE.has(path.basename(f).toLowerCase()))
    .map(file => {
      const rel = path.relative(bodyDir, file);
      const ext = path.extname(file).toLowerCase();
      const route = '/' + rel.replace(/\\/g, '/').replace(/\.(md|html)$/i, '');
      const raw = fs.readFileSync(file, 'utf8');
      let text = '';
      let title = '';
      if (ext === '.html') {
        title = firstHeading(raw) || path.basename(file, ext);
        text = stripHtml(raw);
      } else {
        title = firstHeading(raw) || path.basename(file, ext);
        text = stripMarkdown(raw);
      }
      return {
        route: route === '/home' ? '/' : route,
        title: title.trim(),
        content: text.replace(/\s+/g, ' ').trim()
      };
    });

  const outJson = path.join(__dirname, 'search_index.json');
  fs.writeFileSync(outJson, JSON.stringify(entries, null, 2), 'utf8');

  const outJs = path.join(__dirname, 'search_index.js');
  fs.writeFileSync(outJs, `window.__SEARCH_INDEX__ = ${JSON.stringify(entries)};`, 'utf8');

  console.log(`Search index generated: ${entries.length} entries`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
