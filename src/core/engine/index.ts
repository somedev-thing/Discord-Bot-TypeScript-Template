/**
 * # Message Engine — public API
 *
 * The declarative Components V2 message layer. Feature code builds a
 * {@link MessageTemplate} from {@link Block}s and sends it with
 * {@link sendTemplate} / {@link editTemplate} / {@link updateTemplate}. The
 * renderer is the only place discord.js builders are touched.
 *
 * See `docs/MESSAGE-ENGINE.md` for the full guide.
 *
 * @example
 * ```ts
 * import { sendTemplate, type MessageTemplate } from './core/engine/index.js';
 *
 * const tpl: MessageTemplate = {
 *   theme: 'success',
 *   blocks: [
 *     { type: 'container', children: [{ type: 'text', content: 'Hi {user.name}!' }] },
 *   ],
 * };
 * await sendTemplate(interaction, tpl, { user: { name: 'Ada' } });
 * ```
 */

// Intermediate representation (the types you build messages from).
export type {
    Accessory,
    ActionsBlock,
    Block,
    ButtonComponent,
    ButtonSpec,
    ButtonStyle,
    ContainerBlock,
    ContainerChild,
    FileBlock,
    Interactive,
    MediaBlock,
    MediaItem,
    MessageTemplate,
    SectionBlock,
    SelectOption,
    SelectSpec,
    SeparatorBlock,
    TextBlock,
    ThemeColor,
} from './ir.js';

// Rendering.
export {
    render,
    type RenderOptions,
    type RenderResult,
    type TopLevelComponentBuilder,
} from './renderer.js';

// Sending / editing / updating.
export {
    editTemplate,
    sendTemplate,
    updateTemplate,
    type SendableChannel,
    type SendOptions,
    type SendTarget,
    type TemplateFiles,
} from './sender.js';

// Templating.
export { resolveText, type RenderContext, type ResolveOptions } from './templating.js';

// Template registry.
export {
    defineTemplate,
    getTemplate,
    listTemplates,
    type RegisteredTemplate,
    type TemplateFactory,
} from './registry.js';

// Themes.
export {
    defineTheme,
    getTheme,
    listThemes,
    requireTheme,
    resolveColor,
    type Theme,
} from './themes.js';

// Limits & validation.
export { validate } from './validator.js';
export { IS_COMPONENTS_V2_FLAG, V2Limits } from './limits.js';

// Errors.
export { EngineError, TemplateValidationError, UnknownThemeError } from './errors.js';
