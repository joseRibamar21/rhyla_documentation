// Tipos de rhyla/serve: o site do `rhyla build` (dist/) servido dentro de uma API.
import type { IncomingMessage, ServerResponse } from 'http';

export interface RhylaServeOptions {
  /** Pasta do build, relativa a `cwd` (padrão "dist"). */
  dir?: string;
  /** Raiz do projeto (padrão process.cwd()). */
  cwd?: string;
  /** Caminho de montagem, quando o framework não informa (Express informa sozinho). */
  base?: string;
  /** Sem avisos no console (build ausente, base diferente, dist/ desatualizado). */
  quiet?: boolean;
}

/** Middleware Node (Express, Connect, Nest com Express): `app.use('/docs', rhyla())`. */
export function rhyla(options?: RhylaServeOptions): (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void;

/** Plugin do Fastify: `await app.register(fastifyRhyla, { prefix: '/docs' })`. */
export function fastifyRhyla(fastify: any, options: RhylaServeOptions & { prefix?: string }, done?: (err?: Error) => void): void;

/** Handler Request → Response (Hono, Next.js, Bun, Deno); `base` padrão "/docs". */
export function rhylaFetch(options?: RhylaServeOptions): (request: Request) => Promise<Response>;

export default rhyla;
