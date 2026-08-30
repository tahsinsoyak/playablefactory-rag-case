import { assertSecretsAreDistinct, loadConfig } from './config.js';
import { initDatabase } from './db/index.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  assertSecretsAreDistinct(config);

  const { db, applied } = initDatabase(config.DATABASE_PATH);
  const app = await buildServer({ db, config });

  if (applied.length > 0) {
    app.log.info({ migrations: applied }, 'applied database migrations');
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
