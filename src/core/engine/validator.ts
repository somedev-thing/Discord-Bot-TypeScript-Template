import type {
    Accessory,
    Block,
    ButtonComponent,
    ButtonSpec,
    Interactive,
    MessageTemplate,
    SectionBlock,
    SelectSpec,
} from './ir.js';

import { TemplateValidationError } from './errors.js';
import { V2Limits } from './limits.js';

/**
 * Validates a template against Discord's Components V2 limits and structural
 * rules, collecting **every** problem before throwing so an author can fix them
 * in one pass.
 *
 * Run this on a template whose text placeholders have already been resolved, so
 * character counts reflect what will actually be sent. {@link render} does this
 * for you.
 *
 * @throws {@link TemplateValidationError} if the template is invalid.
 */
export function validate(template: MessageTemplate): void {
    const issues: string[] = [];
    const blocks = template.blocks;

    if (blocks.length === 0) {
        issues.push('Template has no blocks.');
    }
    if (blocks.length > V2Limits.TOP_LEVEL_COMPONENTS) {
        issues.push(
            `Too many top-level blocks: ${blocks.length} (max ${V2Limits.TOP_LEVEL_COMPONENTS}).`
        );
    }

    const counters = { components: 0, textChars: 0 };
    for (const block of blocks) {
        visit(block, 0, issues, counters);
    }

    if (counters.components > V2Limits.TOTAL_COMPONENTS) {
        issues.push(
            `Too many components: ${counters.components} (max ${V2Limits.TOTAL_COMPONENTS}, counting nested).`
        );
    }
    if (counters.textChars > V2Limits.TOTAL_TEXT_CHARS) {
        issues.push(
            `Too much text: ${counters.textChars} characters (max ${V2Limits.TOTAL_TEXT_CHARS} across all text).`
        );
    }

    if (issues.length > 0) {
        throw new TemplateValidationError(issues);
    }
}

interface Counters {
    components: number;
    textChars: number;
}

/** Recursively validates a block and accumulates component/character counts. */
function visit(block: Block, depth: number, issues: string[], counters: Counters): void {
    counters.components += 1; // every block is at least one component

    switch (block.type) {
        case 'text': {
            counters.textChars += block.content.length;
            if (block.content.trim().length === 0) {
                issues.push('Text block content must not be empty.');
            }
            break;
        }
        case 'section': {
            validateSection(block, issues);
            counters.components += block.text.length; // each line → a text display
            counters.components += 1; // the accessory
            for (const line of block.text) {
                counters.textChars += line.length;
            }
            validateAccessory(block.accessory, issues);
            break;
        }
        case 'container': {
            if (block.children.length === 0) {
                issues.push('Container must have at least one child.');
            }
            if (block.children.length > V2Limits.CONTAINER_CHILDREN) {
                issues.push(
                    `Container has too many children: ${block.children.length} (max ${V2Limits.CONTAINER_CHILDREN}).`
                );
            }
            for (const child of block.children) {
                // The type system forbids nested containers, but templates may be
                // built from dynamic/untyped data, so we guard at runtime too.
                if ((child as Block).type === 'container') {
                    issues.push('Containers cannot be nested inside other containers.');
                    continue;
                }
                visit(child, depth + 1, issues, counters);
            }
            break;
        }
        case 'separator': {
            break;
        }
        case 'media': {
            if (
                block.items.length < V2Limits.MEDIA_ITEMS_MIN ||
                block.items.length > V2Limits.MEDIA_ITEMS_MAX
            ) {
                issues.push(
                    `Media gallery must have ${V2Limits.MEDIA_ITEMS_MIN}-${V2Limits.MEDIA_ITEMS_MAX} items (got ${block.items.length}).`
                );
            }
            for (const item of block.items) {
                if (!item.url) {
                    issues.push('Media item is missing a url.');
                }
                if (item.description && item.description.length > V2Limits.DESCRIPTION_MAX) {
                    issues.push(
                        `Media item description exceeds ${V2Limits.DESCRIPTION_MAX} characters.`
                    );
                }
            }
            break;
        }
        case 'file': {
            if (!block.url.startsWith('attachment://')) {
                issues.push(
                    `File block url must be an 'attachment://<filename>' reference (got '${block.url}'). Provide the file via the send 'files' option.`
                );
            }
            break;
        }
        case 'actions': {
            validateActions(block.components, issues);
            counters.components += block.components.length;
            break;
        }
    }
}

function validateSection(block: SectionBlock, issues: string[]): void {
    if (
        block.text.length < V2Limits.SECTION_TEXTS_MIN ||
        block.text.length > V2Limits.SECTION_TEXTS_MAX
    ) {
        issues.push(
            `Section must have ${V2Limits.SECTION_TEXTS_MIN}-${V2Limits.SECTION_TEXTS_MAX} text lines (got ${block.text.length}).`
        );
    }
    if (block.text.some(line => line.trim().length === 0)) {
        issues.push('Section text lines must not be empty.');
    }
}

function validateAccessory(accessory: Accessory, issues: string[]): void {
    if (accessory.kind === 'button') {
        validateButton(accessory.button, issues, 'section accessory');
    } else {
        if (!accessory.url) {
            issues.push('Section thumbnail accessory is missing a url.');
        }
        if (accessory.description && accessory.description.length > V2Limits.DESCRIPTION_MAX) {
            issues.push(`Thumbnail description exceeds ${V2Limits.DESCRIPTION_MAX} characters.`);
        }
    }
}

function validateActions(components: Interactive[], issues: string[]): void {
    if (components.length === 0) {
        issues.push('Action row must have at least one component.');
        return;
    }

    const selects = components.filter((c): c is SelectSpec => c.type === 'select');
    const buttons = components.filter((c): c is ButtonComponent => c.type === 'button');

    if (selects.length > 0) {
        if (components.length > 1) {
            issues.push('A select menu must be the only component in its action row.');
        }
        for (const select of selects) {
            validateSelect(select, issues);
        }
        return;
    }

    if (buttons.length > V2Limits.ACTION_ROW_BUTTONS_MAX) {
        issues.push(
            `Too many buttons in one action row: ${buttons.length} (max ${V2Limits.ACTION_ROW_BUTTONS_MAX}).`
        );
    }
    for (const button of buttons) {
        validateButton(button, issues, 'action row');
    }
}

function validateButton(spec: ButtonSpec, issues: string[], where: string): void {
    if (spec.style === 'link') {
        if (!spec.url) {
            issues.push(`Link button (${where}) is missing a url.`);
        }
        if (spec.customId) {
            issues.push(`Link button (${where}) must not have a customId.`);
        }
    } else {
        if (!spec.customId) {
            issues.push(`Button (${where}) is missing a customId.`);
        } else if (spec.customId.length > V2Limits.CUSTOM_ID_MAX) {
            issues.push(`Button customId (${where}) exceeds ${V2Limits.CUSTOM_ID_MAX} characters.`);
        }
        if (spec.url) {
            issues.push(`Non-link button (${where}) must not have a url.`);
        }
    }
    if (!spec.label && !spec.emoji) {
        issues.push(`Button (${where}) must have a label or an emoji.`);
    }
    if (spec.label && spec.label.length > V2Limits.BUTTON_LABEL_MAX) {
        issues.push(`Button label (${where}) exceeds ${V2Limits.BUTTON_LABEL_MAX} characters.`);
    }
}

function validateSelect(spec: SelectSpec, issues: string[]): void {
    if (!spec.customId) {
        issues.push('Select menu is missing a customId.');
    } else if (spec.customId.length > V2Limits.CUSTOM_ID_MAX) {
        issues.push(`Select customId exceeds ${V2Limits.CUSTOM_ID_MAX} characters.`);
    }
    if (spec.options.length === 0) {
        issues.push('Select menu must have at least one option.');
    }
    if (spec.options.length > V2Limits.SELECT_OPTIONS_MAX) {
        issues.push(
            `Select menu has too many options: ${spec.options.length} (max ${V2Limits.SELECT_OPTIONS_MAX}).`
        );
    }
    if (spec.placeholder && spec.placeholder.length > V2Limits.SELECT_PLACEHOLDER_MAX) {
        issues.push(`Select placeholder exceeds ${V2Limits.SELECT_PLACEHOLDER_MAX} characters.`);
    }
    if (
        spec.minValues !== undefined &&
        spec.maxValues !== undefined &&
        spec.minValues > spec.maxValues
    ) {
        issues.push('Select minValues cannot exceed maxValues.');
    }
}
