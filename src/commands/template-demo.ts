import type { ChatCommand } from '../core/commands/index.js';
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { defineTemplate, type RenderContext, sendTemplate } from '../core/engine/index.js';

/** Parameters for the reusable welcome template. */
interface WelcomeParams {
    /** Theme name to render with. */
    theme: string;
}

/**
 * A reusable template registered with the engine. The `{placeholder}` tokens are
 * resolved at send time against the {@link RenderContext} the command builds.
 */
export const welcomeTemplate = defineTemplate('demo.welcome', (params: WelcomeParams) => ({
    theme: params.theme,
    blocks: [
        {
            type: 'container',
            accent: params.theme,
            children: [
                { type: 'text', content: '## Welcome, {user.name}! 👋' },
                { type: 'separator' },
                {
                    type: 'text',
                    content:
                        'You ran this in **{guild.name}** as {user.mention}.\n' +
                        'This entire message came from a *registered template* with `{placeholder}` substitution.',
                },
            ],
        },
    ],
}));

/** `/template-demo` — renders the registered template with substituted placeholders. */
export const templateDemo: ChatCommand = {
    kind: 'chat',
    cooldown: { uses: 2, seconds: 10 },
    data: new SlashCommandBuilder()
        .setName('template-demo')
        .setDescription(
            'Render a registered template with {placeholder} substitution from your context.'
        )
        .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const context: RenderContext = {
            user: {
                id: interaction.user.id,
                name: interaction.user.username,
                mention: `<@${interaction.user.id}>`,
            },
            guild: interaction.guild
                ? { id: interaction.guild.id, name: interaction.guild.name }
                : { name: 'a Direct Message' },
        };
        await sendTemplate(interaction, welcomeTemplate({ theme: 'success' }), context, {
            ephemeral: true,
        });
    },
};
