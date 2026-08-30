import type { ChatModel } from '../ports/index.js';
import { AnthropicChatModel } from './anthropic.js';

export * from './prompt.js';
export * from './answer-service.js';
export { AnthropicChatModel };

export interface CreateChatModelOptions {
  provider: string;
  model: string;
  apiKey?: string | undefined;
}

/**
 * Resolves the `LLM_PROVIDER` / `LLM_MODEL` settings to an implementation.
 * Adding a provider means adding a branch here and an adapter beside it -
 * nothing above the `ChatModel` interface changes.
 */
export function createChatModel(options: CreateChatModelOptions): ChatModel {
  if (options.provider === 'anthropic') {
    if (!options.apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is required to generate answers. Search and ingestion work without it. See .env.example.',
      );
    }
    return new AnthropicChatModel({ apiKey: options.apiKey, model: options.model });
  }

  throw new Error(`Unknown LLM_PROVIDER "${options.provider}". Supported: anthropic.`);
}
