/**
 * Creates the two demo accounts the README documents. Idempotent: re-running it
 * resets their passwords rather than failing on a unique constraint, so a
 * reviewer who loses the password can just run it again.
 */
import { loadConfig } from '../config.js';
import { initDatabase } from '../db/index.js';
import { upsertUser } from '../auth/users.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const { db } = initDatabase(config.DATABASE_PATH);

  const accounts = [
    {
      email: process.env['SEED_USER_EMAIL'] ?? 'user@demo.local',
      password: process.env['SEED_USER_PASSWORD'] ?? 'demo-user-pw',
      role: 'user' as const,
    },
    {
      email: process.env['SEED_ADMIN_EMAIL'] ?? 'admin@demo.local',
      password: process.env['SEED_ADMIN_PASSWORD'] ?? 'demo-admin-pw',
      role: 'admin' as const,
    },
  ];

  for (const account of accounts) {
    const user = await upsertUser(db, account);
    console.log(`seeded ${user.role.padEnd(5)} ${user.email}`);
  }

  db.close();
  console.log('\nDone. Sign in with either account at the web app.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
