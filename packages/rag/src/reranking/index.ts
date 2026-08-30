import type { Reranker } from '../ports/index.js';
import { LocalReranker, type LocalRerankerOptions } from './local.js';

export { LocalReranker };
export type { LocalRerankerOptions };

/**
 * Resolves the `RERANKER` setting to an implementation.
 *
 * `none` is a first-class option, not an oversight. Reranking costs latency on
 * every query, so it should only be switched on where the eval shows it earning
 * that cost.
 */
export function createReranker(spec: string, options: LocalRerankerOptions = {}): Reranker {
  const [provider, model] = spec.split(':');

  if (provider === 'local') {
    if (model && model !== 'ms-marco-MiniLM-L-6-v2') {
      throw new Error(
        `Unsupported local reranker "${model}". Only ms-marco-MiniLM-L-6-v2 is bundled.`,
      );
    }
    return new LocalReranker(options);
  }

  throw new Error(`Unknown RERANKER "${spec}". Expected "local:ms-marco-MiniLM-L-6-v2" or "none".`);
}

/** True when the setting asks for no reranking at all. */
export function rerankingDisabled(spec: string): boolean {
  return spec === 'none' || spec.trim() === '';
}
