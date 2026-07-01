import type {
    ChatCommand,
    Command,
    ComponentHandler,
    MessageCommand,
    UserCommand,
} from './command.js';
import { RateLimiter } from 'discord.js-rate-limiter';

/**
 * Command lookup tables, split by kind because Discord allows the same name for
 * a chat command, a user command, and a message command simultaneously.
 */
export interface CommandRegistry {
    chat: Map<string, ChatCommand>;
    message: Map<string, MessageCommand>;
    user: Map<string, UserCommand>;
}

/** Builds a {@link CommandRegistry} from a flat list of commands. */
export function buildCommandRegistry(commands: Command[]): CommandRegistry {
    const registry: CommandRegistry = {
        chat: new Map(),
        message: new Map(),
        user: new Map(),
    };
    for (const command of commands) {
        switch (command.kind) {
            case 'chat':
                registry.chat.set(command.data.name, command);
                break;
            case 'message':
                registry.message.set(command.data.name, command);
                break;
            case 'user':
                registry.user.set(command.data.name, command);
                break;
        }
    }
    return registry;
}

/** Builds a `custom_id` namespace → {@link ComponentHandler} lookup. */
export function buildComponentRegistry(
    handlers: ComponentHandler[]
): Map<string, ComponentHandler> {
    const registry = new Map<string, ComponentHandler>();
    for (const handler of handlers) {
        registry.set(handler.namespace, handler);
    }
    return registry;
}

/**
 * Holds per-command rate limiters and answers "is this user rate limited?".
 * Commands without a `cooldown` are never limited.
 */
export class CooldownStore {
    private readonly limiters = new Map<string, RateLimiter>();

    public constructor(commands: Command[]) {
        for (const command of commands) {
            if (command.cooldown) {
                this.limiters.set(
                    command.data.name,
                    new RateLimiter(command.cooldown.uses, command.cooldown.seconds * 1000)
                );
            }
        }
    }

    /** Returns `true` if `userId` has exhausted the cooldown for `commandName`. */
    public isLimited(commandName: string, userId: string): boolean {
        return this.limiters.get(commandName)?.take(userId) ?? false;
    }
}
