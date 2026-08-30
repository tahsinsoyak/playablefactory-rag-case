import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * A plain request-and-response text call.
 *
 * Separate from `ChatModel`, which streams and carries the whole grounding
 * contract. Evaluation needs neither: it wants one prompt in and one string out.
 * Reusing the answering port here would have meant bending it to a job it was
 * not shaped for, and coupling the eval harness to the citation rules it is
 * supposed to be checking from the outside.
 */
export interface CompletionModel {
  readonly id: string;
  complete(system: string, user: string): Promise<string>;
}

export interface CreateCompletionOptions {
  provider: string;
  model: string;
  apiKey?: string | undefined;
  openRouterApiKey?: string | undefined;
  maxTokens?: number;
}

class OpenRouterCompletion implements CompletionModel {
  readonly id: string;
  readonly #client: OpenAI;
  readonly #maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.id = model;
    this.#maxTokens = maxTokens;
    this.#client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
  }

  async complete(system: string, user: string): Promise<string> {
    const response = await this.#client.chat.completions.create({
      model: this.id,
      max_tokens: this.#maxTokens,
      // A judge should give the same verdict twice on the same evidence.
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    return response.choices[0]?.message?.content ?? '';
  }
}

class AnthropicCompletion implements CompletionModel {
  readonly id: string;
  readonly #client: Anthropic;
  readonly #maxTokens: number;

  constructor(apiKey: string, model: string, maxTokens: number) {
    this.id = model;
    this.#maxTokens = maxTokens;
    this.#client = new Anthropic({ apiKey });
  }

  async complete(system: string, user: string): Promise<string> {
    const message = await this.#client.messages.create({
      model: this.id,
      max_tokens: this.#maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
    });

    return message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }
}

export function createCompletionModel(options: CreateCompletionOptions): CompletionModel {
  const maxTokens = options.maxTokens ?? 2048;

  if (options.provider === 'openrouter') {
    if (!options.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is required to run the judge.');
    }
    return new OpenRouterCompletion(options.openRouterApiKey, options.model, maxTokens);
  }

  if (options.provider === 'anthropic') {
    if (!options.apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required to run the judge.');
    }
    return new AnthropicCompletion(options.apiKey, options.model, maxTokens);
  }

  throw new Error(`Unknown provider "${options.provider}". Supported: openrouter, anthropic.`);
}
