import { type Client, Events, type Interaction } from 'discord.js';

import { toError } from '../errors.js';
import { childLogger } from '../logger.js';

const log = childLogger({ mod: 'events' });

/**
 * The set of gateway events this bot reacts to. Because we only use slash and
 * context-menu commands, the surface is intentionally tiny: become ready, and
 * handle interactions. Add more bindings here as the bot grows.
 */
export interface EventBindings {
    /** Fired once when the gateway connection is ready. */
    onReady?: (client: Client<true>) => void | Promise<void>;
    /** Fired for every incoming interaction (commands, components, modals, autocomplete). */
    onInteraction?: (interaction: Interaction) => void | Promise<void>;
}

/**
 * Wires gateway events to the provided handlers. Each handler is wrapped so a
 * thrown error is logged rather than crashing the gateway listener — this is the
 * outermost safety net; richer per-interaction error reporting lives in the
 * command router.
 *
 * @param client - The discord.js client.
 * @param bindings - Handlers to attach.
 */
export function registerEvents(client: Client, bindings: EventBindings): void {
    client.once(Events.ClientReady, readyClient => {
        void guard('ready', () => bindings.onReady?.(readyClient));
    });

    client.on(Events.InteractionCreate, interaction => {
        void guard('interaction', () => bindings.onInteraction?.(interaction));
    });
}

/** Runs a handler, swallowing+logging any error so listeners never throw. */
async function guard(label: string, fn: () => void | Promise<void>): Promise<void> {
    try {
        await fn();
    } catch (error) {
        log.error({ err: toError(error), event: label }, 'Unhandled error in event handler');
    }
}
