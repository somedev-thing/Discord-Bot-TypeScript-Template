/**
 * Postgres + Drizzle access.
 *
 * The database is **required** infrastructure but lazily initialized: call
 * {@link connectDatabase} during boot (it fails fast if Postgres is unreachable),
 * then use {@link getDb} wherever you need queries.
 */
export { connectDatabase, disconnectDatabase, getDb, type Database } from './client.js';
