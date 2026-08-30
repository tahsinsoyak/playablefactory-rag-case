import { randomUUID } from 'node:crypto';
import type { IngestionRun } from '@corpus/shared';
import type { ChunkRecord, Embedder, VectorStore } from '../ports/index.js';
import { chunkDocument } from '../chunking/chunker.js';
import { loadCorpus, type LoadedDocument } from '../corpus/loader.js';
import type { Db } from '../store/database.js';

export interface IngestOptions {
  db: Db;
  store: VectorStore;
  embedder: Embedder;
  corpusDir: string;
  /**
   * Re-embeds every document even when its hash is unchanged. Needed after a
   * chunking change, which the content hash cannot see.
   */
  force?: boolean;
  onProgress?: (event: IngestProgress) => void;
}

export type IngestProgress =
  | { type: 'scanned'; total: number }
  | { type: 'document'; path: string; action: 'added' | 'updated' | 'removed' | 'unchanged' }
  | { type: 'failed'; path: string; error: string };

interface IndexedRow {
  id: string;
  path: string;
  content_hash: string;
  embedder_id: string | null;
}

/**
 * One ingestion pass.
 *
 * Incremental by content hash: a document is re-embedded only when its text
 * changed, when it is new, or when the index was built by a different embedder.
 * Documents that vanished from disk are removed. This is what makes the pipeline
 * re-runnable — and what makes it a self-updating one, since re-running it is
 * the whole update mechanism.
 */
export async function runIngestion(options: IngestOptions): Promise<IngestionRun> {
  const { db, store, embedder, corpusDir, force = false, onProgress } = options;

  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  db.prepare(
    `insert into ingestion_runs (id, started_at, status, embedder_id)
     values (?, ?, 'running', ?)`,
  ).run(runId, startedAt, embedder.id);

  const counts = { added: 0, updated: 0, removed: 0, unchanged: 0, failed: 0 };

  try {
    const documents = await loadCorpus(corpusDir);
    onProgress?.({ type: 'scanned', total: documents.length });

    const indexed = new Map(
      (
        db
          .prepare('select id, path, content_hash, embedder_id from documents')
          .all() as IndexedRow[]
      ).map((row) => [row.path, row]),
    );

    const seenPaths = new Set<string>();

    for (const document of documents) {
      seenPaths.add(document.path);
      const existing = indexed.get(document.path);

      // An index built by a different embedder is not comparable with new
      // vectors, so a changed embedder forces a rebuild even for identical text.
      const embedderChanged = existing?.embedder_id !== embedder.id;
      const contentChanged = existing?.content_hash !== document.contentHash;

      if (existing && !contentChanged && !embedderChanged && !force) {
        counts.unchanged += 1;
        onProgress?.({ type: 'document', path: document.path, action: 'unchanged' });
        continue;
      }

      try {
        await indexDocument({ db, store, embedder, document, existingId: existing?.id });

        if (existing) {
          counts.updated += 1;
          onProgress?.({ type: 'document', path: document.path, action: 'updated' });
        } else {
          counts.added += 1;
          onProgress?.({ type: 'document', path: document.path, action: 'added' });
        }
      } catch (error) {
        // One bad document must not abandon the other 141. Its failure is
        // recorded on the row so the dashboard can show what is missing and why.
        counts.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        recordFailure(db, document, existing?.id, message);
        onProgress?.({ type: 'failed', path: document.path, error: message });
      }
    }

    for (const [path, row] of indexed) {
      if (seenPaths.has(path)) continue;
      await store.deleteDocumentChunks(row.id);
      db.prepare('delete from documents where id = ?').run(row.id);
      counts.removed += 1;
      onProgress?.({ type: 'document', path, action: 'removed' });
    }

    return finishRun(db, runId, startedAt, counts, embedder.id, null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finishRun(db, runId, startedAt, counts, embedder.id, message);
  }
}

interface IndexDocumentInput {
  db: Db;
  store: VectorStore;
  embedder: Embedder;
  document: LoadedDocument;
  existingId?: string | undefined;
}

async function indexDocument(input: IndexDocumentInput): Promise<void> {
  const { db, store, embedder, document, existingId } = input;

  const documentId = existingId ?? randomUUID();
  const chunks = chunkDocument(document);
  const embeddings = await embedder.embed(chunks.map((chunk) => chunk.embedText));

  const records: ChunkRecord[] = chunks.map((chunk) => ({
    id: randomUUID(),
    documentId,
    ordinal: chunk.ordinal,
    heading: chunk.heading,
    text: chunk.text,
    tokenCount: chunk.tokenCount,
  }));

  db.prepare(
    `insert into documents
       (id, path, title, doc_type, doc_date, content_hash, status, chunk_count, embedder_id, indexed_at, error)
     values (?, ?, ?, ?, ?, ?, 'indexed', ?, ?, datetime('now'), null)
     on conflict (path) do update set
       title = excluded.title,
       doc_type = excluded.doc_type,
       doc_date = excluded.doc_date,
       content_hash = excluded.content_hash,
       status = 'indexed',
       chunk_count = excluded.chunk_count,
       embedder_id = excluded.embedder_id,
       indexed_at = excluded.indexed_at,
       error = null`,
  ).run(
    documentId,
    document.path,
    document.title,
    document.docType,
    document.docDate,
    document.contentHash,
    chunks.length,
    embedder.id,
  );

  await store.replaceDocumentChunks(documentId, records, embeddings);
}

function recordFailure(
  db: Db,
  document: LoadedDocument,
  existingId: string | undefined,
  message: string,
): void {
  db.prepare(
    `insert into documents
       (id, path, title, doc_type, doc_date, content_hash, status, chunk_count, error)
     values (?, ?, ?, ?, ?, ?, 'failed', 0, ?)
     on conflict (path) do update set
       status = 'failed',
       error = excluded.error`,
  ).run(
    existingId ?? randomUUID(),
    document.path,
    document.title,
    document.docType,
    document.docDate,
    document.contentHash,
    message,
  );
}

function finishRun(
  db: Db,
  runId: string,
  startedAt: string,
  counts: { added: number; updated: number; removed: number; unchanged: number; failed: number },
  embedderId: string,
  error: string | null,
): IngestionRun {
  const finishedAt = new Date().toISOString();
  // A run that hit an unrecoverable error failed; per-document failures do not
  // fail the run, because the rest of the corpus did get indexed.
  const status = error ? 'failed' : 'succeeded';

  db.prepare(
    `update ingestion_runs
        set finished_at = ?, status = ?, added = ?, updated = ?, removed = ?,
            unchanged = ?, failed = ?, error = ?
      where id = ?`,
  ).run(
    finishedAt,
    status,
    counts.added,
    counts.updated,
    counts.removed,
    counts.unchanged,
    counts.failed,
    error,
    runId,
  );

  return {
    id: runId,
    startedAt,
    finishedAt,
    status,
    ...counts,
    embedderId,
    error,
  };
}
