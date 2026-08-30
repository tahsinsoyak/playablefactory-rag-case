import Anthropic from '@anthropic-ai/sdk';
import type { AnswerEvent } from '@corpus/shared';
import type { ChatModel, ChatModelContext } from '../ports/index.js';
import { SYSTEM_PROMPT, buildUserMessage, numberSources } from './prompt.js';
import { finishAnswer } from './finish.js';

export interface AnthropicChatModelOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicChatModel implements ChatModel {
  readonly id: string;
  readonly #client: Anthropic;
  readonly #maxTokens: number;

  constructor(options: AnthropicChatModelOptions) {
    this.id = options.model ?? 'claude-opus-5';
    this.#client = new Anthropic({ apiKey: options.apiKey });
    this.#maxTokens = options.maxTokens ?? 4096;
  }

  async *stream(ctx: ChatModelContext): AsyncIterable<AnswerEvent> {
    const startedAt = Date.now();
    const sources = numberSources(ctx.hits);

    let text = '';

    try {
      const stream = this.#client.messages.stream({
        model: this.id,
        max_tokens: this.#maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserMessage(ctx.question, sources) }],
        // Grounded extraction over a handful of short passages is not a reasoning
        // problem; low effort keeps latency and cost down without measurably
        // changing the answers. Thinking stays adaptive - disabling it on Opus 5
        // risks tool-call text and stray tags in the visible response.
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          yield { type: 'delta', text: event.delta.text };
        }
      }

      const final = await stream.finalMessage();

      // A safety classifier can decline with HTTP 200 and stop_reason "refusal",
      // which is not the same thing as the corpus lacking an answer - reporting
      // it as one would be a lie about the corpus.
      if (final.stop_reason === 'refusal') {
        yield {
          type: 'error',
          code: 'upstream_refusal',
          message: 'The model declined to answer this question.',
        };
        return;
      }

      yield finishAnswer(text, sources, Date.now() - startedAt);
    } catch (error) {
      yield {
        type: 'error',
        code: 'upstream_unavailable',
        message: error instanceof Error ? error.message : 'The answer service is unavailable.',
      };
    }
  }
}
