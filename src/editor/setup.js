// Wizard de configuração da documentação (rhyla dev): idioma, modo, fluxograma e revisão.
// Depois de enviar, acompanha a geração feita pelo agente até a documentação ficar pronta.

const API = '/__rhyla/api/setup';
const STEPS = ['identity', 'language', 'mode', 'flows', 'review'];
const LOGO_MAX = 2 * 1024 * 1024;
// Valores salvos (o agente lê em inglês); os rótulos mostrados vêm de TEXT
const LANGUAGES = [['Português (Brasil)', 'pt', 'Guia de instalação'], ['English', 'en', 'Installation guide'], ['Español', 'es', 'Guía de instalación']];
const AUDIENCES = ['Developers who use the API or library', 'Developers who work on this code', 'Both'];
const EXAMPLES = ['curl', 'javascript', 'python'];
const MODES = ['essential', 'balanced', 'complete'];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const TEXT = {
  pt: {
    title: 'Configurar a documentação',
    project: 'Projeto',
    metrics: { files: 'arquivos', lines: 'linhas', routes: 'rotas' },
    routesMore: (n) => `+ ${plural(n, 'rota', 'rotas')}`,
    noRoutes: 'Nenhuma rota HTTP encontrada automaticamente.',
    steps: ['Identidade', 'Idioma', 'Modo', 'Fluxograma', 'Revisão'],
    identityTitle: 'Como a documentação vai se chamar?',
    identityLead: 'O título e a logo aparecem no topo de todas as páginas. Os dois são opcionais: em branco, o agente escolhe a partir do projeto.',
    titleLabel: 'Título (opcional)',
    titlePlaceholder: 'Em branco, o agente escolhe',
    logoLabel: 'Logo (opcional)',
    logoDrop: 'Arraste uma imagem ou clique para escolher',
    logoHint: 'PNG, SVG, JPG ou WebP, até 2 MB. Sem logo, o agente procura uma no projeto.',
    agentPicks: 'Escolhido pelo agente',
    logoByAgent: 'Logo: o agente procura no projeto',
    logoChange: 'Trocar',
    logoRemove: 'Remover',
    logoUploading: 'Enviando…',
    logoTooBig: 'A imagem passa de 2 MB.',
    logoNotImage: 'Escolha um arquivo de imagem.',
    preview: 'Prévia do cabeçalho',
    site: 'Site',
    stepOf: (i, n) => `Passo ${i} de ${n}`,
    languageTitle: 'Em que idioma a documentação será escrita?',
    languageLead: (name) => `O agente vai ler ${name} e escrever todas as páginas nesse idioma.`,
    other: 'Outro idioma',
    otherSample: 'Você escolhe',
    otherLabel: 'Qual idioma?',
    otherPlaceholder: 'Ex.: Italiano',
    modeTitle: 'Quanto a documentação deve cobrir?',
    modeLead: 'Quanto mais o agente lê do projeto, mais completa fica a documentação, e mais tempo e tokens ela custa.',
    recommended: 'Recomendado',
    cost: 'Custo',
    costLevels: ['baixo', 'médio', 'alto'],
    modes: {
      essential: ['Essencial', 'Foco em rotas', 'Uma página por rota, com método, caminho, parâmetros, respostas e exemplos.'],
      balanced: ['Equilibrado', 'Rotas com contexto', 'Cada rota explicada: regras de negócio, erros e autenticação, mais um guia para rodar o projeto.'],
      complete: ['Completo', 'O projeto inteiro', 'Tudo do Equilibrado, mais arquitetura, módulos, configuração e deploy.'],
    },
    reads: {
      essential: (p) => (p.routeFiles ? `Lê ${plural(p.routeFiles, 'arquivo de rota', 'arquivos de rota')}` : 'Lê só os arquivos de rota'),
      balanced: () => 'Lê as rotas e o que elas usam',
      complete: (p) => `Lê ${plural(p.codeFiles, 'arquivo', 'arquivos')} de código`,
    },
    pages: (n) => `≈ ${plural(n, 'página', 'páginas')}`,
    pagesPlus: (n) => `${n}+ páginas`,
    flowsTitle: 'Incluir fluxogramas?',
    flowsLead: 'Diagramas dos processos de vários passos, como cadastro → login → pedido, ligando as páginas de cada passo.',
    flowsYes: ['Com fluxograma', 'Páginas de fluxo com o diagrama de cada processo, em flows/.'],
    flowsNo: ['Sem fluxograma', 'Só as páginas, sem diagramas de processo.'],
    reviewTitle: 'Tudo pronto para gerar',
    reviewLead: 'Confira as escolhas. Dá para mudar depois rodando /rhyla:init de novo.',
    summary: { language: 'Idioma', mode: 'Modo', flows: 'Fluxograma' },
    edit: 'Alterar',
    advanced: 'Opções avançadas',
    audience: 'Quem vai ler',
    audiences: ['Quem usa a API ou a biblioteca', 'Quem trabalha neste código', 'Os dois'],
    examples: 'Exemplos de requisição',
    notes: 'Observações para o agente',
    notesPlaceholder: 'Tom, o que deixar de fora, outros detalhes…',
    back: 'Voltar', next: 'Continuar', generate: 'Gerar documentação', save: 'Salvar preferências',
    hintPick: 'escolher', hintNext: 'continuar',
    chooseLanguage: 'Escolha um idioma.',
    phases: ['Preferências salvas', 'Lendo o projeto', 'Escrevendo as páginas', 'Pronto'],
    buildingTitle: 'Gerando a documentação',
    readyTitle: 'Documentação pronta',
    reading: 'O agente está lendo o projeto e planejando as páginas.',
    writing: 'O agente está escrevendo. Cada página aparece aqui assim que fica pronta.',
    progress: (n, t) => `${n} de ${plural(t, 'página', 'páginas')}`,
    elapsed: 'Tempo',
    readyText: (n, time) => `${plural(n, 'página escrita', 'páginas escritas')} em ${time}. Dá para editar qualquer uma no navegador, pelo botão Edit page.`,
    nextSteps: 'Revise as páginas e, quando quiser publicar, rode npx rhyla build.',
    open: 'Abrir a documentação',
    view: 'Abrir',
    savedTitle: 'Preferências salvas',
    savedText: 'No seu agente, rode /rhyla:init para gerar a documentação com essas escolhas.',
    docs: 'Ver a documentação',
    theme: 'Alternar tema claro e escuro',
  },
  en: {
    title: 'Set up the docs',
    project: 'Project',
    metrics: { files: 'files', lines: 'lines', routes: 'routes' },
    routesMore: (n) => `+ ${plural(n, 'route', 'routes')}`,
    noRoutes: 'No HTTP routes found automatically.',
    steps: ['Identity', 'Language', 'Mode', 'Flowcharts', 'Review'],
    identityTitle: 'What should the docs be called?',
    identityLead: 'The title and the logo show up at the top of every page. Both are optional: left empty, the agent picks them from the project.',
    titleLabel: 'Title (optional)',
    titlePlaceholder: 'Empty: the agent picks one',
    logoLabel: 'Logo (optional)',
    logoDrop: 'Drop an image or click to choose',
    logoHint: 'PNG, SVG, JPG or WebP, up to 2 MB. Without one, the agent looks for a logo in the project.',
    agentPicks: 'Picked by the agent',
    logoByAgent: 'Logo: the agent looks in the project',
    logoChange: 'Change',
    logoRemove: 'Remove',
    logoUploading: 'Uploading…',
    logoTooBig: 'The image is larger than 2 MB.',
    logoNotImage: 'Choose an image file.',
    preview: 'Header preview',
    site: 'Site',
    stepOf: (i, n) => `Step ${i} of ${n}`,
    languageTitle: 'Which language should the docs be written in?',
    languageLead: (name) => `The agent will read ${name} and write every page in this language.`,
    other: 'Another language',
    otherSample: 'You choose',
    otherLabel: 'Which language?',
    otherPlaceholder: 'E.g. Italian',
    modeTitle: 'How much should the docs cover?',
    modeLead: 'The more of the project the agent reads, the more complete the docs, and the more time and tokens they cost.',
    recommended: 'Recommended',
    cost: 'Cost',
    costLevels: ['low', 'medium', 'high'],
    modes: {
      essential: ['Essential', 'Routes only', 'One page per route, with method, path, parameters, responses and examples.'],
      balanced: ['Balanced', 'Routes with context', 'Each route explained: business rules, errors and authentication, plus a guide to run the project.'],
      complete: ['Complete', 'The whole project', 'Everything in Balanced, plus architecture, modules, configuration and deployment.'],
    },
    reads: {
      essential: (p) => (p.routeFiles ? `Reads ${plural(p.routeFiles, 'route file', 'route files')}` : 'Reads only the route files'),
      balanced: () => 'Reads the routes and what they use',
      complete: (p) => `Reads ${plural(p.codeFiles, 'code file', 'code files')}`,
    },
    pages: (n) => `≈ ${plural(n, 'page', 'pages')}`,
    pagesPlus: (n) => `${n}+ pages`,
    flowsTitle: 'Include flowcharts?',
    flowsLead: 'Diagrams of multi-step processes, such as sign-up → login → order, linking the pages of each step.',
    flowsYes: ['With flowcharts', 'Flow pages with the diagram of each process, in flows/.'],
    flowsNo: ['Without flowcharts', 'Only the pages, no process diagrams.'],
    reviewTitle: 'Ready to generate',
    reviewLead: 'Check your choices. You can change them later by running /rhyla:init again.',
    summary: { language: 'Language', mode: 'Mode', flows: 'Flowcharts' },
    edit: 'Change',
    advanced: 'Advanced options',
    audience: 'Who will read it',
    audiences: ['People who use the API or library', 'People who work on this code', 'Both'],
    examples: 'Request examples',
    notes: 'Notes for the agent',
    notesPlaceholder: 'Tone, what to leave out, other details…',
    back: 'Back', next: 'Continue', generate: 'Generate the docs', save: 'Save preferences',
    hintPick: 'choose', hintNext: 'continue',
    chooseLanguage: 'Choose a language.',
    phases: ['Preferences saved', 'Reading the project', 'Writing the pages', 'Done'],
    buildingTitle: 'Generating the docs',
    readyTitle: 'The docs are ready',
    reading: 'The agent is reading the project and planning the pages.',
    writing: 'The agent is writing. Each page shows up here as soon as it is ready.',
    progress: (n, t) => `${n} of ${plural(t, 'page', 'pages')}`,
    elapsed: 'Time',
    readyText: (n, time) => `${plural(n, 'page', 'pages')} written in ${time}. You can edit any of them in the browser, with the Edit page button.`,
    nextSteps: 'Review the pages and, when you want to publish, run npx rhyla build.',
    open: 'Open the docs',
    view: 'Open',
    savedTitle: 'Preferences saved',
    savedText: 'In your agent, run /rhyla:init to generate the docs with these choices.',
    docs: 'See the docs',
    theme: 'Toggle light and dark theme',
  },
  es: {
    title: 'Configurar la documentación',
    project: 'Proyecto',
    metrics: { files: 'archivos', lines: 'líneas', routes: 'rutas' },
    routesMore: (n) => `+ ${plural(n, 'ruta', 'rutas')}`,
    noRoutes: 'No se encontraron rutas HTTP automáticamente.',
    steps: ['Identidad', 'Idioma', 'Modo', 'Diagramas', 'Revisión'],
    identityTitle: '¿Cómo se llamará la documentación?',
    identityLead: 'El título y el logo aparecen en la parte superior de todas las páginas. Ambos son opcionales: vacíos, el agente los elige a partir del proyecto.',
    titleLabel: 'Título (opcional)',
    titlePlaceholder: 'Vacío, el agente elige uno',
    logoLabel: 'Logo (opcional)',
    logoDrop: 'Arrastra una imagen o haz clic para elegir',
    logoHint: 'PNG, SVG, JPG o WebP, hasta 2 MB. Sin logo, el agente busca uno en el proyecto.',
    agentPicks: 'Elegido por el agente',
    logoByAgent: 'Logo: el agente lo busca en el proyecto',
    logoChange: 'Cambiar',
    logoRemove: 'Quitar',
    logoUploading: 'Subiendo…',
    logoTooBig: 'La imagen supera los 2 MB.',
    logoNotImage: 'Elige un archivo de imagen.',
    preview: 'Vista previa del encabezado',
    site: 'Sitio',
    stepOf: (i, n) => `Paso ${i} de ${n}`,
    languageTitle: '¿En qué idioma se escribirá la documentación?',
    languageLead: (name) => `El agente leerá ${name} y escribirá todas las páginas en este idioma.`,
    other: 'Otro idioma',
    otherSample: 'Tú eliges',
    otherLabel: '¿Qué idioma?',
    otherPlaceholder: 'Ej.: Italiano',
    modeTitle: '¿Cuánto debe cubrir la documentación?',
    modeLead: 'Cuanto más lee el agente del proyecto, más completa queda la documentación, y más tiempo y tokens cuesta.',
    recommended: 'Recomendado',
    cost: 'Costo',
    costLevels: ['bajo', 'medio', 'alto'],
    modes: {
      essential: ['Esencial', 'Solo rutas', 'Una página por ruta, con método, ruta, parámetros, respuestas y ejemplos.'],
      balanced: ['Equilibrado', 'Rutas con contexto', 'Cada ruta explicada: reglas de negocio, errores y autenticación, más una guía para ejecutar el proyecto.'],
      complete: ['Completo', 'Todo el proyecto', 'Todo lo de Equilibrado, más arquitectura, módulos, configuración y despliegue.'],
    },
    reads: {
      essential: (p) => (p.routeFiles ? `Lee ${plural(p.routeFiles, 'archivo de rutas', 'archivos de rutas')}` : 'Lee solo los archivos de rutas'),
      balanced: () => 'Lee las rutas y lo que usan',
      complete: (p) => `Lee ${plural(p.codeFiles, 'archivo', 'archivos')} de código`,
    },
    pages: (n) => `≈ ${plural(n, 'página', 'páginas')}`,
    pagesPlus: (n) => `${n}+ páginas`,
    flowsTitle: '¿Incluir diagramas de flujo?',
    flowsLead: 'Diagramas de los procesos de varios pasos, como registro → login → pedido, que enlazan las páginas de cada paso.',
    flowsYes: ['Con diagramas', 'Páginas de flujo con el diagrama de cada proceso, en flows/.'],
    flowsNo: ['Sin diagramas', 'Solo las páginas, sin diagramas de procesos.'],
    reviewTitle: 'Todo listo para generar',
    reviewLead: 'Revisa tus elecciones. Puedes cambiarlas después ejecutando /rhyla:init de nuevo.',
    summary: { language: 'Idioma', mode: 'Modo', flows: 'Diagramas' },
    edit: 'Cambiar',
    advanced: 'Opciones avanzadas',
    audience: 'Quién lo leerá',
    audiences: ['Quien usa la API o la biblioteca', 'Quien trabaja en este código', 'Ambos'],
    examples: 'Ejemplos de petición',
    notes: 'Notas para el agente',
    notesPlaceholder: 'Tono, qué dejar fuera, otros detalles…',
    back: 'Atrás', next: 'Continuar', generate: 'Generar la documentación', save: 'Guardar preferencias',
    hintPick: 'elegir', hintNext: 'continuar',
    chooseLanguage: 'Elige un idioma.',
    phases: ['Preferencias guardadas', 'Leyendo el proyecto', 'Escribiendo las páginas', 'Listo'],
    buildingTitle: 'Generando la documentación',
    readyTitle: 'Documentación lista',
    reading: 'El agente está leyendo el proyecto y planificando las páginas.',
    writing: 'El agente está escribiendo. Cada página aparece aquí en cuanto está lista.',
    progress: (n, t) => `${n} de ${plural(t, 'página', 'páginas')}`,
    elapsed: 'Tiempo',
    readyText: (n, time) => `${plural(n, 'página escrita', 'páginas escritas')} en ${time}. Puedes editar cualquiera en el navegador, con el botón Edit page.`,
    nextSteps: 'Revisa las páginas y, cuando quieras publicar, ejecuta npx rhyla build.',
    open: 'Abrir la documentación',
    view: 'Abrir',
    savedTitle: 'Preferencias guardadas',
    savedText: 'En tu agente, ejecuta /rhyla:init para generar la documentación con estas elecciones.',
    docs: 'Ver la documentación',
    theme: 'Cambiar entre tema claro y oscuro',
  },
};

// Ilustrações dos cartões (SVG fixo, sem dados do usuário)
const pill = (x, y, cls) => `<rect class="${cls}" x="${x}" y="${y}" width="18" height="8" rx="4"/>`;
const line = (x, y, w, cls = 'ln') => `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="4" rx="2"/>`;
const ART = {
  essential: `<svg viewBox="0 0 132 72" aria-hidden="true">${[['get', 6], ['post', 22], ['patch', 38], ['delete', 54]]
    .map(([cls, y]) => pill(10, y, cls) + line(34, y + 2, 82)).join('')}</svg>`,
  balanced: `<svg viewBox="0 0 132 72" aria-hidden="true">${pill(10, 4, 'get')}${line(34, 6, 76)}${line(34, 16, 88, 'ln-soft')}${line(34, 24, 62, 'ln-soft')}
    ${pill(10, 40, 'post')}${line(34, 42, 70)}${line(34, 52, 88, 'ln-soft')}${line(34, 60, 54, 'ln-soft')}</svg>`,
  complete: `<svg viewBox="0 0 132 72" aria-hidden="true"><rect class="box" x="50" y="2" width="32" height="16" rx="4"/>
    <path class="edge" d="M66 18v8M22 26h88M22 26v6M66 26v6M110 26v6"/>
    <rect class="box" x="6" y="32" width="32" height="16" rx="4"/><rect class="box" x="50" y="32" width="32" height="16" rx="4"/><rect class="box" x="94" y="32" width="32" height="16" rx="4"/>
    ${line(6, 56, 30, 'ln-soft')}${line(6, 64, 22, 'ln-soft')}${line(50, 56, 30, 'ln-soft')}${line(50, 64, 22, 'ln-soft')}${line(94, 56, 30, 'ln-soft')}${line(94, 64, 22, 'ln-soft')}</svg>`,
  flowsYes: `<svg viewBox="0 0 132 72" aria-hidden="true"><rect class="box" x="2" y="10" width="30" height="16" rx="8"/><rect class="box" x="51" y="10" width="30" height="16" rx="8"/>
    <rect class="box" x="100" y="10" width="30" height="16" rx="8"/><rect class="box" x="51" y="48" width="30" height="16" rx="8"/>
    <path class="edge" d="M32 18h15M81 18h15M66 26v18"/><path class="edge" d="M44 14l4 4-4 4M93 14l4 4-4 4M62 41l4 4 4-4"/></svg>`,
  flowsNo: `<svg viewBox="0 0 132 72" aria-hidden="true">${[8, 24, 40, 56].map((y) => line(14, y, 104 - (y % 3) * 10)).join('')}</svg>`,
};
const MARK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>';
const UPLOAD = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
const check = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const CHECK = check(12);
const CHECK_LG = check(20);

const $ = (id) => document.getElementById(id);
const stage = $('su-stage');

// Cria um elemento: h('p', { class: 'x' }, 'texto', filho…)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // só com SVG fixo deste arquivo
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

const state = {
  info: null,
  step: 0,
  visited: 0,
  ui: 'en',
  answers: { title: '', logo: null, language: '', otherLanguage: '', mode: 'balanced', flows: false, audience: AUDIENCES[2], examples: ['curl'], notes: '' },
  logoVersion: 0,
  uploading: false,
  audienceTouched: false,
  submitting: false,
  advanceTimer: null,
  // elapsed: tempo informado pelo servidor; at: quando chegou (o relógio anda entre as consultas)
  progress: { seen: new Set(), elapsed: 0, at: 0, done: false, ticker: null },
};

const t = () => TEXT[state.ui];
const uiFor = (language) => (LANGUAGES.find(([name]) => name === language) || [])[1];
const project = () => state.info.project;

function initialUi(saved) {
  const fromSaved = uiFor(saved);
  if (fromSaved) return fromSaved;
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return TEXT[nav] ? nav : 'en';
}

function chosenLanguage() {
  const a = state.answers;
  return a.language === 'other' ? a.otherLanguage.trim() : a.language;
}

const modeName = (mode) => t().modes[mode][0];
const flowsName = (flows) => (flows ? t().flowsYes : t().flowsNo)[0];
const methodOf = (slug) => (slug.split('/').pop().match(/^(get|post|put|patch|delete)-/i) || [])[1];
const formatTime = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// ===== Painel lateral =====

function renderProject() {
  const p = project();
  $('su-project').hidden = false;
  $('su-project-label').textContent = t().project;
  $('su-project-name').textContent = p.name;
  const m = t().metrics;
  $('su-metrics').replaceChildren(...[[m.files, p.codeFiles], [m.lines, p.lines], [m.routes, p.routes]]
    .map(([label, value]) => h('div', {}, h('dt', {}, label), h('dd', {}, value.toLocaleString(state.ui)))));
  const list = p.routeList || [];
  $('su-routes').replaceChildren(...[
    ...list.map((r) => h('div', { class: 'su-route' }, h('span', { class: `http-tag http-tag--${r.method.toLowerCase()}` }, r.method), h('span', {}, r.path))),
    p.routes > list.length ? h('div', { class: 'su-routes-more' }, t().routesMore(p.routes - list.length)) : null,
    !p.routes ? h('div', { class: 'su-routes-empty' }, t().noRoutes) : null,
  ].filter(Boolean));
  $('su-theme').setAttribute('aria-label', t().theme);
  $('su-theme').title = t().theme;
  document.title = `${t().title} · Rhyla`;
  document.documentElement.lang = state.ui === 'pt' ? 'pt-BR' : state.ui;
}

function stepValue(i) {
  const a = state.answers;
  if (i > state.visited || i === STEPS.length - 1) return '';
  return [a.title.trim() || t().agentPicks, chosenLanguage(), modeName(a.mode), flowsName(a.flows)][i] || '';
}

function renderSteps() {
  $('su-steps').replaceChildren(...t().steps.map((label, i) => {
    const done = i < state.step || (i <= state.visited && i !== state.step);
    const cls = `su-step${i === state.step ? ' is-current' : done ? ' is-done' : ''}`;
    const content = [
      h('span', { class: 'su-step-dot', html: done ? CHECK : null }, done ? null : String(i + 1)),
      h('span', { class: 'su-step-label' }, label),
      h('span', { class: 'su-step-value' }, stepValue(i)),
    ];
    const canGo = i <= state.visited && i !== state.step;
    return h('li', {}, canGo
      ? h('button', { type: 'button', class: cls, onclick: () => goTo(i) }, content)
      : h('div', { class: cls, 'aria-current': i === state.step ? 'step' : null }, content));
  }));
  $('su-mobile-fill').style.width = `${((state.step + 1) / STEPS.length) * 100}%`;
}

function renderPhases(phase) {
  const index = { saved: 1, building: 2, done: 4 }[phase] ?? 1;
  $('su-steps').replaceChildren(...t().phases.map((label, i) => {
    const done = i < index;
    const active = i === index;
    return h('li', {}, h('div', { class: `su-step${done ? ' is-done' : active ? ' is-active is-current' : ''}` },
      h('span', { class: 'su-step-dot', html: done ? CHECK : null }, done || active ? null : String(i + 1)),
      h('span', { class: 'su-step-label' }, label),
      h('span', { class: 'su-step-value' }, '')));
  }));
  $('su-mobile-fill').style.width = `${(Math.min(index, 4) / 4) * 100}%`;
}

// ===== Etapas =====

function option({ type = 'radio', name, value, checked, title, tag, text, art, meta, badge, key, onchange, extra }) {
  return h('label', { class: 'su-option' },
    // click (e não change): escolher de novo a opção já marcada também conta (e avança)
    h('input', { type, name, value, checked: checked || null, onclick: onchange }),
    badge ? h('span', { class: 'su-badge' }, badge) : null,
    h('span', { class: 'su-check', html: CHECK }),
    art ? h('span', { class: 'su-art', html: art }) : null,
    extra || null,
    h('span', { class: 'su-option-title' }, title),
    tag ? h('span', { class: 'su-option-tag' }, tag) : null,
    text ? h('span', { class: 'su-option-text' }, text) : null,
    meta || null,
    key ? h('kbd', { class: 'su-key', 'aria-hidden': 'true' }, key) : null);
}

function costMeter(level) {
  return h('span', { class: 'su-cost' }, `${t().cost}:`,
    h('span', { class: 'su-cost-bars', 'aria-hidden': 'true' }, [0, 1, 2].map((i) => h('i', { class: i <= level ? 'is-on' : '' }))),
    t().costLevels[level]);
}

// Avança sozinho depois de uma escolha simples (dá tempo de ver a marcação)
function autoAdvance() {
  clearTimeout(state.advanceTimer);
  state.advanceTimer = setTimeout(next, 260);
}

// Prévia do cabeçalho do site com o título e a logo escolhidos
const logoSrc = () => `${state.answers.logo}?v=${state.logoVersion}`;
function headerPreview() {
  const a = state.answers;
  return h('div', { class: 'su-preview-bar' },
    a.logo ? h('img', { src: logoSrc(), alt: '' }) : h('span', { class: 'rh-brand-mark', html: MARK }),
    h('span', { class: `su-preview-title${a.title.trim() ? '' : ' is-empty'}`, id: 'su-preview-title' }, a.title.trim() || t().agentPicks),
    h('span', { class: 'su-preview-search', 'aria-hidden': 'true' }));
}

async function uploadLogo(file) {
  const a = state.answers;
  if (!file) return;
  if (!/^image\//.test(file.type)) { $('su-error').textContent = t().logoNotImage; return; }
  if (file.size > LOGO_MAX) { $('su-error').textContent = t().logoTooBig; return; }
  state.uploading = true;
  render(false);
  try {
    const res = await fetch(`${API}/logo?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    a.logo = body.src;
    state.logoVersion = Date.now();
    state.uploading = false;
    render(false);
  } catch (err) {
    state.uploading = false;
    render(false);
    $('su-error').textContent = err.message;
  }
}

const VIEWS = {
  identity() {
    const a = state.answers;
    const fileInput = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml,image/webp,image/gif,image/avif', onchange: (e) => uploadLogo(e.target.files[0]) });
    const drop = (el) => {
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('is-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('is-over'));
      el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('is-over'); uploadLogo(e.dataTransfer.files[0]); });
      return el;
    };
    const logoField = a.logo
      ? drop(h('div', { class: 'su-logo-row' },
        h('img', { class: 'su-logo-thumb', src: logoSrc(), alt: '' }),
        h('span', { class: 'su-logo-actions' },
          h('label', { class: 'su-btn su-btn-sm' }, t().logoChange, fileInput),
          h('button', { type: 'button', class: 'su-btn su-btn-sm su-btn-ghost', onclick: () => { a.logo = null; render(false); } }, t().logoRemove))))
      : drop(h('label', { class: `su-drop${state.uploading ? ' is-busy' : ''}` },
        h('span', { class: 'su-drop-icon', html: UPLOAD }),
        h('span', { class: 'su-drop-text' }, state.uploading ? t().logoUploading : t().logoDrop),
        h('span', { class: 'su-drop-hint' }, t().logoHint),
        fileInput));
    return {
      title: t().identityTitle,
      lead: t().identityLead,
      body: h('div', { class: 'su-identity' },
        h('div', { class: 'su-identity-fields' },
          h('label', { class: 'su-field' },
            h('span', { class: 'su-field-label' }, t().titleLabel),
            h('input', {
              class: 'su-input su-input-lg', id: 'su-title', value: a.title, placeholder: t().titlePlaceholder, maxlength: '80',
              oninput: (e) => {
                a.title = e.target.value;
                const preview = $('su-preview-title');
                preview.textContent = a.title.trim() || t().agentPicks;
                preview.classList.toggle('is-empty', !a.title.trim());
                renderSteps();
              },
            })),
          h('div', { class: 'su-field' }, h('span', { class: 'su-field-label' }, t().logoLabel), logoField)),
        h('figure', { class: 'su-preview' },
          h('figcaption', {}, t().preview),
          headerPreview(),
          h('div', { class: 'su-preview-page', 'aria-hidden': 'true' }, h('i', { class: 'is-heading' }), h('i', {}), h('i', {}), h('i', { class: 'is-short' })))),
    };
  },

  language() {
    const a = state.answers;
    const other = h('label', { class: 'su-other', hidden: a.language !== 'other' },
      t().otherLabel,
      h('input', {
        class: 'su-input', value: a.otherLanguage, placeholder: t().otherPlaceholder,
        oninput: (e) => { a.otherLanguage = e.target.value; renderSteps(); },
      }));
    const choose = (value) => () => {
      a.language = value;
      const ui = uiFor(value);
      if (ui && ui !== state.ui) { state.ui = ui; renderProject(); render(false); }
      if (value === 'other') {
        other.hidden = false;
        other.querySelector('input').focus();
        renderSteps();
        return;
      }
      autoAdvance();
    };
    return {
      title: t().languageTitle,
      lead: t().languageLead(project().name),
      body: [
        h('div', { class: 'su-options is-langs' },
          LANGUAGES.map(([name, code, sample], i) => option({
            name: 'language', value: name, checked: a.language === name, title: name, key: String(i + 1),
            extra: h('span', { class: 'su-lang-code' }, code.toUpperCase()),
            text: h('span', { class: 'su-lang-sample' }, sample),
            onchange: choose(name),
          })),
          option({
            name: 'language', value: 'other', checked: a.language === 'other', title: t().other, key: '4',
            extra: h('span', { class: 'su-lang-code' }, '+'),
            text: h('span', { class: 'su-lang-sample' }, t().otherSample),
            onchange: choose('other'),
          })),
        other,
      ],
    };
  },

  mode() {
    const a = state.answers;
    const p = project();
    const estimate = { essential: t().pages(p.routes + 1), balanced: t().pages(p.routes + 2), complete: t().pagesPlus(p.routes + 5) };
    return {
      title: t().modeTitle,
      lead: t().modeLead,
      body: h('div', { class: 'su-options is-modes' }, MODES.map((mode, i) => {
        const [title, tag, text] = t().modes[mode];
        return option({
          name: 'mode', value: mode, checked: a.mode === mode, title, tag, text, key: String(i + 1),
          art: ART[mode],
          badge: mode === 'balanced' ? t().recommended : null,
          meta: h('span', { class: 'su-option-meta' },
            h('span', {}, t().reads[mode](p)),
            p.routes ? h('span', {}, estimate[mode]) : null,
            costMeter(i)),
          onchange: () => {
            a.mode = mode;
            if (!state.audienceTouched) a.audience = mode === 'essential' ? AUDIENCES[0] : AUDIENCES[2];
            renderSteps();
          },
        });
      })),
    };
  },

  flows() {
    const a = state.answers;
    const [yesTitle, yesText] = t().flowsYes;
    const [noTitle, noText] = t().flowsNo;
    return {
      title: t().flowsTitle,
      lead: t().flowsLead,
      body: h('div', { class: 'su-options is-two' },
        option({ name: 'flows', value: 'yes', checked: a.flows, title: yesTitle, text: yesText, art: ART.flowsYes, key: '1', onchange: () => { a.flows = true; autoAdvance(); } }),
        option({ name: 'flows', value: 'no', checked: !a.flows, title: noTitle, text: noText, art: ART.flowsNo, key: '2', onchange: () => { a.flows = false; autoAdvance(); } })),
    };
  },

  review() {
    const a = state.answers;
    const s = t().summary;
    const tile = (label, value, sub, step) => h('div', { class: 'su-tile' },
      h('span', { class: 'su-tile-label' }, label),
      h('span', { class: 'su-tile-value' }, value),
      sub ? h('span', { class: 'su-tile-sub' }, sub) : null,
      h('button', { type: 'button', class: 'su-link', onclick: () => goTo(step) }, t().edit));
    return {
      title: t().reviewTitle,
      lead: t().reviewLead,
      body: [
        h('div', { class: 'su-tiles' },
          h('div', { class: 'su-tile su-tile-site' },
            h('span', { class: 'su-tile-label' }, t().site),
            h('span', { class: 'su-tile-brand' },
              a.logo ? h('img', { src: logoSrc(), alt: '' }) : h('span', { class: 'rh-brand-mark', html: MARK }),
              h('span', { class: 'su-tile-value' }, a.title.trim() || t().agentPicks)),
            a.logo ? null : h('span', { class: 'su-tile-sub' }, t().logoByAgent),
            h('button', { type: 'button', class: 'su-link', onclick: () => goTo(0) }, t().edit)),
          tile(s.language, chosenLanguage(), null, 1),
          tile(s.mode, modeName(a.mode), t().modes[a.mode][1], 2),
          tile(s.flows, flowsName(a.flows), null, 3)),
        h('details', { class: 'su-advanced' },
          h('summary', {}, t().advanced),
          h('div', { class: 'su-advanced-body' },
            h('fieldset', { class: 'su-field' },
              h('legend', {}, t().audience),
              AUDIENCES.map((value, i) => h('label', { class: 'su-choice' },
                h('input', { type: 'radio', name: 'audience', value, checked: a.audience === value || null, onchange: () => { a.audience = value; state.audienceTouched = true; } }),
                t().audiences[i]))),
            h('fieldset', { class: 'su-field' },
              h('legend', {}, t().examples),
              EXAMPLES.map((value) => h('label', { class: 'su-choice' },
                h('input', {
                  type: 'checkbox', value, checked: a.examples.includes(value) || null,
                  onchange: (e) => { a.examples = e.target.checked ? [...new Set([...a.examples, value])] : a.examples.filter((x) => x !== value); },
                }),
                { curl: 'curl', javascript: 'JavaScript (fetch)', python: 'Python (requests)' }[value]))),
            h('label', { class: 'su-field' },
              h('span', { class: 'su-field-label' }, t().notes),
              h('textarea', { class: 'su-textarea', placeholder: t().notesPlaceholder, oninput: (e) => { a.notes = e.target.value; } }, a.notes)))),
      ],
    };
  },
};

function render(animate = true) {
  clearTimeout(state.advanceTimer);
  const view = VIEWS[STEPS[state.step]]();
  renderSteps();
  $('su-error').textContent = '';
  stage.classList.remove('is-enter');
  stage.replaceChildren(
    h('span', { class: 'su-kicker' }, t().stepOf(state.step + 1, STEPS.length)),
    h('h1', {}, view.title),
    h('p', { class: 'su-lead' }, view.lead),
    ...[].concat(view.body));
  if (animate) { void stage.offsetWidth; stage.classList.add('is-enter'); }
  if (STEPS[state.step] === 'identity' && animate) $('su-title').focus();

  const last = state.step === STEPS.length - 1;
  $('su-nav').hidden = false;
  $('su-back').hidden = state.step === 0;
  $('su-back').textContent = `← ${t().back}`;
  const nextBtn = $('su-next');
  nextBtn.textContent = last ? `${state.info.agent ? t().generate : t().save} →` : `${t().next} →`;
  nextBtn.classList.toggle('su-btn-lg', last);
  nextBtn.disabled = state.submitting;
  const options = stage.querySelectorAll('.su-options input[type=radio]').length;
  $('su-hint').replaceChildren(...(options
    ? [h('kbd', {}, '1'), '–', h('kbd', {}, String(options)), ` ${t().hintPick} · `]
    : []), h('kbd', {}, 'Enter'), ` ${t().hintNext}`);
}

function goTo(step) {
  if (step === state.step) return;
  state.step = step;
  render();
}

function next() {
  clearTimeout(state.advanceTimer);
  if (state.uploading) return;
  if (STEPS[state.step] === 'language' && !chosenLanguage()) {
    $('su-error').textContent = t().chooseLanguage;
    return;
  }
  if (state.step === STEPS.length - 1) { submit(); return; }
  state.step++;
  state.visited = Math.max(state.visited, state.step);
  render();
}

function back() {
  if (state.step > 0) goTo(state.step - 1);
}

async function submit() {
  const a = state.answers;
  state.submitting = true;
  $('su-next').disabled = true;
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: a.title.trim(), logo: a.logo, language: chosenLanguage(), mode: a.mode, flows: a.flows, audience: a.audience, examples: a.examples, notes: a.notes }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || res.statusText);
    showProgress();
  } catch (err) {
    state.submitting = false;
    $('su-next').disabled = false;
    $('su-error').textContent = err.message;
  }
}

// ===== Progresso da geração =====

function showProgress() {
  $('su-nav').hidden = true;
  stage.classList.remove('is-enter');
  void stage.offsetWidth;
  stage.classList.add('is-enter');
  if (!state.info.agent) {
    state.visited = STEPS.length;
    state.step = STEPS.length;
    renderSteps();
    stage.replaceChildren(
      h('div', { class: 'su-status' }, h('span', { class: 'su-success', html: CHECK_LG }), h('h1', {}, t().savedTitle)),
      h('p', { class: 'su-lead' }, t().savedText),
      h('a', { class: 'su-btn su-btn-primary su-btn-lg', href: '/' }, `${t().docs} →`));
    return;
  }
  const poll = async () => {
    try {
      const status = await (await fetch(`${API}/status`)).json();
      renderProgress(status);
      if (status.phase === 'done') return;
    } catch {}
    setTimeout(poll, 1200);
  };
  poll();
  state.progress.ticker = setInterval(() => {
    const el = $('su-elapsed');
    if (el) el.textContent = formatTime(elapsedNow());
  }, 1000);
}

const elapsedNow = () => state.progress.elapsed + (state.progress.done ? 0 : Date.now() - state.progress.at);

function renderProgress(status) {
  const done = status.phase === 'done';
  const p = state.progress;
  p.elapsed = status.elapsed || 0;
  p.at = Date.now();
  p.done = done;
  if (done) clearInterval(p.ticker);
  renderPhases(status.phase);
  const pct = done ? 100 : status.total ? Math.round((status.written / status.total) * 100) : 0;
  const firstPending = status.pages.findIndex((pg) => !pg.written);
  const elapsed = formatTime(elapsedNow());

  const rows = status.pages.map((pg, i) => {
    const isNew = pg.written && !p.seen.has(pg.slug);
    if (pg.written) p.seen.add(pg.slug);
    const method = methodOf(pg.slug);
    return h('li', { class: `su-page${pg.written ? ' is-written' : ''}${!pg.written && i === firstPending && !done ? ' is-next' : ''}${isNew ? ' is-new' : ''}` },
      h('span', { class: 'su-page-icon', 'aria-hidden': 'true' }),
      method ? h('span', { class: `http-tag http-tag--${method.toLowerCase()}` }, method.toUpperCase()) : h('span', {}),
      h('span', { class: 'su-page-title' }, pg.title),
      pg.written ? h('a', { href: pg.url, target: '_blank', rel: 'noopener' }, `${t().view} ↗`) : null);
  });

  const phaseIndex = done ? 3 : status.total ? 2 : 1;
  stage.replaceChildren(...[
    h('span', { class: 'su-kicker' }, t().phases[phaseIndex]),
    h('div', { class: 'su-status' },
      done ? h('span', { class: 'su-success', html: CHECK_LG }) : h('span', { class: 'su-spinner', 'aria-hidden': 'true' }),
      h('h1', {}, done ? t().readyTitle : t().buildingTitle)),
    h('p', { class: 'su-lead' }, done ? t().readyText(status.written, elapsed) : status.total ? t().writing : t().reading),
    h('div', { class: 'su-progress-head' },
      h('span', {}, status.total ? t().progress(status.written, status.total) : ''),
      h('span', {}, `${t().elapsed} `, h('span', { id: 'su-elapsed' }, elapsed))),
    h('div', {
      class: `su-progress${!done && !status.total ? ' is-waiting' : ''}`,
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct),
    }, h('i', { style: `width: ${!done && !status.total ? 32 : pct}%` })),
    done ? h('div', { class: 'su-done' },
      h('p', {}, t().nextSteps),
      h('a', { class: 'su-btn su-btn-primary su-btn-lg', href: '/' }, `${t().open} →`)) : null,
    rows.length ? h('ul', { class: 'su-pages' }, rows) : null,
  ].filter(Boolean));
}

// ===== Início =====

function onKey(e) {
  if ($('su-nav').hidden || e.altKey || e.ctrlKey || e.metaKey) return;
  const tag = e.target.tagName;
  const typing = tag === 'TEXTAREA' || (tag === 'INPUT' && !['radio', 'checkbox'].includes(e.target.type));
  if (e.key === 'Enter' && tag !== 'TEXTAREA' && tag !== 'BUTTON' && tag !== 'A' && tag !== 'SUMMARY') {
    e.preventDefault();
    next();
  } else if (e.key === 'Escape' && !typing) {
    back();
  } else if (/^[1-9]$/.test(e.key) && !typing) {
    const inputs = stage.querySelectorAll('.su-options input[type=radio]');
    const input = inputs[Number(e.key) - 1];
    if (input) { e.preventDefault(); input.click(); input.focus(); }
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  try { localStorage.setItem('rhyla-theme', nextTheme); } catch {}
}

async function start() {
  $('su-back').addEventListener('click', back);
  $('su-next').addEventListener('click', next);
  $('su-theme').addEventListener('click', toggleTheme);
  document.addEventListener('keydown', onKey);

  try {
    state.info = await (await fetch(API)).json();
  } catch {
    stage.replaceChildren(h('p', { class: 'su-error' }, 'Could not reach the Rhyla dev server.'));
    return;
  }
  const saved = state.info.preferences || {};
  const known = LANGUAGES.some(([name]) => name === saved.language);
  Object.assign(state.answers, {
    title: (state.info.site && state.info.site.title) || '',
    logo: (state.info.site && state.info.site.logo) || null,
    language: saved.language ? (known ? saved.language : 'other') : '',
    otherLanguage: saved.language && !known ? saved.language : '',
    mode: MODES.includes(saved.mode) ? saved.mode : 'balanced',
    flows: saved.flows === true,
    audience: AUDIENCES.includes(saved.audience) ? saved.audience : AUDIENCES[2],
    examples: Array.isArray(saved.examples) ? saved.examples.filter((x) => EXAMPLES.includes(x)) : ['curl'],
    notes: saved.notes || '',
  });
  state.ui = initialUi(saved.language);
  renderProject();

  // Recarregou a página depois de enviar: volta direto para o progresso
  if (state.info.agent && ['saved', 'building', 'done'].includes(state.info.phase)) {
    showProgress();
    return;
  }
  render();
}

start();
