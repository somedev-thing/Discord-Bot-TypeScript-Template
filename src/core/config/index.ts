/**
 * Typed application configuration.
 *
 * All runtime configuration and secrets are loaded from environment variables,
 * validated with zod, and exposed as the strongly-typed {@link config} object.
 * Never read `process.env` directly elsewhere — import `config` from here.
 */
export { config, type Config, type Env } from './env.js';
