#!/usr/bin/env node
/**
 * Entry point for the HTTP transport, protected by OIDC.
 *
 * Run alongside the API with `npm run dev:mcp`. The stdio entry point
 * (`src/index.ts`) stays the right choice for a desktop client that launches
 * the process itself; this one exists for clients that reach the server over the
 * network, where authentication is not optional.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, fromRepoRoot } from '@corpus/rag';
import { buildMcpHttpServer } from './server.js';

function loadDotEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  loadDotEnv();

  const databasePath = fromRepoRoot(process.env['DATABASE_PATH'] ?? './data/corpus.db');
  if (!existsSync(databasePath)) {
    console.error(`No index found at ${databasePath}. Run \`npm run ingest\` first.`);
    process.exit(1);
  }

  const port = Number(process.env['MCP_HTTP_PORT'] ?? 4100);
  const issuer = process.env['OIDC_ISSUER'] ?? 'http://localhost:4000';
  const resource = process.env['MCP_RESOURCE'] ?? `http://localhost:${port}/mcp`;

  const { app } = await buildMcpHttpServer({
    databasePath,
    embedderSpec: process.env['EMBEDDER'] ?? 'local:bge-small-en-v1.5',
    modelCacheDir: fromRepoRoot(process.env['MODEL_CACHE_DIR'] ?? './.models'),
    issuer,
    resource,
    requiredScopes: ['corpus:search'],
  });

  await app.listen({ port, host: '0.0.0.0' });

  console.log(`corpus-search MCP server (HTTP) on http://localhost:${port}/mcp`);
  console.log(`  issuer:   ${issuer}`);
  console.log(`  resource: ${resource}`);
  console.log(`  scope:    corpus:search`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
