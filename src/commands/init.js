import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function init() {
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla');
  const templatesPath = path.join(__dirname, '../templates'); // caminho fixo relativo ao init.js

  if (!fs.existsSync(templatesPath)) {
    console.error('❌ Pasta "templates" não encontrada.');
    process.exit(1);
  }

  // Criar pasta rhyla e subpastas
  fs.mkdirSync(rhylaPath, { recursive: true });
  fs.mkdirSync(path.join(rhylaPath, 'body'), { recursive: true });
  fs.mkdirSync(path.join(rhylaPath, 'styles'), { recursive: true });

  // Copiar arquivos HTML base
  fs.copyFileSync(path.join(templatesPath, 'header.html'), path.join(rhylaPath, 'header.html'));
  fs.copyFileSync(path.join(templatesPath, 'footer.html'), path.join(rhylaPath, 'footer.html'));

  // Copiar home para body
  fs.copyFileSync(path.join(templatesPath, 'home.md'), path.join(rhylaPath, 'body', 'home.md'));

  // Copiar notFound para body
  fs.copyFileSync(path.join(templatesPath, 'notFound.html'), path.join(rhylaPath, 'body', 'notFound.html'));

  // Copiar o config.yaml
  fs.copyFileSync(path.join(templatesPath, 'config.yaml'), path.join(rhylaPath, 'config.yaml'));
  
  // Copiar estilos
  fs.cpSync(path.join(templatesPath, 'styles'), path.join(rhylaPath, 'styles'), { recursive: true });

  console.log('✅ Projeto inicializado com sucesso.');
}
