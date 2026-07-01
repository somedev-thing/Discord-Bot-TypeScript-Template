import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/** Durable moderation actions for audit trails, history, and temporary punishments. */
export const moderationCases = pgTable('moderation_cases', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    targetUserId: text('target_user_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    action: text('action').notNull(),
    reason: text('reason'),
    durationSeconds: integer('duration_seconds'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Warning-specific rows, linked to the moderation case that created them. */
export const moderationWarnings = pgTable('moderation_warnings', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    caseId: integer('case_id'),
    reason: text('reason').notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: text('cleared_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Private staff notes attached to a server member or user id. */
export const moderationNotes = pgTable('moderation_notes', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    note: text('note').notNull(),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),
    clearedBy: text('cleared_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-server moderation settings. */
export const moderationSettings = pgTable('moderation_settings', {
    guildId: text('guild_id').primaryKey(),
    modLogChannelId: text('mod_log_channel_id'),
    muteRoleId: text('mute_role_id'),
    appealUrl: text('appeal_url'),
    dmPunishments: boolean('dm_punishments').notNull().default(true),
    reasonPrompts: boolean('reason_prompts').notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Temporary role grants that can be cleaned up when moderation commands run. */
export const moderationTemporaryRoles = pgTable('moderation_temporary_roles', {
    id: serial('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    roleId: text('role_id').notNull(),
    moderatorId: text('moderator_id').notNull(),
    reason: text('reason'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ModerationCaseRow = typeof moderationCases.$inferSelect;
export type ModerationSettingsRow = typeof moderationSettings.$inferSelect;
export type ModerationTemporaryRoleRow = typeof moderationTemporaryRoles.$inferSelect;
export type ModerationWarningRow = typeof moderationWarnings.$inferSelect;
export type ModerationNoteRow = typeof moderationNotes.$inferSelect;
