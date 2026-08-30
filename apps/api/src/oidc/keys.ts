import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { exportJWK, importPKCS8, importSPKI, type CryptoKey, type JWK } from 'jose';

/**
 * The signing key for OIDC access tokens.
 *
 * RS256 rather than the HS256 used for the app's own session cookies, because
 * these tokens are verified by a different process. A shared secret would mean
 * handing the MCP server the power to mint tokens as well as check them;
 * asymmetric signing lets it verify with a public key it fetches over JWKS and
 * nothing more.
 *
 * The key is generated on first run and cached under the data directory, which
 * is gitignored. That keeps a fresh clone working with no setup step while never
 * committing a private key. A real deployment would mount one from its secret
 * store instead, which is what `OIDC_PRIVATE_KEY_PATH` is for.
 */
export interface SigningKey {
  privateKey: CryptoKey;
  publicJwk: JWK;
  /** `kid`, published in the JWKS so a verifier can select the right key. */
  keyId: string;
  algorithm: 'RS256';
}

interface KeyPaths {
  privatePath: string;
  publicPath: string;
}

function keyPaths(dataDir: string): KeyPaths {
  return {
    privatePath: join(dataDir, 'oidc-private.pem'),
    publicPath: join(dataDir, 'oidc-public.pem'),
  };
}

function generateAndStore({ privatePath, publicPath }: KeyPaths): void {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

  mkdirSync(dirname(privatePath), { recursive: true });
  writeFileSync(privatePath, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), {
    // Owner-only where the platform honours it. Windows ignores the mode, which
    // is another reason the key lives in gitignored local state and not in git.
    mode: 0o600,
  });
  writeFileSync(publicPath, publicKey.export({ type: 'spki', format: 'pem' }).toString());
}

/**
 * A stable `kid` derived from the public key itself, so it changes exactly when
 * the key does. A verifier that has cached the old JWKS then misses rather than
 * silently accepting a token signed by a rotated key.
 */
function thumbprint(publicPem: string): string {
  return createHash('sha256').update(publicPem).digest('base64url').slice(0, 16);
}

export async function loadSigningKey(dataDir: string): Promise<SigningKey> {
  const paths = keyPaths(dataDir);

  if (!existsSync(paths.privatePath) || !existsSync(paths.publicPath)) {
    generateAndStore(paths);
  }

  const privatePem = readFileSync(paths.privatePath, 'utf8');
  const publicPem = readFileSync(paths.publicPath, 'utf8');

  const privateKey = await importPKCS8(privatePem, 'RS256');
  const publicKey = await importSPKI(publicPem, 'RS256');
  const keyId = thumbprint(publicPem);

  const publicJwk: JWK = {
    ...(await exportJWK(publicKey)),
    kid: keyId,
    alg: 'RS256',
    use: 'sig',
  };

  return { privateKey, publicJwk, keyId, algorithm: 'RS256' };
}

/** The JWKS document served at the discovery-advertised `jwks_uri`. */
export function toJwks(key: SigningKey): { keys: JWK[] } {
  return { keys: [key.publicJwk] };
}
