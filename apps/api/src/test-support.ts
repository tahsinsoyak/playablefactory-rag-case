import { fromRepoRoot, openDatabase, runMigrations, corpusMigrations, type Db } from '@corpus/rag';
import type { FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { apiMigrations } from './db/schema.js';
import { buildServer } from './server.js';
import { createUser } from './auth/users.js';
import { ACCESS_COOKIE } from './auth/middleware.js';

/**
 * Shared fixtures for the API test suites.
 *
 * Kept in one place because the config was previously copied verbatim into two
 * test files, and a fixture that drifts between suites is worse than no fixture:
 * the suites stop testing the same system.
 */
export const TEST_CONFIG: Config = {
  NODE_ENV: 'test',
  API_PORT: 0,
  WEB_ORIGIN: 'http://localhost:3000',
  DATABASE_PATH: ':memory:',
  // Absolute, because tests run with the cwd inside this workspace and routes
  // that read the corpus from disk would otherwise look in apps/api/corpus.
  CORPUS_DIR: fromRepoRoot('corpus'),
  EMBEDDER: 'local:bge-small-en-v1.5',
  RERANKER: 'none',
  MODEL_CACHE_DIR: fromRepoRoot('.models'),
  LLM_PROVIDER: 'anthropic',
  LLM_MODEL: 'claude-opus-5',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL: '7d',
  OIDC_ISSUER: 'http://localhost:4000',
  MCP_RESOURCE: 'http://localhost:4100/mcp',
  OIDC_TOKEN_TTL_SECONDS: 3600,
  DATA_DIR: fromRepoRoot('data'),
  MCP_CLIENT_ID: 'corpus-mcp',
  MCP_HTTP_PORT: 4100,
};

export const TEST_USER = {
  email: 'user@test.local',
  password: 'user-password',
  role: 'user' as const,
};

export const TEST_ADMIN = {
  email: 'admin@test.local',
  password: 'admin-password',
  role: 'admin' as const,
};

export interface TestApp {
  app: FastifyInstance;
  db: Db;
  close: () => Promise<void>;
}

/** Builds the real server against an in-memory database with both demo users. */
export async function buildTestApp(config: Config = TEST_CONFIG): Promise<TestApp> {
  const db = openDatabase({ path: ':memory:' });
  runMigrations(db, [...corpusMigrations, ...apiMigrations]);

  await createUser(db, TEST_USER);
  await createUser(db, TEST_ADMIN);

  const app = await buildServer({ db, config });

  return {
    app,
    db,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

/** Signs in and returns the access cookie value, asserting the login worked. */
export async function loginCookie(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Expected ${email} to sign in, got ${response.statusCode}.`);
  }

  const raw = response.headers['set-cookie'];
  const all = Array.isArray(raw) ? raw : [raw];
  const match = all.find((c): c is string => typeof c === 'string' && c.startsWith(ACCESS_COOKIE));

  if (!match) throw new Error('Expected an access cookie on the login response.');
  return match.split(';')[0]!.split('=').slice(1).join('=');
}
