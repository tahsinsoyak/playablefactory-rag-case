import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locates the workspace root by walking up from this file until it finds the
 * `package.json` that declares `workspaces`.
 *
 * Nothing in this project may resolve a configured path against `process.cwd()`.
 * npm runs a workspace script with the cwd set to that workspace, so
 * `npm run ingest` from the repo root arrives with cwd at `apps/api` and a
 * relative `./corpus` points at `apps/api/corpus`. An MCP client is worse still:
 * it launches the server with a cwd of its own choosing. Anchoring to the root
 * makes every entry point behave identically wherever it is invoked from.
 */
function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 10; depth += 1) {
    const manifest = resolve(dir, 'package.json');

    if (existsSync(manifest)) {
      try {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces) return dir;
      } catch {
        // An unreadable or non-JSON manifest is not the root; keep walking.
      }
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // An unusual install layout (published package, bundled output): cwd is the
  // best remaining guess, and an absolute path in the environment still wins.
  return process.cwd();
}

export const REPO_ROOT = findRepoRoot();

/** Resolves a configured path against the repo root, leaving absolute paths alone. */
export function fromRepoRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path);
}
