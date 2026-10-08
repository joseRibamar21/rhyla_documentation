import { escapeHtml } from './content.js';

/**
 * Ajusta o <head> do header para uma página: <title>, meta description e
 * link alternativo para a versão markdown (útil para agentes de IA).
 *
 * @param {string} header conteúdo de header.html
 * @param {{ pageTitle?: string, siteTitle?: string, description?: string, markdownHref?: string }} meta
 */
export function applyPageMeta(header, { pageTitle, siteTitle, description, markdownHref } = {}) {
  let out = header;
  const extras = [];

  const site = siteTitle || (out.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const full = pageTitle && pageTitle !== site ? (site ? `${pageTitle} · ${site}` : pageTitle) : site;
  if (full) {
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, `<title>${escapeHtml(full)}</title>`);
    } else {
      extras.push(`<title>${escapeHtml(full)}</title>`);
    }
  }

  // Nome do site no header, já no HTML (sem esperar o runtime ler o config.json)
  if (siteTitle) {
    out = out.replace(/(<[a-z0-9]+[^>]*\bid=["']rhyla-title["'][^>]*>)[\s\S]*?(<\/)/i, (_, open, close) => open + escapeHtml(siteTitle) + close);
  }

  if (description) {
    const tag = `<meta name="description" content="${escapeHtml(description)}">`;
    if (/<meta\s+name=["']description["'][^>]*>/i.test(out)) {
      out = out.replace(/<meta\s+name=["']description["'][^>]*>/i, tag);
    } else {
      extras.push(tag);
    }
  }

  if (markdownHref) {
    extras.push(`<link rel="alternate" type="text/markdown" href="${escapeHtml(markdownHref)}">`);
  }

  if (extras.length && /<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `  ${extras.join('\n  ')}\n</head>`);
  }
  return out;
}

/**
 * Monta o documento final. Fecha </body></html> quando o header não fecha.
 */
export function assemblePage(header, sidebar, content) {
  const page = `${header}${sidebar}<main class="rhyla-main">${content}</main>`;
  return /<\/body>/i.test(header) ? page : `${page}\n</body>\n</html>\n`;
}
