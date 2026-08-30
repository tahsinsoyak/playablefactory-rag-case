import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { buildMcpServer, type McpServerOptions } from '../server.js';
import { OidcTokenVerifier, TokenVerificationError } from '../auth/verifier.js';

export interface McpHttpOptions extends McpServerOptions {
  issuer: string;
  /** RFC 8707 resource identifier: what tokens must name as their audience. */
  resource: string;
  requiredScopes: string[];
}

/**
 * The MCP server over Streamable HTTP, protected by OIDC.
 *
 * The stdio transport needs no authentication: the client launches the process,
 * owns its lifetime, and nothing is listening on a port. The moment the same
 * tools are reachable over HTTP that stops being true, so this transport
 * requires a bearer token issued by the configured provider, minted for this
 * resource, and carrying the search scope.
 *
 * Stateless mode: every request carries its own token and creates its own
 * transport. There is no session to fixate and no server-side state tying two
 * requests together, which suits a search tool that has nothing to remember.
 */
export async function buildMcpHttpServer(options: McpHttpOptions): Promise<{
  app: FastifyInstance;
  close: () => Promise<void>;
}> {
  const verifier = new OidcTokenVerifier({
    issuer: options.issuer,
    audience: options.resource,
    requiredScopes: options.requiredScopes,
  });

  const app = Fastify({ logger: false });
  const built = buildMcpServer(options);

  const resourceMetadataUrl = `${new URL(options.resource).origin}/.well-known/oauth-protected-resource`;

  /**
   * Tells an unauthenticated client where to get a token, as the MCP
   * authorization spec expects. Without this a client has to be told the issuer
   * out of band; with it, discovery is automatic.
   */
  app.get('/.well-known/oauth-protected-resource', async () => ({
    resource: options.resource,
    authorization_servers: [options.issuer],
    scopes_supported: options.requiredScopes,
    bearer_methods_supported: ['header'],
  }));

  app.get('/health', async () => ({ status: 'ok', transport: 'streamable-http', auth: 'oidc' }));

  /** Extracts and verifies the bearer token, or answers with a challenge. */
  async function authorize(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      reply
        .code(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="corpus-mcp", resource_metadata="${resourceMetadataUrl}"`,
        )
        .send({ error: 'unauthorized', error_description: 'A bearer token is required.' });
      return false;
    }

    try {
      const claims = await verifier.verify(header.slice('Bearer '.length).trim());
      request.log.info({ sub: claims.subject }, 'authorised MCP request');
      return true;
    } catch (error) {
      const insufficient =
        error instanceof TokenVerificationError && error.code === 'insufficient_scope';

      reply
        .code(insufficient ? 403 : 401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="corpus-mcp", error="${insufficient ? 'insufficient_scope' : 'invalid_token'}", resource_metadata="${resourceMetadataUrl}"`,
        )
        .send({
          error: insufficient ? 'insufficient_scope' : 'invalid_token',
          error_description:
            error instanceof Error ? error.message : 'The access token was rejected.',
        });
      return false;
    }
  }

  app.post('/mcp', async (request, reply) => {
    if (!(await authorize(request, reply))) return reply;

    // A fresh transport per request. Omitting `sessionIdGenerator` is what puts
    // the SDK in stateless mode; passing it explicitly as undefined is rejected
    // under `exactOptionalPropertyTypes`, and omission means the same thing.
    const transport = new StreamableHTTPServerTransport({});

    reply.raw.on('close', () => {
      void transport.close();
    });

    // The SDK's Transport interface declares optional callbacks that its own
    // classes type as `T | undefined`, which this project's
    // `exactOptionalPropertyTypes` rejects. The shapes are compatible at
    // runtime; the cast is at the library boundary and nowhere else.
    await built.server.connect(transport as Transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);

    return reply;
  });

  // GET and DELETE carry no body in stateless mode, so there is no stream to
  // resume and no session to end. Say so rather than failing obscurely.
  for (const method of ['get', 'delete'] as const) {
    app[method]('/mcp', async (request, reply) => {
      if (!(await authorize(request, reply))) return reply;
      return reply
        .code(405)
        .send({ error: 'method_not_allowed', error_description: 'This server is stateless.' });
    });
  }

  return {
    app,
    close: async () => {
      await app.close();
      await built.server.close();
      built.close();
    },
  };
}
