/**
 * # `custom_id` convention
 *
 * Discord routes component (button/select) and modal interactions back to the
 * bot by the `custom_id` string set when the component was built. We encode
 * routing information into that string with a simple, documented format:
 *
 * ```
 * <namespace>:<action>[:<arg>...]
 * ```
 *
 * - **namespace** — which {@link ComponentHandler} owns this component (usually a
 *   module/feature name, e.g. `'demo'`).
 * - **action** — what to do within that handler (e.g. `'refresh'`).
 * - **args** — optional positional arguments (e.g. an entity id).
 *
 * Parts are joined with `:` and therefore must not themselves contain `:`. The
 * whole string must stay within {@link V2Limits.CUSTOM_ID_MAX} (100) characters;
 * the engine validator enforces that at render time.
 *
 * @example
 * ```ts
 * customId('demo', 'refresh', '42'); // 'demo:refresh:42'
 * parseCustomId('demo:refresh:42');  // { namespace: 'demo', action: 'refresh', args: ['42'], raw: ... }
 * ```
 */

const SEPARATOR = ':';

/** A parsed `custom_id`. */
export interface ParsedCustomId {
    namespace: string;
    action: string;
    args: string[];
    /** The original, unparsed string. */
    raw: string;
}

/**
 * Builds a `custom_id` from a namespace, action, and optional args.
 *
 * @throws Error if any part contains the `:` separator.
 */
export function customId(namespace: string, action: string, ...args: string[]): string {
    const parts = [namespace, action, ...args];
    for (const part of parts) {
        if (part.includes(SEPARATOR)) {
            throw new Error(
                `custom_id parts must not contain '${SEPARATOR}' (got '${part}'). Encode it differently.`
            );
        }
    }
    return parts.join(SEPARATOR);
}

/** Parses a raw `custom_id` string into its {@link ParsedCustomId} parts. */
export function parseCustomId(raw: string): ParsedCustomId {
    const [namespace = '', action = '', ...args] = raw.split(SEPARATOR);
    return { namespace, action, args, raw };
}
