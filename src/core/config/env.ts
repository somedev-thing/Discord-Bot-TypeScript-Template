import 'dotenv/config';

import { z } from 'zod';

/**
 * Parses a "boolean-ish" environment string. Discord/Docker style env vars are
 * always strings, so we accept the usual truthy spellings and treat everything
 * else as `false`.
 */
const booleanish = z
    .union([z.boolean(), z.string()])
    .transform(value =>
        typeof value === 'boolean'
            ? value
            : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
    );

/**
 * Parses a comma-separated list (e.g. `a,b,c`) into a trimmed string array.
 * Empty / missing input becomes an empty array.
 */
const csv = z
    .string()
    .optional()
    .transform(value =>
        value
            ? value
                  .split(',')
                  .map(part => part.trim())
                  .filter(Boolean)
            : []
    );

/**
 * The raw environment schema. Required variables have no default and will fail
 * validation if absent. Postgres and Redis are **required** infrastructure — the
 * bot refuses to boot without reachable connection strings.
 */
const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).optional(),
    LOG_PRETTY: booleanish.optional(),

    DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
    DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
    DEV_GUILD_ID: z.string().optional(),
    DEV_USER_IDS: csv,

    DATABASE_URL: z.string().url('DATABASE_URL must be a valid Postgres connection string'),
    REDIS_URL: z.string().url('REDIS_URL must be a valid Redis connection string'),

    DEFAULT_THEME: z.string().default('default'),
});

/** The validated, raw environment values. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * The structured, strongly-typed application configuration that the rest of the
 * codebase consumes. Prefer importing {@link config} over reading
 * `process.env` directly — this object is validated, typed, and documented.
 */
export interface Config {
    /** Raw `NODE_ENV`. */
    readonly nodeEnv: Env['NODE_ENV'];
    readonly isDev: boolean;
    readonly isProd: boolean;
    readonly isTest: boolean;
    readonly log: {
        readonly level: NonNullable<Env['LOG_LEVEL']>;
        readonly pretty: boolean;
    };
    readonly discord: {
        readonly token: string;
        readonly clientId: string;
        /** Guild used for fast, guild-scoped command registration in dev. */
        readonly devGuildId: string | undefined;
        readonly devUserIds: readonly string[];
    };
    readonly database: {
        /** Postgres connection string (required). */
        readonly url: string;
    };
    readonly redis: {
        /** Redis connection string (required). */
        readonly url: string;
    };
    readonly engine: {
        readonly defaultTheme: string;
    };
}

/**
 * Validates `process.env` and builds the structured {@link Config}.
 *
 * @throws An `Error` with a human-readable, multi-line message listing every
 * invalid/missing variable. The process should not continue if this throws.
 */
function loadConfig(): Config {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
    }

    const env = parsed.data;
    const isDev = env.NODE_ENV === 'development';
    const isProd = env.NODE_ENV === 'production';

    return {
        nodeEnv: env.NODE_ENV,
        isDev,
        isProd,
        isTest: env.NODE_ENV === 'test',
        log: {
            level: env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
            pretty: env.LOG_PRETTY ?? !isProd,
        },
        discord: {
            token: env.DISCORD_TOKEN,
            clientId: env.DISCORD_CLIENT_ID,
            devGuildId: env.DEV_GUILD_ID,
            devUserIds: env.DEV_USER_IDS,
        },
        database: {
            url: env.DATABASE_URL,
        },
        redis: {
            url: env.REDIS_URL,
        },
        engine: {
            defaultTheme: env.DEFAULT_THEME,
        },
    };
}

/**
 * The singleton application configuration, validated at first import.
 *
 * @example
 * ```ts
 * import { config } from './core/config/index.js';
 * if (config.database.enabled) { ... }
 * ```
 */
export const config: Config = loadConfig();
