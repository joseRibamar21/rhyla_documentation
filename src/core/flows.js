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
const GAP_X = 44;
const GAP_Y = 76;
const PAD = 20;
const LANE = 18;
const DUMMY_W = 8;
const DUMMY_GAP = 18;

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
 * Layout em camadas (Sugiyama), de cima para baixo:
 * 1. arestas que voltam (ciclos) saem do layout e viram faixas à direita;
 * 2. cada passo vai para a camada do caminho mais longo a partir do início;
 * 3. arestas longas ganham nós "fantasma" nas camadas do meio (descem pelo próprio caminho);
 * 4. a ordem em cada camada é otimizada para reduzir cruzamentos;
 * 5. as posições horizontais são alinhadas aos vizinhos, respeitando o espaçamento.
 */
export function layoutFlow(flow) {
  const steps = flow.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const order = new Map(steps.map((s, i) => [s.id, i]));

  // 1. Arestas de retorno (DFS) e ordem de descoberta
  const state = new Map();
  const back = new Set();
  const discovered = new Map();
  const visit = (id) => {
    state.set(id, 1);
    discovered.set(id, discovered.size);
    for (const n of byId.get(id).next) {
      const st = state.get(n.to);
      if (st === 1) back.add(`${id}>${n.to}`);
      else if (!st) visit(n.to);
    }
    state.set(id, 2);
  };
  if (flow.start && byId.has(flow.start)) visit(flow.start);
  steps.forEach((s) => { if (!state.get(s.id)) visit(s.id); });

  // 2. Camadas pelo caminho mais longo (ordem topológica de Kahn)
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

  // 3. Grafo em camadas com nós fantasma
  const nodes = new Map();
  steps.forEach((s) => nodes.set(s.id, { id: s.id, rank: rank.get(s.id), w: NODE_W, h: NODE_H, dummy: false }));
  const edges = [];
  const backEdges = [];
  let dummies = 0;
  steps.forEach((s) => s.next.forEach((n) => {
    if (back.has(`${s.id}>${n.to}`)) { backEdges.push({ from: s.id, to: n.to, label: n.label }); return; }
    const r0 = rank.get(s.id);
    const r1 = rank.get(n.to);
    const chain = [s.id];
    for (let r = r0 + 1; r < r1; r++) {
      const id = `~${dummies++}`;
      nodes.set(id, { id, rank: r, w: DUMMY_W, h: NODE_H, dummy: true });
      chain.push(id);
    }
    chain.push(n.to);
    edges.push({ from: s.id, to: n.to, label: n.label, skip: r1 - r0 > 1, chain });
  }));
  const up = new Map([...nodes.keys()].map((id) => [id, []]));
  const down = new Map([...nodes.keys()].map((id) => [id, []]));
  edges.forEach((e) => e.chain.slice(1).forEach((id, k) => { down.get(e.chain[k]).push(id); up.get(id).push(e.chain[k]); }));

  // 4. Ordem nas camadas: barycentro em varreduras alternadas, guardando a de menos cruzamentos
  const layerCount = Math.max(0, ...[...nodes.values()].map((n) => n.rank)) + 1;
  let layers = Array.from({ length: layerCount }, () => []);
  nodes.forEach((n) => layers[n.rank].push(n.id));
  const pos = new Map();
  const index = () => layers.forEach((l) => l.forEach((id, i) => pos.set(id, i)));
  const firstSeen = (id) => (nodes.get(id).dummy ? Infinity : (discovered.get(id) ?? order.get(id)));
  layers.forEach((l) => l.sort((a, b) => firstSeen(a) - firstSeen(b)));
  index();
  const sortLayer = (r, nb) => {
    const keyed = layers[r].map((id, i) => {
      const list = nb.get(id);
      return { id, i, k: list.length ? list.reduce((t, x) => t + pos.get(x), 0) / list.length : i };
    });
    keyed.sort((a, b) => a.k - b.k || a.i - b.i);
    layers[r] = keyed.map((x) => x.id);
    layers[r].forEach((id, i) => pos.set(id, i));
  };
  const crossings = () => {
    let c = 0;
    for (let r = 0; r < layerCount - 1; r++) {
      const es = [];
      layers[r].forEach((a) => down.get(a).forEach((b) => es.push([pos.get(a), pos.get(b)])));
      for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++;
    }
    return c;
  };
  for (let r = 1; r < layerCount; r++) sortLayer(r, up);
  let best = layers.map((l) => l.slice());
  let bestCrossings = crossings();
  for (let it = 0; it < 16 && bestCrossings > 0; it++) {
    if (it % 2) for (let r = layerCount - 2; r >= 0; r--) sortLayer(r, down);
    else for (let r = 1; r < layerCount; r++) sortLayer(r, up);
    const c = crossings();
    if (c < bestCrossings) { bestCrossings = c; best = layers.map((l) => l.slice()); }
  }
  layers = best;
  index();

  // 5. Posição horizontal: cada nó tenta ficar alinhado aos vizinhos sem invadir o espaço dos outros
  const gap = (a, b) => (nodes.get(a).dummy || nodes.get(b).dummy ? DUMMY_GAP : GAP_X);
  const cx = new Map();
  layers.forEach((layer) => {
    let x = 0;
    layer.forEach((id, i) => {
      if (i) x += gap(layer[i - 1], id);
      cx.set(id, x + nodes.get(id).w / 2);
      x += nodes.get(id).w;
    });
    const half = x / 2;
    layer.forEach((id) => cx.set(id, cx.get(id) - half));
  });
  const place = (layer, desired) => {
    const w = (i) => nodes.get(layer[i]).w;
    const sep = (i) => w(i) / 2 + gap(layer[i], layer[i + 1]) + w(i + 1) / 2;
    const a = desired.slice();
    for (let i = 1; i < a.length; i++) a[i] = Math.max(a[i], a[i - 1] + sep(i - 1));
    const b = desired.slice();
    for (let i = b.length - 2; i >= 0; i--) b[i] = Math.min(b[i], b[i + 1] - sep(i));
    // A média de duas posições válidas também é válida (e fica equilibrada)
    layer.forEach((id, i) => cx.set(id, (a[i] + b[i]) / 2));
  };
  for (let it = 0; it < 24; it++) {
    const both = it >= 16;
    const downward = it % 2 === 0;
    const rs = layers.map((_, r) => r);
    if (!downward) rs.reverse();
    for (const r of rs) {
      const layer = layers[r];
      const desired = layer.map((id) => {
        const nb = both ? [...up.get(id), ...down.get(id)] : (downward ? up : down).get(id);
        return nb.length ? nb.reduce((t, x) => t + cx.get(x), 0) / nb.length : cx.get(id);
      });
      place(layer, desired);
    }
  }
  const minLeft = Math.min(...[...nodes.values()].map((n) => cx.get(n.id) - n.w / 2));
  nodes.forEach((n) => {
    n.x = Math.round(cx.get(n.id) - n.w / 2 - minLeft + PAD);
    n.y = PAD + n.rank * (NODE_H + GAP_Y);
  });

  // Portas: várias arestas num mesmo nó saem/chegam em pontos diferentes, na ordem dos destinos
  const ports = (list, side) => {
    const n = nodes.get(side === 'out' ? list[0].from : list[0].to);
    const spread = Math.min(26, (n.w * 0.7) / Math.max(1, list.length));
    list.sort((e1, e2) => {
      const other = (e) => nodes.get(side === 'out' ? e.chain[1] : e.chain[e.chain.length - 2]);
      return (other(e1).x + other(e1).w / 2) - (other(e2).x + other(e2).w / 2);
    });
    list.forEach((e, i) => { e[side] = Math.round(n.x + n.w / 2 + (i - (list.length - 1) / 2) * spread); });
  };
  const group = (key) => {
    const m = new Map();
    edges.forEach((e) => { if (!m.has(e[key])) m.set(e[key], []); m.get(e[key]).push(e); });
    return m;
  };
  group('from').forEach((list) => ports(list, 'out'));
  group('to').forEach((list) => ports(list, 'in'));
  edges.forEach((e) => {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    e.points = [{ x: e.out, y: a.y + a.h }];
    e.chain.slice(1, -1).forEach((id) => {
      const d = nodes.get(id);
      e.points.push({ x: d.x + d.w / 2, y: d.y }, { x: d.x + d.w / 2, y: d.y + d.h });
    });
    e.points.push({ x: e.in, y: b.y });
  });

  // Retornos: faixas à direita de tudo; os com rótulo nas faixas mais externas
  backEdges.sort((a, b) => Number(Boolean(a.label)) - Number(Boolean(b.label)));
  const right = Math.max(...[...nodes.values()].map((n) => n.x + n.w));
  backEdges.forEach((e, i) => {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    e.lane = right + 28 + i * LANE;
    const sy = a.y + a.h / 2 + (a === b ? -8 : 6);
    const ty = b.y + b.h / 2 - (a === b ? -8 : 6);
    e.points = [{ x: a.x + a.w, y: sy }, { x: e.lane, y: sy }, { x: e.lane, y: ty }, { x: b.x + b.w, y: ty }];
  });

  const laneRight = backEdges.length ? right + 28 + (backEdges.length - 1) * LANE + (backEdges.some((e) => e.label) ? 64 : 12) : right;
  const width = Math.round(laneRight + PAD);
  const height = PAD * 2 + layerCount * NODE_H + (layerCount - 1) * GAP_Y;
  return { nodes, edges, backEdges, width, height, crossings: bestCrossings };
}

// Curva suave entre pontos (fluxo vertical): trechos retos nos nós fantasma
function curvePath(points) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a.x === b.x) { d += ` L${b.x} ${b.y}`; continue; }
    const dy = (b.y - a.y) / 2;
    d += ` C${a.x} ${a.y + dy} ${b.x} ${b.y - dy} ${b.x} ${b.y}`;
  }
  return d;
}

// Linha ortogonal com cantos arredondados (retornos)
function roundedPath(points, r = 10) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i - 1];
    const c = points[i];
    const n = points[i + 1];
    const k1 = Math.min(r, Math.hypot(c.x - p.x, c.y - p.y) / 2);
    const k2 = Math.min(r, Math.hypot(n.x - c.x, n.y - c.y) / 2);
    const ux = Math.sign(c.x - p.x), uy = Math.sign(c.y - p.y);
    const vx = Math.sign(n.x - c.x), vy = Math.sign(n.y - c.y);
    d += ` L${c.x - ux * k1} ${c.y - uy * k1} Q${c.x} ${c.y} ${c.x + vx * k2} ${c.y + vy * k2}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x} ${last.y}`;
}

function labelPill(text, x, y, edgeKey) {
  const t = clip(text, 22);
  const w = Math.round(t.length * 6.4 + 16);
  return `<g class="rh-flow-pill" data-edge="${escapeHtml(edgeKey)}"><rect x="${Math.round(x - w / 2)}" y="${Math.round(y - 10)}" width="${w}" height="20" rx="10"/><text x="${Math.round(x)}" y="${Math.round(y)}">${escapeHtml(t)}</text></g>`;
}

/**
 * Diagrama SVG do fluxo. Passos com página viram links.
 * Arestas e nós carregam data-* (data-step, data-from/data-to, data-edge) para destaque e para o editor.
 * @param {object} flow
 * @param {{ hrefFor: (slug: string) => string, currentStepId?: string, idSuffix?: string }} options
 */
export function renderFlowDiagram(flow, { hrefFor, currentStepId, idSuffix = '' } = {}) {
  if (!flow.steps.length) return '';
  const { nodes, edges, backEdges, width, height } = layoutFlow(flow);
  const marker = `rh-flow-arrow-${flow.slug.replace(/[^a-z0-9]+/gi, '-')}${idSuffix}`;
  const out = [];
  const pills = [];

  out.push(`<svg class="rh-flow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeHtml(flow.title)} flow">`);
  out.push(`<defs><marker id="${marker}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M2 1L8.5 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`);

  const link = (e, d, back) => {
    const key = `${e.from}>${e.to}`;
    const attrs = `data-from="${escapeHtml(e.from)}" data-to="${escapeHtml(e.to)}" data-edge="${escapeHtml(key)}"`;
    return `<g class="rh-flow-link${back ? ' is-back' : ''}" ${attrs}><path class="rh-flow-edge${back ? ' rh-flow-edge--back' : ''}" d="${d}" marker-end="url(#${marker})"/><path class="rh-flow-hit" d="${d}"/></g>`;
  };

  for (const e of edges) {
    const pts = e.points.map((p, i) => (i === e.points.length - 1 ? { x: p.x, y: p.y - 2 } : p));
    out.push(link(e, curvePath(pts), false));
    if (e.label) {
      // Rótulo no primeiro trecho, perto de quem decide
      const a = e.points[0];
      const b = e.points[1];
      pills.push(labelPill(e.label, (a.x + b.x) / 2, (a.y + b.y) / 2 + (a.x === b.x ? -4 : 0), `${e.from}>${e.to}`));
    }
  }
  for (const e of backEdges) {
    const pts = e.points.map((p, i) => (i === e.points.length - 1 ? { x: p.x + 2, y: p.y } : p));
    out.push(link(e, roundedPath(pts), true));
    if (e.label) pills.push(labelPill(e.label, e.lane, (e.points[1].y + e.points[2].y) / 2, `${e.from}>${e.to}`));
  }
  out.push(...pills);

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
