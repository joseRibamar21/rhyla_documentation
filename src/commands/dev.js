import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import markdownIt from "markdown-it";
import spawn from "cross-spawn";
import chokidar from "chokidar";
import { fileURLToPath } from "url";
import { generateSidebarHTML } from "../utils/sidebar.js";
import { generateMDFile } from "../templates/scripts/generatePages.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function dev() {
  const app = express();
  app.use(express.json()); // Para processar requisições JSON
  
  const md = new markdownIt();
  const rhylaPath = path.join(process.cwd(), "rhyla-docs"); // Alterado para rhyla-docs para evitar conflito

  // Scripts agora ficam em src/templates/scripts
  const scriptsFolderPath = path.join(__dirname, "../templates/scripts");
  const searchScript = path.join(scriptsFolderPath, "generateSearchIndex.js");

  const notFoundPath = path.join(rhylaPath, "body", "notFound.html");

  const searchFileName = os.platform() === "win32" ? "search.html" : ".search.html";

  if (!fs.existsSync(rhylaPath)) {
    console.error('❌ Pasta "rhyla" não encontrada. Execute "rhyla init" primeiro.');
    process.exit(1);
  }

  // Função para gerar índice de busca
  function runSearchIndex() {
    console.log("🔍 Atualizando índice de busca...");
    const proc = spawn("node", [searchScript], { cwd: rhylaPath, stdio: "inherit" });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`❌ Índice de busca falhou (código ${code})`);
      }
    });
  }

  // Roda ao iniciar
  runSearchIndex();

  // Observa alterações em body
  chokidar.watch(path.join(rhylaPath, "body"), { ignoreInitial: true })
    .on("all", (event, filePath) => {
      console.log(`📂 Alteração detectada: ${event} -> ${filePath}`);
      runSearchIndex();
    });

  // Estáticos
  app.use("/styles", express.static(path.join(rhylaPath, "styles")));
  // Servir assets públicos do usuário (imagens, fontes, etc.)
  app.use("/public", express.static(path.join(rhylaPath, "public")));
  app.use("/scripts", express.static(scriptsFolderPath));
  // Alias para compatibilidade: permitir /scripts/search-runtime.js apontar para search_runtime.js
  app.get('/scripts/search-runtime.js', (req, res) => {
    const p = path.join(scriptsFolderPath, 'search_runtime.js');
    if (fs.existsSync(p)) return res.sendFile(p);
    res.status(404).end();
  });

  // Servir o índice gerado (em src/templates/scripts/search_index.json)
  app.get("/search_index.json", (req, res) => {
    const idxPath = path.join(scriptsFolderPath, "search_index.json");
    if (!fs.existsSync(idxPath)) return res.status(404).send("[]");
    res.sendFile(idxPath);
  });

  // Servir config.json no dev (para TOC e título dinâmico)
  app.get('/config.json', (req, res) => {
    const cfg = path.join(rhylaPath, 'config.json');
    if (fs.existsSync(cfg)) return res.sendFile(cfg);
    res.status(404).send('{}');
  });
  
  // Endpoint para gerar arquivos markdown
  app.post('/generate-page', (req, res) => {
    try {
      const { filePath, content } = req.body;
      
      if (!filePath || !content) {
        return res.status(400).json({
          error: 'Dados incompletos',
          message: 'É necessário fornecer o caminho do arquivo e o conteúdo'
        });
      }
      
      // Sanitizar o filePath - remover qualquer componente que possa causar problemas de segurança
      const sanitizedPath = filePath.replace(/\.\./g, '').replace(/\/+/g, '/');
      
      // Extrair o diretório e nome do arquivo do caminho sanitizado
      const dirPath = path.dirname(sanitizedPath);
      
      // Garantir que o nome do arquivo termina com .md
      let fileName = path.basename(sanitizedPath);
      if (!fileName.endsWith('.md')) {
        fileName += '.md';
      }
      
      console.log(`Gerando arquivo: ${dirPath}/${fileName}`);
      
      // Criar diretório completo para o arquivo (removendo a barra inicial se existir)
      const fullDirPath = path.join(
        rhylaPath, 
        'body', 
        dirPath.startsWith('/') ? dirPath.substring(1) : dirPath
      );
      
      if (!fs.existsSync(fullDirPath)) {
        console.log(`Criando diretório: ${fullDirPath}`);
        fs.mkdirSync(fullDirPath, { recursive: true });
      }
      
      // Caminho completo para o arquivo
      const fullPath = path.join(fullDirPath, fileName);
      
      // Escrever o conteúdo no arquivo
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Arquivo gerado: ${fullPath}`);
      
      // Atualizar o índice de busca
      runSearchIndex();
      
      // Calcular caminho relativo para a resposta
      let relativePath;
      if (dirPath === '/' || dirPath === '.') {
        relativePath = `/${fileName}`;
      } else {
        const normalizedDir = dirPath.startsWith('/') ? dirPath : `/${dirPath}`;
        relativePath = `${normalizedDir}/${fileName}`;
      }
      
      // Retornar o resultado
      res.json({
        success: true,
        path: relativePath,
        message: 'Arquivo gerado com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao gerar arquivo:', error);
      res.status(500).json({
        error: 'Erro interno',
        message: error.message
      });
    }
  });

  // Ler header 
  let header = fs.readFileSync(path.join(rhylaPath, "header.html"), "utf8");
  
  // Certificar-se de que todos os caminhos sejam absolutos
  // Isso evita quebras quando usuário atualiza uma página em subdiretório
  header = header.replace(/href=["']\.\/styles\//g, 'href="/styles/"');
  header = header.replace(/src=["']\.\/public\//g, 'src="/public/"');
  header = header.replace(/src=["']\.\/scripts\//g, 'src="/scripts/"');

  // Adicionar script para correção de caminhos CSS
  const cssFixScript = `
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
  
  // Adicionar o script antes de fechar o head
  if (/<\/head>/i.test(header)) {
    header = header.replace(/<\/head>/i, `${cssFixScript}\n</head>`);
  }
                
  // Garantir que a meta tag rhyla-base esteja presente
  if (!/meta\s+name=["']rhyla-base["']/i.test(header)) {
    const metaTag = `\n  <meta name="rhyla-base" content="/">\n`;
    if (/<meta[^>]+name=["']viewport["'][^>]*>/i.test(header)) {
      header = header.replace(/(<meta[^>]+name=["']viewport["'][^>]*>)/i, `$1${metaTag}`);
    } else if (/<head[^>]*>/i.test(header)) {
      header = header.replace(/<head[^>]*>/i, (m) => m + metaTag);
    }
  }

  // Home
  app.get("/", (req, res) => {
    const homeMd = path.join(rhylaPath, "body", "home.md");
    const homeHtml = path.join(rhylaPath, "body", "home.html");
    let content = "";
    if (fs.existsSync(homeMd)) {
      content = md.render(fs.readFileSync(homeMd, "utf8"));
    } else if (fs.existsSync(homeHtml)) {
      content = fs.readFileSync(homeHtml, "utf8");
    } else {
      const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
      const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
      return res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>`);
    }
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, "home");
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Home aliases: /home e /home.html
  app.get(["/home", "/home.html"], (req, res, next) => {
    const homeMd = path.join(rhylaPath, "body", "home.md");
    const homeHtml = path.join(rhylaPath, "body", "home.html");
    let content = "";
    if (fs.existsSync(homeMd)) {
      content = md.render(fs.readFileSync(homeMd, "utf8"));
    } else if (fs.existsSync(homeHtml)) {
      content = fs.readFileSync(homeHtml, "utf8");
    } else {
      return next();
    }
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, "home");
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Arquivos root .html
  app.get("/:topic.html", (req, res, next) => {
    const { topic } = req.params;
    if (topic === "styles" || topic === "search_index") return next();
    const fileMd = path.join(rhylaPath, "body", `${topic}.md`);
    const fileHtml = path.join(rhylaPath, "body", `${topic}.html`);
    let content = "";
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, "utf8"));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, "utf8");
    } else {
      return next();
    }
  const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Arquivos root sem extensão (URLs limpas)
  app.get("/:topic", (req, res, next) => {
    const { topic } = req.params;
    if (topic.includes(".") || topic === "styles" || topic === "search_index") return next();
    const fileMd = path.join(rhylaPath, "body", `${topic}.md`);
    const fileHtml = path.join(rhylaPath, "body", `${topic}.html`);
    let content = "";
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, "utf8"));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, "utf8");
    } else {
      return next();
    }
  const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Páginas em subpastas com .html
  app.get("/:group/:topic.html", (req, res, next) => {
    const { group, topic } = req.params;
    const groupRel = group; // para este handler, apenas um nível
    const fileMd = path.join(rhylaPath, "body", groupRel, `${topic}.md`);
    const fileHtml = path.join(rhylaPath, "body", groupRel, `${topic}.html`);
    let content = "";
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, "utf8"));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, "utf8");
    } else {
      return next();
    }
  const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), groupRel, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Páginas em subpastas sem .html (URLs limpas)
  app.get("/:group/:topic", (req, res, next) => {
    const { group, topic } = req.params;
    if (group === "styles" || group === "scripts") return next();
    if (topic.includes(".")) return next();
    const groupRel = group;
    const fileMd = path.join(rhylaPath, "body", groupRel, `${topic}.md`);
    const fileHtml = path.join(rhylaPath, "body", groupRel, `${topic}.html`);
    let content = "";
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, "utf8"));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, "utf8");
    } else {
      return next();
    }
  const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), groupRel, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Catch-all para caminhos aninhados (ex.: /a/b/c)
  app.get("/*", (req, res, next) => {
    const p = req.path; // ex.: /a/b/c
    if (p === "/" || p.startsWith("/styles/") || p.startsWith("/public/") || p === "/search" || p === "/search_index.json") return next();
    const parts = p.replace(/^\//, "").split("/").filter(Boolean);
    if (!parts.length) return next();
    const last = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);
    const dirAbs = path.join(rhylaPath, "body", ...dirParts);
    if (!fs.existsSync(dirAbs)) return next();
    const base = last.replace(/\.html$/i, "");

    const mdPath = path.join(dirAbs, `${base}.md`);
    const htmlPath = path.join(dirAbs, `${base}.html`);
    let content = "";
    if (fs.existsSync(mdPath)) content = md.render(fs.readFileSync(mdPath, "utf8"));
    else if (fs.existsSync(htmlPath)) content = fs.readFileSync(htmlPath, "utf8");
    else return next();

    // activeGroup = primeiro segmento da rota
  const activeGroup = dirParts.join('/') || null;
    const activeTopic = base;
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), activeGroup, activeTopic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // 404 final
  app.use((req, res) => {
    const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
    res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>`);
  });

  // Iniciar servidor
  const port = 3333;
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
  });
}
