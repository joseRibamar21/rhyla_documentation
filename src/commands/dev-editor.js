import fs from 'fs';
import path from 'path';
import express from 'express';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';
import { buildFlowGraph, renderFlowDiagram, compactSteps, editableSteps } from '../core/flows.js';
import { parseBlocks } from '../core/blocks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.join(__dirname, '../editor');
const BLOCKS_MODULE = path.join(__dirname, '../core/blocks.js');

// Prefixo das rotas internas do editor (só existem no `rhyla dev`)
export const EDITOR_BASE = '/__rhyla';

const normSlug = (s) => String(s || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.(md|html)$/i, '');

/**
 * Registra a interface e a API do editor de fluxos no app do dev server.
 *
 * GET  /__rhyla/flow-editor            tela do editor (?flow=flows/checkout)
 * GET  /__rhyla/api/pages              páginas existentes (para escolher passos)
 * GET  /__rhyla/api/flow?slug=…        fluxo em formato editável
 * POST /__rhyla/api/flow/preview       diagrama + avisos para um rascunho
 * PUT  /__rhyla/api/flow               grava o fluxo (cria ou atualiza o .md)
 * POST /__rhyla/api/page               cria uma página nova (stub)
 *
 * GET  /__rhyla/page-editor            tela do editor de páginas (?page=guide/install)
 * GET  /__rhyla/api/page?slug=…        página em blocos + frontmatter
 * PUT  /__rhyla/api/page               grava frontmatter + markdown de uma página existente
 * POST /__rhyla/api/upload?name=…      envia uma imagem para public/uploads
 */
export function registerEditorRoutes(app, { bodyPath, publicPath, context, allPages, log }) {
  const root = path.resolve(bodyPath);

  // Caminho seguro dentro de body/ para um slug
  function fileFor(slug) {
    const clean = normSlug(slug);
    if (!clean || !/^[\w\-./]+$/.test(clean) || clean.split('/').some((p) => p === '..' || p === '.')) return null;
    const file = path.resolve(root, `${clean}.md`);
    if (!file.startsWith(root + path.sep)) return null;
    // Uma página .html no mesmo caminho seria escondida pelo novo .md
    return { slug: clean, file, htmlTwin: fs.existsSync(path.resolve(root, `${clean}.html`)) };
  }

  const hrefFor = (slug) => (slug === 'home' ? '/' : `/${slug}.html`);

  app.get(`${EDITOR_BASE}/editor/blocks.js`, (req, res) => res.type('application/javascript').sendFile(BLOCKS_MODULE));
  app.use(`${EDITOR_BASE}/editor`, express.static(EDITOR_DIR));
  app.get(`${EDITOR_BASE}/flow-editor`, (req, res) => res.sendFile(path.join(EDITOR_DIR, 'flow-editor.html')));
  app.get(`${EDITOR_BASE}/page-editor`, (req, res) => res.sendFile(path.join(EDITOR_DIR, 'page-editor.html')));

  // ===== Editor de páginas =====
  app.get(`${EDITOR_BASE}/api/page`, (req, res) => {
    const target = fileFor(req.query.slug);
    if (!target) return res.status(400).json({ error: 'Invalid page path' });
    if (!fs.existsSync(target.file)) {
      return res.status(target.htmlTwin ? 400 : 404).json({ error: target.htmlTwin ? 'HTML pages are edited in code, not in the page editor.' : `No page at ${target.slug}` });
    }
    const { data, content } = matter(fs.readFileSync(target.file, 'utf8'));
    res.json({
      slug: target.slug,
      url: hrefFor(target.slug),
      data,
      isFlow: data.type === 'flow',
      blocks: parseBlocks(content),
    });
  });

  app.put(`${EDITOR_BASE}/api/page`, express.json({ limit: '5mb' }), (req, res) => {
    const { slug, data: fields = {}, markdown } = req.body || {};
    const target = fileFor(slug);
    if (!target) return res.status(400).json({ error: 'Invalid page path' });
    if (!fs.existsSync(target.file)) return res.status(404).json({ error: `No page at ${target.slug}` });
    if (typeof markdown !== 'string') return res.status(400).json({ error: 'markdown is required' });

    // Só os campos editados no painel; o resto do frontmatter (type, steps…) é preservado
    const data = matter(fs.readFileSync(target.file, 'utf8')).data || {};
    for (const key of ['title', 'description']) {
      if (key in fields) { const v = String(fields[key] ?? '').trim(); if (v) data[key] = v; else delete data[key]; }
    }
    if ('order' in fields) {
      const n = Number(fields.order);
      if (fields.order === '' || fields.order === null || !Number.isFinite(n)) delete data.order; else data.order = n;
    }
    const body = markdown.trim() ? `\n${markdown.replace(/^\n+/, '').replace(/\s+$/, '')}\n` : '\n';
    fs.writeFileSync(target.file, Object.keys(data).length ? matter.stringify(body, data) : body.replace(/^\n/, ''), 'utf8');
    log(`✏️  Page saved: ${target.slug}`);
    res.json({ ok: true, slug: target.slug, url: hrefFor(target.slug) });
  });

  app.post(`${EDITOR_BASE}/api/upload`, express.raw({ type: () => true, limit: '15mb' }), (req, res) => {
    const original = String(req.query.name || 'image').split(/[\\/]/).pop();
    const ext = (original.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i) || [])[0];
    if (!ext) return res.status(400).json({ error: 'Only images (png, jpg, gif, webp, svg, avif) can be uploaded' });
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'Empty file' });
    const base = original.slice(0, -ext.length).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    const dir = path.join(publicPath, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    let name = `${base}${ext.toLowerCase()}`;
    for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${base}-${n}${ext.toLowerCase()}`;
    fs.writeFileSync(path.join(dir, name), req.body);
    log(`🖼️  Uploaded public/uploads/${name}`);
    res.json({ ok: true, src: `/public/uploads/${name}` });
  });

  app.get(`${EDITOR_BASE}/api/pages`, (req, res) => {
    const pages = allPages(context()).map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description || '',
      type: p.data && p.data.type === 'flow' ? 'flow' : 'page',
    }));
    res.json({ pages });
  });

  app.get(`${EDITOR_BASE}/api/flow`, (req, res) => {
    const target = fileFor(req.query.slug);
    if (!target) return res.status(400).json({ error: 'Invalid slug' });
    if (!fs.existsSync(target.file)) return res.status(404).json({ error: `No page at ${target.slug}` });
    const { data, content } = matter(fs.readFileSync(target.file, 'utf8'));
    if (data.type !== 'flow') return res.status(400).json({ error: `${target.slug} is not a flow (missing "type: flow")` });
    res.json({
      slug: target.slug,
      title: data.title || '',
      description: data.description || '',
      start: data.start || '',
      steps: editableSteps(data.steps),
      body: content.replace(/^\n+/, ''),
    });
  });

  app.post(`${EDITOR_BASE}/api/flow/preview`, (req, res) => {
    const { slug = 'flows/draft', title = 'Draft', steps = [], start } = req.body || {};
    const draft = {
      slug: normSlug(slug) || 'flows/draft',
      title: String(title || 'Draft'),
      description: '',
      data: { type: 'flow', steps: compactSteps(steps), start: start || undefined },
    };
    // O rascunho substitui a versão salva (se houver) para resolver as páginas dos passos
    const pages = allPages(context()).filter((p) => p.slug !== draft.slug).concat(draft);
    const flow = buildFlowGraph(pages).flows.find((f) => f.slug === draft.slug);
    res.json({ svg: renderFlowDiagram(flow, { hrefFor }), warnings: flow.warnings });
  });

  app.put(`${EDITOR_BASE}/api/flow`, (req, res) => {
    const { slug, title, description, start, steps, body } = req.body || {};
    const target = fileFor(slug);
    if (!target) return res.status(400).json({ error: 'Invalid file path. Use letters, numbers, "-", "_" and "/".' });
    if (!String(title || '').trim()) return res.status(400).json({ error: 'Title is required' });
    if (target.htmlTwin) return res.status(409).json({ error: `${target.slug}.html already exists. Choose another file path.` });

    // Mantém campos do frontmatter que o editor não conhece (order, etc.)
    let data = {};
    let existingBody = '';
    if (fs.existsSync(target.file)) {
      const parsed = matter(fs.readFileSync(target.file, 'utf8'));
      data = parsed.data || {};
      existingBody = parsed.content;
      // Nunca transforma uma página comum em fluxo
      if (data.type !== 'flow') return res.status(409).json({ error: `${target.slug} already exists and is not a flow. Choose another file path.` });
    }
    data = { ...data, title: String(title).trim(), type: 'flow' };
    if (description) data.description = String(description); else delete data.description;
    if (start) data.start = String(start); else delete data.start;
    data.steps = compactSteps(steps);

    const text = typeof body === 'string' ? body : existingBody;
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, matter.stringify(text.trim() ? `\n${text.trim()}\n` : '\n', data), 'utf8');
    log(`🔀 Flow saved: ${target.slug}`);
    res.json({ ok: true, slug: target.slug, url: hrefFor(target.slug) });
  });

  app.post(`${EDITOR_BASE}/api/page`, (req, res) => {
    const { slug, title } = req.body || {};
    const target = fileFor(slug);
    if (!target) return res.status(400).json({ error: 'Invalid file path. Use letters, numbers, "-", "_" and "/".' });
    if (fs.existsSync(target.file) || target.htmlTwin) return res.status(409).json({ error: `${target.slug} already exists` });
    const name = String(title || target.slug.split('/').pop().replace(/[-_]+/g, ' ')).trim();
    fs.mkdirSync(path.dirname(target.file), { recursive: true });
    fs.writeFileSync(target.file, matter.stringify(`\n# ${name}\n\nWrite this page.\n`, { title: name }), 'utf8');
    log(`📝 Page created: ${target.slug}`);
    res.json({ ok: true, slug: target.slug, title: name });
  });
}
