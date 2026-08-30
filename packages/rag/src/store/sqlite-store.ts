import type { ChunkRecord, ScoredChunk, VectorStore } from '../ports/index.js';
import type { Db } from './database.js';

/**
 * The single implementation of `VectorStore`, backed by sqlite-vec for the
 * vector half and FTS5 for the keyword half — both in one SQLite file, so a
 * document's chunks land in both indexes inside one transaction or in neither.
 *
 * A pgvector adapter would implement this same interface; nothing above this
 * file knows which one it is talking to.
 */
export class SqliteVectorStore implements VectorStore {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  /**
   * Replaces every chunk of one document.
   *
   * Delete-then-insert rather than a diff: a document's chunk boundaries move
   * when its text changes, so chunk N of the old version is rarely chunk N of
   * the new one. At this corpus size the rewrite costs nothing and removes a
   * whole class of stale-chunk bug.
   */
  async replaceDocumentChunks(
    documentId: string,
    chunks: ChunkRecord[],
    embeddings: Float32Array[],
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Chunk/embedding count mismatch for document ${documentId}: ${chunks.length} chunks, ${embeddings.length} embeddings.`,
      );
    }

    const deleteExisting = this.#buildDelete();
    const insertChunk = this.#db.prepare(
      `insert into chunks (id, document_id, ordinal, heading, text, token_count)
       values (?, ?, ?, ?, ?, ?)`,
    );
    const insertRowid = this.#db.prepare(
      'insert into chunk_rowids (chunk_id) values (?) returning chunk_rowid',
    );
    const insertVector = this.#db.prepare(
      'insert into vec_chunks (chunk_rowid, embedding) values (?, ?)',
    );
    const insertFts = this.#db.prepare(
      'insert into chunks_fts (rowid, text, heading) values (?, ?, ?)',
    );

    const write = this.#db.transaction(() => {
      deleteExisting(documentId);

      for (const [index, chunk] of chunks.entries()) {
        insertChunk.run(
          chunk.id,
          documentId,
          chunk.ordinal,
          chunk.heading,
          chunk.text,
          chunk.tokenCount,
        );

        const { chunk_rowid: rowid } = insertRowid.get(chunk.id) as { chunk_rowid: number };

        // vec0 rejects a plain JS number as a primary key - better-sqlite3 binds
        // numbers as doubles - so the rowid has to be passed as a BigInt.
        insertVector.run(BigInt(rowid), embeddings[index]!);
        insertFts.run(BigInt(rowid), chunk.text, chunk.heading ?? '');
      }
    });

    write();
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    const deleteExisting = this.#buildDelete();
    this.#db.transaction(() => deleteExisting(documentId))();
  }

  /**
   * Removes a document's chunks from all three tables.
   *
   * `chunks` cascades to `chunk_rowids`, but the two virtual tables have no
   * foreign keys — nothing in SQLite will clean them up for us, and orphaned
   * vectors would keep being returned by search long after the text was gone.
   */
  #buildDelete(): (documentId: string) => void {
    const selectRowids = this.#db.prepare(
      `select r.chunk_rowid as rowid
         from chunk_rowids r
         join chunks c on c.id = r.chunk_id
        where c.document_id = ?`,
    );
    const deleteVector = this.#db.prepare('delete from vec_chunks where chunk_rowid = ?');
    const deleteFts = this.#db.prepare('delete from chunks_fts where rowid = ?');
    const deleteChunks = this.#db.prepare('delete from chunks where document_id = ?');

    return (documentId: string) => {
      const rows = selectRowids.all(documentId) as { rowid: number }[];
      for (const { rowid } of rows) {
        deleteVector.run(BigInt(rowid));
        deleteFts.run(BigInt(rowid));
      }
      deleteChunks.run(documentId);
    };
  }

  async searchVector(embedding: Float32Array, limit: number): Promise<ScoredChunk[]> {
    const rows = this.#db
      .prepare(
        `select r.chunk_id as chunkId, v.distance as distance
           from vec_chunks v
           join chunk_rowids r on r.chunk_rowid = v.chunk_rowid
          where v.embedding match ? and k = ?
          order by v.distance`,
      )
      .all(embedding, limit) as { chunkId: string; distance: number }[];

    return rows.map((row, index) => ({
      chunkId: row.chunkId,
      rank: index + 1,
      rawScore: row.distance,
    }));
  }

  async searchKeyword(query: string, limit: number): Promise<ScoredChunk[]> {
    const ftsQuery = toFtsQuery(query);
    if (!ftsQuery) return [];

    // A malformed FTS5 expression raises rather than returning nothing. The
    // sanitiser below should prevent it, but a keyword-half failure must never
    // take down a search the vector half could still answer.
    try {
      const rows = this.#db
        .prepare(
          `select r.chunk_id as chunkId, bm25(chunks_fts) as score
             from chunks_fts f
             join chunk_rowids r on r.chunk_rowid = f.rowid
            where chunks_fts match ?
            order by score
            limit ?`,
        )
        .all(ftsQuery, limit) as { chunkId: string; score: number }[];

      return rows.map((row, index) => ({
        chunkId: row.chunkId,
        rank: index + 1,
        rawScore: row.score,
      }));
    } catch {
      return [];
    }
  }
}

/**
 * Turns a natural-language question into an FTS5 `OR` query.
 *
 * FTS5 treats `"`, `*`, `:`, `^`, `-`, and `(` as syntax, so raw user text is
 * both a crash risk and a source of surprising matches. Each surviving word is
 * quoted as a literal and joined with OR, because a question's words rarely all
 * appear in the passage that answers it — requiring all of them (the default)
 * would return almost nothing.
 */
export function toFtsQuery(query: string): string | null {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9._-]+/i)
    .map((word) => word.replace(/^[._-]+|[._-]+$/g, ''))
    .filter((word) => word.length > 1);

  if (words.length === 0) return null;

  return words.map((word) => `"${word}"`).join(' OR ');
}
