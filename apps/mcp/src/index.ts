#!/usr/bin/env node
/**
 * MCP server entry point, speaking stdio.
 *
 * stdio rather than HTTP because that is what desktop MCP clients launch: the
 * client owns the process lifetime, and the transport is inherently local, so no
 * port is opened and no network auth is needed for this path. The README
 * describes how OIDC would secure an HTTP transport if the server were ever
 * exposed beyond the machine it runs on.
 *
 * Nothing may be written to stdout except protocol frames - stdout *is* the
 * transport. Diagnostics go to stderr.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { REPO_ROOT, fromRepoRoot } from '@corpus/rag';
import { buildMcpServer } from './server.js';

function loadDotEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  loadDotEnv();

  const databasePath = fromRepoRoot(process.env['DATABASE_PATH'] ?? './data/corpus.db');

  if (!existsSync(databasePath)) {
    console.error(
      `No index found at ${databasePath}. Run \`npm run ingest\` before starting the MCP server.`,
    );
    process.exit(1);
  }

  const { server, close } = buildMcpServer({
    databasePath,
    embedderSpec: process.env['EMBEDDER'] ?? 'local:bge-small-en-v1.5',
    modelCacheDir: fromRepoRoot(process.env['MODEL_CACHE_DIR'] ?? './.models'),
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`corpus-search MCP server ready (index: ${databasePath})`);

  const shutdown = async (): Promise<void> => {
    await server.close();
    close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
