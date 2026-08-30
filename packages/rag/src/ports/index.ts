import type { AnswerEvent, AnswerRequest, SearchHit, SearchRequest } from '@corpus/shared';

/**
 * The three things the retrieval core deliberately does not hard-code.
 *
 * Everything else in the system, routes, the MCP tool, the UI, the eval, talks
 * to these interfaces rather than to a vendor SDK. That is what makes "swap the
 * chat model" a configuration change instead of a refactor.
 */

// --- embeddings -------------------------------------------------------------

export interface Embedder {
  /** Stable identifier recorded alongside the index, e.g. `bge-small-en-v1.5`. */
  readonly id: string;
  /** Must match the width of the `vec0` embedding column. */
  readonly dimensions: number;
  /**
   * Embeds a batch. Implementations should preserve input order and may batch
   * internally; callers rely on `result[i]` corresponding to `texts[i]`.
   */
  embed(texts: string[]): Promise<Float32Array[]>;
}

/**
 * Some embedding models are trained with an asymmetric query/document objective ,
 * `bge-*` wants a short instruction prefix on the query side only. Making that
 * explicit here stops it from being silently forgotten at one of the two call
 * sites, which would quietly degrade retrieval without failing anything.
 */
export interface AsymmetricEmbedder extends Embedder {
  embedQuery(text: string): Promise<Float32Array>;
}

export function isAsymmetric(embedder: Embedder): embedder is AsymmetricEmbedder {
  return typeof (embedder as AsymmetricEmbedder).embedQuery === 'function';
}

// --- generation -------------------------------------------------------------

export interface ChatModelContext {
  question: string;
  hits: SearchHit[];
}

export interface ChatModel {
  /** Stable identifier recorded on each answer, e.g. `claude-opus-5`. */
  readonly id: string;
  /**
   * Streams a grounded answer. Implementations must emit `delta` events as text
   * arrives and exactly one terminal `done` (or `error`) event.
   */
  stream(ctx: ChatModelContext): AsyncIterable<AnswerEvent>;
}

// --- reranking ---------------------------------------------------------------

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  /** The model's own relevance score. Orders candidates; means nothing absolute. */
  score: number;
}

/**
 * Reorders a shortlist by reading each passage against the query.
 *
 * Kept separate from `Embedder` because the two answer different questions. An
 * embedder asks "where does this text sit in vector space", once per document,
 * ahead of time. A reranker asks "does this passage answer this query", per
 * query, and cannot be precomputed.
 */
export interface Reranker {
  readonly id: string;
  rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]>;
}

// --- storage ----------------------------------------------------------------

export interface ChunkRecord {
  id: string;
  documentId: string;
  ordinal: number;
  heading: string | null;
  text: string;
  tokenCount: number;
}

export interface VectorStore {
  /**
   * Replaces every chunk of one document, in a single transaction covering both
   * the vector and keyword indexes. Partial writes would leave the two halves
   * disagreeing, which is the failure mode hardest to notice from the outside.
   */
  replaceDocumentChunks(
    documentId: string,
    chunks: ChunkRecord[],
    embeddings: Float32Array[],
  ): Promise<void>;

  deleteDocumentChunks(documentId: string): Promise<void>;

  searchVector(embedding: Float32Array, limit: number): Promise<ScoredChunk[]>;
  searchKeyword(query: string, limit: number): Promise<ScoredChunk[]>;
}

export interface ScoredChunk {
  chunkId: string;
  rank: number;
  /** Raw store score: cosine distance for vector, BM25 for keyword. Not comparable across the two. */
  rawScore: number;
}

// --- the pipeline these compose into ----------------------------------------

export interface Retriever {
  search(req: SearchRequest): Promise<SearchHit[]>;
}

export interface AnswerService {
  answer(req: AnswerRequest): AsyncIterable<AnswerEvent>;
}
