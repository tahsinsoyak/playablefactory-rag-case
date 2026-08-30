import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies OIDC access tokens presented by MCP clients.
 *
 * The resource server holds no secret and no key material. It fetches the
 * provider's public keys over JWKS and checks signatures with those, which is
 * the whole point of asymmetric signing here: this process can decide whether a
 * token is genuine, and cannot mint one.
 *
 * Because it verifies against a discovered issuer rather than anything local,
 * pointing it at Auth0, Keycloak, or Entra instead of the bundled provider is a
 * change of one URL. Nothing below knows who signed.
 */
export interface VerifierOptions {
  /** OIDC issuer. Its discovery document names the JWKS to trust. */
  issuer: string;
  /** RFC 8707 resource identifier this server accepts tokens for. */
  audience: string;
  /** Scopes a caller must hold to reach the tools. */
  requiredScopes: string[];
}

export interface TokenClaims {
  subject: string;
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

export class TokenVerificationError extends Error {
  constructor(
    message: string,
    /** Maps to the `error` field of the WWW-Authenticate challenge. */
    readonly code: 'invalid_token' | 'insufficient_scope' = 'invalid_token',
  ) {
    super(message);
    this.name = 'TokenVerificationError';
  }
}

interface DiscoveryDocument {
  issuer: string;
  jwks_uri: string;
}

export class OidcTokenVerifier {
  readonly #options: VerifierOptions;
  #jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
  #discovery: Promise<DiscoveryDocument> | undefined;

  constructor(options: VerifierOptions) {
    this.#options = options;
  }

  /**
   * Reads the provider's metadata once and caches it.
   *
   * The discovered `issuer` is checked against the configured one. Without that,
   * a redirected or spoofed discovery URL could quietly move trust to a
   * different provider's keys.
   */
  async #discover(): Promise<DiscoveryDocument> {
    this.#discovery ??= (async () => {
      const url = `${this.#options.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`OIDC discovery failed at ${url}: HTTP ${response.status}`);
      }

      const doc = (await response.json()) as DiscoveryDocument;

      if (doc.issuer !== this.#options.issuer) {
        throw new Error(
          `Discovery document issuer "${doc.issuer}" does not match the configured issuer "${this.#options.issuer}".`,
        );
      }

      return doc;
    })();

    return this.#discovery;
  }

  async verify(token: string): Promise<TokenClaims> {
    const doc = await this.#discover();
    // createRemoteJWKSet caches keys and refetches on an unknown `kid`, so a
    // rotated signing key is picked up without restarting this process.
    this.#jwks ??= createRemoteJWKSet(new URL(doc.jwks_uri));

    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#options.issuer,
        audience: this.#options.audience,
        algorithms: ['RS256'],
      }));
    } catch (error) {
      // Signature, issuer, audience, and expiry failures all land here, and all
      // are reported the same way: a caller learning *why* its token was
      // rejected learns something about the server it does not need.
      throw new TokenVerificationError(
        error instanceof Error ? error.message : 'Token verification failed.',
      );
    }

    const scopes = typeof payload['scope'] === 'string' ? payload['scope'].split(' ') : [];
    const missing = this.#options.requiredScopes.filter((s) => !scopes.includes(s));

    if (missing.length > 0) {
      throw new TokenVerificationError(
        `Token is missing the required scope: ${missing.join(', ')}.`,
        'insufficient_scope',
      );
    }

    if (!payload.sub || !payload.exp) {
      throw new TokenVerificationError('Token is missing sub or exp.');
    }

    return {
      subject: payload.sub,
      clientId: (payload['client_id'] as string | undefined) ?? payload.sub,
      scopes,
      expiresAt: payload.exp,
    };
  }
}
