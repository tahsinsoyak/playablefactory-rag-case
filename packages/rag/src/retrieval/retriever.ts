import type { DocType, SearchHit, SearchRequest } from '@corpus/shared';
import {
  isAsymmetric,
  type Embedder,
  type Reranker,
  type Retriever,
  type VectorStore,
} from '../ports/index.js';
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

/**
 * How many fused candidates the reranker sees.
 *
 * Reranking is the expensive half, one forward pass per candidate, so the
 * shortlist has to stay short. 20 is wide enough that a document RRF placed
 * around tenth can still be promoted to first, and narrow enough that the cost
 * stays roughly flat as `limit` changes.
 */
const RERANK_CANDIDATES = 20;

export interface RetrieverOptions {
  /** When set, the fused shortlist is reordered before it is returned. */
  reranker?: Reranker;
}

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
  readonly #reranker: Reranker | undefined;

  constructor(db: Db, store: VectorStore, embedder: Embedder, options: RetrieverOptions = {}) {
    this.#db = db;
    this.#store = store;
    this.#embedder = embedder;
    this.#reranker = options.reranker;
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

    let ordered = [...fused.entries()].sort((a, b) => b[1] - a[1]);
    const rows = this.#hydrate(ordered.map(([chunkId]) => chunkId));

    if (this.#reranker) {
      ordered = await this.#applyReranker(req.query, ordered, rows);
    }

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

  /**
   * Folds the cross-encoder's opinion into the fused ranking.
   *
   * The obvious implementation, replacing the order with the reranker's, was
   * measurably worse in one direction: it lifted MRR but pushed a correct
   * document out of the top 8 entirely, which on the answer path is a false
   * refusal. The reranker is good but not infallible, and letting it overrule
   * two other signals outright discards what they already knew.
   *
   * So it is fused in as a third ranking, by the same Reciprocal Rank Fusion
   * used for vector and keyword. A document the reranker dislikes but both
   * retrievers ranked highly still survives; a document the reranker loves
   * climbs. Only the shortlist is scored, so anything past it keeps its fused
   * position and stays behind.
   */
  async #applyReranker(
    query: string,
    ordered: [string, number][],
    rows: Map<string, ChunkRow>,
  ): Promise<[string, number][]> {
    const shortlist = ordered.slice(0, RERANK_CANDIDATES);
    const tail = ordered.slice(RERANK_CANDIDATES);

    const candidates = shortlist.flatMap(([chunkId]) => {
      const row = rows.get(chunkId);
      if (!row) return [];
      // The heading carries the subject for short sections, exactly as it does
      // at embedding time, so the reranker sees the same context.
      const text = row.heading
        ? `${row.title} > ${row.heading}
${row.text}`
        : `${row.title}
${row.text}`;
      return [{ id: chunkId, text }];
    });

    try {
      const ranked = await this.#reranker!.rerank(query, candidates);

      const rerankRank = new Map(ranked.map((result, index) => [result.id, index + 1]));
      const fusedRank = new Map(shortlist.map(([chunkId], index) => [chunkId, index + 1]));

      const rescored = shortlist
        .map(([chunkId, fusedScore]): [string, number, number] => {
          const retrievalRank = fusedRank.get(chunkId) ?? RERANK_CANDIDATES;
          const crossRank = rerankRank.get(chunkId) ?? RERANK_CANDIDATES;
          const combined = 1 / (RRF_K + retrievalRank) + 1 / (RRF_K + crossRank);
          return [chunkId, fusedScore, combined];
        })
        .sort((a, b) => b[2] - a[2])
        .map(([chunkId, fusedScore]): [string, number] => [chunkId, fusedScore]);

      return [...rescored, ...tail];
    } catch {
      // A reranker failure degrades to plain fused order rather than failing the
      // search: a slower, slightly worse answer beats no answer.
      return ordered;
    }
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
