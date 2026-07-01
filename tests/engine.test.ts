import { describe, expect, it } from 'vitest';

import {
    defineTemplate,
    EngineError,
    IS_COMPONENTS_V2_FLAG,
    type MessageTemplate,
    render,
    requireTheme,
    resolveColor,
    resolveText,
    TemplateValidationError,
    validate,
} from '../src/core/engine/index.js';

describe('renderer', () => {
    it('sets the IsComponentsV2 flag and returns top-level components', () => {
        const tpl: MessageTemplate = { blocks: [{ type: 'text', content: 'hello' }] };
        const { components, flags } = render(tpl);
        expect(flags & IS_COMPONENTS_V2_FLAG).toBe(IS_COMPONENTS_V2_FLAG);
        expect(components).toHaveLength(1);
    });

    it('assigns sequential numeric ids across nested components', () => {
        const tpl: MessageTemplate = {
            blocks: [
                { type: 'container', children: [{ type: 'text', content: 'a' }] },
                { type: 'text', content: 'b' },
            ],
        };
        const json = render(tpl).components.map(c => c.toJSON()) as Array<{ id?: number }>;
        expect(json[0]?.id).toBe(1); // container
        expect(json[1]?.id).toBe(3); // container(1) + inner text(2) -> next top-level is 3
    });

    it('substitutes {placeholders} before building', () => {
        const tpl: MessageTemplate = { blocks: [{ type: 'text', content: 'Hi {user.name}' }] };
        const json = render(tpl, { user: { name: 'Ada' } }).components[0]?.toJSON() as {
            content: string;
        };
        expect(json.content).toBe('Hi Ada');
    });
});

describe('templating', () => {
    it('resolves direct keys and dotted paths', () => {
        expect(resolveText('{a} {b.c}', { a: '1', b: { c: '2' } })).toBe('1 2');
    });
    it('keeps unresolved tokens by default and can blank them', () => {
        expect(resolveText('{missing}', {})).toBe('{missing}');
        expect(resolveText('{missing}', {}, { missing: 'empty' })).toBe('');
    });
});

describe('themes', () => {
    it('resolves numbers, hex strings, and palette names', () => {
        const theme = requireTheme('success');
        expect(resolveColor(theme, 0x123456)).toBe(0x123456);
        expect(resolveColor(theme, '#5865f2')).toBe(0x5865f2);
        expect(resolveColor(theme, '#abc')).toBe(0xaabbcc);
        expect(resolveColor(theme, 'danger')).toBe(0xed4245);
        expect(resolveColor(theme, undefined)).toBe(theme.accent);
    });
});

describe('validator', () => {
    it('rejects too many buttons in a row', () => {
        const tpl: MessageTemplate = {
            blocks: [
                {
                    type: 'actions',
                    components: Array.from({ length: 6 }, (_, i) => ({
                        type: 'button' as const,
                        style: 'primary' as const,
                        label: `b${i}`,
                        customId: `x:${i}`,
                    })),
                },
            ],
        };
        expect(() => validate(tpl)).toThrow(TemplateValidationError);
    });

    it('rejects nested containers', () => {
        const tpl = {
            blocks: [{ type: 'container', children: [{ type: 'container', children: [] }] }],
        } as unknown as MessageTemplate;
        expect(() => validate(tpl)).toThrow(/nested/i);
    });

    it('requires file urls to be attachment references', () => {
        const tpl: MessageTemplate = { blocks: [{ type: 'file', url: 'https://x/y.txt' }] };
        expect(() => validate(tpl)).toThrow(/attachment:/);
    });

    it('rejects a select sharing a row with buttons', () => {
        const tpl: MessageTemplate = {
            blocks: [
                {
                    type: 'actions',
                    components: [
                        { type: 'select', customId: 'x:s', options: [{ label: 'a', value: 'a' }] },
                        { type: 'button', style: 'primary', label: 'b', customId: 'x:b' },
                    ],
                },
            ],
        };
        expect(() => validate(tpl)).toThrow(/only component/i);
    });
});

describe('registry', () => {
    it('returns a callable factory and rejects duplicates', () => {
        const t = defineTemplate('test.unique', (p: { n: string }) => ({
            blocks: [{ type: 'text', content: p.n }],
        }));
        expect(t.templateName).toBe('test.unique');
        expect(t({ n: 'x' }).blocks).toHaveLength(1);
        expect(() => defineTemplate('test.unique', () => ({ blocks: [] }))).toThrow(EngineError);
    });
});
