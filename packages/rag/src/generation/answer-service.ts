import type { AnswerEvent, AnswerRequest } from '@corpus/shared';
import type { AnswerService, ChatModel, Retriever } from '../ports/index.js';

/**
 * Cosine-similarity floor below which we refuse without calling the model.
 *
 * This is deliberately *not* the fused RRF score. RRF is built from ranks, so
 * something always ranks first: an out-of-corpus question scores exactly as high
 * as a well-answered one, and an early version of this gate let every probe
 * through for precisely that reason. Rank tells you the order; only the raw
 * similarity tells you whether the best match is any good.
 *
 * The value is measured, and has been re-measured once. The first version sat at
 * 0.55, tuned on the five sample questions, whose scores ran 0.621 to 0.827
 * against probes at 0.461 to 0.487. That gap was comfortable because the
 * questions were phrased in the corpus's own words.
 *
 * Widening the eval with paraphrases, questions asked the way someone who has
 * not read the documents would ask them, closed the gap sharply:
 *
 *   answerable questions   cosine 0.548 - 0.827
 *   out-of-corpus probes   cosine 0.407 - 0.471
 *
 * At 0.55 the hardest legitimate question, "Why is a developer not allowed to
 * approve their own team's work?", scored 0.5479 and was refused, even though
 * retrieval had ranked the correct document first. A false refusal on a real
 * question is a worse failure than it looks: the corpus does contain the answer,
 * and the system claimed otherwise.
 *
 * 0.51 sits in the middle of the remaining band. `docs/eval-results.md`
 * re-checks the separation on every run, so a corpus change that erodes it shows
 * up as a failing row rather than as silent hallucination or silent refusal.
 */
export const MIN_RELEVANCE_SCORE = 0.51;

export interface GroundedAnswerServiceOptions {
  retriever: Retriever;
  chatModel: ChatModel;
  minScore?: number;
}

export class GroundedAnswerService implements AnswerService {
  readonly #retriever: Retriever;
  readonly #chatModel: ChatModel;
  readonly #minScore: number;

  constructor(options: GroundedAnswerServiceOptions) {
    this.#retriever = options.retriever;
    this.#chatModel = options.chatModel;
    this.#minScore = options.minScore ?? MIN_RELEVANCE_SCORE;
  }

  async *answer(req: AnswerRequest): AsyncIterable<AnswerEvent> {
    const startedAt = Date.now();

    const hits = await this.#retriever.search({
      query: req.question,
      limit: req.topK,
      mode: req.mode,
    });

    const retrievalMs = Date.now() - startedAt;
    yield { type: 'retrieval', hits, latencyMs: retrievalMs };

    // Refuse before generating when nothing cleared the floor. This is the
    // cheaper and more honest of the two refusal paths: no request is made, no
    // tokens are spent, and the model is never given the chance to construct a
    // plausible answer out of unrelated passages.
    //
    // The best cosine across the hits, not the top hit's - the strongest
    // semantic match is not always the one RRF ranked first.
    const bestSimilarity = hits.reduce((best, hit) => Math.max(best, hit.vectorScore ?? -1), -1);
    if (hits.length === 0 || bestSimilarity < this.#minScore) {
      yield {
        type: 'done',
        latencyMs: Date.now() - startedAt,
        result: {
          status: 'refused',
          reason: 'no_relevant_context',
          text: 'The corpus does not contain anything relevant to that question.',
          citations: [],
        },
      };
      return;
    }

    for await (const event of this.#chatModel.stream({ question: req.question, hits })) {
      // The model reports its own generation time; the caller wants the total.
      if (event.type === 'done') {
        yield { ...event, latencyMs: Date.now() - startedAt };
        continue;
      }
      yield event;
    }
  }
}
