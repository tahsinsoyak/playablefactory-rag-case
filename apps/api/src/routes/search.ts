import { randomUUID } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  answerRequestSchema,
  searchRequestSchema,
  type AnswerEvent,
  type SearchResponse,
} from '@corpus/shared';
import type { RagContext } from '../rag.js';
import type { AppContext } from '../context.js';
import { badRequest } from '../errors.js';

interface SearchLogEntry {
  userId: string | null;
  query: string;
  mode: string;
  resultCount: number;
  topScore: number | null;
  answered: boolean;
  refusalReason: string | null;
  latencyMs: number;
}

/**
 * Analytics are written on a best-effort basis: a logging failure must never
 * turn a successful search into an error for the person who ran it.
 */
function logSearch(ctx: AppContext, entry: SearchLogEntry): void {
  try {
    ctx.db
      .prepare(
        `insert into search_logs
           (id, user_id, query, mode, result_count, top_score, answered, refusal_reason, latency_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        entry.userId,
        entry.query,
        entry.mode,
        entry.resultCount,
        entry.topScore,
        entry.answered ? 1 : 0,
        entry.refusalReason,
        entry.latencyMs,
      );
  } catch {
    // Intentionally swallowed; see above.
  }
}

export function registerSearchRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  rag: RagContext,
  requireAuth: preHandlerHookHandler,
): void {
  app.post('/search', { preHandler: [requireAuth] }, async (request) => {
    const parsed = searchRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(
        'Invalid search request.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const startedAt = Date.now();
    const hits = await rag.retriever.search(parsed.data);
    const latencyMs = Date.now() - startedAt;

    logSearch(ctx, {
      userId: request.user?.sub ?? null,
      query: parsed.data.query,
      mode: parsed.data.mode,
      resultCount: hits.length,
      topScore: hits[0]?.score ?? null,
      answered: hits.length > 0,
      refusalReason: null,
      latencyMs,
    });

    const body: SearchResponse = {
      query: parsed.data.query,
      mode: parsed.data.mode,
      hits,
      latencyMs,
    };
    return body;
  });

  /**
   * Streams a grounded answer as server-sent events.
   *
   * SSE rather than a websocket: the traffic is one-directional and short-lived,
   * so a plain HTTP response with `text/event-stream` needs no extra protocol on
   * either side. Retrieval is emitted first, so the UI can render passages while
   * the answer is still being written.
   */
  app.post('/answer', { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = answerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(
        'Invalid answer request.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Without this, an nginx in front of the API buffers the whole stream and
      // the "streaming" answer arrives all at once.
      'X-Accel-Buffering': 'no',
    });

    const send = (event: AnswerEvent): void => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    let resultCount = 0;
    let topScore: number | null = null;
    const startedAt = Date.now();

    try {
      for await (const event of rag.answerService.answer(parsed.data)) {
        if (event.type === 'retrieval') {
          resultCount = event.hits.length;
          topScore = event.hits[0]?.score ?? null;
        }

        if (event.type === 'done') {
          logSearch(ctx, {
            userId: request.user?.sub ?? null,
            query: parsed.data.question,
            mode: parsed.data.mode,
            resultCount,
            topScore,
            answered: event.result.status === 'answered',
            refusalReason: event.result.status === 'refused' ? event.result.reason : null,
            latencyMs: event.latencyMs,
          });
        }

        send(event);
      }
    } catch (error) {
      // The headers are already sent, so the normal error handler cannot help:
      // the failure has to be reported inside the stream it interrupted.
      request.log.error({ err: error }, 'answer stream failed');
      send({
        type: 'error',
        code: 'internal',
        message: 'The answer stream failed. Please try again.',
      });

      logSearch(ctx, {
        userId: request.user?.sub ?? null,
        query: parsed.data.question,
        mode: parsed.data.mode,
        resultCount,
        topScore,
        answered: false,
        refusalReason: 'error',
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      reply.raw.end();
    }

    return reply;
  });
}
