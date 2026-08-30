/**
 * Connects a real MCP client to the server over an in-memory transport pair and
 * exercises the tool the way an external client would: list the tools, then call
 * one and read the result back.
 *
 * Run with `npm run smoke --workspace=@corpus/mcp`. It proves the server is
 * callable through the protocol rather than merely that its functions run.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, fromRepoRoot } from '@corpus/rag';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from './server.js';

function loadDotEnv(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

async function main(): Promise<void> {
  loadDotEnv();

  const databasePath = fromRepoRoot(process.env['DATABASE_PATH'] ?? './data/corpus.db');
  if (!existsSync(databasePath)) {
    console.error(`No index at ${databasePath}. Run \`npm run ingest\` first.`);
    process.exit(1);
  }

  const { server, close } = buildMcpServer({
    databasePath,
    embedderSpec: process.env['EMBEDDER'] ?? 'local:bge-small-en-v1.5',
    modelCacheDir: fromRepoRoot(process.env['MODEL_CACHE_DIR'] ?? './.models'),
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'smoke-test', version: '0.1.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();
  console.log(`tools: ${tools.map((t) => t.name).join(', ')}`);

  const result = await client.callTool({
    name: 'search_corpus',
    arguments: {
      query: 'What is the maximum file size for an AppLovin playable?',
      limit: 3,
    },
  });

  const structured = result.structuredContent as
    { hits: { path: string; similarity: number | null }[] } | undefined;

  console.log(`\nisError: ${result.isError ?? false}`);
  console.log('hits:');
  for (const hit of structured?.hits ?? []) {
    console.log(`  ${hit.path}  (similarity ${hit.similarity?.toFixed(3) ?? 'n/a'})`);
  }

  const text = Array.isArray(result.content)
    ? (result.content.find((c) => c.type === 'text')?.text ?? '')
    : '';
  console.log(`\nfirst 220 chars of text content:\n${text.slice(0, 220)}`);

  await client.close();
  await server.close();
  close();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
