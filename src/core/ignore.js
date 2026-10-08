/**
 * Cria um matcher para os padrões de `build_ignore` (relativos a body/).
 * Suporta nomes simples ("drafts"), caminhos ("guide/old") e curingas ("*.draft.md").
 * @param {string[]} patterns
 * @returns {(relPosix: string) => boolean}
 */
export function createIgnoreMatcher(patterns = []) {
  const normalized = patterns
    .map((p) => String(p).replace(/^\/+|\/+$/g, '').toLowerCase())
    .filter(Boolean);

  const names = new Set(normalized.filter((p) => !p.includes('/') && !p.includes('*')));
  const prefixes = normalized.filter((p) => !p.includes('*'));
  const regexes = normalized
    .filter((p) => p.includes('*') || p.includes('/'))
    .map((p) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'));

  return function isIgnored(relPosix) {
    if (!relPosix) return false;
    const rel = relPosix.toLowerCase();
    const segments = rel.split('/');
    // Um nome simples ignora qualquer arquivo/pasta com esse nome em qualquer nível
    if (segments.some((s) => names.has(s))) return true;
    if (prefixes.some((p) => rel === p || rel.startsWith(p + '/'))) return true;
    return regexes.some((rx) => rx.test(rel));
  };
}
