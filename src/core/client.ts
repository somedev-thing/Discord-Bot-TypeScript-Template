import { Client, GatewayIntentBits, Options } from 'discord.js';

/**
 * Creates the gateway {@link Client} with the **minimum** privileges this bot
 * needs.
 *
 * We use slash and context-menu commands only, so the single `Guilds` intent is
 * sufficient — interactions are delivered regardless of intents. We deliberately
 * do **not** request the message-content, message, or reaction intents.
 *
 * The client is sharding-ready: nothing here assumes a single process, so the
 * same client runs unchanged under a `ShardingManager` if/when we scale past
 * ~2,500 guilds. For now we run single-process.
 */
export function createClient(): Client {
    return new Client({
        intents: [GatewayIntentBits.Guilds],
        // Trim caches we never use to keep memory low on large bots.
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            MessageManager: 0,
            PresenceManager: 0,
            GuildMemberManager: 0,
        }),
        // Auto-attach a nonce to sends so gateway retries can't duplicate messages.
        enforceNonce: true,
    });
}
