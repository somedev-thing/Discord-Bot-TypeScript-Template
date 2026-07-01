/**
 * # Engine Intermediate Representation (IR)
 *
 * This module defines **our own** declarative description of a message. It mirrors
 * Discord's Components V2 concepts but is fully owned by us, so feature code never
 * touches discord.js builders. The `render` function in `renderer.ts` is the
 * single place that translates this IR into discord.js builders.
 *
 * A message is a {@link MessageTemplate}: an optional theme name plus an ordered
 * list of {@link Block}s.
 */

/**
 * A color for a container's accent bar. Either:
 * - a raw 24-bit RGB integer (e.g. `0x5865f2`), or
 * - a string token: a hex string (`'#5865f2'`) or a named color from the active
 *   theme's palette (e.g. `'success'`). Resolved by the theme system at render time.
 */
export type ThemeColor = number | string;

/** Visual style of a button. `link` renders a URL button; the rest are routed by `customId`. */
export type ButtonStyle = 'primary' | 'secondary' | 'success' | 'danger' | 'link';

/**
 * A button specification. A non-`link` button must carry a `customId` (used for
 * interaction routing); a `link` button must carry a `url`.
 */
export interface ButtonSpec {
    style: ButtonStyle;
    label?: string;
    /** Unicode emoji (e.g. `'🎉'`) or a resolvable custom-emoji string. */
    emoji?: string;
    disabled?: boolean;
    /** Required for non-link buttons. See the custom_id convention in `core/commands`. */
    customId?: string;
    /** Required for link buttons. */
    url?: string;
}

/** A single option in a string select menu. */
export interface SelectOption {
    label: string;
    value: string;
    description?: string;
    emoji?: string;
    default?: boolean;
}

/** A string select menu, placed inside an {@link ActionsBlock}. */
export interface SelectSpec {
    type: 'select';
    customId: string;
    placeholder?: string;
    minValues?: number;
    maxValues?: number;
    disabled?: boolean;
    options: SelectOption[];
}

/** A button placed inside an {@link ActionsBlock}. */
export interface ButtonComponent extends ButtonSpec {
    type: 'button';
}

/** Anything that can live in an action row: buttons or a single select. */
export type Interactive = ButtonComponent | SelectSpec;

/**
 * A section's trailing accessory. A section must have exactly one — either a
 * button or a thumbnail image.
 */
export type Accessory =
    | { kind: 'button'; button: ButtonSpec }
    | { kind: 'thumbnail'; url: string; description?: string; spoiler?: boolean };

/** A single image in a {@link MediaBlock} gallery. */
export interface MediaItem {
    url: string;
    description?: string;
    spoiler?: boolean;
}

/** Plain markdown text (a Text Display component). */
export interface TextBlock {
    type: 'text';
    content: string;
}

/**
 * A section: 1–3 lines of text with a trailing {@link Accessory} (button or
 * thumbnail) shown to the right.
 */
export interface SectionBlock {
    type: 'section';
    text: string[];
    accessory: Accessory;
}

/**
 * A container: a visually grouped set of child blocks with an optional accent
 * color bar and optional spoiler blur. Containers **cannot** be nested inside
 * other containers — enforced by {@link ContainerChild}.
 */
export interface ContainerBlock {
    type: 'container';
    accent?: ThemeColor;
    spoiler?: boolean;
    children: ContainerChild[];
}

/** A visual divider / spacer. */
export interface SeparatorBlock {
    type: 'separator';
    /** Whether to draw a visible divider line (default `true`). */
    divider?: boolean;
    /** Vertical spacing size (default `'small'`). */
    spacing?: 'small' | 'large';
}

/** An image gallery of 1–10 items. */
export interface MediaBlock {
    type: 'media';
    items: MediaItem[];
}

/**
 * An uploaded file display. The `url` must be an `attachment://<filename>`
 * reference; the actual file is supplied via the `files` send option.
 */
export interface FileBlock {
    type: 'file';
    url: string;
    spoiler?: boolean;
}

/** A row of interactive components: up to 5 buttons, or exactly 1 select. */
export interface ActionsBlock {
    type: 'actions';
    components: Interactive[];
}

/** The full set of blocks usable at the top level of a template. */
export type Block =
    | TextBlock
    | SectionBlock
    | ContainerBlock
    | SeparatorBlock
    | MediaBlock
    | FileBlock
    | ActionsBlock;

/**
 * Blocks allowed **inside** a container. This is every block except another
 * container — Discord does not allow containers nested in containers.
 */
export type ContainerChild = Exclude<Block, ContainerBlock>;

/**
 * The declarative description of one message.
 *
 * @example
 * ```ts
 * const tpl: MessageTemplate = {
 *   theme: 'success',
 *   blocks: [
 *     { type: 'text', content: '# Hello {user.name}' },
 *     { type: 'separator' },
 *     { type: 'actions', components: [
 *       { type: 'button', style: 'primary', label: 'Click', customId: 'demo:click' },
 *     ] },
 *   ],
 * };
 * ```
 */
export interface MessageTemplate {
    /** Name of a registered theme. Falls back to the configured default theme. */
    theme?: string;
    blocks: Block[];
}
