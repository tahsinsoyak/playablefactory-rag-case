import type { AnswerEvent, Citation } from '@corpus/shared';
import { extractCitedIndexes, type NumberedSource } from './prompt.js';

/**
 * Turns a finished response into an answer or a refusal.
 *
 * Deliberately outside the adapter. The rule it encodes, that a response citing
 * nothing is not grounded whatever it says, is the project's central safety
 * property. Keeping it here means a second provider cannot arrive with its own
 * version of it: swapping the model must not be able to swap the guarantee.
 *
 * The decision is structural rather than linguistic: no citation, no answer,
 * however confident the prose reads. Citation numbers outside the range of
 * sources actually supplied are discarded, so a hallucinated `[7]` against three
 * sources never becomes a link to an unrelated document.
 */
export function finishAnswer(
  text: string,
  sources: NumberedSource[],
  latencyMs: number,
): AnswerEvent {
  const trimmed = text.trim();
  const citedIndexes = extractCitedIndexes(trimmed, sources.length);

  if (citedIndexes.length === 0) {
    return {
      type: 'done',
      latencyMs,
      result: {
        status: 'refused',
        reason: 'not_in_context',
        text:
          trimmed.length > 0 ? trimmed : 'The corpus does not contain an answer to that question.',
        citations: [],
      },
    };
  }

  const citations: Citation[] = citedIndexes.flatMap((index) => {
    const source = sources[index - 1];
    if (!source) return [];
    return [
      {
        index,
        documentId: source.documentId,
        path: source.path,
        title: source.title,
        chunkIds: source.chunkIds,
      },
    ];
  });

  return {
    type: 'done',
    latencyMs,
    result: { status: 'answered', text: trimmed, citations },
  };
}
