import express from "express";
import fs from "fs";
import path from "path";
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
  const templatesPath = path.join(process.cwd(), "templates");
  const notFoundPath = path.join(rhylaPath, "body", "notFound.html");
  const searchScript = path.join(rhylaPath, "scripts", "generateSearchIndex.js");

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
  app.use("/scripts", express.static(path.join(rhylaPath, "scripts")));

  // Servir o índice gerado em rhyla/scripts/search_index.json
  app.get("/search_index.json", (req, res) => {
    const idxPath = path.join(rhylaPath, "scripts", "search_index.json");
    if (!fs.existsSync(idxPath)) return res.status(404).send("[]");
    res.sendFile(idxPath);
  });

  // Ler header e footer
  const header = fs.readFileSync(path.join(rhylaPath, "header.html"), "utf8");
  const footer = fs.readFileSync(path.join(rhylaPath, "footer.html"), "utf8");

  // Página de busca renderizada com layout padrão, usando body/search.html
  app.get("/buscar", (req, res) => {
    const searchPage = path.join(rhylaPath, "body", "search.html");
    if (!fs.existsSync(searchPage)) return res.redirect("/");
    const content = fs.readFileSync(searchPage, "utf8");
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // Home
  app.get("/", (req, res) => {
    const homePath = path.join(rhylaPath, "body", "home.md");
    if (!fs.existsSync(homePath)) {
      const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
      const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
      return res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>` + footer);
    }
    const content = md.render(fs.readFileSync(homePath, "utf8"));
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, "home");
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // Arquivos no root com .html
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
    return res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
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
    return res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // Páginas dentro de grupos
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
      return res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>` + footer);
    }

    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), group, topic);
    res.send(header + sidebar + `<main class="rhyla-main">${content}</main>` + footer);
  });

  // 404 final
  app.use((req, res) => {
    const notFound = fs.existsSync(notFoundPath) ? fs.readFileSync(notFoundPath, "utf8") : "<h1>404</h1>";
    const sidebar = generateSidebarHTML(path.join(rhylaPath, "body"), null, null);
    res.status(404).send(header + sidebar + `<main class="rhyla-main">${notFound}</main>` + footer);
  });

  // Iniciar servidor
  const port = 3000;
  app.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
  });
}
