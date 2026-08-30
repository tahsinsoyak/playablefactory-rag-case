import { z } from 'zod';

/**
 * Derived from the corpus's own directory layout rather than imposed on it.
 * `reference` covers the flat top-level specs (SDK notes, network specs, guides
 * that do not live in a subdirectory).
 */
export const docTypeSchema = z.enum([
  'client-brief',
  'meeting-note',
  'delivery-report',
  'postmortem',
  'changelog',
  'guide',
  'reference',
]);
export type DocType = z.infer<typeof docTypeSchema>;

export const documentStatusSchema = z.enum(['indexed', 'failed', 'pending', 'removed']);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSchema = z.object({
  id: z.uuid(),
  /** Corpus-relative POSIX path, e.g. `client-briefs/merge-marina.md`. The citation key. */
  path: z.string(),
  title: z.string(),
  docType: docTypeSchema,
  /** Parsed from the filename where the corpus encodes one, e.g. `2026-03-09-...`. */
  docDate: z.iso.date().nullable(),
  status: documentStatusSchema,
  chunkCount: z.number().int().nonnegative(),
  indexedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
});
export type CorpusDocument = z.infer<typeof documentSchema>;

export const documentListQuerySchema = z.object({
  docType: docTypeSchema.optional(),
  status: documentStatusSchema.optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const documentListResponseSchema = z.object({
  documents: z.array(documentSchema),
  total: z.number().int().nonnegative(),
});
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;

export const ingestionRunStatusSchema = z.enum(['running', 'succeeded', 'failed']);
export type IngestionRunStatus = z.infer<typeof ingestionRunStatusSchema>;

/**
 * One pass of the ingestion pipeline. This is what makes ingestion *observable*:
 * what was indexed, when, and whether it succeeded.
 */
export const ingestionRunSchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  status: ingestionRunStatusSchema,
  /** Counts of the delta this run applied, not of the whole corpus. */
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  embedderId: z.string(),
  error: z.string().nullable(),
});
export type IngestionRun = z.infer<typeof ingestionRunSchema>;

/** Index health, for the dashboard. */
export const indexHealthSchema = z.object({
  documentCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  failedDocumentCount: z.number().int().nonnegative(),
  embedderId: z.string(),
  dimensions: z.number().int().positive(),
  lastIngestionAt: z.iso.datetime().nullable(),
  /** True when a document on disk differs from what is indexed. Drives the "re-index" nudge. */
  stale: z.boolean(),
});
export type IndexHealth = z.infer<typeof indexHealthSchema>;
