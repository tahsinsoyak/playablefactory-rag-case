import {
  GroundedAnswerService,
  HybridRetriever,
  SqliteVectorStore,
  ChatModelConfigurationError,
  createChatModel,
  createEmbedder,
  type AnswerService,
  type Embedder,
  type Retriever,
  type VectorStore,
} from '@corpus/rag';
import type { Config } from './config.js';
import type { Db } from './db/index.js';

/**
 * Builds the chat model from configuration.
 *
 * The one place that maps config to a provider. It previously happened here and
 * again in the eval script, and when OpenRouter was added only one of the two
 * was updated - so `npm run eval -- --answers` reported a missing key that was
 * in fact set. Two call sites, one of them silently wrong.
 */
export function chatModelFromConfig(config: Config) {
  return createChatModel({
    provider: config.LLM_PROVIDER,
    model: config.LLM_MODEL,
    apiKey: config.ANTHROPIC_API_KEY,
    openRouterApiKey: config.OPENROUTER_API_KEY,
    appUrl: config.WEB_ORIGIN,
  });
}

export interface RagContext {
  embedder: Embedder;
  store: VectorStore;
  retriever: Retriever;
  answerService: AnswerService;
}

/**
 * Wires the retrieval core for the API process.
 *
 * The chat model is built lazily. Search and the dashboard must work without an
 * Anthropic key — only generating an answer needs one — so a missing key fails
 * that one request with a clear message instead of preventing the server from
 * starting.
 */
export function createRagContext(db: Db, config: Config): RagContext {
  const embedder = createEmbedder(config.EMBEDDER, { cacheDir: config.MODEL_CACHE_DIR });
  const store = new SqliteVectorStore(db);
  const retriever = new HybridRetriever(db, store, embedder);

  const answerService: AnswerService = {
    answer(req) {
      let chatModel;

      try {
        chatModel = chatModelFromConfig(config);
      } catch (error) {
        // A misconfiguration used to escape as a thrown error after the SSE
        // headers were already sent, which the route could only report as
        // "something went wrong" - leaving the actual cause, a missing API key,
        // visible nowhere but the server log. It is safe to tell the user: the
        // message names an environment variable, never its value.
        const message =
          error instanceof ChatModelConfigurationError
            ? error.message
            : 'The answer service is not configured.';

        return (async function* () {
          yield { type: 'error' as const, code: 'configuration', message };
        })();
      }

      return new GroundedAnswerService({ retriever, chatModel }).answer(req);
    },
  };

  return { embedder, store, retriever, answerService };
}
