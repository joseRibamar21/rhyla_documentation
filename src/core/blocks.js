/*
 * Markdown ⇄ blocos, usado pelo editor de páginas (navegador) e pelos testes (Node).
 * Sem dependências e sem APIs do Node: o mesmo arquivo é servido ao navegador.
 *
 * Bloco: { type, text?, indent, level?, checked?, number?, gap?, lang?, alt?, src?, rows?, align? }
 *   paragraph · heading (level 1-6) · bullet · numbered (number) · todo (checked) · quote
 *   code (lang) · divider · image (alt, src) · table (rows: string[][]) · raw (Markdown/HTML preservado)
 *
 * `indent` > 0 coloca o bloco dentro do item de lista anterior (como blocos filhos no Notion).
 * `gap` marca um item de lista precedido de linha em branco (lista "solta").
 * O texto guarda o Markdown inline do arquivo, para a ida e volta não mudar o que não foi editado.
 */

const FENCE = /^(\s*)(`{3,}|~{3,})\s*([^`\s]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const DIVIDER = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const HTML_START = /^\s{0,3}<\/?[a-zA-Z!]/;
const LIST_TYPES = new Set(['bullet', 'numbered', 'todo']);

const isBlank = (line) => !line.trim();
const indentOf = (line) => line.replace(/\t/g, '    ').match(/^ */)[0].length;
const dedent = (line, n) => line.replace(/\t/g, '    ').slice(Math.min(n, indentOf(line)));

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** Esta linha começa um bloco de outro tipo? (encerra parágrafos) */
function startsBlock(line, next) {
  return FENCE.test(line) || HEADING.test(line) || DIVIDER.test(line) || LIST.test(line)
    || QUOTE.test(line) || IMAGE.test(line.trim()) || HTML_START.test(line)
    || (line.trim().startsWith('|') && next !== undefined && TABLE_SEP.test(next));
}

/**
 * @param {string} markdown corpo da página (sem frontmatter)
 * @returns {Array<object>} blocos
 */
export function parseBlocks(markdown) {
  return parseLines(String(markdown || '').replace(/\r\n?/g, '\n').split('\n'), 0);
}

function parseLines(lines, baseIndent) {
  const blocks = [];
  // Coluna onde começa o conteúdo do último item de cada nível (para blocos filhos)
  const columns = [];
  let i = 0;
  let blankBefore = false;
  const push = (b) => {
    const block = { indent: baseIndent, ...b };
    if (blankBefore && blocks.length) block.gap = true;
    blocks.push(block);
    blankBefore = false;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; blankBefore = true; continue; }

    // Bloco de código cercado
    const fence = line.match(FENCE);
    if (fence && indentOf(line) < 4) {
      const marker = fence[2];
      const closing = new RegExp(`^\\s*\\${marker[0]}{${marker.length},}\\s*$`);
      const fenceIndent = indentOf(line); // o conteúdo perde a mesma indentação da cerca
      const body = [];
      i++;
      while (i < lines.length && !closing.test(lines[i])) { body.push(dedent(lines[i], fenceIndent)); i++; }
      i++;
      push({ type: 'code', lang: fence[3] || '', text: body.join('\n') });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading && indentOf(line) < 4) {
      push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (DIVIDER.test(line)) {
      push({ type: 'divider' });
      i++;
      continue;
    }

    const image = line.trim().match(IMAGE);
    if (image && indentOf(line) < 4) {
      push({ type: 'image', alt: image[1], src: image[2] });
      i++;
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const rows = [splitRow(line)];
      // Alinhamento das colunas pela linha separadora (:--, :-:, --:)
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : ''));
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i++; }
      const width = Math.max(...rows.map((r) => r.length));
      rows.forEach((r) => { while (r.length < width) r.push(''); });
      const table = { type: 'table', rows };
      if (align.some(Boolean)) table.align = align;
      push(table);
      continue;
    }

    const quote = line.match(QUOTE);
    if (quote) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].match(QUOTE)[1]); i++; }
      push({ type: 'quote', text: body.join('\n') });
      continue;
    }

    const list = line.match(LIST);
    if (list) {
      const [, spaces, marker, check] = list;
      const col = indentOf(spaces);
      // Nível: quantos itens abertos têm conteúdo começando antes desta coluna
      let level = 0;
      while (level < columns.length && columns[level] <= col) level++;
      columns.length = level;
      columns.push(col + marker.length + 1);

      const prev = blocks[blocks.length - 1];
      const type = check !== undefined ? 'todo' : /\d/.test(marker) ? 'numbered' : 'bullet';
      const block = { type, indent: baseIndent + level, text: list[4].replace(/\s+$/, (m) => (m.length >= 2 ? m : '')) };
      if (type === 'todo') block.checked = check.toLowerCase() === 'x';
      if (type === 'numbered') block.number = parseInt(marker, 10);
      if (blankBefore && prev && prev.indent >= baseIndent && (LIST_TYPES.has(prev.type) || prev.indent > baseIndent)) block.gap = true;
      i++;

      // Continuação do texto do item (linhas indentadas sem marcador)
      const content = [block.text];
      while (i < lines.length && !isBlank(lines[i]) && indentOf(lines[i]) > col && !LIST.test(lines[i]) && !FENCE.test(lines[i])) {
        content.push(lines[i].replace(/^\s+/, ''));
        i++;
      }
      block.text = content.join('\n');
      blocks.push(block);
      blankBefore = false;

      // Blocos filhos: tudo o que vem indentado até a coluna do conteúdo do item
      // (código, parágrafos, sublistas), com ou sem linha em branco antes
      const childCol = columns[columns.length - 1];
      const child = [];
      let k = i;
      while (k < lines.length) {
        if (isBlank(lines[k])) {
          let j = k;
          while (j < lines.length && isBlank(lines[j])) j++;
          if (j < lines.length && indentOf(lines[j]) >= childCol) { while (k < j) { child.push(''); k++; } continue; }
          break;
        }
        if (indentOf(lines[k]) < childCol) break;
        child.push(dedent(lines[k], childCol));
        k++;
      }
      if (child.length) {
        const nested = parseLines(child, block.indent + 1);
        if (nested.length && child[0] === '') nested[0].gap = true;
        blocks.push(...nested);
        i = k;
      }
      continue;
    }

    // HTML (ou outro conteúdo não reconhecido) até a próxima linha em branco: preservado como está
    if (HTML_START.test(line)) {
      const body = [];
      while (i < lines.length && !isBlank(lines[i])) { body.push(lines[i]); i++; }
      push({ type: 'raw', text: body.join('\n') });
      continue;
    }

    // Parágrafo (ou título "sublinhado": texto seguido de === ou ---)
    const body = [line.replace(/^\s+/, '')];
    i++;
    let setext = 0;
    while (i < lines.length && !isBlank(lines[i])) {
      if (/^\s{0,3}=+\s*$/.test(lines[i])) { setext = 1; i++; break; }
      if (/^\s{0,3}-+\s*$/.test(lines[i])) { setext = 2; i++; break; }
      if (startsBlock(lines[i], lines[i + 1])) break;
      body.push(lines[i].replace(/^\s+/, ''));
      i++;
    }
    if (setext) push({ type: 'heading', level: setext, text: body.join(' ').trim() });
    else push({ type: 'paragraph', text: body.join('\n').replace(/\s+$/, '') });
  }
  return blocks;
}

// Um parágrafo que começa como outro bloco seria lido errado na volta: escapa o primeiro caractere
function protectParagraph(text) {
  return String(text).split('\n').map((l) => {
    if (/^(#{1,6}\s|>|[-*+]\s|\d{1,9}[.)]\s|```|~~~)/.test(l) || DIVIDER.test(l)) {
      return l.replace(/^(\d{1,9})([.)])/, '$1\\$2').replace(/^([#>*+\-`~])/, '\\$1');
    }
    return l;
  }).join('\n');
}

const indentLines = (text, pad) => (pad ? text.split('\n').map((l) => (l ? pad + l : l)).join('\n') : text);

function serializeBlock(b) {
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(Math.min(Math.max(b.level || 1, 1), 6))} ${String(b.text || '').replace(/\n+/g, ' ')}`;
    case 'quote':
      return String(b.text || '').split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
    case 'code': {
      const text = String(b.text || '');
      const fence = /```/.test(text) ? '````' : '```';
      return `${fence}${b.lang || ''}\n${text}${text ? '\n' : ''}${fence}`;
    }
    case 'divider':
      return '---';
    case 'image':
      return `![${b.alt || ''}](${b.src || ''})`;
    case 'table': {
      const rows = (b.rows && b.rows.length ? b.rows : [['']]).map((r) => r.map((c) => String(c ?? '').replace(/\n+/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|')));
      const width = Math.max(1, ...rows.map((r) => r.length));
      const line = (r) => `| ${Array.from({ length: width }, (_, k) => r[k] || '').join(' | ')} |`;
      const align = b.align || [];
      const sep = Array.from({ length: width }, (_, k) => ({ left: ':---', center: ':---:', right: '---:' }[align[k]] || '---'));
      return [line(rows[0]), `| ${sep.join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
    }
    case 'raw':
      return String(b.text || '');
    default:
      return protectParagraph(b.text || '');
  }
}

/**
 * @param {Array<object>} blocks
 * @returns {string} markdown
 */
export function serializeBlocks(blocks) {
  const out = [];
  const columns = []; // coluna do conteúdo do item aberto em cada nível
  const numbers = []; // contador de lista numerada por nível
  let prev = null;

  for (const b of blocks || []) {
    const isList = LIST_TYPES.has(b.type);
    const indent = Math.max(0, Math.min(b.indent || 0, columns.length));
    const pad = ' '.repeat(indent ? columns[indent - 1] : 0);

    if (out.length) out.push(tightAfter(prev, b, indent) ? '\n' : '\n\n');

    if (isList) {
      let marker = '-';
      if (b.type === 'numbered') {
        const continues = prev && (prev.indent || 0) >= indent && numbers[indent] !== undefined && sameRun(prev, indent);
        numbers[indent] = continues ? numbers[indent] + 1 : (b.number || 1);
        marker = `${numbers[indent]}.`;
      } else {
        numbers[indent] = undefined;
      }
      if (b.type === 'todo') marker = `- [${b.checked ? 'x' : ' '}]`;
      const [first, ...rest] = String(b.text || '').split('\n');
      const textCol = pad.length + marker.length + 1;
      columns.length = indent;
      columns.push(pad.length + (b.type === 'todo' ? 2 : marker.length + 1));
      numbers.length = indent + 1;
      out.push(`${pad}${marker} ${first}${rest.map((r) => `\n${' '.repeat(textCol)}${r}`).join('')}`);
    } else {
      columns.length = indent;
      numbers.length = indent;
      out.push(indentLines(serializeBlock(b), pad));
    }
    prev = b;
  }
  return out.join('') + '\n';

  // Sem linha em branco entre `p` e `b`? (mantém listas "apertadas" e filhos colados ao item)
  function tightAfter(p, b, indent) {
    if (!p || b.gap) return false;
    const pi = p.indent || 0;
    if (LIST_TYPES.has(b.type)) return LIST_TYPES.has(p.type) || pi > indent;
    if (indent === 0) return false;
    // Parágrafo colado ao texto de um item viraria continuação do mesmo parágrafo
    if (b.type === 'paragraph') return pi >= indent && p.type !== 'paragraph' && !LIST_TYPES.has(p.type);
    return pi >= indent - 1;
  }

  // O item anterior no mesmo nível ainda faz parte da mesma lista numerada?
  function sameRun(p, indent) {
    return (p.indent || 0) > indent || (p.type === 'numbered' && (p.indent || 0) === indent);
  }
}
