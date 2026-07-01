import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { Guild, User } from 'discord.js';

import { getDb } from '../../core/db/index.js';
import { type SendableChannel, sendTemplate } from '../../core/engine/index.js';
import { childLogger } from '../../core/logger.js';
import { formatDuration } from './duration.js';
import { modLogTemplate, punishmentDmTemplate } from './messages.js';
import {
    type ModerationCaseRow,
    type ModerationNoteRow,
    type ModerationSettingsRow,
    type ModerationWarningRow,
    moderationCases,
    moderationNotes,
    moderationSettings,
    moderationTemporaryRoles,
    moderationWarnings,
} from './schema.js';

const log = childLogger({ mod: 'moderation' });

export const DEFAULT_REASON = 'No reason provided.';

export interface CreateCaseInput {
    guildId: string;
    targetUserId: string;
    moderatorId: string;
    action: string;
    reason?: string;
    durationSeconds?: number;
    expiresAt?: Date;
    active?: boolean;
}

export interface ModerationSettingsPatch {
    modLogChannelId?: string | null;
    muteRoleId?: string | null;
    appealUrl?: string | null;
    dmPunishments?: boolean;
    reasonPrompts?: boolean;
}

export interface LogModerationInput {
    guild: Guild;
    caseId: number;
    action: string;
    target: string;
    moderator: string;
    reason: string;
    duration?: string;
}

export interface DmPunishmentInput {
    guildName: string;
    user: User;
    action: string;
    reason: string;
    duration?: string;
    appealUrl?: string | null;
}

/** Creates a moderation case and returns its numeric id. */
export async function createModerationCase(input: CreateCaseInput): Promise<number> {
    const [row] = await getDb()
        .insert(moderationCases)
        .values({
            guildId: input.guildId,
            targetUserId: input.targetUserId,
            moderatorId: input.moderatorId,
            action: input.action,
            reason: input.reason ?? DEFAULT_REASON,
            durationSeconds: input.durationSeconds,
            expiresAt: input.expiresAt,
            active: input.active ?? true,
        })
        .returning({ id: moderationCases.id });

    return row?.id ?? 0;
}

/** Stores a warning and matching moderation case. */
export async function createWarning(input: {
    guildId: string;
    userId: string;
    moderatorId: string;
    reason: string;
}): Promise<number> {
    const caseId = await createModerationCase({
        guildId: input.guildId,
        targetUserId: input.userId,
        moderatorId: input.moderatorId,
        action: 'warn',
        reason: input.reason,
        active: false,
    });

    await getDb().insert(moderationWarnings).values({
        guildId: input.guildId,
        userId: input.userId,
        moderatorId: input.moderatorId,
        caseId,
        reason: input.reason,
    });

    return caseId;
}

/** Returns recent moderation cases for a user. */
export async function listCases(guildId: string, userId: string): Promise<ModerationCaseRow[]> {
    return await getDb()
        .select()
        .from(moderationCases)
        .where(and(eq(moderationCases.guildId, guildId), eq(moderationCases.targetUserId, userId)))
        .orderBy(desc(moderationCases.createdAt))
        .limit(10);
}

/** Returns active warnings for a user. */
export async function listWarnings(guildId: string, userId: string): Promise<ModerationWarningRow[]> {
    return await getDb()
        .select()
        .from(moderationWarnings)
        .where(
            and(
                eq(moderationWarnings.guildId, guildId),
                eq(moderationWarnings.userId, userId),
                isNull(moderationWarnings.clearedAt)
            )
        )
        .orderBy(desc(moderationWarnings.createdAt))
        .limit(15);
}

/** Clears every active warning for a user and records one moderation case. */
export async function clearWarnings(input: {
    guildId: string;
    userId: string;
    moderatorId: string;
    reason: string;
}): Promise<{ cleared: number; caseId: number }> {
    const cleared = await getDb()
        .update(moderationWarnings)
        .set({ clearedAt: new Date(), clearedBy: input.moderatorId })
        .where(
            and(
                eq(moderationWarnings.guildId, input.guildId),
                eq(moderationWarnings.userId, input.userId),
                isNull(moderationWarnings.clearedAt)
            )
        )
        .returning({ id: moderationWarnings.id });

    const caseId = await createModerationCase({
        guildId: input.guildId,
        targetUserId: input.userId,
        moderatorId: input.moderatorId,
        action: 'clear-warnings',
        reason: input.reason,
        active: false,
    });

    return { cleared: cleared.length, caseId };
}

/** Adds a private staff note. */
export async function createNote(input: {
    guildId: string;
    userId: string;
    moderatorId: string;
    note: string;
}): Promise<number> {
    const [row] = await getDb()
        .insert(moderationNotes)
        .values(input)
        .returning({ id: moderationNotes.id });

    return row?.id ?? 0;
}

/** Lists active staff notes for a user. */
export async function listNotes(guildId: string, userId: string): Promise<ModerationNoteRow[]> {
    return await getDb()
        .select()
        .from(moderationNotes)
        .where(
            and(
                eq(moderationNotes.guildId, guildId),
                eq(moderationNotes.userId, userId),
                isNull(moderationNotes.clearedAt)
            )
        )
        .orderBy(desc(moderationNotes.createdAt))
        .limit(10);
}

/** Clears active staff notes for a user. */
export async function clearNotes(input: {
    guildId: string;
    userId: string;
    moderatorId: string;
}): Promise<number> {
    const rows = await getDb()
        .update(moderationNotes)
        .set({ clearedAt: new Date(), clearedBy: input.moderatorId })
        .where(
            and(
                eq(moderationNotes.guildId, input.guildId),
                eq(moderationNotes.userId, input.userId),
                isNull(moderationNotes.clearedAt)
            )
        )
        .returning({ id: moderationNotes.id });

    return rows.length;
}

/** Returns settings, falling back to the module defaults when no row exists yet. */
export async function getModerationSettings(guildId: string): Promise<ModerationSettingsRow> {
    const [row] = await getDb()
        .select()
        .from(moderationSettings)
        .where(eq(moderationSettings.guildId, guildId))
        .limit(1);

    const now = new Date();
    return (
        row ?? {
            guildId,
            modLogChannelId: null,
            muteRoleId: null,
            appealUrl: null,
            dmPunishments: true,
            reasonPrompts: true,
            updatedAt: now,
            createdAt: now,
        }
    );
}

/** Upserts moderation settings for a guild. */
export async function updateModerationSettings(
    guildId: string,
    patch: ModerationSettingsPatch
): Promise<ModerationSettingsRow> {
    const current = await getModerationSettings(guildId);
    const updatedAt = new Date();
    const next = {
        guildId,
        modLogChannelId: patch.modLogChannelId ?? current.modLogChannelId,
        muteRoleId: patch.muteRoleId ?? current.muteRoleId,
        appealUrl: patch.appealUrl ?? current.appealUrl,
        dmPunishments: patch.dmPunishments ?? current.dmPunishments,
        reasonPrompts: patch.reasonPrompts ?? current.reasonPrompts,
        updatedAt,
        createdAt: current.createdAt,
    };

    const [row] = await getDb()
        .insert(moderationSettings)
        .values(next)
        .onConflictDoUpdate({
            target: moderationSettings.guildId,
            set: {
                modLogChannelId: next.modLogChannelId,
                muteRoleId: next.muteRoleId,
                appealUrl: next.appealUrl,
                dmPunishments: next.dmPunishments,
                reasonPrompts: next.reasonPrompts,
                updatedAt,
            },
        })
        .returning();

    return row ?? next;
}

/** Stores a temporary role grant. */
export async function createTemporaryRole(input: {
    guildId: string;
    userId: string;
    roleId: string;
    moderatorId: string;
    reason: string;
    expiresAt: Date;
}): Promise<number> {
    const [row] = await getDb()
        .insert(moderationTemporaryRoles)
        .values(input)
        .returning({ id: moderationTemporaryRoles.id });

    return row?.id ?? 0;
}

/** Marks temporary role grants inactive for a role/user pair. */
export async function deactivateTemporaryRole(input: {
    guildId: string;
    userId: string;
    roleId: string;
}): Promise<number> {
    const rows = await getDb()
        .update(moderationTemporaryRoles)
        .set({ active: false })
        .where(
            and(
                eq(moderationTemporaryRoles.guildId, input.guildId),
                eq(moderationTemporaryRoles.userId, input.userId),
                eq(moderationTemporaryRoles.roleId, input.roleId),
                eq(moderationTemporaryRoles.active, true)
            )
        )
        .returning({ id: moderationTemporaryRoles.id });

    return rows.length;
}

/** Attempts to DM a user about a punishment. Failure is common and non-fatal. */
export async function dmPunishment(input: DmPunishmentInput): Promise<boolean> {
    try {
        await sendTemplate(
            input.user,
            punishmentDmTemplate({
                guildName: input.guildName,
                action: input.action,
                reason: input.reason,
                duration: input.duration,
                appealUrl: input.appealUrl,
            })
        );
        return true;
    } catch (error) {
        log.debug({ err: error, userId: input.user.id }, 'Could not DM moderated user');
        return false;
    }
}

/** Sends a case to the configured moderation log channel, if present. */
export async function sendModLog(input: LogModerationInput): Promise<boolean> {
    const settings = await getModerationSettings(input.guild.id);
    if (!settings.modLogChannelId) {
        return false;
    }

    try {
        const channel = await input.guild.channels.fetch(settings.modLogChannelId);
        if (!isSendableChannel(channel)) {
            return false;
        }
        await sendTemplate(
            channel,
            modLogTemplate({
                caseId: input.caseId,
                action: input.action,
                target: input.target,
                moderator: input.moderator,
                reason: input.reason,
                duration: input.duration,
            })
        );
        return true;
    } catch (error) {
        log.warn({ err: error, guildId: input.guild.id }, 'Could not send moderation log');
        return false;
    }
}

/** Cleans up due temporary bans and temporary roles when any moderation command runs. */
export async function sweepModerationExpirations(guild: Guild): Promise<void> {
    const now = new Date();
    await sweepTemporaryBans(guild, now);
    await sweepTemporaryRoles(guild, now);
}

function isSendableChannel(channel: unknown): channel is SendableChannel {
    return (
        typeof channel === 'object' &&
        channel !== null &&
        'send' in channel &&
        typeof (channel as { send?: unknown }).send === 'function'
    );
}

async function sweepTemporaryBans(guild: Guild, now: Date): Promise<void> {
    const rows = await getDb()
        .select()
        .from(moderationCases)
        .where(
            and(
                eq(moderationCases.guildId, guild.id),
                eq(moderationCases.active, true),
                inArray(moderationCases.action, ['ban']),
                lte(moderationCases.expiresAt, now)
            )
        )
        .limit(25);

    for (const row of rows) {
        try {
            await guild.bans.remove(row.targetUserId, `Temporary ban expired, case #${row.id}`);
            await getDb()
                .update(moderationCases)
                .set({ active: false })
                .where(eq(moderationCases.id, row.id));
        } catch (error) {
            log.warn(
                { err: error, caseId: row.id, guildId: guild.id },
                'Could not expire temporary ban'
            );
        }
    }
}

async function sweepTemporaryRoles(guild: Guild, now: Date): Promise<void> {
    const rows = await getDb()
        .select()
        .from(moderationTemporaryRoles)
        .where(
            and(
                eq(moderationTemporaryRoles.guildId, guild.id),
                eq(moderationTemporaryRoles.active, true),
                lte(moderationTemporaryRoles.expiresAt, now)
            )
        )
        .limit(50);

    for (const row of rows) {
        try {
            const member = await guild.members.fetch(row.userId).catch(() => null);
            if (member) {
                await member.roles.remove(
                    row.roleId,
                    `Temporary role expired after ${formatDuration(
                        Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 1000))
                    )}`
                );
            }
            await getDb()
                .update(moderationTemporaryRoles)
                .set({ active: false })
                .where(eq(moderationTemporaryRoles.id, row.id));
        } catch (error) {
            log.warn(
                { err: error, tempRoleId: row.id, guildId: guild.id },
                'Could not expire temporary role'
            );
        }
    }
}
