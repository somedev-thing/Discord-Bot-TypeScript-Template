import type { MessageTemplate } from './ir.js';
import type { RenderContext } from './templating.js';
import {
    BaseInteraction,
    type BaseMessageOptions,
    type InteractionResponse,
    type Message,
    type MessageComponentInteraction,
    MessageFlags,
    type RepliableInteraction,
} from 'discord.js';

import { EngineError } from './errors.js';
import { render, type RenderOptions, type TopLevelComponentBuilder } from './renderer.js';

/**
 * # Sender
 *
 * The high-level helpers feature code uses to put a {@link MessageTemplate} on
 * screen. Each renders the template (validating it and setting the
 * IsComponentsV2 flag) and then calls the right discord.js method for the target.
 *
 * Because Components V2 cannot be attached at `deferReply` time, the command
 * framework replies directly rather than deferring; these helpers reflect that.
 */

/** Attachments accepted alongside a template (e.g. for `file` blocks). */
export type TemplateFiles = BaseMessageOptions['files'];

/** Options shared by the send/edit helpers. */
export interface SendOptions extends RenderOptions {
    /** Reply only to the invoking user (interactions only). Ignored for edits/updates. */
    ephemeral?: boolean;
    /** Files to attach — required when a template uses `attachment://` `file` blocks. */
    files?: TemplateFiles;
}

/** A channel (or anything) able to receive `send`. */
export interface SendableChannel {
    send(options: BaseMessageOptions & { flags?: number }): Promise<Message>;
}

/**
 * A valid target for {@link sendTemplate}: a repliable interaction (including the
 * base `MessageComponentInteraction`, which the router hands us) or a channel.
 */
export type SendTarget = RepliableInteraction | MessageComponentInteraction | SendableChannel;

interface Payload {
    components: TopLevelComponentBuilder[];
    flags: number;
    files: TemplateFiles;
}

/** Renders the template and folds in ephemeral/file send options. */
function buildPayload(
    template: MessageTemplate,
    context: RenderContext,
    options: SendOptions
): Payload {
    const { components, flags } = render(template, context, options);
    return {
        components,
        flags: options.ephemeral ? flags | MessageFlags.Ephemeral : flags,
        files: options.files,
    };
}

/**
 * Sends a template to an interaction (as a reply or follow-up) or to a channel.
 *
 * - Fresh interaction → `reply`.
 * - Already-replied interaction → `followUp`.
 * - Deferred interaction → `editReply` (fills the deferred response).
 * - Channel → `send`.
 *
 * @example
 * ```ts
 * await sendTemplate(interaction, pingTemplate, { user: { name: interaction.user.username } });
 * ```
 */
export async function sendTemplate(
    target: SendTarget,
    template: MessageTemplate,
    context: RenderContext = {},
    options: SendOptions = {}
): Promise<Message | InteractionResponse> {
    const payload = buildPayload(template, context, options);

    if (target instanceof BaseInteraction) {
        if (!target.isRepliable()) {
            throw new EngineError('Cannot send a template: interaction is not repliable.');
        }
        if (target.deferred && !target.replied) {
            return await target.editReply({ components: payload.components, files: payload.files });
        }
        if (target.replied) {
            return await target.followUp({
                components: payload.components,
                flags: payload.flags,
                files: payload.files,
            });
        }
        return await target.reply({
            components: payload.components,
            flags: payload.flags,
            files: payload.files,
        });
    }

    return await target.send({
        components: payload.components,
        flags: payload.flags,
        files: payload.files,
    });
}

/**
 * Edits an existing message rendered from a template — either the bot's own
 * interaction reply (`editReply`) or a concrete {@link Message} (`edit`).
 *
 * @example
 * ```ts
 * await editTemplate(interaction, updatedTemplate);
 * ```
 */
export async function editTemplate(
    target: RepliableInteraction | Message,
    template: MessageTemplate,
    context: RenderContext = {},
    options: SendOptions = {}
): Promise<Message> {
    const payload = buildPayload(template, context, options);

    if (target instanceof BaseInteraction) {
        return await target.editReply({
            components: payload.components,
            flags: payload.flags,
            files: payload.files,
        });
    }

    return await target.edit({
        components: payload.components,
        flags: payload.flags,
        files: payload.files,
    });
}

/**
 * Updates the message a component interaction (button/select) originated from,
 * in place. Use this from a component handler to re-render the same message.
 *
 * @example
 * ```ts
 * await updateTemplate(buttonInteraction, refreshedTemplate, ctx);
 * ```
 */
export async function updateTemplate(
    interaction: MessageComponentInteraction,
    template: MessageTemplate,
    context: RenderContext = {},
    options: Omit<SendOptions, 'ephemeral'> = {}
): Promise<void> {
    const payload = buildPayload(template, context, options);
    await interaction.update({
        components: payload.components,
        flags: payload.flags,
        files: payload.files,
    });
}
