import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { loadSigningKey, toJwks, type SigningKey } from './keys.js';
import { issueAccessToken, SEARCH_SCOPE } from './tokens.js';
import { authenticateClient, grantedScopes } from './clients.js';

/**
 * OAuth 2.0 / OIDC endpoints, used to authorise MCP clients.
 *
 * This is deliberately a narrow provider, not a general-purpose one. The only
 * flow implemented is `client_credentials`, because the thing being authorised
 * is a program calling a search tool, not a person logging in. Adding an
 * authorization-code flow would mean a consent screen and a browser redirect for
 * a caller that has neither.
 *
 * Discovery and JWKS are real, so the MCP server verifies tokens the same way it
 * would against any provider: fetch the metadata, fetch the keys, check the
 * signature. Pointing it at Auth0 or Keycloak instead would be a change of one
 * issuer URL, because nothing in the resource server knows who signed.
 */
export async function registerOidcRoutes(
  app: FastifyInstance,
  ctx: AppContext,
): Promise<SigningKey> {
  const key: SigningKey = await loadSigningKey(ctx.config.DATA_DIR);
  const issuer = ctx.config.OIDC_ISSUER;

  /**
   * OpenID Provider metadata (RFC 8414). A client reads this to find the token
   * endpoint and the keys, rather than having them hard-coded.
   */
  app.get('/.well-known/openid-configuration', async () => ({
    issuer,
    token_endpoint: `${issuer}/oauth/token`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    scopes_supported: [SEARCH_SCOPE],
    response_types_supported: [],
    id_token_signing_alg_values_supported: ['RS256'],
  }));

  // Same document under the OAuth name, since clients look for either.
  app.get('/.well-known/oauth-authorization-server', async (_request, reply) =>
    reply.redirect('/.well-known/openid-configuration', 302),
  );

  /** Public keys. Only ever public material: the private key never leaves the API. */
  app.get('/.well-known/jwks.json', async (_request, reply) => {
    // Short cache: long enough to spare a fetch per request, short enough that a
    // rotated key is picked up without a restart.
    reply.header('Cache-Control', 'public, max-age=300');
    return toJwks(key);
  });

  /**
   * Token endpoint. Accepts the client secret in the body or via HTTP Basic,
   * which are the two forms clients actually send.
   */
  app.post('/oauth/token', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, string | undefined>;

    let clientId = body['client_id'];
    let clientSecret = body['client_secret'];

    const authorization = request.headers.authorization;
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator > 0) {
        clientId = decoded.slice(0, separator);
        clientSecret = decoded.slice(separator + 1);
      }
    }

    if (body['grant_type'] !== 'client_credentials') {
      return reply.code(400).send({
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials is supported.',
      });
    }

    if (!clientId || !clientSecret) {
      return reply.code(400).send({
        error: 'invalid_request',
        error_description: 'client_id and client_secret are required.',
      });
    }

    const client = await authenticateClient(ctx.db, clientId, clientSecret);
    if (!client) {
      // 401 with the challenge header, as RFC 6749 requires for a failed
      // client authentication.
      reply.header('WWW-Authenticate', 'Basic realm="corpus-oidc"');
      return reply.code(401).send({
        error: 'invalid_client',
        error_description: 'Unknown client or bad secret.',
      });
    }

    const scopes = grantedScopes(client, body['scope']);
    if (scopes.length === 0) {
      return reply.code(400).send({
        error: 'invalid_scope',
        error_description: `This client holds no requested scope. Granted: ${client.scopes.join(' ')}`,
      });
    }

    // The audience is the resource the token is for, so a token minted for the
    // MCP server cannot be replayed against this API.
    const audience = body['resource'] ?? ctx.config.MCP_RESOURCE;

    const { accessToken, expiresIn } = await issueAccessToken(key, {
      clientId: client.clientId,
      subject: client.clientId,
      role: client.role,
      scopes,
      audience,
      issuer,
      expiresInSeconds: ctx.config.OIDC_TOKEN_TTL_SECONDS,
    });

    reply.header('Cache-Control', 'no-store');
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope: scopes.join(' '),
    };
  });

  // Returned so other routes can mint tokens with the same key rather than
  // loading a second copy of it.
  return key;
}
