# AGENTS.md

Orientation for AI agents (and humans) working in this repo. Read this first.

## What this is

`vye-bot` — a closed-source, multi-server Discord bot. TypeScript (strict) + ESM,
Node ≥ 20, discord.js Components V2, Postgres (Drizzle), Redis (ioredis). Slash +
context-menu commands only. **No** AI/LLM features, **no** music/voice, **no** web
dashboard. Single process (sharding-ready, not sharded yet).

## The one rule you must not break

**All messages go through the engine.** Never import a discord.js _component_
builder (`ContainerBuilder`, `TextDisplayBuilder`, `ButtonBuilder`,
`ActionRowBuilder`, `SectionBuilder`, `SeparatorBuilder`, `MediaGalleryBuilder`,
`FileBuilder`, `ThumbnailBuilder`, `StringSelectMenuBuilder`, …) anywhere except
`src/core/engine/renderer.ts`. Build a `MessageTemplate` and send it via the
engine instead. (`SlashCommandBuilder` / `ContextMenuCommandBuilder` are command
builders, not component builders — those are fine in command files.)

## Project map

```
src/core/        framework (engine, commands, config, db, cache, events, client, logger, errors)
src/modules/     feature modules — EMPTY; put new features here, one folder each
src/commands/    demo commands (ping, engine-demo, template-demo)
src/start-bot.ts boot; src/register-commands.ts command CLI
docs/            ARCHITECTURE, MESSAGE-ENGINE, COMMANDS, CONVENTIONS, TEMPLATE-ANALYSIS
```

Fuller map: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Custom APIs / utilities — where they are and how to use them

Import from the folder's barrel (`index.ts`), not deep paths.

### Message engine — `src/core/engine/` (import from `core/engine/index.js`)

| API                                               | Purpose                                                                 | One-liner                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `sendTemplate(target, tpl, ctx?, opts?)`          | Reply/follow-up/channel send                                            | `await sendTemplate(interaction, tpl, {}, { ephemeral: true })` |
| `editTemplate(target, tpl, ctx?, opts?)`          | Edit bot reply or a Message                                             | `await editTemplate(interaction, tpl)`                          |
| `updateTemplate(componentIntr, tpl, ctx?, opts?)` | Re-render a button/select's message in place                            | `await updateTemplate(buttonIntr, tpl)`                         |
| `render(tpl, ctx?, opts?)`                        | IR → `{ components, flags }` (validates + builds)                       | `const { components, flags } = render(tpl)`                     |
| `defineTemplate(name, factory)`                   | Register a reusable template                                            | `const t = defineTemplate('welcome', p => ({ blocks: […] }))`   |
| `defineTheme(theme)`                              | Register a theme                                                        | `defineTheme({ name: 'brand', accent: 0xff8800, palette: {} })` |
| `validate(tpl)`                                   | Enforce V2 limits (throws)                                              | `validate(tpl)`                                                 |
| Types                                             | `MessageTemplate`, `Block`, `Interactive`, `Accessory`, `RenderContext` | —                                                               |

Details: [`docs/MESSAGE-ENGINE.md`](docs/MESSAGE-ENGINE.md).

### Command framework — `src/core/commands/` (import from `core/commands/index.js`)

| API                                                                  | Purpose                                              | One-liner                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| `ChatCommand` / `MessageCommand` / `UserCommand`                     | Command shapes                                       | `export const ping: ChatCommand = { kind: 'chat', data, execute }` |
| `ComponentHandler`                                                   | Button/select/modal handler (by custom_id namespace) | `{ namespace: 'demo', async execute(i, id) {} }`                   |
| `customId(ns, action, ...args)` / `parseCustomId(raw)`               | The custom_id convention                             | `customId('demo', 'edit', '42')` → `'demo:edit:42'`                |
| `buildCommandRegistry` / `buildComponentRegistry` / `CooldownStore`  | Registries used at boot                              | `buildCommandRegistry(commands)`                                   |
| `createInteractionRouter(deps)`                                      | The single interaction handler                       | `registerEvents(client, { onInteraction: route })`                 |
| `registerCommands(bodies, scope)` / `clearCommands` / `viewCommands` | REST registration                                    | `registerCommands(commands.map(c => c.data), 'guild')`             |

Details: [`docs/COMMANDS.md`](docs/COMMANDS.md).

### Config — `src/core/config/` (import from `core/config/index.js`)

- `config` — the validated, typed config singleton. **The only reader of
  `process.env`.** `if (config.isDev) …`, `config.discord.token`,
  `config.database.url`.

### Database — `src/core/db/` (import from `core/db/index.js`)

- `connectDatabase()` (boot), `getDb()` (queries), `disconnectDatabase()`.
  `await getDb().select().from(table)`. Add tables under `core/db/schema/`.

### Cache — `src/core/cache/` (import from `core/cache/index.js`)

- `connectCache()` (boot), `getCache()`, `disconnectCache()`.
  `await getCache().set('k', 'v', 'EX', 60)`.

### Logging — `src/core/logger.ts`

- `logger` (root) and `childLogger({ mod })`.
  `logger.error({ err }, 'failed')` — structured fields first, message second.

### Errors — `src/core/errors.ts`

- `AppError`, `ConfigError`, `DatabaseError`, `CacheError`, `toError(unknown)`,
  `installGlobalErrorHandlers()`. In commands, just throw — the router reports it.

### Events — `src/core/events/index.js`

- `registerEvents(client, { onReady, onInteraction })` — wires gateway events.

### Client — `src/core/client.ts`

- `createClient()` — the discord.js client with the `Guilds` intent only.

## Implemented vs. not yet

**Implemented:** config/env validation, logger, error handling, lazy+required
DB/Redis, the full message engine (IR, renderer, themes, templating, validator,
registry, sender), the command framework (slash + context menu, autocomplete,
subcommands, cooldowns, component/modal routing, registration CLI), the event
dispatcher, boot + graceful shutdown, and demo commands (`/ping`, `/engine-demo`,
`/template-demo` + a button/select handler).

**Not built yet (intentionally):** any real feature module (moderation, leveling,
etc.), any Drizzle tables/migrations, sharding, and tests beyond the engine
smoke-level. `src/modules/` is empty by design.

## Do / Don't

**Do**

- Build every message via the engine; extend the IR + renderer + validator + docs
  together when you need a new block.
- Read config from `core/config`; read secrets from env only.
- Add feature code under `src/modules/<feature>/`; re-export Drizzle tables from
  `core/db/schema/index.ts`.
- Keep `.env.example` and these docs in sync with the code.
- Run `npm run typecheck && npm run lint && npm run format` before finishing.

**Don't**

- Import discord.js component builders outside the renderer.
- Read `process.env` directly or commit `.env`.
- Add AI/LLM, voice/music, or a web dashboard.
- Rely on message-content or reaction intents (we don't request them).
- Hand-manage numeric component ids (the renderer does it).
