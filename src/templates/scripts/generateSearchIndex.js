import { readFileSync, writeFileSync } from "fs";
import { resolve, relative, dirname } from "path";
import { sync } from "glob";
import matter from "gray-matter"; // só para separar frontmatter do conteúdo (opcional)
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " "); // remove tags
}

function getSnippet(text, matchIndex, length = 80) {
  const start = Math.max(0, matchIndex - length / 2);
  const end = Math.min(text.length, matchIndex + length / 2);
  return text.slice(start, end).trim();
}

function buildSearchIndex() {
  const srcDir = resolve(process.cwd(), "body");
  const files = sync(`${srcDir}/**/*.{md,html}`);

  const index = files.map(filePath => {
    const raw = readFileSync(filePath, "-utf-8".slice(1));
    let content = filePath.endsWith(".html") ? stripHtml(raw) : matter(raw).content;
    content = content.replace(/\s+/g, " "); // normaliza espaços

    return {
      path: relative(srcDir, filePath),
      content
    };
  });

  writeFileSync(
    resolve(__dirname, "search_index.json"),
    JSON.stringify(index, null, 2),
    "utf-8"
  );

  console.log(`✅ Índice de busca gerado com ${index.length} páginas`);
}

buildSearchIndex();
