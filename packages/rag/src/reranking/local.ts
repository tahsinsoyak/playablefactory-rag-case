import { AutoModelForSequenceClassification, AutoTokenizer } from '@huggingface/transformers';
import type { Reranker, RerankCandidate, RerankResult } from '../ports/index.js';

const MODEL_ID = 'Xenova/ms-marco-MiniLM-L-6-v2';

export interface LocalRerankerOptions {
  cacheDir?: string;
  onDownloadStart?: () => void;
}

/**
 * Cross-encoder reranker, run locally.
 *
 * The difference from the embedding model is the shape of the comparison. An
 * embedder turns the query and the passage into vectors *independently* and then
 * compares them, so it never sees the two together. A cross-encoder reads the
 * query and the passage as one input and scores the pair directly, which lets it
 * notice things a vector distance cannot: that a passage answers a question
 * rather than merely sharing its subject.
 *
 * The cost is that it cannot be precomputed. Every query needs a forward pass
 * per candidate, so it only ever runs over a shortlist that cheap retrieval has
 * already produced. Retrieve broadly and cheaply, then reorder narrowly and
 * expensively.
 */
export class LocalReranker implements Reranker {
  readonly id = 'ms-marco-MiniLM-L-6-v2';

  #model:
    Awaited<ReturnType<typeof AutoModelForSequenceClassification.from_pretrained>> | undefined;
  #tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | undefined;
  #loading: Promise<void> | undefined;
  readonly #options: LocalRerankerOptions;

  constructor(options: LocalRerankerOptions = {}) {
    this.#options = options;
  }

  async #load(): Promise<void> {
    this.#loading ??= (async () => {
      this.#options.onDownloadStart?.();
      const [tokenizer, model] = await Promise.all([
        AutoTokenizer.from_pretrained(MODEL_ID),
        AutoModelForSequenceClassification.from_pretrained(MODEL_ID),
      ]);
      this.#tokenizer = tokenizer;
      this.#model = model;
    })();

    return this.#loading;
  }

  async rerank(query: string, candidates: RerankCandidate[]): Promise<RerankResult[]> {
    if (candidates.length === 0) return [];

    await this.#load();
    const tokenizer = this.#tokenizer;
    const model = this.#model;
    if (!tokenizer || !model) throw new Error('The reranker failed to load.');

    // The query is paired with every candidate, which is what makes this a
    // cross-encoder rather than two separate encodings.
    const inputs = tokenizer(
      candidates.map(() => query),
      {
        text_pair: candidates.map((candidate) => candidate.text),
        padding: true,
        truncation: true,
      },
    );

    const { logits } = await model(inputs);
    const scores = logits.tolist() as number[][];

    return candidates
      .map((candidate, index) => ({
        id: candidate.id,
        // A single-logit relevance score. Higher is more relevant; the scale is
        // the model's own, so it orders candidates and means nothing absolute.
        score: scores[index]?.[0] ?? Number.NEGATIVE_INFINITY,
      }))
      .sort((a, b) => b.score - a.score);
  }
}
