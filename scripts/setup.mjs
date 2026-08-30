#!/usr/bin/env node
/**
 * One-command setup: `npm run setup`.
 *
 * Creates `.env` from the example, generates the secrets that must not have
 * defaults, seeds the demo accounts, and builds the index. Everything it does is
 * idempotent, so running it twice is safe and running it after a corpus change
 * is the normal way to catch up.
 *
 * The secrets are generated rather than shipped because a default secret is a
 * vulnerability that boots successfully: it works on every machine, including
 * an attacker's.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(repoRoot, '.env');
const examplePath = resolve(repoRoot, '.env.example');

const secret = (bytes = 48) => randomBytes(bytes).toString('base64url');

function step(message) {
  process.stdout.write(`\n\x1b[1m${message}\x1b[0m\n`);
}

function note(message) {
  process.stdout.write(`  ${message}\n`);
}

/** Replaces a variable's value, whether or not it already has one. */
function setVar(text, key, value) {
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, `${key}=${value}`) : `${text}\n${key}=${value}`;
}

function readVar(text, key) {
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(text);
  return match?.[1]?.trim() ?? '';
}

function prepareEnv() {
  step('1/3  Environment');

  if (!existsSync(envPath)) {
    if (!existsSync(examplePath)) {
      throw new Error('.env.example is missing, so .env cannot be created from it.');
    }
    writeFileSync(envPath, readFileSync(examplePath, 'utf8'));
    note('created .env from .env.example');
  } else {
    note('.env already exists, leaving your values alone');
  }

  let env = readFileSync(envPath, 'utf8');
  let generated = 0;

  // Only fill in placeholders. A real value already in .env is never overwritten,
  // because re-running setup must not invalidate everyone's sessions.
  for (const [key, bytes] of [
    ['JWT_ACCESS_SECRET', 48],
    ['JWT_REFRESH_SECRET', 48],
    ['MCP_CLIENT_SECRET', 32],
  ]) {
    const current = readVar(env, key);
    if (current === '' || current.startsWith('change-me')) {
      env = setVar(env, key, secret(bytes));
      generated += 1;
    }
  }

  if (generated > 0) {
    writeFileSync(envPath, env);
    note(`generated ${generated} secret${generated === 1 ? '' : 's'}`);
  } else {
    note('secrets already set');
  }

  const key = readVar(env, 'OPENROUTER_API_KEY').replace(/^['"]|['"]$/g, '');
  // `sk-or-...` is the placeholder in .env.example. Left in place it is truthy,
  // so it reaches OpenRouter and comes back as "key rejected", which sends the
  // reader hunting for a bad key rather than a missing one. Blank it instead.
  const hasKey = key.startsWith('sk-or-') && !key.endsWith('...') && key.length > 20;

  if (!hasKey && key !== '') {
    env = setVar(env, 'OPENROUTER_API_KEY', '');
    writeFileSync(envPath, env);
  }

  if (hasKey) {
    note('OPENROUTER_API_KEY is set');
  } else {
    note('\x1b[33mOPENROUTER_API_KEY is not set yet.\x1b[0m');
    note('  Search, the dashboard, and the MCP server work without it.');
    note('  Answering questions needs one: https://openrouter.ai/keys');
    note('  Add it to .env, then re-run this if you like.');
  }

  return hasKey;
}

/** Runs a workspace script, inheriting stdio so its own output is the progress. */
function run(label, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${label} exited with code ${code}`)),
    );
    child.on('error', reject);
  });
}

async function main() {
  process.stdout.write('\n\x1b[1mCorpus RAG setup\x1b[0m\n');

  const hasKey = prepareEnv();

  step('2/3  Demo accounts');
  await run('seed', [
    resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
    'apps/api/src/scripts/seed.ts',
  ]);

  step('3/3  Index the corpus');
  note('first run downloads the embedding model, about 35 MB, then it is cached');
  // Quiet: 142 "added" lines is noise during setup, and the summary says what
  // matters. `npm run ingest` on its own still lists every change.
  await run('ingest', [
    resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
    'apps/api/src/scripts/ingest.ts',
    '--quiet',
  ]);

  process.stdout.write('\n\x1b[1mReady.\x1b[0m Start it with:\n\n');
  process.stdout.write('  npm run dev\n\n');
  process.stdout.write('Then open http://localhost:3000 and use the User or Admin button.\n');
  if (!hasKey) {
    process.stdout.write(
      '\n\x1b[33mWithout OPENROUTER_API_KEY the chat page will tell you the key is missing.\x1b[0m\n' +
        'Everything else, including search and the dashboard, works now.\n',
    );
  }
  process.stdout.write('\n');
}

main().catch((error) => {
  process.stderr.write(`\nSetup failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
