import type { Embedder } from '../ports/index.js';
import { LocalEmbedder, type LocalEmbedderOptions } from './local.js';

export { LocalEmbedder };
export type { LocalEmbedderOptions };

/**
 * Resolves the `EMBEDDER` setting to an implementation.
 *
 * The spec is `provider:model`, so adding a hosted embedder later means adding a
 * branch here and nothing else. Unknown specs throw at startup rather than
 * falling back to a default. Silently embedding with the wrong model would
 * produce an index that looks fine and retrieves badly.
 */
export function createEmbedder(spec: string, options: LocalEmbedderOptions = {}): Embedder {
  const [provider, model] = spec.split(':');

  if (provider === 'local') {
    if (model && model !== 'bge-small-en-v1.5') {
      throw new Error(
        `Unsupported local embedding model "${model}". Only bge-small-en-v1.5 is bundled.`,
      );
    }
    return new LocalEmbedder(options);
  }

  throw new Error(
    `Unknown EMBEDDER "${spec}". Expected the form "local:bge-small-en-v1.5". See .env.example.`,
  );
}
