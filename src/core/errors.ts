import { logger } from './logger.js';

/**
 * Base class for all errors thrown deliberately by application code. Carries an
 * optional `cause` so the original error is never lost when re-wrapping.
 *
 * Distinguishing our own errors from unexpected ones lets the centralized
 * handlers decide how loudly to react.
 */
export class AppError extends Error {
    public constructor(message: string, options?: { cause?: unknown }) {
        super(message);
        this.name = new.target.name;
        if (options?.cause !== undefined) {
            this.cause = options.cause;
        }
        Error.captureStackTrace?.(this, new.target);
    }
}

/** Thrown when configuration is invalid or a required dependency is misconfigured. */
export class ConfigError extends AppError {}

/** Thrown for Postgres/Drizzle connection or query failures surfaced by the app. */
export class DatabaseError extends AppError {}

/** Thrown for Redis connection failures surfaced by the app. */
export class CacheError extends AppError {}

/**
 * Normalizes an unknown thrown value into a real `Error`. JavaScript allows
 * throwing anything; this guarantees downstream code has a stack and message.
 *
 * @param value - The value caught in a `catch` block.
 */
export function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value;
    }
    return new Error(typeof value === 'string' ? value : JSON.stringify(value));
}

/**
 * Installs process-level handlers for otherwise-fatal conditions.
 *
 * - `unhandledRejection` is logged at `error` level and the process keeps running
 *   (a stray rejected promise should not take the whole bot down).
 * - `uncaughtException` is logged at `fatal` level and the process exits with code
 *   `1`, because after an uncaught exception the process state is unknown and the
 *   safe action is to let the supervisor restart it.
 *
 * Call this once, as early as possible in the boot sequence.
 */
export function installGlobalErrorHandlers(): void {
    process.on('unhandledRejection', (reason: unknown) => {
        logger.error({ err: toError(reason) }, 'Unhandled promise rejection');
    });

    process.on('uncaughtException', (error: Error, origin: string) => {
        logger.fatal({ err: error, origin }, 'Uncaught exception — exiting');
        // Give pino a tick to flush, then exit so the supervisor can restart us.
        setTimeout(() => process.exit(1), 100);
    });
}
