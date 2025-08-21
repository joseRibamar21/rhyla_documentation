#!/usr/bin/env node
import { Command } from 'commander';
import init from '../src/commands/init.js';
import dev from '../src/commands/dev.js';
import build from '../src/commands/build.js';
import serve from '../src/commands/serve.js';

const program = new Command();

program
  .name('rhyla')
  .description('Markdown documentation tool')
  .version('1.0.0');

program
  .command('init')
  .description('Create base documentation structure')
  .action(init);

program
  .command('dev')
  .description('Start local server for preview')
  .action(dev);

program
  .command('build')
  .description('Generate static HTML documentation')
  .action(build);

program
  .command('serve')
  .description('Serve dist under a base path (e.g., /docs)')
  .option('-b, --base <base>', 'Base path (default from rhyla/config.json or /)')
  .option('-p, --port <port>', 'Port to listen on', '3333')
  .option('-d, --dir <dir>', 'Directory to serve (default: dist)', 'dist')
  .option('--no-build', 'Do not run build before serving')
  .action((opts) => serve(opts));

program.parse(process.argv);
