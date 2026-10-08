import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DOCS_DIR } from '../core/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Cria a estrutura base em rhyla-docs/.
 * Recusa sobrescrever uma pasta existente, a menos que `force` seja passado.
 * @param {{ cwd?: string, force?: boolean, quiet?: boolean }} opts
 */
export default function init(opts = {}) {
  const root = opts.cwd || process.cwd();
  const rhylaPath = path.join(root, DOCS_DIR);
  const templatesPath = path.join(__dirname, '../templates');
  const log = opts.quiet ? () => {} : console.log;

  if (fs.existsSync(rhylaPath) && !opts.force) {
    throw new Error(`"${DOCS_DIR}" already exists. Use "rhyla init --force" to overwrite the template files.`);
  }

  const body = path.join(rhylaPath, 'body');
  fs.mkdirSync(body, { recursive: true });

  const copy = (from, to) => fs.cpSync(path.join(templatesPath, from), path.join(rhylaPath, to), { recursive: true });

  copy('header.html', 'header.html');
  copy('config.json', 'config.json');
  copy('AGENTS.md', 'AGENTS.md');
  copy('styles', 'styles');
  copy('public', 'public');

  copy('home.md', 'body/home.md');
  copy('notFound.html', 'body/notFound.html');
  copy('page_generator.md', 'body/page_generator.md');
  copy('tag-new.html', 'body/tag-new.html');
  copy('clients', 'body/clients');
  copy('guide', 'body/guide');
  copy('kit_dev_rhyla', 'body/kit_dev_rhyla');
  copy('flows', 'body/flows');

  log(`✅ Project initialized in ${DOCS_DIR}/`);
  log('   Next: "rhyla dev" to preview, "rhyla build" to generate dist/.');
  log(`   AI agents: see ${DOCS_DIR}/AGENTS.md for authoring conventions.`);
}
