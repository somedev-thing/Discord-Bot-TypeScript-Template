import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { config } from '../config/index.js';
import { DatabaseError } from '../errors.js';
import { childLogger } from '../logger.js';
import * as schema from './schema/index.js';

const log = childLogger({ mod: 'db' });

/** The Drizzle database type, aware of our (currently empty) schema. */
export type Database = PostgresJsDatabase<typeof schema>;

let sql: Sql | undefined;
let db: Database | undefined;

/**
 * Connects to Postgres and verifies the connection with a `select 1` so we
 * **fail fast** on an unreachable server. Postgres is required infrastructure;
 * a failure here should abort boot.
 *
 * Safe to call multiple times; subsequent calls are no-ops once connected.
 *
 * @throws {@link DatabaseError} if the server is unreachable.
 */
export async function connectDatabase(): Promise<void> {
    if (db) {
        return;
    }

    try {
        sql = postgres(config.database.url, {
            max: 10,
            onnotice: () => {
                /* silence NOTICE spam */
            },
        });
        // Force an actual round-trip so we fail fast if the server is unreachable.
        await sql`select 1`;
        db = drizzle(sql, { schema });
        log.info('Connected to Postgres');
    } catch (error) {
        await sql?.end({ timeout: 1 }).catch(() => undefined);
        sql = undefined;
        throw new DatabaseError('Failed to connect to Postgres', { cause: error });
    }
}

/**
 * Returns the connected Drizzle database.
 *
 * @throws {@link DatabaseError} if called before {@link connectDatabase} has
 * successfully connected.
 *
 * @example
 * ```ts
 * import { getDb } from './core/db/index.js';
 * const rows = await getDb().select().from(someTable);
 * ```
 */
export function getDb(): Database {
    if (!db) {
        throw new DatabaseError(
            'Database is not connected. Ensure DATABASE_URL is set and connectDatabase() was awaited.'
        );
    }
    return db;
}

/** Gracefully closes the Postgres connection pool (used during shutdown). */
export async function disconnectDatabase(): Promise<void> {
    if (sql) {
        await sql.end({ timeout: 5 });
        sql = undefined;
        db = undefined;
        log.info('Disconnected from Postgres');
    }
}
