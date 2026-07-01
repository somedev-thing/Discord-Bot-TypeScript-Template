// =============================================================================
// THE RENDERER
//
// This is the ONLY file in the codebase permitted to import discord.js component
// builders. Feature code describes messages as a `MessageTemplate` (our IR) and
// this module translates that IR into discord.js Components V2 builders, assigns
// the numeric component ids, applies `{placeholder}` substitution, validates
// against Discord's limits, and always sets the IsComponentsV2 message flag.
//
// If you find yourself importing a *Builder from 'discord.js' anywhere else,
// stop — add what you need to the IR and render it here instead.
// =============================================================================

import type {
    Accessory,
    ActionsBlock,
    Block,
    ButtonSpec,
    ContainerBlock,
    ContainerChild,
    ButtonStyle as IrButtonStyle,
    MediaItem,
    MessageTemplate,
    SectionBlock,
    SelectSpec,
    SeparatorBlock,
    TextBlock,
} from './ir.js';
import {
    ActionRowBuilder,
    ButtonBuilder,
    ContainerBuilder,
    ButtonStyle as DjsButtonStyle,
    FileBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    type MessageActionRowComponentBuilder,
    MessageFlags,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextDisplayBuilder,
    ThumbnailBuilder,
} from 'discord.js';

import { type RenderContext, resolveText } from './templating.js';
import { requireTheme, resolveColor, type Theme } from './themes.js';
import { validate } from './validator.js';

/** Top-level component builders the renderer can return for a message. */
export type TopLevelComponentBuilder =
    | ContainerBuilder
    | TextDisplayBuilder
    | SectionBuilder
    | SeparatorBuilder
    | MediaGalleryBuilder
    | FileBuilder
    | ActionRowBuilder<MessageActionRowComponentBuilder>;

/** The output of {@link render}: builders plus the message flags to send with them. */
export interface RenderResult {
    /** Pass directly as the `components` of a reply / send / edit. */
    components: TopLevelComponentBuilder[];
    /** Message flags, always including `IsComponentsV2`. */
    flags: number;
}

/** Options that tune how a template is rendered. */
export interface RenderOptions {
    /** Theme name used when the template does not name one. Defaults to `'default'`. */
    defaultTheme?: string;
    /** How to handle unresolved `{placeholder}` tokens. See {@link resolveText}. */
    missing?: 'keep' | 'empty';
}

/**
 * Renders a {@link MessageTemplate} into discord.js Components V2 builders.
 *
 * The pipeline is: resolve `{placeholders}` → validate against Discord limits →
 * build builders with sequential numeric ids → attach the IsComponentsV2 flag.
 *
 * @param template - The declarative message.
 * @param context - Values for `{placeholder}` substitution.
 * @param options - See {@link RenderOptions}.
 * @returns The builders and flags, ready to send.
 * @throws {@link TemplateValidationError} if the template violates a V2 limit.
 * @throws {@link UnknownThemeError} if the template names an unregistered theme.
 *
 * @example
 * ```ts
 * const { components, flags } = render(
 *   { blocks: [{ type: 'text', content: 'Hi {user.name}' }] },
 *   { user: { name: 'Ada' } },
 * );
 * await interaction.reply({ components, flags });
 * ```
 */
export function render(
    template: MessageTemplate,
    context: RenderContext = {},
    options: RenderOptions = {}
): RenderResult {
    const theme = requireTheme(template.theme ?? options.defaultTheme ?? 'default');

    // 1. Resolve placeholders into a concrete template so validation sees real text.
    const resolved = resolveTemplate(template, context, options.missing ?? 'keep');

    // 2. Validate against Discord's Components V2 limits.
    validate(resolved);

    // 3. Build discord.js builders, assigning sequential component ids.
    const allocId = createIdAllocator();
    const components = resolved.blocks.map(block => buildBlock(block, theme, allocId));

    return { components, flags: MessageFlags.IsComponentsV2 };
}

// --- Id allocation ---------------------------------------------------------

/** Returns a function that hands out the next sequential component id (starts at 1). */
function createIdAllocator(): () => number {
    let next = 1;
    return () => next++;
}

// --- Placeholder resolution (deep copy with substituted text) --------------

function resolveTemplate(
    template: MessageTemplate,
    context: RenderContext,
    missing: 'keep' | 'empty'
): MessageTemplate {
    const sub = (text: string): string => resolveText(text, context, { missing });
    return {
        theme: template.theme,
        blocks: template.blocks.map(block => resolveBlock(block, sub)),
    };
}

function resolveBlock(block: Block, sub: (text: string) => string): Block {
    switch (block.type) {
        case 'text':
            return { type: 'text', content: sub(block.content) };
        case 'section':
            return {
                type: 'section',
                text: block.text.map(sub),
                accessory: resolveAccessory(block.accessory, sub),
            };
        case 'container':
            return {
                type: 'container',
                accent: block.accent,
                spoiler: block.spoiler,
                children: block.children.map(child => resolveBlock(child, sub) as ContainerChild),
            };
        case 'separator':
            return block;
        case 'media':
            return {
                type: 'media',
                items: block.items.map(item => ({
                    ...item,
                    description: item.description ? sub(item.description) : item.description,
                })),
            };
        case 'file':
            return block;
        case 'actions':
            return {
                type: 'actions',
                components: block.components.map(component =>
                    component.type === 'button'
                        ? {
                              ...component,
                              label: component.label ? sub(component.label) : component.label,
                          }
                        : resolveSelect(component, sub)
                ),
            };
    }
}

function resolveAccessory(accessory: Accessory, sub: (text: string) => string): Accessory {
    if (accessory.kind === 'button') {
        return {
            kind: 'button',
            button: {
                ...accessory.button,
                label: accessory.button.label
                    ? sub(accessory.button.label)
                    : accessory.button.label,
            },
        };
    }
    return {
        ...accessory,
        description: accessory.description ? sub(accessory.description) : accessory.description,
    };
}

function resolveSelect(select: SelectSpec, sub: (text: string) => string): SelectSpec {
    return {
        ...select,
        placeholder: select.placeholder ? sub(select.placeholder) : select.placeholder,
        options: select.options.map(option => ({
            ...option,
            label: sub(option.label),
            description: option.description ? sub(option.description) : option.description,
        })),
    };
}

// --- Builder construction --------------------------------------------------

function buildBlock(block: Block, theme: Theme, allocId: () => number): TopLevelComponentBuilder {
    switch (block.type) {
        case 'text':
            return buildText(block, allocId);
        case 'section':
            return buildSection(block, allocId);
        case 'container':
            return buildContainer(block, theme, allocId);
        case 'separator':
            return buildSeparator(block, allocId);
        case 'media':
            return buildMedia(block.items, allocId);
        case 'file':
            return new FileBuilder()
                .setId(allocId())
                .setURL(block.url)
                .setSpoiler(block.spoiler ?? false);
        case 'actions':
            return buildActionRow(block, allocId);
    }
}

function buildText(block: TextBlock, allocId: () => number): TextDisplayBuilder {
    return new TextDisplayBuilder().setId(allocId()).setContent(block.content);
}

function buildSection(block: SectionBlock, allocId: () => number): SectionBuilder {
    const section = new SectionBuilder().setId(allocId());
    section.addTextDisplayComponents(
        block.text.map(line => new TextDisplayBuilder().setId(allocId()).setContent(line))
    );
    if (block.accessory.kind === 'button') {
        section.setButtonAccessory(buildButton(block.accessory.button, allocId()));
    } else {
        const thumb = new ThumbnailBuilder().setId(allocId()).setURL(block.accessory.url);
        if (block.accessory.description) {
            thumb.setDescription(block.accessory.description);
        }
        if (block.accessory.spoiler) {
            thumb.setSpoiler(true);
        }
        section.setThumbnailAccessory(thumb);
    }
    return section;
}

function buildContainer(
    block: ContainerBlock,
    theme: Theme,
    allocId: () => number
): ContainerBuilder {
    const container = new ContainerBuilder().setId(allocId());
    container.setAccentColor(resolveColor(theme, block.accent));
    if (block.spoiler) {
        container.setSpoiler(true);
    }
    for (const child of block.children) {
        addContainerChild(container, child, allocId);
    }
    return container;
}

function addContainerChild(
    container: ContainerBuilder,
    child: ContainerChild,
    allocId: () => number
): void {
    switch (child.type) {
        case 'text':
            container.addTextDisplayComponents(buildText(child, allocId));
            break;
        case 'section':
            container.addSectionComponents(buildSection(child, allocId));
            break;
        case 'separator':
            container.addSeparatorComponents(buildSeparator(child, allocId));
            break;
        case 'media':
            container.addMediaGalleryComponents(buildMedia(child.items, allocId));
            break;
        case 'file':
            container.addFileComponents(
                new FileBuilder()
                    .setId(allocId())
                    .setURL(child.url)
                    .setSpoiler(child.spoiler ?? false)
            );
            break;
        case 'actions':
            container.addActionRowComponents(buildActionRow(child, allocId));
            break;
    }
}

function buildSeparator(block: SeparatorBlock, allocId: () => number): SeparatorBuilder {
    return new SeparatorBuilder()
        .setId(allocId())
        .setDivider(block.divider ?? true)
        .setSpacing(
            block.spacing === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small
        );
}

function buildMedia(items: MediaItem[], allocId: () => number): MediaGalleryBuilder {
    const gallery = new MediaGalleryBuilder().setId(allocId());
    gallery.addItems(
        items.map(item => {
            const galleryItem = new MediaGalleryItemBuilder().setURL(item.url);
            if (item.description) {
                galleryItem.setDescription(item.description);
            }
            if (item.spoiler) {
                galleryItem.setSpoiler(true);
            }
            return galleryItem;
        })
    );
    return gallery;
}

function buildActionRow(
    block: ActionsBlock,
    allocId: () => number
): ActionRowBuilder<MessageActionRowComponentBuilder> {
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().setId(allocId());
    for (const component of block.components) {
        if (component.type === 'button') {
            row.addComponents(buildButton(component, allocId()));
        } else {
            row.addComponents(buildSelect(component, allocId()));
        }
    }
    return row;
}

function buildButton(spec: ButtonSpec, id: number): ButtonBuilder {
    const button = new ButtonBuilder().setId(id).setStyle(mapButtonStyle(spec.style));
    if (spec.label) {
        button.setLabel(spec.label);
    }
    if (spec.emoji) {
        button.setEmoji(spec.emoji);
    }
    if (spec.disabled) {
        button.setDisabled(true);
    }
    if (spec.style === 'link') {
        if (spec.url) {
            button.setURL(spec.url);
        }
    } else if (spec.customId) {
        button.setCustomId(spec.customId);
    }
    return button;
}

function buildSelect(spec: SelectSpec, id: number): StringSelectMenuBuilder {
    const select = new StringSelectMenuBuilder().setId(id).setCustomId(spec.customId);
    if (spec.placeholder) {
        select.setPlaceholder(spec.placeholder);
    }
    if (spec.minValues !== undefined) {
        select.setMinValues(spec.minValues);
    }
    if (spec.maxValues !== undefined) {
        select.setMaxValues(spec.maxValues);
    }
    if (spec.disabled) {
        select.setDisabled(true);
    }
    select.addOptions(
        spec.options.map(option => {
            const builder = new StringSelectMenuOptionBuilder()
                .setLabel(option.label)
                .setValue(option.value);
            if (option.description) {
                builder.setDescription(option.description);
            }
            if (option.emoji) {
                builder.setEmoji(option.emoji);
            }
            if (option.default) {
                builder.setDefault(true);
            }
            return builder;
        })
    );
    return select;
}

/** Maps our string button style to the discord.js {@link DjsButtonStyle} enum. */
function mapButtonStyle(style: IrButtonStyle): DjsButtonStyle {
    switch (style) {
        case 'primary':
            return DjsButtonStyle.Primary;
        case 'secondary':
            return DjsButtonStyle.Secondary;
        case 'success':
            return DjsButtonStyle.Success;
        case 'danger':
            return DjsButtonStyle.Danger;
        case 'link':
            return DjsButtonStyle.Link;
    }
}
