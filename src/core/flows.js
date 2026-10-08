import { escapeHtml } from './content.js';

/*
 * Fluxos: páginas com `type: flow` no frontmatter que conectam outras páginas.
 *
 * ---
 * title: Checkout
 * type: flow
 * steps:
 *   - id: cart
 *     page: api/cart/get-cart          # página de body/ (sem extensão)
 *     next: pay
 *   - id: pay
 *     page: api/payments/post-pay
 *     next:
 *       - { to: done, label: approved }
 *       - { to: failed, label: declined }
 *   - { id: done, page: checkout/confirmation }
 *   - { id: failed, title: Payment declined, note: try again, next: pay }  # passo sem página
 * ---
 */

const NODE_W = 208;
const NODE_H = 56;
const GAP_X = 40;
const GAP_Y = 72;
const PAD = 16;
const LANE = 18;

const normSlug = (s) => String(s || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.(md|html)$/i, '');

function clip(text, max) {
  const t = String(text || '');
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function normalizeNext(next) {
  if (!next) return [];
  const list = Array.isArray(next) ? next : [next];
  return list
    .map((n) => (typeof n === 'string' ? { to: n } : n && typeof n === 'object' ? { to: n.to, label: n.label } : null))
    .filter((n) => n && n.to)
    .map((n) => ({ to: String(n.to), label: n.label ? String(n.label) : '' }));
}

/**
 * Lê todas as páginas de fluxo e monta o grafo.
 * @param {Array} pages páginas já renderizadas (slug, data, title, description)
 * @returns {{ flows: Array, byPage: Map<string, Array<{ flow, step }>>, warnings: string[] }}
 */
export function buildFlowGraph(pages) {
  const pageBySlug = new Map(pages.map((p) => [normSlug(p.slug), p]));
  const flows = [];
  const byPage = new Map();
  const warnings = [];

  for (const page of pages) {
    if (!page.data || page.data.type !== 'flow') continue;
    const flowWarnings = [];
    const rawSteps = Array.isArray(page.data.steps) ? page.data.steps : [];
    if (!rawSteps.length) flowWarnings.push('no steps defined (add a `steps:` list to the frontmatter)');

    const steps = [];
    const ids = new Set();
    rawSteps.forEach((raw, i) => {
      const s = typeof raw === 'string' ? { page: raw } : raw || {};
      const slug = s.page ? normSlug(s.page) : '';
      let id = String(s.id || slug.split('/').pop() || `step-${i + 1}`);
      if (ids.has(id)) { flowWarnings.push(`duplicate step id "${id}"`); id = `${id}-${i + 1}`; }
      ids.add(id);
      const target = slug ? pageBySlug.get(slug) : null;
      if (slug && !target) flowWarnings.push(`step "${id}": page "${slug}" not found`);
      steps.push({
        id,
        slug: target ? normSlug(target.slug) : '',
        missingPage: Boolean(slug && !target),
        title: String(s.title || (target && target.title) || slug || id),
        note: String(s.note || (target && target.description) || ''),
        next: normalizeNext(s.next),
      });
    });

    // Por padrão, cada passo sem `next` aponta para o seguinte só se nenhum passo usar `next`
    const usesNext = steps.some((s) => s.next.length);
    if (!usesNext) steps.forEach((s, i) => { if (steps[i + 1]) s.next = [{ to: steps[i + 1].id, label: '' }]; });

    for (const s of steps) {
      s.next = s.next.filter((n) => {
        if (ids.has(n.to)) return true;
        flowWarnings.push(`step "${s.id}": next "${n.to}" does not exist`);
        return false;
      });
    }

    const flow = {
      slug: normSlug(page.slug),
      title: page.title,
      steps,
      start: page.data.start && ids.has(String(page.data.start)) ? String(page.data.start) : (steps[0] && steps[0].id),
      warnings: flowWarnings,
    };
    flows.push(flow);
    flowWarnings.forEach((w) => warnings.push(`flow "${flow.slug}": ${w}`));

    for (const step of steps) {
      if (!step.slug) continue;
      if (!byPage.has(step.slug)) byPage.set(step.slug, []);
      byPage.get(step.slug).push({ flow, step });
    }
  }
  return { flows, byPage, warnings };
}

/** Passos que levam a `stepId` (anteriores) e para onde ele leva (próximos). */
export function neighbors(flow, stepId) {
  const byId = new Map(flow.steps.map((s) => [s.id, s]));
  const prev = flow.steps
    .filter((s) => s.next.some((n) => n.to === stepId))
    .map((s) => ({ step: s, label: s.next.find((n) => n.to === stepId).label }));
  const step = byId.get(stepId);
  const next = step ? step.next.map((n) => ({ step: byId.get(n.to), label: n.label })) : [];
  return { prev, next };
}

/**
 * Layout em camadas (top-down): cada passo fica na camada do caminho mais longo a partir do início;
 * arestas que voltam (ciclos) são desenhadas por uma faixa à direita.
 */
export function layoutFlow(flow) {
  const steps = flow.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const order = new Map(steps.map((s, i) => [s.id, i]));

  // 1. Classifica arestas de retorno (DFS a partir do início, depois dos passos não alcançados)
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const n of byId.get(id).next) {
      const st = state.get(n.to);
      if (st === 1) back.add(`${id}>${n.to}`);
      else if (!st) visit(n.to);
    }
    state.set(id, 2);
  };
  if (flow.start) visit(flow.start);
  steps.forEach((s) => { if (!state.get(s.id)) visit(s.id); });

  // 2. Camadas pelo caminho mais longo nas arestas para frente (ordem topológica de Kahn)
  const forward = (s) => s.next.filter((n) => !back.has(`${s.id}>${n.to}`));
  const indeg = new Map(steps.map((s) => [s.id, 0]));
  steps.forEach((s) => forward(s).forEach((n) => indeg.set(n.to, indeg.get(n.to) + 1)));
  const rank = new Map(steps.map((s) => [s.id, 0]));
  const queue = steps.filter((s) => indeg.get(s.id) === 0).map((s) => s.id);
  while (queue.length) {
    const id = queue.shift();
    for (const n of forward(byId.get(id))) {
      rank.set(n.to, Math.max(rank.get(n.to), rank.get(id) + 1));
      indeg.set(n.to, indeg.get(n.to) - 1);
      if (indeg.get(n.to) === 0) queue.push(n.to);
    }
  }

  // 3. Ordem dentro da camada: média da posição dos pais (reduz cruzamentos)
  const layers = [];
  steps.forEach((s) => { (layers[rank.get(s.id)] ||= []).push(s.id); });
  const posInLayer = new Map();
  layers.forEach((layer, r) => {
    if (r > 0) {
      const parentsOf = (id) => steps.filter((p) => forward(p).some((n) => n.to === id)).map((p) => posInLayer.get(p.id) ?? 0);
      const score = (id) => { const ps = parentsOf(id); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : order.get(id); };
      layer.sort((a, b) => score(a) - score(b) || order.get(a) - order.get(b));
    }
    layer.forEach((id, i) => posInLayer.set(id, i - (layer.length - 1) / 2));
  });

  // 4. Coordenadas
  const widest = Math.max(1, ...layers.map((l) => (l ? l.length : 0)));
  const contentW = widest * NODE_W + (widest - 1) * GAP_X;
  const backEdges = [];
  steps.forEach((s) => s.next.forEach((n) => { if (back.has(`${s.id}>${n.to}`)) backEdges.push({ from: s.id, to: n.to, label: n.label }); }));
  // Arestas de retorno com rótulo ficam nas faixas mais externas (o texto não é cruzado por outras)
  backEdges.sort((a, b) => Number(Boolean(a.label)) - Number(Boolean(b.label)));
  const edges = [];
  steps.forEach((s) => forward(s).forEach((n) => edges.push({ from: s.id, to: n.to, label: n.label, skip: rank.get(n.to) - rank.get(s.id) > 1 })));

  const nodes = new Map();
  layers.forEach((layer, r) => {
    (layer || []).forEach((id) => {
      const cx = PAD + contentW / 2 + posInLayer.get(id) * (NODE_W + GAP_X);
      nodes.set(id, { id, x: cx - NODE_W / 2, y: PAD + r * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, rank: r });
    });
  });

  // Arestas que pulam camadas contornam, pela esquerda, os nós das camadas intermediárias
  let used = 0;
  edges.forEach((e) => {
    if (!e.skip) return;
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const between = [...nodes.values()].filter((n) => n.rank > a.rank && n.rank < b.rank);
    const minX = Math.min(a.x + a.w / 2, b.x + b.w / 2, ...between.map((n) => n.x));
    e.lane = minX - 18 - used++ * LANE;
  });
  const minLane = Math.min(PAD, ...edges.filter((e) => e.skip).map((e) => e.lane - 8));
  const shift = PAD - minLane;
  if (shift > 0) {
    nodes.forEach((n) => { n.x += shift; });
    edges.forEach((e) => { if (e.skip) e.lane += shift; });
  }

  const backLabel = backEdges.some((e) => e.label) ? 56 : 0;
  const contentRight = shift + PAD + contentW;
  const width = contentRight + PAD + (backEdges.length ? backEdges.length * LANE + 8 + backLabel : 0);
  const height = PAD * 2 + layers.length * NODE_H + (layers.length - 1) * GAP_Y;
  return { nodes, edges, backEdges, width, height, contentRight };
}

/**
 * Diagrama SVG do fluxo. Passos com página viram links.
 * @param {object} flow
 * @param {{ hrefFor: (slug: string) => string, currentStepId?: string, idSuffix?: string }} options
 */
export function renderFlowDiagram(flow, { hrefFor, currentStepId, idSuffix = '' } = {}) {
  if (!flow.steps.length) return '';
  const { nodes, edges, backEdges, width, height, contentRight } = layoutFlow(flow);
  const marker = `rh-flow-arrow-${flow.slug.replace(/[^a-z0-9]+/gi, '-')}${idSuffix}`;
  const out = [];

  out.push(`<svg class="rh-flow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(flow.title)} flow">`);
  out.push(`<defs><marker id="${marker}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`);

  // Arestas para frente: desce, anda na horizontal no meio do vão, desce até o alvo
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const sx = a.x + a.w / 2, sy = a.y + a.h;
    const tx = b.x + b.w / 2, ty = b.y - 3;
    const midY = sy + GAP_Y / 2 - 6;
    const entryY = b.y - GAP_Y / 2 + 6;
    let d;
    if (e.skip) d = `M${sx} ${sy} V${midY} H${e.lane} V${entryY} H${tx} V${ty}`;
    else d = sx === tx ? `M${sx} ${sy} V${ty}` : `M${sx} ${sy} V${midY} H${tx} V${ty}`;
    out.push(`<path class="rh-flow-edge" d="${d}" marker-end="url(#${marker})"/>`);
    if (e.label) out.push(`<text class="rh-flow-label" x="${tx + 6}" y="${ty - 10}">${escapeHtml(clip(e.label, 22))}</text>`);
  }

  // Arestas de retorno: saem pela direita e voltam por uma faixa lateral
  backEdges.forEach((e, i) => {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const lane = contentRight + 8 + (i + 1) * LANE;
    const sy = a.y + a.h / 2 + 6, ty = b.y + b.h / 2 - 6;
    out.push(`<path class="rh-flow-edge rh-flow-edge--back" d="M${a.x + a.w} ${sy} H${lane} V${ty} H${b.x + b.w + 3}" marker-end="url(#${marker})"/>`);
    if (e.label) out.push(`<text class="rh-flow-label" x="${lane + 6}" y="${(sy + ty) / 2}" dominant-baseline="central">${escapeHtml(clip(e.label, 10))}</text>`);
  });

  for (const step of flow.steps) {
    const n = nodes.get(step.id);
    const cls = ['rh-flow-node'];
    if (step.id === currentStepId) cls.push('is-current');
    if (!step.slug) cls.push(step.missingPage ? 'is-missing' : 'is-text');
    const sub = step.missingPage ? 'page not found' : step.note;
    const cx = n.x + n.w / 2;
    const titleY = sub ? n.y + 22 : n.y + n.h / 2;
    const inner = [
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10"/>`,
      `<text class="rh-flow-title" x="${cx}" y="${titleY}">${escapeHtml(clip(step.title, 26))}</text>`,
      sub ? `<text class="rh-flow-sub" x="${cx}" y="${n.y + 40}">${escapeHtml(clip(sub, 32))}</text>` : '',
      `<title>${escapeHtml(step.title)}${step.note ? ' — ' + escapeHtml(step.note) : ''}</title>`,
    ].join('');
    const attrs = `class="${cls.join(' ')}" data-step="${escapeHtml(step.id)}"`;
    out.push(step.slug
      ? `<a href="${escapeHtml(hrefFor(step.slug))}" ${attrs}>${inner}</a>`
      : `<g ${attrs}>${inner}</g>`);
  }
  out.push('</svg>');
  return out.join('');
}

const FLOW_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3a3 3 0 0 0 3 3h4.5"/></svg>';

function warningsHtml(flow) {
  if (!flow.warnings.length) return '';
  return `<div class="rh-flow-warnings"><strong>Flow warnings</strong><ul>${flow.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
}

/** Cartão "parte do fluxo" exibido no fim das páginas que participam de um fluxo. */
function flowNavHtml(memberships, hrefFor) {
  return memberships.map(({ flow, step }, i) => {
    const { prev, next } = neighbors(flow, step.id);
    const link = (s, label, dir) => {
      const tag = s.slug ? 'a' : 'span';
      const href = s.slug ? ` href="${escapeHtml(hrefFor(s.slug))}"` : '';
      return `<${tag} class="rh-flow-link rh-flow-link--${dir}"${href}>`
        + `<span class="rh-flow-dir">${dir === 'prev' ? '← Previous' : 'Next →'}${label ? ` · ${escapeHtml(label)}` : ''}</span>`
        + `<span class="rh-flow-step">${escapeHtml(s.title)}</span></${tag}>`;
    };
    const col = (items, dir) => `<div class="rh-flow-col rh-flow-col--${dir}">${items.join('')}</div>`;
    const links = prev.length || next.length
      ? [col(prev.map((p) => link(p.step, p.label, 'prev')), 'prev') + col(next.map((n) => link(n.step, n.label, 'next')), 'next')]
      : [];
    const isEnd = !next.length;
    return `<nav class="rh-flow-nav" aria-label="Flow ${escapeHtml(flow.title)}"${i === 0 ? ' id="rh-flow"' : ''}>`
      + `<div class="rh-flow-nav-head">${FLOW_ICON}<span>Part of the flow <a href="${escapeHtml(hrefFor(flow.slug))}">${escapeHtml(flow.title)}</a></span>${isEnd ? '<span class="rh-flow-end">end of flow</span>' : ''}</div>`
      + (links.length ? `<div class="rh-flow-links">${links.join('')}</div>` : '')
      + `<details class="rh-flow-map"><summary>Show flow</summary><div class="rh-flow">${renderFlowDiagram(flow, { hrefFor, currentStepId: step.id, idSuffix: `-nav${i}` })}</div></details>`
      + '</nav>';
  }).join('');
}

/** Lista de passos em Markdown (para .md, llms-full.txt e agentes). */
export function flowToMarkdown(flow, mdHrefFor) {
  const byId = new Map(flow.steps.map((s) => [s.id, s]));
  const lines = ['## Flow steps', ''];
  flow.steps.forEach((s, i) => {
    const ref = s.slug ? ` — [${s.slug}](${mdHrefFor(s.slug)})` : '';
    lines.push(`${i + 1}. **${s.title}**${ref}${s.note ? ` — ${s.note}` : ''}`);
    for (const n of s.next) lines.push(`   - ${n.label ? `${n.label} → ` : '→ '}${byId.get(n.to).title}`);
  });
  return lines.join('\n');
}

/**
 * Acrescenta à página o que vem dos fluxos:
 * - página de fluxo: diagrama no topo + lista de passos no markdown
 * - página que participa de fluxos: selo no topo + cartão de navegação no fim
 *
 * @returns {{ html: string, markdown: string|null }}
 */
export function decoratePage(page, graph, { hrefFor, mdHrefFor, editHrefFor }) {
  let html = page.html;
  let markdown = page.markdown;
  const slug = normSlug(page.slug);

  const flow = graph.flows.find((f) => f.slug === slug);
  if (flow) {
    // No `rhyla dev` o diagrama ganha um atalho para o editor de fluxos
    const edit = editHrefFor ? `<a class="rh-flow-edit" href="${escapeHtml(editHrefFor(flow.slug))}" data-no-spa>Edit flow</a>` : '';
    const diagram = `<figure class="rh-flow">${edit}${renderFlowDiagram(flow, { hrefFor })}</figure>${warningsHtml(flow)}`;
    // Diagrama logo depois do H1, se houver
    html = /<\/h1>/i.test(html) ? html.replace(/<\/h1>/i, (m) => `${m}\n${diagram}`) : diagram + html;
    if (markdown !== null) markdown = `${markdown.trimEnd()}\n\n${flowToMarkdown(flow, mdHrefFor)}\n`;
  }

  const memberships = graph.byPage.get(slug) || [];
  if (memberships.length) {
    const pills = memberships.map(({ flow: f }) => `<a class="rh-flow-pill" href="#rh-flow">${FLOW_ICON}${escapeHtml(f.title)}</a>`).join('');
    html = `<div class="rh-flow-pills">${pills}</div>\n${html}\n${flowNavHtml(memberships, hrefFor)}`;
    if (markdown !== null) {
      const notes = memberships.map(({ flow: f, step }) => {
        const { prev, next } = neighbors(f, step.id);
        const fmt = (list) => list.map((x) => `${x.step.title}${x.label ? ` (${x.label})` : ''}`).join(', ') || '—';
        return `> Part of the flow [${f.title}](${mdHrefFor(f.slug)}). Previous: ${fmt(prev)}. Next: ${fmt(next)}.`;
      });
      markdown = `${markdown.trimEnd()}\n\n${notes.join('\n>\n')}\n`;
    }
  }
  return { html, markdown };
}

/**
 * Converte os passos do editor para o frontmatter mais enxuto possível
 * (omite campos vazios; `next` com um destino sem rótulo vira string).
 */
export function compactSteps(steps) {
  return (steps || []).map((st) => {
    const out = { id: String(st.id) };
    if (st.page) out.page = normSlug(st.page);
    if (st.title) out.title = String(st.title);
    if (st.note) out.note = String(st.note);
    const next = (st.next || []).filter((n) => n && n.to).map((n) => (n.label ? { to: String(n.to), label: String(n.label) } : { to: String(n.to) }));
    if (next.length === 1 && !next[0].label) out.next = next[0].to;
    else if (next.length) out.next = next;
    return out;
  });
}

/** Passos crus do frontmatter no formato do editor: { id, page, title, note, next: [{ to, label }] }. */
export function editableSteps(rawSteps) {
  return (Array.isArray(rawSteps) ? rawSteps : []).map((raw, i) => {
    const s = typeof raw === 'string' ? { page: raw } : raw || {};
    const page = s.page ? normSlug(s.page) : '';
    return {
      id: String(s.id || page.split('/').pop() || `step-${i + 1}`),
      page,
      title: s.title ? String(s.title) : '',
      note: s.note ? String(s.note) : '',
      next: normalizeNext(s.next),
    };
  });
}
