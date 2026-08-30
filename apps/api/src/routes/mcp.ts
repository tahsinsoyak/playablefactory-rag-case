import { join } from 'node:path';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { REPO_ROOT } from '@corpus/rag';
import {
  mcpTryRequestSchema,
  type McpStatus,
  type McpTryHit,
  type McpTryResponse,
  type McpTransportStatus,
} from '@corpus/shared';
import type { AppContext } from '../context.js';
import { badRequest } from '../errors.js';
import type { SigningKey } from '../oidc/keys.js';
import { issueAccessToken, SEARCH_SCOPE } from '../oidc/tokens.js';
import { listClients } from '../oidc/clients.js';

const TOOL_NAME = 'search_corpus';

/** Reads a JSON-RPC result out of either a plain JSON body or an SSE stream. */
function parseRpcResponse(body: string): unknown {
  const trimmed = body.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);

  // Streamable HTTP answers as text/event-stream, one `data:` line per message.
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('data: ')) return JSON.parse(line.slice(6));
  }
  throw new Error('The MCP server returned no parsable JSON-RPC message.');
}

async function checkHttpTransport(endpoint: string): Promise<McpTransportStatus> {
  const healthUrl = new URL('/health', endpoint).toString();

  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) {
      return { transport: 'http', reachable: 'down', detail: `HTTP ${response.status}` };
    }
    return { transport: 'http', reachable: 'up', detail: `listening at ${endpoint}` };
  } catch {
    return {
      transport: 'http',
      reachable: 'down',
      detail: 'not running. Start it with `npm run dev:mcp`',
    };
  }
}

/**
 * Admin routes backing the MCP integration page.
 *
 * The live check runs entirely server-side. The browser never sees the client
 * secret, and never mints a token: it asks this endpoint to exercise the real
 * MCP server and reports what happened. Putting the credential in the page to
 * make a prettier demo would undo the reason the transport is authenticated in
 * the first place.
 */
export function registerMcpRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  signingKey: SigningKey,
  guards: { requireAuth: preHandlerHookHandler; requireAdmin: preHandlerHookHandler },
): void {
  const adminOnly = { preHandler: [guards.requireAuth, guards.requireAdmin] };
  const { config } = ctx;

  app.get('/mcp/status', adminOnly, async () => {
    const clients = listClients(ctx.db);
    const registered = clients.some((client) => client.clientId === config.MCP_CLIENT_ID);

    const { n: indexedDocuments } = ctx.db
      .prepare("select count(*) as n from documents where status = 'indexed'")
      .get() as { n: number };

    const body: McpStatus = {
      toolName: TOOL_NAME,
      stdioCommand: 'node',
      stdioArgs: [join(REPO_ROOT, 'apps', 'mcp', 'dist', 'index.js')],
      httpEndpoint: config.MCP_RESOURCE,
      issuer: config.OIDC_ISSUER,
      resource: config.MCP_RESOURCE,
      scopes: [SEARCH_SCOPE],
      clientId: config.MCP_CLIENT_ID,
      clientRegistered: registered,
      transports: [
        {
          transport: 'stdio',
          reachable: 'not_applicable',
          detail: 'launched per client, so nothing listens until a client starts it',
        },
        await checkHttpTransport(config.MCP_RESOURCE),
      ],
      indexedDocuments,
    };
    return body;
  });

  /**
   * Exercises the real MCP endpoint: mint a token, then call the tool over
   * HTTP exactly as an external client would. Nothing is simulated, so a green
   * result here means the transport, the token, and the tool all work.
   */
  app.post('/mcp/try', adminOnly, async (request) => {
    const parsed = mcpTryRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(
        'Invalid MCP test request.',
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }

    const steps: McpTryResponse['steps'] = [];
    const hits: McpTryHit[] = [];

    // Step 1: mint a token, the same shape the token endpoint issues.
    const tokenStart = Date.now();
    const { accessToken } = await issueAccessToken(signingKey, {
      clientId: config.MCP_CLIENT_ID,
      subject: request.user?.sub ?? config.MCP_CLIENT_ID,
      role: 'user',
      scopes: [SEARCH_SCOPE],
      audience: config.MCP_RESOURCE,
      issuer: config.OIDC_ISSUER,
      expiresInSeconds: 60,
    });
    steps.push({
      name: 'Mint an OIDC access token',
      ok: true,
      detail: `RS256, audience ${config.MCP_RESOURCE}, scope ${SEARCH_SCOPE}, valid 60s`,
      durationMs: Date.now() - tokenStart,
    });

    // Step 2: call the tool over the authenticated HTTP transport.
    const callStart = Date.now();
    try {
      const response = await fetch(config.MCP_RESOURCE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: TOOL_NAME,
            arguments: { query: parsed.data.query, limit: parsed.data.limit },
          },
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const raw = await response.text();

      if (!response.ok) {
        steps.push({
          name: `Call ${TOOL_NAME} over HTTP`,
          ok: false,
          detail: `HTTP ${response.status}: ${raw.slice(0, 200)}`,
          durationMs: Date.now() - callStart,
        });
        return { ok: false, steps, hits, text: '' } satisfies McpTryResponse;
      }

      const message = parseRpcResponse(raw) as {
        result?: {
          isError?: boolean;
          content?: { type: string; text?: string }[];
          structuredContent?: { hits?: McpTryHit[] };
        };
        error?: { message?: string };
      };

      if (message.error) {
        steps.push({
          name: `Call ${TOOL_NAME} over HTTP`,
          ok: false,
          detail: message.error.message ?? 'The tool returned a JSON-RPC error.',
          durationMs: Date.now() - callStart,
        });
        return { ok: false, steps, hits, text: '' } satisfies McpTryResponse;
      }

      hits.push(...(message.result?.structuredContent?.hits ?? []));
      const text = message.result?.content?.find((c) => c.type === 'text')?.text ?? '';

      steps.push({
        name: `Call ${TOOL_NAME} over HTTP`,
        ok: !message.result?.isError,
        detail: `${hits.length} passage${hits.length === 1 ? '' : 's'} returned`,
        durationMs: Date.now() - callStart,
      });

      return { ok: !message.result?.isError, steps, hits, text } satisfies McpTryResponse;
    } catch (error) {
      steps.push({
        name: `Call ${TOOL_NAME} over HTTP`,
        ok: false,
        detail:
          error instanceof Error
            ? `${error.message}. Is the HTTP transport running? \`npm run dev:mcp\``
            : 'The MCP server could not be reached.',
        durationMs: Date.now() - callStart,
      });
      return { ok: false, steps, hits, text: '' } satisfies McpTryResponse;
    }
  });
}
