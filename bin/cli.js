#!/usr/bin/env node
import { createRequire } from 'module';
import { Command } from 'commander';
import init from '../src/commands/init.js';
import dev from '../src/commands/dev.js';
import build from '../src/commands/build.js';
import serve from '../src/commands/serve.js';

const { version } = createRequire(import.meta.url)('../package.json');

// Erros esperados (ex.: pasta ausente) viram mensagem + exit code 1, sem stack trace
const run = (fn) => async (opts) => {
  try {
    await fn(opts);
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
  .action(run(init));

program
  .command('dev')
  .description('Start local server for preview')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .option('-H, --host <host>', 'Host to bind (use 0.0.0.0 to expose on the network)', '127.0.0.1')
  .action(run(dev));

program
  .command('build')
  .description('Generate static HTML documentation in dist/ (plus llms.txt and .md sources)')
  .action(run(build));

program
  .command('serve')
  .description('Serve dist under a base path (e.g., /docs)')
  .option('-b, --base <base>', 'Base path (default from rhyla-docs/config.json or /)')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .option('-d, --dir <dir>', 'Directory to serve (default: dist)', 'dist')
  .option('--no-build', 'Do not run build before serving')
  .action(run(serve));

program.parse(process.argv);
