/**
 * Discord **Components V2** limits, enforced by the engine's validator so we
 * raise a clear local error instead of letting the Discord API reject a message.
 *
 * Sourced from the Discord developer documentation (Components reference). If
 * Discord changes these, update them here — the validator reads only this table.
 *
 * @see https://docs.discord.com/developers/components/reference
 */
export const V2Limits = {
    /** Max components in a message, counting every nested component. */
    TOTAL_COMPONENTS: 40,
    /** Max components in the message's top-level array. */
    TOP_LEVEL_COMPONENTS: 10,
    /** Max combined characters across all Text Display components. */
    TOTAL_TEXT_CHARS: 4000,
    /** Max child components inside a single Container. */
    CONTAINER_CHILDREN: 10,
    /** A Section must have between 1 and 3 text lines. */
    SECTION_TEXTS_MIN: 1,
    SECTION_TEXTS_MAX: 3,
    /** A Media Gallery must have between 1 and 10 items. */
    MEDIA_ITEMS_MIN: 1,
    MEDIA_ITEMS_MAX: 10,
    /** Max buttons in a single Action Row. */
    ACTION_ROW_BUTTONS_MAX: 5,
    /** Max options in a string select menu. */
    SELECT_OPTIONS_MAX: 25,
    /** Max length of a button label. */
    BUTTON_LABEL_MAX: 80,
    /** Max length of a component `custom_id`. */
    CUSTOM_ID_MAX: 100,
    /** Max length of a select menu placeholder. */
    SELECT_PLACEHOLDER_MAX: 150,
    /** Max length of a thumbnail / media item description (alt text). */
    DESCRIPTION_MAX: 1024,
} as const;

/** The numeric value of the `IsComponentsV2` message flag (`1 << 15`). */
export const IS_COMPONENTS_V2_FLAG = 1 << 15;
