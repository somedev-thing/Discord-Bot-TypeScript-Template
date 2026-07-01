import type { ThemeColor } from './ir.js';

import { UnknownThemeError } from './errors.js';

/**
 * # Theme system
 *
 * Themes give the bot a consistent visual identity. A {@link Theme} provides a
 * default accent color (used for container accent bars) plus a named `palette`
 * so templates can reference colors semantically (e.g. accent `'success'`)
 * instead of hard-coding hex values.
 *
 * A handful of themes are registered out of the box; register more with
 * {@link defineTheme}.
 */

/** A named visual theme. */
export interface Theme {
    /** Unique theme name, referenced by `MessageTemplate.theme`. */
    name: string;
    /** Default accent color (24-bit RGB int) for containers with no explicit accent. */
    accent: number;
    /** Named colors a template can reference by string (e.g. `accent: 'danger'`). */
    palette: Record<string, number>;
}

/** Shared semantic palette available to every built-in theme. */
const SEMANTIC: Record<string, number> = {
    primary: 0x5865f2, // Discord blurple
    success: 0x57f287,
    danger: 0xed4245,
    warning: 0xfee75c,
    info: 0x5865f2,
    muted: 0x99aab5,
};

const themes = new Map<string, Theme>();

/**
 * Registers (or overwrites) a theme.
 *
 * @returns The registered theme, for convenient chaining.
 *
 * @example
 * ```ts
 * defineTheme({ name: 'brand', accent: 0xff8800, palette: { ...SEMANTIC } });
 * ```
 */
export function defineTheme(theme: Theme): Theme {
    themes.set(theme.name, theme);
    return theme;
}

/** Returns a theme by name, or `undefined` if it is not registered. */
export function getTheme(name: string): Theme | undefined {
    return themes.get(name);
}

/**
 * Returns a theme by name.
 *
 * @throws {@link UnknownThemeError} if no theme with that name is registered.
 */
export function requireTheme(name: string): Theme {
    const theme = themes.get(name);
    if (!theme) {
        throw new UnknownThemeError(
            `Unknown theme '${name}'. Registered themes: ${[...themes.keys()].join(', ') || '(none)'}`
        );
    }
    return theme;
}

/** Lists the names of all registered themes. */
export function listThemes(): string[] {
    return [...themes.keys()];
}

/**
 * Resolves a {@link ThemeColor} (number, hex string, or palette name) into a
 * 24-bit RGB integer, using `theme` for named lookups and defaults.
 *
 * @param theme - The active theme.
 * @param color - The color token, or `undefined` to use the theme's default accent.
 */
export function resolveColor(theme: Theme, color: ThemeColor | undefined): number {
    if (color === undefined) {
        return theme.accent;
    }
    if (typeof color === 'number') {
        return color;
    }
    if (color.startsWith('#')) {
        return parseHex(color) ?? theme.accent;
    }
    return theme.palette[color] ?? SEMANTIC[color] ?? theme.accent;
}

/** Parses `#rgb` or `#rrggbb` into an integer, or `undefined` if malformed. */
function parseHex(hex: string): number | undefined {
    let body = hex.slice(1);
    if (body.length === 3) {
        body = body
            .split('')
            .map(c => c + c)
            .join('');
    }
    if (body.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(body)) {
        return undefined;
    }
    return Number.parseInt(body, 16);
}

// --- Built-in themes -------------------------------------------------------

defineTheme({ name: 'default', accent: SEMANTIC.primary, palette: { ...SEMANTIC } });
defineTheme({ name: 'success', accent: SEMANTIC.success, palette: { ...SEMANTIC } });
defineTheme({ name: 'danger', accent: SEMANTIC.danger, palette: { ...SEMANTIC } });
defineTheme({ name: 'warning', accent: SEMANTIC.warning, palette: { ...SEMANTIC } });
defineTheme({ name: 'info', accent: SEMANTIC.info, palette: { ...SEMANTIC } });
