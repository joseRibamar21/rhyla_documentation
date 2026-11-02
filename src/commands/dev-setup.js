import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { EDITOR_BASE } from './dev-editor.js';
import { LOGO_MAX_BYTES, writeLogo } from '../core/setup.js';
import { MAX_SOURCE_BYTES } from '../core/import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = path.join(__dirname, '../editor');

/**
 * Wizard de configuração da documentação (só no `rhyla dev`).
 *
 * GET  /__rhyla/setup              tela do wizard
 * GET  /__rhyla/api/setup          projeto (arquivos, linhas, rotas) + preferências atuais
 * POST /__rhyla/api/setup          salva as respostas
 * GET  /__rhyla/api/setup/status   progresso da geração (páginas planejadas e escritas)
 * POST /__rhyla/api/setup/logo?name=x.png   envia a logo para public/logo.<ext>
 * POST /__rhyla/api/setup/source           prévia de uma especificação { kind: file|url, path|url }
 * POST /__rhyla/api/setup/source/upload?name=x.json   prévia de um arquivo enviado (fica na memória)
 *
 * @param {import('express').Express} app
 * @param {{ setup: ReturnType<import('../core/setup.js').createSetup>, publicPath: string, log: Function }} deps
 */
export function registerSetupRoutes(app, { setup, publicPath, log }) {
  app.get(`${EDITOR_BASE}/setup`, (req, res) => res.sendFile(path.join(EDITOR_DIR, 'setup.html')));

  app.get(`${EDITOR_BASE}/api/setup`, (req, res) => res.json(setup.info()));

  app.post(`${EDITOR_BASE}/api/setup`, express.json({ limit: '64kb' }), async (req, res) => {
    try {
      const preferences = await setup.submit(req.body || {});
      log(`⚙️  Docs preferences saved (${preferences.mode})`);
      res.json({ ok: true, preferences });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get(`${EDITOR_BASE}/api/setup/status`, (req, res) => res.json(setup.status()));

  // Primeiro passo: prévia de uma especificação do projeto ou de uma URL, ou de um arquivo enviado
  app.post(`${EDITOR_BASE}/api/setup/source`, express.json({ limit: '16kb' }), async (req, res) => {
    try {
      res.json(await setup.preview(req.body || {}));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  app.post(`${EDITOR_BASE}/api/setup/source/upload`, express.raw({ type: () => true, limit: MAX_SOURCE_BYTES + 1024 }), (req, res) => {
    try {
      res.json(setup.upload(req.query.name, req.body));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // A logo fica em public/logo.<ext>; uma logo anterior com outra extensão é apagada
  app.post(`${EDITOR_BASE}/api/setup/logo`, express.raw({ type: () => true, limit: LOGO_MAX_BYTES + 1024 }), (req, res) => {
    try {
      const src = writeLogo(publicPath, String(req.query.name || ''), Buffer.isBuffer(req.body) ? req.body : null);
      log(`🖼️  Logo saved: ${src.slice(1)}`);
      res.json({ ok: true, src });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}
