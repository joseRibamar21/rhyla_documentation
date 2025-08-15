import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'cross-spawn';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createHiddenFolder(baseDir, folderName) {
  const isWindows = os.platform() === 'win32';
  const folderPath = isWindows
    ? path.join(baseDir, folderName)
    : path.join(baseDir, `.${folderName}`);

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  if (isWindows) {
    spawn('attrib', ['+h', folderPath], { shell: true });
  }

  return folderPath;
}

function createHiddenFile(filePath) {
  const isWindows = os.platform() === 'win32';
  const hiddenPath = isWindows
    ? filePath
    : path.join(path.dirname(filePath), `.${path.basename(filePath)}`);

  if (fs.existsSync(hiddenPath)) {
    fs.unlinkSync(hiddenPath);
  }

  if (isWindows) {
    fs.copyFileSync(filePath, hiddenPath);
    spawn('attrib', ['+h', hiddenPath], { shell: true });
  } else {
    fs.copyFileSync(filePath, hiddenPath);
  }

  return hiddenPath;
}

export default function init() {
  const root = process.cwd();
  const rhylaPath = path.join(root, 'rhyla');
  const templatesPath = path.join(__dirname, '../templates');

  if (!fs.existsSync(templatesPath)) {
    console.error('❌ Template folder not found.');
    process.exit(1);
  }

  // Criar pasta rhyla e subpastas visíveis
  fs.mkdirSync(rhylaPath, { recursive: true });
  fs.mkdirSync(path.join(rhylaPath, 'body'), { recursive: true });
  fs.mkdirSync(path.join(rhylaPath, 'styles'), { recursive: true });
  fs.mkdirSync(path.join(rhylaPath, 'public'), { recursive: true });

  // Copiar header e footer
  fs.copyFileSync(path.join(templatesPath, 'header.html'), path.join(rhylaPath, 'header.html'));
  
  // Copiar home.md
  fs.copyFileSync(path.join(templatesPath, 'home.md'), path.join(rhylaPath, 'body', 'home.md'));

  // Copiar notFound.html
  fs.copyFileSync(path.join(templatesPath, 'notFound.html'), path.join(rhylaPath, 'body', 'notFound.html'));

  // Copiar config.json
  fs.copyFileSync(path.join(templatesPath, 'config.json'), path.join(rhylaPath, 'config.json'));
  
  // Copiar estilos
  fs.cpSync(path.join(templatesPath, 'styles'), path.join(rhylaPath, 'styles'), { recursive: true });

  fs.cpSync(path.join(templatesPath, 'guide'), path.join(rhylaPath, 'body', 'guide'), { recursive: true });

  // Copiar public (inclui logo.png se existir)
  const publicTpl = path.join(templatesPath, 'public');
  const publicDst = path.join(rhylaPath, 'public');
  if (fs.existsSync(publicTpl)) {
    fs.cpSync(publicTpl, publicDst, { recursive: true });
  } else {
    // Se não existir no template, criar um placeholder de logo
    const logoDst = path.join(publicDst, 'logo.png');
    if (!fs.existsSync(logoDst)) {
      fs.writeFileSync(logoDst, '');
    }
  }

  console.log('✅ Project initialized successfully.');
}
