import type { ChatModel } from '../ports/index.js';
import { AnthropicChatModel } from './anthropic.js';
import { OpenRouterChatModel } from './openrouter.js';

export * from './prompt.js';
export * from './finish.js';
export * from './answer-service.js';
export { AnthropicChatModel, OpenRouterChatModel };

/**
 * Thrown when the provider is misconfigured, as distinct from the provider
 * failing at runtime. Callers surface its message to the user: a missing key or
 * an unknown provider name is something only the operator can fix, and telling
 * them "something went wrong" wastes their time. It carries no secrets.
 */
export class ChatModelConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatModelConfigurationError';
  }
}

export interface CreateChatModelOptions {
  provider: string;
  model: string;
  /** Anthropic's direct API key, used when provider is `anthropic`. */
  apiKey?: string | undefined;
  /** OpenRouter key, used when provider is `openrouter`. */
  openRouterApiKey?: string | undefined;
  appUrl?: string | undefined;
}

/**
 * Resolves the `LLM_PROVIDER` / `LLM_MODEL` settings to an implementation.
 * Adding a provider means adding a branch here and an adapter beside it -
 * nothing above the `ChatModel` interface changes.
 */
export function createChatModel(options: CreateChatModelOptions): ChatModel {
  if (options.provider === 'openrouter') {
    if (!options.openRouterApiKey) {
      throw new ChatModelConfigurationError(
        'OPENROUTER_API_KEY is not set. Add it to .env to generate answers - keys start with "sk-or-" and come from https://openrouter.ai/keys. Search, ingestion, and the dashboard work without it.',
      );
    }
    return new OpenRouterChatModel({
      apiKey: options.openRouterApiKey,
      model: options.model,
      ...(options.appUrl ? { appUrl: options.appUrl } : {}),
    });
  }

  if (options.provider === 'anthropic') {
    if (!options.apiKey) {
      throw new ChatModelConfigurationError(
        'ANTHROPIC_API_KEY is not set. Add it to .env to generate answers, or set LLM_PROVIDER=openrouter to use an OpenRouter key instead. Search, ingestion, and the dashboard work without either.',
      );
    }
    return new AnthropicChatModel({ apiKey: options.apiKey, model: options.model });
  }

  throw new ChatModelConfigurationError(
    `Unknown LLM_PROVIDER "${options.provider}". Supported: openrouter, anthropic.`,
  );
}
