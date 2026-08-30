#!/usr/bin/env node
/**
 * Runs the API and web dev servers together.
 *
 * This exists because `"dev": "npm run dev -w api & npm run dev -w web"` is not
 * portable. On Windows npm runs scripts through cmd.exe, where `&` is a
 * *sequential* separator, not a background operator - so the API would start,
 * block forever, and the web app would never launch at all.
 *
 * Each server is launched by running its JS entry point with the current `node`
 * binary, rather than by shelling out to `npm`. That avoids two Windows traps at
 * once: Node 24 refuses to spawn a `.cmd` shim (`npm.cmd`, or anything in
 * `node_modules/.bin`) without a shell, and passing arguments with `shell: true`
 * is deprecated because they are concatenated unescaped (DEP0190). Spawning
 * `node` with an argument array sidesteps both, and needs no dependency.
 *
 * Output from both is prefixed so two interleaved logs stay readable, and either
 * process exiting brings the other down - a half-running stack is more confusing
 * than a stopped one.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SERVICES = [
  {
    name: 'api',
    colour: '[36m',
    args: [
      resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs'),
      'watch',
      resolve(repoRoot, 'apps/api/src/index.ts'),
    ],
    cwd: repoRoot,
  },
  {
    name: 'web',
    colour: '[35m',
    args: [resolve(repoRoot, 'node_modules/next/dist/bin/next'), 'dev', '--port', '3000'],
    cwd: resolve(repoRoot, 'apps/web'),
  },
];

const RESET = '[0m';
const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    // On Windows a detached npm wrapper does not forward signals to the process
    // it spawned, so the whole tree has to be taken down by pid.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }

  // Give the children a moment to go quietly before forcing the issue.
  setTimeout(() => process.exit(code), 500);
}

for (const service of SERVICES) {
  const child = spawn(process.execPath, service.args, {
    cwd: service.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const prefix = `${service.colour}[${service.name}]${RESET} `;

  const forward = (stream, target) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) target.write(`${prefix}${line}\n`);
    });
  };

  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (!shuttingDown) {
      process.stdout.write(`${prefix}exited with code ${code ?? 0}; stopping the other server\n`);
      shutdown(code ?? 0);
    }
  });

  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

process.stdout.write(
  'Starting both servers. API on http://localhost:4000, web on http://localhost:3000.\n' +
    'Press Ctrl+C to stop both.\n\n',
);
