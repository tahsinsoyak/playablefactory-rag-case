import { z } from 'zod';
import { searchHitSchema } from './search.js';

/**
 * Answering supports only the modes that include the vector half.
 *
 * The refusal gate is a cosine-similarity floor, and BM25 scores are unbounded
 * and corpus-dependent - there is no calibrated number to threshold on. Rather
 * than let a keyword-only answer silently lose its "don't make things up"
 * guarantee, the contract excludes the mode. Search still exposes all three, so
 * the dashboard can compare them.
 */
export const answerModeSchema = z.enum(['hybrid', 'vector']);
export type AnswerMode = z.infer<typeof answerModeSchema>;

export const answerRequestSchema = z.object({
  question: z.string().min(1).max(1000),
  mode: answerModeSchema.default('hybrid'),
  /** How many chunks to ground on. Tuned against the eval, not by feel. */
  topK: z.number().int().min(1).max(20).default(8),
});
export type AnswerRequest = z.infer<typeof answerRequestSchema>;

/**
 * A citation points at a *document*, not a chunk. Several chunks from one document
 * collapse into a single citation, because "which document should I go read" is the
 * question a reader is actually asking.
 */
export const citationSchema = z.object({
  index: z.number().int().positive(),
  documentId: z.uuid(),
  path: z.string(),
  title: z.string(),
  /** The chunks that backed this citation, for highlighting in the UI. */
  chunkIds: z.array(z.uuid()).min(1),
});
export type Citation = z.infer<typeof citationSchema>;

/**
 * Refusal is a first-class outcome, not an error and not a string the UI has to
 * pattern-match. `no_relevant_context` means retrieval found nothing above
 * threshold; `not_in_context` means passages came back but did not answer the
 * question. Both must produce zero citations.
 */
export const refusalReasonSchema = z.enum(['no_relevant_context', 'not_in_context']);
export type RefusalReason = z.infer<typeof refusalReasonSchema>;

export const answerResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('answered'),
    text: z.string(),
    citations: z.array(citationSchema).min(1),
  }),
  z.object({
    status: z.literal('refused'),
    text: z.string(),
    reason: refusalReasonSchema,
    citations: z.tuple([]),
  }),
]);
export type AnswerResult = z.infer<typeof answerResultSchema>;

/**
 * Server-sent event stream for `POST /answer`. Retrieval finishes before generation
 * starts, so the UI can render the passages while the answer is still streaming.
 */
export const answerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('retrieval'), hits: z.array(searchHitSchema), latencyMs: z.number() }),
  z.object({ type: z.literal('delta'), text: z.string() }),
  z.object({ type: z.literal('done'), result: answerResultSchema, latencyMs: z.number() }),
  z.object({ type: z.literal('error'), message: z.string(), code: z.string() }),
]);
export type AnswerEvent = z.infer<typeof answerEventSchema>;
