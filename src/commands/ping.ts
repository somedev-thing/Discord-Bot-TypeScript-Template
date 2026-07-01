import type { ChatCommand } from '../core/commands/index.js';
import { type ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

import { type MessageTemplate, sendTemplate } from '../core/engine/index.js';

/**
 * `/ping` — the simplest end-to-end proof that the engine works: it renders a
 * single themed container through the engine and replies with it.
 */
export const ping: ChatCommand = {
    kind: 'chat',
    cooldown: { uses: 1, seconds: 3 },
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check that the bot is alive and see gateway latency.')
        .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const latency = Math.round(interaction.client.ws.ping);
        const template: MessageTemplate = {
            theme: 'success',
            blocks: [
                {
                    type: 'container',
                    accent: 'success',
                    children: [
                        {
                            type: 'text',
                            content: `### 🏓 Pong!\nGateway latency: **${latency < 0 ? 'measuring…' : `${latency}ms`}**`,
                        },
                    ],
                },
            ],
        };
        await sendTemplate(interaction, template, {}, { ephemeral: true });
    },
};
