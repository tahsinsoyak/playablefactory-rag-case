import { z } from 'zod';
import { docTypeSchema } from './documents.js';

export const retrievalModeSchema = z.enum(['hybrid', 'vector', 'keyword']);
export type RetrievalMode = z.infer<typeof retrievalModeSchema>;

export const searchRequestSchema = z.object({
  query: z.string().min(1).max(1000),
  limit: z.number().int().min(1).max(50).default(8),
  /** Exposed so the dashboard and the eval can compare retrieval strategies directly. */
  mode: retrievalModeSchema.default('hybrid'),
  docType: docTypeSchema.optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchHitSchema = z.object({
  chunkId: z.uuid(),
  documentId: z.uuid(),
  /** Repeated from the document so a hit can be rendered without a second lookup. */
  path: z.string(),
  title: z.string(),
  docType: docTypeSchema,
  docDate: z.iso.date().nullable(),
  heading: z.string().nullable(),
  text: z.string(),
  ordinal: z.number().int().nonnegative(),
  /**
   * Fused RRF rank score. Orders hits within one response, and deliberately
   * nothing more: it is built from ranks, so it says where a chunk placed, never
   * how relevant it is. Do not threshold on it.
   */
  score: z.number(),
  /**
   * Cosine similarity to the query, in [-1, 1]. Null when only the keyword half
   * found this chunk. This is the absolute measure - the one a relevance floor
   * can actually be built on.
   */
  vectorScore: z.number().nullable(),
  /** Per-strategy ranks, null when that strategy did not return the chunk. Explains the fusion. */
  vectorRank: z.number().int().positive().nullable(),
  keywordRank: z.number().int().positive().nullable(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchResponseSchema = z.object({
  query: z.string(),
  mode: retrievalModeSchema,
  hits: z.array(searchHitSchema),
  latencyMs: z.number().nonnegative(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;

export const searchStatsSchema = z.object({
  totalSearches: z.number().int().nonnegative(),
  searchesLast7Days: z.number().int().nonnegative(),
  /** Share of searches that produced a grounded answer rather than a refusal. */
  answeredRate: z.number().min(0).max(1),
  medianLatencyMs: z.number().nonnegative(),
  topQueries: z.array(z.object({ query: z.string(), count: z.number().int().positive() })),
  /** Queries that retrieved nothing above threshold, the corpus's blind spots. */
  recentUnanswered: z.array(z.object({ query: z.string(), createdAt: z.iso.datetime() })),
});
export type SearchStats = z.infer<typeof searchStatsSchema>;
