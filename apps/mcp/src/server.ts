import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  HybridRetriever,
  SqliteVectorStore,
  createEmbedder,
  openDatabase,
  type Db,
} from '@corpus/rag';
import type { SearchHit } from '@corpus/shared';

export interface McpServerOptions {
  databasePath: string;
  embedderSpec: string;
  modelCacheDir: string;
}

/**
 * Formats hits for an MCP client.
 *
 * Returned as readable text rather than raw JSON because the consumer is a
 * language model: it needs the passage and enough provenance to cite it, not a
 * serialised record. `structuredContent` carries the machine-readable form
 * alongside, so a programmatic client is not forced to parse prose.
 */
function formatHits(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) {
    return `No passages in the corpus matched "${query}".`;
  }

  return hits
    .map((hit, index) => {
      const heading = hit.heading ? ` › ${hit.heading}` : '';
      const similarity = hit.vectorScore === null ? 'n/a' : hit.vectorScore.toFixed(3);
      return [
        `[${index + 1}] ${hit.title}${heading}`,
        `    source: ${hit.path}`,
        `    similarity: ${similarity}`,
        '',
        hit.text,
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

export interface BuiltMcpServer {
  server: McpServer;
  close: () => void;
}

/**
 * Builds the MCP server over the same `packages/rag` retriever the HTTP API
 * uses. That reuse is the point: the MCP tool and the web search cannot drift
 * apart into two implementations with different behaviour, because there is only
 * one implementation.
 */
export function buildMcpServer(options: McpServerOptions): BuiltMcpServer {
  // Read-only: an MCP client should be able to search the corpus, never to
  // modify it. The database enforces that rather than the tool definitions.
  const db: Db = openDatabase({ path: options.databasePath, readonly: true });
  const embedder = createEmbedder(options.embedderSpec, { cacheDir: options.modelCacheDir });
  const retriever = new HybridRetriever(db, new SqliteVectorStore(db), embedder);

  const server = new McpServer({
    name: 'corpus-search',
    version: '0.1.0',
  });

  server.registerTool(
    'search_corpus',
    {
      title: 'Search the internal document corpus',
      description:
        'Semantic and keyword search over the internal production corpus: client briefs, ' +
        'production sync notes, delivery reports, postmortems, SDK and network specs, and ' +
        'process guides. Returns the most relevant passages with the source document path ' +
        'for each, so answers built from them can be cited. Use it whenever a question ' +
        'concerns internal projects, clients, processes, or tooling.',
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(1000)
          .describe('A natural-language question or search phrase.'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(8)
          .describe('Maximum number of passages to return.'),
        mode: z
          .enum(['hybrid', 'vector', 'keyword'])
          .default('hybrid')
          .describe(
            'hybrid fuses semantic and keyword search and is almost always the right choice; ' +
              'vector is semantic only; keyword is exact-term only, useful for identifiers.',
          ),
        docType: z
          .enum([
            'client-brief',
            'meeting-note',
            'delivery-report',
            'postmortem',
            'changelog',
            'guide',
            'reference',
          ])
          .optional()
          .describe('Restrict results to one kind of document.'),
      },
    },
    async ({ query, limit, mode, docType }) => {
      try {
        const hits = await retriever.search({
          query,
          limit,
          mode,
          ...(docType ? { docType } : {}),
        });

        return {
          content: [{ type: 'text' as const, text: formatHits(query, hits) }],
          structuredContent: {
            query,
            hits: hits.map((hit) => ({
              path: hit.path,
              title: hit.title,
              heading: hit.heading,
              text: hit.text,
              docType: hit.docType,
              docDate: hit.docDate,
              similarity: hit.vectorScore,
            })),
          },
        };
      } catch (error) {
        // Reported as a tool error rather than thrown, so the client sees a
        // failed tool call it can recover from instead of a dead connection.
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `Search failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );

  return { server, close: () => db.close() };
}
