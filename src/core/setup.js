import fs from 'fs';
import path from 'path';
import { DOCS_DIR, loadConfig, updateConfig } from './config.js';
import { MODE_KEYS, defaultPreferences, readPreferences, savePreferences } from './preferences.js';
import { findRoutes, listProjectFiles, projectStats } from './routes.js';

/*
 * Estado do wizard de configuração (/__rhyla/setup no `rhyla dev`).
 *
 * open → o agente abriu o wizard; saved → o usuário respondeu; building → o agente disse
 * quais páginas vai escrever (set_plan); done → o agente terminou (mark_synced).
 * Sem agente (só `rhyla dev`), o wizard apenas salva as preferências.
 */

function projectName(root) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    if (pkg.name) return String(pkg.name);
  } catch {}
  return path.basename(root);
}

// Títulos que vêm do template: no wizard o campo fica vazio (o agente escolhe)
const TEMPLATE_TITLES = ['Documentation Standard', 'Rhyla Docs', 'Documentation'];

const LOGO_FILE = /\.(png|jpe?g|svg|webp|gif|avif|ico)$/i;
const LOGO_NAME = /(^|\/)(logo|brand|icon|favicon|mark)[\w.-]*\.(png|jpe?g|svg|webp|gif|avif|ico)$/i;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Arquivos do projeto que parecem uma logo (logo.svg, favicon.png…), os mais prováveis primeiro. */
export function findLogoCandidates(root, files = listProjectFiles(root)) {
  const score = (f) => {
    const name = f.split('/').pop().toLowerCase();
    return (name.startsWith('logo') ? 0 : name.startsWith('brand') ? 1 : 2) * 100
      + (name.endsWith('.svg') ? 0 : name.endsWith('.png') ? 10 : 20)
      + f.split('/').length;
  };
  return files.filter((f) => LOGO_NAME.test(f) && !/(^|\/)(test|tests|__tests__|fixtures)\//.test(f))
    .sort((a, b) => score(a) - score(b) || a.localeCompare(b))
    .slice(0, 6);
}

/** Grava a logo em public/logo.<ext>, apagando uma logo anterior com outra extensão. Devolve o caminho público. */
export function writeLogo(publicPath, fileName, data) {
  const ext = (String(fileName).match(LOGO_FILE) || [])[1];
  if (!ext) throw new Error('The logo must be an image (png, jpg, svg, webp, gif, avif or ico).');
  if (!data || !data.length) throw new Error('Empty file');
  if (data.length > LOGO_MAX_BYTES) throw new Error('The logo is larger than 2 MB.');
  const name = `logo.${ext.toLowerCase() === 'jpeg' ? 'jpg' : ext.toLowerCase()}`;
  fs.mkdirSync(publicPath, { recursive: true });
  for (const old of fs.readdirSync(publicPath)) {
    if (/^logo\.(png|jpe?g|svg|webp|gif|avif|ico)$/i.test(old) && old !== name) fs.rmSync(path.join(publicPath, old));
  }
  fs.writeFileSync(path.join(publicPath, name), data);
  return `/public/${name}`;
}

/** O que o usuário deixou para o agente decidir sobre o site, em texto para o agente. */
export function formatSiteTodo(todo) {
  if (!todo) return '';
  const lines = [];
  if (todo.title) lines.push("- Site title: the user left it to you. Use the project's name as people know it (the README heading or the package name) and save it with set_site.");
  if (todo.logo) {
    lines.push(todo.logo.length
      ? `- Logo: the user left it to you. Image files in the project that may be the logo: ${todo.logo.join(', ')}. If one of them is the project's logo, call set_site with logo_file; otherwise keep the default mark.`
      : '- Logo: the user left it to you, and no logo file was found in the project. Keep the default mark.');
  }
  return lines.join('\n');
}

// Caminho de página como o agente informa ("api/tasks/get-list", "/guide/x.md") → slug
const toSlug = (p) => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.(md|html)$/i, '') || 'home';

/**
 * @param {{ cwd: string, agent?: boolean }} opts
 */
export function createSetup({ cwd, agent = false }) {
  const rhylaPath = path.join(cwd, DOCS_DIR);
  const bodyPath = path.join(rhylaPath, 'body');
  let phase = agent ? 'idle' : 'open';
  let plan = [];
  let project = null;
  let suggested = {};
  let waiters = [];
  // Quando o usuário enviou o wizard e quando o agente terminou (para o tempo total)
  let submittedAt = 0;
  let finishedAt = 0;
  // Título e logo que o usuário deixou para o agente escolher
  let siteTodo = null;
  // Data de modificação de cada página quando o wizard abriu: só conta como escrita a que mudar depois
  let before = new Map();

  function snapshot() {
    const times = new Map();
    const walk = (dir, rel) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), relPath);
        else if (/\.(md|html)$/i.test(entry.name)) times.set(relPath.replace(/\.(md|html)$/i, ''), fs.statSync(path.join(dir, entry.name)).mtimeMs);
      }
    };
    walk(bodyPath, '');
    return times;
  }

  // Contagens do projeto, calculadas uma vez por abertura do wizard
  function scan() {
    if (!project) {
      const files = listProjectFiles(cwd);
      const routes = findRoutes(cwd, files);
      project = {
        name: projectName(cwd),
        ...projectStats(cwd, files),
        routes: routes.count,
        routeFiles: routes.files.length,
        // Amostra para o wizard mostrar o que já foi encontrado
        routeList: routes.routes.slice(0, 8).map(({ method, path: routePath }) => ({ method, path: routePath })),
      };
    }
    return project;
  }

  const fileFor = (slug) => ['.md', '.html'].map((ext) => path.join(bodyPath, slug + ext)).find((f) => fs.existsSync(f));

  return {
    /** O agente abriu o wizard: recomeça o acompanhamento. `answers` pré-seleciona respostas (ex.: idioma). */
    open(answers = {}) {
      phase = 'open';
      plan = [];
      project = null;
      suggested = answers;
      before = snapshot();
      submittedAt = 0;
      finishedAt = 0;
    },

    info() {
      const saved = readPreferences(rhylaPath);
      const config = fs.existsSync(rhylaPath) ? loadConfig(rhylaPath) : { title: '', logo: null };
      const p = scan();
      return {
        agent,
        phase,
        project: p,
        // Título do template ou o nome do pacote (posto pelo init) não contam como escolha do usuário
        site: { title: config.title && ![...TEMPLATE_TITLES, p.name].includes(config.title) ? config.title : '', logo: config.logo },
        preferences: { ...defaultPreferences(saved.mode), ...saved, ...suggested },
      };
    },

    /** Respostas do wizard. Lança erro com mensagem legível se forem inválidas. */
    submit(answers = {}) {
      if (!fs.existsSync(rhylaPath)) throw new Error(`No ${DOCS_DIR}/ folder. Run "rhyla init" first.`);
      if (!MODE_KEYS.includes(answers.mode)) throw new Error('Choose a mode.');
      if (typeof answers.language !== 'string' || !answers.language.trim()) throw new Error('Choose a language.');
      if (answers.logo !== undefined && answers.logo !== null && !/^\/public\/[\w./-]+$/.test(answers.logo)) throw new Error('Invalid logo path.');
      // Título e logo são opcionais: em branco, o agente escolhe
      const title = typeof answers.title === 'string' ? answers.title.trim() : '';
      const logo = typeof answers.logo === 'string' ? answers.logo : null;
      updateConfig(rhylaPath, { title: title || undefined, logo });
      siteTodo = !title || !logo ? { title: !title, logo: logo ? null : findLogoCandidates(cwd) } : null;
      const preferences = savePreferences(rhylaPath, {
        language: answers.language,
        mode: answers.mode,
        flows: answers.flows === true,
        audience: answers.audience,
        examples: answers.examples,
        notes: typeof answers.notes === 'string' ? answers.notes : '',
      });
      phase = 'saved';
      submittedAt = Date.now();
      finishedAt = 0;
      for (const resolve of waiters) resolve({ status: 'saved', preferences, siteTodo });
      waiters = [];
      return preferences;
    },

    /** Espera o usuário responder, por até `ms`. */
    wait(ms) {
      if (phase !== 'open' && phase !== 'idle') return Promise.resolve({ status: 'saved', preferences: readPreferences(rhylaPath), siteTodo });
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiters = waiters.filter((w) => w !== done);
          resolve({ status: 'waiting' });
        }, ms);
        const done = (value) => { clearTimeout(timer); resolve(value); };
        waiters.push(done);
      });
    },

    /** Páginas que o agente vai escrever, para a tela mostrar o progresso. */
    setPlan(pages = []) {
      plan = pages
        .filter((p) => p && typeof p.path === 'string' && p.path.trim())
        .map((p) => ({ slug: toSlug(p.path), title: typeof p.title === 'string' && p.title.trim() ? p.title.trim() : toSlug(p.path) }));
      if (phase !== 'done') phase = 'building';
      return plan.length;
    },

    finish() {
      if (phase === 'idle') return;
      phase = 'done';
      finishedAt = finishedAt || Date.now();
    },

    status() {
      // Uma página conta como escrita quando o arquivo foi criado ou alterado depois que o wizard abriu
      const pages = plan.map((p) => {
        const file = fileFor(p.slug);
        const written = Boolean(file) && (!before.has(p.slug) || fs.statSync(file).mtimeMs > before.get(p.slug));
        return { ...p, url: p.slug === 'home' ? '/' : `/${p.slug}`, written };
      });
      const elapsed = submittedAt ? (finishedAt || Date.now()) - submittedAt : null;
      return { agent, phase, pages, written: pages.filter((p) => p.written).length, total: pages.length, elapsed };
    },

    cancel() {
      for (const resolve of waiters) resolve({ status: 'waiting' });
      waiters = [];
    },
  };
}
