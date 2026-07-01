import type { MessageTemplate } from './ir.js';

import { EngineError } from './errors.js';

/**
 * # Template registry
 *
 * A place to register reusable, named message templates. A template is a factory
 * that turns typed params into a {@link MessageTemplate}, so the same layout can
 * be reused with different data.
 */

/** A factory that builds a {@link MessageTemplate} from typed parameters. */
export type TemplateFactory<P> = (params: P) => MessageTemplate;

/** A registered template factory, tagged with the name it was registered under. */
export type RegisteredTemplate<P> = TemplateFactory<P> & { readonly templateName: string };

// Internal store. The value type is intentionally loose; public APIs stay typed.
const registry = new Map<string, RegisteredTemplate<never>>();

/**
 * Registers a reusable template under `name` and returns a callable factory.
 *
 * @param name - Unique template name (used for lookup/introspection).
 * @param factory - Builds the template from params.
 * @returns The factory, callable as `tpl(params)` and tagged with `templateName`.
 * @throws {@link EngineError} if a template with this name is already registered.
 *
 * @example
 * ```ts
 * const welcome = defineTemplate('welcome', (p: { name: string }) => ({
 *   theme: 'success',
 *   blocks: [{ type: 'text', content: `Welcome, ${p.name}!` }],
 * }));
 *
 * await sendTemplate(channel, welcome({ name: 'Ada' }));
 * ```
 */
export function defineTemplate<P = void>(
    name: string,
    factory: TemplateFactory<P>
): RegisteredTemplate<P> {
    if (registry.has(name)) {
        throw new EngineError(`Template '${name}' is already registered.`);
    }
    const tagged = ((params: P) => factory(params)) as RegisteredTemplate<P>;
    Object.defineProperty(tagged, 'templateName', { value: name, enumerable: true });
    registry.set(name, tagged);
    return tagged;
}

/** Returns a registered template factory by name, or `undefined`. */
export function getTemplate(name: string): RegisteredTemplate<never> | undefined {
    return registry.get(name);
}

/** Lists the names of all registered templates. */
export function listTemplates(): string[] {
    return [...registry.keys()];
}
