import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Loads `.env` from the repo root if present. Node can do this natively, so there
 * is no dotenv dependency. Real environment variables always win, which is what
 * makes the same build work in a deployment that has no `.env` file at all.
 */
function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), '.env');
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
  MODEL_CACHE_DIR: z.string().default('./.models'),

  LLM_PROVIDER: z.enum(['anthropic']).default('anthropic'),
  LLM_MODEL: z.string().default('claude-opus-5'),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Rejected rather than defaulted: a fallback secret is a vulnerability that
  // boots successfully, which is the worst combination.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),

  MCP_AUTH_TOKEN: z.string().optional(),
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

  cached = parsed.data;
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
