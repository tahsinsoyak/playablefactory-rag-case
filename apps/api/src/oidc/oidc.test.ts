import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { TEST_CONFIG, buildTestApp, type TestApp } from '../test-support.js';
import { upsertClient } from './clients.js';
import { SEARCH_SCOPE, verifyAccessToken } from './tokens.js';

const CLIENT_ID = 'test-mcp-client';
const CLIENT_SECRET = 'a-test-client-secret-value';

let harness: TestApp;
let app: FastifyInstance;

async function requestToken(body: Record<string, string>) {
  return app.inject({ method: 'POST', url: '/oauth/token', payload: body });
}

async function validToken(overrides: Record<string, string> = {}): Promise<string> {
  const response = await requestToken({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    ...overrides,
  });
  assert.equal(response.statusCode, 200);
  return response.json().access_token as string;
}

before(async () => {
  harness = await buildTestApp();
  app = harness.app;
  await upsertClient(harness.db, {
    clientId: CLIENT_ID,
    secret: CLIENT_SECRET,
    role: 'user',
    scopes: [SEARCH_SCOPE],
    description: 'test client',
  });
});

after(async () => {
  await harness.close();
});

describe('OIDC discovery', () => {
  it('publishes metadata a client can start from', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/.well-known/openid-configuration',
    });

    assert.equal(response.statusCode, 200);
    const doc = response.json();
    assert.equal(doc.issuer, TEST_CONFIG.OIDC_ISSUER);
    assert.equal(doc.jwks_uri, `${TEST_CONFIG.OIDC_ISSUER}/.well-known/jwks.json`);
    assert.deepEqual(doc.grant_types_supported, ['client_credentials']);
  });

  it('serves only public key material', async () => {
    const response = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });
    assert.equal(response.statusCode, 200);

    const key = response.json().keys[0];
    assert.equal(key.kty, 'RSA');
    assert.equal(key.alg, 'RS256');
    // `d` is the RSA private exponent. Publishing it would hand every reader the
    // ability to mint tokens, so its absence is the assertion that matters.
    assert.ok(!('d' in key), 'JWKS must never contain private key material');
    assert.ok(!('p' in key) && !('q' in key), 'JWKS must not contain the prime factors');
  });
});

describe('token endpoint', () => {
  it('issues a token to a valid client', async () => {
    const response = await requestToken({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.token_type, 'Bearer');
    assert.equal(body.scope, SEARCH_SCOPE);
    assert.ok(body.expires_in > 0);
    assert.equal(response.headers['cache-control'], 'no-store');
  });

  it('accepts the secret via HTTP Basic as well as the body', async () => {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const response = await app.inject({
      method: 'POST',
      url: '/oauth/token',
      headers: { authorization: `Basic ${basic}` },
      payload: { grant_type: 'client_credentials' },
    });

    assert.equal(response.statusCode, 200);
  });

  it('answers the same way for a wrong secret and an unknown client', async () => {
    const wrongSecret = await requestToken({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: 'not-the-secret',
    });
    const unknownClient = await requestToken({
      grant_type: 'client_credentials',
      client_id: 'no-such-client',
      client_secret: 'not-the-secret',
    });

    // Distinguishing them would let a caller enumerate registered client ids.
    assert.equal(wrongSecret.statusCode, 401);
    assert.deepEqual(wrongSecret.json(), unknownClient.json());
  });

  it('refuses any grant other than client_credentials', async () => {
    const response = await requestToken({
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'unsupported_grant_type');
  });

  it('narrows a requested scope to what the client holds', async () => {
    const response = await requestToken({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: `${SEARCH_SCOPE} corpus:admin`,
    });

    // Asking for more than you were granted gets you less, never more.
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().scope, SEARCH_SCOPE);
  });

  it('rejects a request for a scope the client does not hold at all', async () => {
    const response = await requestToken({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: 'corpus:admin',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'invalid_scope');
  });
});

describe('issued tokens', () => {
  async function jwks() {
    return (await app.inject({ method: 'GET', url: '/.well-known/jwks.json' })).json();
  }

  it('verifies against the published JWKS', async () => {
    const token = await validToken();
    const claims = await verifyAccessToken(token, {
      jwks: await jwks(),
      issuer: TEST_CONFIG.OIDC_ISSUER,
      audience: TEST_CONFIG.MCP_RESOURCE,
      requiredScopes: [SEARCH_SCOPE],
    });

    assert.equal(claims.clientId, CLIENT_ID);
    assert.deepEqual(claims.scopes, [SEARCH_SCOPE]);
  });

  it('is rejected by a resource server it was not minted for', async () => {
    const token = await validToken();

    // RFC 8707: a token leaked from one resource cannot be replayed at another.
    await assert.rejects(
      verifyAccessToken(token, {
        jwks: await jwks(),
        issuer: TEST_CONFIG.OIDC_ISSUER,
        audience: 'http://localhost:9999/somewhere-else',
      }),
      // jose reports this as an "aud" claim mismatch.
      /"aud" claim/i,
    );
  });

  it('is rejected when the issuer does not match', async () => {
    const token = await validToken();

    await assert.rejects(
      verifyAccessToken(token, {
        jwks: await jwks(),
        issuer: 'https://some-other-provider.example',
        audience: TEST_CONFIG.MCP_RESOURCE,
      }),
      /"iss" claim/i,
    );
  });

  it('is rejected when a required scope is missing', async () => {
    const token = await validToken();

    await assert.rejects(
      verifyAccessToken(token, {
        jwks: await jwks(),
        issuer: TEST_CONFIG.OIDC_ISSUER,
        audience: TEST_CONFIG.MCP_RESOURCE,
        requiredScopes: ['corpus:admin'],
      }),
      /scope/i,
    );
  });

  it('can be minted for a specific resource on request', async () => {
    const token = await validToken({ resource: 'http://localhost:5555/other-mcp' });

    const claims = await verifyAccessToken(token, {
      jwks: await jwks(),
      issuer: TEST_CONFIG.OIDC_ISSUER,
      audience: 'http://localhost:5555/other-mcp',
    });

    assert.equal(claims.clientId, CLIENT_ID);
  });
});
