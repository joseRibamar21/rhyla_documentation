import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import markdownIt from 'markdown-it';

/**
 * Instancia o markdown-it. HTML cru em .md só é permitido com allow_raw_html.
 * @param {{ allowRawHtml?: boolean }} options
 */
export function createMarkdown({ allowRawHtml = false } = {}) {
  const md = new markdownIt({ html: Boolean(allowRawHtml) });
  md.core.ruler.push('rhyla_task_lists', taskLists);
  return md;
}

/**
 * Listas de tarefas: "- [ ] item" / "- [x] item" viram checkboxes (só leitura).
 */
function taskLists(state) {
  const tokens = state.tokens;
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i];
    if (inline.type !== 'inline' || tokens[i - 1].type !== 'paragraph_open' || tokens[i - 2].type !== 'list_item_open') continue;
    const m = inline.content.match(/^\[([ xX])\]\s+/);
    if (!m) continue;
    // Remove o "[ ] " dos primeiros tokens de texto (o "[" pode vir separado)
    let remaining = m[0].length;
    while (remaining > 0 && inline.children.length && inline.children[0].type === 'text') {
      const child = inline.children[0];
      if (child.content.length <= remaining) { remaining -= child.content.length; inline.children.shift(); }
      else { child.content = child.content.slice(remaining); remaining = 0; }
    }
    if (remaining > 0) continue;
    const box = new state.Token('html_inline', '', 0);
    box.content = `<input type="checkbox" class="task-check" disabled${m[1] === ' ' ? '' : ' checked'}> `;
    inline.children.unshift(box);
    tokens[i - 2].attrJoin('class', 'task-item');
  }
}

/**
 * Sanitizador mínimo para páginas .html: remove <script> e atributos on*.
 * @param {string} html
 */
export function sanitizeHtml(html) {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lê só o frontmatter de um arquivo, com cache por mtime (a sidebar chama isso muitas vezes).
 */
const frontmatterCache = new Map();
export function readFrontmatter(file) {
  try {
    const mtime = fs.statSync(file).mtimeMs;
    const cached = frontmatterCache.get(file);
    if (cached && cached.mtime === mtime) return cached.data;
    const data = matter(fs.readFileSync(file, 'utf8')).data || {};
    frontmatterCache.set(file, { mtime, data });
    return data;
  } catch {
    return {};
  }
}

function firstMarkdownH1(markdown) {
  const m = markdown.match(/^#\s+(.+?)\s*#*\s*$/m);
  return m ? m[1].trim() : null;
}

function firstHtmlH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? stripHtml(m[1]) : null;
}

/** "get-list_users-new" → "Get list users new" (último recurso para título). */
export function titleFromFileName(name) {
  const t = name.replace(/[-_]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Lê e renderiza uma página (.md ou .html) de forma idêntica no dev e no build.
 *
 * Frontmatter suportado: title, description, order.
 *
 * @param {string} file caminho absoluto
 * @param {{ md: import('markdown-it'), allowRawHtml?: boolean }} options
 * @returns {{ data: object, title: string, description: string, html: string, markdown: string|null }}
 */
export function renderFile(file, { md, allowRawHtml = false }) {
  const ext = path.extname(file).toLowerCase();
  const source = fs.readFileSync(file, 'utf8');
  const parsed = matter(source);
  const data = parsed.data || {};
  const body = parsed.content;
  const fallbackTitle = titleFromFileName(path.basename(file, ext));

  if (ext === '.md') {
    const h1 = firstMarkdownH1(body);
    const title = String(data.title || h1 || fallbackTitle);
    // Se o título veio só do frontmatter, renderiza um H1 para a página não ficar sem cabeçalho
    const markdown = !h1 && data.title ? `# ${data.title}\n\n${body.replace(/^\s+/, '')}` : body;
    return {
      data,
      title,
      description: typeof data.description === 'string' ? data.description : '',
      html: md.render(markdown),
      markdown,
    };
  }

  const html = allowRawHtml ? body : sanitizeHtml(body);
  return {
    data,
    title: String(data.title || firstHtmlH1(html) || fallbackTitle),
    description: typeof data.description === 'string' ? data.description : '',
    html,
    markdown: null,
  };
}
