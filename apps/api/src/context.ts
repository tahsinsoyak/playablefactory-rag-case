import type { Db } from './db/index.js';
import type { Config } from './config.js';

/**
 * Everything a route needs, passed explicitly rather than reached for through
 * module state. That is what lets the tests build an app against an in-memory
 * database without touching the environment or a real file.
 */
export interface AppContext {
  db: Db;
  config: Config;
}
