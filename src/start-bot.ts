/**
 * Boot sequence.
 *
 * 1. Install global error handlers.
 * 2. Connect required infrastructure (Postgres, Redis) — fail fast if unreachable.
 * 3. Build the discord.js client and the command/component registries.
 * 4. Wire the interaction router to gateway events.
 * 5. Log in, and arrange a graceful shutdown.
 */
import type { Client } from 'discord.js';

import { commands, componentHandlers } from './commands/index.js';
import { connectCache, disconnectCache } from './core/cache/index.js';
import { createClient } from './core/client.js';
import {
    buildCommandRegistry,
    buildComponentRegistry,
    CooldownStore,
    createInteractionRouter,
} from './core/commands/index.js';
import { config } from './core/config/index.js';
import { connectDatabase, disconnectDatabase } from './core/db/index.js';
import { installGlobalErrorHandlers, toError } from './core/errors.js';
import { registerEvents } from './core/events/index.js';
import { logger } from './core/logger.js';

async function main(): Promise<void> {
    installGlobalErrorHandlers();
    logger.info({ env: config.nodeEnv }, 'Starting vye-bot');

    // Required infrastructure — abort boot if either is unreachable.
    await connectDatabase();
    await connectCache();

    const client = createClient();

    const commandRegistry = buildCommandRegistry(commands);
    const componentRegistry = buildComponentRegistry(componentHandlers);
    const cooldowns = new CooldownStore(commands);
    const route = createInteractionRouter({
        commands: commandRegistry,
        components: componentRegistry,
        cooldowns,
    });

    registerEvents(client, {
        onReady: readyClient =>
            logger.info(
                { user: readyClient.user.tag, guilds: readyClient.guilds.cache.size },
                'Gateway ready'
            ),
        onInteraction: route,
    });

    registerShutdown(client);

    await client.login(config.discord.token);
}

/** Closes the gateway and infrastructure connections on SIGINT/SIGTERM. */
function registerShutdown(client: Client): void {
    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        logger.info({ signal }, 'Shutting down');
        try {
            await client.destroy();
            await disconnectCache();
            await disconnectDatabase();
        } catch (error) {
            logger.error({ err: toError(error) }, 'Error during shutdown');
        } finally {
            process.exit(0);
        }
    };
    process.once('SIGINT', () => void shutdown('SIGINT'));
    process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(error => {
    logger.fatal({ err: toError(error) }, 'Fatal error during boot');
    process.exit(1);
});
