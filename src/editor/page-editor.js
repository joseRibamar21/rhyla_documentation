/* Editor de páginas do Rhyla (estilo Notion). Roda só no `rhyla dev`. Sem dependências. */
import { parseBlocks, serializeBlocks } from '/__rhyla/editor/blocks.js';

const API = '/__rhyla/api';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const LIST_TYPES = new Set(['bullet', 'numbered', 'todo']);
const TEXT_TYPES = new Set(['paragraph', 'heading', 'bullet', 'numbered', 'todo', 'quote']);
let uid = 0;
const newId = () => `b${++uid}`;

// =====================================================================
// Markdown inline ⇄ HTML editável
// Só o que o editor entende vira formatação (negrito, itálico, código, riscado, link);
// o resto (imagens inline, HTML, autolinks) vira um "chip" que guarda o Markdown original.
// =====================================================================

const chip = (md) => `<span class="pe-chip" contenteditable="false" data-md="${esc(md)}">${esc(md.length > 40 ? md.slice(0, 38) + '…' : md)}</span>`;

export function inlineToHtml(src) {
  const s = String(src || '');
  let out = '';
  let i = 0;
  const rest = () => s.slice(i);
  while (i < s.length) {
    const c = s[i];
    if (c === '\\' && /[!-/:-@[-`{-~]/.test(s[i + 1] || '')) { out += esc(s[i + 1]); i += 2; continue; }
    if (c === '`') {
      let n = 0;
      while (s[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      let end = s.indexOf(fence, i + n);
      while (end !== -1 && s[end + n] === '`') end = s.indexOf(fence, end + n + 1);
      if (end > -1) { out += `<code>${esc(s.slice(i + n, end).replace(/^ (.*) $/, '$1'))}</code>`; i = end + n; continue; }
      out += esc(fence); i += n; continue;
    }
    if (c === '!' && s[i + 1] === '[') {
      const m = rest().match(/^!\[[^\]]*\]\([^)]*\)/);
      if (m) { out += chip(m[0]); i += m[0].length; continue; }
    }
    if (c === '[') {
      const m = rest().match(/^\[((?:[^[\]\\]|\\.|\[[^\]]*\])*)\]\(([^()\s]*(?:\([^)]*\))?[^()\s]*)(\s+"[^"]*")?\)/);
      if (m && !m[3]) { out += `<a href="${esc(m[2])}">${inlineToHtml(m[1])}</a>`; i += m[0].length; continue; }
      if (m) { out += chip(m[0]); i += m[0].length; continue; }
    }
    if (c === '<') {
      const m = rest().match(/^<(?:https?:\/\/[^>\s]+|mailto:[^>\s]+|\/?[a-zA-Z][^>]*|!--[\s\S]*?--)>/);
      if (m) { out += chip(m[0]); i += m[0].length; continue; }
    }
    if ((c === '*' || c === '_') && s[i + 1] === c) {
      const d = c + c;
      const end = s.indexOf(d, i + 2);
      if (end > i + 2 && s[i + 2] !== ' ' && s[end - 1] !== ' ') { out += `<strong>${inlineToHtml(s.slice(i + 2, end))}</strong>`; i = end + 2; continue; }
    }
    if (c === '~' && s[i + 1] === '~') {
      const end = s.indexOf('~~', i + 2);
      if (end > i + 2) { out += `<s>${inlineToHtml(s.slice(i + 2, end))}</s>`; i = end + 2; continue; }
    }
    if ((c === '*' || c === '_') && s[i + 1] && s[i + 1] !== ' ' && s[i + 1] !== c && !(c === '_' && /\w/.test(s[i - 1] || ''))) {
      let end = i + 1;
      while ((end = s.indexOf(c, end)) !== -1) {
        const ok = s[end - 1] !== ' ' && s[end + 1] !== c && s[end - 1] !== c && !(c === '_' && /\w/.test(s[end + 1] || ''));
        if (ok) break;
        end++;
      }
      if (end > i + 1) { out += `<em>${inlineToHtml(s.slice(i + 1, end))}</em>`; i = end + 1; continue; }
    }
    if (c === '\n') {
      const hard = / {2,}$/.test(s.slice(0, i)) || out.endsWith('\\');
      if (hard) out = out.replace(/(?: |&nbsp;)+$|\\$/, '');
      out += hard ? '<br data-hard="1">' : '<br>';
      i++;
      continue;
    }
    out += esc(c);
    i++;
  }
  // Um <br> no fim não aparece no contenteditable sem um segundo
  return /<br[^>]*>$/.test(out) ? out + '<br data-tail="1">' : out;
}

function escapeText(t) {
  return t
    .replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\')
    .replace(/([*`])/g, '\\$1')
    .replace(/~~/g, '\\~\\~')
    .replace(/(^|[^\w\\])_|_(?=[^\w]|$)/g, (m) => m.replace('_', '\\_'))
    .replace(/\[(?=[^\]]*\]\()/g, '\\[')
    .replace(/<(?=[a-zA-Z/!])/g, '\\<');
}

function wrapMark(marker, inner) {
  if (!inner.trim()) return inner;
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  return `${lead}${marker}${inner.trim()}${marker}${trail}`;
}

function codeSpan(text) {
  const runs = text.match(/`+/g) || [];
  const n = runs.reduce((m, r) => Math.max(m, r.length), 0) + 1;
  const fence = '`'.repeat(n);
  const pad = /^`|`$/.test(text) ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

export function htmlToInline(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += escapeText(n.nodeValue.replace(/ /g, ' ').replace(/​/g, '')); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    if (n.hasAttribute('data-md')) out += n.getAttribute('data-md');
    else if (tag === 'br') { if (!n.hasAttribute('data-tail')) out += n.hasAttribute('data-hard') ? '  \n' : '\n'; }
    else if (tag === 'strong' || tag === 'b') out += wrapMark('**', htmlToInline(n));
    else if (tag === 'em' || tag === 'i') out += wrapMark('*', htmlToInline(n));
    else if (tag === 's' || tag === 'del' || tag === 'strike') out += wrapMark('~~', htmlToInline(n));
    else if (tag === 'code') out += codeSpan(n.textContent);
    else if (tag === 'a') out += `[${htmlToInline(n)}](${(n.getAttribute('href') || '').replace(/\s/g, '%20')})`;
    else if (tag === 'div' || tag === 'p') { if (out && !out.endsWith('\n')) out += '\n'; out += htmlToInline(n); }
    else out += htmlToInline(n);
  });
  return out;
}

// =====================================================================
// Estado
// =====================================================================

let page = null;        // { slug, url, data, isFlow }
let blocks = [];        // blocos (ver src/core/blocks.js) + { id, edited }
let dirty = false;
let saving = false;
let saveTimer;
const past = [];

const byId = (id) => blocks.find((b) => b.id === id);
const indexOf = (id) => blocks.findIndex((b) => b.id === id);
const el = (id) => document.querySelector(`.pe-block[data-id="${id}"]`);
const textEl = (id) => el(id) && el(id).querySelector('.pe-text, .pe-codetext');

function makeBlock(type, extra = {}) {
  const b = { id: newId(), type, indent: 0, text: '', edited: true, ...extra };
  if (type === 'heading' && !b.level) b.level = 2;
  if (type === 'table' && !b.rows) b.rows = [['Column', 'Column'], ['', '']];
  if (type === 'code' && b.lang === undefined) b.lang = '';
  return b;
}

/** Copia para o modelo o texto que está no DOM (blocos editados). */
function syncFromDom() {
  for (const b of blocks) {
    const node = el(b.id);
    if (!node || !b.edited) continue;
    if (TEXT_TYPES.has(b.type)) b.text = htmlToInline(node.querySelector('.pe-text')).replace(/\s+$/, (m) => (m.includes('\n') ? '' : m));
    else if (b.type === 'code') { b.text = node.querySelector('.pe-codetext').innerText.replace(/\n$/, ''); b.lang = node.querySelector('.pe-lang').value.trim(); }
    else if (b.type === 'raw') b.text = node.querySelector('.pe-rawtext').value;
    else if (b.type === 'image') { b.alt = node.querySelector('[data-field="alt"]').value; b.src = node.querySelector('[data-field="src"]').value.trim(); }
    else if (b.type === 'table') b.rows = [...node.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('.pe-cell')].map((c) => htmlToInline(c).replace(/\n+/g, ' ').trim()));
  }
}

function currentMarkdown() {
  syncFromDom();
  return serializeBlocks(blocks.map(({ id, edited, ...b }) => b));
}

function snapshot() { syncFromDom(); past.push(JSON.stringify(blocks)); if (past.length > 100) past.shift(); $('pe-undo').disabled = false; }
function undo() {
  if (!past.length) return;
  blocks = JSON.parse(past.pop());
  $('pe-undo').disabled = !past.length;
  render();
  changed();
}

// =====================================================================
// Renderização
// =====================================================================

const PLACEHOLDER = { paragraph: "Type '/' for commands", heading: 'Heading', bullet: 'List', numbered: 'List', todo: 'To-do', quote: 'Quote' };

function numberFor(i) {
  const b = blocks[i];
  let n = b.number || 1;
  // Continua a contagem do item numerado anterior no mesmo nível
  for (let k = i - 1; k >= 0; k--) {
    const p = blocks[k];
    if ((p.indent || 0) > (b.indent || 0)) continue;
    if (p.type === 'numbered' && (p.indent || 0) === (b.indent || 0)) { n = numberFor(k) + 1; }
    break;
  }
  return n;
}

function blockHtml(b, i) {
  const gutter = '<div class="pe-gutter" contenteditable="false"><button class="pe-add" title="Add block below" tabindex="-1">+</button><button class="pe-handle" draggable="true" title="Drag to move · click for options" tabindex="-1">⋮⋮</button></div>';
  const text = (extra = '') => `<div class="pe-text${extra}" contenteditable="true" spellcheck="true" data-placeholder="${esc(PLACEHOLDER[b.type] || '')}">${inlineToHtml(b.text)}</div>`;
  let body = '';
  switch (b.type) {
    case 'heading': body = text(` pe-h${Math.min(b.level || 2, 3)}`); break;
    case 'bullet': body = `<span class="pe-marker" contenteditable="false">${['•', '◦', '▪'][(b.indent || 0) % 3]}</span>${text()}`; break;
    case 'numbered': body = `<span class="pe-marker" contenteditable="false">${numberFor(i)}.</span>${text()}`; break;
    case 'todo': body = `<input type="checkbox" class="pe-check"${b.checked ? ' checked' : ''} tabindex="-1">${text()}`; break;
    case 'quote': body = text(); break;
    case 'code': body = `<div class="pe-code-wrap"><input class="pe-lang" value="${esc(b.lang)}" placeholder="language" spellcheck="false"><pre class="pe-codetext" contenteditable="true" spellcheck="false">${esc(b.text)}</pre></div>`; break;
    case 'divider': body = '<hr>'; break;
    case 'image': body = `<div class="pe-image-wrap">${b.src ? `<img src="${esc(b.src)}" alt="${esc(b.alt)}">` : '<div class="pe-image-empty" data-action="upload">Click to upload an image, or drop a file here</div>'}<div class="pe-image-fields"><input data-field="alt" value="${esc(b.alt)}" placeholder="Alt text (describe the image)"><input data-field="src" value="${esc(b.src)}" placeholder="/public/… or https://…"></div></div>`; break;
    case 'table': body = `<div class="pe-table-wrap"><table class="pe-grid">${(b.rows || [['']]).map((r) => `<tr>${r.map((c) => `<td><div class="pe-cell" contenteditable="true">${inlineToHtml(c)}</div></td>`).join('')}</tr>`).join('')}</table><div class="pe-table-tools"><button data-table="row+">+ Row</button><button data-table="col+">+ Column</button><button data-table="row-">− Row</button><button data-table="col-">− Column</button></div></div>`; break;
    case 'raw': body = `<div class="pe-raw-wrap"><span class="pe-raw-label">HTML / Markdown</span><textarea class="pe-rawtext" spellcheck="false">${esc(b.text)}</textarea></div>`; break;
    default: body = text();
  }
  const cls = `pe-block pe-${b.type}${b.type === 'todo' && b.checked ? ' is-checked' : ''}`;
  return `<div class="${cls}" data-id="${b.id}" style="--indent:${b.indent || 0}"${b.type === 'divider' ? ' tabindex="0"' : ''}>${gutter}<div class="pe-body">${body}</div></div>`;
}

function render() {
  $('pe-blocks').innerHTML = blocks.map(blockHtml).join('');
  document.querySelectorAll('.pe-rawtext').forEach(autosize);
  updateMarkdownPanel();
}

function rerender(focusId, offset) {
  render();
  if (focusId) focusBlock(focusId, offset);
}

function autosize(t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }

// =====================================================================
// Cursor
// =====================================================================

function caretOffset(node) {
  const sel = getSelection();
  if (!sel.rangeCount || !node.contains(sel.anchorNode)) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(node);
  r.setEnd(sel.anchorNode, sel.anchorOffset);
  return r.toString().length;
}

function setCaret(node, offset) {
  node.focus();
  const sel = getSelection();
  const range = document.createRange();
  if (offset === 'end' || offset == null) { range.selectNodeContents(node); range.collapse(false); }
  else {
    let remaining = offset;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t;
    let placed = false;
    while ((t = walker.nextNode())) {
      if (remaining <= t.length) { range.setStart(t, remaining); placed = true; break; }
      remaining -= t.length;
    }
    if (!placed) { range.selectNodeContents(node); range.collapse(false); } else range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

function focusBlock(id, offset = 'end') {
  const node = el(id);
  if (!node) return;
  const t = node.querySelector('.pe-text, .pe-codetext, .pe-cell, .pe-rawtext, input[data-field]');
  if (!t) { node.focus(); return; }
  if (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT') { t.focus(); return; }
  setCaret(t, offset);
}

const atStart = (node) => { const s = getSelection(); return s.isCollapsed && caretOffset(node) === 0; };
const atEnd = (node) => { const s = getSelection(); return s.isCollapsed && caretOffset(node) >= node.textContent.length; };

function caretLine(node) {
  const sel = getSelection();
  if (!sel.rangeCount) return { first: true, last: true };
  const r = sel.getRangeAt(0).getBoundingClientRect();
  const box = node.getBoundingClientRect();
  if (!r.height) return { first: atStart(node), last: atEnd(node) };
  const lh = parseFloat(getComputedStyle(node).lineHeight) || 24;
  return { first: r.top - box.top < lh * 0.8, last: box.bottom - r.bottom < lh * 0.8 };
}

// =====================================================================
// Mudanças e salvamento automático
// =====================================================================

function setStatus(text, isError) {
  const s = $('pe-status');
  s.textContent = text;
  s.classList.toggle('is-error', Boolean(isError));
}

function changed() {
  dirty = true;
  setStatus('Unsaved changes');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 900);
  updateMarkdownPanel();
}

async function save() {
  clearTimeout(saveTimer);
  if (!page || saving) { if (saving) saveTimer = setTimeout(save, 400); return; }
  saving = true;
  setStatus('Saving…');
  const markdown = currentMarkdown();
  dirty = false;
  try {
    const res = await fetch(`${API}/page`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: page.slug,
        markdown,
        data: { title: $('pe-title').value, description: $('pe-description').value, order: $('pe-order').value },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Save failed');
    setStatus(dirty ? 'Unsaved changes' : 'Saved');
  } catch (e) {
    dirty = true;
    setStatus(e.message, true);
  } finally {
    saving = false;
  }
}

let mdTimer;
function updateMarkdownPanel() {
  if ($('pe-md').hidden) return;
  clearTimeout(mdTimer);
  mdTimer = setTimeout(() => { $('pe-md-text').textContent = currentMarkdown(); }, 150);
}

let toastTimer;
function toast(msg, isError) {
  const t = $('pe-toast');
  t.textContent = msg;
  t.classList.toggle('error', Boolean(isError));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 4000 : 1800);
}

// =====================================================================
// Operações com blocos
// =====================================================================

/** Bloco + filhos (blocos seguintes mais indentados). */
function familyRange(i) {
  const base = blocks[i].indent || 0;
  let end = i + 1;
  while (end < blocks.length && (blocks[end].indent || 0) > base) end++;
  return [i, end];
}

/** Garante indentação válida: só se aninha dentro de itens de lista. */
function normalize() {
  blocks.forEach((b, i) => {
    const prev = blocks[i - 1];
    const max = !prev ? 0 : LIST_TYPES.has(prev.type) ? (prev.indent || 0) + 1 : (prev.indent || 0);
    if ((b.indent || 0) > max) b.indent = max;
    if (b.indent < 0) b.indent = 0;
  });
}

function insertAfter(id, block, { focus = true } = {}) {
  snapshot();
  const i = id ? indexOf(id) : blocks.length - 1;
  if (id) {
    const ref = blocks[i];
    block.indent = block.indent ?? ref.indent ?? 0;
    if (block.indent === 0 && ref.indent && (LIST_TYPES.has(block.type) || LIST_TYPES.has(ref.type))) block.indent = ref.indent;
  }
  blocks.splice(i + 1, 0, block);
  normalize();
  rerender(focus ? block.id : null, 0);
  changed();
  return block;
}

function removeBlock(id, focusPrev = true) {
  const i = indexOf(id);
  if (i < 0) return;
  snapshot();
  blocks.splice(i, 1);
  if (!blocks.length) blocks.push(makeBlock('paragraph'));
  normalize();
  const target = blocks[Math.max(0, i - (focusPrev ? 1 : 0))];
  rerender(target && target.id, 'end');
  changed();
}

function convert(id, type, extra = {}) {
  syncFromDom();
  snapshot();
  const b = byId(id);
  const wasText = TEXT_TYPES.has(b.type);
  const plain = el(id) && el(id).querySelector('.pe-text') ? el(id).querySelector('.pe-text').textContent : b.text;
  if (type === 'divider' || type === 'image' || type === 'table') {
    // Blocos sem texto: substituem um bloco vazio, senão entram logo abaixo
    const fresh = makeBlock(type, extra);
    fresh.indent = b.indent;
    if (wasText && !plain.trim()) blocks.splice(indexOf(id), 1, fresh);
    else blocks.splice(indexOf(id) + 1, 0, fresh);
    if (type === 'divider') {
      const after = makeBlock('paragraph', { indent: fresh.indent });
      blocks.splice(indexOf(fresh.id) + 1, 0, after);
      normalize();
      rerender(after.id, 0);
    } else { normalize(); rerender(fresh.id); }
    changed();
    return;
  }
  b.type = type;
  delete b.number;
  if (type === 'heading') b.level = extra.level || 2; else delete b.level;
  if (type === 'todo') b.checked = Boolean(b.checked); else delete b.checked;
  if (type === 'code') { b.text = plain; b.lang = b.lang || ''; }
  else if (type === 'raw') b.text = wasText ? plain : b.text;
  else if (!wasText) b.text = b.text || '';
  b.edited = true;
  normalize();
  rerender(id, 'end');
  changed();
}

function duplicate(id) {
  syncFromDom();
  snapshot();
  const [s, e] = familyRange(indexOf(id));
  const copy = blocks.slice(s, e).map((b) => ({ ...JSON.parse(JSON.stringify(b)), id: newId(), edited: true }));
  blocks.splice(e, 0, ...copy);
  rerender(copy[0].id);
  changed();
}

function move(id, dir) {
  syncFromDom();
  const i = indexOf(id);
  const [s, e] = familyRange(i);
  if (dir < 0 && s === 0) return;
  if (dir > 0 && e >= blocks.length) return;
  snapshot();
  const group = blocks.splice(s, e - s);
  let at;
  if (dir < 0) {
    // Pula o irmão anterior inteiro (com os filhos dele)
    at = s - 1;
    while (at > 0 && (blocks[at].indent || 0) > (group[0].indent || 0)) at--;
  } else {
    const [, ne] = familyRange(s);
    at = ne;
  }
  blocks.splice(at, 0, ...group);
  normalize();
  rerender(id);
  changed();
}

function indent(id, delta) {
  syncFromDom();
  const i = indexOf(id);
  if (delta > 0 && i === 0) return;
  snapshot();
  const [s, e] = familyRange(i);
  for (let k = s; k < e; k++) blocks[k].indent = Math.max(0, (blocks[k].indent || 0) + delta);
  normalize();
  const off = textEl(id) ? caretOffset(textEl(id)) : 'end';
  rerender(id, off);
  changed();
}

// =====================================================================
// Menu "/" e menu do bloco
// =====================================================================

const COMMANDS = [
  { type: 'paragraph', label: 'Text', hint: 'Plain paragraph', icon: 'T', keys: 'text paragraph p' },
  { type: 'heading', level: 1, label: 'Heading 1', hint: 'Big section title', icon: 'H1', keys: 'h1 heading title' },
  { type: 'heading', level: 2, label: 'Heading 2', hint: 'Medium section title', icon: 'H2', keys: 'h2 heading subtitle' },
  { type: 'heading', level: 3, label: 'Heading 3', hint: 'Small section title', icon: 'H3', keys: 'h3 heading' },
  { type: 'bullet', label: 'Bulleted list', hint: 'Simple list', icon: '•', keys: 'bullet list ul unordered' },
  { type: 'numbered', label: 'Numbered list', hint: 'List with numbers', icon: '1.', keys: 'numbered list ol ordered' },
  { type: 'todo', label: 'To-do list', hint: 'Track tasks with checkboxes', icon: '☐', keys: 'todo task check checkbox' },
  { type: 'quote', label: 'Quote', hint: 'Highlight a note or citation', icon: '❝', keys: 'quote blockquote callout note' },
  { type: 'code', label: 'Code', hint: 'Code block with language', icon: '</>', keys: 'code snippet pre' },
  { type: 'table', label: 'Table', hint: 'Rows and columns', icon: '▦', keys: 'table grid' },
  { type: 'image', label: 'Image', hint: 'Upload or link an image', icon: '🖼', keys: 'image picture photo img' },
  { type: 'divider', label: 'Divider', hint: 'Horizontal line', icon: '—', keys: 'divider hr line separator' },
  { type: 'raw', label: 'HTML / Markdown', hint: 'Raw content, kept as written', icon: '#', keys: 'html raw markdown embed' },
];

let menu = null; // { mode: 'slash' | 'block', id, items, index, query, startOffset }

function openMenu(state, anchorRect) {
  menu = { index: 0, query: '', ...state };
  renderMenu();
  const m = $('pe-menu');
  m.hidden = false;
  const h = m.offsetHeight;
  const below = anchorRect.bottom + 6;
  const top = below + h > innerHeight - 8 ? Math.max(8, anchorRect.top - h - 6) : below;
  m.style.top = `${top}px`;
  m.style.left = `${Math.min(anchorRect.left, innerWidth - m.offsetWidth - 8)}px`;
}

function closeMenu() { menu = null; $('pe-menu').hidden = true; }

function menuItems() {
  if (menu.mode === 'slash') {
    const q = fold(menu.query);
    return COMMANDS.filter((c) => !q || fold(c.label).includes(q) || c.keys.includes(q)).map((c) => ({ ...c, kind: 'convert' }));
  }
  const b = byId(menu.id);
  const turn = COMMANDS.filter((c) => TEXT_TYPES.has(c.type) || c.type === 'code').map((c) => ({ ...c, kind: 'convert' }));
  return [
    { title: 'Turn into' }, ...turn,
    { sep: true },
    { kind: 'action', action: 'duplicate', label: 'Duplicate', icon: '⧉', hint: 'Ctrl+D' },
    { kind: 'action', action: 'up', label: 'Move up', icon: '↑', hint: 'Ctrl+Shift+↑' },
    { kind: 'action', action: 'down', label: 'Move down', icon: '↓', hint: 'Ctrl+Shift+↓' },
    ...(b && (b.indent || 0) > 0 ? [{ kind: 'action', action: 'outdent', label: 'Outdent', icon: '⇤', hint: 'Shift+Tab' }] : []),
    { kind: 'action', action: 'indent', label: 'Indent', icon: '⇥', hint: 'Tab (inside lists)' },
    { sep: true },
    { kind: 'action', action: 'delete', label: 'Delete', icon: '🗑', hint: 'Del', danger: true },
  ];
}

function renderMenu() {
  const items = menuItems();
  menu.items = items;
  const selectable = items.filter((it) => it.kind);
  if (menu.index >= selectable.length) menu.index = Math.max(0, selectable.length - 1);
  let k = -1;
  $('pe-menu').innerHTML = (menu.mode === 'slash' ? '<div class="pe-menu-title">Blocks</div>' : '') + (selectable.length ? items.map((it) => {
    if (it.title) return `<div class="pe-menu-title">${esc(it.title)}</div>`;
    if (it.sep) return '<div class="pe-menu-sep"></div>';
    k++;
    return `<div class="pe-menu-item${k === menu.index ? ' is-active' : ''}${it.danger ? ' is-danger' : ''}" data-k="${k}" role="option"><span class="pe-menu-icon">${esc(it.icon)}</span><span>${esc(it.label)}<small>${esc(it.hint || '')}</small></span></div>`;
  }).join('') : '<div class="pe-menu-empty">No matching blocks</div>');
  const active = $('pe-menu').querySelector('.is-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function chooseMenu(k) {
  const item = menu.items.filter((it) => it.kind)[k];
  if (!item) return;
  const { id, mode } = menu;
  closeMenu();
  if (mode === 'slash') {
    // Remove o "/consulta" digitado antes de converter
    const t = textEl(id);
    if (t) {
      const text = t.textContent;
      const start = text.lastIndexOf('/', caretOffset(t));
      if (start >= 0) { deleteTextRange(t, start, caretOffset(t)); byId(id).edited = true; }
    }
  }
  if (item.kind === 'convert') {
    if (item.type === 'image') { convert(id, 'image'); return; }
    convert(id, item.type, { level: item.level });
    return;
  }
  ({
    duplicate: () => duplicate(id),
    up: () => move(id, -1),
    down: () => move(id, 1),
    indent: () => indent(id, 1),
    outdent: () => indent(id, -1),
    delete: () => removeBlock(id),
  })[item.action]();
}

function deleteTextRange(node, from, to) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let pos = 0;
  let t;
  let started = false;
  while ((t = walker.nextNode())) {
    if (!started && from <= pos + t.length) { range.setStart(t, from - pos); started = true; }
    if (started && to <= pos + t.length) { range.setEnd(t, to - pos); break; }
    pos += t.length;
  }
  if (started) range.deleteContents();
}

$('pe-menu').addEventListener('mousedown', (e) => e.preventDefault()); // não tira o foco do bloco
$('pe-menu').addEventListener('click', (e) => {
  const item = e.target.closest('[data-k]');
  if (item) chooseMenu(Number(item.getAttribute('data-k')));
});

// =====================================================================
// Atalhos de Markdown ao digitar (# , - , 1. , [] , > , ```, ---)
// =====================================================================

const SHORTCUTS = [
  [/^#\s$/, 'heading', { level: 1 }], [/^##\s$/, 'heading', { level: 2 }], [/^###\s$/, 'heading', { level: 3 }],
  [/^[-*+]\s$/, 'bullet'], [/^1[.)]\s$/, 'numbered'], [/^\[\s?\]\s$/, 'todo'], [/^>\s$/, 'quote'],
  [/^```$/, 'code'], [/^---$/, 'divider'],
];

function tryShortcut(b, t) {
  if (b.type !== 'paragraph' && !(b.type === 'bullet' && /^\[\s?\]\s$/.test(t.textContent))) return false;
  const text = t.textContent.replace(/ /g, ' ');
  for (const [rx, type, extra] of SHORTCUTS) {
    if (rx.test(text)) {
      t.innerHTML = '';
      b.text = '';
      convert(b.id, type, extra);
      return true;
    }
  }
  return false;
}

// Formatação ao digitar: **negrito**, *itálico*, `código`, ~~riscado~~ viram formatação ao fechar
const INLINE_RULES = [
  { rx: /(\*\*|__)([^*_\s](?:[^*_]*[^*_\s])?)\1$/, tag: 'strong', wrap: (m) => [m[1] + m[2] + m[1], m[2]] },
  { rx: /~~([^~\s](?:[^~]*[^~\s])?)~~$/, tag: 's', wrap: (m) => [`~~${m[1]}~~`, m[1]] },
  { rx: /`([^`]+)`$/, tag: 'code', wrap: (m) => [`\`${m[1]}\``, m[1]] },
  { rx: /(?:^|[^*\w])\*([^*\s](?:[^*]*[^*\s])?)\*$/, tag: 'em', wrap: (m) => [`*${m[1]}*`, m[1]] },
  { rx: /(?:^|[^_\w])_([^_\s](?:[^_]*[^_\s])?)_$/, tag: 'em', wrap: (m) => [`_${m[1]}_`, m[1]] },
];

function autoFormat() {
  const sel = getSelection();
  if (!sel.isCollapsed || !sel.anchorNode || sel.anchorNode.nodeType !== 3) return false;
  const node = sel.anchorNode;
  if (node.parentElement.closest('code')) return false;
  const before = node.nodeValue.slice(0, sel.anchorOffset);
  for (const rule of INLINE_RULES) {
    const m = before.match(rule.rx);
    if (!m) continue;
    const [full, inner] = rule.wrap(m);
    const range = document.createRange();
    range.setStart(node, sel.anchorOffset - full.length);
    range.setEnd(node, sel.anchorOffset);
    range.deleteContents();
    const elx = document.createElement(rule.tag);
    elx.textContent = inner;
    range.insertNode(elx);
    // Cursor logo depois, fora da formatação
    const after = document.createTextNode('\u200b');
    elx.after(after);
    sel.collapse(after, 1);
    return true;
  }
  return false;
}

// =====================================================================
// Eventos dos blocos
// =====================================================================

const blocksEl = $('pe-blocks');

blocksEl.addEventListener('input', (e) => {
  const node = e.target.closest('.pe-block');
  if (!node) return;
  const b = byId(node.dataset.id);
  b.edited = true;
  if (e.target.classList.contains('pe-rawtext')) autosize(e.target);
  if ((e.target.classList.contains('pe-text') || e.target.classList.contains('pe-cell')) && e.inputType === 'insertText' && /[*_`~]/.test(e.data || '')) autoFormat();
  if (e.target.classList.contains('pe-text')) {
    const t = e.target;
    if (!t.textContent && t.innerHTML !== '') t.innerHTML = '';
    if (tryShortcut(b, t)) return;
    // Menu "/" acompanha o que é digitado depois da barra
    const off = caretOffset(t);
    const before = t.textContent.slice(0, off);
    const slash = before.match(/(^|\s)\/([\w\s-]{0,20})$/);
    if (slash) {
      const query = slash[2];
      if (!menu || menu.mode !== 'slash') {
        const r = getSelection().getRangeAt(0).getBoundingClientRect();
        openMenu({ mode: 'slash', id: b.id, query }, r.height ? r : t.getBoundingClientRect());
      } else { menu.query = query; menu.index = 0; renderMenu(); }
      // Nenhum comando combina (ex.: digitando um caminho "/guide"): fecha o menu
      if (!menu.items.some((it) => it.kind)) closeMenu();
    } else if (menu && menu.mode === 'slash') closeMenu();
  }
  if (e.target.matches('[data-field="src"]')) {
    const img = node.querySelector('img');
    if (img) img.src = e.target.value; else if (e.target.value.trim()) { syncFromDom(); rerender(b.id); }
  }
  changed();
});

blocksEl.addEventListener('change', (e) => {
  if (!e.target.classList.contains('pe-check')) return;
  const b = byId(e.target.closest('.pe-block').dataset.id);
  snapshot();
  b.checked = e.target.checked;
  e.target.closest('.pe-block').classList.toggle('is-checked', b.checked);
  changed();
});

blocksEl.addEventListener('keydown', (e) => {
  const node = e.target.closest('.pe-block');
  if (!node) return;
  const id = node.dataset.id;
  const b = byId(id);
  const mod = e.metaKey || e.ctrlKey;

  if (menu) {
    const count = menu.items.filter((it) => it.kind).length;
    if (e.key === 'ArrowDown') { e.preventDefault(); menu.index = (menu.index + 1) % Math.max(count, 1); renderMenu(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); menu.index = (menu.index - 1 + count) % Math.max(count, 1); renderMenu(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseMenu(menu.index); return; }
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
  }

  // Atalhos que valem em qualquer bloco
  if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(id, e.key === 'ArrowUp' ? -1 : 1); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(id); return; }

  if (b.type === 'divider' && e.target === node) {
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlock(id); }
    else if (e.key === 'Enter') { e.preventDefault(); insertAfter(id, makeBlock('paragraph')); }
    return;
  }

  const t = e.target;
  if (t.classList.contains('pe-codetext')) {
    if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
    if (e.key === 'Enter' && (mod || e.shiftKey)) { e.preventDefault(); insertAfter(id, makeBlock('paragraph')); return; }
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertText', false, '\n'); return; }
    if (e.key === 'Backspace' && !t.textContent) { e.preventDefault(); convert(id, 'paragraph'); return; }
    if (e.key === 'ArrowUp' && caretLine(t).first) { const p = blocks[indexOf(id) - 1]; if (p) { e.preventDefault(); focusBlock(p.id); } }
    if (e.key === 'ArrowDown' && caretLine(t).last) { const n = blocks[indexOf(id) + 1]; if (n) { e.preventDefault(); focusBlock(n.id, 0); } }
    return;
  }
  if (!t.classList.contains('pe-text')) return;

  if (mod && !e.shiftKey) {
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); format('bold'); return; }
    if (k === 'i') { e.preventDefault(); format('italic'); return; }
    if (k === 'e') { e.preventDefault(); format('code'); return; }
    if (k === 'k') { e.preventDefault(); format('link'); return; }
  }

  if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); document.execCommand('insertHTML', false, '<br data-hard="1">'); return; }

  if (e.key === 'Enter') {
    e.preventDefault();
    // Item de lista vazio: sai da lista (ou do nível)
    if (LIST_TYPES.has(b.type) && !t.textContent.trim()) {
      if ((b.indent || 0) > 0) indent(id, -1); else convert(id, 'paragraph');
      return;
    }
    // Divide o bloco no cursor; o resto vai para um bloco novo
    const sel = getSelection();
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(t, t.childNodes.length);
    const frag = tail.extractContents();
    const holder = document.createElement('div');
    holder.appendChild(frag);
    b.edited = true;
    syncFromDom();
    const nextType = LIST_TYPES.has(b.type) ? b.type : b.type === 'quote' ? 'quote' : 'paragraph';
    const fresh = makeBlock(nextType, { indent: b.indent || 0, text: htmlToInline(holder).replace(/^\n/, '') });
    if (nextType === 'todo') fresh.checked = false;
    snapshot();
    blocks.splice(indexOf(id) + 1, 0, fresh);
    rerender(fresh.id, 0);
    changed();
    return;
  }

  if (e.key === 'Backspace' && atStart(t)) {
    e.preventDefault();
    if (b.type !== 'paragraph') {
      if (LIST_TYPES.has(b.type) && (b.indent || 0) > 0) indent(id, -1);
      else convert(id, 'paragraph');
      return;
    }
    if ((b.indent || 0) > 0) { indent(id, -1); return; }
    // Junta com o bloco de texto anterior
    const i = indexOf(id);
    const prev = blocks[i - 1];
    if (!prev) return;
    if (!TEXT_TYPES.has(prev.type)) { if (!t.textContent) removeBlock(id); else focusBlock(prev.id); return; }
    syncFromDom();
    snapshot();
    const prevText = textEl(prev.id).textContent.length;
    prev.text = (prev.text || '') + (b.text || '');
    prev.edited = true;
    blocks.splice(i, 1);
    rerender(prev.id, prevText);
    changed();
    return;
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    indent(id, e.shiftKey ? -1 : 1);
    return;
  }

  if (e.key === 'ArrowUp' && caretLine(t).first) {
    const p = blocks[indexOf(id) - 1];
    if (p) { e.preventDefault(); focusBlock(p.id, 'end'); }
  } else if (e.key === 'ArrowDown' && caretLine(t).last) {
    const n = blocks[indexOf(id) + 1];
    if (n) { e.preventDefault(); focusBlock(n.id, 0); }
  } else if (e.key === 'Escape') {
    t.blur();
  }
});

// Colar: texto puro; Markdown com várias linhas vira blocos
blocksEl.addEventListener('paste', (e) => {
  const node = e.target.closest('.pe-block');
  if (!node || e.target.classList.contains('pe-rawtext') || e.target.tagName === 'INPUT') return;
  const file = [...(e.clipboardData.files || [])].find((f) => f.type.startsWith('image/'));
  if (file) { e.preventDefault(); uploadInto(node.dataset.id, file); return; }
  const text = e.clipboardData.getData('text/plain');
  e.preventDefault();
  if (e.target.classList.contains('pe-codetext') || e.target.classList.contains('pe-cell') || !/\n/.test(text.trim())) {
    document.execCommand('insertText', false, e.target.classList.contains('pe-cell') ? text.replace(/\n+/g, ' ') : text);
    return;
  }
  const parsed = parseBlocks(text).map((b) => ({ ...b, id: newId(), edited: true }));
  if (!parsed.length) return;
  syncFromDom();
  snapshot();
  const id = node.dataset.id;
  const b = byId(id);
  const i = indexOf(id);
  const empty = TEXT_TYPES.has(b.type) && !node.querySelector('.pe-text').textContent.trim();
  const base = b.indent || 0;
  parsed.forEach((p) => { p.indent = (p.indent || 0) + base; });
  blocks.splice(empty ? i : i + 1, empty ? 1 : 0, ...parsed);
  normalize();
  rerender(parsed[parsed.length - 1].id);
  changed();
  toast(`Pasted ${parsed.length} block${parsed.length > 1 ? 's' : ''}`);
});

// Gutter: "+" e alça (clique = menu; arrastar = mover)
blocksEl.addEventListener('click', (e) => {
  const node = e.target.closest('.pe-block');
  if (!node) return;
  const id = node.dataset.id;
  if (e.target.closest('.pe-add')) {
    const b = makeBlock('paragraph');
    insertAfter(id, b);
    const t = textEl(b.id);
    document.execCommand('insertText', false, '/');
    const r = t.getBoundingClientRect();
    if (!menu) openMenu({ mode: 'slash', id: b.id, query: '' }, r);
    return;
  }
  if (e.target.closest('.pe-handle')) {
    openMenu({ mode: 'block', id }, e.target.closest('.pe-handle').getBoundingClientRect());
    return;
  }
  const tableBtn = e.target.closest('[data-table]');
  if (tableBtn) { editTable(id, tableBtn.getAttribute('data-table')); return; }
  if (e.target.closest('[data-action="upload"]')) { pickImage(id); return; }
  if (node.classList.contains('pe-divider')) node.focus();
});

function editTable(id, op) {
  syncFromDom();
  snapshot();
  const b = byId(id);
  const rows = b.rows;
  const width = rows[0].length;
  if (op === 'row+') rows.push(Array(width).fill(''));
  if (op === 'col+') rows.forEach((r) => r.push(''));
  if (op === 'row-' && rows.length > 1) rows.pop();
  if (op === 'col-' && width > 1) rows.forEach((r) => r.pop());
  if (b.align) b.align.length = rows[0].length;
  b.edited = true;
  rerender();
  changed();
}

// Arrastar e soltar blocos
let dragId = null;
let dropLine = null;
let dropIndex = -1;

blocksEl.addEventListener('dragstart', (e) => {
  const handle = e.target.closest && e.target.closest('.pe-handle');
  if (!handle) return;
  syncFromDom();
  dragId = handle.closest('.pe-block').dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  const node = el(dragId);
  e.dataTransfer.setDragImage(node, 20, 14);
  requestAnimationFrame(() => node.classList.add('is-dragging'));
  closeMenu();
});

blocksEl.addEventListener('dragover', (e) => {
  if (!dragId && ![...(e.dataTransfer.types || [])].includes('Files')) return;
  e.preventDefault();
  const nodes = [...blocksEl.querySelectorAll('.pe-block')];
  let idx = nodes.length;
  for (let k = 0; k < nodes.length; k++) {
    const r = nodes[k].getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) { idx = k; break; }
  }
  dropIndex = idx;
  if (!dropLine) { dropLine = document.createElement('div'); dropLine.className = 'pe-drop-line'; blocksEl.appendChild(dropLine); }
  const ref = nodes[idx] || nodes[nodes.length - 1];
  const box = blocksEl.getBoundingClientRect();
  const r = ref.getBoundingClientRect();
  dropLine.style.top = `${(nodes[idx] ? r.top : r.bottom) - box.top - 2}px`;
  dropLine.style.left = `${parseFloat(getComputedStyle(ref).marginLeft) || 0}px`;
});

function endDrag() {
  if (dropLine) dropLine.remove();
  dropLine = null;
  document.querySelectorAll('.is-dragging').forEach((n) => n.classList.remove('is-dragging'));
}

blocksEl.addEventListener('dragleave', (e) => { if (!blocksEl.contains(e.relatedTarget)) endDrag(); });
blocksEl.addEventListener('dragend', () => { endDrag(); dragId = null; });

blocksEl.addEventListener('drop', (e) => {
  e.preventDefault();
  endDrag();
  const files = [...(e.dataTransfer.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) {
    const target = blocks[Math.max(0, dropIndex - 1)];
    files.forEach((f) => uploadInto(target ? target.id : null, f, true));
    return;
  }
  if (!dragId) return;
  const from = indexOf(dragId);
  const [s, end] = familyRange(from);
  let to = dropIndex;
  dragId = null;
  if (to >= s && to <= end) return; // soltou no mesmo lugar
  snapshot();
  const group = blocks.splice(s, end - s);
  if (to > s) to -= group.length;
  // Item de lista solto logo abaixo de outro item herda o nível dele; o resto vai para o nível principal
  const above = blocks[to - 1];
  const base = above && LIST_TYPES.has(group[0].type) && LIST_TYPES.has(above.type) ? (above.indent || 0) : 0;
  const delta = base - (group[0].indent || 0);
  group.forEach((g) => { g.indent = Math.max(0, (g.indent || 0) + delta); });
  blocks.splice(to, 0, ...group);
  normalize();
  rerender(group[0].id);
  changed();
});

// =====================================================================
// Imagens
// =====================================================================

let pendingImageId = null;
function pickImage(id) { pendingImageId = id; $('pe-file-input').click(); }
$('pe-file-input').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f && pendingImageId) uploadInto(pendingImageId, f);
});

async function uploadInto(id, file, asNewBlock) {
  setStatus('Uploading image…');
  try {
    const res = await fetch(`${API}/upload?name=${encodeURIComponent(file.name || 'image.png')}`, { method: 'POST', body: file });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    syncFromDom();
    const b = id && byId(id);
    if (b && b.type === 'image' && !asNewBlock) {
      snapshot();
      b.src = data.src;
      if (!b.alt) b.alt = (file.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      b.edited = true;
      rerender(b.id);
      changed();
    } else {
      insertAfter(id, makeBlock('image', { src: data.src, alt: (file.name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }), { focus: false });
    }
    toast('Image uploaded to public/uploads');
  } catch (err) {
    setStatus(err.message, true);
    toast(err.message, true);
  }
}

// =====================================================================
// Formatação inline (barra flutuante e atalhos)
// =====================================================================

document.execCommand('styleWithCSS', false, false);

function format(kind) {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const t = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('.pe-text, .pe-cell');
  if (!t) return;
  if (kind === 'bold') document.execCommand('bold');
  else if (kind === 'italic') document.execCommand('italic');
  else if (kind === 'strike') document.execCommand('strikeThrough');
  else if (kind === 'code') {
    const range = sel.getRangeAt(0);
    const existing = range.commonAncestorContainer.parentElement && range.commonAncestorContainer.parentElement.closest('code');
    if (existing && t.contains(existing)) existing.replaceWith(document.createTextNode(existing.textContent));
    else if (!range.collapsed) {
      const code = document.createElement('code');
      code.textContent = range.toString();
      range.deleteContents();
      range.insertNode(code);
      sel.collapse(code.nextSibling || code.parentNode, code.nextSibling ? 0 : code.parentNode.childNodes.length);
    }
  } else if (kind === 'link') {
    const url = prompt('Link URL (e.g. /guide/install or https://…)');
    if (url) {
      if (sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
      else document.execCommand('createLink', false, url);
    }
  }
  const node = t.closest('.pe-block');
  if (node) byId(node.dataset.id).edited = true;
  changed();
  updateToolbar();
}

$('pe-toolbar').addEventListener('mousedown', (e) => e.preventDefault());
$('pe-toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-format]');
  if (btn) format(btn.getAttribute('data-format'));
});

function updateToolbar() {
  const sel = getSelection();
  const bar = $('pe-toolbar');
  const anchor = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  if (!sel.rangeCount || sel.isCollapsed || !anchor || !anchor.closest('.pe-text, .pe-cell')) { bar.hidden = true; return; }
  const r = sel.getRangeAt(0).getBoundingClientRect();
  bar.hidden = false;
  bar.style.top = `${Math.max(56, r.top - bar.offsetHeight - 8)}px`;
  bar.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - bar.offsetWidth / 2), innerWidth - bar.offsetWidth - 8)}px`;
}
document.addEventListener('selectionchange', () => requestAnimationFrame(updateToolbar));

// =====================================================================
// Título, propriedades e barra superior
// =====================================================================

const titleEl = $('pe-title');
titleEl.addEventListener('input', () => { autosize(titleEl); changed(); });
titleEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (blocks[0]) focusBlock(blocks[0].id, 0);
  }
});
$('pe-description').addEventListener('input', changed);
$('pe-order').addEventListener('input', changed);

$('pe-append').addEventListener('click', () => {
  const last = blocks[blocks.length - 1];
  if (last && TEXT_TYPES.has(last.type) && last.type === 'paragraph' && !textEl(last.id).textContent) { focusBlock(last.id); return; }
  insertAfter(last ? last.id : null, makeBlock('paragraph', { indent: 0 }));
});

$('pe-undo').addEventListener('click', undo);
$('pe-md-toggle').addEventListener('click', () => {
  const panel = $('pe-md');
  panel.hidden = !panel.hidden;
  $('pe-md-toggle').classList.toggle('is-active', !panel.hidden);
  updateMarkdownPanel();
});
$('pe-new').addEventListener('click', async () => {
  const slug = prompt('New page path inside rhyla-docs/body (e.g. guide/installation)');
  if (!slug) return;
  if (dirty) await save();
  const res = await fetch(`${API}/page`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug }) });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Could not create the page', true); return; }
  location.href = `/__rhyla/page-editor?page=${encodeURIComponent(data.slug)}`;
});

document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey && !e.target.closest('[contenteditable="true"], input, textarea')) { e.preventDefault(); undo(); }
  if (e.key === 'Escape' && menu) closeMenu();
});
document.addEventListener('mousedown', (e) => { if (menu && !e.target.closest('#pe-menu')) closeMenu(); });
window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// =====================================================================
// Início
// =====================================================================

async function init() {
  const slug = new URLSearchParams(location.search).get('page') || 'home';
  const res = await fetch(`${API}/page?slug=${encodeURIComponent(slug)}`);
  const data = await res.json();
  if (!res.ok) {
    $('pe-doc').innerHTML = `<p class="pe-flow-note">${esc(data.error || 'Page not found')}</p>`;
    setStatus('');
    return;
  }
  page = data;
  document.title = `${data.data.title || data.slug} · Page editor`;
  $('pe-path').textContent = `body/${data.slug}.md`;
  $('pe-file').textContent = `rhyla-docs/body/${data.slug}.md`;
  $('pe-back').href = data.url;
  $('pe-view').href = data.url;
  titleEl.value = data.data.title || '';
  $('pe-description').value = data.data.description || '';
  $('pe-order').value = data.data.order ?? '';
  autosize(titleEl);
  if (data.isFlow) {
    $('pe-flow-note').hidden = false;
    $('pe-flow-link').href = `/__rhyla/flow-editor?flow=${encodeURIComponent(data.slug)}`;
  }
  blocks = data.blocks.map((b) => ({ ...b, id: newId(), edited: false }));
  // Sem `title` no frontmatter, o site usa o primeiro "# H1": mostra como sugestão
  const h1 = blocks.find((b) => b.type === 'heading' && b.level === 1);
  titleEl.placeholder = h1 ? h1.text.replace(/[*_`]/g, '') : 'Untitled';
  if (!blocks.length) blocks.push(makeBlock('paragraph'));
  render();
  setStatus('Saved');
  $('pe-undo').disabled = true;
}

init();
