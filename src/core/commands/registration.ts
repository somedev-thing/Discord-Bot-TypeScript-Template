import {
    type APIApplicationCommand,
    REST,
    type RESTPostAPIApplicationCommandsJSONBody,
    Routes,
} from 'discord.js';

import { config } from '../config/index.js';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'commands' });

/** Where commands are registered: instantly to one dev guild, or globally. */
export type RegistrationScope = 'global' | 'guild';

function rest(): REST {
    return new REST({ version: '10' }).setToken(config.discord.token);
}

function requireGuild(): string {
    if (!config.discord.devGuildId) {
        throw new Error('DEV_GUILD_ID must be set for guild-scoped command operations.');
    }
    return config.discord.devGuildId;
}

/**
 * Overwrites the bot's registered commands with `bodies` (bulk PUT — idempotent).
 *
 * @param bodies - The command registration payloads (each command's `data`).
 * @param scope - `'guild'` updates instantly (great for dev, needs `DEV_GUILD_ID`);
 *   `'global'` can take up to an hour to propagate.
 */
export async function registerCommands(
    bodies: RESTPostAPIApplicationCommandsJSONBody[],
    scope: RegistrationScope
): Promise<void> {
    const route =
        scope === 'guild'
            ? Routes.applicationGuildCommands(config.discord.clientId, requireGuild())
            : Routes.applicationCommands(config.discord.clientId);
    await rest().put(route, { body: bodies });
    log.info({ count: bodies.length, scope }, 'Registered commands');
}

/** Removes all registered commands in the given scope. */
export async function clearCommands(scope: RegistrationScope): Promise<void> {
    const route =
        scope === 'guild'
            ? Routes.applicationGuildCommands(config.discord.clientId, requireGuild())
            : Routes.applicationCommands(config.discord.clientId);
    await rest().put(route, { body: [] });
    log.info({ scope }, 'Cleared commands');
}

/** Fetches the bot's currently-registered commands in the given scope. */
export async function viewCommands(scope: RegistrationScope): Promise<APIApplicationCommand[]> {
    const route =
        scope === 'guild'
            ? Routes.applicationGuildCommands(config.discord.clientId, requireGuild())
            : Routes.applicationCommands(config.discord.clientId);
    return (await rest().get(route)) as APIApplicationCommand[];
}
