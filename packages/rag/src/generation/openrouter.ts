import OpenAI from 'openai';
import type { AnswerEvent } from '@corpus/shared';
import type { ChatModel, ChatModelContext } from '../ports/index.js';
import { SYSTEM_PROMPT, buildUserMessage, numberSources } from './prompt.js';
import { finishAnswer } from './finish.js';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterChatModelOptions {
  apiKey: string;
  /** An OpenRouter model id, e.g. `anthropic/claude-opus-5` or `openai/gpt-4o`. */
  model?: string;
  maxTokens?: number;
  /** Sent as `HTTP-Referer` and `X-Title`; OpenRouter uses them for attribution. */
  appUrl?: string;
  appName?: string;
}

/**
 * OpenRouter adapter.
 *
 * OpenRouter exposes an OpenAI-compatible API, so this uses the OpenAI SDK with
 * the base URL redirected — that is OpenRouter's own documented approach, and it
 * means SSE parsing, retries, and typed errors are handled by a maintained
 * client rather than by hand.
 *
 * One provider, many models: the same key reaches Anthropic, OpenAI, Google, and
 * open-weight models by changing `LLM_MODEL` alone. That makes comparing models
 * on the retrieval eval a configuration change, which is exactly what the
 * `ChatModel` port was introduced for.
 *
 * The grounding contract is not reimplemented here. The prompt and the
 * cited-or-refused decision come from the shared modules, so switching provider
 * cannot change what counts as a grounded answer.
 */
export class OpenRouterChatModel implements ChatModel {
  readonly id: string;
  readonly #client: OpenAI;
  readonly #maxTokens: number;

  constructor(options: OpenRouterChatModelOptions) {
    this.id = options.model ?? 'anthropic/claude-opus-5';
    this.#maxTokens = options.maxTokens ?? 4096;

    this.#client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: OPENROUTER_BASE_URL,
      defaultHeaders: {
        'HTTP-Referer': options.appUrl ?? 'http://localhost:3000',
        'X-Title': options.appName ?? 'Corpus RAG',
      },
    });
  }

  async *stream(ctx: ChatModelContext): AsyncIterable<AnswerEvent> {
    const startedAt = Date.now();
    const sources = numberSources(ctx.hits);

    let text = '';

    try {
      const stream = await this.#client.chat.completions.create({
        model: this.id,
        max_tokens: this.#maxTokens,
        // Grounded extraction over a handful of short passages rewards
        // faithfulness over invention, and every model behind OpenRouter honours
        // a low temperature the same way.
        temperature: 0,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(ctx.question, sources) },
        ],
      });

      for await (const chunk of stream) {
        // OpenRouter forwards upstream provider errors as a payload on the
        // stream rather than as an HTTP status, so they surface here.
        const streamError = (chunk as { error?: { message?: string } }).error;
        if (streamError) {
          yield {
            type: 'error',
            code: 'upstream_unavailable',
            message: streamError.message ?? 'The model provider returned an error.',
          };
          return;
        }

        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          text += delta;
          yield { type: 'delta', text: delta };
        }
      }

      if (text.trim().length === 0) {
        yield {
          type: 'error',
          code: 'upstream_unavailable',
          message:
            `The model "${this.id}" returned an empty response. ` +
            'Check that the model id exists on OpenRouter and that your account has credit for it.',
        };
        return;
      }

      yield finishAnswer(text, sources, Date.now() - startedAt);
    } catch (error) {
      yield { type: 'error', ...describeError(error, this.id) };
    }
  }
}

/**
 * Turns an SDK error into something a user can act on.
 *
 * The generic "something went wrong" is worse than useless for the three
 * failures people actually hit here — a bad key, a model id that does not
 * exist, and an empty account — because each has an obvious fix that the
 * message should name.
 */
function describeError(error: unknown, model: string): { code: string; message: string } {
  const status = (error as { status?: number }).status;
  const detail = error instanceof Error ? error.message : String(error);

  if (status === 401) {
    return {
      code: 'unauthorized',
      message:
        'OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env — keys start with "sk-or-".',
    };
  }

  if (status === 402) {
    return {
      code: 'upstream_unavailable',
      message: `Your OpenRouter account has insufficient credit for "${model}".`,
    };
  }

  if (status === 404) {
    return {
      code: 'upstream_unavailable',
      message: `OpenRouter has no model "${model}". Set LLM_MODEL to a valid id — see https://openrouter.ai/models.`,
    };
  }

  if (status === 429) {
    return {
      code: 'rate_limited',
      message: 'OpenRouter is rate limiting this key. Wait a moment and try again.',
    };
  }

  return { code: 'upstream_unavailable', message: `OpenRouter request failed: ${detail}` };
}
