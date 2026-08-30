import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChatModelConfigurationError, createChatModel } from './index.js';
import { OpenRouterChatModel } from './openrouter.js';

describe('chat model selection', () => {
  it('builds an OpenRouter model and carries the model id through', () => {
    const model = createChatModel({
      provider: 'openrouter',
      model: 'openai/gpt-5-mini',
      openRouterApiKey: 'sk-or-test',
    });

    assert.ok(model instanceof OpenRouterChatModel);
    assert.equal(model.id, 'openai/gpt-5-mini');
  });

  it('names the missing variable rather than failing vaguely', () => {
    // The whole point of the typed error: an operator reading this message
    // knows exactly which line of .env to edit.
    assert.throws(
      () => createChatModel({ provider: 'openrouter', model: 'qwen/qwen3.7-flash' }),
      (error: unknown) =>
        error instanceof ChatModelConfigurationError && /OPENROUTER_API_KEY/.test(error.message),
    );
  });

  it('rejects an unknown provider and names the supported one', () => {
    assert.throws(
      () =>
        createChatModel({
          provider: 'llamafile',
          model: 'whatever',
          openRouterApiKey: 'sk-or-test',
        }),
      (error: unknown) =>
        error instanceof ChatModelConfigurationError && /openrouter/.test(error.message),
    );
  });

  it('never puts a key in the error message', () => {
    // A configuration error is shown to the user, so it must name variables and
    // never their values.
    try {
      createChatModel({ provider: 'nope', model: 'm', openRouterApiKey: 'sk-or-secret-value' });
      assert.fail('expected a configuration error');
    } catch (error) {
      assert.ok(error instanceof ChatModelConfigurationError);
      assert.ok(!error.message.includes('sk-or-secret-value'), 'error message leaked a key');
    }
  });

  it('defaults to the cheap worker model when none is given', () => {
    // An unset LLM_MODEL must not quietly cost a hundred times more per query.
    const model = new OpenRouterChatModel({ apiKey: 'sk-or-test' });
    assert.equal(model.id, 'qwen/qwen3.7-flash');
  });
});
