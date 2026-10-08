import { stripHtml } from './content.js';

/**
 * Índice consumido pela busca no navegador: [{ route, title, content }].
 * @param {Array<{ route: string, title: string, html: string }>} pages páginas já renderizadas
 */
export function buildSearchIndex(pages) {
  return pages.map((p) => ({ route: p.route, title: p.title, content: stripHtml(p.html) }));
}

/**
 * Caminho (relativo à raiz do site) da versão mais legível por máquina de uma página:
 * o .md para páginas markdown, o .html para páginas html.
 */
export function machineReadablePath(page) {
  if (page.markdown !== null) return page.isHome ? 'index.md' : `${page.slug}.md`;
  return page.isHome ? '' : `${page.slug}.html`;
}

const prettyGroup = (group) => group.split('/').map((s) => s.replace(/[_-]+/g, ' ')).join(' / ');

/**
 * Gera o llms.txt (https://llmstxt.org): índice em markdown com links para cada página.
 * @param {Array} pages páginas renderizadas
 * @param {{ title: string, description: string, urlFor: (relPath: string) => string }} options
 */
export function buildLlmsTxt(pages, { title, description, urlFor }) {
  const lines = [`# ${title || 'Documentation'}`, ''];
  if (description) lines.push(`> ${description}`, '');
  lines.push(
    'Every page is also available as plain Markdown (same URL with a `.md` extension).',
    `The full documentation in a single file is at ${urlFor('llms-full.txt')}.`,
    ''
  );

  const groups = new Map();
  for (const page of pages) {
    const key = page.group || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  }

  for (const [group, list] of groups) {
    lines.push(`## ${group ? prettyGroup(group) : 'Pages'}`, '');
    for (const page of list) {
      const desc = page.description ? `: ${page.description}` : '';
      lines.push(`- [${page.title}](${urlFor(machineReadablePath(page))})${desc}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Gera o llms-full.txt: o conteúdo de todas as páginas concatenado em markdown.
 */
export function buildLlmsFullTxt(pages, { title, description, urlFor }) {
  const parts = [`# ${title || 'Documentation'}`];
  if (description) parts.push(`> ${description}`);
  for (const page of pages) {
    const source = `<!-- source: ${urlFor(machineReadablePath(page))} -->`;
    const body = page.markdown !== null
      ? page.markdown.trim()
      : `# ${page.title}\n\n${stripHtml(page.html)}`;
    parts.push(`---\n\n${source}\n\n${body}`);
  }
  return parts.join('\n\n') + '\n';
}
