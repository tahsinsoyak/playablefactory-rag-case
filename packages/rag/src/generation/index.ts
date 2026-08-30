import type { ChatModel } from '../ports/index.js';
import { OpenRouterChatModel } from './openrouter.js';

export * from './prompt.js';
export * from './finish.js';
export * from './answer-service.js';
export { OpenRouterChatModel };

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
  /** OpenRouter key. */
  openRouterApiKey?: string | undefined;
  appUrl?: string | undefined;
}

/**
 * Resolves the `LLM_PROVIDER` and `LLM_MODEL` settings to an implementation.
 *
 * OpenRouter is the only provider, deliberately. One key already reaches every
 * model family, so a second adapter would add a code path without adding reach,
 * and every extra path is somewhere the grounding contract could quietly drift.
 * The `ChatModel` port is still the seam: adding a direct provider means writing
 * one file and one branch here, and nothing above it changes.
 */
export function createChatModel(options: CreateChatModelOptions): ChatModel {
  if (options.provider === 'openrouter') {
    if (!options.openRouterApiKey) {
      throw new ChatModelConfigurationError(
        'OPENROUTER_API_KEY is not set. Add it to .env to generate answers: keys start with ' +
          '"sk-or-" and come from https://openrouter.ai/keys. Search, ingestion, the dashboard, ' +
          'and the MCP server all work without it.',
      );
    }

    return new OpenRouterChatModel({
      apiKey: options.openRouterApiKey,
      model: options.model,
      ...(options.appUrl ? { appUrl: options.appUrl } : {}),
    });
  }

  throw new ChatModelConfigurationError(
    `Unknown LLM_PROVIDER "${options.provider}". Supported: openrouter.`,
  );
}
