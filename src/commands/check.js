import { checkDocs } from '../core/check.js';
import { DOCS_DIR } from '../core/config.js';

// Grupos na ordem em que aparecem; o título também vai nas anotações do GitHub
const GROUPS = {
  undocumented: 'Routes in the code without a page',
  stale: 'Pages of routes that are not in the code',
  invalid_api: 'Invalid api blocks',
  api_block: 'Problems in api blocks',
  no_api_block: 'Route pages without an api block',
  duplicate: 'Routes documented more than once',
  flow: 'Flows with broken steps',
  broken_link: 'Links to pages that do not exist',
};

// Explicação mostrada uma vez, abaixo do grupo
const HINTS = {
  undocumented: 'Write a page with an api block for each one, or add the route to check.ignore if it should stay out of the docs.',
  stale: 'Delete the page, or fix its method and path if the route moved.',
  no_api_block: `Without the block there is no generated reference, no request examples and no openapi.json entry (format in ${DOCS_DIR}/AGENTS.md).`,
};

// Comandos de workflow do GitHub Actions: viram anotações no PR, na linha do arquivo
const escapeData = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const escapeProperty = (s) => escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
export function githubAnnotation(level, issue) {
  const props = [
    issue.file && `file=${escapeProperty(issue.file)}`,
    issue.line && `line=${issue.line}`,
    `title=${escapeProperty(GROUPS[issue.type] || 'rhyla check')}`,
  ].filter(Boolean).join(',');
  return `::${level} ${props}::${escapeData(issue.message)}`;
}

function groups(issues) {
  return Object.keys(GROUPS).map((type) => [type, issues.filter((i) => i.type === type)]).filter(([, list]) => list.length);
}

/**
 * `rhyla check`: confere as páginas de rota com o código. Devolve o relatório com `passed`
 * (false se houver erros, ou avisos com --strict); o CLI sai com código 1 nesse caso.
 * @param {{ cwd?: string, ignore?: string[], strict?: boolean, json?: boolean, quiet?: boolean }} opts
 */
export default function check(opts = {}) {
  const report = checkDocs(opts.cwd || process.cwd(), { ignore: opts.ignore || [] });
  const passed = report.ok && !(opts.strict && report.warnings.length);
  if (opts.quiet) return { ...report, passed };
  if (opts.json) {
    process.stdout.write(JSON.stringify({ ...report, passed }, null, 2) + '\n');
    return { ...report, passed };
  }

  const log = console.log;
  const frameworks = report.frameworks.length ? ` (${report.frameworks.join(', ')})` : '';
  log(`🔎 Checking ${DOCS_DIR} against the code${frameworks}`);
  log(`   ${report.routes} routes in the code · ${report.documented} documented · ${report.endpoints} route pages`);
  const print = (icon, issues) => {
    for (const [type, list] of groups(issues)) {
      log(`\n${icon} ${GROUPS[type]} (${list.length})`);
      for (const issue of list) log(`   ${issue.message}`);
      if (HINTS[type]) log(`   → ${HINTS[type]}`);
    }
  };
  print('❌', report.errors);
  print('⚠️ ', report.warnings);
  for (const note of report.notes) log(`\nℹ️  ${note}`);

  const counts = `${report.errors.length} error${report.errors.length === 1 ? '' : 's'}, ${report.warnings.length} warning${report.warnings.length === 1 ? '' : 's'}`;
  log(passed ? `\n✅ The docs match the code (${counts})` : `\n❌ ${counts}${report.ok ? ' (--strict: warnings fail the check)' : ''}`);
  if (report.errors.some((e) => e.type === 'undocumented')) {
    log(`   check.ignore goes in ${DOCS_DIR}/config.json: "check": { "ignore": ["GET /health", "/internal/*"] }`);
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const issue of report.errors) log(githubAnnotation('error', issue));
    for (const issue of report.warnings) log(githubAnnotation('warning', issue));
  }
  return { ...report, passed };
}
