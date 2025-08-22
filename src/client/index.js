import path from 'path';
import fs from 'fs';
import express from 'express';

export const RhylaClient = {
    /**
     * Configura um app Express para servir a pasta dist sob um prefixo.
     * @param {import('express').Express} app
     * @param {string} base e.g. '/docs'
     * @param {object} options { distDir?: string }
     */
    expressConfig(app, base = '/', options = {}) {
        // Normaliza o caminho base
        let basePath = base || '/';
        if (!basePath.startsWith('/')) basePath = '/' + basePath;
        if (basePath !== '/' && basePath.endsWith('/')) basePath = basePath.slice(0, -1);
        
        // Define o caminho para a pasta dist
        const distDir = options.distDir || path.join(process.cwd(), 'dist');
        
        // Verifica se existe config.json para obter base configurada
        let configBase = null;
        try {
            const configPath = path.join(distDir, 'config.json');
            if (fs.existsSync(configPath)) {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config && typeof config.base === 'string' && config.base.trim()) {
                    configBase = config.base.trim();
                    if (!configBase.startsWith('/')) configBase = '/' + configBase;
                    if (configBase.endsWith('/')) configBase = configBase.slice(0, -1);
                }
            }
        } catch (e) {
            console.warn('Erro ao ler config.json:', e.message);
        }
        
        // Prioriza basePath passado como parâmetro sobre configBase
        const effectiveBase = basePath !== '/' ? basePath : (configBase || '/');
        
        // Helper para adicionar base path a uma URL e evitar duplicação
        const withBase = (url) => {
            if (effectiveBase === '/') return url;
            
            // Se url já começa com base, verifica se não tem duplicação
            if (url.startsWith(effectiveBase)) {
                // Remove base duplicada se existir
                const basePart = effectiveBase.replace(/^\//, '');
                const regex = new RegExp(`^${effectiveBase}\\/${basePart}\\/`, 'i');
                return url.replace(regex, `${effectiveBase}/`);
            }
            
            // Remove / inicial do url para evitar dupla barra
            const cleanUrl = url.startsWith('/') ? url.substring(1) : url;
            return `${effectiveBase}/${cleanUrl}`;
        };
        
        // Middleware de reescrita para injetar base path em HTML
        const injectBasePath = (req, res, next) => {
            // Guarda o método original de envio
            const originalSend = res.send;
            
            // Sobrescreve o método send para injetar basePath quando necessário
            res.send = function(body) {
                // Só reescreve respostas HTML
                const isHTML = res.get('Content-Type')?.includes('html');
                if (isHTML && typeof body === 'string' && effectiveBase !== '/') {
                    // Injeta meta tag com base path
                    if (!/<meta\s+name=["']rhyla-base["']/i.test(body)) {
                        body = body.replace(/<head[^>]*>/i, match => 
                            `${match}\n  <meta name="rhyla-base" content="${effectiveBase}/">\n`
                        );
                    }
                    
                    // Reescreve URLs absolutas para incluir o basePath
                    body = body.replace(
                        /\s(src|href)=["'](?!(?:https?:|\/\/))\/([^"']+)["']/gi,
                        (match, attr, path) => {
                            // Remove / inicial para evitar dupla barra
                            const cleanPath = path.startsWith('/') ? path.substring(1) : path;
                            return ` ${attr}="${effectiveBase}/${cleanPath}"`;
                        }
                    );
                }
                
                // Chama o método original
                return originalSend.call(this, body);
            };
            
            next();
        };
        
        // Aplica middleware de injeção de basePath
        app.use(injectBasePath);
        
        // Rota para servir arquivos estáticos
        app.use(effectiveBase, express.static(distDir, { extensions: ['html'] }));
        
        // Função para normalizar caminhos e remover duplicações
        function normalizePathParts(urlPath) {
            // Remove o prefixo base para trabalhar com o caminho relativo
            const withoutBase = urlPath.replace(new RegExp(`^${effectiveBase}`), '');
            const parts = withoutBase.split('/').filter(Boolean);
            
            // Remove duplicações consecutivas de partes do caminho
            const dedupedParts = [];
            for (let i = 0; i < parts.length; i++) {
                if (i < parts.length - 1 && parts[i] === parts[i+1]) {
                    continue; // Pula duplicações consecutivas
                }
                dedupedParts.push(parts[i]);
            }
            
            return '/' + dedupedParts.join('/');
        }
        
        // Rota para servir arquivos .html quando o usuário acessa sem extensão
        app.get(withBase('*'), (req, res, next) => {
            // Verifica e corrige duplicação do prefixo na URL
            const cleanBase = effectiveBase.replace(/^\//, '');
            const dupRegex = new RegExp(`^\\/${cleanBase}\\/${cleanBase}(\\/|$)`, 'i');
            
            if (dupRegex.test(req.path)) {
                // Redireciona para a URL corrigida se detectar duplicação
                const correctedPath = req.path.replace(dupRegex, `/${cleanBase}$1`);
                return res.redirect(301, correctedPath);
            }
            
            // Verifica e corrige duplicações de partes do caminho
            const pathParts = req.path.split('/').filter(Boolean);
            for (let i = 0; i < pathParts.length - 1; i++) {
                if (pathParts[i] === pathParts[i+1]) {
                    // Encontrou uma duplicação, redirecionar para a URL normalizada
                    const normalizedPath = normalizePathParts(req.path);
                    return res.redirect(301, effectiveBase + normalizedPath);
                }
            }
            
            // Remove basePath da URL para encontrar o arquivo correto
            const urlPath = normalizePathParts(req.path);
            const candidate = path.join(distDir, urlPath.replace(/\/$/, '') + '.html');
            
            if (fs.existsSync(candidate)) {
                return res.sendFile(candidate);
            }
            next();
        });
        
        // Fallback SPA para todas as rotas não encontradas
        app.get(withBase('*'), (req, res) => {
            res.sendFile(path.join(distDir, 'index.html'));
        });
    }
};

// Exporta como default para compatibilidade
export default RhylaClient;
