/**
 * Drizzle schema barrel.
 *
 * No tables are defined yet — this is the foundation phase. Feature modules
 * under `src/modules/` will define their own Drizzle tables and re-export them
 * here so the single `db` instance is aware of the full schema (and so
 * `drizzle-kit` can generate migrations from one place).
 *
 */
export * from '../../../modules/moderation/schema.js';
