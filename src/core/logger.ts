import pino, { type Logger } from 'pino';

import { config } from './config/index.js';

/**
 * The application's root structured logger (pino).
 *
 * Level and formatting are driven by {@link config} (`LOG_LEVEL`, `LOG_PRETTY`).
 * In development it pretty-prints; in production it emits newline-delimited JSON
 * suitable for log aggregation.
 *
 * @example
 * ```ts
 * import { logger } from './core/logger.js';
 * logger.info('Bot started');
 * logger.error({ err }, 'Failed to do the thing');
 * ```
 */
export const logger: Logger = pino({
    level: config.log.level,
    base: undefined, // drop pid/hostname noise; we add our own bindings explicitly
    ...(config.log.pretty
        ? {
              transport: {
                  target: 'pino-pretty',
                  options: {
                      colorize: true,
                      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
                      ignore: 'pid,hostname',
                  },
              },
          }
        : {}),
});

/**
 * Creates a child logger that tags every line with the given bindings. Use this
 * to scope logs to a subsystem.
 *
 * @param bindings - Static fields merged into every log line (e.g. `{ mod: 'db' }`).
 *
 * @example
 * ```ts
 * const log = childLogger({ mod: 'engine' });
 * log.debug('rendered template');
 * ```
 */
export function childLogger(bindings: Record<string, unknown>): Logger {
    return logger.child(bindings);
}
