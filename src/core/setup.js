import fs from 'fs';
import path from 'path';
import { DOCS_DIR, loadConfig, updateConfig } from './config.js';
import { MODE_KEYS, defaultPreferences, readPreferences, savePreferences } from './preferences.js';
import { findOpenApi, findRoutes, listProjectFiles, projectStats } from './routes.js';
import { MAX_SOURCE_BYTES, formatName, importDocument, importIntoProject, parseSource, readSource } from './import.js';

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

// Especificações do projeto (OpenAPI, Swagger, Postman) que o wizard oferece para importar
const MAX_SOURCES = 6;
function projectSources(cwd, files) {
  const found = findOpenApi(cwd, files);
  return [...found.files, ...found.postman].slice(0, MAX_SOURCES).map((file) => {
    try {
      const full = path.join(cwd, file);
      if (fs.statSync(full).size > MAX_SOURCE_BYTES) return { path: file, error: 'larger than 10 MB' };
      const imported = importDocument(parseSource(fs.readFileSync(full, 'utf8'), file), { source: file });
      return { path: file, format: imported.format, formatName: formatName(imported.format), title: imported.info.title || '', operations: imported.pages.length };
    } catch (err) {
      return { path: file, error: err.message };
    }
  });
}

/** O que foi importado, para o agente: de onde, quantas páginas e o que falta escrever. */
export function formatImported(imported) {
  if (!imported) return null;
  const routes = [...imported.created, ...imported.updated, ...imported.unchanged];
  return {
    source: imported.source,
    format: formatName(imported.format),
    pages: routes.length,
    routes: routes.slice(0, 40),
    ...(routes.length > 40 ? { more: routes.length - 40 } : {}),
    ...(imported.warnings.length ? { warnings: imported.warnings } : {}),
  };
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
  // Especificação escolhida no primeiro passo: o arquivo enviado e a última lida (para não ler de novo)
  let uploaded = null;
  let loaded = null;
  let imported = null;

  // { kind: 'file', path } | { kind: 'url', url } | { kind: 'upload' } → documento e um rótulo
  async function loadSource(source) {
    const kind = source && source.kind;
    if (kind === 'upload') {
      if (!uploaded) throw new Error('Send the file again.');
      return { doc: uploaded.doc, label: uploaded.name };
    }
    let label;
    if (kind === 'file') {
      const rel = String(source.path || '').replace(/\\/g, '/');
      const full = path.resolve(cwd, rel);
      if (!rel || !full.startsWith(path.resolve(cwd) + path.sep)) throw new Error('Choose a file inside the project.');
      label = path.relative(cwd, full).split(path.sep).join('/');
    } else if (kind === 'url') {
      label = String(source.url || '').trim();
      if (!/^https?:\/\/\S+$/i.test(label)) throw new Error('Enter an http(s) address.');
    } else {
      throw new Error('Unknown source.');
    }
    if (loaded && loaded.label === label && kind === 'url') return loaded;
    loaded = { doc: await readSource(label, { cwd }), label };
    return loaded;
  }

  // Prévia: o que a importação criaria e atualizaria, sem gravar nada
  function previewOf({ doc, label }) {
    const result = importIntoProject({ cwd, doc, source: label, dryRun: true });
    return {
      source: label,
      format: result.format,
      formatName: formatName(result.format),
      title: result.title || '',
      operations: result.operations,
      created: result.created.length,
      updated: result.updated.length + result.unchanged.length,
      folders: result.folders,
      base_url: result.base_url || null,
      warnings: result.warnings,
    };
  }

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
        sources: projectSources(cwd, files),
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
      uploaded = null;
      loaded = null;
      imported = null;
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

    /** Prévia de uma especificação (arquivo do projeto ou URL), sem gravar nada. */
    async preview(source) {
      return previewOf(await loadSource(source));
    },

    /** Arquivo enviado pelo navegador (fica só na memória): devolve a prévia. */
    upload(name, data) {
      if (!data || !data.length) throw new Error('Empty file');
      if (data.length > MAX_SOURCE_BYTES) throw new Error('The file is larger than 10 MB.');
      const label = path.basename(String(name || 'upload.json'));
      uploaded = { name: label, doc: parseSource(data.toString('utf8'), label) };
      return previewOf({ doc: uploaded.doc, label });
    },

    /** Respostas do wizard. Lança erro com mensagem legível se forem inválidas. */
    async submit(answers = {}) {
      if (!fs.existsSync(rhylaPath)) throw new Error(`No ${DOCS_DIR}/ folder. Run "rhyla init" first.`);
      if (!MODE_KEYS.includes(answers.mode)) throw new Error('Choose a mode.');
      if (typeof answers.language !== 'string' || !answers.language.trim()) throw new Error('Choose a language.');
      if (answers.logo !== undefined && answers.logo !== null && !/^\/public\/[\w./-]+$/.test(answers.logo)) throw new Error('Invalid logo path.');
      // Título e logo são opcionais: em branco, o agente escolhe
      const title = typeof answers.title === 'string' ? answers.title.trim() : '';
      const logo = typeof answers.logo === 'string' ? answers.logo : null;
      // Lê a especificação antes de gravar qualquer coisa: um erro aqui não deixa nada pela metade
      const source = answers.source && answers.source.kind && answers.source.kind !== 'none' ? await loadSource(answers.source) : null;
      updateConfig(rhylaPath, { title: title || undefined, logo });
      // O título que o usuário escreveu vence o da especificação
      imported = source ? { ...importIntoProject({ cwd, doc: source.doc, source: source.label }), source: source.label } : null;
      // Sem título do usuário, o da especificação substitui o provisório (template ou nome do pacote)
      const current = loadConfig(rhylaPath).title;
      if (!title && imported && imported.title && (!current || [...TEMPLATE_TITLES, projectName(cwd)].includes(current))) {
        updateConfig(rhylaPath, { title: imported.title });
      }
      const titled = Boolean(title || (imported && imported.title));
      siteTodo = !titled || !logo ? { title: !titled, logo: logo ? null : findLogoCandidates(cwd) } : null;
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
      for (const resolve of waiters) resolve({ status: 'saved', preferences, siteTodo, imported });
      waiters = [];
      return preferences;
    },

    /** Espera o usuário responder, por até `ms`. */
    wait(ms) {
      if (phase !== 'open' && phase !== 'idle') return Promise.resolve({ status: 'saved', preferences: readPreferences(rhylaPath), siteTodo, imported });
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
