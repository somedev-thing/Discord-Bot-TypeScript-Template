/**
 * Safe `{placeholder}` substitution for template text.
 *
 * Placeholders look like `{name}` or `{dotted.path}`. They are resolved against a
 * {@link RenderContext} — a plain object — using:
 *
 * 1. a **direct key** match (`context['user.name']`), then
 * 2. a **dotted path** walk (`context.user.name`).
 *
 * This is a deliberately tiny string substitution: only `[A-Za-z0-9_.]` is
 * allowed inside braces, nothing is ever evaluated as code, and there is no
 * recursion into resolved values. It is safe to run on author-controlled text.
 *
 * @example
 * ```ts
 * resolveText('Hi {user.name}, you have {count} messages', {
 *   user: { name: 'Ada' },
 *   count: 3,
 * });
 * // => 'Hi Ada, you have 3 messages'
 * ```
 */

/** The context object placeholders resolve against. */
export type RenderContext = Record<string, unknown>;

/** Behavior when a placeholder cannot be resolved. */
export interface ResolveOptions {
    /**
     * What to do with an unresolved `{placeholder}`:
     * - `'keep'` (default): leave the literal `{placeholder}` so the gap is visible
     *   during development.
     * - `'empty'`: replace with an empty string.
     */
    missing?: 'keep' | 'empty';
}

const PLACEHOLDER = /\{([A-Za-z0-9_.]+)\}/g;

/**
 * Substitutes `{placeholder}` tokens in `text` using `context`.
 *
 * @param text - The source string (markdown is fine; only `{tokens}` are touched).
 * @param context - Values to substitute. Defaults to `{}`.
 * @param options - See {@link ResolveOptions}.
 */
export function resolveText(
    text: string,
    context: RenderContext = {},
    options: ResolveOptions = {}
): string {
    const missing = options.missing ?? 'keep';
    return text.replace(PLACEHOLDER, (match, path: string) => {
        const value = lookup(context, path);
        if (value === undefined || value === null) {
            return missing === 'empty' ? '' : match;
        }
        return stringify(value);
    });
}

/** Resolves a path against the context: direct key first, then dotted walk. */
function lookup(context: RenderContext, path: string): unknown {
    if (Object.prototype.hasOwnProperty.call(context, path)) {
        return context[path];
    }
    let current: unknown = context;
    for (const part of path.split('.')) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/** Converts a resolved value to a string without surprises. */
function stringify(value: unknown): string {
    switch (typeof value) {
        case 'string':
            return value;
        case 'number':
        case 'boolean':
        case 'bigint':
            return String(value);
        default:
            // Objects fall back to their own toString (e.g. a user mention wrapper).
            return String(value);
    }
}
