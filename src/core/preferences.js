import fs from 'fs';
import path from 'path';

/*
 * Preferências da documentação escolhidas pelo usuário (wizard do `rhyla dev`, formulário ou chat),
 * salvas em rhyla-docs/config.json → preferences. Os textos em inglês são para o agente seguir.
 */

// Modos: quanto do projeto o agente lê e quanto escreve (do mais barato ao mais completo)
export const MODES = {
  essential: {
    label: 'Essential (routes only)',
    instructions: 'The cheapest mode. Read only the route files, the files that mount them (prefixes) and the validation schemas they use: find_routes lists them; do not explore the rest of the project. Write home.md (one short paragraph about the project and a table of every route linking to its page) and one page per route: the api block in the frontmatter (method, path, auth, parameters, request body, responses with status codes) and one or two sentences on what the route does. No other pages.',
  },
  balanced: {
    label: 'Balanced (routes with context)',
    instructions: 'Read the route files and, for each route, the handlers, services, models and middleware it uses. Each route page also explains what the route is for, its business rules, validation, authentication, possible errors and side effects. Also write guide/getting-started (requirements, install, configuration and environment variables, how to run) and a home page with an overview and the route index.',
  },
  complete: {
    label: 'Complete (the whole project)',
    instructions: 'Read the whole code base. Everything in the Balanced mode, plus architecture/ (the main modules and how a request or job moves through them), a configuration reference, deployment, scripts or CLI commands and pages for the other public modules. Link related pages to each other.',
  },
};
export const MODE_KEYS = Object.keys(MODES);

export const LANGUAGES = [
  ['Português (Brasil)', ['portug', 'pt']],
  ['English', ['english', 'ingles', 'en']],
  ['Español', ['spanish', 'espanol', 'es']],
];
export const AUDIENCES = ['Developers who use the API or library', 'Developers who work on this code', 'Both'];
export const EXAMPLES = [['curl', 'curl'], ['javascript', 'JavaScript (fetch)'], ['python', 'Python (requests)']];

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Nome de um dos idiomas oferecidos, ou null se o texto não corresponder a nenhum. */
export function matchLanguage(value) {
  const v = fold(value).trim();
  if (!v) return null;
  const found = LANGUAGES.find(([name, aliases]) => fold(name) === v || aliases.some((a) => v.startsWith(a)));
  return found ? found[0] : null;
}

/** Respostas usadas quando o usuário não escolheu (ou para preencher o wizard). */
export function defaultPreferences(mode = 'balanced') {
  return {
    mode,
    flows: false,
    audience: mode === 'essential' ? AUDIENCES[0] : AUDIENCES[2],
    examples: ['curl'],
  };
}

/**
 * Junta `update` às preferências atuais, validando cada campo. Campos ausentes ficam como estão.
 * @throws {Error} se mode não for um dos modos
 */
export function mergePreferences(current = {}, update = {}) {
  const prefs = { ...current };
  delete prefs.sections; // formato antigo (antes dos modos)
  for (const key of ['language', 'audience', 'notes']) {
    if (typeof update[key] === 'string') prefs[key] = update[key].trim();
  }
  if (update.mode !== undefined) {
    if (!MODE_KEYS.includes(update.mode)) throw new Error(`mode must be one of: ${MODE_KEYS.join(', ')}`);
    prefs.mode = update.mode;
  }
  if (typeof update.flows === 'boolean') prefs.flows = update.flows;
  if (Array.isArray(update.examples)) {
    prefs.examples = update.examples.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim());
  }
  for (const key of Object.keys(prefs)) if (prefs[key] === '') delete prefs[key];
  return prefs;
}

const configFile = (rhylaPath) => path.join(rhylaPath, 'config.json');

function readConfig(rhylaPath) {
  const file = configFile(rhylaPath);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    throw new Error('rhyla-docs/config.json is not valid JSON. Fix it, then save the preferences again.');
  }
}

export function readPreferences(rhylaPath) {
  try {
    const prefs = readConfig(rhylaPath).preferences;
    return prefs && typeof prefs === 'object' ? prefs : {};
  } catch {
    return {};
  }
}

/** Salva `update` em config.json (só os campos informados mudam) e devolve as preferências. */
export function savePreferences(rhylaPath, update) {
  const config = readConfig(rhylaPath);
  config.preferences = mergePreferences(config.preferences || {}, update);
  fs.writeFileSync(configFile(rhylaPath), JSON.stringify(config, null, 2) + '\n', 'utf8');
  return config.preferences;
}

/** Preferências em texto para o agente, com o que cada escolha significa. */
export function formatPreferences(prefs = {}) {
  const list = (v) => (Array.isArray(v) && v.length ? v.join(', ') : 'none');
  const mode = MODES[prefs.mode];
  return [
    prefs.language && `- Language: ${prefs.language}`,
    mode && `- Mode: ${mode.label}. ${mode.instructions}`,
    typeof prefs.flows === 'boolean' && (prefs.flows
      ? '- Flowcharts: yes. Add a flow page (type: flow) in flows/ for each multi-step process, linking the pages of its steps (call get_conventions with topic "flows" first).'
      : '- Flowcharts: no. Do not create flow pages.'),
    prefs.audience && `- Audience: ${prefs.audience}`,
    prefs.examples && `- Request examples: ${list(prefs.examples)}${prefs.examples.length ? ' (Rhyla generates them from the api block of each route page; do not write them by hand)' : ''}`,
    prefs.notes && `- Notes: ${prefs.notes}`,
  ].filter(Boolean).join('\n');
}
