import { Command } from 'commander';
import init from '../src/commands/init.js';
import dev from '../src/commands/dev.js';
import build from '../src/commands/build.js';

const program = new Command();

program
  .name('rhyla')
  .description('Ferramenta de documentação em Markdown')
  .version('1.0.0');

program
  .command('init')
  .description('Cria a estrutura base de documentação')
  .action(init);

program
  .command('dev')
  .description('Inicia servidor local para pré-visualização')
  .action(dev);

program
  .command('build')
  .description('Gera HTML estático da documentação')
  .action(build);

program.parse(process.argv);
