# `src/modules/` — feature modules

This directory contains feature modules. The first implemented module is
`moderation/`.

Each **feature** of the bot (moderation, leveling, welcome messages, etc.) will
live in its own subfolder here, e.g. `src/modules/leveling/`. A module typically
owns:

- its **commands** (built on `src/core/commands`),
- its **component handlers** (buttons/selects/modals, routed by `custom_id`),
- its **message templates** (registered via the engine's `defineTemplate`),
- its **Drizzle schema** (re-exported from `src/core/db/schema/index.ts`),
- and any **services** specific to the feature.

## Hard rules for modules

1. **All messages go through the engine.** Never import a discord.js component
   builder (`ContainerBuilder`, `TextDisplayBuilder`, …) in a module. Build a
   `MessageTemplate` / `Block[]` and render it via `src/core/engine`.
2. **No `process.env`.** Read configuration from `src/core/config`.
3. **DB and Redis are available.** They are required infrastructure connected at
   boot — use `getDb()` / `getCache()` directly.

See [`docs/ARCHITECTURE.md`](../../docs/ARCHITECTURE.md) and
[`AGENTS.md`](../../AGENTS.md) for the full picture.
