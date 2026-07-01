import type {
    ChatInputCommandInteraction,
    Collection,
    Guild,
    GuildMember,
    Message,
    PermissionResolvable,
    Snowflake,
    User,
} from 'discord.js';
import { ChannelType, PermissionFlagsBits, Role, SlashCommandBuilder } from 'discord.js';

import type { ChatCommand, Command } from '../../core/commands/index.js';
import { parseDuration, type ParsedDuration } from './duration.js';
import { cleanInline, sendNotice } from './messages.js';
import {
    DEFAULT_REASON,
    clearNotes,
    clearWarnings,
    createModerationCase,
    createNote,
    createTemporaryRole,
    createWarning,
    deactivateTemporaryRole,
    dmPunishment,
    getModerationSettings,
    listCases,
    listNotes,
    listWarnings,
    sendModLog,
    sweepModerationExpirations,
    updateModerationSettings,
} from './service.js';

const DISCORD_TIMEOUT_MAX_SECONDS = 28 * 24 * 60 * 60;
const MASS_ACTION_LIMIT = 25;
const URL_PATTERN = /https?:\/\/|discord\.gg\/|discord\.com\/invite\//i;

interface ModerationContext {
    guild: Guild;
    moderator: GuildMember;
    bot: GuildMember;
}

interface BulkDeleteChannel {
    messages: {
        fetch(options: { limit: number }): Promise<Collection<Snowflake, Message>>;
    };
    bulkDelete(
        messages: Collection<Snowflake, Message>,
        filterOld?: boolean
    ): Promise<Collection<Snowflake, Message>>;
    toString(): string;
}

interface LockableChannel {
    permissionOverwrites: {
        edit(
            target: Role,
            options: { SendMessages?: boolean | null; SendMessagesInThreads?: boolean | null },
            reason?: { reason?: string }
        ): Promise<unknown>;
    };
    toString(): string;
}

interface SlowmodeChannel {
    setRateLimitPerUser(seconds: number, reason?: string): Promise<unknown>;
    toString(): string;
}

/** All moderation commands exported by module 1. */
export const moderationCommands: Command[] = [
    buildBanCommand(),
    buildUnbanCommand(),
    buildKickCommand(),
    buildTimeoutCommand(),
    buildRemoveTimeoutCommand(),
    buildWarnCommand(),
    buildWarningsCommand(),
    buildClearWarningsCommand(),
    buildMuteSystemCommand(),
    buildPurgeCommand(),
    buildLockCommand(),
    buildUnlockCommand(),
    buildSlowmodeCommand(),
    buildNicknameResetCommand(),
    buildRoleCommand(),
    buildCaseHistoryCommand(),
    buildModNoteCommand(),
    buildModLogsCommand(),
    buildMassBanCommand(),
    buildMassTimeoutCommand(),
    buildAppealLinkCommand(),
    buildTemporaryRoleCommand(),
];

function buildBanCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 3, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('ban')
            .setDescription('Ban a user and record a moderation case.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('User to ban.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs and DMs.')
            )
            .addStringOption(option =>
                option.setName('duration').setDescription('Optional temporary ban length, like 7d.')
            )
            .addIntegerOption(option =>
                option
                    .setName('delete-message-days')
                    .setDescription('Delete recent messages from this many days.')
                    .setMinValue(0)
                    .setMaxValue(7)
            )
            .addBooleanOption(option =>
                option.setName('dm').setDescription('DM the user before the ban.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.BanMembers,
                'ban members'
            );
            if (!ctx) {
                return;
            }

            const user = interaction.options.getUser('user', true);
            const reason = getReason(interaction);
            const duration = getDurationOption(interaction);
            const deleteMessageDays = interaction.options.getInteger('delete-message-days') ?? 0;
            const dmEnabled = await shouldDm(interaction, ctx.guild);
            const member = await ctx.guild.members.fetch(user.id).catch(() => null);

            if (member) {
                const guard = await guardTargetMember(interaction, ctx, member, 'ban');
                if (!guard) {
                    return;
                }
                if (!member.bannable) {
                    await sendNotice(interaction, {
                        title: 'Cannot ban user',
                        body: 'The bot cannot ban that member. Check role order and permissions.',
                        theme: 'danger',
                    });
                    return;
                }
            }

            if (dmEnabled) {
                await notifyPunishment(ctx.guild, user, 'Ban', reason, duration);
            }

            await ctx.guild.members.ban(user.id, {
                reason: auditReason(interaction, reason),
                deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60,
            });

            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: user.id,
                moderatorId: interaction.user.id,
                action: 'ban',
                reason,
                durationSeconds: duration?.seconds,
                expiresAt: duration?.expiresAt,
                active: duration !== undefined,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: duration ? 'Temporary ban' : 'Ban',
                target: userMention(user.id),
                reason,
                duration,
            });
        },
    };
}

function buildUnbanCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 3, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('unban')
            .setDescription('Unban a user by id and record a moderation case.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addStringOption(option =>
                option.setName('user-id').setDescription('User id to unban.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.BanMembers,
                'unban members'
            );
            if (!ctx) {
                return;
            }

            const userId = interaction.options.getString('user-id', true).trim();
            if (!isDiscordId(userId)) {
                await sendNotice(interaction, {
                    title: 'Invalid user id',
                    body: 'Provide a Discord user id, not a mention or username.',
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            await ctx.guild.bans.remove(userId, auditReason(interaction, reason));
            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: userId,
                moderatorId: interaction.user.id,
                action: 'unban',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Unban',
                target: userMention(userId),
                reason,
            });
        },
    };
}

function buildKickCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 3, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('kick')
            .setDescription('Kick a member and record a moderation case.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('Member to kick.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs and DMs.')
            )
            .addBooleanOption(option =>
                option.setName('dm').setDescription('DM the user before the kick.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.KickMembers,
                PermissionFlagsBits.KickMembers,
                'kick members'
            );
            if (!ctx) {
                return;
            }

            const member = await getRequiredMember(interaction, ctx.guild, 'user');
            if (!member) {
                return;
            }
            const guard = await guardTargetMember(interaction, ctx, member, 'kick');
            if (!guard) {
                return;
            }
            if (!member.kickable) {
                await sendNotice(interaction, {
                    title: 'Cannot kick member',
                    body: 'The bot cannot kick that member. Check role order and permissions.',
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            if (await shouldDm(interaction, ctx.guild)) {
                await notifyPunishment(ctx.guild, member.user, 'Kick', reason);
            }
            await member.kick(auditReason(interaction, reason));

            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: member.id,
                moderatorId: interaction.user.id,
                action: 'kick',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Kick',
                target: userMention(member.id),
                reason,
            });
        },
    };
}

function buildTimeoutCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('timeout')
            .setDescription('Timeout a member and record a moderation case.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('Member to timeout.').setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('duration')
                    .setDescription('Timeout length, max 28d.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs and DMs.')
            )
            .addBooleanOption(option =>
                option.setName('dm').setDescription('DM the user before the timeout.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.ModerateMembers,
                'timeout members'
            );
            if (!ctx) {
                return;
            }

            const member = await getRequiredMember(interaction, ctx.guild, 'user');
            const duration = requireDuration(interaction, 'duration');
            if (!member || !duration) {
                return;
            }
            if (duration.seconds > DISCORD_TIMEOUT_MAX_SECONDS) {
                await sendNotice(interaction, {
                    title: 'Duration too long',
                    body: 'Discord timeouts can be at most 28 days.',
                    theme: 'danger',
                });
                return;
            }

            const guard = await guardTargetMember(interaction, ctx, member, 'timeout');
            if (!guard) {
                return;
            }
            if (!member.moderatable) {
                await sendNotice(interaction, {
                    title: 'Cannot timeout member',
                    body: 'The bot cannot timeout that member. Check role order and permissions.',
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            if (await shouldDm(interaction, ctx.guild)) {
                await notifyPunishment(ctx.guild, member.user, 'Timeout', reason, duration);
            }
            await member.timeout(duration.seconds * 1000, auditReason(interaction, reason));

            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: member.id,
                moderatorId: interaction.user.id,
                action: 'timeout',
                reason,
                durationSeconds: duration.seconds,
                expiresAt: duration.expiresAt,
                active: true,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Timeout',
                target: userMention(member.id),
                reason,
                duration,
            });
        },
    };
}

function buildRemoveTimeoutCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('remove-timeout')
            .setDescription('Remove a member timeout and record a moderation case.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('Member to restore.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.ModerateMembers,
                'remove timeouts'
            );
            if (!ctx) {
                return;
            }

            const member = await getRequiredMember(interaction, ctx.guild, 'user');
            if (!member) {
                return;
            }
            const reason = getReason(interaction);
            await member.timeout(null, auditReason(interaction, reason));
            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: member.id,
                moderatorId: interaction.user.id,
                action: 'remove-timeout',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Remove timeout',
                target: userMention(member.id),
                reason,
            });
        },
    };
}

function buildWarnCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 5, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('warn')
            .setDescription('Warn a user and save it to their warning history.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('User to warn.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Warning reason.').setRequired(true)
            )
            .addBooleanOption(option => option.setName('dm').setDescription('DM the user.'))
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.SendMessages,
                'warn members'
            );
            if (!ctx) {
                return;
            }

            const user = interaction.options.getUser('user', true);
            const reason = getReason(interaction);
            if (await shouldDm(interaction, ctx.guild)) {
                await notifyPunishment(ctx.guild, user, 'Warning', reason);
            }

            const caseId = await createWarning({
                guildId: ctx.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Warning',
                target: userMention(user.id),
                reason,
            });
        },
    };
}

function buildWarningsCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 8, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('warnings')
            .setDescription('View active warnings for a user.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('User to inspect.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.SendMessages,
                'view warnings'
            );
            if (!ctx) {
                return;
            }

            const user = interaction.options.getUser('user', true);
            const warnings = await listWarnings(ctx.guild.id, user.id);
            await sendNotice(interaction, {
                title: `Warnings for ${user.username}`,
                body:
                    warnings.length === 0
                        ? 'No active warnings.'
                        : warnings
                              .map(
                                  warning =>
                                      `#${warning.caseId ?? warning.id} ${formatDate(
                                          warning.createdAt
                                      )}: ${warning.reason}`
                              )
                              .join('\n'),
                theme: 'info',
            });
        },
    };
}

function buildClearWarningsCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('clear-warnings')
            .setDescription('Clear all active warnings for a user.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('User to clear.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Clear reason.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.SendMessages,
                'clear warnings'
            );
            if (!ctx) {
                return;
            }

            const user = interaction.options.getUser('user', true);
            const reason = getReason(interaction);
            const result = await clearWarnings({
                guildId: ctx.guild.id,
                userId: user.id,
                moderatorId: interaction.user.id,
                reason,
            });

            await afterCase(interaction, {
                ctx,
                caseId: result.caseId,
                action: 'Clear warnings',
                target: userMention(user.id),
                reason: `${reason} (${result.cleared} cleared)`,
            });
        },
    };
}

function buildMuteSystemCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('mute-system')
            .setDescription('Configure the moderation mute system settings.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addRoleOption(option =>
                option.setName('role').setDescription('Role used by role-based mute flows.')
            )
            .addBooleanOption(option =>
                option.setName('dm-punishments').setDescription('DM users on punishments by default.')
            )
            .addBooleanOption(option =>
                option.setName('reason-prompts').setDescription('Keep reason prompts enabled.')
            )
            .addStringOption(option =>
                option.setName('appeal-url').setDescription('Appeal link to include in DMs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.SendMessages,
                'configure moderation'
            );
            if (!ctx) {
                return;
            }

            const role = interaction.options.getRole('role');
            if (role instanceof Role) {
                const roleGuard = await guardRole(interaction, ctx, role, 'configure as mute role');
                if (!roleGuard) {
                    return;
                }
            }

            const settings = await updateModerationSettings(ctx.guild.id, {
                muteRoleId: role?.id,
                dmPunishments: interaction.options.getBoolean('dm-punishments') ?? undefined,
                reasonPrompts: interaction.options.getBoolean('reason-prompts') ?? undefined,
                appealUrl: interaction.options.getString('appeal-url'),
            });

            await sendNotice(interaction, {
                title: 'Mute system updated',
                body: [
                    `Mute role: ${settings.muteRoleId ? roleMention(settings.muteRoleId) : 'Not set'}`,
                    `DM punishments: ${settings.dmPunishments ? 'Enabled' : 'Disabled'}`,
                    `Reason prompts: ${settings.reasonPrompts ? 'Enabled' : 'Disabled'}`,
                    `Appeal link: ${settings.appealUrl ?? 'Not set'}`,
                ].join('\n'),
                theme: 'success',
            });
        },
    };
}

function buildPurgeCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 3, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('purge')
            .setDescription('Bulk delete recent messages in this channel.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
            .addIntegerOption(option =>
                option
                    .setName('amount')
                    .setDescription('Number of recent messages to scan.')
                    .setMinValue(1)
                    .setMaxValue(100)
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('user').setDescription('Only delete messages by this user.')
            )
            .addBooleanOption(option =>
                option.setName('links').setDescription('Only delete messages that contain links.')
            )
            .addBooleanOption(option =>
                option.setName('bots').setDescription('Only delete messages from bots.')
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.ManageMessages,
                'purge messages'
            );
            if (!ctx) {
                return;
            }
            if (!isBulkDeleteChannel(interaction.channel)) {
                await sendNotice(interaction, {
                    title: 'Cannot purge here',
                    body: 'This channel does not support bulk message deletion.',
                    theme: 'danger',
                });
                return;
            }

            const amount = interaction.options.getInteger('amount', true);
            const user = interaction.options.getUser('user');
            const linksOnly = interaction.options.getBoolean('links') ?? false;
            const botsOnly = interaction.options.getBoolean('bots') ?? false;
            const reason = getReason(interaction);

            const fetched = await interaction.channel.messages.fetch({ limit: amount });
            let selected = fetched;
            if (user) {
                selected = selected.filter(message => message.author.id === user.id);
            }
            if (linksOnly) {
                selected = selected.filter(message => URL_PATTERN.test(message.content));
            }
            if (botsOnly) {
                selected = selected.filter(message => message.author.bot);
            }

            if (selected.size === 0) {
                await sendNotice(interaction, {
                    title: 'Nothing to purge',
                    body: linksOnly
                        ? 'No matching messages were found. Link purges only work when message content is available to the bot.'
                        : 'No matching messages were found.',
                    theme: 'warning',
                });
                return;
            }

            const deleted = await interaction.channel.bulkDelete(selected, true);
            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: user?.id ?? ctx.guild.id,
                moderatorId: interaction.user.id,
                action: 'purge',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Purge messages',
                target: user ? userMention(user.id) : interaction.channel.toString(),
                reason: `${reason} (${deleted.size} deleted)`,
            });
        },
    };
}

function buildLockCommand(): ChatCommand {
    return buildChannelLockCommand('lock-channel', 'Lock a channel for everyone.', false);
}

function buildUnlockCommand(): ChatCommand {
    return buildChannelLockCommand('unlock-channel', 'Unlock a channel for everyone.', true);
}

function buildChannelLockCommand(name: string, description: string, unlock: boolean): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName(name)
            .setDescription(description)
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel to update. Defaults to the current channel.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageChannels,
                unlock ? 'unlock channels' : 'lock channels'
            );
            if (!ctx) {
                return;
            }

            const channel = interaction.options.getChannel('channel') ?? interaction.channel;
            if (!isLockableChannel(channel)) {
                await sendNotice(interaction, {
                    title: 'Cannot update channel',
                    body: 'That channel does not support permission overwrites.',
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            await channel.permissionOverwrites.edit(
                ctx.guild.roles.everyone,
                {
                    SendMessages: unlock ? null : false,
                    SendMessagesInThreads: unlock ? null : false,
                },
                { reason: auditReason(interaction, reason) }
            );

            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: ctx.guild.id,
                moderatorId: interaction.user.id,
                action: unlock ? 'unlock-channel' : 'lock-channel',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: unlock ? 'Unlock channel' : 'Lock channel',
                target: channel.toString(),
                reason,
            });
        },
    };
}

function buildSlowmodeCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('slowmode')
            .setDescription('Set channel slowmode.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
            .addIntegerOption(option =>
                option
                    .setName('seconds')
                    .setDescription('Slowmode seconds, 0 disables it.')
                    .setMinValue(0)
                    .setMaxValue(21600)
                    .setRequired(true)
            )
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel to update. Defaults to the current channel.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ManageChannels,
                'set slowmode'
            );
            if (!ctx) {
                return;
            }

            const channel = interaction.options.getChannel('channel') ?? interaction.channel;
            if (!isSlowmodeChannel(channel)) {
                await sendNotice(interaction, {
                    title: 'Cannot set slowmode',
                    body: 'That channel does not support slowmode.',
                    theme: 'danger',
                });
                return;
            }

            const seconds = interaction.options.getInteger('seconds', true);
            const reason = getReason(interaction);
            await channel.setRateLimitPerUser(seconds, auditReason(interaction, reason));
            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: ctx.guild.id,
                moderatorId: interaction.user.id,
                action: 'slowmode',
                reason,
                durationSeconds: seconds,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Slowmode',
                target: channel.toString(),
                reason: `${reason} (${seconds}s)`,
            });
        },
    };
}

function buildNicknameResetCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('nickname-reset')
            .setDescription('Reset a member nickname.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
            .addUserOption(option =>
                option.setName('user').setDescription('Member to reset.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.')
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageNicknames,
                PermissionFlagsBits.ManageNicknames,
                'manage nicknames'
            );
            if (!ctx) {
                return;
            }

            const member = await getRequiredMember(interaction, ctx.guild, 'user');
            if (!member) {
                return;
            }
            const reason = getReason(interaction);
            await member.setNickname(null, auditReason(interaction, reason));
            const caseId = await createModerationCase({
                guildId: ctx.guild.id,
                targetUserId: member.id,
                moderatorId: interaction.user.id,
                action: 'nickname-reset',
                reason,
                active: false,
            });

            await afterCase(interaction, {
                ctx,
                caseId,
                action: 'Nickname reset',
                target: userMention(member.id),
                reason,
            });
        },
    };
}

function buildRoleCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 5, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('role')
            .setDescription('Add or remove a role from a member.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a role.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('Member.').setRequired(true)
                    )
                    .addRoleOption(option =>
                        option.setName('role').setDescription('Role to add.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason').setDescription('Reason shown in logs.')
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove a role.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('Member.').setRequired(true)
                    )
                    .addRoleOption(option =>
                        option.setName('role').setDescription('Role to remove.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason').setDescription('Reason shown in logs.')
                    )
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            await executeRoleCommand(interaction, false);
        },
    };
}

function buildCaseHistoryCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 8, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('case-history')
            .setDescription('View recent moderation cases for a user.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addUserOption(option =>
                option.setName('user').setDescription('User to inspect.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.SendMessages,
                'view case history'
            );
            if (!ctx) {
                return;
            }

            const user = interaction.options.getUser('user', true);
            const cases = await listCases(ctx.guild.id, user.id);
            await sendNotice(interaction, {
                title: `Cases for ${user.username}`,
                body:
                    cases.length === 0
                        ? 'No cases found.'
                        : cases
                              .map(
                                  entry =>
                                      `#${entry.id} ${entry.action} ${formatDate(
                                          entry.createdAt
                                      )}: ${entry.reason ?? DEFAULT_REASON}`
                              )
                              .join('\n'),
                theme: 'info',
            });
        },
    };
}

function buildModNoteCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 6, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('mod-note')
            .setDescription('Manage private staff notes.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a staff note.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('note').setDescription('Note text.').setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List staff notes.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User.').setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('clear')
                    .setDescription('Clear active staff notes.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('User.').setRequired(true)
                    )
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.SendMessages,
                'manage staff notes'
            );
            if (!ctx) {
                return;
            }

            const subcommand = interaction.options.getSubcommand(true);
            const user = interaction.options.getUser('user', true);
            if (subcommand === 'add') {
                const note = cleanInline(interaction.options.getString('note', true));
                const noteId = await createNote({
                    guildId: ctx.guild.id,
                    userId: user.id,
                    moderatorId: interaction.user.id,
                    note,
                });
                await sendNotice(interaction, {
                    title: 'Note added',
                    body: `Staff note #${noteId} added for ${userMention(user.id)}.`,
                    theme: 'success',
                });
                return;
            }

            if (subcommand === 'clear') {
                const cleared = await clearNotes({
                    guildId: ctx.guild.id,
                    userId: user.id,
                    moderatorId: interaction.user.id,
                });
                await sendNotice(interaction, {
                    title: 'Notes cleared',
                    body: `${cleared} active notes cleared for ${userMention(user.id)}.`,
                    theme: 'success',
                });
                return;
            }

            const notes = await listNotes(ctx.guild.id, user.id);
            await sendNotice(interaction, {
                title: `Notes for ${user.username}`,
                body:
                    notes.length === 0
                        ? 'No active notes.'
                        : notes
                              .map(
                                  note =>
                                      `#${note.id} ${formatDate(note.createdAt)}: ${note.note}`
                              )
                              .join('\n'),
                theme: 'info',
            });
        },
    };
}

function buildModLogsCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('mod-logs')
            .setDescription('Set the moderation log channel.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Channel for moderation logs.')
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                    .setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.SendMessages,
                'configure moderation logs'
            );
            if (!ctx) {
                return;
            }

            const channel = interaction.options.getChannel('channel', true);
            await updateModerationSettings(ctx.guild.id, { modLogChannelId: channel.id });
            await sendNotice(interaction, {
                title: 'Moderation logs updated',
                body: `Moderation logs will be sent to ${channel.toString()}.`,
                theme: 'success',
            });
        },
    };
}

function buildMassBanCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 1, seconds: 30 },
        data: new SlashCommandBuilder()
            .setName('mass-ban')
            .setDescription('Ban multiple user ids at once.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
            .addStringOption(option =>
                option
                    .setName('user-ids')
                    .setDescription('Space or comma separated user ids.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.BanMembers,
                PermissionFlagsBits.BanMembers,
                'mass ban users'
            );
            if (!ctx) {
                return;
            }

            const ids = parseUserIds(interaction.options.getString('user-ids', true));
            if (ids.length === 0 || ids.length > MASS_ACTION_LIMIT) {
                await sendNotice(interaction, {
                    title: 'Invalid user list',
                    body: `Provide 1-${MASS_ACTION_LIMIT} Discord user ids.`,
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            const settings = await getModerationSettings(ctx.guild.id);
            let successful = 0;
            for (const id of ids) {
                const user = await interaction.client.users.fetch(id).catch(() => null);
                if (user && settings.dmPunishments) {
                    await notifyPunishment(ctx.guild, user, 'Mass ban', reason);
                }
                await ctx.guild.members.ban(id, { reason: auditReason(interaction, reason) });
                successful += 1;
                await createModerationCase({
                    guildId: ctx.guild.id,
                    targetUserId: id,
                    moderatorId: interaction.user.id,
                    action: 'mass-ban',
                    reason,
                    active: false,
                });
            }

            await sendNotice(interaction, {
                title: 'Mass ban complete',
                body: `${successful} users banned. Cases were recorded for each target.`,
                theme: 'success',
            });
        },
    };
}

function buildMassTimeoutCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 1, seconds: 30 },
        data: new SlashCommandBuilder()
            .setName('mass-timeout')
            .setDescription('Timeout multiple members by id.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
            .addStringOption(option =>
                option
                    .setName('user-ids')
                    .setDescription('Space or comma separated user ids.')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('duration').setDescription('Timeout length, max 28d.').setRequired(true)
            )
            .addStringOption(option =>
                option.setName('reason').setDescription('Reason shown in logs.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ModerateMembers,
                PermissionFlagsBits.ModerateMembers,
                'mass timeout members'
            );
            if (!ctx) {
                return;
            }

            const ids = parseUserIds(interaction.options.getString('user-ids', true));
            const duration = requireDuration(interaction, 'duration');
            if (!duration) {
                return;
            }
            if (duration.seconds > DISCORD_TIMEOUT_MAX_SECONDS) {
                await sendNotice(interaction, {
                    title: 'Duration too long',
                    body: 'Discord timeouts can be at most 28 days.',
                    theme: 'danger',
                });
                return;
            }
            if (ids.length === 0 || ids.length > MASS_ACTION_LIMIT) {
                await sendNotice(interaction, {
                    title: 'Invalid user list',
                    body: `Provide 1-${MASS_ACTION_LIMIT} Discord user ids.`,
                    theme: 'danger',
                });
                return;
            }

            const reason = getReason(interaction);
            let successful = 0;
            for (const id of ids) {
                const member = await ctx.guild.members.fetch(id).catch(() => null);
                if (!member || !member.moderatable) {
                    continue;
                }
                await member.timeout(duration.seconds * 1000, auditReason(interaction, reason));
                successful += 1;
                await createModerationCase({
                    guildId: ctx.guild.id,
                    targetUserId: id,
                    moderatorId: interaction.user.id,
                    action: 'mass-timeout',
                    reason,
                    durationSeconds: duration.seconds,
                    expiresAt: duration.expiresAt,
                    active: true,
                });
            }

            await sendNotice(interaction, {
                title: 'Mass timeout complete',
                body: `${successful} members timed out for ${duration.label}.`,
                theme: successful > 0 ? 'success' : 'warning',
            });
        },
    };
}

function buildAppealLinkCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('appeal-link')
            .setDescription('Set the appeal link included in moderation DMs.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
            .addStringOption(option =>
                option.setName('url').setDescription('Appeal form or channel URL.').setRequired(true)
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            const ctx = await requireModerationContext(
                interaction,
                PermissionFlagsBits.ManageGuild,
                PermissionFlagsBits.SendMessages,
                'configure appeal links'
            );
            if (!ctx) {
                return;
            }

            const url = cleanInline(interaction.options.getString('url', true));
            await updateModerationSettings(ctx.guild.id, { appealUrl: url });
            await sendNotice(interaction, {
                title: 'Appeal link updated',
                body: `Appeal link set to ${url}.`,
                theme: 'success',
            });
        },
    };
}

function buildTemporaryRoleCommand(): ChatCommand {
    return {
        kind: 'chat',
        cooldown: { uses: 4, seconds: 10 },
        data: new SlashCommandBuilder()
            .setName('temporary-role')
            .setDescription('Add or remove a temporary role.')
            .setDMPermission(false)
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a temporary role.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('Member.').setRequired(true)
                    )
                    .addRoleOption(option =>
                        option.setName('role').setDescription('Role to add.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('duration').setDescription('Duration, like 12h.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason').setDescription('Reason shown in logs.')
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove a temporary role early.')
                    .addUserOption(option =>
                        option.setName('user').setDescription('Member.').setRequired(true)
                    )
                    .addRoleOption(option =>
                        option.setName('role').setDescription('Role to remove.').setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('reason').setDescription('Reason shown in logs.')
                    )
            )
            .toJSON(),
        async execute(interaction: ChatInputCommandInteraction): Promise<void> {
            await executeRoleCommand(interaction, true);
        },
    };
}

async function executeRoleCommand(
    interaction: ChatInputCommandInteraction,
    temporary: boolean
): Promise<void> {
    const ctx = await requireModerationContext(
        interaction,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageRoles,
        temporary ? 'manage temporary roles' : 'manage roles'
    );
    if (!ctx) {
        return;
    }

    const member = await getRequiredMember(interaction, ctx.guild, 'user');
    const role = interaction.options.getRole('role', true);
    if (!member || !(role instanceof Role)) {
        await sendNotice(interaction, {
            title: 'Invalid role',
            body: 'Use a server role that the bot can manage.',
            theme: 'danger',
        });
        return;
    }

    const roleGuard = await guardRole(interaction, ctx, role, 'assign');
    if (!roleGuard) {
        return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const reason = getReason(interaction);
    if (subcommand === 'remove') {
        await member.roles.remove(role, auditReason(interaction, reason));
        if (temporary) {
            await deactivateTemporaryRole({
                guildId: ctx.guild.id,
                userId: member.id,
                roleId: role.id,
            });
        }
        const caseId = await createModerationCase({
            guildId: ctx.guild.id,
            targetUserId: member.id,
            moderatorId: interaction.user.id,
            action: temporary ? 'temporary-role-remove' : 'role-remove',
            reason,
            active: false,
        });
        await afterCase(interaction, {
            ctx,
            caseId,
            action: temporary ? 'Temporary role removed' : 'Role removed',
            target: `${userMention(member.id)} ${roleMention(role.id)}`,
            reason,
        });
        return;
    }

    const duration = temporary ? requireDuration(interaction, 'duration') : undefined;
    if (temporary && !duration) {
        return;
    }

    await member.roles.add(role, auditReason(interaction, reason));
    if (duration) {
        await createTemporaryRole({
            guildId: ctx.guild.id,
            userId: member.id,
            roleId: role.id,
            moderatorId: interaction.user.id,
            reason,
            expiresAt: duration.expiresAt,
        });
    }
    const caseId = await createModerationCase({
        guildId: ctx.guild.id,
        targetUserId: member.id,
        moderatorId: interaction.user.id,
        action: temporary ? 'temporary-role-add' : 'role-add',
        reason,
        durationSeconds: duration?.seconds,
        expiresAt: duration?.expiresAt,
        active: temporary,
    });

    await afterCase(interaction, {
        ctx,
        caseId,
        action: temporary ? 'Temporary role added' : 'Role added',
        target: `${userMention(member.id)} ${roleMention(role.id)}`,
        reason,
        duration,
    });
}

async function requireModerationContext(
    interaction: ChatInputCommandInteraction,
    memberPermission: PermissionResolvable,
    botPermission: PermissionResolvable,
    actionLabel: string
): Promise<ModerationContext | undefined> {
    if (!interaction.guild) {
        await sendNotice(interaction, {
            title: 'Server only',
            body: 'Moderation commands can only be used in a server.',
            theme: 'danger',
        });
        return undefined;
    }

    if (!interaction.memberPermissions?.has(memberPermission)) {
        await sendNotice(interaction, {
            title: 'Missing permission',
            body: `You need permission to ${actionLabel}.`,
            theme: 'danger',
        });
        return undefined;
    }

    await sweepModerationExpirations(interaction.guild);

    const moderator = await interaction.guild.members.fetch(interaction.user.id);
    const bot = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    if (!bot.permissions.has(botPermission)) {
        await sendNotice(interaction, {
            title: 'Bot missing permission',
            body: `The bot needs permission to ${actionLabel}.`,
            theme: 'danger',
        });
        return undefined;
    }

    return { guild: interaction.guild, moderator, bot };
}

async function guardTargetMember(
    interaction: ChatInputCommandInteraction,
    ctx: ModerationContext,
    target: GuildMember,
    action: string
): Promise<boolean> {
    if (target.id === interaction.user.id) {
        await sendNotice(interaction, {
            title: `Cannot ${action} yourself`,
            body: 'Choose another member.',
            theme: 'danger',
        });
        return false;
    }
    if (target.id === ctx.guild.ownerId) {
        await sendNotice(interaction, {
            title: `Cannot ${action} server owner`,
            body: 'Discord does not allow that moderation action on the server owner.',
            theme: 'danger',
        });
        return false;
    }
    if (
        ctx.moderator.id !== ctx.guild.ownerId &&
        ctx.moderator.roles.highest.comparePositionTo(target.roles.highest) <= 0
    ) {
        await sendNotice(interaction, {
            title: 'Role hierarchy blocked',
            body: `Your highest role must be above the target to ${action} them.`,
            theme: 'danger',
        });
        return false;
    }
    return true;
}

async function guardRole(
    interaction: ChatInputCommandInteraction,
    ctx: ModerationContext,
    role: Role,
    action: string
): Promise<boolean> {
    if (role.managed) {
        await sendNotice(interaction, {
            title: 'Managed role',
            body: 'Discord managed roles cannot be changed by the bot.',
            theme: 'danger',
        });
        return false;
    }
    if (ctx.bot.roles.highest.comparePositionTo(role) <= 0) {
        await sendNotice(interaction, {
            title: 'Bot role too low',
            body: `The bot role must be above ${roleMention(role.id)} to ${action} it.`,
            theme: 'danger',
        });
        return false;
    }
    if (
        ctx.moderator.id !== ctx.guild.ownerId &&
        ctx.moderator.roles.highest.comparePositionTo(role) <= 0
    ) {
        await sendNotice(interaction, {
            title: 'Role hierarchy blocked',
            body: `Your highest role must be above ${roleMention(role.id)} to ${action} it.`,
            theme: 'danger',
        });
        return false;
    }
    return true;
}

async function getRequiredMember(
    interaction: ChatInputCommandInteraction,
    guild: Guild,
    optionName: string
): Promise<GuildMember | undefined> {
    const user = interaction.options.getUser(optionName, true);
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
        await sendNotice(interaction, {
            title: 'Member not found',
            body: 'That user is not currently in this server.',
            theme: 'danger',
        });
        return undefined;
    }
    return member;
}

async function shouldDm(interaction: ChatInputCommandInteraction, guild: Guild): Promise<boolean> {
    const explicit = interaction.options.getBoolean('dm');
    if (explicit !== null) {
        return explicit;
    }
    const settings = await getModerationSettings(guild.id);
    return settings.dmPunishments;
}

async function notifyPunishment(
    guild: Guild,
    user: User,
    action: string,
    reason: string,
    duration?: ParsedDuration
): Promise<boolean> {
    const settings = await getModerationSettings(guild.id);
    return await dmPunishment({
        guildName: guild.name,
        user,
        action,
        reason,
        duration: duration?.label,
        appealUrl: settings.appealUrl,
    });
}

async function afterCase(
    interaction: ChatInputCommandInteraction,
    input: {
        ctx: ModerationContext;
        caseId: number;
        action: string;
        target: string;
        reason: string;
        duration?: ParsedDuration;
    }
): Promise<void> {
    const logSent = await sendModLog({
        guild: input.ctx.guild,
        caseId: input.caseId,
        action: input.action,
        target: input.target,
        moderator: userMention(interaction.user.id),
        reason: input.reason,
        duration: input.duration?.label,
    });

    const details = [
        `Case: #${input.caseId}`,
        `Target: ${input.target}`,
        `Reason: ${input.reason}`,
    ];
    if (input.duration) {
        details.push(`Duration: ${input.duration.label}`);
    }
    details.push(`Mod log: ${logSent ? 'Sent' : 'Not configured'}`);

    await sendNotice(interaction, {
        title: `${input.action} recorded`,
        body: details.join('\n'),
        theme: 'success',
    });
}

function getReason(interaction: ChatInputCommandInteraction): string {
    return cleanInline(interaction.options.getString('reason') ?? DEFAULT_REASON);
}

function getDurationOption(interaction: ChatInputCommandInteraction): ParsedDuration | undefined {
    const value = interaction.options.getString('duration');
    return value ? parseDuration(value) : undefined;
}

function requireDuration(
    interaction: ChatInputCommandInteraction,
    optionName: string
): ParsedDuration | undefined {
    const value = interaction.options.getString(optionName, true);
    const duration = parseDuration(value);
    if (!duration) {
        void sendNotice(interaction, {
            title: 'Invalid duration',
            body: 'Use a duration like `30m`, `2h`, `7d`, or `1w 2d`.',
            theme: 'danger',
        });
        return undefined;
    }
    return duration;
}

function auditReason(interaction: ChatInputCommandInteraction, reason: string): string {
    return `${reason} | Moderator: ${interaction.user.tag} (${interaction.user.id})`;
}

function parseUserIds(input: string): string[] {
    return [...new Set(input.split(/[\s,]+/).map(part => part.trim()).filter(isDiscordId))].slice(
        0,
        MASS_ACTION_LIMIT + 1
    );
}

function isDiscordId(value: string): boolean {
    return /^\d{17,20}$/.test(value);
}

function isBulkDeleteChannel(channel: unknown): channel is BulkDeleteChannel {
    return (
        typeof channel === 'object' &&
        channel !== null &&
        'messages' in channel &&
        'bulkDelete' in channel
    );
}

function isLockableChannel(channel: unknown): channel is LockableChannel {
    return (
        typeof channel === 'object' &&
        channel !== null &&
        'permissionOverwrites' in channel &&
        typeof (channel as { permissionOverwrites?: unknown }).permissionOverwrites === 'object'
    );
}

function isSlowmodeChannel(channel: unknown): channel is SlowmodeChannel {
    return (
        typeof channel === 'object' &&
        channel !== null &&
        'setRateLimitPerUser' in channel &&
        typeof (channel as { setRateLimitPerUser?: unknown }).setRateLimitPerUser === 'function'
    );
}

function formatDate(date: Date): string {
    return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function userMention(userId: string): string {
    return `<@${userId}>`;
}

function roleMention(roleId: string): string {
    return `<@&${roleId}>`;
}
