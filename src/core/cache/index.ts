/**
 * Redis cache access.
 *
 * The cache is **required** infrastructure but lazily initialized: call
 * {@link connectCache} during boot (it fails fast if Redis is unreachable), then
 * use {@link getCache} wherever you need it.
 */
export { connectCache, disconnectCache, getCache } from './redis.js';
