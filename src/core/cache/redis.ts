import { Redis } from 'ioredis';

import { config } from '../config/index.js';
import { CacheError } from '../errors.js';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'cache' });

let client: Redis | undefined;

/**
 * Connects to Redis, verifying the connection with a `PING` so we **fail fast**
 * on an unreachable server. Redis is required infrastructure; a failure here
 * should abort boot.
 *
 * Safe to call multiple times; subsequent calls are no-ops once connected.
 *
 * @throws {@link CacheError} if the server is unreachable.
 */
export async function connectCache(): Promise<void> {
    if (client) {
        return;
    }

    const redis = new Redis(config.redis.url, {
        // We control the initial connection explicitly so we can fail fast.
        lazyConnect: true,
        connectTimeout: 10_000,
        maxRetriesPerRequest: 2,
    });
    // Prevent unhandled 'error' events from crashing the process at runtime.
    redis.on('error', (err: Error) => log.error({ err }, 'Redis connection error'));

    try {
        await redis.connect();
        await redis.ping();
        client = redis;
        log.info('Connected to Redis');
    } catch (error) {
        redis.disconnect();
        throw new CacheError('Failed to connect to Redis', { cause: error });
    }
}

/**
 * Returns the connected Redis client.
 *
 * @throws {@link CacheError} if called before {@link connectCache} has
 * successfully connected.
 *
 * @example
 * ```ts
 * import { getCache } from './core/cache/index.js';
 * await getCache().set('key', 'value', 'EX', 60);
 * ```
 */
export function getCache(): Redis {
    if (!client) {
        throw new CacheError(
            'Cache is not connected. Ensure REDIS_URL is set and connectCache() was awaited.'
        );
    }
    return client;
}

/** Gracefully closes the Redis connection (used during shutdown). */
export async function disconnectCache(): Promise<void> {
    if (client) {
        await client.quit();
        client = undefined;
        log.info('Disconnected from Redis');
    }
}
