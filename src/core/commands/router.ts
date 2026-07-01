import type { ComponentHandler } from './command.js';
import type { CommandRegistry, CooldownStore } from './registry.js';
import type {
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    Interaction,
    MessageComponentInteraction,
    MessageContextMenuCommandInteraction,
    ModalSubmitInteraction,
    RepliableInteraction,
    UserContextMenuCommandInteraction,
} from 'discord.js';

import { type MessageTemplate, sendTemplate } from '../engine/index.js';
import { toError } from '../errors.js';
import { childLogger } from '../logger.js';
import { parseCustomId } from './custom-id.js';

const log = childLogger({ mod: 'router' });

/** Any interaction the friendly-notice helpers can reply to. */
type NoticeTarget = RepliableInteraction | MessageComponentInteraction;

/** Everything the router needs to dispatch interactions. */
export interface RouterDeps {
    commands: CommandRegistry;
    components: Map<string, ComponentHandler>;
    cooldowns: CooldownStore;
}

/**
 * Builds the single interaction handler attached to the gateway. It dispatches
 * each interaction to the right command / component handler, enforces cooldowns,
 * and reports failures to the user as a friendly Components V2 message.
 */
export function createInteractionRouter(
    deps: RouterDeps
): (interaction: Interaction) => Promise<void> {
    return async (interaction: Interaction): Promise<void> => {
        if (interaction.isChatInputCommand()) {
            await handleChat(interaction, deps);
        } else if (interaction.isUserContextMenuCommand()) {
            await handleUser(interaction, deps);
        } else if (interaction.isMessageContextMenuCommand()) {
            await handleMessage(interaction, deps);
        } else if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction, deps);
        } else if (interaction.isMessageComponent()) {
            await handleComponent(interaction, deps);
        } else if (interaction.isModalSubmit()) {
            await handleModal(interaction, deps);
        }
    };
}

async function handleChat(
    interaction: ChatInputCommandInteraction,
    deps: RouterDeps
): Promise<void> {
    const command = deps.commands.chat.get(interaction.commandName);
    if (!command) {
        log.warn({ command: interaction.commandName }, 'No handler for chat command');
        return;
    }
    if (deps.cooldowns.isLimited(command.data.name, interaction.user.id)) {
        await replyCooldown(interaction);
        return;
    }
    try {
        const subcommand = command.subcommands ? interaction.options.getSubcommand(false) : null;
        const handler = subcommand ? command.subcommands?.[subcommand] : undefined;
        if (handler) {
            await handler(interaction);
        } else {
            await command.execute(interaction);
        }
    } catch (error) {
        await reportError(interaction, error, interaction.commandName);
    }
}

async function handleUser(
    interaction: UserContextMenuCommandInteraction,
    deps: RouterDeps
): Promise<void> {
    const command = deps.commands.user.get(interaction.commandName);
    if (!command) {
        return;
    }
    if (deps.cooldowns.isLimited(command.data.name, interaction.user.id)) {
        await replyCooldown(interaction);
        return;
    }
    try {
        await command.execute(interaction);
    } catch (error) {
        await reportError(interaction, error, interaction.commandName);
    }
}

async function handleMessage(
    interaction: MessageContextMenuCommandInteraction,
    deps: RouterDeps
): Promise<void> {
    const command = deps.commands.message.get(interaction.commandName);
    if (!command) {
        return;
    }
    if (deps.cooldowns.isLimited(command.data.name, interaction.user.id)) {
        await replyCooldown(interaction);
        return;
    }
    try {
        await command.execute(interaction);
    } catch (error) {
        await reportError(interaction, error, interaction.commandName);
    }
}

async function handleAutocomplete(
    interaction: AutocompleteInteraction,
    deps: RouterDeps
): Promise<void> {
    const command = deps.commands.chat.get(interaction.commandName);
    if (!command?.autocomplete) {
        return;
    }
    try {
        const focused = interaction.options.getFocused(true);
        const choices = await command.autocomplete(interaction, focused);
        await interaction.respond(choices.slice(0, 25));
    } catch (error) {
        log.error({ err: toError(error), command: interaction.commandName }, 'Autocomplete failed');
    }
}

async function handleComponent(
    interaction: MessageComponentInteraction,
    deps: RouterDeps
): Promise<void> {
    try {
        const id = parseCustomId(interaction.customId);
        const handler = deps.components.get(id.namespace);
        if (!handler) {
            log.warn({ customId: interaction.customId }, 'No component handler for namespace');
            await replyUnhandledInteraction(interaction);
            return;
        }
        await handler.execute(interaction, id);
    } catch (error) {
        await reportError(interaction, error, 'component');
    }
}

async function handleModal(interaction: ModalSubmitInteraction, deps: RouterDeps): Promise<void> {
    try {
        const id = parseCustomId(interaction.customId);
        const handler = deps.components.get(id.namespace);
        if (!handler) {
            log.warn({ customId: interaction.customId }, 'No modal handler for namespace');
            await replyUnhandledInteraction(interaction);
            return;
        }
        await handler.execute(interaction, id);
    } catch (error) {
        await reportError(interaction, error, 'modal');
    }
}

// --- Friendly notices (rendered through the engine) ------------------------

/** A short, themed notice message. */
function noticeTemplate(theme: string, title: string, body: string): MessageTemplate {
    return {
        theme,
        blocks: [
            { type: 'container', children: [{ type: 'text', content: `### ${title}\n${body}` }] },
        ],
    };
}

/** Logs an execution error and tells the user something went wrong. */
async function reportError(
    interaction: NoticeTarget,
    error: unknown,
    source: string
): Promise<void> {
    log.error({ err: toError(error), source, interactionId: interaction.id }, 'Interaction failed');
    try {
        await sendTemplate(
            interaction,
            noticeTemplate(
                'danger',
                'Something went wrong',
                `An unexpected error occurred. If this keeps happening, please report it.\n-# Reference: \`${interaction.id}\``
            ),
            {},
            { ephemeral: true }
        );
    } catch {
        // The interaction may have expired or already been answered — nothing to do.
    }
}

/** Tells a rate-limited user to slow down. */
async function replyCooldown(interaction: NoticeTarget): Promise<void> {
    try {
        await sendTemplate(
            interaction,
            noticeTemplate(
                'warning',
                'Slow down',
                'You are using this command too quickly. Try again shortly.'
            ),
            {},
            { ephemeral: true }
        );
    } catch {
        // Ignore.
    }
}

/** Tells a user that an orphaned component/modal no longer has a handler. */
async function replyUnhandledInteraction(interaction: NoticeTarget): Promise<void> {
    try {
        await sendTemplate(
            interaction,
            noticeTemplate(
                'warning',
                'Interaction unavailable',
                'This control is no longer available. Run the command again to refresh it.'
            ),
            {},
            { ephemeral: true }
        );
    } catch {
        // Ignore.
    }
}
