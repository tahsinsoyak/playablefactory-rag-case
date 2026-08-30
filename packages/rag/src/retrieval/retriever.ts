import type { DocType, SearchHit, SearchRequest } from '@corpus/shared';
import { isAsymmetric, type Embedder, type Retriever, type VectorStore } from '../ports/index.js';
import type { Db } from '../store/database.js';

/**
 * The RRF constant. 60 is the value from the original Cormack et al. paper and
 * the usual default: large enough that the top few ranks are not wildly
 * over-weighted, small enough that rank order still dominates.
 */
const RRF_K = 60;

/**
 * How many candidates each strategy contributes before fusion. Over-fetching
 * matters because the two halves disagree by design, a chunk ranked 15th by
 * vector and 3rd by keyword should still be able to win, and it cannot if we
 * only ever look at each list's top few.
 */
const CANDIDATE_MULTIPLIER = 4;

interface ChunkRow {
  chunkId: string;
  documentId: string;
  path: string;
  title: string;
  docType: DocType;
  docDate: string | null;
  heading: string | null;
  text: string;
  ordinal: number;
}

export class HybridRetriever implements Retriever {
  readonly #db: Db;
  readonly #store: VectorStore;
  readonly #embedder: Embedder;

  constructor(db: Db, store: VectorStore, embedder: Embedder) {
    this.#db = db;
    this.#store = store;
    this.#embedder = embedder;
  }

  async search(req: SearchRequest): Promise<SearchHit[]> {
    const candidateCount = Math.max(req.limit * CANDIDATE_MULTIPLIER, 20);

    const [vectorHits, keywordHits] = await Promise.all([
      req.mode === 'keyword'
        ? Promise.resolve([])
        : this.#embedQuery(req.query).then((v) => this.#store.searchVector(v, candidateCount)),
      req.mode === 'vector'
        ? Promise.resolve([])
        : this.#store.searchKeyword(req.query, candidateCount),
    ]);

    const vectorRanks = new Map(vectorHits.map((hit) => [hit.chunkId, hit.rank]));
    // Embeddings are unit-normalised, so L2 distance and cosine similarity are
    // related by d^2 = 2 - 2cos. Recovering cosine gives an absolute, corpus
    // independent relevance measure - which the fused rank score is not.
    const vectorScores = new Map(
      vectorHits.map((hit) => [hit.chunkId, 1 - (hit.rawScore * hit.rawScore) / 2]),
    );
    const keywordRanks = new Map(keywordHits.map((hit) => [hit.chunkId, hit.rank]));

    // Reciprocal Rank Fusion: sum 1/(k + rank) across the strategies that found
    // each chunk. Chosen over a weighted score blend because cosine distance and
    // BM25 are on incomparable scales. Fusing ranks needs no normalisation
    // constant to tune, and nothing to re-tune when the corpus changes.
    const fused = new Map<string, number>();
    for (const [chunkId, rank] of vectorRanks) {
      fused.set(chunkId, (fused.get(chunkId) ?? 0) + 1 / (RRF_K + rank));
    }
    for (const [chunkId, rank] of keywordRanks) {
      fused.set(chunkId, (fused.get(chunkId) ?? 0) + 1 / (RRF_K + rank));
    }

    if (fused.size === 0) return [];

    const ordered = [...fused.entries()].sort((a, b) => b[1] - a[1]);
    const rows = this.#hydrate(ordered.map(([chunkId]) => chunkId));

    const hits: SearchHit[] = [];
    for (const [chunkId, score] of ordered) {
      const row = rows.get(chunkId);
      if (!row) continue;
      // Filtering after fusion rather than inside the SQL keeps one ranking path
      // for every mode; the over-fetch above is what makes it safe.
      if (req.docType && row.docType !== req.docType) continue;

      hits.push({
        ...row,
        score,
        vectorScore: vectorScores.get(chunkId) ?? null,
        vectorRank: vectorRanks.get(chunkId) ?? null,
        keywordRank: keywordRanks.get(chunkId) ?? null,
      });

      if (hits.length >= req.limit) break;
    }

    return hits;
  }

  async #embedQuery(query: string): Promise<Float32Array> {
    if (isAsymmetric(this.#embedder)) return this.#embedder.embedQuery(query);

    const [vector] = await this.#embedder.embed([query]);
    if (!vector) throw new Error('Embedder returned no vector for the query.');
    return vector;
  }

  /** One query for all candidates, rather than one per hit. */
  #hydrate(chunkIds: string[]): Map<string, ChunkRow> {
    if (chunkIds.length === 0) return new Map();

    const placeholders = chunkIds.map(() => '?').join(', ');
    const rows = this.#db
      .prepare(
        `select c.id as chunkId, c.document_id as documentId, d.path, d.title,
                d.doc_type as docType, d.doc_date as docDate,
                c.heading, c.text, c.ordinal
           from chunks c
           join documents d on d.id = c.document_id
          where c.id in (${placeholders})`,
      )
      .all(...chunkIds) as ChunkRow[];

    return new Map(rows.map((row) => [row.chunkId, row]));
  }
}
