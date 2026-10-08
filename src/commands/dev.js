import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSidebarHTML } from "../utils/sidebar.js";
import { DOCS_DIR, loadConfig } from "../core/config.js";
import { createMarkdown, renderFile } from "../core/content.js";
import { collectPages, resolvePageFile } from "../core/pages.js";
import { buildSearchIndex, buildLlmsTxt, buildLlmsFullTxt } from "../core/artifacts.js";
import { applyPageMeta, assemblePage } from "../core/layout.js";
import { buildFlowGraph, decoratePage } from "../core/flows.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Script que corrige caminhos CSS em todas as páginas (dev sempre roda na raiz "/")
const CSS_FIX_SCRIPT = `
<script>
(function(){
// Função que corrige caminhos CSS em todas as páginas
function fixCssUrls() {
  try {
    // Definir prefixo global
    window.__rhyla_prefix__ = '/';
    
    // Corrigir links CSS
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href');
      if (href && !href.startsWith('/')) {
        links[i].href = '/' + href;
      } else if (href && href.indexOf('styles/') > -1 && !href.startsWith('/styles/')) {
        links[i].href = '/styles/' + href.split('styles/')[1];
      }
    }
  } catch (e) {
    console.error('Erro ao corrigir caminhos CSS:', e);
  }
}

// Executar imediatamente
fixCssUrls();

// Também executar após carregamento
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fixCssUrls);
} else {
  setTimeout(fixCssUrls, 0);
}
})();
</script>`;

/**
 * Lê header.html e garante caminhos absolutos + meta rhyla-base.
 * Lido a cada requisição para refletir edições sem reiniciar o servidor.
 */
function prepareHeader(rhylaPath) {
  let header = fs.readFileSync(path.join(rhylaPath, "header.html"), "utf8");

  // Caminhos absolutos evitam quebras ao atualizar uma página em subdiretório
  header = header.replace(/href=["']\.\/styles\//g, 'href="/styles/');
  header = header.replace(/src=["']\.\/public\//g, 'src="/public/');
  header = header.replace(/src=["']\.\/scripts\//g, 'src="/scripts/');

  if (/<\/head>/i.test(header)) {
    header = header.replace(/<\/head>/i, `${CSS_FIX_SCRIPT}\n</head>`);
  }

  if (!/meta\s+name=["']rhyla-base["']/i.test(header)) {
    const metaTag = `\n  <meta name="rhyla-base" content="/">\n`;
    if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(header)) {
      header = header.replace(/(<meta[^>]+name=["']viewport["'][^>]*>)/i, `$1${metaTag}`);
    } else if (/<head[^>]*>/i.test(header)) {
      header = header.replace(/<head[^>]*>/i, (m) => m + metaTag);
    }
  }
  return header;
}

/**
 * Servidor de desenvolvimento. Renderiza com o mesmo pipeline do build
 * (frontmatter, allow_raw_html, sanitização), sempre a partir dos arquivos atuais.
 *
 * @param {{ port?: string|number, host?: string, cwd?: string, quiet?: boolean }} opts
 * @returns {import('http').Server}
 */
export default function dev(opts = {}) {
  const rhylaPath = path.join(opts.cwd || process.cwd(), DOCS_DIR);
  const bodyPath = path.join(rhylaPath, "body");
  const scriptsFolderPath = path.join(__dirname, "../templates/scripts");
  const notFoundPath = path.join(bodyPath, "notFound.html");
  const log = opts.quiet ? () => {} : console.log;

  if (!fs.existsSync(rhylaPath)) {
    throw new Error(`Folder "${DOCS_DIR}" not found. Run "rhyla init" first.`);
  }

  // Estado derivado da config atual (relido a cada requisição; é barato)
  const context = () => {
    const config = loadConfig(rhylaPath);
    const md = createMarkdown({ allowRawHtml: config.allowRawHtml });
    return { config, md, allowRawHtml: config.allowRawHtml };
  };
  const allPages = (ctx) => collectPages(bodyPath, ctx);

  // Fluxos: o grafo é recalculado a cada requisição (reflete edições na hora)
  const flowLinks = {
    hrefFor: (slug) => (slug === "home" ? "/" : `/${slug}.html`),
    mdHrefFor: (slug) => `/${slug === "home" ? "index" : slug}.md`,
  };
  const withFlows = (pages) => {
    const graph = buildFlowGraph(pages);
    return pages.map((p) => ({ ...p, ...decoratePage(p, graph, flowLinks) }));
  };
  const decorateOne = (ctx, page, slug) => decoratePage({ ...page, slug }, buildFlowGraph(allPages(ctx)), flowLinks);

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Estáticos
  app.use("/styles", express.static(path.join(rhylaPath, "styles")));
  app.use("/public", express.static(path.join(rhylaPath, "public")));
  app.use("/scripts", express.static(scriptsFolderPath));

  // Índice de busca gerado em memória a partir de body/
  app.get("/search_index.json", (req, res) => {
    res.json(buildSearchIndex(allPages(context())));
  });

  // config.json (usado pelo header-runtime para TOC e título)
  app.get("/config.json", (req, res) => {
    const cfg = path.join(rhylaPath, "config.json");
    if (fs.existsSync(cfg)) return res.sendFile(cfg);
    res.status(404).json({});
  });

  // llms.txt / llms-full.txt (mesmo conteúdo do build)
  app.get(["/llms.txt", "/llms-full.txt"], (req, res) => {
    const ctx = context();
    const options = { title: ctx.config.title, description: ctx.config.description, urlFor: (rel) => "/" + rel };
    const pages = withFlows(allPages(ctx));
    res.type("text/plain; charset=utf-8");
    res.send(req.path === "/llms.txt" ? buildLlmsTxt(pages, options) : buildLlmsFullTxt(pages, options));
  });

  // Versão markdown de qualquer página: /guide/install.md, /index.md
  app.get(/\.md$/i, (req, res, next) => {
    const resolved = resolvePageFile(bodyPath, req.path.replace(/\.md$/i, ""));
    if (!resolved || !resolved.file.endsWith(".md")) return next();
    const ctx = context();
    const page = decorateOne(ctx, renderFile(resolved.file, ctx), resolved.slug);
    res.type("text/markdown; charset=utf-8").send(page.markdown);
  });

  // Endpoint usado pelo kit_dev_rhyla para gerar arquivos markdown
  app.post("/generate-page", (req, res) => {
    const { filePath, content } = req.body || {};
    if (typeof filePath !== "string" || !filePath.trim() || typeof content !== "string" || !content) {
      return res.status(400).json({ error: "Invalid input", message: "filePath and content are required" });
    }

    let rel = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel.toLowerCase().endsWith(".md")) rel += ".md";
    const root = path.resolve(bodyPath);
    const fullPath = path.resolve(root, rel);
    // Impede escrita fora de body/ (path traversal)
    if (!fullPath.startsWith(root + path.sep)) {
      return res.status(400).json({ error: "Invalid path", message: "filePath must stay inside body/" });
    }

    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, "utf8");
      const relativePath = "/" + path.relative(root, fullPath).split(path.sep).join("/");
      log(`📝 Page generated: ${relativePath}`);
      res.json({ success: true, path: relativePath, message: "File generated successfully" });
    } catch (error) {
      console.error("Error generating file:", error);
      res.status(500).json({ error: "Internal error", message: error.message });
    }
  });

  function sendNotFound(res, ctx) {
    const notFound = fs.existsSync(notFoundPath) ? renderFile(notFoundPath, ctx).html : "<h1>404</h1>";
    const header = applyPageMeta(prepareHeader(rhylaPath), { pageTitle: "Not found", siteTitle: ctx.config.title });
    const sidebar = generateSidebarHTML(bodyPath, null, null);
    res.status(404).send(assemblePage(header, sidebar, notFound));
  }

  // Páginas: /, /home, /topic, /topic.html, /a/b/c...
  app.get("*", (req, res) => {
    const ctx = context();
    const resolved = resolvePageFile(bodyPath, req.path);
    if (!resolved || /^(notfound|\.?search)$/i.test(resolved.topic)) return sendNotFound(res, ctx);

    // O kit de desenvolvimento (gerador de páginas) precisa dos próprios scripts e nunca vai para o build
    const isDevKit = resolved.slug.toLowerCase().startsWith("kit_dev_rhyla/");
    const page = renderFile(resolved.file, isDevKit ? { ...ctx, allowRawHtml: true } : ctx);
    const isHome = resolved.slug === "home";
    const header = applyPageMeta(prepareHeader(rhylaPath), {
      pageTitle: isHome ? "" : page.title,
      siteTitle: ctx.config.title,
      description: page.description || (isHome ? ctx.config.description : ""),
      markdownHref: page.markdown !== null ? `/${isHome ? "index" : resolved.slug}.md` : null,
    });
    const sidebar = isHome
      ? generateSidebarHTML(bodyPath, null, "home")
      : generateSidebarHTML(bodyPath, resolved.group, resolved.topic);
    const content = isDevKit ? page.html : decorateOne(ctx, page, resolved.slug).html;
    res.send(assemblePage(header, sidebar, content));
  });

  const port = Number(opts.port ?? process.env.PORT ?? 3333);
  // Por padrão só escuta em localhost: o dev server consegue gravar arquivos em body/
  const host = opts.host || "127.0.0.1";
  return app.listen(port, host, () => {
    log(`🚀 Dev server running at http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
    log(`🤖 For AI agents: http://localhost:${port}/llms.txt`);
  });
}
