import 'dotenv/config';

import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration (used by `npm run db:generate` / `db:migrate` /
 * `db:push` / `db:studio`). Reads `DATABASE_URL` from the environment.
 */
export default defineConfig({
    schema: './src/core/db/schema/index.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: {
        url: process.env.DATABASE_URL ?? '',
    },
});
