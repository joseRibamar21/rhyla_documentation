import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOCS_DIR } from '../core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEMPLATES_DIR = path.join(__dirname, '../templates');

// Páginas de exemplo (sobre o próprio Rhyla) copiadas para body/, fora do modo `blank`
export const SAMPLE_PAGES = ['home.md', 'page_generator.md', 'tag-new.html', 'clients', 'guide', 'flows'];

// Home mínima do modo `blank` (também usada ao zerar a documentação)
export const blankHome = (title, description) => `# ${title || 'Documentation'}\n\n${description || 'Start writing in rhyla-docs/body.'}\n`;

/**
 * Cria a estrutura base em rhyla-docs/.
 * Recusa sobrescrever uma pasta existente, a menos que `force` seja passado.
 * Com `blank`, cria só a estrutura (home mínima e 404), sem as páginas de exemplo.
 * @param {{ cwd?: string, force?: boolean, quiet?: boolean, blank?: boolean, title?: string, description?: string }} opts
 */
export default function init(opts = {}) {
  const root = opts.cwd || process.cwd();
  const rhylaPath = path.join(root, DOCS_DIR);
  const log = opts.quiet ? () => {} : console.log;

  if (fs.existsSync(rhylaPath) && !opts.force) {
    throw new Error(`"${DOCS_DIR}" already exists. Use "rhyla init --force" to overwrite the template files.`);
  }

  const body = path.join(rhylaPath, 'body');
  fs.mkdirSync(body, { recursive: true });

  const copy = (from, to) => fs.cpSync(path.join(TEMPLATES_DIR, from), path.join(rhylaPath, to), { recursive: true });

  copy('header.html', 'header.html');
  copy('config.json', 'config.json');
  copy('AGENTS.md', 'AGENTS.md');
  copy('styles', 'styles');
  copy('public', 'public');

  copy('notFound.html', 'body/notFound.html');
  if (opts.blank) {
    fs.writeFileSync(path.join(body, 'home.md'), blankHome(opts.title, opts.description), 'utf8');
  } else {
    for (const item of SAMPLE_PAGES) copy(item, `body/${item}`);
    copy('kit_dev_rhyla', 'body/kit_dev_rhyla');
  }

  if (opts.title || opts.description) {
    const configFile = path.join(rhylaPath, 'config.json');
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (opts.title) config.title = opts.title;
    if (opts.description) config.description = opts.description;
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
  }

  log(`✅ Project initialized in ${DOCS_DIR}/`);
  log('   Next: "rhyla dev" to preview, "rhyla build" to generate dist/.');
  log(`   AI agents: see ${DOCS_DIR}/AGENTS.md for authoring conventions.`);
}
