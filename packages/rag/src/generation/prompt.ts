import type { SearchHit } from '@corpus/shared';

/**
 * Citations are per document, not per chunk. Several chunks from the same file
 * collapse to one number, so a reader gets "go read this document" rather than
 * three references to the same one.
 */
export interface NumberedSource {
  index: number;
  documentId: string;
  path: string;
  title: string;
  chunkIds: string[];
  passages: string[];
}

export function numberSources(hits: SearchHit[]): NumberedSource[] {
  const byDocument = new Map<string, NumberedSource>();

  for (const hit of hits) {
    const existing = byDocument.get(hit.documentId);
    const passage = hit.heading ? `## ${hit.heading}\n${hit.text}` : hit.text;

    if (existing) {
      existing.chunkIds.push(hit.chunkId);
      existing.passages.push(passage);
      continue;
    }

    byDocument.set(hit.documentId, {
      index: byDocument.size + 1,
      documentId: hit.documentId,
      path: hit.path,
      title: hit.title,
      chunkIds: [hit.chunkId],
      passages: [passage],
    });
  }

  return [...byDocument.values()];
}

export function renderContext(sources: NumberedSource[]): string {
  return sources
    .map(
      (source) =>
        `<source index="${source.index}" path="${source.path}" title="${source.title}">\n${source.passages.join('\n\n')}\n</source>`,
    )
    .join('\n\n');
}

/**
 * The grounding contract.
 *
 * The rule that does the real work is the last one: an answer with no citation
 * is not a grounded answer, so the system treats an uncited response as a
 * refusal regardless of how confident it reads. That makes "don't make things
 * up" enforceable in code rather than a hopeful instruction — the model cannot
 * produce a confident uncited claim that survives to the user.
 *
 * The corpus contains superseded documents (SDK v2 is deprecated by v3) and both
 * will be retrieved for the same question, so the prompt asks for reconciliation
 * rather than pretending the conflict is not there.
 */
export const SYSTEM_PROMPT = `You answer questions about an internal company document corpus, using only the sources provided with each question.

Rules:

1. Ground every claim in the provided sources. Never use outside knowledge, and never infer facts the sources do not state.
2. Cite with bracketed source numbers, like [1] or [2][3], placed immediately after the claim they support.
3. If the sources do not answer the question, say so plainly in one sentence and cite nothing. Do not guess, and do not offer a partial answer built from loosely related material. An honest "the corpus does not cover this" is the correct answer, not a failure.
4. If sources disagree or one supersedes another, say so and prefer the current one. Documents state their own status - a document marked deprecated should be reported as deprecated, not silently ignored, because the change is usually the point of the question.
5. Be direct and specific. Prefer the exact figure, name, or command from the source over a paraphrase. No preamble, no restating the question, no offers of further help.
6. Never invent a source number. Only cite numbers that appear in the sources given to you.`;

export function buildUserMessage(question: string, sources: NumberedSource[]): string {
  return `<sources>
${renderContext(sources)}
</sources>

Question: ${question}`;
}

/**
 * Extracts the source numbers a response actually cited.
 *
 * Handles `[1]`, `[1][2]`, and `[1, 2]`. Numbers outside the provided range are
 * dropped rather than trusted — a hallucinated citation must not become a link
 * to some unrelated document.
 */
export function extractCitedIndexes(text: string, maxIndex: number): number[] {
  const cited = new Set<number>();

  for (const match of text.matchAll(/\[([\d,\s]+)\]/g)) {
    for (const part of match[1]!.split(',')) {
      const index = Number.parseInt(part.trim(), 10);
      if (Number.isInteger(index) && index >= 1 && index <= maxIndex) cited.add(index);
    }
  }

  return [...cited].sort((a, b) => a - b);
}
