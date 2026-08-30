import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import type { AsymmetricEmbedder } from '../ports/index.js';

/**
 * bge-* models are trained asymmetrically: documents are embedded bare, but a
 * query is expected to carry this instruction. Omitting it costs several points
 * of retrieval quality and fails silently — nothing errors, results are just
 * quietly worse — which is why `AsymmetricEmbedder` makes it a type-level
 * obligation rather than a comment.
 */
const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

const MODEL_ID = 'Xenova/bge-small-en-v1.5';

export interface LocalEmbedderOptions {
  /** Where the ~35 MB model is cached. Downloaded once, then fully offline. */
  cacheDir?: string;
  /** Called once when a download starts, so ingestion does not look hung. */
  onDownloadStart?: () => void;
}

export class LocalEmbedder implements AsymmetricEmbedder {
  readonly id = 'bge-small-en-v1.5';
  readonly dimensions = 384;

  #pipeline: FeatureExtractionPipeline | undefined;
  #loading: Promise<FeatureExtractionPipeline> | undefined;
  readonly #options: LocalEmbedderOptions;

  constructor(options: LocalEmbedderOptions = {}) {
    this.#options = options;
    if (options.cacheDir) env.cacheDir = options.cacheDir;
  }

  /** Loaded lazily and only once, even under concurrent callers. */
  async #getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.#pipeline) return this.#pipeline;

    this.#loading ??= (async () => {
      this.#options.onDownloadStart?.();
      const extractor = await pipeline('feature-extraction', MODEL_ID);
      this.#pipeline = extractor;
      return extractor;
    })();

    return this.#loading;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    const extractor = await this.#getPipeline();
    // Normalised so cosine similarity reduces to a dot product, which is what
    // sqlite-vec's L2 distance ordering assumes for unit vectors.
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const flat = output.data as Float32Array;

    return texts.map((_, index) =>
      // `slice` copies: the underlying buffer is reused between calls, so a view
      // would alias data that the next batch overwrites.
      flat.slice(index * this.dimensions, (index + 1) * this.dimensions),
    );
  }

  async embedQuery(text: string): Promise<Float32Array> {
    const [vector] = await this.embed([`${QUERY_PREFIX}${text}`]);
    if (!vector) throw new Error('Embedder returned no vector for the query.');
    return vector;
  }
}
