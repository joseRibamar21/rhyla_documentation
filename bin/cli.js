#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';
import init from '../src/commands/init.js';
import dev from '../src/commands/dev.js';
import build from '../src/commands/build.js';
import serve from '../src/commands/serve.js';
import mcp from '../src/commands/mcp.js';
import { initWithImport, openapiExport, openapiImport } from '../src/commands/openapi.js';
import check from '../src/commands/check.js';

const { version } = createRequire(import.meta.url)('../package.json');

// Erros esperados (ex.: pasta ausente) viram mensagem + exit code 1, sem stack trace
const run = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
};

const program = new Command();

program
  .name('rhyla')
  .description('Markdown documentation tool')
  .version(version);

program
  .command('init')
  .description('Create base documentation structure in rhyla-docs/')
  .option('-f, --force', 'Overwrite template files if rhyla-docs/ already exists')
  .option('--blank', 'Only the structure (home and 404 pages), without the sample pages')
  .option('--import <source>', 'Also write the route pages from an OpenAPI / Swagger spec or a Postman collection (file or URL); implies --blank')
  .action(run((opts) => (opts.import ? initWithImport(opts.import, opts) : init(opts))));

program
  .command('dev')
  .description('Start local server for preview')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .option('-H, --host <host>', 'Host to bind (use 0.0.0.0 to expose on the network)', '127.0.0.1')
  .action(run(dev));

program
  .command('build')
  .description('Generate static HTML documentation in dist/ (plus llms.txt and .md sources)')
  .option('-b, --base <base>', 'Base path the site is served under, e.g. /docs (default: "base" in rhyla-docs/config.json)')
  .action(run(build));

program
  .command('serve')
  .description('Serve dist under a base path (e.g., /docs)')
  .option('-b, --base <base>', 'Base path (default from rhyla-docs/config.json or /)')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .option('-d, --dir <dir>', 'Directory to serve (default: dist)', 'dist')
  .option('--no-build', 'Do not run build before serving')
  .action(run(serve));

program
  .command('mcp')
  .description('Start an MCP server (stdio) so AI agents can list, search, read and write docs')
  .option('-d, --dir <dir>', 'Project root containing rhyla-docs/ (default: current directory)')
  .option('--read-only', 'Expose only read tools (no init_docs, write_page or delete_page)')
  .action(run(mcp));

program
  .command('check')
  .description('Compare the route pages with the HTTP routes in the code (exits with 1 on errors, for CI)')
  .option('--ignore <patterns...>', 'Routes to leave out, e.g. "GET /health" "/internal/*" (also config.json → check.ignore)')
  .option('--strict', 'Warnings also fail the check')
  .option('--json', 'Print the report as JSON')
  .action(run((opts) => {
    if (!check(opts).passed) process.exitCode = 1;
  }));

program
  .command('import <source>')
  .description('Write one route page per operation of an OpenAPI 3 / Swagger 2 spec or a Postman collection (JSON or YAML file, or URL)')
  .option('--dry-run', 'Only show what would change')
  .option('--no-update', 'Leave pages that already document an operation untouched')
  .action(run(openapiImport));

const openapi = program
  .command('openapi')
  .description('Import a spec into pages (same as "rhyla import"), or export openapi.json from the pages');

openapi
  .command('import <source>')
  .description('Same as "rhyla import <source>"')
  .option('--dry-run', 'Only show what would change')
  .option('--no-update', 'Leave pages that already document an operation untouched')
  .action(run(openapiImport));

openapi
  .command('export')
  .description('Write openapi.json from the pages with an api block (rhyla build also writes dist/openapi.json)')
  .option('-o, --output <file>', 'Output file, or "-" for stdout', 'openapi.json')
  .action(run(openapiExport));

program.parse(process.argv);
