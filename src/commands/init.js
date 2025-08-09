import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function init() {
  const targetDir = path.resolve(process.cwd(), 'rhyla');

  if (fs.existsSync(targetDir)) {
    console.log(chalk.red('❌ A pasta "rhyla" já existe.'));
    return;
  }

  fs.mkdirSync(targetDir);
  fs.mkdirSync(path.join(targetDir, 'body'));

  // Copiar templates
  const templatesDir = path.join(__dirname, '../templates');
  ['header.html', 'footer.html', 'home.html', 'config.yaml'].forEach(file => {
    fs.copyFileSync(
      path.join(templatesDir, file),
      path.join(targetDir, file)
    );
  });

  // Copiar CSS
  fs.mkdirSync(path.join(targetDir, 'styles'));
  const stylesDir = path.join(__dirname, '../templates/styles');
  ['light.css', 'dark.css'].forEach(file => {
    fs.copyFileSync(
      path.join(stylesDir, file),
      path.join(targetDir, 'styles', file)
    );
  });

  // Criar arquivo markdown exemplo
  fs.writeFileSync(path.join(targetDir, 'body', 'exemplo.md'), '# Página de Exemplo\n\nBem-vindo à sua documentação!');

  console.log(chalk.green('✅ Estrutura criada com sucesso!'));
}
