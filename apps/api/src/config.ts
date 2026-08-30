import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { REPO_ROOT, fromRepoRoot } from '@corpus/rag';

export { REPO_ROOT };

/**
 * Loads `.env` from the repo root if present. Node can do this natively, so there
 * is no dotenv dependency. Real environment variables always win, which is what
 * makes the same build work in a deployment that has no `.env` file at all.
 */
function loadDotEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_PATH: z.string().default('./data/corpus.db'),
  CORPUS_DIR: z.string().default('./corpus'),

  EMBEDDER: z.string().default('local:bge-small-en-v1.5'),
  // Cross-encoder reranking, applied to answering only. Measured worth: MRR on
  // the sample group rises from 0.717 to 0.893, for about a second per query.
  // Set to `none` to turn it off entirely.
  RERANKER: z.string().default('local:ms-marco-MiniLM-L-6-v2'),
  MODEL_CACHE_DIR: z.string().default('./.models'),

  // OpenRouter is the only provider: one key reaches every model family, so a
  // second adapter would add a code path without adding reach. The `ChatModel`
  // port is still the seam, and adding a direct provider means one file.
  LLM_PROVIDER: z.enum(['openrouter']).default('openrouter'),
  // The worker model. Cheap on purpose: retrieval does the hard part, so this is
  // asked to quote already-relevant passages with citations, which is extraction
  // rather than reasoning. An unset LLM_MODEL must not quietly default to a
  // frontier model costing a hundred times more per query.
  LLM_MODEL: z.string().default('qwen/qwen3.7-flash'),
  OPENROUTER_API_KEY: z.string().optional(),
  // The model that scores answers in the answer-quality eval. Must differ from
  // LLM_MODEL: a model grading its own output rates it generously, and the eval
  // refuses to run when the two match. A judge should be stronger than the
  // worker without being expensive, which is what gpt-5-mini buys at $0.25 per
  // 1M input against $2.00 for a frontier model.
  JUDGE_MODEL: z.string().default('openai/gpt-5-mini'),

  // Rejected rather than defaulted: a fallback secret is a vulnerability that
  // boots successfully, which is the worst combination.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  // --- OIDC provider, used to authorise MCP clients ---
  // The issuer must be the URL clients can actually reach, because it is both
  // the `iss` claim and the base for discovery.
  OIDC_ISSUER: z.string().default('http://localhost:4000'),
  // RFC 8707 resource indicator: which resource server tokens are minted for.
  MCP_RESOURCE: z.string().default('http://localhost:4100/mcp'),
  OIDC_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  // Where the generated signing key and the database live. Gitignored.
  DATA_DIR: z.string().default('./data'),
  MCP_CLIENT_ID: z.string().default('corpus-mcp'),
  MCP_CLIENT_SECRET: z.string().optional(),
  MCP_HTTP_PORT: z.coerce.number().int().positive().default(4100),
});

export type Config = z.infer<typeof configSchema>;

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) return cached;

  loadDotEnv();
  const parsed = configSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\n\nSee .env.example.`);
  }

  // Path settings are stored resolved, so no caller has to remember to do it.
  cached = {
    ...parsed.data,
    DATABASE_PATH: fromRepoRoot(parsed.data.DATABASE_PATH),
    DATA_DIR: fromRepoRoot(parsed.data.DATA_DIR),
    CORPUS_DIR: fromRepoRoot(parsed.data.CORPUS_DIR),
    MODEL_CACHE_DIR: fromRepoRoot(parsed.data.MODEL_CACHE_DIR),
  };
  return cached;
}

/** Test helper: forces the next `loadConfig()` to re-read the environment. */
export function resetConfigCache(): void {
  cached = undefined;
}

/**
 * The two secrets must differ. If they were equal, a refresh token would be a
 * valid access token, which quietly turns a 7-day credential into a 7-day
 * session bypass.
 */
export function assertSecretsAreDistinct(config: Config): void {
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error(
      'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ: identical secrets let a refresh token be replayed as an access token.',
    );
  }
}
