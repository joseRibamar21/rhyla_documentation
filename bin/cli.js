#!/usr/bin/env node
import { Command } from 'commander';
import init from '../src/commands/init.js';
import dev from '../src/commands/dev.js';
import build from '../src/commands/build.js';

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

program.parse(process.argv);
