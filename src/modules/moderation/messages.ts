import type { ChatInputCommandInteraction } from 'discord.js';

import { type MessageTemplate, sendTemplate } from '../../core/engine/index.js';

export type NoticeTheme = 'danger' | 'default' | 'info' | 'success' | 'warning';

export interface NoticeOptions {
    title: string;
    body: string;
    theme?: NoticeTheme;
    ephemeral?: boolean;
}

/** Builds a compact Components V2 notice for moderation command responses. */
export function noticeTemplate(options: NoticeOptions): MessageTemplate {
    const theme = options.theme ?? 'info';
    return {
        theme,
        blocks: [
            {
                type: 'container',
                accent: theme,
                children: [{ type: 'text', content: `### ${options.title}\n${options.body}` }],
            },
        ],
    };
}

/** Sends a moderation notice through the message engine. */
export async function sendNotice(
    interaction: ChatInputCommandInteraction,
    options: NoticeOptions
): Promise<void> {
    await sendTemplate(interaction, noticeTemplate(options), {}, { ephemeral: options.ephemeral ?? true });
}

/** Builds a user-facing DM for moderation actions. */
export function punishmentDmTemplate(input: {
    guildName: string;
    action: string;
    reason: string;
    duration?: string;
    appealUrl?: string | null;
}): MessageTemplate {
    const lines = [
        `You received a moderation action in **${input.guildName}**.`,
        `**Action:** ${input.action}`,
        `**Reason:** ${input.reason}`,
    ];
    if (input.duration) {
        lines.push(`**Duration:** ${input.duration}`);
    }
    if (input.appealUrl) {
        lines.push(`**Appeal:** ${input.appealUrl}`);
    }

    return noticeTemplate({
        title: 'Moderation notice',
        body: lines.join('\n'),
        theme: 'warning',
        ephemeral: false,
    });
}

/** Builds a moderation log entry for the configured log channel. */
export function modLogTemplate(input: {
    caseId: number;
    action: string;
    target: string;
    moderator: string;
    reason: string;
    duration?: string;
}): MessageTemplate {
    const lines = [
        `**Case:** #${input.caseId}`,
        `**Action:** ${input.action}`,
        `**Target:** ${input.target}`,
        `**Moderator:** ${input.moderator}`,
        `**Reason:** ${input.reason}`,
    ];
    if (input.duration) {
        lines.push(`**Duration:** ${input.duration}`);
    }

    return noticeTemplate({
        title: 'Moderation log',
        body: lines.join('\n'),
        theme: 'info',
        ephemeral: false,
    });
}

/** Escapes user-provided text for compact markdown display. */
export function cleanInline(value: string): string {
    return value.replaceAll('`', "'").trim();
}
