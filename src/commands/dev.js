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

  const isWindows = os.platform() === "win32";
  const scriptsFolderName = isWindows ? "scripts" : ".scripts";
  const scriptsFolderPath = path.join(rhylaPath, scriptsFolderName);
  const searchScript = path.join(scriptsFolderPath, "generateSearchIndex.js");

  const notFoundPath = path.join(rhylaPath, "body", "notFound.html");

  const searchFileName = isWindows ? "search.html" : ".search.html";
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
  app.use("/scripts", express.static(scriptsFolderPath));

  // Ler header e footer
  const header = fs.readFileSync(path.join(rhylaPath, "header.html"), "utf8");
  const footer = fs.readFileSync(path.join(rhylaPath, "footer.html"), "utf8");

  // Página de busca renderizada com layout padrão, usando body/search.html ou body/.search.html
  app.get("/buscar", (req, res) => {
    const searchVisible = path.join(rhylaPath, "body", "search.html");
    const searchHidden = path.join(rhylaPath, "body", ".search.html");
    const searchPage = fs.existsSync(searchVisible)
      ? searchVisible
      : (fs.existsSync(searchHidden) ? searchHidden : null);

    if (!searchPage) return res.redirect("/");

    const content = fs.readFileSync(searchPage, "utf8");
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` );
  });

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

  // Arquivos root sem extensão
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

  // Páginas em subpastas
  app.get("/:group/:topic.html", (req, res) => {
    const { group, topic } = req.params;
    const fileMd = path.join(rhylaPath, "body", group, `${topic}.md`);
    const fileHtml = path.join(rhylaPath, "body", group, `${topic}.html`);
    let content = "";
    if (fs.existsSync(fileMd)) {
      content = md.render(fs.readFileSync(fileMd, "utf8"));
    } else if (fs.existsSync(fileHtml)) {
      content = fs.readFileSync(fileHtml, "utf8");
    } else {
      const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
      const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), group, null);
      return res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>`);
    }
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), group, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>`);
  });

  // 404 final
  app.use((req, res) => {
    const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
    res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>`);
  });

  // Iniciar servidor
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  });
}
