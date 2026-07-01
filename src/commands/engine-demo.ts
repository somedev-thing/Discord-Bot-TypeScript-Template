import {
    type ChatInputCommandInteraction,
    type MessageComponentInteraction,
    type ModalSubmitInteraction,
    SlashCommandBuilder,
} from 'discord.js';

import {
    type ChatCommand,
    type ComponentHandler,
    customId,
    type ParsedCustomId,
} from '../core/commands/index.js';
import {
    type Block,
    type ContainerChild,
    type MessageTemplate,
    sendTemplate,
    updateTemplate,
} from '../core/engine/index.js';

/** Namespace for this demo's component routing (see the custom_id convention). */
const NS = 'demo';

/** State the demo message can be in, so the same builder renders before/after interaction. */
interface DemoState {
    note?: string;
    selected?: string;
}

/**
 * Builds the demo message. Exercises **every** block type so each can be visually
 * verified: text, separator, two sections (thumbnail + button accessories),
 * a media gallery, an action row of buttons, an action row with a select, and a
 * top-level file. After interaction we re-render a slimmer variant (no file, so
 * the in-place edit needs no re-uploaded attachment).
 */
function buildDemoTemplate(state: DemoState = {}): MessageTemplate {
    const selectActions: Block = {
        type: 'actions',
        components: [
            {
                type: 'select',
                customId: customId(NS, 'select'),
                placeholder: state.selected ? `You picked: ${state.selected}` : 'Pick an option…',
                options: [
                    { label: 'Option One', value: 'one', description: 'The first option' },
                    { label: 'Option Two', value: 'two', description: 'The second option' },
                    { label: 'Option Three', value: 'three', description: 'The third option' },
                ],
            },
        ],
    };

    const children: ContainerChild[] = [
        {
            type: 'text',
            content: '# Engine demo\nOne of every Components V2 block, built through the engine.',
        },
        { type: 'separator', divider: true, spacing: 'large' },
        {
            type: 'section',
            text: [
                '**Section with a thumbnail accessory**',
                'Text on the left, image on the right.',
            ],
            accessory: {
                kind: 'thumbnail',
                url: 'https://picsum.photos/seed/vye-thumb/200/200',
                description: 'A random thumbnail',
            },
        },
        {
            type: 'section',
            text: ['**Section with a button accessory**', 'A link button sits to the right.'],
            accessory: {
                kind: 'button',
                button: { style: 'link', label: 'discord.js', url: 'https://discord.js.org' },
            },
        },
        { type: 'separator' },
        { type: 'text', content: '**Media gallery**' },
        {
            type: 'media',
            items: [
                { url: 'https://picsum.photos/seed/vye-a/600/300', description: 'Image A' },
                { url: 'https://picsum.photos/seed/vye-b/600/300', description: 'Image B' },
            ],
        },
        { type: 'separator' },
        {
            type: 'actions',
            components: [
                {
                    type: 'button',
                    style: 'primary',
                    label: 'Edit this message',
                    customId: customId(NS, 'edit'),
                },
                {
                    type: 'button',
                    style: 'secondary',
                    label: 'A secondary button',
                    customId: customId(NS, 'noop'),
                },
                {
                    type: 'button',
                    style: 'link',
                    label: 'Docs',
                    url: 'https://discord.com/developers/docs/components/reference',
                },
            ],
        },
    ];

    // Keep the select at top level so interaction updates cannot push the
    // container over Discord's 10-child limit.
    const blocks: Block[] = [{ type: 'container', accent: 'info', children }, selectActions];

    if (state.note) {
        blocks.push({ type: 'text', content: `-# ${state.note}` });
    }

    // Only show the file block on the first render (editing in place would drop
    // the uploaded attachment unless we re-send it).
    if (!state.note && !state.selected) {
        blocks.push({ type: 'file', url: 'attachment://engine-demo.txt' });
    }

    return { theme: 'info', blocks };
}

/** The text file attached to the first render so the `file` block has something to show. */
const DEMO_FILE = {
    attachment: Buffer.from('This file is shown by the engine `file` block.\n', 'utf8'),
    name: 'engine-demo.txt',
};

/** `/engine-demo` — renders one of every block type. */
export const engineDemo: ChatCommand = {
    kind: 'chat',
    cooldown: { uses: 2, seconds: 10 },
    data: new SlashCommandBuilder()
        .setName('engine-demo')
        .setDescription('Render one of every Components V2 block type through the engine.')
        .toJSON(),

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        await sendTemplate(interaction, buildDemoTemplate(), {}, { files: [DEMO_FILE] });
    },
};

/**
 * Component handler for the demo. Proves interaction routing and in-place V2
 * message editing: the "Edit this message" button and the select menu both
 * re-render the message via {@link updateTemplate}.
 */
export const engineDemoHandler: ComponentHandler = {
    namespace: NS,
    async execute(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        id: ParsedCustomId
    ): Promise<void> {
        // This demo only uses buttons and a select — ignore modal submits.
        if (!interaction.isMessageComponent()) {
            return;
        }
        if (id.action === 'edit') {
            await updateTemplate(
                interaction,
                buildDemoTemplate({
                    note: `Edited by ${interaction.user.username} via the engine.`,
                })
            );
            return;
        }
        if (id.action === 'select' && interaction.isStringSelectMenu()) {
            const choice = interaction.values[0] ?? 'nothing';
            await updateTemplate(
                interaction,
                buildDemoTemplate({
                    selected: choice,
                    note: `${interaction.user.username} selected “${choice}”.`,
                })
            );
            return;
        }
        // Any other action (e.g. the secondary button): acknowledge with no change.
        await interaction.deferUpdate();
    },
};
