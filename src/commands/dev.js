import express from "express";
import fs from "fs";
import path from "path";
import os from "os";
import markdownIt from "markdown-it";
import spawn from "cross-spawn";
import chokidar from "chokidar";
import { fileURLToPath } from "url";
import { generateSidebarHTML } from "../utils/sidebar.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function dev() {
  const app = express();
  const md = new markdownIt();
  const rhylaPath = path.join(process.cwd(), "rhyla");

  // Scripts agora ficam em src/templates/scripts
  const scriptsFolderPath = path.join(__dirname, "../templates/scripts");
  const searchScript = path.join(scriptsFolderPath, "generateSearchIndex.js");

  const notFoundPath = path.join(rhylaPath, "body", "notFound.html");

  const searchFileName = os.platform() === "win32" ? "search.html" : ".search.html";
  const searchFilePath = path.join(rhylaPath, "body", searchFileName);

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

  // Servir o índice gerado (em src/templates/scripts/search_index.json)
  app.get("/search_index.json", (req, res) => {
    const idxPath = path.join(scriptsFolderPath, "search_index.json");
    if (!fs.existsSync(idxPath)) return res.status(404).send("[]");
    res.sendFile(idxPath);
  });

  // Ler header
  const header = fs.readFileSync(path.join(rhylaPath, "header.html"), "utf8");

  // Home
  app.get("/", (req, res) => {
    const homePath = path.join(rhylaPath, "body", "home.md");
    if (!fs.existsSync(homePath)) {
      const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
      const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
      return res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>`);
    }
    const content = md.render(fs.readFileSync(homePath, "utf8"));
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, "home");
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // Página de busca com suporte a arquivo oculto (.search.html)
  app.get("/search", (req, res, next) => {
    const visible = path.join(rhylaPath, "body", "search.html");
    const hidden = path.join(rhylaPath, "body", ".search.html");
    const htmlPath = fs.existsSync(visible) ? visible : (fs.existsSync(hidden) ? hidden : null);
    if (!htmlPath) return next();
    const content = fs.readFileSync(htmlPath, "utf8");
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
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
