import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import {
  documentListQuerySchema,
  roleSchema,
  type CorpusDocument,
  type DocumentListResponse,
  type IndexHealth,
  type IngestionRun,
  type SearchStats,
} from '@corpus/shared';
import { runIngestion, loadCorpus, EMBEDDING_DIMENSIONS } from '@corpus/rag';
import type { AppContext } from '../context.js';
import type { RagContext } from '../rag.js';
import { badRequest, notFound } from '../errors.js';
import { listUsers, updateUserRole } from '../auth/users.js';

/** SQLite `datetime('now')` is `YYYY-MM-DD HH:MM:SS` with no zone marker. */
function toIso(value: string | null): string | null {
  if (!value) return null;
  if (value.includes('T')) return new Date(value).toISOString();
  return new Date(`${value.replace(' ', 'T')}Z`).toISOString();
}

interface DocumentRow {
  id: string;
  path: string;
  title: string;
  doc_type: CorpusDocument['docType'];
  doc_date: string | null;
  status: CorpusDocument['status'];
  chunk_count: number;
  indexed_at: string | null;
  error: string | null;
}

function toDocument(row: DocumentRow): CorpusDocument {
  return {
    id: row.id,
    path: row.path,
    title: row.title,
    docType: row.doc_type,
    docDate: row.doc_date,
    status: row.status,
    chunkCount: row.chunk_count,
    indexedAt: toIso(row.indexed_at),
    error: row.error,
  };
}

/**
 * Everything here is admin-only. The case asks that corpus management and the
 * dashboard be closed to regular users, and the enforcement lives on the route
 * rather than in the UI that hides the link.
 */
export function registerCorpusRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  rag: RagContext,
  guards: { requireAuth: preHandlerHookHandler; requireAdmin: preHandlerHookHandler },
): void {
  const adminOnly = { preHandler: [guards.requireAuth, guards.requireAdmin] };

  app.get('/documents', adminOnly, async (request) => {
    const parsed = documentListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw badRequest(
        'Invalid document query.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const { docType, status, q, limit, offset } = parsed.data;
    const filters: string[] = [];
    const params: (string | number)[] = [];

    if (docType) {
      filters.push('doc_type = ?');
      params.push(docType);
    }
    if (status) {
      filters.push('status = ?');
      params.push(status);
    }
    if (q) {
      filters.push('(title like ? or path like ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const where = filters.length > 0 ? `where ${filters.join(' and ')}` : '';

    const { total } = ctx.db
      .prepare(`select count(*) as total from documents ${where}`)
      .get(...params) as { total: number };

    const rows = ctx.db
      .prepare(`select * from documents ${where} order by path limit ? offset ?`)
      .all(...params, limit, offset) as DocumentRow[];

    const body: DocumentListResponse = { documents: rows.map(toDocument), total };
    return body;
  });

  app.get('/documents/:id', adminOnly, async (request) => {
    const { id } = request.params as { id: string };
    const row = ctx.db.prepare('select * from documents where id = ?').get(id) as
      DocumentRow | undefined;
    if (!row) throw notFound('No such document.');

    const chunks = ctx.db
      .prepare(
        'select id, ordinal, heading, text, token_count as tokenCount from chunks where document_id = ? order by ordinal',
      )
      .all(id);

    return { document: toDocument(row), chunks };
  });

  app.get('/ingestion/runs', adminOnly, async () => {
    const rows = ctx.db
      .prepare('select * from ingestion_runs order by started_at desc limit 20')
      .all() as Record<string, unknown>[];

    const runs: IngestionRun[] = rows.map((row) => ({
      id: row['id'] as string,
      startedAt: toIso(row['started_at'] as string)!,
      finishedAt: toIso(row['finished_at'] as string | null),
      status: row['status'] as IngestionRun['status'],
      added: row['added'] as number,
      updated: row['updated'] as number,
      removed: row['removed'] as number,
      unchanged: row['unchanged'] as number,
      failed: row['failed'] as number,
      embedderId: row['embedder_id'] as string,
      error: row['error'] as string | null,
    }));

    return { runs };
  });

  /**
   * Triggers ingestion. Runs to completion before responding rather than
   * returning a job id: a full re-index of this corpus takes ~30s and an
   * incremental one under a second, so a job queue would be machinery with
   * nothing to manage.
   */
  app.post('/ingestion/run', adminOnly, async (request) => {
    const force = (request.body as { force?: boolean } | undefined)?.force ?? false;

    const run = await runIngestion({
      db: ctx.db,
      store: rag.store,
      embedder: rag.embedder,
      corpusDir: ctx.config.CORPUS_DIR,
      force,
    });

    return { run };
  });

  app.get('/index/health', adminOnly, async () => {
    const stats = ctx.db
      .prepare(
        `select
           (select count(*) from documents)                          as documentCount,
           (select count(*) from chunks)                             as chunkCount,
           (select count(*) from documents where status = 'failed')  as failedDocumentCount,
           (select max(indexed_at) from documents)                   as lastIngestionAt,
           (select embedder_id from documents where embedder_id is not null limit 1) as embedderId`,
      )
      .get() as {
      documentCount: number;
      chunkCount: number;
      failedDocumentCount: number;
      lastIngestionAt: string | null;
      embedderId: string | null;
    };

    // Staleness is measured against disk, not guessed from a timestamp: count
    // the files whose content hash differs from what is indexed.
    const onDisk = await loadCorpus(ctx.config.CORPUS_DIR);
    const indexed = new Map(
      (
        ctx.db.prepare('select path, content_hash from documents').all() as {
          path: string;
          content_hash: string;
        }[]
      ).map((row) => [row.path, row.content_hash]),
    );

    const stale =
      onDisk.length !== indexed.size ||
      onDisk.some((doc) => indexed.get(doc.path) !== doc.contentHash);

    const body: IndexHealth = {
      documentCount: stats.documentCount,
      chunkCount: stats.chunkCount,
      failedDocumentCount: stats.failedDocumentCount,
      embedderId: stats.embedderId ?? rag.embedder.id,
      dimensions: EMBEDDING_DIMENSIONS,
      lastIngestionAt: toIso(stats.lastIngestionAt),
      stale,
    };
    return body;
  });

  app.get('/analytics/search', adminOnly, async () => {
    const totals = ctx.db
      .prepare(
        `select
           count(*) as totalSearches,
           sum(case when created_at >= datetime('now', '-7 days') then 1 else 0 end) as searchesLast7Days,
           avg(answered) as answeredRate
         from search_logs`,
      )
      .get() as {
      totalSearches: number;
      searchesLast7Days: number | null;
      answeredRate: number | null;
    };

    // SQLite has no median function; at this volume, sorting in SQL and picking
    // the middle row is simpler than an approximation.
    const latencies = ctx.db
      .prepare('select latency_ms from search_logs order by latency_ms')
      .all() as { latency_ms: number }[];
    const medianLatencyMs =
      latencies.length === 0 ? 0 : (latencies[Math.floor(latencies.length / 2)]?.latency_ms ?? 0);

    const topQueries = ctx.db
      .prepare(
        `select query, count(*) as count from search_logs
          group by lower(query) order by count desc, query limit 10`,
      )
      .all() as { query: string; count: number }[];

    const recentUnanswered = (
      ctx.db
        .prepare(
          `select query, created_at from search_logs
            where answered = 0 order by created_at desc limit 10`,
        )
        .all() as { query: string; created_at: string }[]
    ).map((row) => ({ query: row.query, createdAt: toIso(row.created_at)! }));

    const body: SearchStats = {
      totalSearches: totals.totalSearches,
      searchesLast7Days: totals.searchesLast7Days ?? 0,
      answeredRate: totals.answeredRate ?? 0,
      medianLatencyMs,
      topQueries,
      recentUnanswered,
    };
    return body;
  });

  app.get('/admin/users', adminOnly, async () => ({ users: listUsers(ctx.db) }));

  app.patch('/admin/users/:id/role', adminOnly, async (request) => {
    const { id } = request.params as { id: string };
    const parsed = roleSchema.safeParse((request.body as { role?: unknown } | undefined)?.role);
    if (!parsed.success) throw badRequest('Role must be "user" or "admin".');

    // Without this an admin can demote themselves and lock the last admin out
    // of the dashboard, with no way back in through the UI.
    if (id === request.user?.sub && parsed.data !== 'admin') {
      throw badRequest('You cannot remove your own admin role.');
    }

    const updated = updateUserRole(ctx.db, id, parsed.data);
    if (!updated) throw notFound('No such user.');
    return { user: updated };
  });
}
