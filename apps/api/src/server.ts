import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { ZodError } from 'zod';
import { databaseVersions } from '@corpus/rag';
import type { ApiError } from '@corpus/shared';
import type { AppContext } from './context.js';
import { HttpError } from './errors.js';
import { createRequireAuth, requireRole } from './auth/middleware.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerCorpusRoutes } from './routes/corpus.js';
import { createRagContext } from './rag.js';

export async function buildServer(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: ctx.config.NODE_ENV === 'test' ? false : { level: 'info' },
    // Trusting the proxy is what makes `request.ip` meaningful behind one; it is
    // off by default because trusting it when there is no proxy lets a client
    // spoof its own address via X-Forwarded-For.
    trustProxy: ctx.config.NODE_ENV === 'production',
  });

  await app.register(cookie);

  // The browser must send credentials cross-origin (the web app and API are on
  // different ports), so the allowed origin has to be an exact match - `*` is
  // rejected by browsers alongside `credentials: include`.
  //
  // In development any loopback origin is accepted, because Next prints a LAN
  // URL alongside the localhost one and opening either is reasonable; matching
  // only the configured origin turns that into an opaque "Failed to fetch". In
  // production the allowed origin is exactly WEB_ORIGIN and nothing else.
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return false;
    if (origin === ctx.config.WEB_ORIGIN) return true;
    if (ctx.config.NODE_ENV === 'production') return false;

    try {
      const { hostname } = new URL(origin);
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    } catch {
      return false;
    }
  };

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (isAllowedOrigin(origin) && origin) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Vary', 'Origin');
    }

    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      reply.header('Access-Control-Allow-Headers', 'content-type,authorization');
      reply.header('Access-Control-Max-Age', '86400');
      return reply.code(204).send();
    }

    return undefined;
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      const body: ApiError = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
      return reply.code(error.status).send(body);
    }

    if (error instanceof ZodError) {
      const body: ApiError = {
        error: {
          code: 'bad_request',
          message: 'Request validation failed.',
          details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      };
      return reply.code(400).send(body);
    }

    // Fastify's own errors (malformed JSON, empty body) arrive as plain objects
    // carrying a code, not as one of our types.
    const fastifyError = error as { statusCode?: number; code?: string };
    if (fastifyError.statusCode === 400 || fastifyError.code?.startsWith('FST_ERR_CTP_')) {
      const body: ApiError = {
        error: { code: 'bad_request', message: 'The request body could not be read as JSON.' },
      };
      return reply.code(400).send(body);
    }

    // Anything reaching here is a bug. Log the detail, return none: an error
    // message can leak schema, paths, or query structure to a caller.
    request.log.error({ err: error }, 'unhandled error');
    const body: ApiError = {
      error: { code: 'internal', message: 'Something went wrong. Please try again.' },
    };
    return reply.code(500).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiError = { error: { code: 'not_found', message: 'No such endpoint.' } };
    return reply.code(404).send(body);
  });

  const requireAuth = createRequireAuth(ctx.config.JWT_ACCESS_SECRET);

  app.get('/health', async () => {
    const versions = databaseVersions(ctx.db);
    return { status: 'ok', sqlite: versions.sqlite, vec: versions.vec };
  });

  const requireAdmin = requireRole('admin');
  const rag = createRagContext(ctx.db, ctx.config);

  await registerAuthRoutes(app, ctx);
  registerSearchRoutes(app, ctx, rag, requireAuth);
  registerCorpusRoutes(app, ctx, rag, { requireAuth, requireAdmin });

  return app;
}
