import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id at OWASP's recommended floor (19 MiB, 2 iterations, 1 lane).
 *
 * `@node-rs/argon2` ships prebuilt binaries rather than compiling on install,
 * which matters here: npm 12 blocks lifecycle scripts by default, so a package
 * that builds in a postinstall would fail to install on a reviewer's fresh
 * machine without extra flags.
 */
/**
 * `algorithm` is left unset on purpose: argon2id is this library's default, and
 * its `Algorithm` enum is an ambient const enum that `verbatimModuleSyntax`
 * cannot import. Naming the default explicitly is not worth loosening a
 * compiler setting that exists to keep imports honest.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/**
 * Returns false rather than throwing on a malformed stored hash. A corrupt row
 * should fail that one login, not crash the endpoint for everyone.
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}
