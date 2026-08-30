import Anthropic from '@anthropic-ai/sdk';
import type { AnswerEvent, Citation } from '@corpus/shared';
import type { ChatModel, ChatModelContext } from '../ports/index.js';
import { SYSTEM_PROMPT, buildUserMessage, extractCitedIndexes, numberSources } from './prompt.js';

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

      yield this.#finish(text, sources, Date.now() - startedAt);
    } catch (error) {
      yield {
        type: 'error',
        code: 'upstream_unavailable',
        message: error instanceof Error ? error.message : 'The answer service is unavailable.',
      };
    }
  }

  /**
   * Turns the finished text into an answer or a refusal.
   *
   * The decision rule is structural, not linguistic: a response that cites
   * nothing is not grounded in the corpus, whatever it says. Treating that as a
   * refusal is what makes "no invented citations" an enforced property rather
   * than a request in the prompt - a confident uncited paragraph never reaches
   * the user as an answer.
   */
  #finish(text: string, sources: ReturnType<typeof numberSources>, latencyMs: number): AnswerEvent {
    const trimmed = text.trim();
    const citedIndexes = extractCitedIndexes(trimmed, sources.length);

    if (citedIndexes.length === 0) {
      return {
        type: 'done',
        latencyMs,
        result: {
          status: 'refused',
          reason: 'not_in_context',
          text:
            trimmed.length > 0
              ? trimmed
              : 'The corpus does not contain an answer to that question.',
          citations: [],
        },
      };
    }

    const citations: Citation[] = citedIndexes.flatMap((index) => {
      const source = sources[index - 1];
      if (!source) return [];
      return [
        {
          index,
          documentId: source.documentId,
          path: source.path,
          title: source.title,
          chunkIds: source.chunkIds,
        },
      ];
    });

    return {
      type: 'done',
      latencyMs,
      result: { status: 'answered', text: trimmed, citations },
    };
  }
}
