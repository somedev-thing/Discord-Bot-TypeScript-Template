/**
 * # Command framework
 *
 * Define commands and component handlers with the types here, collect them into
 * registries, and dispatch interactions with {@link createInteractionRouter}.
 * Register them with Discord via {@link registerCommands}.
 *
 * See `docs/COMMANDS.md` for the full guide and the `custom_id` convention.
 */

export type {
    ChatCommand,
    Command,
    ComponentHandler,
    CooldownConfig,
    MessageCommand,
    UserCommand,
} from './command.js';

export { customId, parseCustomId, type ParsedCustomId } from './custom-id.js';

export {
    buildCommandRegistry,
    buildComponentRegistry,
    CooldownStore,
    type CommandRegistry,
} from './registry.js';

export { createInteractionRouter, type RouterDeps } from './router.js';

export {
    clearCommands,
    registerCommands,
    viewCommands,
    type RegistrationScope,
} from './registration.js';
