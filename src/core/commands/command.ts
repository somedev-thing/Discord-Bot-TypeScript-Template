import type { ParsedCustomId } from './custom-id.js';
import type {
    ApplicationCommandOptionChoiceData,
    AutocompleteFocusedOption,
    AutocompleteInteraction,
    ChatInputCommandInteraction,
    MessageComponentInteraction,
    MessageContextMenuCommandInteraction,
    ModalSubmitInteraction,
    RESTPostAPIApplicationCommandsJSONBody,
    UserContextMenuCommandInteraction,
} from 'discord.js';

/**
 * Per-user cooldown for a command. The user may invoke the command `uses` times
 * per `seconds` window; further attempts get a friendly "slow down" reply.
 */
export interface CooldownConfig {
    uses: number;
    seconds: number;
}

/** Fields shared by every command kind. */
interface CommandBase {
    /**
     * The command registration payload (name, description, options, type). Build
     * this with discord.js `SlashCommandBuilder` / `ContextMenuCommandBuilder`
     * (those are command builders, not message component builders, so they are
     * allowed outside the engine) or as a plain REST JSON object.
     */
    data: RESTPostAPIApplicationCommandsJSONBody;
    /** Optional per-user cooldown. */
    cooldown?: CooldownConfig;
}

/** A slash (chat input) command, optionally with autocomplete and subcommands. */
export interface ChatCommand extends CommandBase {
    kind: 'chat';
    /**
     * Runs the command. For commands that use subcommands, either branch here on
     * `interaction.options.getSubcommand()` or provide {@link ChatCommand.subcommands}
     * and let the router dispatch for you (it falls back to `execute`).
     */
    execute(interaction: ChatInputCommandInteraction): Promise<void>;
    /** Optional per-subcommand handlers, keyed by subcommand name. */
    subcommands?: Record<string, (interaction: ChatInputCommandInteraction) => Promise<void>>;
    autocomplete?(
        interaction: AutocompleteInteraction,
        focused: AutocompleteFocusedOption
    ): Promise<ApplicationCommandOptionChoiceData[]>;
}

/** A right-click context-menu command on a message. */
export interface MessageCommand extends CommandBase {
    kind: 'message';
    execute(interaction: MessageContextMenuCommandInteraction): Promise<void>;
}

/** A right-click context-menu command on a user. */
export interface UserCommand extends CommandBase {
    kind: 'user';
    execute(interaction: UserContextMenuCommandInteraction): Promise<void>;
}

/** Any registerable command. */
export type Command = ChatCommand | MessageCommand | UserCommand;

/**
 * Handles component (button/select) and modal interactions whose `custom_id`
 * begins with {@link ComponentHandler.namespace}. Registered alongside commands;
 * the router dispatches by namespace (see the `custom_id` convention).
 */
export interface ComponentHandler {
    /** The `custom_id` namespace this handler owns (the part before the first `:`). */
    namespace: string;
    execute(
        interaction: MessageComponentInteraction | ModalSubmitInteraction,
        id: ParsedCustomId
    ): Promise<void>;
}
